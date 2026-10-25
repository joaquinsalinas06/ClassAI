# Bancos y montajes

Fuentes: missions.ts y registros físicos enlazados. Dibujos de referencia, sin validación eléctrica automática. [Resultados y orden](../bancos-fisicos.md).

| Banco | Estado | Archivos |
|---|---|---|
| M-00 · Identificar y conservar | Antes de cualquier carga | [Guía](identidad.md) · [SVG](identidad.svg) |
| M-01 · LED + botón | Diseño y sketch · ensayo físico pendiente | [Guía](led-boton.md) · [SVG](led-boton.svg) · [JSON](led-boton-fisico.json) |
| M-10 · NFC · tarjetas y llavero | HCE y asistencia física comprobados; regularidad RF pendiente | [Guía](nfc.md) · [SVG](nfc.svg) · [JSON](nfc-fisico.json) |
| M-04/05 · DHT11 + PIR | Copia los cables numerados | [Guía](ambiente.md) · [SVG](ambiente.svg) · [JSON](ambiente-fisico.json) |
| M-07B · Audio · una bocina | Copia los cables numerados | [Guía](audio-salida.md) · [SVG](audio-salida.svg) · [JSON](audio-salida-fisico.json) |
| M-02 · Pantalla · mascota | Copia los cables numerados | [Guía](pantalla.md) · [SVG](pantalla.svg) · [JSON](pantalla-fisico.json) |
| M-07A · Micrófono digital | Copia los cables numerados | [Guía](microfono.md) · [SVG](microfono.svg) · [JSON](microfono-fisico.json) |
| M-06 · Sonido relativo · AO | Copia los cables numerados | [Guía](ruido.md) · [SVG](ruido.svg) · [JSON](ruido-fisico.json) |
| M-08A · Matriz 8 × 8 | Copia los cables numerados | [Guía](matriz.md) · [SVG](matriz.svg) · [JSON](matriz-fisico.json) |
| M-08B · Buzzer | Copia los cables numerados | [Guía](buzzer.md) · [SVG](buzzer.svg) · [JSON](buzzer-fisico.json) |
| M-09 · Ventilador + relé | Copia los cables numerados | [Guía](ventilador.md) · [SVG](ventilador.svg) · [JSON](ventilador-fisico.json) |
| M-03 · Transporte y registro | Flujo de software | [Guía](mqtt.md) · [SVG](mqtt.svg) |
| M-04 · DHT11 aislado | Diseño y sketch · ensayo físico pendiente | [Guía](dht11.md) · [SVG](dht11.svg) · [JSON](dht11-fisico.json) |
| M-05 · PIR aislado | Copia los cables numerados | [Guía](pir.md) · [SVG](pir.svg) · [JSON](pir-fisico.json) |
| M-01B · LEDs de estado | Diseño y sketch · ensayo físico pendiente | [Guía](leds.md) · [SVG](leds.svg) · [JSON](leds-fisico.json) |
| M-11 · Iluminación · material pendiente | Sin sensor recibido | [Guía](iluminacion.md) · [SVG](iluminacion.svg) |

Regenerar: `node web/scripts/export-hardware-missions.mjs`. Los JSON físicos son importables en el editor; la colección lógica es otro formato.
