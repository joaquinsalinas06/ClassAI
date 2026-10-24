# M-10 · NFC · tarjetas y llavero

Primer banco tras terminar la cabecera PN532: detectar versión y leer tarjeta/llavero antes de Android HCE.

**Propuesta, sin ensayo físico. Soldadura en curso.**

![Esquema de referencia](nfc.svg)

Mapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.

## Materiales

- D-01: PN532 V3 ×1
- D-02: tarjeta ×1
- D-03: llavero ×1
- D-11: cabecera, soldadura en curso; contar
- B-01 o A-04: protoboard

Cables: Con cabecera macho: 12 M–H; con hembra: 6 M–H + 6 M–M. Seis redes por protoboard, 0 H–H. No reservar material ya usado en otro banco.

## Conexiones

| Desde | Hasta | Vía / condición | Estado |
|---|---|---|---|
| ESP32 · 3V3 | PN532 · VCC | A2 / B2 · 3,3 V | Propuesto |
| ESP32 · GND | PN532 · GND | A4 / B4 | Propuesto |
| ESP32 · GPIO18 | PN532 · SCK | A6 / B6 | Propuesto |
| PN532 · MISO | ESP32 · GPIO19 | A8 / B8 | Propuesto |
| ESP32 · GPIO23 | PN532 · MOSI | A10 / B10 | Propuesto |
| ESP32 · GPIO5 | PN532 · SS | A12 / B12 | Propuesto |

## Antes de conectar

1. DIP SPI, sin alimentación: canal 1 OFF / canal 2 ON; leer números, no copiar dirección de la foto.
2. Revisar soldadura: sin puentes, pines firmes y antena despejada. Confirmar cabecera macho/hembra para elegir M–H/M–M. IRQ/RSTO quedan sin conectar.
3. Parejas A2/B2, A4/B4, A6/B6, A8/B8, A10/B10 y A12/B12: cada A/B comparte tira; nunca unir A con F ni redes distintas. Cada punta ocupa su agujero.
4. Primer ensayo sin pantalla ni actuadores. No imprimir ni publicar tokens/UID completos.

Resultado esperado: PN532 responde con versión; 20 detecciones con retirada entre lecturas. Después probar Android HCE por separado.

Firmware: firmware/nfc_bench: sketch aislado de versión/detecciones, sin publicar UID. No prueba HCE ni asistencia integrada.

Conflictos: TFT comparte GPIO5/23 y usa otro SCK; no conectar ambas recetas como si fueran compatibles.

- [Elechouse · PN532 V3](https://www.elechouse.com/elechouse/images/product/PN532_module_V3/PN532_%20Manual_V3.pdf)

[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.
