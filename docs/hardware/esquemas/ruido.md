# M-06 · Sonido relativo · AO

B-08 a 3,3 V con AO por GPIO34. Es una entrada analógica relativa, no un sonómetro.

**Ensayado · respuesta relativa observada.** Ensayo físico del 25/10/2026; conservar los pendientes de calidad y medición.

![Distribución física de referencia](ruido.svg)

[JSON de montaje importable](ruido-fisico.json) · [SVG físico](ruido-fisico.svg). ESP32 USB abajo; orientación de referencia, cotejar serigrafía. Terminales rotulados por función donde el conector aún no está identificado.

## Resultado físico observado · 25/10/2026

El sensor AO/G/+/DO respondió al sonido en dos rondas: medianas de pico a pico silencio/bajo/alto 283/305/418 y 259/267/330. El LED de umbral reaccionó tras ajustar el potenciómetro. Ensayo con ESP32 de la universidad, + a 3V3, G a GND y AO a GPIO34; perfil BENCH_CAPTURE_500MS.

**Pendiente:** No mide dB. El nivel bajo no se distinguió de forma fiable; faltan calibración y validación en aula. Variante y niveles eléctricos sin medir; DO no probado.

[Registro R-032–R-039](../montajes.md).

## Materiales

- B-08: detector ×1
- B-01 o A-04: protoboard
- Tres redes: 3V3, GND y AO34

Cables: 6 M–H + 0 M–M dibujados; cero H–H. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. B-02 fue reutilizada para estos ensayos; comprobar material libre y registrar cada cambio de banco.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · 3V3 | Detector · + | 3,3 V | Referencia |
| Detector · G | ESP32 · GND | — | Referencia |
| Detector · AO | ESP32 · GPIO34 / ADC1 | — | Referencia |

## Armado cable por cable · USB desconectado

Referencia física, sin escala métrica. USB desconectado al armar. Ensayo realizado con ESP32 de la universidad B-02. Reidentificar placa/puerto y preservar respaldo antes de reutilizarla. Cables reutilizados entre ensayos; cero H–H.

| Nº | Color | Tipo | Origen | Destino | Condición |
|---|---|---|---|---|---|
| 1 | red | M–H | esp1:3V3 | bb:LP28 | Cable 1 · M–H · esp1:3V3 → bb:LP28. Conectar sin USB; comprobar etiquetas y agujeros. |
| 2 | red | M–H | bb:LP5 | module1:VCC | Cable 2 · M–H · bb:LP5 → module1:VCC. Conectar sin USB; comprobar etiquetas y agujeros. |
| 3 | black | M–H | esp1:GND | bb:LN28 | Cable 3 · M–H · esp1:GND → bb:LN28. Conectar sin USB; comprobar etiquetas y agujeros. |
| 4 | black | M–H | bb:LN7 | module1:G | Cable 4 · M–H · bb:LN7 → module1:G. Conectar sin USB; comprobar etiquetas y agujeros. |
| 5 | green | M–H | module1:AO | bb:A10 | Cable 5 · M–H · module1:AO → bb:A10. Conectar sin USB; comprobar etiquetas y agujeros. |
| 6 | green | M–H | esp1:GPIO34 | bb:B10 | Cable 6 · M–H · esp1:GPIO34 → bb:B10. Conectar sin USB; comprobar etiquetas y agujeros. |

M–H: hembra al conector macho del módulo/ESP32 y macho al agujero. M–M: ambos extremos en agujeros distintos. Nunca dos puntas en un agujero.

LP/LN: riel izquierdo +/−; RP/RN: derecho +/−. A–E y F–J son tiras separadas por fila. Confirmar continuidad/cortes de la protoboard real; los rieles opuestos no están unidos. Patas colocadas: módulos externos, conectores por verificar.

Cruces no unen redes. Las condiciones de cada tramo aparecen en esta tabla; un cable por verificar no cuenta como continuidad confirmada aunque se dibuje continuo. Colores son identificadores del dibujo: elegir cables reales y anotar equivalencias. SVG no demuestra alcance físico.

## Antes de energizar

1. Cotejar AO/G/+/DO mirando la misma cara del módulo.
2. Alimentar desde 3V3, nunca desde 5 V en este banco.
3. DO no participa; no sustituir este módulo por INMP441.
4. Identificar la placa elegida y su puerto y preservar respaldo privado antes de cargar.
5. Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
6. Cotejar AO/G/+/DO sobre la misma cara de la pieza y usar únicamente 3,3 V.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: firmware/sound_bench; compilar sin carga; Serial 115200. Ver guía física.

## Compilar y cargar manualmente

Arduino CLI 1.5.1, ESP32 core 3.3.12; DHT sensor library 1.4.7 y Adafruit Unified Sensor 1.1.15 solo si el perfil utiliza DHT11. Actuadores usan ClassAIBench local y pantalla Adafruit GFX 1.12.6 + ST7735/ST7789 1.12.0.

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-ruido-build firmware/sound_bench
```

Antes de cargar: reidentificar la placa elegida y su puerto explícito, comprobar su FQBN, registrar cableado real y conservar respaldo privado verificado. Desconectar módulos ajenos y cerrar cualquier monitor. Solo después de resolver TODOS los pendientes eléctricos de esta receta:

```sh
# Sustituir PUERTO_VERIFICADO por el puerto reidentificado; no copiar un puerto histórico sin identificar la placa.
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_VERIFICADO --input-dir /tmp/classai-ruido-build firmware/sound_bench
arduino-cli monitor --port PUERTO_VERIFICADO --config baudrate=115200
```

Cargar utiliza el binario del perfil recién compilado; no recompilar otro perfil entre compile/upload. Abrir Serial puede reiniciar la placa. El ensayo registrado puede utilizar otro perfil o una variante privada; no confundirlo con este comando de compilación.

## Prueba guiada y fallos

Acción: Comparar silencio relativo, conversación y palmada durante varias ventanas.

Aprobación esperada: min/max, pico a pico y noise_rel varían; no son dB ni garantizan tres niveles sin ensayo.

Diagnóstico: Saturación: retirar USB y revisar + a 3V3, G a GND y AO a GPIO34.

Conflictos: GPIO34 es solo entrada en ESP32 clásico; no usarlo como salida.

Faltantes/confirmaciones:
- Identificar la placa elegida y su puerto y preservar respaldo privado antes de cargar.
- Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
- Cotejar AO/G/+/DO sobre la misma cara de la pieza y usar únicamente 3,3 V.

## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia física; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico | El sensor AO/G/+/DO respondió al sonido en dos rondas: medianas de pico a pico silencio/bajo/alto 283/305/418 y 259/267/330. El LED de umbral reaccionó tras ajustar el potenciómetro. Ensayo con ESP32 de la universidad, + a 3V3, G a GND y AO a GPIO34; perfil BENCH_CAPTURE_500MS. | [R-032–R-039](../montajes.md) |
| Pendientes del ensayo | No mide dB. El nivel bajo no se distinguió de forma fiable; faltan calibración y validación en aula. Variante y niveles eléctricos sin medir; DO no probado. | No equivale a validación completa |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [Espressif · ESP32](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
