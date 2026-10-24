package com.classai.mobile

import android.content.Context

// Perfil local del estudiante (privado, sin backup). El token vive aparte en TokenStore.
class ProfileStore(context: Context) {
    private val prefs = context.getSharedPreferences("classai_profile", Context.MODE_PRIVATE)

    init {
        // APK updates can change the server; keep the token and revalidate the saved code.
        if (prefs.getString("server", null) != BuildConfig.CLASSAI_API_URL) {
            prefs.edit().putString("server", BuildConfig.CLASSAI_API_URL).putBoolean("enrolled", false).apply()
        }
    }

    val code: String? get() = prefs.getString("code", null)
    val name: String? get() = prefs.getString("name", null)
    val enrolled: Boolean get() = prefs.getBoolean("enrolled", false)
    val hasProfile: Boolean get() = !code.isNullOrBlank()

    fun save(code: String, name: String, enrolled: Boolean) =
        prefs.edit().putString("code", code).putString("name", name).putBoolean("enrolled", enrolled).apply()

    // Cambiar estudiante no conserva una vinculación anterior.
    fun clear() = prefs.edit().remove("code").remove("name").remove("enrolled").remove("server").apply()
}
