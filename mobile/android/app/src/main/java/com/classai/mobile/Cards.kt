package com.classai.mobile

// Lógica pura (sin Android) para poder probarla con JUnit.

enum class CardStatus(val label: String, val hint: String) {
    NO_NFC("Sin NFC", "Este teléfono no tiene NFC. Puedes ver el aula y votar."),
    NO_HCE("Sin HCE", "Este teléfono no puede emular tarjetas NFC"),
    NFC_OFF("NFC apagado", "Activa NFC para marcar asistencia"),
    ACTIVE("Activa", "Acerca el teléfono al lector"),
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

// noise_rel va de 0 (silencio) a 1 (muy ruidoso); el objetivo del aula es noise_rel_max (0.1 de fábrica)
fun noiseLabel(rel: Double?, max: Double = 0.1): String = when {
    rel == null -> "—"
    rel <= max -> "Bajo"
    rel <= max + 0.15 -> "Medio"
    else -> "Alto"
}

// "2026-11-18T14:00:00Z" → "14:00" en la hora local; si no se puede leer, null
fun timeLabel(iso: String?, zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): String? = try {
    java.time.ZonedDateTime.ofInstant(java.time.Instant.parse(iso), zone)
        .format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
} catch (e: Exception) { null }

fun fmt1(v: Double?, unit: String): String = if (v == null) "—" else "%.1f %s".format(java.util.Locale.US, v, unit)

/** Ánimo del aula para elegir el Kirby: frío o calor si la temperatura sale del rango, si no según el confort. */
enum class Mood { COLD, OK, HOT }

fun roomMood(m: Metrics?, t: Targets?): Mood {
    val temp = m?.tempC
    if (temp != null) {
        if (temp < (t?.tempLow ?: 21.0)) return Mood.COLD
        if (temp > (t?.tempHigh ?: 24.0)) return Mood.HOT
    }
    return Mood.OK
}

fun voteMood(kind: String?): Mood = when (kind) { "cold" -> Mood.COLD; "hot" -> Mood.HOT; else -> Mood.OK }
fun moodKind(m: Mood): String = when (m) { Mood.COLD -> "cold"; Mood.HOT -> "hot"; Mood.OK -> "ok" }

// "hace 5 min", "hace 1 h 12 min"; null si no se puede leer
fun elapsedLabel(iso: String?, now: java.time.Instant = java.time.Instant.now()): String? = try {
    val min = java.time.Duration.between(java.time.Instant.parse(iso), now).toMinutes().coerceAtLeast(0)
    when {
        min < 1 -> "recién empieza"
        min < 60 -> "hace $min min"
        else -> "hace ${min / 60} h" + if (min % 60 > 0) " ${min % 60} min" else ""
    }
} catch (e: Exception) { null }

/** Cambio de una métrica en los últimos [window] minutos de la tendencia; null con menos de 2 puntos. */
fun trendDelta(points: List<Double?>, window: Int = 5): Double? {
    val v = points.filterNotNull().takeLast(window + 1)
    return if (v.size < 2) null else v.last() - v.first()
}

// noise_rel útil vive cerca del máximo objetivo (0.1, con caída hasta 0.4): escala 0..1 para las barras
fun noiseLevel(rel: Double?, max: Double = 0.1): Float =
    if (rel == null) 0f else (rel / (max + 0.3)).coerceIn(0.0, 1.0).toFloat()

// "18 nov · 09:02" en hora local
fun dayTimeLabel(iso: String?, zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): String? = try {
    java.time.ZonedDateTime.ofInstant(java.time.Instant.parse(iso), zone)
        .format(java.time.format.DateTimeFormatter.ofPattern("d MMM · HH:mm", java.util.Locale.forLanguageTag("es")))
} catch (e: Exception) { null }

fun signed1(v: Double, unit: String = ""): String =
    (if (v >= 0) "+" else "−") + "%.1f".format(java.util.Locale.forLanguageTag("es"), kotlin.math.abs(v)) + unit
