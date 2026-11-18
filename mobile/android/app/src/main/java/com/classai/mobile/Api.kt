package com.classai.mobile

import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

data class Student(val code: String, val fullName: String)
data class AuthResult(val token: String, val student: Student)
data class Metrics(val tempC: Double?, val rhPct: Double?, val noiseRel: Double?, val comfort: Double?,
                   val state: String?, val presence: Boolean?)
data class ClassInfo(val id: String, val room: String, val course: String, val startedAt: String,
                     val ended: Boolean, val attended: Boolean, val attendedAt: String?,
                     val myVote: String?, val metrics: Metrics?)

enum class Op { REGISTER, LOGIN, DATA, VOTE }

/** Qué debe hacer la UI además de mostrar el mensaje. */
sealed interface Failure {
    val message: String
    data class Msg(override val message: String) : Failure
    data class SessionExpired(override val message: String = "Tu sesión venció. Inicia sesión de nuevo.") : Failure
    data class AccountExists(override val message: String = "Ese código ya tiene cuenta. Inicia sesión.") : Failure
}

/** status null = sin red. detail = campo "detail" del backend, si vino. */
fun failureFor(op: Op, status: Int?, detail: String? = null): Failure = when {
    status == null -> Failure.Msg("Sin conexión. Revisa tu internet e inténtalo de nuevo.")
    op == Op.REGISTER && status == 409 -> Failure.AccountExists()
    op == Op.LOGIN && status == 401 -> Failure.Msg("Código o contraseña incorrectos.")
    status == 401 -> Failure.SessionExpired()
    op == Op.VOTE && status == 409 -> Failure.Msg("La clase ya terminó, no se puede votar.")
    status == 404 -> Failure.Msg("Esa clase ya no está disponible.")
    status == 422 -> Failure.Msg(detail?.takeIf { it.isNotBlank() && it.length < 120 } ?: "Revisa los datos ingresados.")
    status >= 500 -> Failure.Msg("El servidor no responde. Intenta de nuevo en un momento.")
    else -> Failure.Msg("Algo salió mal. Intenta de nuevo.")
}

sealed interface Result<out T> {
    data class Ok<T>(val value: T) : Result<T>
    data class Err(val failure: Failure) : Result<Nothing>
}

fun parseAuth(json: JSONObject): AuthResult {
    val s = json.getJSONObject("student")
    return AuthResult(json.getString("access_token"), Student(s.getString("code"), s.getString("full_name")))
}

fun parseClass(c: JSONObject): ClassInfo = ClassInfo(
    id = c.getString("id"), room = c.optString("room"), course = c.optString("course"),
    startedAt = c.optString("started_at"), ended = c.optBoolean("ended"),
    attended = c.optBoolean("attended"), attendedAt = c.optStringOrNull("attended_at"),
    myVote = c.optStringOrNull("my_vote"),
    metrics = c.optJSONObject("metrics")?.takeIf { it.length() > 0 }?.let {
        Metrics(it.optDoubleOrNull("temp_c"), it.optDoubleOrNull("rh_pct"), it.optDoubleOrNull("noise_rel"),
            it.optDoubleOrNull("comfort"), it.optStringOrNull("state"),
            if (it.isNull("presence") || !it.has("presence")) null else it.optBoolean("presence"))
    },
)

private fun JSONObject.optStringOrNull(k: String): String? = if (isNull(k)) null else optString(k).ifEmpty { null }
private fun JSONObject.optDoubleOrNull(k: String): Double? = if (isNull(k) || !has(k)) null else optDouble(k).takeUnless { it.isNaN() }

/** Cliente HTTP bloqueante: llamar desde un hilo de fondo. */
class StudentApi(private val base: String, private val token: () -> String?) {
    private class Raw(val status: Int?, val body: JSONObject?)

    private fun call(method: String, path: String, body: JSONObject? = null): Raw = try {
        val c = URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = 8000
            c.readTimeout = 8000
            c.instanceFollowRedirects = false
            c.setRequestProperty("Accept", "application/json")
            token()?.let { c.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = c.responseCode
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            Raw(status, try { JSONObject(text) } catch (e: JSONException) { null })
        } finally {
            c.disconnect()
        }
    } catch (e: IOException) {
        Raw(null, null)
    }

    private fun <T> run(op: Op, method: String, path: String, body: JSONObject? = null, parse: (JSONObject) -> T): Result<T> {
        val r = call(method, path, body)
        if (r.status != null && r.status in 200..299 && r.body != null) {
            try { return Result.Ok(parse(r.body)) } catch (e: JSONException) { /* respuesta rara */ }
            return Result.Err(Failure.Msg("Respuesta inesperada del servidor."))
        }
        return Result.Err(failureFor(op, r.status, r.body?.optString("detail")))
    }

    private fun authBody(code: String, password: String, nfcToken: String?, name: String?) = JSONObject().apply {
        put("code", code.trim()); if (name != null) put("full_name", name.trim()); put("password", password)
        if (nfcToken != null) put("nfc_token", nfcToken)
    }

    fun register(code: String, name: String, password: String, nfcToken: String?) =
        run(Op.REGISTER, "POST", "/student/register", authBody(code, password, nfcToken, name), ::parseAuth)

    fun login(code: String, password: String, nfcToken: String?) =
        run(Op.LOGIN, "POST", "/student/login", authBody(code, password, nfcToken, null), ::parseAuth)

    fun logout() { call("POST", "/student/logout") }

    fun me() = run(Op.DATA, "GET", "/student/me") {
        it.getJSONObject("student").let { s -> Student(s.getString("code"), s.getString("full_name")) }
    }

    fun classes() = run(Op.DATA, "GET", "/student/classes") { j ->
        val a = j.getJSONArray("classes"); List(a.length()) { parseClass(a.getJSONObject(it)) }
    }

    fun classInfo(id: String) = run(Op.DATA, "GET", "/student/classes/$id", parse = ::parseClass)

    fun vote(id: String, kind: String) =
        run(Op.VOTE, "POST", "/student/classes/$id/feedback", JSONObject().put("kind", kind)) { it.getString("kind") }
}
