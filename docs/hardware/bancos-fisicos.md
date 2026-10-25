# Bancos físicos: entrega y ensayo sucesivo

Corte inicial: 24/10/2026, America/Lima. Esta entrega añade diseño/software; **no hubo upload, lectura de flash, apertura de Serial ni ensayo físico**. R-023 de B-02/PN532 sigue siendo la referencia física anterior, con errores RF intermitentes. Respaldos, configuraciones privadas y credenciales conservados.

## Actualización del 25/10/2026 · R-031

La tabla y los conteos iniciales de abajo se conservan como estado histórico. **Los sustituyen las guías regeneradas y R-031.** Los 13 bancos físicos muestran ahora todos los cables de su receta principal, sin redes parciales ni tramos que terminen antes del componente. Para el ventilador se dibuja la fuente genérica de 5 V que hace falta conseguir; no se presenta como recibida.

| Banco | Entrega actual | Pendiente físico |
|---|---|---|
| DHT11 / PIR / conjunto | Tres perfiles completos; DHT11 3V3/OUT4/GND y PIR VIN5V/OUT27/GND según guías UTEC | Cotejar las etiquetas mirando la misma cara y asociar A-01 antes de cargar |
| LED/pulsador | Pulsador arriba, LED debajo; GPIO25/32 conservados, masas cercanas; 3 M–H + 3 M–M | A-01/puerto/respaldo, A/K y parejas de contacto |
| B-08 / INMP441 / LEDs | B-08 completo a 3,3 V; INMP441 completo por I²S; LEDs con resistencias individuales | Cotejar cabeceras y contar resistencias disponibles |
| Matriz | MAX7219 completo: VIN/5V, GND, DIN13, CLK14 y CS27; alternativa AHCT conservada | Usar la cabecera IN/DIN y ensayar a brillo bajo |
| Buzzer | Dos cables: GPIO17 a + y GND a −; sketch de pulso/tono; alternativa con transistor separada | Cotejar el signo + y detener ante calentamiento o reinicio |
| Relé/ventilador | Circuito completo: control por USB/VIN, COM1–NO1, fan y fuente genérica 5 V/2 A | Conseguir la fuente y adaptador del conector; confirmar polaridad y trigger LOW |
| Pantalla/audio | ST7789 completo a 3,3 V y MAX98357A completo por VIN/5V USB con una bocina | Cotejar terminales; audio inicial al 1 % |
| Iluminación | Material requerido explícito | Sensor de luz no recibido |

Ver [evidencia documental y alternativas](circuitos-referencia.md). Las guías actuales enlazan inventario, extremos, agujeros, tipos de cable, comandos y diagnóstico. La vista principal dibuja y numera el circuito ejecutable completo. Los terminales no usados no generan cables ni rótulos adicionales.

Compilación de la actualización: `bash scripts/ci/benches-build.sh`, Arduino CLI 1.5.1, core ESP32 3.3.12. Se añaden Adafruit GFX 1.12.6 y ST7735/ST7789 1.12.0 fijadas en instalación. Resultados de memoria nuevos se registran en R-026. No hubo carga, Serial físico, simulación nueva ni ensayo eléctrico. B-02/NFC y respaldos conservados.

## Orden y estado inicial (R-025)

| Orden | Banco | Diseño/software | Condición física |
|---|---|---|---|
| 1 | [DHT11](esquemas/dht11.md), [PIR](esquemas/pir.md), [conjunto](esquemas/ambiente.md) | Dibujos, tabla de agujeros y firmware compilados en tres perfiles | B-03: identificar breakout/pull-up a 3,3 V. PIR: ID, etiquetas, fuente y nivel OUT pendientes. VIN no habilitado por el dibujo |
| 2 | [LED/pulsador](esquemas/led-boton.md) | Dibujo completo y sketch compilado; debounce y mantenimiento probados en host | Primer candidato de menor incertidumbre: confirmar A-01, respaldo, A/K, parejas del pulsador y protoboard |
| 3 | [B-08 analógico](esquemas/ruido.md) | Montaje directo 3V3/GND/AO34 + sketch ADC34 compilado y ventanas probadas en host | Cotejar AO/G/+/DO en la misma cara; DO no participa y no se dibuja |
| 4 | [INMP441](esquemas/microfono.md) | Dibujo condicionado + RX I²S compilado; estadística signed24 probada en host | D-07: cabecera, orden del breakout y desacoplo por confirmar. No se capturó audio real |
| 5 | [Tres LEDs](esquemas/leds.md) | Dibujo completo y comandos Serial compilados/probados en host | Confirmar tres C-01 de 1 kΩ libres, polaridades y placa |
| 6 | [Matriz](esquemas/matriz.md), [buzzer](esquemas/buzzer.md), [relé/fan](esquemas/ventilador.md) | Piezas/terminales y mapa funcional visibles; diseño eléctrico incompleto y sin sketch nuevo de carga | No energizar; faltantes abajo |
| Coordinación | [Pantalla](esquemas/pantalla.md) / [audio](esquemas/audio-salida.md) | Se conservan referencias y prototipo; no se reemplazan trabajos #91–#93 | Entrega de Lando/contrato conjunto y validación física pendientes |
| Material | [Iluminación](esquemas/iluminacion.md) | Entrada explícita de material pendiente | BH1750 no inventariado; LDR de kit pedido no recibida |

Los 16 bancos incluyen preparación/transporte y referencias condicionadas, **no 16 circuitos completos**. Los dibujos nuevos reproducen componentes y agujeros como referencias; no son plantillas métricas. Donde falta el orden real del conector se muestra un panel por función rotulado, no una cabecera física certificada. Pantalla/audio continúan como esquemas lógicos hasta incorporar la entrega de Lando.

## Qué poner en la mesa primero

Para LED/pulsador: **A-01**, su cable micro USB de datos **A-03 o D-10 libre**, protoboard **A-04 libre y apta** (o una recibida libre con contactos equivalentes), **C-05** LED rojo, **una C-01 de 1 kΩ**, **C-04** pulsador, **3 M–H + 2 M–M**. Confirmar dimensiones/filas de la protoboard y parejas del pulsador antes de trasladar los agujeros del dibujo. Las bandas café–negro–rojo–dorado corresponden a la referencia de 1 kΩ; no sustituir por C-03 sin identificar.

Para el siguiente ensayo ambiental: **B-03**, **un PIR B-04 o D-06 identificado**, A-01/USB/protoboard y los cables indicados por la guía regenerada. El módulo DHT11 del Anexo X ya incorpora el pull-up: no añadir C-02. No compartir material reservado al NFC sin registrar desmontaje/rearmado; no se exige disponer de todos los bancos a la vez. No contar E-01/E-02/E-03/E-04 como recibidos.

No se carga A-01 hasta asociar su placa y puerto, revisar cableado real y conservar respaldo privado verificado. No copiar el puerto histórico de B-02 ni abrirlo para probar estos sketches. Un archivo de respaldo no demuestra restauración ensayada.

## Qué falta confirmar o conseguir

- **Ambiente:** lectura de etiquetas y variante del PIR; alimentación que cumpla su ficha, con OUT compatible. Sin multímetro, usar documentación exacta/etiquetas; si no resuelven la ruta USB–VIN, mantener VCC del PIR desconectado. El puente H/L no alimenta. B-03 requiere identificación de breakout y pull-up; el pull-up externo es una rama DATA→10 kΩ→3,3 V, nunca serie con VCC ni divisor.
- **B-08:** copiar `+ → 3V3`, `G → GND` y `AO → GPIO34`; no usar 5 V. DO no participa. El sketch produce señal relativa sin calibración en dB.
- **D-07:** confirmar cabecera montada, etiquetas VCC/GND/SD/LR/WS/SCK y desacoplo. Datos I²S distintos de AO; SD es salida del micrófono. L/R se fija a GND para seleccionar izquierdo.
- **LEDs:** contar tres resistencias C-01 de 1 kΩ libres; si solo hay una, probar los LEDs sucesivamente con LED/pulsador, no omitir resistencias.
- **B-10:** leer el controlador. Si es MAX7219 a 5 V, hace falta buffer 3,3→5 V compatible (familia AHCT como candidato; encapsulado/pinout/decoupling todavía por elegir) y fuente 5 V dimensionada. No se ha inventariado ese buffer ni se cierra un conteo ficticio de cables. No conectar directamente GPIO13/14/15 al módulo.
- **B-09:** identificar activo/pasivo, tensión y consumo; solo entonces especificar transistor/etapa, resistencias y protección si procede. El símbolo + no aporta esos valores. No existe aún un circuito completo para energizar.
- **B-11/D-05:** el relé puede ensayarse sin carga únicamente tras confirmar A-01 y su pin VIN/5V, la lógica LOW y la compatibilidad de IN1. El fan permanece desconectado: para moverlo falta una fuente DC regulada de 5 V con corriente de arranque suficiente, cable de potencia y adaptador del conector blanco. COM/NO son contactos de carga; no IN1. Sin conmutación de red eléctrica ni motor/bobinas desde GPIO/3V3.
- **Luz:** para #5 falta un BH1750 con breakout identificado y compatible; no se compra ni selecciona variante automáticamente. LED no equivale a sensor y LDR sin caracterización no da lux.

## Firmware y evidencia reproducible

Arduino CLI **1.5.1**, ESP32 core **3.3.12**, FQBN de compilación `esp32:esp32:esp32doit-devkit-v1`. DHT sensor library **1.4.7**, Adafruit Unified Sensor **1.1.15**; B-08/INMP441/LEDs usan el core sin librerías externas nuevas. No se identifica A-01 por haber compilado ese FQBN.

Ejecutado: `bash scripts/ci/benches-build.sh`. Programa / RAM global reportados por Arduino, en bytes:

| Sketch/perfil | Programa | RAM global |
|---|---:|---:|
| ambient_bench conjunto | 274564 | 22140 |
| led_button_bench | 272220 | 22140 |
| sound_bench | 279640 | 22228 |
| inmp441_bench | 286336 | 22308 |
| status_led_bench | 272144 | 22132 |
| ambient_bench BENCH_DHT_ONLY | 274372 | 22140 |
| ambient_bench BENCH_PIR_ONLY | 272148 | 22116 |

No son mediciones de memoria dinámica, corriente o estabilidad física. `scripts/ci/arduino-install.sh` fija dependencias; `firmware-build.sh` ejecuta también los bancos al seleccionar `all`. No requiere claves ni USB.

- `bash scripts/ci/sensor-benches-host.sh`: ejecuta los sketches reales de ambiente/ADC/LEDs con stubs; NaN/null, separación de perfiles, calentamiento/cambios PIR, ventanas ADC, clipping, comandos inválidos/overflow y estadística signed24 de I²S.
- `bash scripts/ci/bench-host.sh`: sketch LED/pulsador (rebote/mantenimiento) y NFC (fallo/retirada/reentrada).
- Las pruebas web contrastan agujeros, terminales, redes, preservación NFC, GPIO del firmware, campos nuevos del parser y recorridos fuera del cuerpo ESP32.
- INMP441 usa RX estéreo con slots de 32 bits, 16 kHz; toma el slot izquierdo y descarta derecho, manteniendo 64 relojes por trama. Timeout/error explícitos y muestras/pico/RMS relativos cada 500 ms. Es compilación y procesamiento probado con datos sintéticos, **no audio capturado**.

Las guías generadas incluyen comandos con `--output-dir` / `--input-dir` para cargar exactamente el binario compilado, solo después de comprobar montaje/placa/puerto/respaldo. Consola a **115200**. No activar potencia desde estos comandos.

## Interfaz, datos y exportación

`missions.ts` enlaza el registro de cada banco con datos de montaje/ensayo. El renderer comparte datos con JSON/SVG y guías regeneradas mediante `node web/scripts/export-hardware-missions.mjs`. Se conservan tokens ClassAI, Geist/Geist Mono, lateral, dibujo, inspector y pasos.

Extensiones opcionales de `version:1`: `bankId`, `parts[].placement` (coordenadas SVG), `wires[].jumper` y `wires[].pending`. Los JSON antiguos conservan lectura: PN532→NFC, otros JSON v1 anteriores→ambiente. La clave local `classai.hardware.v1` se mantiene; no hay migración/escritura automática. Solo Guardar revisión persiste. Borradores por banco en memoria, importación/revisión recuperada seleccionan su banco. Historial previo conservado incluso al navegar entre bancos.

En la revisión inicial una conexión `pending` se dibujaba discontinua; desde R-026 se dibuja continua para poder seguir el cable y **se excluye de continuidad modelada**. El inspector explica el bloqueo. El analizador comprueba las redes declaradas, no tensión real, dimensiones, continuidad medida o permiso para energizar. Los footprints del LED/pulsador son referencias que deben cotejarse con las piezas.

Capturas de navegador locales ignoradas por Git: `web/screenshots/montajes-*-desktop.png` y `*-mobile.png`. Revisar números, agujeros, cruces, USB y ausencia de cables a través de PCBs; escala ampliable para inspección. SVG exporta todos los cables incluso durante un paso.

| Before | After | Why |
|---|---|---|
| Solo NFC/ambiente reconocidos como bancos físicos | Registro por ID con borradores/importación de los bancos nuevos | Evitar que una selección recupere el ambiente de otro banco |
| Recorridos desde GPIO izquierdos atravesaban el ESP32 | Salida por el lateral y paso por debajo; test geométrico | Poder seguir el cable sin cruzar el cuerpo de la placa |
| Pendientes mezclados con continuidad propuesta | Cables discontinuos excluidos del grafo confirmado | No presentar una conexión incierta como habilitada |

## Coordinación y límites

#91–#93 continúan asignadas a Landov311 y abiertas en la consulta de esta entrega; no se encontró una PR entregada que sustituya esos contratos. No se implementaron mascota, assets, salida MAX98357A ni firmware TFT. Conservar su mapa conjunto candidato BCLK33/WS25/DIN22 y TFT14/23/5/27/26; los bancos INMP441 y LEDs son ensayos separados. No cerrar #4 por DHT11 ni #5 sin BH1750; las pruebas físicas de #7–#10 siguen pendientes. No se modificaron responsables ni estados de issues.

La PR incorpora #95 y sus antecesores porque `main` aún no contenía el visor. Los conflictos Android se resolvieron conservando íntegramente la versión validada de `origin/codex/hardware-viewer`, manteniendo el trabajo de los bancos en commits separados. No se fusiona automáticamente.

## Comprobaciones de la entrega

- Web: **80 tests Vitest + 3 checks de tokens**, typecheck, ESLint y build aprobados. Prueba de navegador sobre build de producción: **16 entradas**, aislamiento, pasos, exportación SVG/JSON, rechazo de importación, borradores, guardado/recarga de B-08 y conservación de historial previo, Atrás/Adelante, escritorio/móvil y claro/oscuro. Editar un cable conserva su condición eléctrica pendiente; también se detecta ocupación duplicada en cables condicionados.
- Host firmware: confort (19 casos), APDU, parser/perfil NFC_ONLY, LED/NFC aislados y sketches/estadísticas nuevos aprobados. Incluye RX I²S izquierdo, trama incompleta, timeout/error y fallo de inicialización con stubs.
- Backend por incorporación de #95: **65 tests aprobados, uno omitido**; smoke MQTT con broker/SQLite/API reales y fixtures sintéticos aprobado; Ruff de errores fatales y 8 tests de scripts aprobados. No se tocó el broker/base de ensayo físico.
- Android por resolución de la base: **20 tests aprobados y assembleDebug**. APK local ignorado por Git; no se instaló ni cambió ninguna credencial.
- Impeccable: detector `[]` sobre UI cambiada. Taste Skill sobre producción, 1440/768/390: **0 FAIL, 1 WARN**, margen móvil de 15 px del texto de pasos heredado. Excepción explícita para colores de conductores (`rainbow-chart`). Capturas inspeccionadas: PCB/USB, números, cruces y componentes legibles al ampliar; en móvil usar escala para leer contactos. No se eliminan colores de cables para satisfacer un detector de gráficos.

Estos resultados prueban software, no continuidad real ni aprobación para energizar. Ninguna simulación nueva ejecutada; la simulación DHT22 histórica continúa siendo sustitución explícita y no prueba B-03.
