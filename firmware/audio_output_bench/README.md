# MAX98357A y un altavoz: ensayo aislado

BCLK33, WS25, DIN22, SD21. Un altavoz diferencial 4 Ω/3 W de referencia; no unir SPK− a GND. SD LOW al arranque y pulldown externo. Tono al 1% digital: no es medición de potencia acústica.

Guía completa, agujeros, cableado, piezas y diagnóstico: [banco audio-salida](../../docs/hardware/esquemas/audio-salida.md). [Alternativas y evidencia](../../docs/hardware/circuitos-referencia.md).

Compilar desde la raíz sin conectar placa (Arduino CLI 1.5.1, ESP32 3.3.12; dependencias fijadas por scripts/ci/arduino-install.sh):

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-audio_output_bench firmware/audio_output_bench
```

Solo después de identificar A-01/puerto, conservar respaldo y verificar cableado sin alimentación, sustituir PUERTO_A01 y cargar explícitamente:

```sh
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_A01 --input-dir /tmp/classai-audio_output_bench firmware/audio_output_bench
arduino-cli monitor --port PUERTO_A01 --config baudrate=115200
```

Con terminador de línea: **arm, tone (440 Hz, 300 ms), stop**. `arm` confirma la revisión por el operador; no mide ni valida eléctricamente el circuito. `stop`, comando inválido o línea demasiado larga detienen y desarman. No se inicializan sensores ni red ajenos al ensayo. Desconectar alimentación antes de corregir extremos. Sin carga automática ni modificación del B-02/NFC.

Estado: compilado y comportamiento probado en host con stubs; no probado físicamente.
