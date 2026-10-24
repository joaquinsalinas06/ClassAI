# Banco M-04/05: ESP32 de 30 pines + DHT11 + PIR

Diseño de referencia de 24/10/2026. Joaquín reporta **ESP32 de 30 pines** y
**DHT11 con etiquetas − / OUT / +**. B-02 (universidad) cuenta ahora con un orden de terminales reportado, compatible
con DevKit V1 de 30 pines. La primera placa descrita parece del mismo tipo, pero
su asociación a A-01 y las lecturas D4/D14, D5/B5 y VN siguen pendientes. No se ha
verificado ninguna de ellas por fotografía, chip ni puerto USB. La orientación
de lectura del DHT11 sigue sin comprobarse. El PIR reportado
tiene tres terminales y un selector de tres pines con puente amarillo: coincide
con rasgos del tipo HC-SR501 de B-04/D-06, pero no lo identifica inequívocamente.
No elegir propietario ni ID de PIR por semejanza.

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

- Una sola entrada de alimentación para el ESP32: **USB de datos** desde la laptop.
- Riel izquierdo **+ = 3,3 V** desde 3V3; riel izquierdo − = GND.
- En la guía compacta el PIR recibe alimentación nominal de **5 V desde VIN
  directamente, solo tras verificar la ruta USB y requisitos del módulo real**.
  Los rieles derechos quedan libres. No conectar otra fuente a VIN usando USB.
- La masa del PIR y del DHT11 es común mediante los dos GND del ESP32.
  No hace falta puente entre rieles negativos. Confirmar continuidad de rieles;
  si están cortados, colocar puentes de unión apropiados y registrarlos. La opción
  de riel partido del visualizador permite ver que un extremo queda sin fuente.
- **DHT11 + → 3,3 V; − → GND; OUT → GPIO4.** La referencia de sensor admite 3,3 V,
  pero el módulo B-03 concreto necesita prueba. No subirlo a 5 V por ensayo/error:
  un pull-up del breakout a 5 V podría aplicar 5 V al ESP32.
- **R1 = 10 kΩ** de C-02, bandas café-negro-naranja-dorado si se confirma su valor,
  entre OUT y 3,3 V. Si el módulo ya tiene pull-up, verificar su valor/tensión y
  revisar el paralelo; este diseño no exige comprar otro resistor.
- **PIR HC-SR501 de referencia: VCC → 5 V; GND → GND; OUT → GPIO27.** La referencia
  Joy-IT indica salida lógica de 3 V. Medir/confirmar el HIGH del módulo real y
  que no exceda 3,3 V antes de conectar OUT al ESP32. Los potenciómetros ajustan
  sensibilidad/tiempo y el puente selecciona comportamiento de disparo; nunca
  moverlo energizado.

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

| Paso | Desde | Hasta | Color y finalidad |
|---|---|---|---|
| 1 | ESP32 GND derecho | LN22 | Negro; masa del DHT11 mediante riel izquierdo − |
| 2 | ESP32 3V3 | LP23 | Rojo; riel izquierdo + de 3,3 V |
| 3 | LN5 | DHT11 − | Negro |
| 4 | LP15 | DHT11 + | Rojo; alimentación directa |
| 5 | DHT11 OUT | A8 | Verde; datos |
| 6 | ESP32 D4 / GPIO4 | B8 | Verde; mismo nodo que A8 y R1 en C8 |
| 7 | LP8 | J8 | Rojo; pull-up R1 C8–G8 hacia 3,3 V |
| 8 | ESP32 GND izquierdo | PIR GND confirmado | Negro; masa común por el ESP32 |
| 9 | ESP32 VIN, tras comprobar alimentación | PIR VCC confirmado | Naranja; sin riel de 5 V |
| 10 | PIR OUT validado a lógica ≤3,3 V | ESP32 D27 / GPIO27 | Amarillo |

### Revisión de recorridos, 24/10/2026

La guía compacta coloca PIR a la izquierda del ESP32, junto a los contactos
que utiliza, y DHT11 a la derecha de la protoboard. No mueve las posiciones de
los pines dentro de los módulos. Retira el puente LN–RN y el alimentador del
riel derecho positivo; conecta PIR a VIN y GND izquierdo directamente. Los dos
GND de referencia del ESP32 están unidos dentro de la placa; confirmar su
continuidad física sin alimentación. Los rieles derechos quedan **libres**.

| Medida del dibujo | Referencia anterior | Guía compacta |
|---|---:|---:|
| Jumpers | 12 | 10 |
| Giros no colineales | 38 | 20 |
| Longitud trazada, unidades SVG | 7420 | 4144 |

Se conservan todas las parejas de terminales de componentes que compartían red
(incluidas ambas patas separadas de R1). La diferencia en rieles sin uso es
intencional. Estas cifras comparan las dos propuestas, **no prueban un óptimo
global**, ausencia de cruces ni longitudes físicas. Los cruces con separación
blanca son puentes visuales, no uniones; solo terminales y tiras definen redes.
No doblar un jumper real a 90 grados ni tensarlo para imitar el trazado.

Material de conexión previsto con headers macho: **6 M–H + 1 M–M + 3 H–H**.
C-08 declara ~16 M–H y C-07 ~10 M–M, sin certificar disponibilidad libre o
longitud; **los tres H–H no están confirmados**. Revisar A-02/C-07/C-08 sin
duplicar stock ni asumir contenido E-03/E-04 pendiente. Si faltan H–H, ajustar
la distribución a cables y adaptadores realmente identificados; no improvisar
empalmes ni cambiar pinout para ahorrar cables. R1 sigue en C-02, sin cantidad
exacta ni valor medido. La continuidad de rieles y dimensiones B-01 están pendientes.

Los JSON anteriores sin `layout` conservan su distribución. El ejemplo nuevo
usa `layout: compact`; cargarlo no sobrescribe revisiones ni localStorage.
La skill local [classai-hardware-assembly](../../.agents/skills/classai-hardware-assembly/SKILL.md)
recoge la revisión de inventario, redes y rutas para futuros cambios.

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
del paso 9 de la guía compacta: con sensores y otras cargas desconectados y solo USB como fuente,
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
