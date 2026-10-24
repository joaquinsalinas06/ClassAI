# M-02 · Pantalla · mascota

Reconstruir el mapa del prototipo existente, dejando NFC, PIR y relé desconectados.

**Propuesta, sin ensayo físico. Revisar VCC / BL.**

![Esquema de referencia](pantalla.svg)

Mapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.

## Materiales

- D-04: TFT 1.54 ST7789 ×1
- B-01 o A-04: protoboard
- Cabecera ya visible; revisar conexiones y BL

Cables: Hasta 16 M–H si las ocho redes pasan por protoboard; 0 H–H; BL condicionado. No reservar material ya usado en otro banco.

## Conexiones

| Desde | Hasta | Vía / condición | Estado |
|---|---|---|---|
| ESP32 · GPIO14 | TFT · SCL / SCK | — | Propuesto |
| ESP32 · GPIO23 | TFT · SDA / MOSI | — | Propuesto |
| ESP32 · GPIO26 | TFT · RST | — | Propuesto |
| ESP32 · GPIO27 | TFT · DC | — | Propuesto |
| ESP32 · GPIO5 | TFT · CS | — | Propuesto |
| ESP32 · GND | TFT · GND | — | Propuesto |
| Alimentación TFT · por definir | TFT · VCC | Confirmar breakout D-04 | Resolver antes de energizar |
| Alimentación BL · por definir | TFT · BL | Tensión / límite de corriente | Resolver antes de energizar |

## Antes de conectar

1. SCL/SDA aquí son SPI, no I²C.
2. VCC y BL de D-04 no se validan copiando la ficha de otra pantalla.
3. No conectar BL a un GPIO sin confirmar consumo y adaptación.
4. No compartir GPIO5 con PN532 ni GPIO27 con PIR.

Resultado esperado: Animación del prototipo estable, orientación correcta y ausencia de reinicios; no demuestra MQTT.

Firmware: prototipo/mascota_claude_basica/main.ino existente; no compilado ni cargado en este cambio.

Conflictos: 5, 23, 26, 27 y bus SPI se solapan con otras recetas.

- [Espressif · ESP32](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf)

[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.
