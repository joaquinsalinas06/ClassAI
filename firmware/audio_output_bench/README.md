# MAX98357A y un altavoz: ensayo aislado

BCLK33, WS25, DIN22, SD21. Un altavoz diferencial 4 Ω/3 W de referencia; no unir SPK− a GND. SD LOW al arranque y pulldown externo. Tono al 1% digital: no es medición de potencia acústica.

Guía completa, agujeros, cableado, piezas y diagnóstico: [banco audio-salida](../../docs/hardware/esquemas/audio-salida.md). [Alternativas y evidencia](../../docs/hardware/circuitos-referencia.md).

Compilar desde la raíz sin conectar placa (Arduino CLI 1.5.1, ESP32 3.3.12; dependencias fijadas por scripts/ci/arduino-install.sh):

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-audio_output_bench firmware/audio_output_bench
```

Solo después de identificar la placa elegida y su puerto, conservar respaldo y verificar cableado sin alimentación, sustituir PUERTO_VERIFICADO y cargar explícitamente:

```sh
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_VERIFICADO --input-dir /tmp/classai-audio_output_bench firmware/audio_output_bench
arduino-cli monitor --port PUERTO_VERIFICADO --config baudrate=115200
```

Con terminador de línea: **arm, tone (440 Hz, 300 ms), stop**. `arm` confirma la revisión por el operador; no mide ni valida eléctricamente el circuito. `stop`, comando inválido o línea demasiado larga detienen y desarman. No se inicializan sensores ni red ajenos al ensayo. Desconectar alimentación antes de corregir extremos. Sin carga automática. Registrar la sustitución del firmware anterior de la placa elegida.

Estado: el pitido de este sketch se cargó en B-02 y fue audible según Joaquín. La reproducción del archivo utilizó una variante privada distinta, descrita abajo.


## Ensayo físico M-07B · 25/10/2026

Se reutilizó el **ESP32 de la universidad B-02**, después de identificar el chip
contra el registro privado y verificar el respaldo original de 4 MiB por tamaño
y SHA256. Su restauración no está ensayada. NFC, sensor AO y audio se probaron
sucesivamente en la misma placa; no quedaron funcionando a la vez.

Cableado confirmado por Joaquín: GND común, VIN del ESP32 por USB → VIN del
amplificador, BCLK33, LRC25, DIN22, SD21 con pull-down de 1 kΩ y GAIN libre.
Una bocina entre SPK+ y SPK−, ninguno a GND. Se revisaron los extremos sin
alimentación antes de cargar. Ruta USB–VIN, potencia y niveles no medidos.
La guía usa **12 M–H + 1 M–M**, más el par propio de la bocina y su adaptador;
no necesita jumpers H–H. Contar disponibilidad libre y alcance real.

| Prueba | Evidencia | Límite |
|---|---|---|
| Tono inicial | Este sketch: 440 Hz/300 ms al 1 %, upload verificado y audible según Joaquín | No mide potencia ni calidad |
| Archivo local completo | Variante privada: mono, 32 kHz, slots I²S de 32 bits, ~19,8 s; prueba final con seno de 1 kHz/5 s y pico digital ~15 % | El MP3/PCM y su variante compilada permanecen fuera de Git |
| Resultado del usuario | Mejor volumen al 15 %; no notó calentamiento | Pitido algo inestable y ruido del archivo más evidente; calidad pendiente |
| Cierre | Serial confirmó inicio/fin, STOP y desarmado, sin errores I²S registrados; puerto cerrado | No demuestra margen eléctrico ni un máximo seguro |

La variante privada conserva las muestras limitadas al 5 % mediante empaquetado
de 12 bits y aplica ganancia 3× al transmitir; el host comparó todas las muestras
con el PCM esperado, incluidos estéreo, parada, drenaje de ceros y fallos I²S.
Compiló con core 3.3.12: 1243516 bytes de programa y 22332 globales, sin cambiar
particiones. El sketch público de tono compiló en 289244/22324 bytes.

El **15 % es amplitud digital, no porcentaje de los 3 W ni un límite del chip**.
Adafruit documenta 2,5 W a 5 V/4 Ω al 1 % THD y recomienda alimentación de al
menos 800 mA para su breakout; eso no certifica la corriente disponible por la
ruta USB/VIN de esta placa. Revisar ruido, contactos, alimentación y estabilidad
antes de afirmar calidad o potencia máxima. No se atribuyó una causa única.

Registro público: [R-040–R-048](../../docs/hardware/montajes.md). Respaldos,
identidad completa, audio y logs permanecen privados. El último programa activo
es la variante de archivo, silenciada y desarmada al terminar.
