# M-07B · Audio · una bocina

MAX98357A con una sola bocina de 4 Ω. Separar los datos I²S de la alimentación y la salida del altavoz.

**Propuesta, sin ensayo físico. Soldadura y fuente pendientes.**

![Esquema de referencia](audio-salida.svg)

Mapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.

## Materiales

- D-08: amplificador ×1
- D-09: solo una de las dos bocinas
- Adaptadores/bornera en soldadura; tipo y pinout por revisar
- Fuente 5 V DC adecuada, no inventariada como validada

Cables: Señales por M–H y protoboard; potencia/altavoz por adaptadores; contar tras soldar; 0 H–H. No reservar material ya usado en otro banco.

## Conexiones

| Desde | Hasta | Vía / condición | Estado |
|---|---|---|---|
| ESP32 · GPIO26 | MAX98357A · BCLK | Propuesta I²S aislada | Propuesto |
| ESP32 · GPIO25 | MAX98357A · LRC / WS | — | Propuesto |
| ESP32 · GPIO22 | MAX98357A · DIN | — | Propuesto |
| Fuente 5 V DC · + | MAX98357A · VIN | Fuente y consumo por validar | Resolver antes de energizar |
| Fuente 5 V DC · − | MAX98357A · GND | — | Propuesto |
| ESP32 · GND | MAX98357A · GND | — | Propuesto |
| MAX98357A · SPK+ | Bocina · + | Solo una bocina | Propuesto |
| MAX98357A · SPK− | Bocina · − | No conectar a GND | Propuesto |

## Antes de conectar

1. GPIO26/25/22 son propuesta de banco, no configuración integrada ni firmware implementado.
2. Una bocina de 4 Ω entre SPK+ y SPK−; ninguno va a GND. No conectar dos de 4 Ω en paralelo.
3. VIN del amplificador no significa VIN del ESP32: la fuente de carga es independiente y pendiente de validar.
4. GAIN y SD se configuran según el breakout real; no inventar puentes ni dejarlos al azar.
5. Primero tono corto a bajo volumen; no conectar/soldar el altavoz con alimentación.

Resultado esperado: Tono audible a bajo volumen sin reinicios ni calentamiento anormal; detener si aparece una anomalía. Aún sin ensayo físico.

Firmware: Driver/sketch de salida I²S pendiente; no cargar ambient_bench para este banco.

Conflictos: GPIO26 coincide con RST de TFT y relé; GPIO25 con LED y WS de micrófono. Aislar recetas.

- [Adafruit · MAX98357](https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/pinouts)

[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.
