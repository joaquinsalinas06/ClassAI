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
        val sw = response.takeLast(2).toByteArray().toHex()
        if (ins == "CA" && sw == "9000") EventLog.credentialRead() else EventLog.add("APDU INS $ins → SW $sw")
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

// Eventos en memoria del proceso; la Activity se suscribe con listener. Todo en el main thread.
object EventLog {
    data class Entry(val time: Long, val text: String, val read: Boolean)

    private val entries = ArrayDeque<Entry>()
    var listener: ((Entry) -> Unit)? = null

    fun credentialRead() = add("GET_CREDENTIAL → 9000 (lector leyó la credencial)", read = true)

    fun add(msg: String, read: Boolean = false) {
        Log.i("ClassAI", msg)
        val e = Entry(System.currentTimeMillis(), msg, read)
        entries.addFirst(e)
        while (entries.size > 40) entries.removeLast()
        listener?.invoke(e)
    }

    // al desvincular: las lecturas eran de la credencial anterior
    fun clear() = entries.clear()

    fun reads(): List<Entry> = entries.filter { it.read }

    fun text(): String {
        val f = java.text.SimpleDateFormat("HH:mm:ss.SSS", java.util.Locale.getDefault())
        return entries.joinToString("\n") { "${f.format(java.util.Date(it.time))}  ${it.text}" }
    }
}
