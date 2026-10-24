# M-08A · Matriz 8 × 8

B-10 parece MAX7219; si se confirma a 5 V, la adaptación de señales se dibuja como requisito.

**Propuesta, sin ensayo físico. Chip y adaptación pendientes.**

![Esquema de referencia](matriz.svg)

Mapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.

## Materiales

- B-10: una matriz ×1
- Chip por confirmar
- Buffer compatible, por ejemplo AHCT: no inventariado
- Fuente 5 V adecuada, pendiente

Cables: No cerrar conteo hasta elegir adaptador y encapsulado; 0 H–H previsto. No reservar material ya usado en otro banco.

## Conexiones

| Desde | Hasta | Vía / condición | Estado |
|---|---|---|---|
| ESP32 · GPIO13 | Adaptador · entrada DIN | GPIO reservado en firmware | Resolver antes de energizar |
| Adaptador · salida DIN | Matriz · DIN | Nivel 5 V compatible | Resolver antes de energizar |
| ESP32 · GPIO14 | Adaptador · entrada CLK | — | Resolver antes de energizar |
| Adaptador · salida CLK | Matriz · CLK | — | Resolver antes de energizar |
| ESP32 · GPIO15 | Adaptador · entrada CS | — | Resolver antes de energizar |
| Adaptador · salida CS | Matriz · CS | — | Resolver antes de energizar |
| Fuente 5 V DC · + | Matriz · VCC | Chip / fuente por validar | Resolver antes de energizar |
| Fuente 5 V DC · + | Adaptador · VCC | Según el buffer elegido | Resolver antes de energizar |
| Matriz / adaptador · GND | Fuente − / ESP32 GND | — | Propuesto |

## Antes de conectar

1. No puentear el adaptador: MAX7219 a 5 V no garantiza HIGH de 3,3 V.
2. Pinout/OE del buffer se define al elegirlo; este bloque no es un circuito de adaptación terminado.
3. Entrada DIN y salida DOUT pertenecen a una sola matriz; DOUT queda libre.

Resultado esperado: Un patrón de baja luminosidad y barrido de LEDs, después de resolver chip, fuente y adaptación.

Firmware: GPIO13/14/15 reservados en comentarios; driver integrado no implementado.

Conflictos: GPIO14 coincide con SCK TFT; GPIO15 afecta arranque y exige revisión.

- [Analog Devices · MAX7219](https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf)

[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.
