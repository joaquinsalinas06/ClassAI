package com.classai.mobile

import android.animation.ArgbEvaluator
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.drawable.AnimatedVectorDrawable
import android.graphics.drawable.GradientDrawable
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.nfc.NfcAdapter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.transition.AutoTransition
import android.transition.TransitionManager
import android.view.GestureDetector
import android.view.HapticFeedbackConstants
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.view.animation.LinearInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.res.ResourcesCompat
import androidx.core.graphics.ColorUtils
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams
import androidx.core.widget.doAfterTextChanged
import com.classai.mobile.databinding.ActivityMainBinding
import com.classai.mobile.databinding.ItemClassBinding
import com.classai.mobile.databinding.ItemReadBinding
import com.classai.mobile.databinding.ItemTileBinding
import com.classai.mobile.databinding.ScreenAuthBinding
import com.classai.mobile.databinding.ScreenClassBinding
import com.classai.mobile.databinding.ScreenHomeBinding
import com.classai.mobile.databinding.ScreenVoteBinding
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.CircularProgressIndicatorSpec
import com.google.android.material.progressindicator.IndeterminateDrawable
import com.google.android.material.snackbar.Snackbar
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.abs

/** Una Activity: acceso y tres pestañas (inicio con el carnet, el aula en vivo y el voto). */
class MainActivity : AppCompatActivity(), SensorEventListener {
    private enum class Screen { AUTH, HOME, ROOM, VOTE }

    private val io = Executors.newFixedThreadPool(2)
    private val ui = Handler(Looper.getMainLooper())
    private val es = Locale.forLanguageTag("es")
    private lateinit var session: SessionStore
    private lateinit var tokens: TokenStore
    private lateinit var api: StudentApi
    private lateinit var main: ActivityMainBinding
    private lateinit var auth: ScreenAuthBinding
    private lateinit var home: ScreenHomeBinding
    private lateinit var cls: ScreenClassBinding
    private lateinit var vote: ScreenVoteBinding

    private var screen = Screen.AUTH
    private var registerMode = true
    private var busy = false
    private var loading = false
    private var resumed = false
    private var demoNfc = false  // solo debug: el emulador no tiene NFC
    private var classes: List<ClassInfo>? = null
    private var history: List<HistoryItem> = emptyList()
    private var classId: String? = null
    private var current: ClassInfo? = null
    private val attendedSeen = mutableMapOf<String, Boolean>()  // sin entrada = aún no sé (no celebrar al abrir)
    private val renderedRows = mutableSetOf<String>()
    private var status: CardStatus? = null
    private var choice = Mood.OK
    private var sending = false
    private var fanSpin: ObjectAnimator? = null
    private var moodAnim: ValueAnimator? = null
    private var moodColors = intArrayOf(0, 0)
    private var sensors: SensorManager? = null
    private var gx0 = Float.NaN
    private var gy0 = 0f

    private val refreshTick = Runnable { refresh() }
    private val debuggable get() = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(this)
        tokens = TokenStore(this)
        api = StudentApi(BuildConfig.CLASSAI_API_URL) { session.token }
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= 29) { window.isStatusBarContrastEnforced = false; window.isNavigationBarContrastEnforced = false }
        main = ActivityMainBinding.inflate(layoutInflater)
        setContentView(main.root)
        val night = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, main.root).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }
        val navMargin = resources.getDimensionPixelSize(R.dimen.ds_space_4)
        ViewCompat.setOnApplyWindowInsetsListener(main.root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            main.host.setPadding(bars.left, bars.top, bars.right, maxOf(ime.bottom - bars.bottom, 0))
            listOf(home.scroll, cls.scroll, vote.scroll, auth.scroll).forEach {
                it.setPadding(0, 0, 0, if (it === auth.scroll) maxOf(bars.bottom, ime.bottom) else bars.bottom)
            }
            main.nav.updateLayoutParams<ViewGroup.MarginLayoutParams> { bottomMargin = bars.bottom + navMargin }
            insets
        }
        val inflater = LayoutInflater.from(this)
        auth = ScreenAuthBinding.inflate(inflater, main.host, false)
        home = ScreenHomeBinding.inflate(inflater, main.host, false)
        cls = ScreenClassBinding.inflate(inflater, main.host, false)
        vote = ScreenVoteBinding.inflate(inflater, main.host, false)
        listOf(auth.root, home.root, cls.root, vote.root).forEach { it.visibility = View.GONE; main.host.addView(it) }
        setupAuth(); setupHome(); setupRoom(); setupVote(); setupNav()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (screen == Screen.ROOM || screen == Screen.VOTE) go(Screen.HOME)
                else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })
        if (session.loggedIn) go(Screen.HOME, entering = true) else showAuth()
        handleDebugIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDebugIntent(intent)
    }

    // Solo debug: adb shell am start -n com.classai.mobile/.MainActivity --ez demo_nfc true
    private fun handleDebugIntent(intent: Intent?) {
        if (!debuggable || intent == null) return
        if (intent.hasExtra("demo_nfc")) demoNfc = intent.getBooleanExtra("demo_nfc", false)
        intent.getStringExtra("tab")?.let { t -> if (session.loggedIn) go(Screen.valueOf(t)) }
        if (screen != Screen.AUTH) renderNfc()
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        CredentialEvents.listener = { ui.postDelayed({ refresh() }, 700) }
        if (screen != Screen.AUTH) { renderNfc(); refresh(); startTilt() }
    }

    override fun onPause() {
        resumed = false
        CredentialEvents.listener = null
        ui.removeCallbacks(refreshTick)
        stopTilt()
        super.onPause()
    }

    override fun onDestroy() {
        ui.removeCallbacksAndMessages(null)
        io.shutdownNow()
        super.onDestroy()
    }

    private fun dp(v: Float) = v * resources.displayMetrics.density
    private fun ms(id: Int) = resources.getInteger(id).toLong()
    private fun haptic(v: View, kind: Int) = v.performHapticFeedback(kind)
    private val confirm get() = if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.LONG_PRESS
    private val reject get() = if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS

    // ------------------------------------------------------------ navegación

    private fun rootOf(s: Screen): View = when (s) { Screen.AUTH -> auth.root; Screen.HOME -> home.root; Screen.ROOM -> cls.root; Screen.VOTE -> vote.root }

    /** Eje compartido en X: la pestaña nueva entra desde el lado hacia el que vas. */
    private fun go(target: Screen, entering: Boolean = false) {
        val from = screen
        if (from == target && rootOf(target).visibility == View.VISIBLE) { refresh(); return }
        screen = target
        ui.removeCallbacks(refreshTick)
        val outgoing = rootOf(from)
        val incoming = rootOf(target)
        val dir = if (target.ordinal >= from.ordinal) 1f else -1f
        if (from != target && outgoing.visibility == View.VISIBLE) {
            if (motionEnabled) {
                outgoing.animate().alpha(0f).translationX(-dir * dp(24f)).setDuration(ms(R.integer.ds_motion_fast))
                    .setInterpolator(Motion.exit).withEndAction { outgoing.visibility = View.GONE; outgoing.translationX = 0f }.start()
            } else outgoing.visibility = View.GONE
        }
        incoming.visibility = View.VISIBLE
        if (motionEnabled && !entering) {
            incoming.alpha = 0f; incoming.translationX = dir * dp(24f)
            incoming.animate().alpha(1f).translationX(0f).setStartDelay(ms(R.integer.ds_motion_instant))
                .setDuration(ms(R.integer.ds_motion_base) + 60).setInterpolator(Motion.standard).start()
        } else { incoming.alpha = 1f; incoming.translationX = 0f }
        val tabbed = target != Screen.AUTH
        if (tabbed && main.nav.visibility != View.VISIBLE) {
            main.nav.visibility = View.VISIBLE
            if (motionEnabled) { main.nav.translationY = dp(96f); main.nav.animate().translationY(0f).setStartDelay(240)
                .setDuration(ms(R.integer.ds_motion_slow)).setInterpolator(Motion.standard).start() }
        } else if (!tabbed) main.nav.visibility = View.GONE
        renderNav()
        when (target) {
            Screen.HOME -> enterHome(entering)
            Screen.ROOM -> enterRoom()
            Screen.VOTE -> enterVote()
            Screen.AUTH -> Unit
        }
    }

    private fun setupNav() {
        main.navHome.setOnClickListener { go(Screen.HOME) }
        main.navRoom.setOnClickListener { go(Screen.ROOM) }
        main.navVote.setOnClickListener { go(Screen.VOTE) }
        listOf(main.navHome, main.navRoom, main.navVote).forEach { it.pressable() }
    }

    private fun renderNav() {
        if (motionEnabled) TransitionManager.beginDelayedTransition(main.nav, AutoTransition().apply {
            duration = ms(R.integer.ds_motion_base); interpolator = Motion.standard
        })
        listOf(main.navHome to Screen.HOME, main.navRoom to Screen.ROOM, main.navVote to Screen.VOTE).forEach { (item, s) ->
            val active = s == screen
            item.background = if (active) getDrawable(R.drawable.bg_nav_active) else null
            (item.getChildAt(0) as ImageView).imageTintList = ColorStateList.valueOf(getColor(if (active) R.color.ds_brand_on_ink else R.color.ds_text_muted))
            item.getChildAt(1).visibility = if (active) View.VISIBLE else View.GONE
            item.contentDescription = (item.getChildAt(1) as TextView).text
            item.isSelected = active
        }
    }

    private fun showAuth(message: String? = null) {
        go(Screen.AUTH)
        busy = false
        applyMode(animate = false)
        setAuthError(message)
        animateAuthIn()
    }

    private fun logout(message: String? = null) {
        val token = session.token
        session.clear()
        if (token != null) io.execute { StudentApi(BuildConfig.CLASSAI_API_URL) { token }.logout() }
        registerMode = false
        auth.password.text = null
        classes = null; history = emptyList(); classId = null; current = null
        attendedSeen.clear(); renderedRows.clear(); home.classes.removeAllViews()
        stopTilt()
        showAuth(message)
    }

    private fun onFailure(f: Failure, message: TextView) {
        if (f is Failure.SessionExpired) { logout(f.message); return }
        message.text = f.message
        message.visibility = View.VISIBLE
    }

    // ------------------------------------------------------------ acceso

    private fun setupAuth() = with(auth) {
        title.text = serif(getString(R.string.login_title))
        submit.setOnClickListener { submitAuth() }
        submit.pressable()
        segRegister.setOnClickListener { if (!registerMode && !busy) { registerMode = true; applyMode(true); setAuthError(null) } }
        segLogin.setOnClickListener { if (registerMode && !busy) { registerMode = false; applyMode(true); setAuthError(null) } }
        password.setOnEditorActionListener { _, id, _ -> if (id == EditorInfo.IME_ACTION_DONE) { submitAuth(); true } else false }
        code.doAfterTextChanged { codeLayout.error = null }
        name.doAfterTextChanged { nameLayout.error = null }
        password.doAfterTextChanged { passLayout.error = null }
        segment.post { placeThumb(false) }
    }

    private fun placeThumb(animate: Boolean) = with(auth) {
        val w = (segment.width - segment.paddingLeft - segment.paddingRight) / 2
        if (w <= 0) return
        segmentThumb.updateLayoutParams { width = w }
        val x = if (registerMode) 0f else w.toFloat()
        if (animate && motionEnabled) segmentThumb.animate().translationX(x).setDuration(ms(R.integer.ds_motion_base))
            .setInterpolator(Motion.standard).start()
        else segmentThumb.translationX = x
        segRegister.setTextColor(getColor(if (registerMode) R.color.ds_text_primary else R.color.ds_text_muted))
        segLogin.setTextColor(getColor(if (!registerMode) R.color.ds_text_primary else R.color.ds_text_muted))
    }

    private fun applyMode(animate: Boolean) = with(auth) {
        if (animate && motionEnabled) TransitionManager.beginDelayedTransition(form, AutoTransition().apply {
            duration = ms(R.integer.ds_motion_base); interpolator = Motion.standard
        })
        placeThumb(animate)
        formTitle.text = serif(getString(if (registerMode) R.string.form_register else R.string.form_login))
        nameLayout.visibility = if (registerMode) View.VISIBLE else View.GONE
        submit.setText(if (registerMode) R.string.action_register else R.string.action_login)
        submit.icon = null
        passLayout.helperText = if (registerMode) "Mínimo 6 caracteres" else null
        submit.isEnabled = !busy
    }

    private fun setAuthError(message: String?) = with(auth) {
        errorText.text = message
        val show = !message.isNullOrEmpty()
        if (show == (error.visibility == View.VISIBLE)) return
        if (motionEnabled) TransitionManager.beginDelayedTransition(form, AutoTransition().apply { duration = ms(R.integer.ds_motion_base) })
        error.visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun shake(v: View) {
        haptic(v, reject)
        if (!motionEnabled) return
        ObjectAnimator.ofFloat(v, View.TRANSLATION_X, 0f, 18f, -18f, 12f, -12f, 6f, -6f, 0f).setDuration(420).start()
    }

    private fun submitAuth() = with(auth) {
        if (busy) return
        val c = code.text.toString().trim()
        val n = name.text.toString().trim()
        val p = password.text.toString()
        codeLayout.error = validateCode(c)
        nameLayout.error = if (registerMode) validateName(n) else null
        passLayout.error = if (registerMode) validatePassword(p) else if (p.isEmpty()) "Escribe tu contraseña" else null
        if (codeLayout.error != null || nameLayout.error != null || passLayout.error != null) { shake(form); return }
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(root.windowToken, 0)
        busy = true
        setAuthError(null)
        submit.isEnabled = false
        val spec = CircularProgressIndicatorSpec(this@MainActivity, null, 0,
            com.google.android.material.R.style.Widget_Material3_CircularProgressIndicator_ExtraSmall)
        spec.indicatorColors = intArrayOf(getColor(R.color.ds_brand_on_ink))
        submit.icon = IndeterminateDrawable.createCircularDrawable(this@MainActivity, spec)
        submit.text = if (registerMode) "Creando tu cuenta…" else "Entrando…"
        val nfc = tokens.getOrCreate().toHex()
        val register = registerMode
        io.execute {
            val r = if (register) api.register(c, n, p, nfc) else api.login(c, p, nfc)
            ui.post {
                when (r) {
                    is Result.Ok -> {
                        session.save(r.value.token, r.value.student.code, r.value.student.fullName)
                        password.text = null
                        authDone()
                    }
                    is Result.Err -> {
                        busy = false
                        if (r.failure is Failure.AccountExists) registerMode = false
                        applyMode(true)
                        setAuthError(r.failure.message)
                        shake(form)
                    }
                }
            }
        }
    }

    // Botón → check verde y luego entra al carnet.
    private fun authDone() = with(auth.submit) {
        val ok = getColor(R.color.ds_state_ok_solid)
        backgroundTintList = ColorStateList.valueOf(ok)
        setTextColor(getColor(R.color.app_on_mood))
        text = "¡Listo!"
        val avd = getDrawable(R.drawable.avd_check)!!.mutate() as AnimatedVectorDrawable
        avd.setTint(getColor(R.color.app_on_mood))
        icon = avd; iconTint = null; iconSize = dp(24f).toInt()
        avd.start()
        haptic(this, confirm)
        postDelayed({
            busy = false
            backgroundTintList = null; setTextColor(getColor(R.color.ds_brand_on_ink))
            go(Screen.HOME)
        }, if (motionEnabled) 650 else 0)
    }

    private fun animateAuthIn() = with(auth) {
        (logo.drawable as? AnimatedVectorDrawable)?.let { it.reset(); it.start() }
        if (!motionEnabled) return
        logo.alpha = 0f; logo.scaleX = 0.9f; logo.scaleY = 0.9f
        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(ms(R.integer.ds_motion_slow)).setInterpolator(Motion.standard).start()
        listOf<View>(title, subtitle, form, privacy).forEachIndexed { i, v -> v.enter(i + 1, 20f) }
    }

    // ------------------------------------------------------------ NFC / carnet

    private fun renderNfc() {
        val adapter = NfcAdapter.getDefaultAdapter(this)
        val hce = packageManager.hasSystemFeature("android.hardware.nfc.hce")
        val s = cardStatus(adapter != null || demoNfc, hce || demoNfc, adapter?.isEnabled == true || demoNfc)
        val fg = getColor(when (s) {
            CardStatus.ACTIVE -> R.color.app_card_chip_ok
            CardStatus.NFC_OFF -> R.color.app_card_chip_warn
            else -> R.color.app_card_chip_off
        })
        with(home) {
            chipText.text = s.label
            chipText.setTextColor(fg)
            chipIcon.setImageResource(when (s) { CardStatus.ACTIVE -> R.drawable.ic_check_circle; CardStatus.NFC_OFF -> R.drawable.ic_warning; else -> R.drawable.ic_contactless })
            chipIcon.imageTintList = ColorStateList.valueOf(fg)
            waves.active = s == CardStatus.ACTIVE
            hint.text = s.hint
            hint.setCompoundDrawablesRelativeWithIntrinsicBounds(if (s == CardStatus.ACTIVE) R.drawable.ic_contactless else 0, 0, 0, 0)
            hint.setTextColor(getColor(if (s == CardStatus.ACTIVE) R.color.ds_text_primary else R.color.ds_text_secondary))
            hint.textSize = if (s == CardStatus.ACTIVE) 16f else 14f
            nfcSettings.visibility = if (s == CardStatus.NFC_OFF) View.VISIBLE else View.GONE
            idCard.contentDescription = "Carnet de ${session.name.orEmpty()}, código ${session.code.orEmpty()}. Estado: ${s.label}"
            if (status != null && status != s && motionEnabled) {
                chip.scaleX = 0.9f; chip.scaleY = 0.9f
                chip.animate().scaleX(1f).scaleY(1f).setDuration(ms(R.integer.ds_motion_base)).setInterpolator(Motion.standard).start()
            }
        }
        cls.nfcSettings.visibility = if (s == CardStatus.NFC_OFF) View.VISIBLE else View.GONE
        cls.tapBody.text = if (s == CardStatus.ACTIVE) getString(R.string.tap_body) else s.hint
        status = s
    }

    private fun openNfcSettings() {
        try { startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) } catch (e: Exception) { startActivity(Intent(Settings.ACTION_SETTINGS)) }
    }

    // Inclinación: el carnet gira unos grados y el brillo sigue al teléfono.
    private fun startTilt() {
        if (!motionEnabled || sensors != null || screen != Screen.HOME) return
        val sm = getSystemService(SensorManager::class.java) ?: return
        val sensor = sm.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: return
        sensors = sm; gx0 = Float.NaN
        sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
    }

    private fun stopTilt() { sensors?.unregisterListener(this); sensors = null }

    override fun onSensorChanged(e: SensorEvent) {
        if (gx0.isNaN()) { gx0 = e.values[0]; gy0 = e.values[1] }
        val tx = ((e.values[0] - gx0) / 4f).coerceIn(-1f, 1f)
        val ty = ((e.values[1] - gy0) / 4f).coerceIn(-1f, 1f)
        home.idCard.rotationY += (-tx * 6f - home.idCard.rotationY) * 0.15f
        home.idCard.rotationX += (ty * 4f - home.idCard.rotationX) * 0.15f
        home.idCard.holo = tx
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ------------------------------------------------------------ inicio

    private fun setupHome() = with(home) {
        refresh.setColorSchemeColors(getColor(R.color.ds_brand_air_from), getColor(R.color.ds_brand_air_to))
        refresh.setProgressBackgroundColorSchemeColor(getColor(R.color.ds_bg_raised))
        refresh.setOnRefreshListener { refresh() }
        nfcSettings.setOnClickListener { openNfcSettings() }
        logout.setOnClickListener {
            MaterialAlertDialogBuilder(this@MainActivity)
                .setTitle("¿Cerrar sesión?")
                .setMessage("Tu carnet seguirá vinculado a este teléfono cuando vuelvas a entrar.")
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Cerrar sesión") { _, _ -> logout() }
                .show()
        }
        hero.clipToOutline = true
        heroAction.setOnClickListener { go(Screen.ROOM) }
        heroAction.pressable()
        headAvatar.ink = getColor(R.color.ds_text_primary)
    }

    private fun enterHome(entering: Boolean) = with(home) {
        val name = session.name.orEmpty()
        headName.text = serif("*${name.substringBefore(' ').ifBlank { "Hola" }}*")
        greeting.text = when (java.time.LocalTime.now().hour) { in 5..11 -> "Buenos días,"; in 12..18 -> "Buenas tardes,"; else -> "Buenas noches," }
        headAvatar.initials = initials(name)
        cardName.text = name
        cardCode.text = "Código ${session.code.orEmpty()}"
        avatar.initials = initials(name)
        renderNfc()
        if (classes == null) renderHome(emptyList(), skeleton = true)
        if (motionEnabled) {
            header.enter(0)
            idCard.alpha = 0f; idCard.translationY = dp(24f); idCard.scaleX = 0.96f; idCard.scaleY = 0.96f
            idCard.animate().alpha(1f).translationY(0f).scaleX(1f).scaleY(1f).setStartDelay(if (entering) 80 else 120)
                .setDuration(ms(R.integer.ds_motion_slow) + 140).setInterpolator(Motion.standard)
                .withEndAction { idCard.sweepOnce() }.start()
            hint.enter(3); hero.enter(4)
        }
        startTilt()
        refresh()
    }

    private fun renderHome(list: List<ClassInfo>, skeleton: Boolean = false) = with(home) {
        val first = list.firstOrNull()
        // Héroe: el aula ahora con Kirby según cómo está la temperatura.
        val mood = roomMood(first?.metrics, first?.targets)
        heroKirby.show(if (first == null) Mood.OK else mood)
        tintHero(getColor(when (if (first == null) Mood.OK else mood) {
            Mood.OK -> R.color.app_kirby_ok_edge; Mood.HOT -> R.color.app_kirby_hot_edge; Mood.COLD -> R.color.app_kirby_cold_edge
        }))
        if (first == null) {
            heroKicker.text = if (skeleton) "Cargando…" else "Sin clases ahora"
            heroTitle.text = serif("Tómate un *respiro*")
            heroBody.text = getString(R.string.classes_empty)
            heroAction.visibility = View.GONE
        } else {
            val m = first.metrics
            heroKicker.text = "●  En vivo · Aula ${first.room.uppercase()}"
            heroTitle.text = serif(when {
                m?.tempC == null -> "Tu clase está *en vivo*"
                mood == Mood.HOT -> "Hace *calor* en el aula"
                mood == Mood.COLD -> "Hace *frío* en el aula"
                else -> "El aula está *a gusto*"
            })
            heroBody.text = first.course.ifBlank { "Clase" } + listOfNotNull(m?.tempC?.let { "%.1f °C".format(es, it) },
                m?.state?.let { comfortLabel(it) }).joinToString(" · ").let { if (it.isEmpty()) "" else "\n$it" }
            heroAction.visibility = View.VISIBLE
        }
        classesCount.text = list.size.toString()
        classesHead.visibility = if (skeleton || list.isNotEmpty()) View.VISIBLE else View.GONE
        message.visibility = View.GONE
        classes.removeAllViews()
        if (skeleton) {
            repeat(2) { classes.addView(ShimmerView(this@MainActivity), LinearLayout.LayoutParams(-1, dp(150f).toInt()).apply { topMargin = dp(12f).toInt() }) }
            return
        }
        var newIndex = 0
        list.forEach { c ->
            val row = ItemClassBinding.inflate(layoutInflater, classes, false)
            row.course.text = c.course.ifBlank { "Clase" }
            row.room.text = "Aula ${c.room.uppercase()}"
            row.since.text = timeLabel(c.startedAt)?.let { "desde $it" } ?: ""
            row.elapsed.text = elapsedLabel(c.startedAt).orEmpty()
            styleStatus(row.status, c)
            val level = comfortLevel(c.metrics?.state)
            row.comfort.text = c.metrics?.let { m -> listOfNotNull(m.tempC?.let { "%.1f °C".format(es, it) }, comfortLabel(m.state).takeIf { m.state != null }).joinToString(" · ") }
                ?.ifBlank { null } ?: "Sin lecturas"
            row.comfortDot.backgroundTintList = ColorStateList.valueOf(getColor(levelColor(level)))
            row.root.setOnClickListener { classId = c.id; current = null; go(Screen.ROOM) }
            row.root.pressable()
            classes.addView(row.root)
            if (renderedRows.add(c.id)) row.root.enter(newIndex++)
        }
        renderedRows.retainAll(list.map { it.id }.toSet()); Unit
    }

    private var heroEdge = 0

    /** El héroe toma el color del borde del video y lo funde hacia Kirby, a la derecha. */
    private fun tintHero(edge: Int): Unit = with(home) {
        if (edge == heroEdge) return
        val from = heroEdge
        heroEdge = edge
        val bg = GradientDrawable().apply { cornerRadius = resources.getDimension(R.dimen.app_radius_hero) }
        val fade = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(0, 0, 0, 0))
        hero.background = bg; heroFade.background = fade
        fun paint(c: Int) {
            bg.setColor(c)
            fade.colors = intArrayOf(c, ColorUtils.setAlphaComponent(c, 235), ColorUtils.setAlphaComponent(c, 0), 0)
        }
        if (from == 0 || !motionEnabled) { paint(edge); return }
        ValueAnimator.ofArgb(from, edge).apply {
            duration = ms(R.integer.ds_motion_slow); interpolator = Motion.standard
            addUpdateListener { paint(it.animatedValue as Int) }
            start()
        }
    }

    private fun styleStatus(chip: TextView, c: ClassInfo) {
        val ok = c.attended
        chip.text = if (ok) "Asistencia ${timeLabel(c.attendedAt)?.let { "· $it" } ?: "marcada"}" else "Falta marcar asistencia"
        chip.backgroundTintList = ColorStateList.valueOf(getColor(if (ok) R.color.ds_state_ok_subtle else R.color.ds_state_regular_subtle))
        val fg = getColor(if (ok) R.color.ds_state_ok_text else R.color.ds_state_regular_text)
        chip.setTextColor(fg)
        chip.setCompoundDrawablesRelativeWithIntrinsicBounds(if (ok) R.drawable.ic_check_circle else R.drawable.ic_contactless, 0, 0, 0)
        chip.compoundDrawableTintList = ColorStateList.valueOf(fg)
        chip.compoundDrawablesRelative[0]?.setBounds(0, 0, dp(14f).toInt(), dp(14f).toInt())
        chip.setCompoundDrawablesRelative(chip.compoundDrawablesRelative[0], null, null, null)
    }

    private fun levelColor(l: Level) = when (l) {
        Level.OK -> R.color.ds_state_ok_solid
        Level.REGULAR -> R.color.ds_state_regular_solid
        Level.ALERT -> R.color.ds_state_alert_solid
        Level.NONE -> R.color.ds_state_offline_solid
    }

    private fun renderHistory() = with(home) {
        reads.removeAllViews()
        history.take(6).forEachIndexed { i, h ->
            val row = ItemReadBinding.inflate(layoutInflater, reads, false)
            row.readCourse.text = h.course.ifBlank { "Clase" }
            row.readMeta.text = listOfNotNull("Aula ${h.room.uppercase()}", dayTimeLabel(h.attendedAt)?.substringBefore(" ·")).joinToString(" · ")
            row.readTime.text = timeLabel(h.attendedAt).orEmpty()
            if (i > 0) reads.addView(View(this@MainActivity).apply { setBackgroundColor(getColor(R.color.ds_border_subtle)) },
                LinearLayout.LayoutParams(-1, 1).apply { marginStart = dp(64f).toInt() })
            reads.addView(row.root)
        }
        reads.visibility = if (history.isEmpty()) View.GONE else View.VISIBLE
        readsEmpty.visibility = if (history.isEmpty()) View.VISIBLE else View.GONE
    }

    // ------------------------------------------------------------ datos

    private fun refresh() {
        if (!resumed || loading || screen == Screen.AUTH) return
        ui.removeCallbacks(refreshTick)
        loading = true
        val onScreen = screen
        val wanted = classId
        io.execute {
            var list: Result<List<ClassInfo>>? = null
            var hist: Result<List<HistoryItem>>? = null
            var detail: Result<ClassInfo>? = null
            if (onScreen == Screen.HOME || wanted == null) list = api.classes()
            if (onScreen == Screen.HOME) hist = api.history()
            val id = wanted ?: (list as? Result.Ok)?.value?.let { l -> l.firstOrNull { !it.attended }?.id ?: l.firstOrNull()?.id }
            if (onScreen != Screen.HOME && id != null) detail = api.classInfo(id)
            ui.post {
                loading = false
                home.refresh.isRefreshing = false
                cls.refresh.isRefreshing = false
                if (screen == onScreen) apply(onScreen, list, hist, detail, id)
                if (resumed && screen != Screen.AUTH) {
                    val fast = screen != Screen.HOME && current?.attended == false
                    ui.postDelayed(refreshTick, if (fast) 2500L else 5000L)
                }
            }
        }
    }

    private fun apply(s: Screen, list: Result<List<ClassInfo>>?, hist: Result<List<HistoryItem>>?, detail: Result<ClassInfo>?, id: String?) {
        (listOf(list, hist, detail).firstOrNull { it is Result.Err && it.failure is Failure.SessionExpired } as? Result.Err)?.let {
            logout(it.failure.message); return
        }
        when (list) {
            is Result.Ok -> { classes = list.value; list.value.forEach(::noteAttendance); if (s == Screen.HOME) renderHome(list.value) }
            is Result.Err -> if (s == Screen.HOME) { if (classes == null) renderHome(emptyList()); onFailure(list.failure, home.message) }
            null -> Unit
        }
        // Un backend sin historial (404) o sin red deja el estado vacío ilustrado.
        if (hist is Result.Ok) history = hist.value
        if (hist != null) renderHistory()
        if (s == Screen.HOME) return
        if (id == null) { renderNoClass(); return }
        when (detail) {
            is Result.Ok -> {
                if (classId == null) classId = id
                noteAttendance(detail.value)
                current = detail.value
                if (s == Screen.ROOM) renderRoom(detail.value) else renderVote(detail.value)
            }
            is Result.Err -> {
                if (s == Screen.ROOM) { cls.loading.visibility = View.GONE; onFailure(detail.failure, cls.message) }
                else Snackbar.make(vote.root, detail.failure.message, Snackbar.LENGTH_LONG).show()
                if (detail.failure.message.contains("no está disponible")) { classId = null; current = null }
            }
            null -> renderNoClass()
        }
    }

    /** Celebra solo el paso de "sin asistencia" a "con asistencia" visto por esta app. */
    private fun noteAttendance(c: ClassInfo) {
        val before = attendedSeen[c.id]
        attendedSeen[c.id] = c.attended
        if (before == false && c.attended) celebrate(c)
    }

    private fun renderNoClass() {
        listOf(cls.noClass to cls.content, vote.noClass to vote.content).forEach { (empty, content) ->
            if (empty.visibility != View.VISIBLE) { empty.visibility = View.VISIBLE; empty.enter() }
            content.visibility = View.GONE
        }
        cls.noClassTitle.text = serif("Sin clases *abiertas*")
        vote.noClassTitle.text = serif("Nada que votar *aún*")
    }

    // ------------------------------------------------------------ aula

    private fun setupRoom() = with(cls) {
        refresh.setColorSchemeColors(getColor(R.color.ds_brand_air_from), getColor(R.color.ds_brand_air_to))
        refresh.setProgressBackgroundColorSchemeColor(getColor(R.color.ds_bg_raised))
        refresh.setOnRefreshListener { refresh() }
        nfcSettings.setOnClickListener { openNfcSettings() }
        voteShortcut.setOnClickListener { go(Screen.VOTE) }
        voteShortcut.pressable()
        waitDot.tint = getColor(R.color.ds_state_regular_solid)
        fun tile(t: ItemTileBinding, icon: Int, color: Int, label: String) {
            t.icon.setImageResource(icon); t.icon.imageTintList = ColorStateList.valueOf(getColor(color))
            t.ring.tint = getColor(color); t.bar.tint = getColor(color); t.bars.tint = getColor(color); t.label.text = label
        }
        tile(tileTemp, R.drawable.ic_thermo, R.color.ds_metric_temp, "Temperatura")
        tile(tileRh, R.drawable.ic_drop, R.color.ds_metric_rh, "Humedad")
        tile(tileNoise, R.drawable.ic_noise, R.color.ds_metric_noise, "Ruido")
        tile(tileLight, R.drawable.ic_light, R.color.ds_metric_lux, "Luz")
        tileNoise.bar.visibility = View.GONE; tileNoise.bars.visibility = View.VISIBLE
        listOf(tileNoise.value, tileLight.value).forEach { it.textSize = 28f }
    }

    private fun enterRoom() = with(cls) {
        metricsTitle.text = serif(getString(R.string.metrics_title))
        message.visibility = View.GONE
        val c = current
        if (c != null && c.id == classId) renderRoom(c, entering = true)
        else {
            noClass.visibility = View.GONE; content.visibility = View.VISIBLE
            head.visibility = View.INVISIBLE; tapPanel.visibility = View.GONE; attended.visibility = View.GONE
            metrics.visibility = View.GONE; metricsEmpty.visibility = View.GONE; voteShortcut.visibility = View.GONE
            loading.visibility = View.VISIBLE
        }
        renderNfc()
        refresh()
    }

    private fun renderRoom(c: ClassInfo, entering: Boolean = false) = with(cls) {
        val firstPaint = loading.visibility == View.VISIBLE || head.visibility != View.VISIBLE || entering
        noClass.visibility = View.GONE; content.visibility = View.VISIBLE; loading.visibility = View.GONE
        message.visibility = View.GONE
        head.visibility = View.VISIBLE
        course.text = serif(c.course.ifBlank { "Clase" }.let { t ->
            val words = t.split(" ")
            if (words.size > 1) words.dropLast(1).joinToString(" ") + " *${words.last()}*" else t
        })
        room.text = "Aula ${c.room.uppercase()}"
        since.text = timeLabel(c.startedAt)?.let { "desde $it" } ?: "—"
        elapsed.text = if (c.ended) "" else elapsedLabel(c.startedAt).orEmpty()
        liveDot.pulsing = !c.ended
        liveDot.tint = getColor(if (c.ended) R.color.ds_state_offline_solid else R.color.ds_state_alert_solid)
        liveText.text = if (c.ended) "Terminada" else getString(R.string.live)
        liveText.setTextColor(getColor(if (c.ended) R.color.ds_state_offline_text else R.color.ds_state_alert_text))
        liveBadge.backgroundTintList = if (c.ended) ColorStateList.valueOf(getColor(R.color.ds_state_offline_subtle)) else null
        present.visibility = if (c.presentCount != null) View.VISIBLE else View.GONE
        present.text = "${c.presentCount ?: 0} presentes"
        tapPanel.visibility = if (c.attended || c.ended) View.GONE else View.VISIBLE
        attended.visibility = if (c.attended) View.VISIBLE else View.GONE
        attendedText.text = if (c.ended) "La clase terminó" else "Ya cuentas como presente"
        attendedTime.text = timeLabel(c.attendedAt).orEmpty()
        (attendedIcon.drawable as? AnimatedVectorDrawable)?.let { it.setTint(getColor(R.color.app_on_mood)); if (firstPaint) { it.reset(); it.start() } }
        renderMetrics(c)
        voteShortcut.visibility = if (c.ended) View.GONE else View.VISIBLE
        voteShortcutTitle.text = serif(if (c.myVote == null) "¿Cómo te *sientes*?" else "Tu voto: *${voteLabel(c.myVote)}*")
        voteShortcutBody.text = if (c.myVote == null) "Cuéntale al aula con un toque" else "Toca para cambiarlo"
        if (firstPaint) listOf<View>(head, tapPanel, attended, metrics, metricsEmpty, voteShortcut)
            .filter { it.visibility == View.VISIBLE }.forEachIndexed { i, v -> v.enter(i) }
    }

    private fun voteLabel(kind: String?) = when (kind) { "hot" -> "calor"; "cold" -> "frío"; "ok" -> "bien"; else -> "—" }

    private fun renderMetrics(c: ClassInfo) = with(cls) {
        val m = c.metrics
        metrics.visibility = if (m != null) View.VISIBLE else View.GONE
        metricsEmpty.visibility = if (m == null && !c.ended) View.VISIBLE else View.GONE
        if (m == null) return
        val t = c.targets ?: Targets(21.0, 24.0, 40.0, 60.0, 0.1)

        // Confort: arco, número que cuenta y tendencia
        val level = comfortLevel(m.state)
        gauge.tint = getColor(levelColor(level))
        gauge.setValue(m.comfort)
        comfortValue.countTo(m.comfort) { "%.0f".format(es, it) }
        comfortState.text = serif(when (level) { Level.OK -> "*Confortable*"; Level.REGULAR -> "*Regular*"; Level.ALERT -> "*Incómodo*"; Level.NONE -> "Sin dato" })
        comfortState.setTextColor(getColor(when (level) { Level.OK -> R.color.ds_state_ok_text; Level.REGULAR -> R.color.ds_state_regular_text; Level.ALERT -> R.color.ds_state_alert_text; Level.NONE -> R.color.ds_text_primary }))
        val comfortSeries = c.trend.mapNotNull { it.comfort }
        trendChip(comfortTrend, trendDelta(comfortSeries), "", higherIsBetter = true, decimals = 0, suffix = " en 5 min")
        trendBox.visibility = if (comfortSeries.size >= 2) View.VISIBLE else View.GONE
        spark.tint = getColor(levelColor(level))
        spark.set(comfortSeries)
        trendCaption.text = "Confort de la clase · últimos ${comfortSeries.size} min"

        // Temperatura: escala ±4 °C alrededor del objetivo
        val lo = t.tempLow - 4; val hi = t.tempHigh + 4
        fun pos(v: Double?, a: Double, b: Double) = v?.let { ((it - a) / (b - a)).toFloat() }
        with(tileTemp) {
            value.countTo(m.tempC) { "%.1f".format(es, it) }; unit.text = "°C"
            bar.set(pos(m.tempC, lo, hi), pos(t.tempLow, lo, hi)!!, pos(t.tempHigh, lo, hi)!!)
            ring.set(pos(m.tempC, lo, hi) ?: 0f)
            caption.text = "Objetivo %s–%s °C".format(fmt0(t.tempLow), fmt0(t.tempHigh))
            trendChip(trend, trendDelta(c.trend.mapNotNull { it.tempC }), " °C", higherIsBetter = null, decimals = 1)
        }
        with(tileRh) {
            value.countTo(m.rhPct) { "%.0f".format(es, it) }; unit.text = "%"
            bar.set(pos(m.rhPct, 0.0, 100.0), (t.rhLow / 100).toFloat(), (t.rhHigh / 100).toFloat())
            ring.set(pos(m.rhPct, 0.0, 100.0) ?: 0f)
            caption.text = "Objetivo %s–%s %%".format(fmt0(t.rhLow), fmt0(t.rhHigh))
        }
        with(tileNoise) {
            val lvl = noiseLevel(m.noiseRel, t.noiseMax)
            value.text = noiseLabel(m.noiseRel, t.noiseMax); unit.text = ""
            bars.set(lvl); ring.set(lvl)
            caption.text = when { m.noiseRel == null -> "Sin dato"; m.noiseRel <= t.noiseMax -> "Dentro de lo ideal"; else -> "Más de lo ideal" }
        }
        with(tileLight) {
            val l = m.lightRel
            value.text = when { l == null -> "—"; l < 0.33 -> "Tenue"; l < 0.66 -> "Media"; else -> "Clara" }; unit.text = ""
            bar.set(l?.toFloat()); ring.set(l?.toFloat() ?: 0f)
            caption.text = "Luz relativa del sensor"
        }

        // Movimiento por zona, presentes y ventilador
        fun zone(dot: PulseDotView, text: TextView, v: Boolean?) {
            dot.tint = getColor(if (v == true) R.color.ds_state_ok_solid else R.color.ds_state_offline_solid)
            dot.pulsing = v == true
            text.text = when (v) { true -> "Movimiento"; false -> "Sin movimiento"; null -> "Sin dato" }
        }
        zone(entranceDot, entranceText, m.entrance ?: m.presence)
        zone(interiorDot, interiorText, m.interior)
        presentValue.text = c.presentCount?.let { if (it == 1) "1 alumno" else "$it alumnos" } ?: "—"
        fanText.text = when (m.fanOn) { true -> "Encendido"; false -> "Apagado"; null -> "Sin dato" }
        fanIcon.imageTintList = ColorStateList.valueOf(getColor(if (m.fanOn == true) R.color.ds_metric_rh else R.color.ds_text_secondary))
        if (m.fanOn == true && motionEnabled) {
            if (fanSpin == null) fanSpin = ObjectAnimator.ofFloat(fanIcon, View.ROTATION, 0f, 360f).apply {
                duration = 1100; repeatCount = ValueAnimator.INFINITE; interpolator = LinearInterpolator(); start()
            }
        } else { fanSpin?.cancel(); fanSpin = null; fanIcon.rotation = 0f }
    }

    private fun fmt0(v: Double) = if (v % 1.0 == 0.0) "%.0f".format(es, v) else "%.1f".format(es, v)

    /** Chip de tendencia (+0,3 °C): verde si mejora, rojo si empeora, neutro si no aplica. */
    private fun trendChip(chip: TextView, delta: Double?, unit: String, higherIsBetter: Boolean?, decimals: Int, suffix: String = "") {
        if (delta == null || abs(delta) < (if (decimals == 0) 0.5 else 0.05)) { chip.visibility = View.GONE; return }
        chip.visibility = View.VISIBLE
        chip.text = (if (decimals == 0) (if (delta >= 0) "+" else "−") + "%.0f".format(es, abs(delta)) + unit else signed1(delta, unit)) + suffix
        val good = higherIsBetter?.let { if (it) delta > 0 else delta < 0 }
        val (bg, fg) = when (good) {
            true -> R.color.ds_state_ok_subtle to R.color.ds_state_ok_text
            false -> R.color.ds_state_alert_subtle to R.color.ds_state_alert_text
            null -> R.color.ds_bg_selected to R.color.ds_text_secondary
        }
        chip.backgroundTintList = ColorStateList.valueOf(getColor(bg))
        chip.setTextColor(getColor(fg))
        chip.setCompoundDrawablesRelativeWithIntrinsicBounds(if (delta >= 0) R.drawable.ic_trend_up else R.drawable.ic_trend_down, 0, 0, 0)
        chip.compoundDrawablesRelative[0]?.setBounds(0, 0, dp(14f).toInt(), dp(14f).toInt())
        chip.setCompoundDrawablesRelative(chip.compoundDrawablesRelative[0], null, null, null)
        chip.compoundDrawableTintList = ColorStateList.valueOf(getColor(fg))
    }

    // ------------------------------------------------------------ éxito de asistencia

    private fun celebrate(c: ClassInfo) = with(main) {
        haptic(root, confirm)
        successTitle.text = serif("¡Asistencia *marcada*!")
        successBody.text = listOfNotNull(c.course.ifBlank { null }, timeLabel(c.attendedAt)?.let { "a las $it" }).joinToString(" · ")
        success.visibility = View.VISIBLE
        val avd = successCheck.drawable as AnimatedVectorDrawable
        avd.setTint(getColor(R.color.app_on_mood))
        avd.reset(); avd.start()
        if (motionEnabled) {
            success.alpha = 0f
            success.animate().alpha(1f).setDuration(ms(R.integer.ds_motion_base)).start()
            successBadge.scaleX = 0.8f; successBadge.scaleY = 0.8f
            successBadge.animate().scaleX(1f).scaleY(1f).setDuration(ms(R.integer.ds_motion_slow) + 120)
                .setInterpolator(android.view.animation.OvershootInterpolator(2f)).start()
            successHalo.scaleX = 0.6f; successHalo.scaleY = 0.6f; successHalo.alpha = 1f
            successHalo.animate().scaleX(1.25f).scaleY(1.25f).alpha(0.5f).setDuration(900).setInterpolator(Motion.standard).start()
            listOf<View>(successTitle, successBody).forEachIndexed { i, v -> v.enter(i + 3, 20f) }
            confetti.post { confetti.burst() }
        }
        success.setOnClickListener { dismissSuccess() }
        root.postDelayed(::dismissSuccess, 2200)
    }

    private fun dismissSuccess() = with(main) {
        if (success.visibility != View.VISIBLE) return
        success.animate().alpha(0f).setDuration(ms(R.integer.ds_motion_base)).withEndAction { success.visibility = View.GONE }.start()
    }

    // ------------------------------------------------------------ voto

    private val moods = listOf(Mood.COLD, Mood.OK, Mood.HOT)

    private fun setupVote() = with(vote) {
        moodCard.clipToOutline = true
        kirby.background = GradientDrawable().apply {
            cornerRadius = resources.getDimension(R.dimen.app_radius_card); setColor(getColor(R.color.app_mood_glass))
        }
        kirby.clipToOutline = true
        optCold.setOnClickListener { select(Mood.COLD, user = true) }
        optOk.setOnClickListener { select(Mood.OK, user = true) }
        optHot.setOnClickListener { select(Mood.HOT, user = true) }
        send.setOnClickListener { sendVote() }
        send.pressable()
        val detector = GestureDetector(this@MainActivity, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, vx: Float, vy: Float): Boolean {
                if (abs(vx) < abs(vy) || abs(vx) < 400) return false
                val i = moods.indexOf(choice) + if (vx < 0) 1 else -1
                if (i in moods.indices) select(moods[i], user = true)
                return true
            }
        })
        kirby.setOnTouchListener { _, e -> detector.onTouchEvent(e) }
        selector.addOnLayoutChangeListener { _, l, _, r, _, _, ol, _, or_ -> if (r - l != or_ - ol) selector.post { placeSelector(false) } }
        val bg = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(getColor(R.color.app_mood_ok_deep), getColor(R.color.app_mood_ok)))
        bg.cornerRadius = resources.getDimension(R.dimen.app_radius_hero)
        moodCard.background = bg
        moodColors = intArrayOf(getColor(R.color.app_mood_ok_deep), getColor(R.color.app_mood_ok))
    }

    private fun enterVote() = with(vote) {
        val c = current
        if (c != null && c.id == classId) renderVote(c, entering = true) else { content.visibility = View.INVISIBLE; noClass.visibility = View.GONE }
        refresh()
    }

    private var voteFor: String? = null

    private fun renderVote(c: ClassInfo, entering: Boolean = false) = with(vote) {
        val firstPaint = entering || content.visibility != View.VISIBLE || voteFor != c.id
        noClass.visibility = View.GONE; content.visibility = View.VISIBLE
        course.text = "${c.course.ifBlank { "Clase" }} · Aula ${c.room.uppercase()}"
        val name = session.name.orEmpty().substringBefore(' ').ifBlank { null }
        question.text = serif((name?.let { "$it, ¿cómo" } ?: "¿Cómo") + " te *sientes* ahora?")
        if (voteFor != c.id) { voteFor = c.id; select(voteMood(c.myVote), user = false) } else if (!sending) renderSend()
        listOf(optCold, optOk, optHot).forEach { it.isEnabled = !c.ended }
        if (firstPaint) { moodCard.enter(0, 24f); footnote.enter(2) }
    }

    private fun placeSelector(animate: Boolean) = with(vote) {
        val w = selector.width / 3
        if (w > 0) {
            if (selectorThumb.layoutParams.width != w) selectorThumb.updateLayoutParams { width = w }
            val x = w * moods.indexOf(choice).toFloat()
            if (animate && motionEnabled) selectorThumb.animate().translationX(x).setDuration(ms(R.integer.ds_motion_base) + 60)
                .setInterpolator(Motion.standard).start() else selectorThumb.translationX = x
        }
        val italic = ResourcesCompat.getFont(this@MainActivity, R.font.instrument_serif_italic)
        val regular = ResourcesCompat.getFont(this@MainActivity, R.font.instrument_serif)
        listOf(optCold, optOk, optHot).forEachIndexed { i, tv ->
            val on = moods[i] == choice
            tv.typeface = if (on) italic else regular
            tv.animate().alpha(if (on) 1f else 0.6f).scaleX(if (on) 1.08f else 1f).scaleY(if (on) 1.08f else 1f)
                .setDuration(if (animate && motionEnabled) ms(R.integer.ds_motion_base) else 0).start()
        }
    }

    private fun select(m: Mood, user: Boolean) = with(vote) {
        if (current?.ended == true && user) return
        val changed = m != choice
        choice = m
        if (user && changed) haptic(selector, HapticFeedbackConstants.CLOCK_TICK)
        placeSelector(user)
        kirby.show(m)
        moodCaption.text = when (m) {
            Mood.COLD -> "Hace frío. Tu docente lo verá al instante en el panel del aula."
            Mood.OK -> "Todo bien: confirmas que el aula está cómoda."
            Mood.HOT -> "Hace calor. Tu docente lo verá al instante en el panel del aula."
        }
        val (deep, base) = when (m) {
            Mood.COLD -> R.color.app_mood_cold_deep to R.color.app_mood_cold
            Mood.OK -> R.color.app_mood_ok_deep to R.color.app_mood_ok
            Mood.HOT -> R.color.app_mood_hot_deep to R.color.app_mood_hot
        }
        tintMood(getColor(deep), getColor(base), animate = user)
        renderSend()
    }

    private fun tintMood(deep: Int, base: Int, animate: Boolean) {
        val bg = vote.moodCard.background as GradientDrawable
        val from = moodColors.copyOf()
        moodColors = intArrayOf(deep, base)
        moodAnim?.cancel()
        if (!animate || !motionEnabled) { bg.colors = moodColors; return }
        val ev = ArgbEvaluator()
        moodAnim = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = ms(R.integer.ds_motion_slow); interpolator = Motion.standard
            addUpdateListener { a -> val f = a.animatedFraction
                bg.colors = intArrayOf(ev.evaluate(f, from[0], deep) as Int, ev.evaluate(f, from[1], base) as Int) }
            start()
        }
    }

    private fun renderSend() = with(vote.send) {
        val c = current
        val saved = c?.myVote == moodKind(choice)
        icon = if (saved) getDrawable(R.drawable.ic_check_circle) else null
        iconTint = ColorStateList.valueOf(getColor(R.color.ds_state_ok_solid))
        text = when {
            c?.ended == true -> "La clase terminó"
            saved -> "Es tu voto actual"
            c?.myVote != null -> "Cambiar mi voto a «${voteLabel(moodKind(choice))}»"
            else -> "Enviar «${voteLabel(moodKind(choice)).replaceFirstChar { it.uppercase() }}»"
        }
        isEnabled = c != null && !c.ended && !saved && !sending
        alpha = if (isEnabled || saved) 1f else 0.7f
    }

    private fun sendVote() {
        val c = current ?: return
        val kind = moodKind(choice)
        if (sending || c.myVote == kind) return
        sending = true
        val b: MaterialButton = vote.send
        b.isEnabled = false
        b.text = "Enviando…"
        io.execute {
            val r = api.vote(c.id, kind)
            ui.post {
                sending = false
                if (classId != c.id) return@post
                when (r) {
                    is Result.Ok -> {
                        current = current?.copy(myVote = kind)
                        haptic(b, confirm)
                        val avd = getDrawable(R.drawable.avd_check)!!.mutate() as AnimatedVectorDrawable
                        avd.setTint(getColor(R.color.ds_state_ok_solid))
                        b.icon = avd; b.iconTint = null; avd.start()
                        b.text = "¡Voto enviado!"
                        if (motionEnabled) {
                            vote.moodCard.animate().scaleX(1.02f).scaleY(1.02f).setDuration(ms(R.integer.ds_motion_fast)).setInterpolator(Motion.standard)
                                .withEndAction { vote.moodCard.animate().scaleX(1f).scaleY(1f).setDuration(ms(R.integer.ds_motion_base)).start() }.start()
                        }
                        b.postDelayed({ if (!sending) renderSend() }, 1400)
                    }
                    is Result.Err -> {
                        renderSend()
                        if (r.failure is Failure.SessionExpired) logout(r.failure.message)
                        else { shake(vote.moodCard); Snackbar.make(vote.root, r.failure.message, Snackbar.LENGTH_LONG).show() }
                    }
                }
            }
        }
    }
}
