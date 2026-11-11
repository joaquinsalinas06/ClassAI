package com.classai.mobile

import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.nfc.NfcAdapter
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.Executors

/** Flujo de demostración: los accesos de cuenta nunca viajan sobre HTTP. */
class StudentActivity : AppCompatActivity() {
    private val io = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var root: LinearLayout
    private lateinit var tokenStore: TokenStore
    private var sessionToken: String? = null // solo memoria; al cerrar la app se vuelve a iniciar sesión
    private var selectedClass: String? = null
    private var polling = false
    private var requestVersion = 0
    private val ink get() = getColor(R.color.ds_text_primary)
    private val muted get() = getColor(R.color.ds_text_muted)
    private val accent get() = getColor(R.color.ds_brand_air_from)
    private val pageColor get() = getColor(R.color.ds_bg_page)
    private val surface get() = getColor(R.color.ds_bg_surface)
    private val onAccent get() = getColor(R.color.ds_brand_on_ink)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tokenStore = TokenStore(this)
        loginScreen()
    }

    override fun onDestroy() {
        polling = false
        handler.removeCallbacksAndMessages(null)
        io.shutdownNow()
        super.onDestroy()
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun shape(color: Int, radius: Int = 20) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat()
    }
    private fun screen(title: String, subtitle: String) {
        requestVersion++
        val scroll = ScrollView(this).apply { setBackgroundColor(pageColor); isFillViewport = true }
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(32), dp(22), dp(36))
        }
        scroll.addView(root)
        setContentView(scroll)
        text("ClassAI  /  ALUMNOS", 12, accent, true)
        text(title, 30, ink, true)
        text(subtitle, 15, muted)
        gap(20)
    }
    private fun gap(size: Int) { root.addView(View(this), LinearLayout.LayoutParams(1, dp(size))) }
    private fun text(value: String, size: Int = 16, color: Int = ink, bold: Boolean = false): TextView {
        val view = TextView(this).apply {
            text = value; textSize = size.toFloat(); setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(3), 0, dp(3))
        }
        root.addView(view)
        return view
    }
    private fun field(hintText: String, type: Int = InputType.TYPE_CLASS_TEXT): EditText {
        val input = EditText(this).apply {
            hint = hintText; inputType = type; textSize = 16f; setSingleLine()
            setPadding(dp(16), dp(10), dp(16), dp(10)); background = shape(surface, 14)
            setTextColor(ink); setHintTextColor(muted)
        }
        root.addView(input, LinearLayout.LayoutParams(-1, dp(56)).apply { bottomMargin = dp(10) })
        return input
    }
    private fun button(label: String, primary: Boolean = false, action: () -> Unit) {
        val button = Button(this).apply {
            text = label; isAllCaps = false; textSize = 15f
            setTextColor(if (primary) onAccent else ink)
            backgroundTintList = ColorStateList.valueOf(if (primary) accent else surface)
            setOnClickListener { action() }
        }
        root.addView(button, LinearLayout.LayoutParams(-1, dp(55)).apply { bottomMargin = dp(9) })
    }
    private fun message(value: String) = Toast.makeText(this, value, Toast.LENGTH_LONG).show()

    private fun loginScreen(register: Boolean = false) {
        polling = false
        screen(if (register) "Crea tu cuenta" else "Hola de nuevo", "Tu carnet y tu clase, en un mismo lugar.")
        val first = if (register) field("Nombre", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS) else null
        val last = if (register) field("Apellidos", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS) else null
        val email = field("Correo electrónico", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val password = field("Contraseña (mínimo 10 caracteres)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        button(if (register) "Crear cuenta" else "Entrar", true) {
            val body = JSONObject().put("email", email.text.toString().trim()).put("password", password.text.toString())
                .put("nfc_token", tokenStore.getOrCreate().toHex())
            if (register) body.put("first_name", first!!.text.toString().trim()).put("last_name", last!!.text.toString().trim())
            request("POST", if (register) "/student/register" else "/student/login", body) { result ->
                sessionToken = result.optString("access_token").takeIf { it.isNotEmpty() }
                if (sessionToken == null) message("No se pudo iniciar sesión") else classesScreen()
            }
        }
        button(if (register) "Ya tengo una cuenta" else "Crear cuenta") { loginScreen(!register) }
        text("Cuenta de demostración · Tus datos NFC no incluyen tu nombre.", 13, muted)
    }

    private fun classesScreen() {
        polling = false
        selectedClass = null
        screen("Elige tu clase", "Selecciona una clase activa para marcar tu asistencia.")
        val status = text("Buscando clases…", 15, muted)
        button("Actualizar") { classesScreen() }
        button("Cerrar sesión") { sessionToken = null; loginScreen() }
        request("GET", "/student/classes") { result ->
            val classes = result.optJSONArray("classes")
            if (classes == null || classes.length() == 0) status.text = "No hay clases activas por ahora."
            else {
                status.text = "Clases disponibles"
                for (i in 0 until classes.length()) {
                    val item = classes.getJSONObject(i)
                    val id = item.getString("id")
                    val name = item.optString("course").takeUnless { it.isBlank() || it == "null" } ?: "Clase activa"
                    button("$name  ·  ${item.optString("room")}") { selectedClass = id; waitingScreen(id) }
                }
            }
        }
    }

    private fun waitingScreen(id: String) {
        screen("Acerca tu carnet", "Desbloquea tu teléfono y acércalo al lector de la clase elegida.")
        metric("Tu carnet NFC", "Acerca tu teléfono al lector")
        gap(8)
        val status = text("Esperando confirmación del servidor…", 18, ink, true)
        val nfc = NfcAdapter.getDefaultAdapter(this)
        text(when { nfc == null -> "Este teléfono no tiene NFC."; !nfc.isEnabled -> "Activa NFC en los ajustes del teléfono."; else -> "Mantén la pantalla encendida durante la lectura." }, 14, muted)
        button("Elegir otra clase") { classesScreen() }
        polling = true
        val path = "/student/classes/${URLEncoder.encode(id, "UTF-8")}"
        fun refresh() {
            if (!polling || selectedClass != id || isFinishing || isDestroyed) return
            request("GET", path, silent = true, failure = { status.text = "Sin conexión. Intentando de nuevo…" }) { result ->
                when {
                    result.optBoolean("ended") -> { polling = false; status.text = "La clase terminó." }
                    result.optBoolean("attended") -> { polling = false; dashboard(id, result) }
                    else -> status.text = "Esperando confirmación del servidor…"
                }
            }
            handler.postDelayed({ refresh() }, 4000)
        }
        refresh()
    }

    private fun dashboard(id: String, data: JSONObject) {
        if (selectedClass != id) return
        val room = data.optString("room")
        screen("Tu clase", "$room · Asistencia confirmada ✓")
        val metrics = data.optJSONObject("metrics") ?: JSONObject()
        val temperature = metric("Temperatura", number(metrics, "temp_c", " °C"))
        val light = metric("Luz", lightValue(metrics))
        val noise = metric("Ruido", noiseValue(metrics))
        val motion = metric("Movimiento", motionValue(metrics))
        val connectivity = text("Datos del aula", 13, muted)
        polling = true
        val version = requestVersion
        fun refreshMetrics() {
            if (!polling || selectedClass != id || version != requestVersion || isFinishing || isDestroyed) return
            request("GET", "/student/classes/${URLEncoder.encode(id, "UTF-8")}", silent = true, failure = {
                connectivity.text = "Sin conexión: datos no disponibles"
                listOf(temperature, light, noise, motion).forEach { it.text = "Sin datos" }
            }) { result ->
                if (result.optBoolean("ended")) { polling = false; connectivity.text = "La clase terminó" }
                else {
                    connectivity.text = "Datos del aula"
                    val values = result.optJSONObject("metrics") ?: JSONObject()
                    temperature.text = number(values, "temp_c", " °C")
                    light.text = lightValue(values); noise.text = noiseValue(values); motion.text = motionValue(values)
                }
            }
            handler.postDelayed({ refreshMetrics() }, 5000)
        }
        handler.postDelayed({ refreshMetrics() }, 5000)
        gap(10)
        text("¿Cómo te sientes?", 21, ink, true)
        text("Tu opinión se mostrará al docente con tu nombre.", 14, muted)
        listOf("Todo bien" to "ok", "Tengo calor" to "hot", "Tengo frío" to "cold", "Mucho ruido" to "noisy", "Poca luz" to "dark").forEach { (label, kind) ->
            button(label) { request("POST", "/student/classes/${URLEncoder.encode(id, "UTF-8")}/feedback", JSONObject().put("kind", kind)) { message("Opinión enviada") } }
        }
        button("Actualizar datos") {
            request("GET", "/student/classes/${URLEncoder.encode(id, "UTF-8")}") { dashboard(id, it) }
        }
        button("Volver a clases") { classesScreen() }
    }
    private fun number(data: JSONObject, key: String, unit: String) = if (data.has(key) && !data.isNull(key)) "${data.optDouble(key)}$unit" else "Sin datos"
    private fun lightValue(data: JSONObject) = if (data.has("lux")) number(data, "lux", " lx") else if (data.has("light_rel")) "${(data.optDouble("light_rel") * 100).toInt()}% · nivel relativo" else "Sin datos"
    private fun noiseValue(data: JSONObject) = if (data.has("noise_rel")) "${(data.optDouble("noise_rel") * 100).toInt()}% · nivel relativo" else "Sin datos"
    private fun motionValue(data: JSONObject) = if (!data.has("presence")) "Sin datos" else if (data.optBoolean("presence")) "Detectado" else "Sin movimiento reciente"
    private fun metric(label: String, value: String): TextView {
        lateinit var reading: TextView
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(18), dp(13), dp(18), dp(13)); background = shape(surface)
            addView(TextView(context).apply { text = label.uppercase(); textSize = 12f; setTextColor(muted) })
            reading = TextView(context).apply { text = value; textSize = 20f; setTextColor(ink); setTypeface(typeface, Typeface.BOLD) }
            addView(reading)
        }
        root.addView(card, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) })
        return reading
    }

    private fun request(method: String, path: String, body: JSONObject? = null, silent: Boolean = false,
                        failure: () -> Unit = {}, success: (JSONObject) -> Unit) {
        if (!BuildConfig.CLASSAI_API_URL.startsWith("https://")) {
            if (!silent) message("Configura un servidor HTTPS para usar cuentas") else failure()
            return
        }
        val version = requestVersion
        val auth = sessionToken
        io.execute {
            var connection: HttpURLConnection? = null
            try {
                connection = URL(BuildConfig.CLASSAI_API_URL + path).openConnection() as HttpURLConnection
                connection.requestMethod = method; connection.connectTimeout = 5000; connection.readTimeout = 5000
                connection.instanceFollowRedirects = false
                if (auth != null) connection.setRequestProperty("Authorization", "Bearer $auth")
                if (body != null) {
                    connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                }
                val responseCode = connection.responseCode
                val raw = (if (responseCode in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}"
                val response = JSONObject(raw)
                handler.post {
                    if (!isFinishing && !isDestroyed && version == requestVersion) {
                        if (responseCode in 200..299) success(response)
                        else if (responseCode == 401 && auth != null) { polling = false; sessionToken = null; loginScreen(); message("Tu sesión terminó. Vuelve a entrar") }
                        else if (!silent) message(response.optString("detail", "No se pudo completar la solicitud")) else failure()
                    }
                }
            } catch (_: Exception) {
                handler.post { if (!isFinishing && !isDestroyed && version == requestVersion) { if (!silent) message("Sin conexión con el servidor") else failure() } }
            } finally { connection?.disconnect() }
        }
    }
}
