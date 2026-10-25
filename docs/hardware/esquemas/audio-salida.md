# M-07B · Audio · una bocina

Enviar arm y tone para 440 Hz durante 300 ms, a amplitud digital inicial del 1 %. stop corta y desarma.

**Montaje condicionado · revisar pendientes.** Diseño de referencia, sin ensayo físico nuevo.

![Distribución física de referencia](audio-salida.svg)

[JSON de montaje importable](audio-salida-fisico.json) · [SVG físico](audio-salida-fisico.svg). ESP32 USB abajo; orientación de referencia, cotejar serigrafía. Terminales rotulados por función donde el conector aún no está identificado.

## Materiales

- esp1: A-01 · identificar antes de cargar
- amp1: D-08 · MAX98357A
- speaker1: D-09 · usar solo una · 4 Ω / 3 W
- rsd: C-01 · 1 kΩ pull-down SD

Cables: 8 M–H + 1 M–M dibujados; cero H–H y un par de altavoz. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · GND_L | Protoboard · RN28 | c1 · M–H | Referencia |
| Protoboard · RN20 | MAX98357A · GND | c2 · M–H | Referencia |
| ESP32 · VIN | MAX98357A · VIN | c3 · M–H | Pendiente; no conectar |
| ESP32 · GPIO33 | MAX98357A · BCLK | c4 · M–H | Pendiente; no conectar |
| ESP32 · GPIO25 | MAX98357A · LRC | c5 · M–H | Pendiente; no conectar |
| ESP32 · GPIO22 | MAX98357A · DIN | c6 · M–H | Pendiente; no conectar |
| ESP32 · GPIO21 | Protoboard · J22 | c7 · M–H | Referencia |
| Protoboard · H22 | MAX98357A · SD | c8 · M–H | Pendiente; no conectar |
| Protoboard · J25 | Protoboard · RN25 | c9 · M–M | Referencia |
| MAX98357A · SPK_PLUS | Bocina · PLUS | c10 · altavoz | Pendiente; no conectar |
| MAX98357A · SPK_MINUS | Bocina · MINUS | c11 · altavoz | Pendiente; no conectar |

## Armado cable por cable · USB desconectado

Referencia física, sin escala métrica. USB desconectado al armar. Usar A-01 solo tras identificar placa/puerto y preservar respaldo; B-02/NFC permanece conservado. Cables reutilizados entre ensayos; cero H–H. R-027: la vista principal no supone una fuente externa. D-08 y D-09 quedan a la izquierda, con I²S directo y solo el pull-down SD en protoboard; el circuito de fuente separada se conserva en Compatibilidad.

| Nº | Color | Tipo | Origen | Destino | Condición |
|---|---|---|---|---|---|
| 1 | black | M–H | esp1:GND_L | bb:RN28 | Cable 1 · M–H · esp1:GND_L → bb:RN28. Conectar sin USB; comprobar etiquetas y agujeros. |
| 2 | black | M–H | bb:RN20 | amp1:GND | Cable 2 · M–H · bb:RN20 → amp1:GND. Conectar sin USB; comprobar etiquetas y agujeros. |
| 3 | orange | M–H | esp1:VIN | amp1:VIN | NO conectar: Identificar A-01 y confirmar que VIN/5V expone el USB; tono inicial al 1 % y detener ante reset, calentamiento o distorsión. |
| 4 | blue | M–H | esp1:GPIO33 | amp1:BCLK | NO conectar: Cotejar terminal del breakout MAX98357A. |
| 5 | yellow | M–H | esp1:GPIO25 | amp1:LRC | NO conectar: Cotejar terminal del breakout MAX98357A. |
| 6 | green | M–H | esp1:GPIO22 | amp1:DIN | NO conectar: Cotejar terminal del breakout MAX98357A. |
| 7 | purple | M–H | esp1:GPIO21 | bb:J22 | Cable 7 · M–H · esp1:GPIO21 → bb:J22. Conectar sin USB; comprobar etiquetas y agujeros. |
| 8 | purple | M–H | bb:H22 | amp1:SD | NO conectar: Confirmar SD de habilitación; no confundirlo con datos del micrófono. |
| 9 | black | M–M | bb:J25 | bb:RN25 | Cable 9 · M–M · bb:J25 → bb:RN25. Conectar sin USB; comprobar etiquetas y agujeros. |
| 10 | purple | altavoz | amp1:SPK_PLUS | speaker1:PLUS | NO conectar: Salida diferencial: no unir a GND. |
| 11 | purple | altavoz | amp1:SPK_MINUS | speaker1:MINUS | NO conectar: Salida diferencial: no unir a GND. |

M–H: hembra al conector macho del módulo/ESP32 y macho al agujero. M–M: ambos extremos en agujeros distintos. Nunca dos puntas en un agujero.

LP/LN: riel izquierdo +/−; RP/RN: derecho +/−. A–E y F–J son tiras separadas por fila. Confirmar continuidad/cortes de la protoboard real; los rieles opuestos no están unidos. Patas colocadas: rsd (C-01 · 1 kΩ pull-down SD): 1→G22, 2→G25.

Cruces no unen redes. Las condiciones de cada tramo aparecen en esta tabla; un cable por verificar no cuenta como continuidad confirmada aunque se dibuje continuo. Colores son identificadores del dibujo: elegir cables reales y anotar equivalencias. SVG no demuestra alcance físico.

## Compatibilidad eléctrica

[Montaje alternativo con adaptación](audio-salida-adaptado.md). No se muestra como material obligatorio del montaje principal; usarlo si los niveles o la carga exigen esa etapa.

## Antes de energizar

1. Identificar placa A-01/puerto, preservar respaldo y armar sin alimentación. B-02/NFC se conserva.
2. Sin fuente externa en la vista principal: confirmar A-01 y presupuesto USB antes de conectar VIN del MAX98357A.
3. Ensayo inicial al 1 % con una sola bocina; detener ante reset, calentamiento o distorsión. El circuito de fuente separada queda solo en Compatibilidad.
4. A-01/puerto identificados y respaldo privado preservado; B-02/NFC conservado.
5. Confirmar D-08 MAX98357A, cabecera y adaptación D-09. GAIN libre solo bajo referencia documentada del módulo; SD21 y pull-down 1 kΩ deben estar conectados para silencio al boot; contrastar el pull-up interno del breakout.
6. Usa BCLK33, WS25, DIN22, alineado con #91; banco separado del micrófono. No modifica mascota/assets de Lando.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: firmware/audio_output_bench; compilar sin carga; Serial 115200. Ver guía física.

## Compilar y cargar manualmente

Arduino CLI 1.5.1, ESP32 core 3.3.12; DHT sensor library 1.4.7 y Adafruit Unified Sensor 1.1.15 solo si el perfil utiliza DHT11. Actuadores usan ClassAIBench local y pantalla Adafruit GFX 1.12.6 + ST7735/ST7789 1.12.0.

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-audio-salida-build firmware/audio_output_bench
```

Antes de cargar: identificar A-01 y puerto explícito, comprobar su FQBN, registrar cableado real y conservar respaldo privado verificado. Desconectar módulos ajenos y cerrar cualquier monitor. Solo después de resolver TODOS los pendientes eléctricos de esta receta:

```sh
# Sustituir PUERTO_A01 por el puerto reidentificado; no usar el de B-02/NFC.
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_A01 --input-dir /tmp/classai-audio-salida-build firmware/audio_output_bench
arduino-cli monitor --port PUERTO_A01 --config baudrate=115200
```

Cargar utiliza el binario del perfil recién compilado; no recompilar otro perfil entre compile/upload. Abrir Serial puede reiniciar la placa. No se ejecutaron estos comandos de carga/monitor durante esta entrega.

## Prueba guiada y fallos

Acción: Enviar arm y tone para 440 Hz durante 300 ms, a amplitud digital inicial del 1 %. stop corta y desarma.

Aprobación esperada: Un tono breve en una sola bocina, sin sonido al arrancar; errores I²S explícitos.

Diagnóstico: Enviar stop ante un fallo y retirar USB. Revisar VIN/5V, GND, BCLK, LRC, DIN, SD y el par SPK±; no cambiar pines ni soldar con alimentación.

Conflictos: BCLK33/WS25/DIN22/SD21; perfil mínimo separado de micrófono, TFT y mascota de Lando. GAIN libre = 9 dB bajo referencia MAX98357A.

Faltantes/confirmaciones:
- Identificar placa A-01/puerto, preservar respaldo y armar sin alimentación. B-02/NFC se conserva.
- Sin fuente externa en la vista principal: confirmar A-01 y presupuesto USB antes de conectar VIN del MAX98357A.
- Ensayo inicial al 1 % con una sola bocina; detener ante reset, calentamiento o distorsión. El circuito de fuente separada queda solo en Compatibilidad.
- A-01/puerto identificados y respaldo privado preservado; B-02/NFC conservado.
- Confirmar D-08 MAX98357A, cabecera y adaptación D-09. GAIN libre solo bajo referencia documentada del módulo; SD21 y pull-down 1 kΩ deben estar conectados para silencio al boot; contrastar el pull-up interno del breakout.
- Usa BCLK33, WS25, DIN22, alineado con #91; banco separado del micrófono. No modifica mascota/assets de Lando.

## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia física; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [Adafruit · MAX98357](https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/pinouts)
- [Material de la U y criterios de armado](https://github.com/joaquinsalinas06/ClassAI/blob/codex/physical-benches/docs/hardware/circuitos-referencia.md)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
