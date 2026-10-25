# Banco M-04/05: ESP32 de 30 pines + DHT11 + PIR

Diseño de referencia revisado el 24/10/2026. ESP32 **DEVKITV1 de 30 pines**
observado en fotos 7/8, aún sin asociarlo a A-01/B-02 ni a un puerto USB. D4, D5,
VP y VN son legibles. La otra placa conserva su pinout reportado. DHT11 B-03 con
**− / OUT / +** reportado previamente. El PIR de fotos 1–6 coincide visualmente
con el HC-SR501 declarado; sus tres etiquetas y el chip no son legibles, por lo
que el orden dibujado sigue siendo una referencia, no una lectura de esas fotos.

**Receta preferida: sin H–H**, cuya ausencia confirma Joaquín. Solo usa M–H y
un M–M, con uniones en la protoboard; no requiere soldar ni forzar el PIR dentro
de ella. No hay ensayo eléctrico ni medición de VIN.

## Objetivo y evidencia disponible

Obtener temperatura/humedad DHT11 por GPIO4 y movimiento PIR por GPIO27, en un
sketch sin WiFi, NFC, pantalla ni actuadores. El ejemplo completo está en la
web `/montajes?guia=ambiente` (mantiene el guardado local hasta guardar otra revisión; botón **Cargar guía completa** si existe un borrador anterior).
El botón reemplaza solo el borrador en memoria, permite deshacer y conserva sus
revisiones; exportar el borrador anterior antes de guardarlo como otra revisión.

El dibujo identifica un **DevKit V1 de referencia, USB abajo**, con 15 contactos
por lado, antena arriba y GPIO numerados. Tener 30 pines no demuestra que la
placa real tenga ese orden. Contrastar cada etiqueta antes de trasladar una
posición del dibujo. DHT11 se representa como módulo de tres terminales según
el relato, no como sensor suelto de cuatro patas. El PIR se ilustra para reconocer
lente, potenciómetros y selector; su orden VCC/OUT/GND es una referencia que debe
confirmarse en reverso. No intercambiarlo por el selector H/L.

## Alimentación prevista

- Solo USB como entrada al ESP32; sin fuente externa simultánea a VIN/3V3.
- Riel izquierdo +: **3,3 V desde 3V3** por LP29. Negativo izquierdo libre.
- Riel derecho −: **GND** desde GND derecho por RN28. Positivo derecho libre.
- DHT11 + → LP15 (3,3 V), − → RN5, OUT → A8; GPIO4 → B8. R1 10 kΩ entre
  C8 y G8, alimentada por LP8–J8. Confirmar pull-up incorporado y funcionamiento
  de B-03 a 3,3 V; no subir el módulo a 5 V por ensayo/error.
- VIN → F20, H20 → VCC identificado del PIR: **F20–J20 son un solo nodo de
  alimentación nominal 5 V pendiente de confirmar**. No unirlo con 3,3 V.
- GPIO27 → G24, J24 → OUT identificado del PIR: **F24–J24 son otro nodo**,
  exclusivo de datos. No confundir fila 20 con 24 ni columna izquierda/derecha.
- PIR GND → RN30, compartido con DHT11 mediante el riel derecho negativo.
- Referencia HC-SR501: alimentación 5 V, salida lógica alrededor de 3 V según
  Joy-IT. Mantener pendientes ruta USB–VIN y nivel/orden reales. El puente
  amarillo selecciona disparo; no alimenta el sensor. Ajustar sin alimentación.

Este presupuesto solo contempla sensores. No añadir ventilador, bobinas, audio
u otras cargas al USB/regulador a partir de este diseño. No es una medición de
consumo ni certificación de fuente/hub.

## Mapa pin a pin y secuencia

Protoboard de referencia de 30 filas, con A–E y F–J separadas. LP/LN significan
riel izquierdo positivo/negativo; RP/RN, derecho positivo/negativo. Los números
identifican el contacto a la altura de esa fila. Confirmar el equivalente físico
porque no todas las protoboards numeran sus rieles igual.

Colocar R1 entre **C8 y G8**, cruzando la ranura. Así la pata 1 queda en el nodo
A8/B8/C8 y la pata 2 en G8/J8. El cuerpo y longitud de patas deben poder alcanzar
esos contactos; el dibujo no es una plantilla métrica.

| Paso | Desde | Hasta | Tipo / función |
|---|---|---|---|
| 1 | ESP32 GND derecho | RN28 | M–H negro; masa de ambos sensores |
| 2 | ESP32 3V3 | LP29 | M–H rojo; riel izquierdo + |
| 3 | RN5 | DHT11 − | M–H negro |
| 4 | LP15 | DHT11 + | M–H rojo |
| 5 | DHT11 OUT | A8 | M–H verde |
| 6 | ESP32 D4 / GPIO4 | B8 | M–H verde; A8/B8/C8 comparten tira |
| 7 | LP8 | J8 | M–M rojo; pull-up R1 C8–G8 |
| 8 | RN30 | PIR GND identificado | M–H negro |
| 9 | ESP32 VIN, alimentación confirmada | F20 | M–H naranja |
| 10 | H20 | PIR VCC identificado | M–H naranja; comparte tira con F20 |
| 11 | ESP32 D27 / GPIO27 | G24 | M–H amarillo |
| 12 | J24 | PIR OUT identificado y nivel compatible | M–H amarillo; comparte tira con G24 |

### Adaptación al material disponible

Los pines macho del ESP32 y del PIR reciben las hembras de los jumpers M–H.
Sus extremos macho entran en **agujeros distintos de la misma tira** para
conectarse: F20 con H20 (VCC), G24 con J24 (OUT). La masa aprovecha RN. No hace
falta H–H, empalmes, meter dos puntas en un agujero ni apoyar el PIR forzando sus
patas sobre la protoboard. No unir terminales distintos a una misma tira.

| Medida del dibujo | Referencia inicial | Propuesta compacta histórica | Preferida sin H–H |
|---|---:|---:|---:|
| Jumpers | 12 | 10, incluía 3 H–H | 12, cero H–H |
| Giros | 38 | 20 | 25 |
| Longitud en unidades SVG | 7420 | 4144 | 6658 |

La nueva receta prioriza **11 M–H + 1 M–M** frente a la compacta que dependía de
cables ausentes. C-08 (~16 M–H) y C-07 (~10 M–M) cubren esas cantidades nominales;
falta comprobar cuántos están libres y su alcance, sin asumir recepción de E.
Los valores son del dibujo, no centímetros ni demostración de óptimo global.
La prueba compara todas las parejas de terminales de componentes con la receta
inicial y conserva sus redes, incluidas ambas patas separadas de R1. Los rieles
libres cambian intencionadamente. Cruces con separación blanca no son uniones.

`layout: breadboard` selecciona esta disposición; `compact` y los JSON sin layout
conservan su geometría anterior. Cargar la guía no sobrescribe guardados.
La skill [classai-hardware-assembly](../../.agents/skills/classai-hardware-assembly/SKILL.md)
recoge la revisión de inventario, redes y rutas para futuras modificaciones.

Armar sin USB. Verificar valor de R1, polaridad, separación 3,3/5 V, ausencia de
corto a GND, continuidad y orientación antes de energizar. Comprobar niveles del
PIR con OUT separado del ESP32 y anotar el montaje/medición temporal por separado.

## Por qué A8, B8 y la resistencia no forman un divisor

En la protoboard, **A8/B8/C8/D8/E8 ya son el mismo nodo**, unidos internamente
por una tira de cobre. OUT llega a A8, GPIO4 a B8 y una pata de R1 a C8.
No hay que añadir un cable entre A8 y B8. R1 cruza hasta G8; F8/G8/H8/I8/J8
forman el otro nodo, alimentado desde 3,3 V por el cable rojo LP8–J8.

```text
3,3 V ─────────────────────────── DHT11 +
   │
   └── R1 10 kΩ ──●────────────── D4 / GPIO4
                  └───────────── DHT11 OUT
                    A8/B8/C8
GND ───────────────────────────── DHT11 −
```

El camino **OUT ↔ GPIO4 no atraviesa R1**. La resistencia mantiene la línea alta
cuando está liberada; sensor y controlador se turnan para comunicar llevándola
a LOW. No es un divisor ni una resistencia en serie con la alimentación.
Quitar LP8–J8 desconecta el pull-up externo, no el cable que alimenta +. Si B-03
ya incorpora pull-up a 3,3 V, se puede prescindir de R1 externa tras identificarlo.

**VIN no es una salida regulada de 5 V.** Es la entrada del regulador de 3,3 V;
la ruta desde USB depende de la variante y puede incluir caída en diodos. Antes
del paso 9 de la guía sin H–H: con sensores y otras cargas desconectados y solo USB como fuente,
medir tensión DC VIN–GND y registrar placa, lectura y condiciones. Confirmar
además que la alimentación disponible cumple los requisitos del PIR concreto;
una lectura en vacío no certifica capacidad de corriente. El dibujo naranja es
una propuesta nominal, no una medición. No alimentar USB y VIN externamente a la vez.

## Lectura reportada de las placas y referencia de 38 pines

Vista frontal con USB abajo. Este orden se expresa **de abajo hacia arriba**,
como el relato de Joaquín del 24/10/2026:

| Placa | Izquierda ↑ | Derecha ↑ | Evidencia / pendiente |
|---|---|---|---|
| B-02, universidad | VIN, GND, D13, D12, D14, D27, D26, D25, D33, D32, D35, D34, VN, VP, EN | 3V3, GND, D15, D2, D4, RX2, TX2, D5, D18, D19, D21, RX0, TX0, D22, D23 | Declaración; VN se leyó con duda. Coincide con referencia DevKit V1; falta inspección y USB |
| Primera placa descrita, ID por asociar | Mismo orden aparente, con VN omitido o dudoso | Mismo orden aparente, con D14 en posición esperada D4 y B5 en posición esperada D5 | Esas sustituciones son hipótesis para cotejar, no etiquetas verificadas |

Las fotos 7/8 confirman D4/D5/VP/VN en la placa fotografiada, sin asociación A/B.
El SVG muestra D4/D27 como en la serigrafía de referencia y conserva GPIO4/27
como identidad eléctrica. VP=GPIO36, VN=GPIO39, RX2=GPIO16, TX2=GPIO17,
RX0=GPIO3, TX0=GPIO1. EN y las alimentaciones no son GPIO.

El comparador de la web incluye **ESP32-DevKitC V4 de 38 pines**, tablas J2/J3
oficiales; no cambia el banco de 30 pines. E-01 (38Pin Type C) sigue pedida.
El DevKitC oficial usa micro USB: esa referencia **no identifica** el clon USB-C
comprado. D2 de esa referencia es GPIO9/flash; no equivale a D2=GPIO2 del DevKit
V1 de 30 pines. CLK/D0/D1/D2/D3/CMD quedan reservados para memoria. Confirmar
modelo y serigrafía al recibir E-01 antes de trasladar cualquier posición.

## Firmware preparado, no cargado

[ambient_bench.ino](../../firmware/ambient_bench/ambient_bench.ino) usa DHT sensor
library **1.4.7** y Adafruit Unified Sensor **1.1.15**, presentes en este equipo.
Compilación de referencia: ESP32 core **3.3.12**:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 firmware/ambient_bench
```

La compilación local pasó: 274568 bytes de programa y 22140 bytes globales.
No prueba el FQBN exacto de la placa real ni lectura, alimentación o cableado.
Antes de cualquier carga: identificar placa/puerto/propietario, conservar y
verificar respaldo privado, registrar el cableado y revisar que no haya otras
cargas conectadas a los GPIO del ensayo. No se ejecutó upload ni read-flash.

Consola propuesta a **115200 baudios**; muestreo cada 2,5 s. DHT11 inválido produce
`dht_valid:false` y `null` en la lectura que falla. El PIR dispone de una espera
inicial conservadora de 60 s; durante ella `motion:null` y `pir_warming_up:true`.
Después se imprimen también sus cambios de estado. Esa espera no garantiza la
estabilización de cada módulo; observar la placa real y ajustar si es necesario.

Criterios físicos pendientes: al menos 20 lecturas DHT11; un fallo explícito sin
convertirlo en cero; movimiento, retorno a LOW y reentrada del PIR; ausencia de
reinicios; captura de log sin secretos; foto y desmontaje anotados en el registro.
No completar #4 (DHT22) por un ensayo DHT11 ni #7 por compilar.

## Fuentes y decisiones de diseño

- [Pinout DevKit V1, investigación y diagrama original de CIRCUITSTATE](https://www.circuitstate.com/pinouts/doit-esp32-devkit-v1-wifi-development-board-pinout-diagram-and-reference/): referencia de placa de 30 contactos; no identifica el clon del usuario.
- [Espressif: opciones de alimentación USB/5 V/3V3](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html): referencia de diseño de DevKitC; la ruta USB–VIN del DevKit V1 real debe verificarse por separado.
- [Adafruit: conexión DHT11/DHT22 y pull-up 10 kΩ](https://learn.adafruit.com/dht/connecting-to-a-dhtxx-sensor).
- [Ficha DHT11 distribuida por DFRobot](https://dfimg.dfrobot.com/enshop/image/data/DFR0067/DFR0067_DS_10_en.pdf).
- [Joy-IT: HC-SR501, manual y ajuste del jumper](https://joy-it.net/files/files/Produkte/SEN-HC-SR501/SEN-HC-SR501_Manual_2024-04-16.pdf) y [producto, 5 V/3 V lógico](https://joy-it.net/en/products/SEN-HC-SR501).
- [Emil Kowalski: Design Engineering](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md): consultada para claridad y respuesta de controles; sin instalar código ni dependencias.

| Before | After | Why |
|---|---|---|
| Cajas con cuatro nombres de terminal | ESP32 30 pines, USB, antena y botones visibles | Permitir reconocer orientación y GPIO |
| VCC omitidos | Dos tensiones, masas, pull-up y ruta USB explícitos | Mostrar el circuito completo y sus condiciones |
| Trazos grises iguales | Colores por función y cables con separación visual en cruces | Seguir cada conductor sin confundir cruce con unión |
| Edición ocupa la pantalla | Guía primero, edición y catálogo desplegables | Concentrarse en armar, conservando herramientas avanzadas |

La paleta física distingue PCB verde, sensor azul, carcasa PIR clara, resistor
beige y metal; el resto mantiene Geist y los tokens de ClassAI. No hay movimiento
decorativo. Selección y avance de pasos responden inmediatamente.

## Si no hay multímetro

Joaquín indica que no dispone de uno. Se puede continuar con identificación
por etiquetas/fotos, documentación de la variante y ensayo virtual; no convertir
una lectura virtual en medición VIN física ni alimentar una conexión todavía
dudosa. No se exige comprar instrumentos para continuar diseñando.

Se preparó y ejecutó parcialmente [ambient_simulation](../../firmware/ambient_simulation/README.md):
Wokwi, con **DHT22 sustituto**, observó cambios 24 °C/40 % → 29 °C/65 %. PIR
LOW observado; HIGH/retorno pendientes. No valida el DHT11 físico ni sustituye
el firmware `ambient_bench`. Ver R-007 y el extracto serial de simulación.

[Adafruit: tiras de cinco contactos de la protoboard](https://learn.adafruit.com/breadboards-for-beginners/breadboards). Las parejas F20/H20 y G24/J24 usan ese principio; no se ha certificado la continuidad del ejemplar físico.

## Ensayos separados y pendientes explícitos · R-025

El visor ofrece ahora **DHT11 aislado**, **PIR aislado** y el conjunto. Las guías
[DHT11](esquemas/dht11.md) y [PIR](esquemas/pir.md) incluyen JSON/SVG físicos,
extremos y comandos exactos con los flags `BENCH_DHT_ONLY` / `BENCH_PIR_ONLY`.
El primero no inicializa/lee PIR; el segundo no incluye/inicializa DHT.
El perfil sin flags conserva el conjunto. Muestreo de 2,5 s y espera PIR de 60 s.

Las alimentaciones/terminales pendientes se dibujan discontinuos y se excluyen de
la continuidad modelada. El mapa histórico completo de esta guía sigue siendo
referencia, **no habilitación de VIN o del PIR real**. No hace falta comprar
multímetro para continuar el diseño: si etiquetas/documentación exacta no resuelven
un dato, se mantiene esa conexión desconectada. B-03 sigue requiriendo identificar
breakout y pull-up; ninguna simulación resuelve esa identificación.

Probar con A-01 solo tras identificar placa/puerto, preservar respaldo y registrar
cableado real; B-02 sigue en NFC. Dibujos conservan las redes previstas del banco
anterior al retirar las condiciones, comprobadas para todas las parejas de
terminales. [Resultados de compilación y materiales](bancos-fisicos.md).
