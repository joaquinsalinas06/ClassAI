package com.classai.mobile

import android.content.Context

// Perfil local del estudiante (privado, sin backup). El token vive aparte en TokenStore.
class ProfileStore(context: Context) {
    private val prefs = context.getSharedPreferences("classai_profile", Context.MODE_PRIVATE)

    val code: String? get() = prefs.getString("code", null)
    val name: String? get() = prefs.getString("name", null)
    val enrolled: Boolean get() = prefs.getBoolean("enrolled", false)
    var server: String
        get() = prefs.getString("server", null) ?: DEFAULT_SERVER
        set(v) = prefs.edit().putString("server", v).apply()

    val hasProfile: Boolean get() = code != null && name != null

    fun save(code: String, name: String, enrolled: Boolean) =
        prefs.edit().putString("code", code).putString("name", name).putBoolean("enrolled", enrolled).apply()

    fun setEnrolled(v: Boolean) = prefs.edit().putBoolean("enrolled", v).apply()

    // Desvincular: borra el perfil, conserva el servidor
    fun clear() = prefs.edit().remove("code").remove("name").remove("enrolled").apply()
}
