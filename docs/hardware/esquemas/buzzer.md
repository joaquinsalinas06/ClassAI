# M-08B · Buzzer

B-09 tiene polaridad + visible. No dibujar alimentación directa desde GPIO mientras se desconozca el consumo.

**Montaje condicionado · revisar pendientes.** Diseño de referencia, sin ensayo físico nuevo.

![Distribución física de referencia](buzzer.svg)

[JSON de montaje importable](buzzer-fisico.json) · [SVG físico](buzzer-fisico.svg). ESP32 USB abajo; orientación de referencia, cotejar serigrafía. Terminales rotulados por función donde el conector aún no está identificado.

## Materiales

- B-09: buzzer ×1
- Tipo activo/pasivo, tensión y consumo por identificar
- Etapa de accionamiento/protección por dimensionar si corresponde

Cables: 0 M–H + 0 M–M dibujados; cero H–H. Circuito incompleto; conteo final pendiente de etapa/fuente. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · GPIO17 | Etapa · control | No directo a buzzer | Pendiente; no conectar |
| Etapa · salida | Buzzer · circuito de carga | Circuito por dimensionar | Pendiente; no conectar |
| Fuente adecuada · + | Buzzer · + | Tensión/corriente pendientes | Pendiente; no conectar |
| Etapa · referencia | ESP32 / fuente · GND | Según etapa elegida | Pendiente; no conectar |

## Armado cable por cable · USB desconectado

Referencia física, sin escala métrica. USB desconectado al armar. Usar A-01 solo tras identificar placa/puerto y preservar respaldo; B-02/NFC permanece conservado. Cables reutilizados entre ensayos; cero H–H.

| Nº | Color | Tipo | Origen | Destino | Condición |
|---|---|---|---|---|---|


Sin cableado ejecutable: faltan datos del circuito. Consultar conexiones funcionales y faltantes; no suplir etapas de adaptación con cables.

LP/LN: riel izquierdo +/−; RP/RN: derecho +/−. A–E y F–J son tiras separadas por fila. Confirmar continuidad/cortes de la protoboard real; los rieles opuestos no están unidos. Patas colocadas: módulos externos, conectores por verificar.

Cruces no unen redes. Las líneas discontinuas están pendientes y no cuentan como continuidad confirmada. Colores son identificadores del dibujo: elegir cables reales y anotar equivalencias. SVG no demuestra alcance físico.

## Antes de energizar

1. No asumir buzzer activo ni usar tone() hasta identificarlo.
2. Etapa, retorno de carga, resistencias y protección no están dimensionados: este esquema es funcional, no cableado ejecutable.
3. Identificar A-01/puerto y preservar respaldo privado antes de cargar.
4. Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
5. Faltan tensión, consumo, tipo y etapa de accionamiento/protección.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: Nodo contempla GPIO17; no habilitarlo sobre el buzzer sin adaptar el hardware.

## Prueba guiada y fallos

Acción: Identificar modelo y tipo antes de elegir driver.

Aprobación esperada: Aviso breve y parada pendientes de circuito dimensionado.

Diagnóstico: No aplicar tone ni tensión por ensayo/error.

Conflictos: GPIO17 puede depender del módulo ESP32; no usar referencia WROVER sin revisar.

Faltantes/confirmaciones:
- Identificar A-01/puerto y preservar respaldo privado antes de cargar.
- Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
- Faltan tensión, consumo, tipo y etapa de accionamiento/protección.

## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia física; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [Espressif · ESP32](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
