package com.classai.mobile

import android.content.Intent
import android.content.res.ColorStateList
import android.nfc.NfcAdapter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.LayoutInflater
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.classai.mobile.databinding.ActivityMainBinding
import com.classai.mobile.databinding.ItemClassBinding
import com.classai.mobile.databinding.ItemMetricBinding
import com.classai.mobile.databinding.ScreenAuthBinding
import com.classai.mobile.databinding.ScreenClassBinding
import com.classai.mobile.databinding.ScreenHomeBinding
import com.google.android.material.snackbar.Snackbar
import java.util.concurrent.Executors

/** Una sola Activity con tres pantallas: acceso, clases abiertas y detalle de clase. */
class MainActivity : AppCompatActivity() {
    private enum class Screen { AUTH, HOME, CLASS }

    private val io = Executors.newFixedThreadPool(2)
    private val ui = Handler(Looper.getMainLooper())
    private lateinit var session: SessionStore
    private lateinit var tokens: TokenStore
    private lateinit var api: StudentApi
    private lateinit var main: ActivityMainBinding
    private lateinit var auth: ScreenAuthBinding
    private lateinit var home: ScreenHomeBinding
    private lateinit var cls: ScreenClassBinding

    private var screen = Screen.AUTH
    private var registerMode = true
    private var busy = false          // envío de login/registro en curso
    private var loading = false       // lectura de clases/clase en curso
    private var resumed = false
    private var classId: String? = null
    private var current: ClassInfo? = null
    private var wasAttended: Boolean? = null  // null = aún no sé; evita confeti al abrir una clase ya marcada
    private var syncingVotes = false

    private val refreshTick = Runnable { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(this)
        tokens = TokenStore(this)
        api = StudentApi(BuildConfig.CLASSAI_API_URL) { session.token }
        main = ActivityMainBinding.inflate(layoutInflater)
        setContentView(main.root)
        ViewCompat.setOnApplyWindowInsetsListener(main.host) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        val inflater = LayoutInflater.from(this)
        auth = ScreenAuthBinding.inflate(inflater, main.host, false)
        home = ScreenHomeBinding.inflate(inflater, main.host, false)
        cls = ScreenClassBinding.inflate(inflater, main.host, false)
        listOf(auth.root, home.root, cls.root).forEach { main.host.addView(it) }
        setupAuth(); setupHome(); setupClass()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (screen == Screen.CLASS) showHome() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })
        if (session.loggedIn) showHome() else showAuth()
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        CredentialEvents.listener = { if (screen == Screen.CLASS) ui.postDelayed({ refresh() }, 700) }
        if (screen != Screen.AUTH) { renderNfc(); refresh() }
    }

    override fun onPause() {
        resumed = false
        CredentialEvents.listener = null
        ui.removeCallbacks(refreshTick)
        super.onPause()
    }

    override fun onDestroy() {
        ui.removeCallbacksAndMessages(null)
        io.shutdownNow()
        super.onDestroy()
    }

    private fun dp(v: Float) = v * resources.displayMetrics.density

    // ------------------------------------------------------------ navegación

    private fun show(s: Screen) {
        screen = s
        auth.root.visibility = if (s == Screen.AUTH) View.VISIBLE else View.GONE
        home.root.visibility = if (s == Screen.HOME) View.VISIBLE else View.GONE
        cls.root.visibility = if (s == Screen.CLASS) View.VISIBLE else View.GONE
        ui.removeCallbacks(refreshTick)
    }

    private fun showAuth(message: String? = null) {
        show(Screen.AUTH)
        busy = false
        applyMode()
        setAuthError(message)
        animateAuthIn()
    }

    private fun showHome() {
        show(Screen.HOME)
        classId = null; current = null
        home.cardName.text = session.name.orEmpty()
        home.cardCode.text = session.code.orEmpty()
        home.avatar.initials = initials(session.name.orEmpty())
        home.idCard.alpha = 0f
        home.idCard.animate().alpha(1f).setDuration(320).withEndAction { home.idCard.sweepOnce() }.start()
        renderNfc()
        refresh()
    }

    private fun showClass(c: ClassInfo) {
        show(Screen.CLASS)
        classId = c.id; current = null; wasAttended = null
        cls.toolbar.title = c.course.ifBlank { "Clase" }
        cls.meta.text = classMeta(c)
        cls.message.visibility = View.GONE
        cls.tapPanel.visibility = View.GONE
        cls.livePanel.visibility = View.GONE
        renderNfc()
        refresh()
    }

    private fun logout(message: String? = null) {
        val token = session.token
        session.clear()
        if (token != null) io.execute { StudentApi(BuildConfig.CLASSAI_API_URL) { token }.logout() }
        registerMode = false
        auth.password.text = null
        showAuth(message)
    }

    private fun onFailure(f: Failure, message: android.widget.TextView, soft: Boolean = false) {
        if (f is Failure.SessionExpired) { logout(f.message); return }
        message.text = f.message
        if (!soft) message.visibility = View.VISIBLE
    }

    // ------------------------------------------------------------ acceso

    private fun setupAuth() = with(auth) {
        submit.setOnClickListener { submitAuth() }
        toggle.setOnClickListener { registerMode = !registerMode; applyMode(); setAuthError(null) }
        password.setOnEditorActionListener { _, id, _ ->
            if (id == EditorInfo.IME_ACTION_DONE) { submitAuth(); true } else false
        }
        // Un cambio en un campo borra su error, no el resto
        code.setOnFocusChangeListener { _, _ -> codeLayout.error = null }
        applyMode()
    }

    private fun applyMode() = with(auth) {
        formTitle.setText(if (registerMode) R.string.title_register else R.string.title_login)
        nameLayout.visibility = if (registerMode) View.VISIBLE else View.GONE
        password.imeOptions = EditorInfo.IME_ACTION_DONE
        code.imeOptions = if (registerMode) EditorInfo.IME_ACTION_NEXT else EditorInfo.IME_ACTION_NEXT
        submit.setText(if (registerMode) R.string.action_register else R.string.action_login)
        toggle.setText(if (registerMode) R.string.toggle_to_login else R.string.toggle_to_register)
        passLayout.helperText = if (registerMode) "Mínimo 6 caracteres" else null
        submit.isEnabled = !busy
        toggle.isEnabled = !busy
    }

    private fun setAuthError(message: String?) = with(auth.error) {
        text = message
        visibility = if (message.isNullOrEmpty()) View.GONE else View.VISIBLE
    }

    private fun submitAuth() = with(auth) {
        if (busy) return
        val c = code.text.toString().trim()
        val n = name.text.toString().trim()
        val p = password.text.toString()
        codeLayout.error = validateCode(c)
        nameLayout.error = if (registerMode) validateName(n) else null
        passLayout.error = if (registerMode) validatePassword(p) else if (p.isEmpty()) "Escribe tu contraseña" else null
        if (codeLayout.error != null || nameLayout.error != null || passLayout.error != null) return
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(root.windowToken, 0)
        busy = true
        setAuthError(null)
        submit.text = "Un momento…"
        applyMode()
        val nfc = tokens.getOrCreate().toHex()
        val register = registerMode
        io.execute {
            val r = if (register) api.register(c, n, p, nfc) else api.login(c, p, nfc)
            ui.post {
                busy = false
                when (r) {
                    is Result.Ok -> {
                        session.save(r.value.token, r.value.student.code, r.value.student.fullName)
                        password.text = null
                        showHome()
                    }
                    is Result.Err -> {
                        if (r.failure is Failure.AccountExists) registerMode = false
                        applyMode()
                        setAuthError(r.failure.message)
                    }
                }
            }
        }
    }

    private fun animateAuthIn() = with(auth) {
        listOf<View>(logo, title, subtitle, form, privacy).forEachIndexed { i, v ->
            v.alpha = 0f; v.translationY = dp(18f)
            v.animate().alpha(1f).translationY(0f).setStartDelay(60L + i * 60L).setDuration(300).start()
        }
    }

    // ------------------------------------------------------------ NFC / HCE

    private fun renderNfc() {
        val adapter = NfcAdapter.getDefaultAdapter(this)
        val hce = packageManager.hasSystemFeature("android.hardware.nfc.hce")
        val status = cardStatus(adapter != null, hce, adapter?.isEnabled == true)
        val ready = status == CardStatus.ACTIVE
        home.chipText.text = status.label
        home.chip.backgroundTintList = ColorStateList.valueOf(getColor(if (ready) R.color.ds_state_ok_solid else R.color.ds_state_alert_solid))
        home.chipIcon.setImageResource(if (ready) R.drawable.ic_check_circle else R.drawable.ic_warning)
        home.waves.active = ready
        home.hint.text = status.hint
        val canFix = status == CardStatus.NFC_OFF
        home.nfcSettings.visibility = if (canFix) View.VISIBLE else View.GONE
        cls.nfcSettings.visibility = if (canFix) View.VISIBLE else View.GONE
        cls.tapBody.text = if (ready) getString(R.string.tap_body) else status.hint
    }

    private fun openNfcSettings() {
        try { startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) }
        catch (e: Exception) { startActivity(Intent(Settings.ACTION_SETTINGS)) }
    }

    // ------------------------------------------------------------ clases

    private fun setupHome() = with(home) {
        toolbar.setOnMenuItemClickListener { logout(); true }
        refresh.setColorSchemeColors(getColor(R.color.ds_brand_air_from), getColor(R.color.ds_brand_air_to))
        refresh.setOnRefreshListener { refresh() }
        nfcSettings.setOnClickListener { openNfcSettings() }
    }

    private fun refresh() {
        if (!resumed || loading || screen == Screen.AUTH) return
        ui.removeCallbacks(refreshTick)
        loading = true
        val forClass = if (screen == Screen.CLASS) classId else null
        io.execute {
            val r: Result<*> = if (forClass != null) api.classInfo(forClass) else api.classes()
            ui.post {
                loading = false
                home.refresh.isRefreshing = false
                cls.refresh.isRefreshing = false
                // Si el alumno cambió de pantalla mientras tanto, se descarta
                if (screen != Screen.AUTH && forClass == (if (screen == Screen.CLASS) classId else null)) {
                    when (r) {
                        is Result.Ok -> if (forClass != null) renderClass(r.value as ClassInfo) else renderClasses(@Suppress("UNCHECKED_CAST") (r.value as List<ClassInfo>))
                        is Result.Err -> onFailure(r.failure, if (forClass != null) cls.message else home.message)
                    }
                }
                if (resumed && screen != Screen.AUTH) {
                    val fast = screen == Screen.CLASS && current?.attended == false
                    ui.postDelayed(refreshTick, if (fast) 2500L else 5000L)
                }
            }
        }
    }

    private fun classMeta(c: ClassInfo): String =
        listOfNotNull("Aula ${c.room.uppercase()}", timeLabel(c.startedAt)?.let { "desde $it" }).joinToString(" · ")

    private fun renderClasses(list: List<ClassInfo>) = with(home) {
        message.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
        message.setText(R.string.classes_empty)
        classes.removeAllViews()
        list.forEach { c ->
            val row = ItemClassBinding.inflate(layoutInflater, classes, false)
            row.course.text = c.course.ifBlank { "Clase" }
            row.meta.text = classMeta(c)
            val ok = c.attended
            row.status.text = if (ok) "Asistencia marcada" else "Acerca tu celular al lector"
            row.status.backgroundTintList = ColorStateList.valueOf(getColor(if (ok) R.color.ds_state_ok_subtle else R.color.ds_state_regular_subtle))
            row.status.setTextColor(getColor(if (ok) R.color.ds_state_ok_text else R.color.ds_state_regular_text))
            row.root.setOnClickListener { showClass(c) }
            classes.addView(row.root)
        }
    }

    // ------------------------------------------------------------ detalle de clase

    private fun setupClass() = with(cls) {
        toolbar.setNavigationOnClickListener { showHome() }
        refresh.setColorSchemeColors(getColor(R.color.ds_brand_air_from), getColor(R.color.ds_brand_air_to))
        refresh.setOnRefreshListener { refresh() }
        nfcSettings.setOnClickListener { openNfcSettings() }
        listOf(voteOk, voteHot, voteCold).forEach { it.isSingleLine = false; it.maxLines = 2; it.ellipsize = null }
        votes.addOnButtonCheckedListener { _, id, checked ->
            if (checked && !syncingVotes) sendVote(when (id) { R.id.voteHot -> "hot"; R.id.voteCold -> "cold"; else -> "ok" })
        }
    }

    private fun renderClass(c: ClassInfo) = with(cls) {
        val firstAttend = wasAttended == false && c.attended
        wasAttended = c.attended
        current = c
        message.visibility = View.GONE
        meta.text = classMeta(c) + if (c.ended) " · terminada" else ""
        tapPanel.visibility = if (c.attended) View.GONE else View.VISIBLE
        livePanel.visibility = if (c.attended) View.VISIBLE else View.GONE
        if (!c.attended) return
        attendedText.text = timeLabel(c.attendedAt)?.let { "Asistencia marcada a las $it" } ?: "Asistencia marcada"
        renderMetrics(c.metrics)
        syncVote(c.myVote)
        votes.children().forEach { it.isEnabled = !c.ended }
        if (firstAttend) {
            confetti.burst()
            root.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.LONG_PRESS)
        }
    }

    private fun com.google.android.material.button.MaterialButtonToggleGroup.children() = (0 until childCount).map { getChildAt(it) }

    private fun syncVote(kind: String?) = with(cls) {
        val id = when (kind) { "ok" -> R.id.voteOk; "hot" -> R.id.voteHot; "cold" -> R.id.voteCold; else -> View.NO_ID }
        syncingVotes = true
        if (id == View.NO_ID) votes.clearChecked() else votes.check(id)
        syncingVotes = false
    }

    private fun renderMetrics(m: Metrics?) = with(cls) {
        metrics.removeAllViews()
        metricsEmpty.visibility = if (m == null) View.VISIBLE else View.GONE
        if (m == null) return
        fun tile(label: String, value: String, color: Int = getColor(R.color.ds_text_primary)) {
            val t = ItemMetricBinding.inflate(layoutInflater, metrics, false)
            t.label.text = label; t.value.text = value; t.value.setTextColor(color)
            metrics.addView(t.root)
        }
        tile("Temperatura", fmt1(m.tempC, "°C"))
        tile("Humedad", m.rhPct?.let { "%.0f %%".format(java.util.Locale.US, it) } ?: "—")
        tile("Ruido", noiseLabel(m.noiseRel))
        val level = comfortLevel(m.state)
        tile("Confort", comfortLabel(m.state), getColor(when (level) {
            Level.OK -> R.color.ds_state_ok_text
            Level.REGULAR -> R.color.ds_state_regular_text
            Level.ALERT -> R.color.ds_state_alert_text
            Level.NONE -> R.color.ds_text_primary
        }))
    }

    private fun sendVote(kind: String) {
        val c = current ?: return
        val previous = c.myVote
        if (previous == kind) return
        current = c.copy(myVote = kind)
        io.execute {
            val r = api.vote(c.id, kind)
            ui.post {
                if (classId != c.id) return@post
                when (r) {
                    is Result.Ok -> Snackbar.make(cls.root, "Voto guardado", Snackbar.LENGTH_SHORT).show()
                    is Result.Err -> {
                        current = current?.copy(myVote = previous)
                        syncVote(previous)
                        if (r.failure is Failure.SessionExpired) logout(r.failure.message)
                        else Snackbar.make(cls.root, r.failure.message, Snackbar.LENGTH_LONG).show()
                    }
                }
            }
        }
    }
}
