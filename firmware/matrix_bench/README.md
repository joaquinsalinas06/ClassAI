# Matriz MAX7219: ensayo aislado

DIN13, CLK14, CS27. Entrada DIN identificada, salida DOUT libre. Ensayo A-01/B-10 del 26/10/2026: caras feliz, triste y enojada visibles, confirmado por Joaquín, con VCC a VIN por USB y señales directas mediante protoboard. Esta unidad respondió a 3,3 V; no garantiza el HIGH especificado del MAX7219 a 5 V. Conservar la alternativa SN74AHCT125N para niveles especificados; USB/VIN no medido.

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

Con terminador de línea: **arm, happy, sad, angry, pattern (5 s), scan (7 s), stop**. Cada cara dura 5 s con intensidad 0 (mínima). `arm` confirma la revisión por el operador; no mide ni valida eléctricamente el circuito. `stop`, comando inválido o línea demasiado larga detienen y desarman. No se inicializan sensores ni red ajenos al ensayo. Desconectar alimentación antes de corregir extremos. Sin carga automática ni modificación del B-02/NFC.

## Orientación de la matriz 8 × 8

Mirando los LEDs de frente, la referencia observada es **cara derecha y cabecera de ENTRADA/cables a la izquierda**: giro 0°. No usar DOUT como referencia de entrada ni inferir orientación de píxeles desde el dibujo del montaje.

| Cabecera de entrada vista de frente | Comando de giro de la imagen |
|---|---|
| Izquierda | `rotate0` (arranque) |
| Abajo | `rotate90` |
| Derecha | `rotate180` |
| Arriba | `rotate270` |

Los grados giran la imagen en sentido horario respecto del mapa de referencia. Ejemplo tras cambiar la posición del módulo **sin alimentación**: reconectar, enviar `arm`, `rotate90`, `happy` si los cables ahora quedan abajo. No hace falta cambiar GPIO. El giro apaga la salida actual y se aplica a la siguiente cara; `pattern` y `scan` conservan el mapa crudo de diagnóstico. El giro no se guarda en NVS y vuelve a 0° al reiniciar. La tabla corresponde a esta unidad; otro módulo puede ordenar los LEDs de otra forma.

## Evidencia y alcance

- R-050–R-052 en [montajes](../../docs/hardware/montajes.md): identidad A-01 distinta de B-02, respaldo propio de 4 MiB/SHA256 verificado, carga y dos secuencias Serial con STOP final. Joaquín confirmó el funcionamiento visual y la orientación con cables a la izquierda.
- El firmware cargado fue la variante aislada de las tres caras a giro 0°, preservada en almacenamiento privado. Este sketch incorpora esas mismas caras y añade los comandos de giro; las rotaciones se validan en host, aún no con el módulo girado físicamente.
- Sin integración con confort, buzzer, PIR, TFT o red. Sin medición de alimentación/niveles ni ensayo de restauración del respaldo. Puerto cerrado al terminar; desconectar USB antes de desmontar.
