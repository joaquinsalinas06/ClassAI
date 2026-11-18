package com.classai.mobile

import android.content.Context

// Sesión del alumno en SharedPreferences privadas (sin backup): sigue logueado al reabrir.
class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("classai_session", Context.MODE_PRIVATE)

    val token: String? get() = prefs.getString("token", null)
    val code: String? get() = prefs.getString("code", null)
    val name: String? get() = prefs.getString("name", null)
    val loggedIn: Boolean get() = !token.isNullOrEmpty()

    fun save(token: String, code: String, name: String) =
        prefs.edit().putString("token", token).putString("code", code).putString("name", name).apply()

    fun clear() = prefs.edit().clear().apply()
}
