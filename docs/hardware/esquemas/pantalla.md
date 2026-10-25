# M-02 · Pantalla · mascota

Reconstruir el mapa del prototipo existente, dejando NFC, PIR y relé desconectados.

**Revisar VCC / BL.** Diseño de referencia, sin ensayo físico nuevo.

![Esquema funcional](pantalla.svg)

Este mapa lógico no acredita posiciones físicas ni autoriza conexiones pendientes.

## Materiales

- D-04: TFT 1.54 ST7789 ×1
- B-01 o A-04: protoboard
- Cabecera ya visible; revisar conexiones y BL

Cables: Hasta 16 M–H si las ocho redes pasan por protoboard; 0 H–H; BL condicionado. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · GPIO14 | TFT · SCL / SCK | — | Referencia |
| ESP32 · GPIO23 | TFT · SDA / MOSI | — | Referencia |
| ESP32 · GPIO26 | TFT · RST | — | Referencia |
| ESP32 · GPIO27 | TFT · DC | — | Referencia |
| ESP32 · GPIO5 | TFT · CS | — | Referencia |
| ESP32 · GND | TFT · GND | — | Referencia |
| Alimentación TFT · por definir | TFT · VCC | Confirmar breakout D-04 | Pendiente; no conectar |
| Alimentación BL · por definir | TFT · BL | Tensión / límite de corriente | Pendiente; no conectar |

## Antes de energizar

1. SCL/SDA aquí son SPI, no I²C.
2. VCC y BL de D-04 no se validan copiando la ficha de otra pantalla.
3. No conectar BL a un GPIO sin confirmar consumo y adaptación.
4. No compartir GPIO5 con PN532 ni GPIO27 con PIR.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: prototipo/mascota_claude_basica/main.ino existente; no compilado ni cargado en este cambio.

## Prueba guiada y fallos

Acción: Reconstruir el mapa del prototipo existente, dejando NFC, PIR y relé desconectados.

Aprobación esperada: Animación del prototipo estable, orientación correcta y ausencia de reinicios; no demuestra MQTT.

Diagnóstico: 5, 23, 26, 27 y bus SPI se solapan con otras recetas.

Conflictos: 5, 23, 26, 27 y bus SPI se solapan con otras recetas.


## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia funcional; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [Espressif · ESP32](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
