# Patrón ST7789: ensayo aislado

SCLK14, MOSI23, CS5, DC27, RST26. Referencia ST7789 de 240×240. Confirmar lógica/alimentación y backlight 3,3 V. Ensayo aislado de color/orientación, no reemplaza mascota de Lando.

Guía completa, agujeros, cableado, piezas y diagnóstico: [banco pantalla](../../docs/hardware/esquemas/pantalla.md). [Alternativas y evidencia](../../docs/hardware/circuitos-referencia.md).

Compilar desde la raíz sin conectar placa (Arduino CLI 1.5.1, ESP32 3.3.12; dependencias fijadas por scripts/ci/arduino-install.sh):

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-display_bench firmware/display_bench
```

Solo después de identificar A-01/puerto, conservar respaldo y verificar cableado sin alimentación, sustituir PUERTO_A01 y cargar explícitamente:

```sh
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_A01 --input-dir /tmp/classai-display_bench firmware/display_bench
arduino-cli monitor --port PUERTO_A01 --config baudrate=115200
```

Con terminador de línea: **arm, pattern, rot0, rot1, rot2, rot3, stop**. `arm` confirma la revisión por el operador; no mide ni valida eléctricamente el circuito. `stop`, comando inválido o línea demasiado larga detienen y desarman. No se inicializan sensores ni red ajenos al ensayo. Desconectar alimentación antes de corregir extremos. Sin carga automática ni modificación del B-02/NFC.

Estado: compilado y comportamiento probado en host con stubs; no probado físicamente.
