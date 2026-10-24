# M-01 · LED + botón

Banco mínimo para comprobar un GPIO de salida y una pulsación, sin cargas de potencia.

**Propuesta, sin ensayo físico. Preparar mientras sueldan.**

![Esquema de referencia](led-boton.svg)

Mapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.

## Materiales

- C-05: LED rojo ×1
- C-01: resistencia 1 kΩ ×1
- C-04: pulsador ×1
- B-01 o A-04: protoboard

Cables: Referencia: 3 M–H + 2 M–M; patas en protoboard; 0 H–H. No reservar material ya usado en otro banco.

## Conexiones

| Desde | Hasta | Vía / condición | Estado |
|---|---|---|---|
| ESP32 · GPIO25 | LED · ánodo (+) | R1 · 1 kΩ en serie | Propuesto |
| LED · cátodo (−) | ESP32 · GND | — | Propuesto |
| ESP32 · GPIO32 | Pulsador · contacto A | INPUT_PULLUP | Propuesto |
| Pulsador · contacto B | ESP32 · GND | — | Propuesto |

## Antes de conectar

1. Identificar ánodo/cátodo y bandas de la resistencia; no omitir R1.
2. Las cuatro patas del botón forman dos parejas; conectar contactos de parejas distintas.
3. Montar apagado. Elegir placa/puerto y conservar respaldo antes de cargar.

Resultado esperado: Una pulsación produce un cambio del LED; mantener pulsado no genera cambios repetidos.

Firmware: Banco mínimo led_button_bench preparado; no usar el nodo integrado con actuadores.

Conflictos: GPIO25 se propone también para WS de audio: ensayos aislados.

- [Espressif · ESP32](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf)

[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.
