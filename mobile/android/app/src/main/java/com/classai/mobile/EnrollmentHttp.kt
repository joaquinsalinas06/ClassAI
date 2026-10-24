package com.classai.mobile

import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

// Android supplies JSONObject; only enrollment uses the network, never a tap.
fun postEnroll(server: String, json: String): EnrollOutcome = try {
    val connection = URL("$server/mobile/enroll").openConnection() as HttpURLConnection
    try {
        connection.requestMethod = "POST"
        connection.connectTimeout = 5000
        connection.readTimeout = 5000
        connection.instanceFollowRedirects = false
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        connection.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
        val status = connection.responseCode
        val name = if (status in 200..299) {
            // Only an acknowledged profile for this code can activate the local card.
            val text = connection.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
                val buffer = CharArray(8192)
                val result = StringBuilder()
                while (result.length < 8192) {
                    val count = reader.read(buffer, 0, 8192 - result.length)
                    if (count < 0) break
                    result.append(buffer, 0, count)
                }
                if (reader.read() != -1) return EnrollOutcome.Pending
                result.toString()
            }
            val body = JSONObject(text)
            if (body.optString("status") == "active" && body.optLong("credential_id") > 0 &&
                body.optString("student_code") == JSONObject(json).getString("student_code")) {
                body.optString("full_name")
            } else null
        } else null
        enrollOutcome(status, name)
    } finally {
        connection.disconnect()
    }
} catch (error: IOException) {
    EnrollOutcome.Pending
} catch (error: JSONException) {
    EnrollOutcome.Pending
}
