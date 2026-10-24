# Banco M-04/05: ESP32 de 30 pines + DHT11 + PIR

Diseño de referencia de 24/10/2026. Joaquín reporta **ESP32 de 30 pines** y
**DHT11 con etiquetas − / OUT / +**. No se ha asociado la placa a A-01/B-02 ni
se ha comprobado la orientación de lectura de esas etiquetas. El PIR reportado
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
- Riel derecho **+ = 5 V** desde VIN **solo si se verifica que ese terminal entrega
  los 5 V de USB en la variante real**; riel derecho − = GND. No conectar otra
  fuente a VIN mientras se usa USB ni unir ambos rieles positivos.
- Ambos negativos se unen como referencia común. Confirmar continuidad de rieles;
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
| 1 | ESP32 GND | LN28 | Negro, masa izquierda |
| 2 | LN2 | RN2 | Negro, masa compartida |
| 3 | ESP32 3V3 | LP29 | Rojo, alimentación 3,3 V |
| 4 | ESP32 VIN, tras verificar salida USB 5 V | RP29 | Naranja, alimentación 5 V |
| 5 | LN5 | DHT11 − | Negro |
| 6 | LP5 | DHT11 + | Rojo |
| 7 | DHT11 OUT | A8 | Verde, datos |
| 8 | ESP32 GPIO4 | B8 | Verde, mismo nodo de datos |
| 9 | LP8 | J8 | Rojo, lado 3,3 V de la resistencia pull-up |
| 10 | RN20 | PIR GND confirmado | Negro |
| 11 | RP20 | PIR VCC confirmado | Naranja |
| 12 | PIR OUT validado a lógica ≤3,3 V | ESP32 GPIO27 | Amarillo |

Armar sin USB. Verificar valor de R1, polaridad, separación 3,3/5 V, ausencia de
corto a GND, continuidad y orientación antes de energizar. Comprobar niveles del
PIR con OUT separado del ESP32 y anotar el montaje/medición temporal por separado.

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
