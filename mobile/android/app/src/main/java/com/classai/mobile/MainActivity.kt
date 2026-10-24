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
import android.graphics.drawable.AnimatedVectorDrawable
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.ConnectivityManager
import android.net.Network
import android.nfc.NfcAdapter
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.KeyEvent
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.classai.mobile.databinding.ActivityMainBinding
import com.classai.mobile.databinding.ItemReadBinding
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

    private var enrollmentGeneration = 0
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
    private val hideSuccess = Runnable { hideSuccessOverlay() }
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            runOnUiThread { retryIfPending() }
        }
    }
    private var foreground = false

    private fun retryIfPending() {
        if (foreground && profile.hasProfile && !profile.enrolled && !busy) retry()
    }

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
        foreground = true
        EventLog.listener = ::onLogEntry
        getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(networkCallback)
        if (b.card.root.visibility == View.VISIBLE) {
            renderCard()
            startTilt()
            retryIfPending()
        }
    }

    override fun onPause() {
        foreground = false
        getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(networkCallback)
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
        code.doAfterTextChanged {
            codeLayout.error = null
            link.isEnabled = !busy && validateCode(it.toString()) == null
        }
        link.setOnClickListener { submit() }
        code.setOnEditorActionListener { _, id, event ->
            val done = id == EditorInfo.IME_ACTION_DONE ||
                (event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN)
            if (done) submit()
            done
        }
        code.setOnFocusChangeListener { _, focused ->
            if (motionEnabled) form.animate().scaleX(if (focused) 1.015f else 1f)
                .scaleY(if (focused) 1.015f else 1f).setDuration(180).start()
        }
    }

    private fun submit(): Unit = with(b.login) {
        if (busy) return
        val c = code.text.toString().trim()
        codeLayout.error = validateCode(c)
        if (codeLayout.error != null) {
            reject(form)
            return
        }
        getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(root.windowToken, 0)
        // Save the pending code first: rotation/network loss must not lose this step.
        profile.save(c, "Tu carnet", enrolled = false)
        setLinkLoading()
        enroll(c) { outcome ->
            when (outcome) {
                is EnrollOutcome.Linked -> {
                    profile.save(c, outcome.fullName, enrolled = true)
                    linkDone(true) { busy = false; showCard(animate = true) }
                }
                EnrollOutcome.Pending -> {
                    linkDone(false) {
                        busy = false
                        showCard(animate = true)
                        snack("Guardamos tu código. Terminaremos de vincularlo al recuperar la conexión")
                    }
                }
                is EnrollOutcome.Rejected -> {
                    profile.clear()
                    resetLinkButton()
                    codeLayout.error = outcome.message
                    reject(form)
                }
            }
        }
    }

    private fun enroll(code: String, done: (EnrollOutcome) -> Unit) {
        val credential = tokens.getOrCreate()
        val request = ++enrollmentGeneration
        val token = credential.toHex()
        val json = enrollJson(code, token)
        io.execute {
            val outcome = postEnroll(BuildConfig.CLASSAI_API_URL, json)
            runOnUiThread {
                if (!isDestroyed && !isFinishing && profile.code == code &&
                    enrollmentResultIsCurrent(request, enrollmentGeneration, BuildConfig.CLASSAI_API_URL,
                        BuildConfig.CLASSAI_API_URL, credential, tokens.get())) done(outcome)
            }
        }
    }

    private fun setLinkLoading(): Unit = with(b.login.link) {
        busy = true
        isEnabled = false
        b.login.code.isEnabled = false
        val spec = CircularProgressIndicatorSpec(context, null, 0,
            com.google.android.material.R.style.Widget_Material3_CircularProgressIndicator_ExtraSmall)
        spec.indicatorColors = intArrayOf(currentTextColor)
        icon = IndeterminateDrawable.createCircularDrawable(context, spec)
        text = "Vinculando…"
    }

    // Botón → check animado (vinculado) o reloj (pendiente), y luego sigue
    private fun linkDone(linked: Boolean, next: () -> Unit): Unit = with(b.login.link) {
        val to = getColor(if (linked) R.color.ds_state_ok_subtle else R.color.ds_state_regular_subtle)
        val foreground = ColorStateList.valueOf(getColor(if (linked) R.color.ds_state_ok_text else R.color.ds_state_regular_text))
        setTextColor(foreground)
        iconTint = foreground
        text = if (linked) "¡Vinculado!" else "Guardado sin conexión"
        if (linked) {
            val avd = (getDrawable(R.drawable.avd_check)!!.mutate() as AnimatedVectorDrawable)
            avd.setTint(foreground.defaultColor)
            icon = avd
            iconSize = dp(26f).toInt()
            avd.start()
        } else {
            setIconResource(R.drawable.ic_schedule)
        }
        performHapticFeedback(HapticFeedbackConstants.CONFIRM.takeIf { Build.VERSION.SDK_INT >= 30 }
            ?: HapticFeedbackConstants.LONG_PRESS)
        backgroundTintList = ColorStateList.valueOf(to)
        postDelayed({ next() }, if (motionEnabled) 500 else 0)
    }

    private fun resetLinkButton(): Unit = with(b.login.link) {
        busy = false
        b.login.code.isEnabled = true
        isEnabled = validateCode(b.login.code.text.toString()) == null
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
            scaleX = 0.96f; scaleY = 0.96f; alpha = 0f; rotation = 0f
            animate().scaleX(1f).scaleY(1f).alpha(1f).rotation(0f)
                .setInterpolator(DecelerateInterpolator()).setDuration(360).start()
        }
        listOf<View>(title, subtitle, form, privacy).forEachIndexed { i, v ->
            v.alpha = 0f
            v.translationY = dp(20f)
            v.animate().alpha(1f).translationY(0f).setStartDelay(80L + i * 65L).setDuration(320)
                .setInterpolator(DecelerateInterpolator(2f)).start()
        }
    }

    // ---------------------------------------------------------------- carnet

    private fun setupCard(): Unit = with(b.card) {
        toolbar.setOnMenuItemClickListener {
            when (it.itemId) {
                R.id.action_unlink -> confirmUnlink()
            }
            true
        }
        refresh.setColorSchemeColors(attr(androidx.appcompat.R.attr.colorPrimary), getColor(R.color.ds_brand_air_to))
        refresh.setProgressBackgroundColorSchemeColor(attr(com.google.android.material.R.attr.colorSurfaceContainerHigh))
        refresh.setOnRefreshListener { if (!profile.enrolled) retry() else { renderCard(); refresh.isRefreshing = false } }
        retry.setOnClickListener { refresh.isRefreshing = true; retry() }
        nfcSettings.setOnClickListener {
            try { startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) }
            catch (e: ActivityNotFoundException) { startActivity(Intent(Settings.ACTION_WIRELESS_SETTINGS)) }
        }
        technicalNfcSettings.setOnClickListener { nfcSettings.performClick() }
        detailsToggle.setOnClickListener {
            val open = details.visibility != View.VISIBLE
            details.visibility = if (open) View.VISIBLE else View.GONE
            detailsToggle.setText(if (open) R.string.details_hide else R.string.details_show)
            if (open) {
                renderDetails()
                cardScroll.post { cardScroll.smoothScrollTo(0, details.bottom) }
            }
        }
        copy.setOnClickListener {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(
                ClipData.newPlainText("ClassAI credencial privada", tokens.getOrCreate().toHex()).apply {
                    if (Build.VERSION.SDK_INT >= 33) description.extras = android.os.PersistableBundle().apply {
                        putBoolean(android.content.ClipDescription.EXTRA_IS_SENSITIVE, true)
                    }
                })
            snack("Credencial copiada. No la compartas")
        }
        successOverlayClick()
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

    // Entrada breve: aparece y se eleva suavemente.
    private fun flipIn(): Unit = with(b.card) {
        flipping = true
        idCard.alpha = 0f
        idCard.translationY = dp(12f)
        idCard.animate().alpha(1f).translationY(0f).setDuration(360)
            .setInterpolator(DecelerateInterpolator())
            .withEndAction { flipping = false }.start()
    }

    private fun renderCard() = with(b.card) {
        val adapter = NfcAdapter.getDefaultAdapter(this@MainActivity)
        val hce = packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
        val s = cardStatus(adapter != null || demoNfc, hce || demoNfc, adapter?.isEnabled == true || demoNfc, profile.enrolled)
        val n = profile.name ?: "Tu carnet"
        cardName.text = n
        cardCode.text = "Código ${profile.code.orEmpty()}"
        avatar.initials = initials(n)
        setStatus(s)
        idCard.contentDescription = "Carnet de $n, código ${profile.code}. Estado: ${s.label}"
        renderDetails()
        renderReads(animateFirst = false)
    }

    private fun setStatus(s: CardStatus): Unit = with(b.card) {
        val color = getColor(when (s) {
            CardStatus.ACTIVE -> R.color.ds_state_ok_subtle
            CardStatus.PENDING -> R.color.ds_state_regular_subtle
            CardStatus.NFC_OFF -> R.color.ds_state_alert_subtle
            CardStatus.NO_NFC, CardStatus.NO_HCE -> R.color.ds_state_offline_subtle
        })
        val foreground = getColor(when (s) {
            CardStatus.ACTIVE -> R.color.ds_state_ok_text
            CardStatus.PENDING -> R.color.ds_state_regular_text
            CardStatus.NFC_OFF -> R.color.ds_state_alert_text
            CardStatus.NO_NFC, CardStatus.NO_HCE -> R.color.ds_state_offline_text
        })
        chipText.setTextColor(foreground)
        chipIcon.imageTintList = ColorStateList.valueOf(foreground)
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
        retry.visibility = if (!profile.enrolled) View.VISIBLE else View.GONE
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
            chip.scaleX = 0.98f; chip.scaleY = 0.98f
            chip.animate().scaleX(1f).scaleY(1f).setInterpolator(DecelerateInterpolator()).setDuration(240).start()
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
    }

    private fun retry() {
        if (busy) return
        val code = profile.code ?: return
        busy = true
        b.card.retry.isEnabled = false
        enroll(code) { outcome ->
            busy = false
            b.card.retry.isEnabled = true
            b.card.refresh.isRefreshing = false
            when (outcome) {
                is EnrollOutcome.Linked -> {
                    profile.save(code, outcome.fullName, enrolled = true)
                    renderCard()
                    b.card.idCard.sweepOnce()
                    snack("Tu carnet está listo")
                }
                EnrollOutcome.Pending -> snack("Tu código está guardado. Seguimos sin conexión")
                is EnrollOutcome.Rejected -> {
                    profile.clear()
                    showLogin(animate = true)
                    b.login.code.setText(code)
                    b.login.codeLayout.error = outcome.message
                }
            }
        }
    }

    private fun confirmUnlink() {
        MaterialAlertDialogBuilder(this)
            .setIcon(R.drawable.ic_logout)
            .setTitle("¿Cambiar de estudiante?")
            .setMessage("Volverás al inicio. Si luego quieres vincular otra vez este carnet, tu docente deberá habilitarlo.")
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Cambiar") { _, _ ->
                enrollmentGeneration++
                tokens.regenerate()
                profile.clear()
                status = null
                chipColor = 0
                EventLog.clear()
                EventLog.add("Token regenerado")
                b.login.code.text = null
                showLogin(animate = true)
            }
            .show()
    }

    // ---------------------------------------------------------------- momento estrella

    private fun renderDetails() = with(b.card) {
        if (details.visibility != View.VISIBLE) return@with
        val adapter = NfcAdapter.getDefaultAdapter(this@MainActivity)
        val hce = packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
        token.text = tokens.getOrCreate().toHex().chunked(8).joinToString(" ")
        tech.text = "NFC: ${if (adapter == null) "no disponible" else if (adapter.isEnabled) "activado" else "desactivado"}\n" +
            "HCE: ${if (hce) "compatible" else "no disponible"}\n" +
            "Vinculación: ${if (profile.enrolled) "confirmada por el servidor" else "pendiente"}\n" +
            "Servidor (configurado en .env): ${BuildConfig.CLASSAI_API_URL}\n" +
            "AID: F0434C4153534149 · protocolo v1\n" +
            "El servicio responde SELECT → GET CREDENTIAL automáticamente, sin pulsar botones. Usa el teléfono desbloqueado.\n" +
            "Una lectura confirma la entrega de la credencial; la asistencia la valida el backend." +
            if (demoNfc) "\nVista de demostración: el estado del carnet simula NFC. El diagnóstico de arriba muestra el hardware real." else ""
        log.text = EventLog.text().ifEmpty { "Sin eventos APDU en este proceso. Esperando al lector." }
    }

    private fun onLogEntry(e: EventLog.Entry) {
        if (b.card.root.visibility != View.VISIBLE) return
        renderDetails()
        if (e.read) celebrate()
    }

    private fun celebrate(): Unit = with(b.card) {
        vibrate()
        renderReads(animateFirst = true)
        if (!motionEnabled) {
            showSuccessOverlay()
            return
        }
        // Una lectura real recibe una confirmación breve, sin confeti.
        idCard.sweepOnce()
        ValueAnimator.ofFloat(0f, 1f, 1f, 0f).apply {
            duration = 1600
            addUpdateListener {
                val g = it.animatedValue as Float
                idCard.glow = g
                idCard.elevation = dp(10f)
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
            successCheck.scaleX = 0.95f; successCheck.scaleY = 0.95f
            successCheck.animate().scaleX(1f).scaleY(1f).setInterpolator(DecelerateInterpolator()).setDuration(250).start()
            listOf(successTitle, successBody).forEachIndexed { i, v ->
                v.alpha = 0f; v.translationY = dp(24f)
                v.animate().alpha(1f).translationY(0f).setStartDelay(250L + i * 90).setDuration(400).start()
            }
            avd.reset()
            avd.start()
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
                compoundDrawableTintList = ColorStateList.valueOf(getColor(R.color.ds_text_inverse))
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
        card.rotationY = (-tiltX * 0.7f).coerceIn(-2f, 2f)
        card.rotationX = (tiltY * 0.7f).coerceIn(-2f, 2f)
        card.holo = (tiltX / 3f).coerceIn(-1f, 1f)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
