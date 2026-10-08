package com.classai.mobile

import android.content.Context
import java.security.SecureRandom

// Token opaco de 128 bits en SharedPreferences privadas (HEX). Sin PII.
class TokenStore(context: Context) {
    private val prefs = context.getSharedPreferences("classai", Context.MODE_PRIVATE)

    // null si no existe o está corrupto → el servicio responde 6985 (no enrolado)
    fun get(): ByteArray? =
        prefs.getString(KEY, null)?.hexToBytesOrNull()?.takeIf { it.size == ApduHandler.TOKEN_LEN }

    fun getOrCreate(): ByteArray = get() ?: regenerate()

    // Re-enrolamiento: el token anterior deja de valer y hay que enrolar el nuevo en el backend
    fun regenerate(): ByteArray {
        val token = ByteArray(ApduHandler.TOKEN_LEN).also { SecureRandom().nextBytes(it) }
        prefs.edit().putString(KEY, token.toHex()).commit()
        return token
    }

    private companion object {
        const val KEY = "credential_token"
    }
}
