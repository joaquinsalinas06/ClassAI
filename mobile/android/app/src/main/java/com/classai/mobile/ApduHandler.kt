package com.classai.mobile

// Protocolo APDU HCE v0.1 (docs/contracts.md). Kotlin puro, sin Android, testeable con JUnit.
class ApduHandler {
    // Android solo enruta APDUs a este servicio después de un SELECT de nuestro AID, pero
    // igual exigimos el SELECT: GET_CREDENTIAL sin SELECT previo → 6985 (condiciones no cumplidas).
    private var selected = false

    fun reset() {
        selected = false
    }

    fun process(apdu: ByteArray, token: ByteArray?): ByteArray {
        if (apdu.size < 4) return SW_WRONG_LENGTH
        return when (apdu[1]) {
            INS_SELECT -> select(apdu)
            INS_GET_CREDENTIAL -> getCredential(apdu, token)
            else -> SW_INS_NOT_SUPPORTED
        }
    }

    // 00 A4 04 00 08 <AID> [00]
    private fun select(apdu: ByteArray): ByteArray {
        val lc = if (apdu.size > 4) apdu[4].toInt() and 0xFF else -1
        val wellFormed = apdu[0] == 0x00.toByte() && apdu[2] == 0x04.toByte() && apdu[3] == 0x00.toByte() &&
            lc >= 0 && (apdu.size == 5 + lc || apdu.size == 6 + lc)
        if (!wellFormed) return SW_WRONG_LENGTH
        selected = apdu.copyOfRange(5, 5 + lc).contentEquals(AID)
        return if (selected) SW_OK else SW_UNKNOWN_AID
    }

    // 80 CA 00 00 11 → 01 ‖ token[16] ‖ 90 00
    private fun getCredential(apdu: ByteArray, token: ByteArray?): ByteArray {
        if (!apdu.contentEquals(GET_CREDENTIAL)) return SW_WRONG_LENGTH
        if (!selected || token == null || token.size != TOKEN_LEN) return SW_NO_CREDENTIAL
        return byteArrayOf(PROTOCOL_VERSION) + token + SW_OK
    }

    companion object {
        const val TOKEN_LEN = 16
        const val PROTOCOL_VERSION: Byte = 0x01
        val AID = "F0434C4153534149".hexToBytesOrNull()!!
        val GET_CREDENTIAL = "80CA000011".hexToBytesOrNull()!!
        private const val INS_SELECT: Byte = 0xA4.toByte()
        private const val INS_GET_CREDENTIAL: Byte = 0xCA.toByte()

        val SW_OK = byteArrayOf(0x90.toByte(), 0x00)
        val SW_NO_CREDENTIAL = byteArrayOf(0x69, 0x85.toByte())
        val SW_WRONG_LENGTH = byteArrayOf(0x67, 0x00)
        val SW_INS_NOT_SUPPORTED = byteArrayOf(0x6D, 0x00)
        val SW_UNKNOWN_AID = byteArrayOf(0x6A, 0x82.toByte())
    }
}

fun ByteArray.toHex(): String = joinToString("") { "%02X".format(it) }

fun String.hexToBytesOrNull(): ByteArray? {
    if (length % 2 != 0) return null
    return ByteArray(length / 2) { i -> substring(2 * i, 2 * i + 2).toIntOrNull(16)?.toByte() ?: return null }
}
