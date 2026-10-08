package com.classai.mobile

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var store: TokenStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = TokenStore(this)
        store.getOrCreate()  // primer arranque: genera el token una sola vez

        findViewById<Button>(R.id.copy).setOnClickListener {
            val cm = getSystemService(ClipboardManager::class.java)
            cm.setPrimaryClip(ClipData.newPlainText("ClassAI token", store.getOrCreate().toHex()))
            Toast.makeText(this, "Token copiado", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.regenerate).setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("¿Regenerar token?")
                .setMessage("El token actual dejará de valer y habrá que enrolar el nuevo.")
                .setPositiveButton("Regenerar") { _, _ ->
                    store.regenerate()
                    EventLog.add("Token regenerado")
                    render()
                }
                .setNegativeButton("Cancelar", null)
                .show()
        }
    }

    override fun onResume() {
        super.onResume()
        EventLog.listener = ::render
        render()  // re-evalúa NFC al volver de Ajustes
    }

    override fun onPause() {
        EventLog.listener = null
        super.onPause()
    }

    private fun render() {
        val adapter = NfcAdapter.getDefaultAdapter(this)
        val hce = packageManager.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
        val enabled = adapter?.isEnabled == true
        val token = store.get()

        findViewById<TextView>(R.id.ready).text = when {
            adapter == null -> "Este teléfono no tiene NFC"
            !hce -> "Este teléfono no soporta HCE"
            !enabled -> "Activa NFC en Ajustes"
            token == null -> "Sin credencial"
            else -> "Listo para acercar al lector"
        }
        findViewById<TextView>(R.id.status).text =
            "NFC disponible: ${yesNo(adapter != null)}\n" +
                "NFC activo: ${yesNo(enabled)}\n" +
                "HCE compatible: ${yesNo(hce)}\n" +
                "Credencial: ${if (token != null) "generada" else "no generada"}\n" +
                "Usar con el teléfono desbloqueado y la pantalla encendida."
        findViewById<TextView>(R.id.token).text = token?.toHex() ?: "—"
        findViewById<TextView>(R.id.events).text = EventLog.text().ifEmpty { "(sin eventos)" }
    }

    private fun yesNo(b: Boolean) = if (b) "sí" else "no"
}
