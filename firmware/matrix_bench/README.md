# Matriz MAX7219: ensayo aislado

DIN13, CLK14, CS27. MAX7219 de 5 V con entradas adaptadas mediante SN74AHCT125N; entrada DIN identificada, salida DOUT libre. La referencia directa del visor permanece condicionada.

Guía completa, agujeros, cableado, piezas y diagnóstico: [banco matriz](../../docs/hardware/esquemas/matriz.md). [Alternativas y evidencia](../../docs/hardware/circuitos-referencia.md).

Compilar desde la raíz sin conectar placa (Arduino CLI 1.5.1, ESP32 3.3.12; dependencias fijadas por scripts/ci/arduino-install.sh):

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-matrix_bench firmware/matrix_bench
```

Solo después de identificar A-01/puerto, conservar respaldo y verificar cableado sin alimentación, sustituir PUERTO_A01 y cargar explícitamente:

```sh
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_A01 --input-dir /tmp/classai-matrix_bench firmware/matrix_bench
arduino-cli monitor --port PUERTO_A01 --config baudrate=115200
```

Con terminador de línea: **arm, pattern (5 s), scan (7 s), stop**. `arm` confirma la revisión por el operador; no mide ni valida eléctricamente el circuito. `stop`, comando inválido o línea demasiado larga detienen y desarman. No se inicializan sensores ni red ajenos al ensayo. Desconectar alimentación antes de corregir extremos. Sin carga automática ni modificación del B-02/NFC.

Estado: compilado y comportamiento probado en host con stubs; no probado físicamente.
