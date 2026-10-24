# M-01 · LED y botón aislados

Solo GPIO25 (LED con 1 kΩ en serie) y GPIO32 (pulsador a GND, INPUT_PULLUP).
Sin red, sensores, NFC, pantalla ni actuadores. Desconectar cualquier otro
montaje que use esos GPIO. [Esquema y condiciones](../../docs/hardware/esquemas/led-boton.md).

Compilar desde raíz, sin cargar:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --build-path /tmp/classai-led-button-bench-build firmware/led_button_bench
bash scripts/ci/bench-host.sh
```

Compilación local aprobada el 24/10/2026: 272220 bytes de programa y 22140 globales,
ESP32 core 3.3.12. El perfil no identifica el clon físico. Host: comprobado rebote,
pulsación mantenida y segunda pulsación usando el sketch real con stubs.

Ensayo físico pendiente: identificar placa/puerto, preservar respaldo privado,
registrar polaridad/resistencia/parejas del pulsador y cableado; solo después
cargar con puerto explícito. Serial 115200. Una pulsación alterna LED y registra
ON/OFF; mantener el botón no repite. El debounce de 35 ms no certifica el pulsador
real. No se ejecutó upload ni lectura de flash.
