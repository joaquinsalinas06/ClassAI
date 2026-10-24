# M-08B · Buzzer

B-09 tiene polaridad + visible. No dibujar alimentación directa desde GPIO mientras se desconozca el consumo.

**Propuesta, sin ensayo físico. Tipo y corriente pendientes.**

![Esquema de referencia](buzzer.svg)

Mapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.

## Materiales

- B-09: buzzer ×1
- Tipo activo/pasivo, tensión y consumo por identificar
- Etapa de accionamiento/protección por dimensionar si corresponde

Cables: Conteo pendiente del circuito de accionamiento; 0 H–H previsto. No reservar material ya usado en otro banco.

## Conexiones

| Desde | Hasta | Vía / condición | Estado |
|---|---|---|---|
| ESP32 · GPIO17 | Etapa · control | No directo a buzzer | Resolver antes de energizar |
| Etapa · salida | Buzzer · circuito de carga | Circuito por dimensionar | Resolver antes de energizar |
| Fuente adecuada · + | Buzzer · + | Tensión/corriente pendientes | Resolver antes de energizar |
| Etapa · referencia | ESP32 / fuente · GND | Según etapa elegida | Resolver antes de energizar |

## Antes de conectar

1. No asumir buzzer activo ni usar tone() hasta identificarlo.
2. Etapa, retorno de carga, resistencias y protección no están dimensionados: este esquema es funcional, no cableado ejecutable.

Resultado esperado: Un aviso corto y controlado, solo tras cerrar el circuito y consumo.

Firmware: Nodo contempla GPIO17; no habilitarlo sobre el buzzer sin adaptar el hardware.

Conflictos: GPIO17 puede depender del módulo ESP32; no usar referencia WROVER sin revisar.

- [Espressif · ESP32](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf)

[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.
