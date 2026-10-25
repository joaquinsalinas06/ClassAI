# M-08A · Matriz 8 × 8

B-10 parece MAX7219; si se confirma a 5 V, la adaptación de señales se dibuja como requisito.

**Montaje condicionado · revisar pendientes.** Diseño de referencia, sin ensayo físico nuevo.

![Distribución física de referencia](matriz.svg)

[JSON de montaje importable](matriz-fisico.json) · [SVG físico](matriz-fisico.svg). ESP32 USB abajo; orientación de referencia, cotejar serigrafía. Terminales rotulados por función donde el conector aún no está identificado.

## Materiales

- B-10: una matriz ×1
- Chip por confirmar
- Buffer compatible, por ejemplo AHCT: no inventariado
- Fuente 5 V adecuada, pendiente

Cables: 0 M–H + 0 M–M dibujados; cero H–H. Circuito incompleto; conteo final pendiente de etapa/fuente. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · GPIO13 | Adaptador · entrada DIN | GPIO reservado en firmware | Pendiente; no conectar |
| Adaptador · salida DIN | Matriz · DIN | Nivel 5 V compatible | Pendiente; no conectar |
| ESP32 · GPIO14 | Adaptador · entrada CLK | — | Pendiente; no conectar |
| Adaptador · salida CLK | Matriz · CLK | — | Pendiente; no conectar |
| ESP32 · GPIO15 | Adaptador · entrada CS | — | Pendiente; no conectar |
| Adaptador · salida CS | Matriz · CS | — | Pendiente; no conectar |
| Fuente 5 V DC · + | Matriz · VCC | Chip / fuente por validar | Pendiente; no conectar |
| Fuente 5 V DC · + | Adaptador · VCC | Según el buffer elegido | Pendiente; no conectar |
| Matriz / adaptador · GND | Fuente − / ESP32 GND | — | Referencia |

## Armado cable por cable · USB desconectado

Referencia física, sin escala métrica. USB desconectado al armar. Usar A-01 solo tras identificar placa/puerto y preservar respaldo; B-02/NFC permanece conservado. Cables reutilizados entre ensayos; cero H–H.

| Nº | Color | Tipo | Origen | Destino | Condición |
|---|---|---|---|---|---|


Sin cableado ejecutable: faltan datos del circuito. Consultar conexiones funcionales y faltantes; no suplir etapas de adaptación con cables.

LP/LN: riel izquierdo +/−; RP/RN: derecho +/−. A–E y F–J son tiras separadas por fila. Confirmar continuidad/cortes de la protoboard real; los rieles opuestos no están unidos. Patas colocadas: módulos externos, conectores por verificar.

Cruces no unen redes. Las líneas discontinuas están pendientes y no cuentan como continuidad confirmada. Colores son identificadores del dibujo: elegir cables reales y anotar equivalencias. SVG no demuestra alcance físico.

## Antes de energizar

1. No puentear el adaptador: MAX7219 a 5 V no garantiza HIGH de 3,3 V.
2. Pinout/OE del buffer se define al elegirlo; este bloque no es un circuito de adaptación terminado.
3. Entrada DIN y salida DOUT pertenecen a una sola matriz; DOUT queda libre.
4. Identificar A-01/puerto y preservar respaldo privado antes de cargar.
5. Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
6. Leer controlador; faltan buffer compatible con pinout y desacoplo, fuente 5 V dimensionada y cables de potencia.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: GPIO13/14/15 reservados en comentarios; driver integrado no implementado.

## Prueba guiada y fallos

Acción: Identificar chip y preparar adaptación/fuente antes del barrido.

Aprobación esperada: Patrón de baja intensidad pendiente; no se energiza con este diseño incompleto.

Diagnóstico: No omitir adaptación para intentar hacerlo funcionar.

Conflictos: GPIO14 coincide con SCK TFT; GPIO15 afecta arranque y exige revisión.

Faltantes/confirmaciones:
- Identificar A-01/puerto y preservar respaldo privado antes de cargar.
- Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
- Leer controlador; faltan buffer compatible con pinout y desacoplo, fuente 5 V dimensionada y cables de potencia.

## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia física; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [Analog Devices · MAX7219](https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
