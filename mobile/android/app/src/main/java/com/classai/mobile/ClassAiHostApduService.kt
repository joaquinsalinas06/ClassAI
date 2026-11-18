package com.classai.mobile

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

// Corre en el main thread: solo parsea bytes, lee el token local y responde. Nada de red.
class ClassAiHostApduService : HostApduService() {
    private val handler = ApduHandler()

    override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
        val response = handler.process(commandApdu, TokenStore(this).get())
        // GET_CREDENTIAL (INS CA) respondido con 90 00: el lector se llevó el token.
        if (commandApdu.size > 1 && commandApdu[1] == 0xCA.toByte() && response.size >= 2 &&
            response[response.size - 2] == 0x90.toByte() && response.last() == 0.toByte()) {
            CredentialEvents.listener?.invoke()
        }
        return response
    }

    override fun onDeactivated(reason: Int) = handler.reset()
}

// La pantalla abierta se suscribe para refrescar enseguida tras un tap. Main thread.
object CredentialEvents {
    var listener: (() -> Unit)? = null
}
