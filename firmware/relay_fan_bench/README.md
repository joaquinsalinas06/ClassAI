# Relé y ventilador: ensayo aislado

GPIO26; contactos COM1/NO1. Por defecto módulo LOW-trigger compatible con lógica 3,3 V. La alternativa con transistor invierte control: compilar con BENCH_RELAY_NPN_ONLY=1. Confirmar JD-VCC y probar relé sin fan primero. Fuente externa propuesta 5 V/2 A; potencia por bornes, no protoboard.

Guía completa, agujeros, cableado, piezas y diagnóstico: [banco ventilador](../../docs/hardware/esquemas/ventilador.md). [Alternativas y evidencia](../../docs/hardware/circuitos-referencia.md).

Compilar desde la raíz sin conectar placa (Arduino CLI 1.5.1, ESP32 3.3.12; dependencias fijadas por scripts/ci/arduino-install.sh):

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-relay_fan_bench firmware/relay_fan_bench
```

Solo después de identificar A-01/puerto, conservar respaldo y verificar cableado sin alimentación, sustituir PUERTO_A01 y cargar explícitamente:

```sh
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_A01 --input-dir /tmp/classai-relay_fan_bench firmware/relay_fan_bench
arduino-cli monitor --port PUERTO_A01 --config baudrate=115200
```

Con terminador de línea: **arm, on (máximo 2 s), off, stop**. `arm` confirma la revisión por el operador; no mide ni valida eléctricamente el circuito. `stop`, comando inválido o línea demasiado larga detienen y desarman. No se inicializan sensores ni red ajenos al ensayo. Desconectar alimentación antes de corregir extremos. Sin carga automática ni modificación del B-02/NFC.

Estado: compilado y comportamiento probado en host con stubs; no probado físicamente.

Para el circuito NPN añadir `--build-property compiler.cpp.extra_flags=-DBENCH_RELAY_NPN_ONLY=1` al comando de compilación. Conservar ese binario en un directorio distinto del directo.
