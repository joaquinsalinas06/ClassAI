# Esquemas por banco

Referencias generadas desde web/src/hardware/missions.ts. No prueban un montaje real ni autorizan energizar conexiones pendientes. Conservan IDs de inventario, fuentes, GPIO, condiciones y conflictos. Ver [orden y reparto de dos placas](../siguientes-bancos.md). Las guías físicas de [ambiente](../banco-ambiente.md) y [NFC](../banco-nfc.md) incluyen diagramas con agujeros.

| Banco | Grupo | Estado | Archivos |
|---|---|---|---|
| M-00 · Identificar y conservar | Preparación | Antes de cualquier carga | [Guía](identidad.md) · [SVG](identidad.svg) |
| M-01 · LED + botón | Preparación | Preparar mientras sueldan | [Guía](led-boton.md) · [SVG](led-boton.svg) |
| M-10 · NFC · tarjetas y llavero | NFC / sesión | Soldadura en curso | [Guía](nfc.md) · [SVG](nfc.svg) |
| M-04/05 · DHT11 + PIR | Ambiente / actuación | Guía física disponible | [Guía](ambiente.md) · [SVG](ambiente.svg) |
| M-07B · Audio · una bocina | Interfaz / audio | Soldadura y fuente pendientes | [Guía](audio-salida.md) · [SVG](audio-salida.svg) |
| M-02 · Pantalla · mascota | Interfaz / audio | Revisar VCC / BL | [Guía](pantalla.md) · [SVG](pantalla.svg) |
| M-07A · Micrófono digital | Interfaz / audio | Propuesta de banco I²S | [Guía](microfono.md) · [SVG](microfono.svg) |
| M-06 · Sonido relativo · AO | Ambiente / actuación | Niveles pendientes | [Guía](ruido.md) · [SVG](ruido.svg) |
| M-08A · Matriz 8 × 8 | Interfaz / audio | Chip y adaptación pendientes | [Guía](matriz.md) · [SVG](matriz.svg) |
| M-08B · Buzzer | Interfaz / audio | Tipo y corriente pendientes | [Guía](buzzer.md) · [SVG](buzzer.svg) |
| M-09 · Ventilador + relé | Ambiente / actuación | Potencia bloqueada | [Guía](ventilador.md) · [SVG](ventilador.svg) |
| M-03 · Transporte y registro | Preparación | Flujo de software | [Guía](mqtt.md) · [SVG](mqtt.svg) |

Regenerar desde la raíz: `node web/scripts/export-hardware-missions.mjs`. Los diagramas son mapas lógicos por nombres, no modelos físicos de cada variante. La biblioteca en /montajes permite recorrer conexiones y exportar SVG/JSON; no modifica los guardados del editor de ambiente.
