# M-08A · Matriz 8 × 8

Serial 115200: arm, happy, sad, angry; cada cara dura 5 s, stop apaga y desarma. Vista frontal/cables de entrada a la izquierda: rotate0. Si se cambia el montaje sin alimentación: cables abajo rotate90, derecha rotate180, arriba rotate270; enviar giro antes de la cara. pattern y scan se conservan como diagnóstico sin giro.

**Ensayado · caras 8 × 8 verificadas.** Ensayo físico del 26/10/2026; conservar los pendientes de calidad y medición.

![Distribución física de referencia](matriz.svg)

[JSON de montaje importable](matriz-fisico.json) · [SVG físico](matriz-fisico.svg). ESP32 USB abajo; orientación de referencia, cotejar serigrafía. Terminales rotulados por función donde el conector aún no está identificado.

## Resultado físico observado · 26/10/2026

Joaquín confirmó las caras feliz, triste y enojada en B-10 con A-01 (Adrián). Vista frontal: cara derecha y cabecera de entrada/cables a la izquierda = giro 0°. VIN por USB, GND común, DIN13/CLK14/CS27 mediante protoboard; DOUT libre. Dos secuencias Serial de 5 s por cara y stop final confirmados.

**Pendiente:** La conexión directa de 3,3 V funcionó en esta unidad; no garantiza el HIGH especificado del MAX7219 a 5 V. Alimentación USB/VIN sin medir; integración con confort y otros periféricos pendiente. Los giros nuevos se verifican en host; el firmware cargado en este ensayo usa orientación 0°.

[Registro R-050–R-052](../montajes.md).

## Materiales

- esp1: A-01 · ESP32 de Adrián · identificado y ensayado 26/10/2026
- matrix1: B-10 · matriz 8×8

Cables: 9 M–H + 1 M–M dibujados; cero H–H. 1 tramos de potencia por bornera. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Ensayo con A-01 de Adrián; preservar su respaldo propio y el de B-02 por separado.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · GND_L | Protoboard · RN21 | c1 · M–H | Referencia |
| ESP32 · VIN | Protoboard · LP26 | c2 · potencia | Referencia |
| Protoboard · LP12 | Matriz · VCC | c3 · M–H | Referencia |
| Protoboard · LN11 | Matriz · GND | c4 · M–H | Referencia |
| Protoboard · LN30 | Protoboard · RN30 | c5 · M–M | Referencia |
| ESP32 · GPIO13 | Protoboard · J9 | c6 · M–H | Referencia |
| Protoboard · H9 | Matriz · DIN | c7 · M–H | Referencia |
| ESP32 · GPIO14 | Protoboard · J5 | c8 · M–H | Referencia |
| Protoboard · H5 | Matriz · CLK | c9 · M–H | Referencia |
| ESP32 · GPIO27 | Protoboard · J7 | c10 · M–H | Referencia |
| Protoboard · H7 | Matriz · CS | c11 · M–H | Referencia |

## Armado cable por cable · USB desconectado

Ensayo A-01/B-10 del 26/10/2026. Vista frontal: cara derecha con cabecera de entrada/cables a la izquierda (giro 0°). Esta referencia de píxeles es independiente de la distribución del dibujo. Desconectar USB antes de mover módulos o cables. Respaldo propio de A-01 verificado; B-02 es la otra identidad, no el mismo respaldo. Referencia física, sin escala métrica. USB desconectado al armar. Reidentificar A-01 y su puerto antes de otra carga; preservar ambos respaldos privados. Cables reutilizados entre ensayos; cero H–H.

| Nº | Color | Tipo | Origen | Destino | Condición |
|---|---|---|---|---|---|
| 1 | black | M–H | esp1:GND_L | bb:RN21 | Cable 1 · M–H · esp1:GND_L → bb:RN21. Conectar sin USB; comprobar etiquetas y agujeros. |
| 2 | orange | potencia | esp1:VIN | bb:LP26 | Cable 2 · potencia DC por bornes · esp1:VIN → bb:LP26. Conectar sin USB; comprobar etiquetas y agujeros. |
| 3 | orange | M–H | bb:LP12 | matrix1:VCC | Cable 3 · M–H · bb:LP12 → matrix1:VCC. Conectar sin USB; comprobar etiquetas y agujeros. |
| 4 | black | M–H | bb:LN11 | matrix1:GND | Cable 4 · M–H · bb:LN11 → matrix1:GND. Conectar sin USB; comprobar etiquetas y agujeros. |
| 5 | black | M–M | bb:LN30 | bb:RN30 | Cable 5 · M–M · bb:LN30 → bb:RN30. Conectar sin USB; comprobar etiquetas y agujeros. |
| 6 | green | M–H | esp1:GPIO13 | bb:J9 | Cable 6 · M–H · esp1:GPIO13 → bb:J9. Conectar sin USB; comprobar etiquetas y agujeros. |
| 7 | green | M–H | bb:H9 | matrix1:DIN | Cable 7 · M–H · bb:H9 → matrix1:DIN. Conectar sin USB; comprobar etiquetas y agujeros. |
| 8 | blue | M–H | esp1:GPIO14 | bb:J5 | Cable 8 · M–H · esp1:GPIO14 → bb:J5. Conectar sin USB; comprobar etiquetas y agujeros. |
| 9 | blue | M–H | bb:H5 | matrix1:CLK | Cable 9 · M–H · bb:H5 → matrix1:CLK. Conectar sin USB; comprobar etiquetas y agujeros. |
| 10 | yellow | M–H | esp1:GPIO27 | bb:J7 | Cable 10 · M–H · esp1:GPIO27 → bb:J7. Conectar sin USB; comprobar etiquetas y agujeros. |
| 11 | yellow | M–H | bb:H7 | matrix1:CS | Cable 11 · M–H · bb:H7 → matrix1:CS. Conectar sin USB; comprobar etiquetas y agujeros. |

M–H: hembra al conector macho del módulo/ESP32 y macho al agujero. M–M: ambos extremos en agujeros distintos. Nunca dos puntas en un agujero.

LP/LN: riel izquierdo +/−; RP/RN: derecho +/−. A–E y F–J son tiras separadas por fila. Confirmar continuidad/cortes de la protoboard real; los rieles opuestos no están unidos. Patas colocadas: módulos externos, conectores por verificar.

Cruces no unen redes. Las condiciones de cada tramo aparecen en esta tabla; un cable por verificar no cuenta como continuidad confirmada aunque se dibuje continuo. Colores son identificadores del dibujo: elegir cables reales y anotar equivalencias. SVG no demuestra alcance físico.

## Compatibilidad eléctrica

[Montaje alternativo con adaptación](matriz-adaptado.md). No se muestra como material obligatorio del montaje principal; usarlo si los niveles o la carga exigen esa etapa.

## Antes de energizar

1. A-01 identificada y respaldo propio verificado en el ensayo; reidentificar placa/puerto antes de cargar otra vez.
2. UTEC Anexo K: VCC a 5 V, GND común, DIN GPIO13, CLK GPIO14 y CS GPIO27 en este firmware.
3. Cotejar la cabecera IN/DIN de la matriz; la cabecera OUT/DOUT es para cascada y no recibe el cable de datos.
4. Orientación observada desde delante: cables de ENTRADA a la izquierda con la cara derecha. Giro de imagen: izquierda rotate0, abajo rotate90, derecha rotate180, arriba rotate270. Desconectar alimentación antes de mover el módulo; después arm, giro y cara.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: firmware/matrix_bench; compilar sin carga; Serial 115200. Ver guía física.

## Compilar y cargar manualmente

Arduino CLI 1.5.1, ESP32 core 3.3.12; DHT sensor library 1.4.7 y Adafruit Unified Sensor 1.1.15 solo si el perfil utiliza DHT11. Actuadores usan ClassAIBench local y pantalla Adafruit GFX 1.12.6 + ST7735/ST7789 1.12.0.

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-matriz-build firmware/matrix_bench
```

Antes de cargar: reidentificar la placa elegida y su puerto explícito, comprobar su FQBN, registrar cableado real y conservar respaldo privado verificado. Desconectar módulos ajenos y cerrar cualquier monitor. Solo después de resolver TODOS los pendientes eléctricos de esta receta:

```sh
# Sustituir PUERTO_VERIFICADO por el puerto reidentificado; no copiar un puerto histórico sin identificar la placa.
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_VERIFICADO --input-dir /tmp/classai-matriz-build firmware/matrix_bench
arduino-cli monitor --port PUERTO_VERIFICADO --config baudrate=115200
```

Cargar utiliza el binario del perfil recién compilado; no recompilar otro perfil entre compile/upload. Abrir Serial puede reiniciar la placa. El ensayo registrado puede utilizar otro perfil o una variante privada; no confundirlo con este comando de compilación.

## Prueba guiada y fallos

Acción: Serial 115200: arm, happy, sad, angry; cada cara dura 5 s, stop apaga y desarma. Vista frontal/cables de entrada a la izquierda: rotate0. Si se cambia el montaje sin alimentación: cables abajo rotate90, derecha rotate180, arriba rotate270; enviar giro antes de la cara. pattern y scan se conservan como diagnóstico sin giro.

Aprobación esperada: Tres caras distinguibles a intensidad mínima; apagado tras 5 s o stop. Ensayo visual confirmado por Joaquín; integración con confort pendiente.

Diagnóstico: Enviar stop ante un fallo. Desconectar ambas fuentes antes de revisar cada extremo, polaridad, masa común y material faltante; no cambiar pines en caliente.

Conflictos: Ensayo aislado DIN13/CLK14/CS27; sin PIR/TFT. La conexión directa observada no certifica compatibilidad 3,3→5 V; conservar alternativa AHCT. La orientación física del visor no certifica el mapeo de píxeles de otra unidad.

Faltantes/confirmaciones:
- A-01 identificada y respaldo propio verificado en el ensayo; reidentificar placa/puerto antes de cargar otra vez.
- UTEC Anexo K: VCC a 5 V, GND común, DIN GPIO13, CLK GPIO14 y CS GPIO27 en este firmware.
- Cotejar la cabecera IN/DIN de la matriz; la cabecera OUT/DOUT es para cascada y no recibe el cable de datos.

## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia física; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico | Joaquín confirmó las caras feliz, triste y enojada en B-10 con A-01 (Adrián). Vista frontal: cara derecha y cabecera de entrada/cables a la izquierda = giro 0°. VIN por USB, GND común, DIN13/CLK14/CS27 mediante protoboard; DOUT libre. Dos secuencias Serial de 5 s por cara y stop final confirmados. | [R-050–R-052](../montajes.md) |
| Pendientes del ensayo | La conexión directa de 3,3 V funcionó en esta unidad; no garantiza el HIGH especificado del MAX7219 a 5 V. Alimentación USB/VIN sin medir; integración con confort y otros periféricos pendiente. Los giros nuevos se verifican en host; el firmware cargado en este ensayo usa orientación 0°. | No equivale a validación completa |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [Analog Devices · MAX7219](https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf)
- [Material de la U y criterios de armado](https://github.com/joaquinsalinas06/ClassAI/blob/codex/physical-benches/docs/hardware/circuitos-referencia.md)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
