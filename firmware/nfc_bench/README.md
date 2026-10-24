# M-10 · PN532 aislado

SPI SCK18 / MISO19 / MOSI23 / SS5, VCC 3,3 V y GND según PN532 V3 de referencia.
DIP 1 OFF / 2 ON sin alimentación; IRQ/RSTO no usados. Sin red, pantalla, sensores
ni actuadores. [Esquema y revisión de cabecera](../../docs/hardware/esquemas/nfc.md).
No conectar la TFT con esta receta. Una soldadura en curso no es soldadura probada.

Compilar desde raíz, sin cargar:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --build-path /tmp/classai-nfc-bench-build firmware/nfc_bench
bash scripts/ci/bench-host.sh
```

Compilación local aprobada el 24/10/2026: 302816 bytes de programa y 23716 globales,
core ESP32 3.3.12. Adafruit PN532 1.3.4 y BusIO 1.17.4 del entorno existente. Host: fallo de
versión/configuración, tarjeta mantenida, retirada y reentrada ejercitados sobre
el sketch real con stubs; no prueban radio, tarjeta real ni soldaduras.

Antes de cargar: identidad/puerto, respaldo privado preservado y cableado anotado.
Ensayo físico pendiente: versión PN532 y 20 detecciones retirando entre lecturas.
Serial 115200. Registra longitud de UID y contador, **nunca su valor**. Una tarjeta
mantenida no vuelve a contar hasta dos consultas sin target. No prueba Android
HCE, APDU, deduplicación por estudiante/sesión ni cadena MQTT/BD/web. No se ha
cargado firmware ni leído flash. No usar el binario de este banco como firmware
de producto integrado.
