# M-04/05 · DHT11 + PIR

Conservar el banco ya dibujado: temperatura/humedad y movimiento, sin hembra–hembra.

**Propuesta, sin ensayo físico. Guía física disponible.**

![Esquema de referencia](ambiente.svg)

Mapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.

## Materiales

- B-03: DHT11 ×1
- B-04 o D-06: un PIR
- C-02: resistencia 10 kΩ ×1
- B-01 o A-04: protoboard

Cables: 11 M–H + 1 M–M; 0 H–H, según guía física. No reservar material ya usado en otro banco.

## Conexiones

| Desde | Hasta | Vía / condición | Estado |
|---|---|---|---|
| ESP32 · 3V3 | DHT11 · + | 3,3 V | Resolver antes de energizar |
| DHT11 · − | ESP32 · GND | — | Propuesto |
| DHT11 · OUT | ESP32 · GPIO4 | — | Propuesto |
| DHT11 · OUT | ESP32 · 3V3 | R1 · 10 kΩ, pull-up | Propuesto |
| ESP32 · VIN | PIR · VCC | Ruta USB y tensión pendientes | Resolver antes de energizar |
| PIR · GND | ESP32 · GND | — | Propuesto |
| PIR · OUT | ESP32 · GPIO27 | Orden y nivel pendientes | Resolver antes de energizar |

## Antes de conectar

1. Distribución física de ambiente: VCC PIR en F20/H20 y OUT en G24/J24; no confundir tiras.
2. Etiquetas del PIR no legibles en fotos: no inferir orden por lente o jumper amarillo.
3. DHT11 + a 3,3 V según propuesta; confirmar variante y pull-up incorporado. No subir a 5 V por ensayo/error.
4. VIN no es salida regulada garantizada; mantener esa alimentación pendiente hasta resolver la variante.

Resultado esperado: 20 lecturas DHT11, fallo explícito sin convertirlo en cero; PIR activa, vuelve a LOW y puede reactivar.

Firmware: firmware/ambient_bench compilado, no cargado. Wokwi usa DHT22 sustituto y no valida B-03 real.

Conflictos: PIR GPIO27 entra en conflicto con DC de la TFT.

- [Adafruit · DHT y pull-up](https://learn.adafruit.com/dht/connecting-to-a-dhtxx-sensor)
- [Joy-IT · HC-SR501](https://joy-it.net/en/products/SEN-HC-SR501)

[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.
