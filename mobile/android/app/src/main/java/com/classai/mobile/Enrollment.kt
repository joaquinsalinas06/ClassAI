package com.classai.mobile

// Enrolamiento móvil: código + token; el backend resuelve el nombre del padrón.
// Lógica pura (sin Android) para poder probarla con JUnit.

sealed interface EnrollOutcome {
    data class Linked(val fullName: String) : EnrollOutcome                        // 2xx: credencial activa
    data class Rejected(val message: String) : EnrollOutcome  // 4xx: corregir datos o pedir revocación
    data object Pending : EnrollOutcome                       // sin red / 5xx: se reintenta luego
}

// httpCode null = error de red
fun enrollOutcome(httpCode: Int?, fullName: String? = null): EnrollOutcome = when (httpCode) {
    null -> EnrollOutcome.Pending
    in 200..299 -> fullName?.trim()?.takeIf { it.isNotEmpty() }?.let { EnrollOutcome.Linked(it) } ?: EnrollOutcome.Pending
    404 -> EnrollOutcome.Rejected("Tu código aún no está registrado. Pide a tu docente que lo agregue")
    409 -> EnrollOutcome.Rejected("Este estudiante ya tiene un teléfono activo, pide al docente que lo revoque")
    in 400..499 -> EnrollOutcome.Rejected("No pudimos vincular tu código. Revisa los dígitos o consulta a tu docente")
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

fun enrollJson(code: String, token: String): String =
    """{"student_code":${jsonString(code.trim())},"token":${jsonString(token)}}"""

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

// Iniciales para el avatar: primera letra del primer y último nombre ("Ana María Pérez" → "AP")
fun initials(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val letters = listOfNotNull(words.firstOrNull(), words.lastOrNull()?.takeIf { words.size > 1 })
    return letters.joinToString("") { it.take(1) }.uppercase()
}
