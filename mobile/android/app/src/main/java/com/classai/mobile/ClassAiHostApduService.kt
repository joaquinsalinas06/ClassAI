package com.classai.mobile

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log

// Corre en el main thread: solo parsea bytes, lee el token local y responde. Nada de red.
class ClassAiHostApduService : HostApduService() {
    private val handler = ApduHandler()

    override fun processCommandApdu(commandApdu: ByteArray, extras: Bundle?): ByteArray {
        val response = handler.process(commandApdu, TokenStore(this).get())
        // se registra solo INS y SW, nunca el token
        val ins = if (commandApdu.size > 1) "%02X".format(commandApdu[1]) else "--"
        EventLog.add("APDU INS $ins → SW ${response.takeLast(2).toByteArray().toHex()}")
        return response
    }

    override fun onDeactivated(reason: Int) {
        handler.reset()
        EventLog.add(
            when (reason) {
                DEACTIVATION_LINK_LOSS -> "Desactivado: LINK_LOSS (se alejó del lector)"
                DEACTIVATION_DESELECTED -> "Desactivado: DESELECTED (otro AID)"
                else -> "Desactivado: $reason"
            }
        )
    }
}

// Últimos eventos en memoria del proceso. Todo ocurre en el main thread.
object EventLog {
    private val events = ArrayDeque<String>()
    var listener: (() -> Unit)? = null

    fun add(msg: String) {
        Log.i("ClassAI", msg)
        events.addFirst("${java.text.SimpleDateFormat("HH:mm:ss.SSS").format(java.util.Date())}  $msg")
        while (events.size > 20) events.removeLast()
        listener?.invoke()
    }

    fun text(): String = events.joinToString("\n")
}
