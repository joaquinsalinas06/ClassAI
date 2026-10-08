package com.classai.mobile

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.LinearGradient
import android.graphics.Shader
import android.graphics.drawable.AnimatedVectorDrawable
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.nfc.NfcAdapter
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.transition.TransitionManager
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.classai.mobile.databinding.ActivityMainBinding
import com.classai.mobile.databinding.ItemReadBinding
import com.classai.mobile.databinding.SheetServerBinding
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.color.MaterialColors
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.CircularProgressIndicatorSpec
import com.google.android.material.progressindicator.IndeterminateDrawable
import com.google.android.material.snackbar.Snackbar
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity(), SensorEventListener {
    private lateinit var b: ActivityMainBinding
    private lateinit var tokens: TokenStore
    private lateinit var profile: ProfileStore
    private val io = Executors.newSingleThreadExecutor()
    private val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    private var busy = false
    private var status: CardStatus? = null
    private var chipColor = 0
    private var flipping = false
    private var demoNfc = false  // solo debug: el emulador no tiene NFC
    private var sensors: SensorManager? = null
    private var gx0 = Float.NaN
    private var gy0 = 0f
    private var tiltX = 0f
    private var tiltY = 0f
    private var bob: ObjectAnimator? = null
    private val hideSuccess = Runnable { hideSuccessOverlay() }

    private val debuggable get() = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    private fun dp(v: Float) = v * resources.displayMetrics.density
    private fun attr(id: Int) = MaterialColors.getColor(b.root, id)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)
        tokens = TokenStore(this)
        profile = ProfileStore(this)
        tokens.getOrCreate()  // primer arranque: genera el token una sola vez

        val night = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, b.root).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }
        applyInsets()
        setupLogin()
        setupCard()
        handleDebugIntent(intent)

        val first = savedInstanceState == null
        if (profile.hasProfile) showCard(animate = first) else showLogin(animate = first)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDebugIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        EventLog.listener = ::onLogEntry
        if (b.card.root.visibility == View.VISIBLE) {
            renderCard()
            startTilt()
        }
    }

    override fun onPause() {
        EventLog.listener = null
        stopTilt()
        super.onPause()
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }

    // Pantalla de borde a borde: el contenido se aparta de barras y teclado
    private fun applyInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(b.root) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            b.login.scroll.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            b.card.screen.setPadding(bars.left, bars.top, bars.right, 0)
            b.card.cardScroll.setPadding(0, 0, 0, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    // Solo en builds debug: el emulador no tiene NFC ni lector real.
    //   adb shell am start -n com.classai.mobile/.MainActivity --ez demo_nfc true --ez simulate_read true
    private fun handleDebugIntent(intent: Intent?) {
        if (!debuggable || intent == null) return
        if (intent.hasExtra("demo_nfc")) demoNfc = intent.getBooleanExtra("demo_nfc", false)
        if (intent.getBooleanExtra("simulate_read", false)) b.root.postDelayed({ EventLog.credentialRead() }, 800)
        intent.removeExtra("simulate_read")
        if (b.card.root.visibility == View.VISIBLE) renderCard()
    }

    // ---------------------------------------------------------------- login

    private lateinit var linkTint: ColorStateList
    private lateinit var linkText: ColorStateList

    private fun setupLogin(): Unit = with(b.login) {
        linkTint = link.backgroundTintList!!
        linkText = link.textColors
        server.setText(profile.server)
        title.addOnLayoutChangeListener { v, l, _, r, _, _, _, _, _ ->
            title.paint.shader = LinearGradient(0f, 0f, (r - l).toFloat(), 0f,
                intArrayOf(getColor(R.color.title_1), getColor(R.color.title_2), getColor(R.color.title_3)),
                null, Shader.TileMode.CLAMP)
            v.invalidate()
        }
        link.setOnClickListener { submit() }
        server.setOnEditorActionListener { _, id, _ -> (id == EditorInfo.IME_ACTION_DONE).also { if (it) submit() } }
    }

    private fun submit(): Unit = with(b.login) {
        if (busy) return
        val c = code.text.toString().trim()
        val n = name.text.toString().trim().replace(Regex("\\s+"), " ")
        val s = normalizeServer(server.text.toString())
        codeLayout.error = validateCode(c)
        nameLayout.error = validateName(n)
        serverLayout.error = if (s == null) "URL inválida (ej. http://192.168.1.10:8000)" else null
        if (codeLayout.error != null || nameLayout.error != null || s == null) {
            reject(form)
            return
        }
        getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(root.windowToken, 0)
        profile.server = s
        setLinkLoading()
        enroll(c, n, s) { outcome ->
            when (outcome) {
                EnrollOutcome.Linked -> {
                    profile.save(c, n, enrolled = true)
                    linkDone(true) { showCard(animate = true) }
                }
                EnrollOutcome.Pending -> {
                    profile.save(c, n, enrolled = false)
                    linkDone(false) {
                        showCard(animate = true)
                        snack("Sin conexión con el servidor: tu carnet quedó pendiente de vincular")
                    }
                }
                is EnrollOutcome.Rejected -> {
                    resetLinkButton()
                    codeLayout.error = outcome.message
                    reject(form)
                }
            }
        }
    }

    private fun enroll(code: String, name: String, server: String, done: (EnrollOutcome) -> Unit) {
        val json = enrollJson(code, name, tokens.getOrCreate().toHex())
        io.execute {
            val outcome = enrollOutcome(postEnroll(server, json))
            runOnUiThread { if (!isDestroyed) done(outcome) }
        }
    }

    private fun setLinkLoading(): Unit = with(b.login.link) {
        busy = true
        val spec = CircularProgressIndicatorSpec(context, null, 0,
            com.google.android.material.R.style.Widget_Material3_CircularProgressIndicator_ExtraSmall)
        spec.indicatorColors = intArrayOf(currentTextColor)
        icon = IndeterminateDrawable.createCircularDrawable(context, spec)
        text = "Vinculando…"
    }

    // Botón → check animado (vinculado) o reloj (pendiente), y luego sigue
    private fun linkDone(linked: Boolean, next: () -> Unit): Unit = with(b.login.link) {
        val to = getColor(if (linked) R.color.success else R.color.chip_pending)
        val white = ColorStateList.valueOf(0xFFFFFFFF.toInt())
        setTextColor(white)
        iconTint = white
        text = if (linked) "¡Vinculado!" else "Guardado sin conexión"
        if (linked) {
            val avd = (getDrawable(R.drawable.avd_check)!!.mutate() as AnimatedVectorDrawable)
            icon = avd
            iconSize = dp(26f).toInt()
            avd.start()
        } else {
            setIconResource(R.drawable.ic_schedule)
        }
        performHapticFeedback(HapticFeedbackConstants.CONFIRM.takeIf { Build.VERSION.SDK_INT >= 30 }
            ?: HapticFeedbackConstants.LONG_PRESS)
        ValueAnimator.ofArgb(linkTint.defaultColor, to).apply {
            duration = 300
            addUpdateListener { backgroundTintList = ColorStateList.valueOf(it.animatedValue as Int) }
        }.start()
        postDelayed({ next() }, if (motionEnabled) 900 else 300)
    }

    private fun resetLinkButton(): Unit = with(b.login.link) {
        busy = false
        backgroundTintList = linkTint
        setTextColor(linkText)
        iconTint = linkText
        iconSize = dp(24f).toInt()
        setIconResource(R.drawable.ic_link)
        setText(R.string.action_link)
    }

    private fun reject(v: View) {
        v.performHapticFeedback(HapticFeedbackConstants.REJECT.takeIf { Build.VERSION.SDK_INT >= 30 }
            ?: HapticFeedbackConstants.LONG_PRESS)
        if (!motionEnabled) return
        ObjectAnimator.ofFloat(v, View.TRANSLATION_X, 0f, 24f, -24f, 16f, -16f, 8f, -8f, 0f).setDuration(450).start()
    }

    private fun showLogin(animate: Boolean) {
        resetLinkButton()
        b.login.server.setText(profile.server)
        b.login.root.visibility = View.VISIBLE
        b.login.root.alpha = 1f
        b.login.root.translationY = 0f
        if (b.card.root.visibility == View.VISIBLE) {
            stopTilt()
            b.card.root.animate().alpha(0f).setDuration(200).withEndAction {
                b.card.root.visibility = View.GONE
                b.card.root.alpha = 1f
            }.start()
        }
        if (animate && motionEnabled) animateLoginIn()
    }

    private fun animateLoginIn(): Unit = with(b.login) {
        logo.apply {
            scaleX = 0.3f; scaleY = 0.3f; alpha = 0f; rotation = -14f
            animate().scaleX(1f).scaleY(1f).alpha(1f).rotation(0f)
                .setInterpolator(OvershootInterpolator(2.4f)).setDuration(750).start()
        }
        val staggered = listOf<View>(title, subtitle, form) + (0 until fields.childCount).map { fields.getChildAt(it) } + privacy
        staggered.forEachIndexed { i, v ->
            v.alpha = 0f
            v.translationY = dp(36f)
            v.animate().alpha(1f).translationY(0f).setStartDelay(180L + i * 70L).setDuration(480)
                .setInterpolator(DecelerateInterpolator(2f)).start()
        }
    }

    // ---------------------------------------------------------------- carnet

    private fun setupCard(): Unit = with(b.card) {
        toolbar.setOnMenuItemClickListener {
            when (it.itemId) {
                R.id.action_server -> showServerSheet()
                R.id.action_unlink -> confirmUnlink()
            }
            true
        }
        refresh.setColorSchemeColors(attr(androidx.appcompat.R.attr.colorPrimary), getColor(R.color.brand_teal))
        refresh.setProgressBackgroundColorSchemeColor(attr(com.google.android.material.R.attr.colorSurfaceContainerHigh))
        refresh.setOnRefreshListener { if (status == CardStatus.PENDING) retry() else { renderCard(); refresh.isRefreshing = false } }
        retry.setOnClickListener { refresh.isRefreshing = true; retry() }
        nfcSettings.setOnClickListener {
            try { startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) }
            catch (e: ActivityNotFoundException) { startActivity(Intent(Settings.ACTION_WIRELESS_SETTINGS)) }
        }
        detailsToggle.setOnClickListener {
            TransitionManager.beginDelayedTransition(details.parent as ViewGroup)
            val open = details.visibility != View.VISIBLE
            details.visibility = if (open) View.VISIBLE else View.GONE
            detailsToggle.setText(if (open) R.string.details_hide else R.string.details_show)
            if (open) cardScroll.postDelayed({ cardScroll.smoothScrollTo(0, details.bottom) }, 250)
        }
        copy.setOnClickListener {
            getSystemService(ClipboardManager::class.java)
                .setPrimaryClip(ClipData.newPlainText("ClassAI token", tokens.getOrCreate().toHex()))
            snack("Token copiado")
        }
        successOverlayClick()
        if (debuggable) idCard.setOnLongClickListener { EventLog.credentialRead(); true }  // simular lectura
    }

    private fun successOverlayClick() = b.successOverlay.setOnClickListener { hideSuccessOverlay() }

    private fun showCard(animate: Boolean) {
        val wasLogin = b.login.root.visibility == View.VISIBLE
        b.card.root.visibility = View.VISIBLE
        renderCard()
        startTilt()
        if (wasLogin) {
            if (animate && motionEnabled) {
                b.login.root.animate().alpha(0f).translationY(-dp(40f)).setDuration(280).withEndAction {
                    b.login.root.visibility = View.GONE
                }.start()
            } else b.login.root.visibility = View.GONE
        }
        if (animate && motionEnabled) flipIn()
    }

    // Entrada del carnet: giro 3D + el resto de la pantalla sube escalonado
    private fun flipIn(): Unit = with(b.card) {
        flipping = true
        idCard.cameraDistance = 12000 * resources.displayMetrics.density
        idCard.rotationY = -110f; idCard.rotationX = 0f; idCard.alpha = 0f
        idCard.scaleX = 0.85f; idCard.scaleY = 0.85f
        idCard.animate().rotationY(0f).alpha(1f).scaleX(1f).scaleY(1f)
            .setStartDelay(150).setDuration(950).setInterpolator(OvershootInterpolator(1.1f))
            .withEndAction { flipping = false; idCard.sweepOnce() }.start()
        val parent = idCard.parent as ViewGroup
        for (i in 1 until parent.childCount) {
            val v = parent.getChildAt(i)
            v.alpha = 0f
            v.translationY = dp(30f)
            v.animate().alpha(1f).translationY(0f).setStartDelay(450L + i * 60L).setDuration(450)
                .setInterpolator(DecelerateInterpolator(2f)).start()
        }
    }

    private fun renderCard() = with(b.card) {
        val adapter = NfcAdapter.getDefaultAdapter(this@MainActivity)
        val hce = packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
        val s = cardStatus(adapter != null || demoNfc, hce || demoNfc, adapter?.isEnabled == true || demoNfc, profile.enrolled)
        val n = profile.name.orEmpty()
        cardName.text = n
        cardCode.text = "Código ${profile.code.orEmpty()}"
        avatar.initials = initials(n)
        setStatus(s)
        idCard.contentDescription = "Carnet de $n, código ${profile.code}. Estado: ${s.label}"
        renderReads(animateFirst = false)
        renderDetails(adapter, hce)
    }

    private fun setStatus(s: CardStatus): Unit = with(b.card) {
        val color = getColor(when (s) {
            CardStatus.ACTIVE -> R.color.chip_active
            CardStatus.PENDING -> R.color.chip_pending
            CardStatus.NFC_OFF -> R.color.chip_error
            CardStatus.NO_NFC, CardStatus.NO_HCE -> R.color.chip_neutral
        })
        val icon = when (s) {
            CardStatus.ACTIVE -> R.drawable.ic_check_circle
            CardStatus.PENDING -> R.drawable.ic_schedule
            else -> R.drawable.ic_warning
        }
        val changed = s != status
        status = s
        chipText.text = s.label
        chipIcon.setImageResource(icon)
        waves.active = s == CardStatus.ACTIVE
        retry.visibility = if (s == CardStatus.PENDING) View.VISIBLE else View.GONE
        nfcSettings.visibility = if (s == CardStatus.NFC_OFF) View.VISIBLE else View.GONE
        hint.setCompoundDrawablesRelativeWithIntrinsicBounds(if (s == CardStatus.ACTIVE) R.drawable.ic_contactless else icon, 0, 0, 0)
        hint.compoundDrawableTintList = ColorStateList.valueOf(attr(androidx.appcompat.R.attr.colorPrimary))
        if (!changed) return
        if (chipColor == 0 || !motionEnabled) {
            chip.backgroundTintList = ColorStateList.valueOf(color)
            hint.text = s.hint
        } else {
            ValueAnimator.ofArgb(chipColor, color).apply {
                duration = 450
                addUpdateListener { chip.backgroundTintList = ColorStateList.valueOf(it.animatedValue as Int) }
            }.start()
            chip.scaleX = 0.8f; chip.scaleY = 0.8f
            chip.animate().scaleX(1f).scaleY(1f).setInterpolator(OvershootInterpolator(3f)).setDuration(400).start()
            hint.animate().alpha(0f).setDuration(120).withEndAction {
                hint.text = s.hint
                hint.animate().alpha(1f).setDuration(200).start()
            }.start()
        }
        chipColor = color
    }

    private fun renderReads(animateFirst: Boolean): Unit = with(b.card) {
        val list = EventLog.reads().take(8)
        reads.removeAllViews()
        list.forEachIndexed { i, e ->
            val row = ItemReadBinding.inflate(layoutInflater, reads, false)
            row.readTime.text = timeFmt.format(Date(e.time))
            row.root.contentDescription = "${getString(R.string.read_ok)} a las ${row.readTime.text}"
            reads.addView(row.root)
            if (i == 0 && animateFirst && motionEnabled) {
                row.root.alpha = 0f
                row.root.translationX = -dp(60f)
                row.root.animate().alpha(1f).translationX(0f).setStartDelay(500).setDuration(500)
                    .setInterpolator(OvershootInterpolator(1.2f)).start()
            }
        }
        val empty = list.isEmpty()
        b.card.empty.visibility = if (empty) View.VISIBLE else View.GONE
        reads.visibility = if (empty) View.GONE else View.VISIBLE
        // ilustración del estado vacío flotando suave
        if (empty && motionEnabled && bob == null) {
            bob = ObjectAnimator.ofFloat(emptyArt, View.TRANSLATION_Y, -dp(4f), dp(4f)).apply {
                duration = 1600; repeatMode = ValueAnimator.REVERSE; repeatCount = ValueAnimator.INFINITE; start()
            }
        } else if (!empty) {
            bob?.cancel(); bob = null; emptyArt.translationY = 0f
        }
    }

    private fun renderDetails(adapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(this),
                              hce: Boolean = packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)) = with(b.card) {
        token.text = tokens.getOrCreate().toHex().chunked(8).joinToString(" ")
        tech.text = "AID: F0434C4153534149\n" +
            "NFC: ${if (adapter == null) "no disponible" else if (adapter.isEnabled) "activo" else "apagado"}\n" +
            "HCE: ${if (hce) "compatible" else "no compatible"}\n" +
            "Servidor: ${profile.server}\n" +
            "Vinculación: ${if (profile.enrolled) "activa" else "pendiente"}" +
            if (demoNfc) "\nModo demo (debug): NFC simulado" else ""
        log.text = EventLog.text().ifEmpty { "(sin eventos)" }
    }

    private fun retry() {
        val code = profile.code ?: return
        val name = profile.name ?: return
        enroll(code, name, profile.server) { outcome ->
            b.card.refresh.isRefreshing = false
            when (outcome) {
                EnrollOutcome.Linked -> {
                    profile.setEnrolled(true)
                    renderCard()
                    b.card.idCard.sweepOnce()
                    snack("¡Teléfono vinculado!")
                }
                EnrollOutcome.Pending -> snack("Sigue sin conexión con ${profile.server}")
                is EnrollOutcome.Rejected -> MaterialAlertDialogBuilder(this)
                    .setIcon(R.drawable.ic_warning)
                    .setTitle("No se pudo vincular")
                    .setMessage(outcome.message)
                    .setPositiveButton("Entendido", null)
                    .show()
            }
        }
    }

    private fun showServerSheet() {
        val sheet = BottomSheetDialog(this)
        val v = SheetServerBinding.inflate(layoutInflater)
        v.server.setText(profile.server)
        v.save.setOnClickListener {
            val s = normalizeServer(v.server.text.toString())
            if (s == null) {
                v.serverLayout.error = "URL inválida (ej. http://192.168.1.10:8000)"
                reject(v.serverLayout)
                return@setOnClickListener
            }
            profile.server = s
            sheet.dismiss()
            renderDetails()
            snack("Servidor actualizado")
        }
        sheet.setContentView(v.root)
        sheet.show()
    }

    private fun confirmUnlink() {
        MaterialAlertDialogBuilder(this)
            .setIcon(R.drawable.ic_logout)
            .setTitle("¿Desvincular este teléfono?")
            .setMessage("Se generará una credencial nueva y volverás al inicio. " +
                "Si el teléfono ya estaba vinculado, pide al docente que revoque la credencial anterior.")
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Desvincular") { _, _ ->
                tokens.regenerate()
                profile.clear()
                status = null
                chipColor = 0
                EventLog.clear()
                EventLog.add("Token regenerado")
                b.login.code.text = null
                b.login.name.text = null
                showLogin(animate = true)
            }
            .show()
    }

    // ---------------------------------------------------------------- momento estrella

    private fun onLogEntry(e: EventLog.Entry) {
        if (b.card.root.visibility != View.VISIBLE) return
        if (!e.read) {
            renderDetails()
            return
        }
        celebrate()
    }

    private fun celebrate(): Unit = with(b.card) {
        vibrate()
        renderReads(animateFirst = true)
        renderDetails()
        if (!motionEnabled) {
            showSuccessOverlay()
            return
        }
        // ondas + confeti desde el ícono NFC
        val icon = IntArray(2).also { nfcIcon.getLocationInWindow(it) }
        val root = IntArray(2).also { b.root.getLocationInWindow(it) }
        b.celebration.play(icon[0] - root[0] + nfcIcon.width / 2f, icon[1] - root[1] + nfcIcon.height / 2f)
        // el carnet late y brilla
        idCard.animate().scaleX(1.05f).scaleY(1.05f).setDuration(160).withEndAction {
            idCard.animate().scaleX(1f).scaleY(1f).setInterpolator(OvershootInterpolator(3f)).setDuration(450).start()
        }.start()
        idCard.sweepOnce()
        ValueAnimator.ofFloat(0f, 1f, 1f, 0f).apply {
            duration = 1600
            addUpdateListener {
                val g = it.animatedValue as Float
                idCard.glow = g
                idCard.elevation = dp(10f + 18f * g)
            }
        }.start()
        b.root.postDelayed({ showSuccessOverlay() }, 350)
    }

    private fun showSuccessOverlay(): Unit = with(b) {
        root.removeCallbacks(hideSuccess)
        successOverlay.animate().cancel()
        successOverlay.visibility = View.VISIBLE
        val avd = successCheck.drawable as AnimatedVectorDrawable
        if (motionEnabled) {
            successOverlay.alpha = 0f
            successOverlay.animate().alpha(1f).setDuration(200).start()
            successCheck.scaleX = 0.2f; successCheck.scaleY = 0.2f
            successCheck.animate().scaleX(1f).scaleY(1f).setInterpolator(OvershootInterpolator(2.5f)).setDuration(550).start()
            listOf(successTitle, successBody).forEachIndexed { i, v ->
                v.alpha = 0f; v.translationY = dp(24f)
                v.animate().alpha(1f).translationY(0f).setStartDelay(250L + i * 90).setDuration(400).start()
            }
            avd.reset()
            avd.start()
            celebration.bringToFront()
        } else {
            successOverlay.alpha = 1f
            avd.reset()
            avd.start()  // con animaciones desactivadas el sistema salta al estado final
        }
        root.postDelayed(hideSuccess, 1900)
    }

    private fun hideSuccessOverlay(): Unit = with(b) {
        root.removeCallbacks(hideSuccess)
        if (successOverlay.visibility != View.VISIBLE) return
        successOverlay.animate().alpha(0f).setDuration(250).withEndAction {
            successOverlay.visibility = View.GONE
            snack("Lectura registrada a las ${timeFmt.format(Date())}", R.drawable.ic_check_circle)
        }.start()
    }

    private fun vibrate() {
        val v = if (Build.VERSION.SDK_INT >= 31) getSystemService(VibratorManager::class.java)?.defaultVibrator
        else @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
        if (v?.hasVibrator() != true) return
        v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 35, 70, 60), intArrayOf(0, 160, 0, 255), -1))
    }

    private fun snack(msg: String, icon: Int = 0) {
        val s = Snackbar.make(b.root, msg, Snackbar.LENGTH_LONG)
        if (icon != 0) {
            s.view.findViewById<android.widget.TextView>(com.google.android.material.R.id.snackbar_text)?.apply {
                setCompoundDrawablesRelativeWithIntrinsicBounds(icon, 0, 0, 0)
                compoundDrawablePadding = dp(12f).toInt()
                compoundDrawableTintList = ColorStateList.valueOf(getColor(R.color.brand_teal_light))
            }
        }
        s.show()
    }

    // ---------------------------------------------------------------- inclinación (parallax)

    private fun startTilt() {
        if (!motionEnabled || sensors != null) return
        val sm = getSystemService(SensorManager::class.java) ?: return
        val sensor = sm.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
        sensors = sm
        gx0 = Float.NaN
        sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
    }

    private fun stopTilt() {
        sensors?.unregisterListener(this)
        sensors = null
    }

    override fun onSensorChanged(e: SensorEvent) {
        if (flipping) return
        val gx = e.values[0]
        val gy = e.values[1]
        if (gx0.isNaN()) { gx0 = gx; gy0 = gy }
        // la referencia sigue lentamente a la postura del usuario: solo reacciona a movimientos
        gx0 += (gx - gx0) * 0.02f
        gy0 += (gy - gy0) * 0.02f
        tiltX += ((gx - gx0) - tiltX) * 0.15f
        tiltY += ((gy - gy0) - tiltY) * 0.15f
        val card = b.card.idCard
        card.rotationY = (-tiltX * 2.5f).coerceIn(-8f, 8f)
        card.rotationX = (tiltY * 2.5f).coerceIn(-8f, 8f)
        card.holo = (tiltX / 3f).coerceIn(-1f, 1f)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
