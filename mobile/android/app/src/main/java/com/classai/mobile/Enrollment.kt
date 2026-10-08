package com.classai.mobile

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

// Enrolamiento móvil: POST {server}/mobile/enroll {"student_code","full_name","token"}.
// Lógica pura (sin Android) para poder probarla con JUnit.

const val DEFAULT_SERVER = "http://10.0.2.2:8000"  // localhost del host visto desde el emulador

sealed interface EnrollOutcome {
    data object Linked : EnrollOutcome                        // 2xx: credencial activa
    data class Rejected(val message: String) : EnrollOutcome  // 4xx: corregir datos o pedir revocación
    data object Pending : EnrollOutcome                       // sin red / 5xx: se reintenta luego
}

// httpCode null = error de red
fun enrollOutcome(httpCode: Int?): EnrollOutcome = when (httpCode) {
    null -> EnrollOutcome.Pending
    in 200..299 -> EnrollOutcome.Linked
    409 -> EnrollOutcome.Rejected("Este estudiante ya tiene un teléfono activo, pide al docente que lo revoque")
    in 400..499 -> EnrollOutcome.Rejected("El servidor rechazó los datos (HTTP $httpCode)")
    else -> EnrollOutcome.Pending
}

enum class CardStatus(val label: String, val hint: String) {
    NO_NFC("Sin NFC", "Este teléfono no tiene NFC"),
    NO_HCE("Sin HCE", "Este teléfono no puede emular tarjetas NFC"),
    NFC_OFF("NFC desactivado", "Activa NFC para marcar asistencia"),
    PENDING("Pendiente de vincular", "Vincula el teléfono para que tu asistencia cuente"),
    ACTIVE("Activa", "Acerca el teléfono al lector"),
}

// Primero lo que impide el tap; luego el enrolamiento
fun cardStatus(hasNfc: Boolean, hce: Boolean, nfcOn: Boolean, enrolled: Boolean): CardStatus = when {
    !hasNfc -> CardStatus.NO_NFC
    !hce -> CardStatus.NO_HCE
    !nfcOn -> CardStatus.NFC_OFF
    !enrolled -> CardStatus.PENDING
    else -> CardStatus.ACTIVE
}

// Errores de formulario; null = válido
fun validateCode(code: String): String? =
    if (Regex("\\d{5,12}").matches(code.trim())) null else "Ingresa tu código universitario (solo números)"

fun validateName(name: String): String? =
    if (name.trim().length >= 3) null else "Ingresa tu nombre completo"

// null si no es http(s)://…; sin "/" final
fun normalizeServer(url: String): String? =
    url.trim().trimEnd('/').takeIf { Regex("https?://[^\\s/]+(/\\S*)?").matches(it) }

fun enrollJson(code: String, name: String, token: String): String =
    """{"student_code":${jsonString(code.trim())},"full_name":${jsonString(name.trim())},"token":${jsonString(token)}}"""

fun jsonString(s: String): String = buildString {
    append('"')
    for (c in s) when {
        c == '"' -> append("\\\"")
        c == '\\' -> append("\\\\")
        c < ' ' -> append("\\u%04x".format(c.code))
        else -> append(c)
    }
    append('"')
}

// Bloqueante: llamar fuera del main thread. Devuelve el código HTTP o null si no hubo respuesta.
fun postEnroll(server: String, json: String): Int? = try {
    val c = URL("$server/mobile/enroll").openConnection() as HttpURLConnection
    try {
        c.requestMethod = "POST"
        c.connectTimeout = 5000
        c.readTimeout = 5000
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        c.outputStream.use { it.write(json.toByteArray()) }
        c.responseCode
    } finally {
        c.disconnect()
    }
} catch (e: IOException) {
    null
}

// Iniciales para el avatar: primera letra del primer y último nombre ("Ana María Pérez" → "AP")
fun initials(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val letters = listOfNotNull(words.firstOrNull(), words.lastOrNull()?.takeIf { words.size > 1 })
    return letters.joinToString("") { it.take(1) }.uppercase()
}
