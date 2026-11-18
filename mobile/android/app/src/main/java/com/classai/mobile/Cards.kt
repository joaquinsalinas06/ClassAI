package com.classai.mobile

// Lógica pura (sin Android) para poder probarla con JUnit.

enum class CardStatus(val label: String, val hint: String) {
    NO_NFC("Sin NFC", "Este teléfono no tiene NFC"),
    NO_HCE("Sin HCE", "Este teléfono no puede emular tarjetas NFC"),
    NFC_OFF("NFC desactivado", "Activa NFC para marcar asistencia"),
    ACTIVE("Listo", "Acerca tu celular al lector"),
}

// Primero lo que impide el tap
fun cardStatus(hasNfc: Boolean, hce: Boolean, nfcOn: Boolean): CardStatus = when {
    !hasNfc -> CardStatus.NO_NFC
    !hce -> CardStatus.NO_HCE
    !nfcOn -> CardStatus.NFC_OFF
    else -> CardStatus.ACTIVE
}

// Mismo formato que acepta el backend: [A-Za-z0-9-]{1,32}. null = válido
fun validateCode(code: String): String? =
    if (Regex("[A-Za-z0-9-]{1,32}").matches(code.trim())) null else "Ingresa tu código universitario"

fun validatePassword(password: String): String? =
    if (password.length >= 6) null else "Usa al menos 6 caracteres"

fun validateName(name: String): String? =
    if (name.trim().length >= 3) null else "Escribe tu nombre completo"

// Iniciales para el avatar: primera letra del primer y último nombre ("Ana María Pérez" → "AP")
fun initials(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val letters = listOfNotNull(words.firstOrNull(), words.lastOrNull()?.takeIf { words.size > 1 })
    return letters.joinToString("") { it.take(1) }.uppercase()
}

enum class Level { OK, REGULAR, ALERT, NONE }

// Estado de confort que manda el backend ("OK", "REGULAR", "ALERT"...) → color del tile
fun comfortLevel(state: String?): Level = when (state?.trim()?.lowercase()) {
    null, "" -> Level.NONE
    "ok", "good", "comfort" -> Level.OK
    "regular", "warn", "warning", "medium" -> Level.REGULAR
    else -> Level.ALERT
}

fun comfortLabel(state: String?): String = when (comfortLevel(state)) {
    Level.OK -> "Confortable"
    Level.REGULAR -> "Regular"
    Level.ALERT -> "Incómodo"
    Level.NONE -> "—"
}

// noise_rel va de 0 (silencio) a 1 (muy ruidoso)
fun noiseLabel(rel: Double?): String = when {
    rel == null -> "—"
    rel < 0.35 -> "Bajo"
    rel < 0.65 -> "Medio"
    else -> "Alto"
}

// "2026-11-18T14:00:00Z" → "14:00" en la hora local; si no se puede leer, null
fun timeLabel(iso: String?, zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): String? = try {
    java.time.ZonedDateTime.ofInstant(java.time.Instant.parse(iso), zone)
        .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
} catch (e: Exception) { null }

fun fmt1(v: Double?, unit: String): String = if (v == null) "—" else "%.1f %s".format(java.util.Locale.US, v, unit)
