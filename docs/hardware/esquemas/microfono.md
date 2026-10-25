# M-07A · Micrófono digital

INMP441 captura audio digital. Se prueba separado del amplificador y del sensor de sonido analógico.

**Montaje parcial · no conectar cables marcados.** Diseño de referencia, sin ensayo físico nuevo.

![Distribución física de referencia](microfono.svg)

[JSON de montaje importable](microfono-fisico.json) · [SVG físico](microfono-fisico.svg). ESP32 USB abajo; orientación de referencia, cotejar serigrafía. Terminales rotulados por función donde el conector aún no está identificado.

## Materiales

- D-07: INMP441 ×1
- Cabecera y etiquetas reales por revisar
- B-01 o A-04: protoboard

Cables: 11 M–H + 0 M–M dibujados; cero H–H. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · 3V3 | INMP441 · VDD / VCC | 3,3 V | Referencia |
| ESP32 · GND | INMP441 · GND | — | Referencia |
| ESP32 · GPIO26 | INMP441 · SCK / BCLK | Propuesta aislada | Referencia |
| ESP32 · GPIO25 | INMP441 · WS | — | Referencia |
| INMP441 · SD | ESP32 · GPIO33 | — | Referencia |
| INMP441 · L/R | ESP32 · GND | Canal izquierdo; no flotante | Referencia |

## Armado cable por cable · USB desconectado

Referencia física, sin escala métrica. USB desconectado al armar. Usar A-01 solo tras identificar placa/puerto y preservar respaldo; B-02/NFC permanece conservado. Cables reutilizados entre ensayos; cero H–H.

| Nº | Color | Tipo | Origen | Destino | Condición |
|---|---|---|---|---|---|
| 1 | red | M–H | esp1:3V3 | bb:LP28 | Cable 1 · M–H · esp1:3V3 → bb:LP28. Conectar sin USB; comprobar etiquetas y agujeros. |
| 2 | red | M–H | bb:LP4 | module1:VCC | NO conectar: Cotejar VCC, cabecera y desacoplo del breakout real. |
| 3 | black | M–H | esp1:GND | bb:LN28 | Cable 3 · M–H · esp1:GND → bb:LN28. Conectar sin USB; comprobar etiquetas y agujeros. |
| 4 | black | M–H | bb:LN6 | module1:GND | Cable 4 · M–H · bb:LN6 → module1:GND. Conectar sin USB; comprobar etiquetas y agujeros. |
| 5 | black | M–H | bb:LN8 | module1:LR | NO conectar: Identificar L/R real; fijar canal izquierdo a GND. |
| 6 | blue | M–H | esp1:GPIO26 | bb:A12 | Cable 6 · M–H · esp1:GPIO26 → bb:A12. Conectar sin USB; comprobar etiquetas y agujeros. |
| 7 | blue | M–H | bb:B12 | module1:SCK | NO conectar: Confirmar etiqueta del terminal; su posición dibujada no identifica el conector real. |
| 8 | yellow | M–H | esp1:GPIO25 | bb:A16 | Cable 8 · M–H · esp1:GPIO25 → bb:A16. Conectar sin USB; comprobar etiquetas y agujeros. |
| 9 | yellow | M–H | bb:B16 | module1:WS | NO conectar: Confirmar etiqueta del terminal; su posición dibujada no identifica el conector real. |
| 10 | green | M–H | esp1:GPIO33 | bb:A20 | Cable 10 · M–H · esp1:GPIO33 → bb:A20. Conectar sin USB; comprobar etiquetas y agujeros. |
| 11 | green | M–H | bb:B20 | module1:SD | NO conectar: Confirmar etiqueta del terminal; su posición dibujada no identifica el conector real. |

M–H: hembra al conector macho del módulo/ESP32 y macho al agujero. M–M: ambos extremos en agujeros distintos. Nunca dos puntas en un agujero.

LP/LN: riel izquierdo +/−; RP/RN: derecho +/−. A–E y F–J son tiras separadas por fila. Confirmar continuidad/cortes de la protoboard real; los rieles opuestos no están unidos. Patas colocadas: módulos externos, conectores por verificar.

Cruces no unen redes. Las condiciones de cada tramo aparecen en esta tabla; un cable por verificar no cuenta como continuidad confirmada aunque se dibuje continuo. Colores son identificadores del dibujo: elegir cables reales y anotar equivalencias. SVG no demuestra alcance físico.

## Antes de energizar

1. L/R fija canal, no es un dato GPIO ni salida hacia la bocina.
2. SD del micrófono es salida de datos; SD del amplificador tiene otra función.
3. Revisar desacoplo y tensión del módulo real; la ficha INMP441 no identifica su breakout.
4. Estos GPIO son propuesta nueva de ensayo, no integración I²S implementada.
5. Identificar A-01/puerto y preservar respaldo privado antes de cargar.
6. Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
7. Confirmar cabecera, orden real y desacoplo de D-07.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: firmware/inmp441_bench; compilar sin carga; Serial 115200. Ver guía física.

## Compilar y cargar manualmente

Arduino CLI 1.5.1, ESP32 core 3.3.12; DHT sensor library 1.4.7 y Adafruit Unified Sensor 1.1.15 solo si el perfil utiliza DHT11. Actuadores usan ClassAIBench local y pantalla Adafruit GFX 1.12.6 + ST7735/ST7789 1.12.0.

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-microfono-build firmware/inmp441_bench
```

Antes de cargar: identificar A-01 y puerto explícito, comprobar su FQBN, registrar cableado real y conservar respaldo privado verificado. Desconectar módulos ajenos y cerrar cualquier monitor. Solo después de resolver TODOS los pendientes eléctricos de esta receta:

```sh
# Sustituir PUERTO_A01 por el puerto reidentificado; no usar el de B-02/NFC.
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_A01 --input-dir /tmp/classai-microfono-build firmware/inmp441_bench
arduino-cli monitor --port PUERTO_A01 --config baudrate=115200
```

Cargar utiliza el binario del perfil recién compilado; no recompilar otro perfil entre compile/upload. Abrir Serial puede reiniciar la placa. No se ejecutaron estos comandos de carga/monitor durante esta entrega.

## Prueba guiada y fallos

Acción: Hablar y dar una palmada cerca del micrófono; no soplar sobre él.

Aprobación esperada: Ventanas con muestras, pico/RMS relativos; error o timeout explícito.

Diagnóstico: Ceros: cotejar L/R, canal y SD; revisar SCK/WS y soldadura sin USB.

Conflictos: GPIO25/26 coinciden con el banco de audio y otras funciones; no conectar ambos automáticamente.

Faltantes/confirmaciones:
- Identificar A-01/puerto y preservar respaldo privado antes de cargar.
- Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
- Confirmar cabecera, orden real y desacoplo de D-07.

## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia física; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [TDK · INMP441](https://invensense.tdk.com/wp-content/uploads/2015/02/INMP441.pdf)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
