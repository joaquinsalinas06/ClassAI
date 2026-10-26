# sound_bench

Banco aislado, sin red ni inicialización de actuadores ajenos.

[Guía física, pines, materiales, pasos, carga y Serial](../../docs/hardware/esquemas/ruido.md).
[Compilación real, versiones, tamaños y pendientes](../../docs/hardware/bancos-fisicos.md).

```sh
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-ruido-build firmware/sound_bench
```

No ejecuta upload. Antes de cargar: identificar A-01/puerto y FQBN, preservar
respaldo privado, registrar montaje real y resolver pendientes eléctricos de la
guía. Mantener B-02/NFC. Solo entonces usar `arduino-cli upload` con
`--input-dir /tmp/classai-ruido-build` y puerto explícito; Serial 115200.

Prueba host: `bash scripts/ci/sensor-benches-host.sh`. No demuestra circuito
físico. No convertir compilación en permiso de energización.

## Ensayo real M-06 del 25/10/2026

Joaquín eligió B-02 y reemplazó temporalmente NFC_ONLY por un banco de captura.
La identidad del chip se contrastó con el registro privado antes de escribir;
el respaldo original de 4 MiB se preservó y comprobó por tamaño/SHA256. Su
restauración no fue ensayada. El puerto de esa prueba fue
`/dev/cu.usbserial-0001`; debe reidentificarse tras cambiar placas.

Cableado comunicado por Joaquín: B-08 `+ → 3V3`, `G → GND`, `AO → GPIO34`.
DO se indicó libre, sin confirmación expresa ni inspección fotográfica nueva.
Tras ajustar el potenciómetro, Joaquín observó el LED de umbral apagado en
silencio y activación ante voz/palmada. Variante exacta y niveles eléctricos
no se certificaron por medición.

### Dos perfiles conservados

- Predeterminado: muestreo cooperativo, ventanas de 100 ms, `noise_rel` igual
  a pico a pico dividido por 4095; conservado de la PR #96, sin nueva carga física.
- `BENCH_CAPTURE_500MS`: versión efectivamente cargada en este ensayo, preservada
  en `capture_500ms.h`. Solo ADC34 y Serial, con ventanas **bloqueantes de 500 ms**:
  mínimo, máximo, media entera, pico a pico, muestras y muestras en extremos.
  No integrar ese loop en el producto. No contiene Wi-Fi, MQTT ni escrituras NVS.

Reproducir la compilación del perfil físico sin cargar:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --build-property compiler.cpp.extra_flags=-DBENCH_CAPTURE_500MS=1 --build-path /tmp/classai-sound-capture-build firmware/sound_bench
```

El sketch original de captura compiló con core 3.3.12: 279512 bytes de programa
y 22196 globales. La carga a 115200 finalizó código 0 con hashes verificados.
Las estadísticas Serial se probaron en host y en la placa; no equivalen a una
certificación eléctrica. Abrir el puerto Serial puede reiniciar la placa.

Tras conciliar con `main`, ambos perfiles recompilaron con core 3.3.12:
captura 279512/22196 bytes de programa/globales; predeterminado 279640/22228.
El host comprueba el perfil de captura sobre el sketch real: media, extremos,
pico a pico y desbordamiento de `millis`, además del perfil cooperativo existente.

### Prueba sincronizada desde el Mac

Con el perfil `BENCH_CAPTURE_500MS` ya cargado, el montaje revisado y el sensor
fijo a 15–20 cm del parlante del Mac:

```sh
python3 firmware/sound_bench/probe.py --self-test
python3 firmware/sound_bench/probe.py --port /dev/cu.usbserial-0001
```

El probe requiere el JSON del perfil de captura, no el del perfil predeterminado.
Usa Python estándar y `afplay`, sin instalar dependencias, cargar firmware ni
cambiar volumen/salida de macOS. Cerrar otros monitores Serial antes. Dura
aproximadamente un minuto: silencio, tres pulsos de 1 kHz y dos rondas de
silencio/ruido bajo/ruido alto. Ambos niveles usan el mismo ruido reproducible,
con amplitud digital cuatro veces mayor en alto; eso no significa cuatro veces
la presión sonora real. No hablar, mover el sensor ni añadir estímulos.
Ctrl+C detiene la prueba.

Guarda ventanas y fases en archivos privados
`~/.codex/hardware-logs/classai/sound-probe-*.jsonl`. Excluye los primeros 1,5 s
de cada fase del resumen para reducir ventanas mezcladas; el inicio acústico
real no está medido. Los pulsos sintetizados no son palmadas físicas.

### Resultado observado después del ajuste

Medianas de pico a pico ADC crudo, nueve ventanas interiores por fase:

| Escenario | Ronda 1 | Ronda 2 |
|---|---:|---:|
| Silencio relativo | 283 | 259 |
| Ruido bajo reproducido | 305 | 267 |
| Ruido alto reproducido | 418 | 330 |

El pico con pulsos llegó a 1284. Entre todas las ventanas interiores, mínimo
ADC 1275 y máximo 2559; ninguna muestra alcanzó 0/4095. Ruido alto supera la
mediana de silencio en ambas rondas, pero las distribuciones se solapan y el
nivel bajo no se distingue de forma fiable. No es una métrica dB ni una prueba
de tres clases separables. No se atribuye una causa única al ajuste.
Registro público saneado: `docs/hardware/montajes.md`, R-032–R-039; logs,
respaldos e identidades completas se mantienen fuera de Git.

## Pendiente: módulo adaptable

La discusión de diseño todavía **no está implementada**: RMS quitando el nivel
central, agregación por segundo, referencia inicial de 30 s con rechazo de
transitorios, indicador relativo, duración de eventos y adaptación lenta solo
en periodos estables. Antes de fijar umbrales: repetir pruebas etiquetadas,
contar falsas alarmas y fallos, y validar en aula. Separar ruido superior al
habitual de un límite acústico de confort; este banco no mide dB calibrados.
Mantener #8 y #19 abiertas hasta cumplir sus criterios; #77 cubre adaptación
por contexto y no se completa por este ensayo aislado.

La referencia inicial de 30 s es una propuesta diagnóstica del banco, no una
sustitución del contrato de producto de #77: el backend estima parámetros por
aula/curso y el ESP32 ejecuta la configuración retenida y guardada en NVS.
Antes de integrar una nueva característica, acordar escala/unidades de
`noise_rel` y conservar esa separación; aquí no se cambia MQTT ni NVS.

API: [ADC Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html).
