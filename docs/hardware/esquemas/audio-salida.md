# M-07B · Audio · una bocina

MAX98357A con una sola bocina de 4 Ω. Separar los datos I²S de la alimentación y la salida del altavoz.

**Soldadura y fuente pendientes.** Diseño de referencia, sin ensayo físico nuevo.

![Esquema funcional](audio-salida.svg)

Este mapa lógico no acredita posiciones físicas ni autoriza conexiones pendientes.

## Materiales

- D-08: amplificador ×1
- D-09: solo una de las dos bocinas
- Adaptadores/bornera en soldadura; tipo y pinout por revisar
- Fuente 5 V DC adecuada, no inventariada como validada

Cables: Señales por M–H y protoboard; potencia/altavoz por adaptadores; contar tras soldar; 0 H–H. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · GPIO26 | MAX98357A · BCLK | Propuesta I²S aislada | Referencia |
| ESP32 · GPIO25 | MAX98357A · LRC / WS | — | Referencia |
| ESP32 · GPIO22 | MAX98357A · DIN | — | Referencia |
| Fuente 5 V DC · + | MAX98357A · VIN | Fuente y consumo por validar | Pendiente; no conectar |
| Fuente 5 V DC · − | MAX98357A · GND | — | Referencia |
| ESP32 · GND | MAX98357A · GND | — | Referencia |
| MAX98357A · SPK+ | Bocina · + | Solo una bocina | Referencia |
| MAX98357A · SPK− | Bocina · − | No conectar a GND | Referencia |

## Antes de energizar

1. GPIO26/25/22 son propuesta de banco, no configuración integrada ni firmware implementado.
2. Una bocina de 4 Ω entre SPK+ y SPK−; ninguno va a GND. No conectar dos de 4 Ω en paralelo.
3. VIN del amplificador no significa VIN del ESP32: la fuente de carga es independiente y pendiente de validar.
4. GAIN y SD se configuran según el breakout real; no inventar puentes ni dejarlos al azar.
5. Primero tono corto a bajo volumen; no conectar/soldar el altavoz con alimentación.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: Driver/sketch de salida I²S pendiente; no cargar ambient_bench para este banco.

## Prueba guiada y fallos

Acción: MAX98357A con una sola bocina de 4 Ω. Separar los datos I²S de la alimentación y la salida del altavoz.

Aprobación esperada: Tono audible a bajo volumen sin reinicios ni calentamiento anormal; detener si aparece una anomalía. Aún sin ensayo físico.

Diagnóstico: GPIO26 coincide con RST de TFT y relé; GPIO25 con LED y WS de micrófono. Aislar recetas.

Conflictos: GPIO26 coincide con RST de TFT y relé; GPIO25 con LED y WS de micrófono. Aislar recetas.


## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia funcional; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [Adafruit · MAX98357](https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/pinouts)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
