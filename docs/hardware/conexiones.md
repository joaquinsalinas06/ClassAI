# Señales, GPIO y conflictos

Consultar IDs y propiedad en [inventario.md](inventario.md). Esta guía distingue
**asignaciones presentes en código**, **referencias de componente** y **propuestas
para pruebas aisladas**. No es un esquema de conexión simultánea ni confirma la
tensión/pinout de un clon. Desconectar alimentación antes de cambiar el montaje.

## Cuántas señales consume cada pieza

Las cifras son GPIO de señal, aparte de VCC/GND y de terminales de potencia.
Se cuentan por módulo aislado; SPI o I²S pueden compartir algunas señales solo
tras diseñar y verificar esa configuración.

| IDs | Interfaz / señales | GPIO de señal | Pendiente antes de conectar |
|---|---|---|---|
| B-05/06/07, C-05/06 | LED: ánodo/cátodo y resistencia en serie | 1 por LED controlado individualmente | Polaridad, resistencia y corriente; seis LEDs no son una única señal |
| C-04 | Pulsador hacia GND, entrada con pull-up | 1 | Identificar parejas internas; cuatro patas no son cuatro GPIO |
| B-03 | DHT11: DATA | 1 bidireccional | Pinout real, alimentación/pull-up y configurar driver DHT11, no DHT22 |
| B-04, D-06 | PIR: OUT | 1 entrada por módulo | Modelo y VCC/OUT/GND; no inferir orden por color o posición de la lente |
| B-08 | AO analógico / DO umbral: pines **AO/G/+/DO** confirmados por foto; sensor tipo KY-038 no certificado | 1 ADC; opcional 1 digital más | Verificar alimentación real y máxima tensión de AO/DO, no conectar salida de 5 V directamente al ESP32; no mide dB calibrados |
| D-01 | SPI: SCK, MISO, MOSI, CS/SS | 4 | Soldar conectores, identificar V3 y ajustar modo SPI sin alimentación; IRQ/RSTO no usados por el driver actual |
| D-04 | **1.54TFT-SPI-ST7789 Ver:1.1**, pines **GND/VCC/SCL/SDA/RST/DC/CS/BL**, SPI | 5; +1 si BL se controla por GPIO | Serigrafía ST7789 confirmada; VCC/BL del breakout y panel físico aún por validar; SCL/SDA aquí no implica I²C |
| B-10 | Matriz 8×8: entrada VCC/GND/**DIN/CS/CLK**; cascada VCC/GND/**DOUT/CS/CLK**; controlador probable MAX7219 | 3 | Leer chip; si es MAX7219 a 5 V, nivel HIGH especificado supera 3,3 V: colocar conversor tipo AHCT |
| D-07 | INMP441: SCK/BCLK, WS, SD hacia ESP32 | 3 I²S | Alimentación 3,3 V; L/R fija canal, no dejarlo flotante |
| D-08 | MAX98357A: BCLK, LRC/WS, DIN desde ESP32 | 3 I²S; controles opcionales aparte | VIN, GAIN y SD del breakout; SD aquí es control, no los datos SD del micrófono |
| B-09 | Buzzer polarizado de dos patas, signo **+** fotografiado | 1 | Activo/pasivo, tensión/corriente y necesidad de transistor sin comprobar; no asumir que puede alimentarse con GPIO |
| B-11 | Dos relés TONG LING **JQC-3FF-S-Z 5VDC**. Control **GND/IN1/IN2/VCC**, jumper **JD-VCC/VCC/GND**; contactos NOx/COMx/NCx | 2 si se usan ambos canales | Bobinas 5 V confirmadas; disparo alto/bajo, 3,3 V compatible, función jumper y corriente placa sin prueba; no inferir aislamiento del opto aparente |
| D-05 | Ventilador **PENGDALANTU DC 5 V**, 2 hilos y ficha blanca de 2 posiciones | 0 directo; 1 control mediante canal de relé | Tensión 5 V confirmada; corriente de arranque y conector no identificados, NO alimentar desde GPIO ni 3V3 |
| D-09 | Altavoz entre SPK+ y SPK− del amplificador | 0 GPIO directos | Conector y polaridad; ninguno de esos terminales es GND; probar un altavoz, no dos de 4 Ω en paralelo |

Tarjeta D-02 y llavero D-03 no requieren GPIO propios: se presentan al lector.
Un segundo altavoz no convierte al amplificador mono en estéreo.

## Asignaciones del repositorio al registrar este documento

Estas tablas describen el código, no una prueba física aprobada.

**Mascota / pantalla D-04:**
[prototipo/mascota_claude_basica/main.ino](../../prototipo/mascota_claude_basica/main.ino).
El programa usa ST7789, inicialización 240×240 y un lienzo de 192×192.

| Etiqueta TFT | Función | GPIO del prototipo |
|---|---|---:|
| SCL | SCK | 14 |
| SDA | MOSI | 23 |
| CS | Selección | 5 |
| DC | Datos/comandos | 27 |
| RST | Reset | 26 |
| BL, VCC, GND | Iluminación/alimentación | No están definidos como GPIO en ese archivo; verificar cableado real |

**Nodo integrado:**
[firmware/classai_node/classai_node.ino](../../firmware/classai_node/classai_node.ino)
y [nfc_reader.cpp](../../firmware/classai_node/nfc_reader.cpp).

| Función | GPIO declarados | Situación en la base del repositorio |
|---|---|---|
| PN532 SPI | SCK 18, MISO 19, MOSI 23, CS 5 | NFC habilitado por defecto; no equivale a validación física |
| I²C MLX90614/BH1750 | SDA 21, SCL 22 | MLX habilitado por defecto, pero no inventariado; BH1750 tampoco inventariado |
| DHT | DATA 4 | Código opcional para DHT22; el disponible es DHT11 |
| PIR | OUT 27 | Deshabilitado por defecto |
| KY038 | AO 34, ADC1 | Deshabilitado; confirmar B-08 antes de usarlo |
| Pulsador | 32 hacia GND, INPUT_PULLUP | Entrada definida |
| Relé / buzzer | 26 / 17 | Firmware contempla una señal de relé, no ambos canales de B-11 |
| MAX7219 | 13, 14, 15 reservados | Reserva comentada; no hay driver integrado confirmado |

**Conflictos que impiden cargar los dos programas como si fueran uno:**

| GPIO / recurso | Prototipo TFT | Nodo integrado | Consecuencia |
|---|---|---|---|
| 5 | TFT CS | PN532 CS | Dos selecciones distintas no pueden usarlo a la vez |
| 26 | TFT RST | Control relé | El control de relé puede reiniciar la pantalla |
| 27 | TFT DC | Entrada PIR | Dos funciones incompatibles sobre la misma conexión |
| 14 | TFT SCK | Reservado para matriz | Requiere resolver bus/asignación antes de integrar |
| SPI / MOSI 23 | SCK 14 y MOSI 23 | SCK 18 y MOSI 23 | No basta compartir MOSI: son configuraciones de bus diferentes; hay que rediseñar el bus o separar nodos |

Un perfil «sin sensores» debe deshabilitar también inicializaciones y escrituras
de actuadores incompatibles, no solo omitir la lectura. La pantalla está retirada
según la última declaración; no asumir que sigue conectada.

## Referencia para E-01: ESP32 clásico de 38 contactos

Referencia elegida: **ESP32-DevKitC de Espressif**, con dos hileras de 19 contactos.
No identifica por sí sola el clon Type-C comprado. El número de contactos y el
conector USB no garantizan orden, módulo ni controlador USB. Verificar serigrafía
y módulo antes de trasladar GPIO a una posición física.

- Distinguir `GPIOxx` del ordinal del conector: «GPIO14» no significa «pata 14».
- Alimentación: 3V3, 5V y GND no son GPIO; EN reinicia la placa.
- GPIO34/35/36/39 son entradas en el ESP32 clásico; no usar para LEDs, CS o relojes.
- CLK/D0/D1/D2/D3/CMD corresponden a memoria: no usarlos para estos montajes.
- Reservar TX/RX para la consola USB y revisar los pines de arranque antes de
  conectar cargas. GPIO16/17 dependen del módulo; WROVER puede reservarlos.

[Pinout y tablas J2/J3 oficiales](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html#header-block).
No se fija aún un mapa físico «izquierda/derecha» para E-01 ni se presume que las
placas micro USB A-01/B-02 tienen el mismo orden.

## Alimentación y fuentes técnicas

Los GPIO del ESP32 usan lógica de 3,3 V. Separar tensión de alimentación de un
módulo, tensión de sus señales y potencia de su carga. No sumar fan, amplificador
y relés al regulador 3V3 de la placa. Primero identificar consumos/fuente y masas;
no se ha inventariado una fuente externa ni un driver MOSFET/level shifter.
El piloto no requiere conectar red eléctrica a los contactos del relé.

- [ESP32: ficha de Espressif](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf).
- [PN532 V3: manual Elechouse](https://www.elechouse.com/elechouse/images/product/PN532_module_V3/PN532_%20Manual_V3.pdf): alimentación y selección de bus; referencia del diseño V3, no garantía de cualquier clon.
- [TFT ST7789 de referencia](https://www.lcdwiki.com/res/MSP1541/1.54inch_4-line-SPI_IPS_Module_MSP1541_User_Manual_EN.pdf): no confirma regulador/BL de D-04.
- [INMP441: TDK/InvenSense](https://invensense.tdk.com/wp-content/uploads/2015/02/INMP441.pdf).
- [MAX98357A: Analog Devices](https://www.analog.com/en/products/max98357a.html) y [salidas de altavoz](https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/pinouts).
- [MAX7219: Analog Devices](https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf).
- [HC-SR501 de referencia](https://joy-it.net/files/files/Produkte/SEN-HC-SR501/SEN-HC-SR501_Manual_2024-04-16.pdf).
- [Código de resistencias Vishay](https://www.vishay.com/docs/49478/_dale_resistor_color_code_chart_vmn_ms0002_1612.pdf).

No existe ficha exacta identificada para el fan D-05 ni para el buzzer B-09 ni para el módulo completo B-08/B-11; existe **ficha de familia** para relés TONG LING 5 V pero no valida el circuito del módulo;
no completar sus parámetros copiando los de un módulo visualmente parecido.


## Evidencia fotográfica 24/10/2026 y diseño de fuente
Las fotos nuevas están descritas en [identificacion-fisica.md](identificacion-fisica.md) sin subir fotos del usuario al repositorio. D-05 (fan) y las bobinas de B-11 **requieren 5 V DC**, pero esa coincidencia de voltaje NO garantiza una fuente adecuada; se desconoce la corriente de arranque del ventilador y el consumo total del módulo relé.

- Mac/hub USB → ESP32 para programación y alimentación **solo dentro del presupuesto USB confirmado**. No sacar alimentación de motor ni de bobina de un GPIO o del regulador 3V3.
- Fuente DC regulada de 5 V externa por defecto → alimentación de relé validada; por el circuito de contacto COM1–NO1 puede conmutarse el positivo del fan. Negativo del fan vuelve a la fuente de 5 V. Confirmar COM/NO por multímetro, polaridad y calibre.
- Adaptación IN1 a ESP32 depende de prueba de nivel y configuración JD-VCC/VCC/GND: no conectar/controlar en caliente ni asumir trigger LOW por semejanza de módulos.
- No unir dos entradas de alimentación ESP32 (USB y VIN/3V3 externos) sin diseño adecuado; usar una sola ruta para cada ESP32.
- B-08 usa AO/G/+/DO; si el sensor se alimenta a 5 V, **la salida a ADC/GPIO podría exceder 3,3 V**: comprobar nivel antes de conectar.
- No hay aún modelo ni OUTPUT del hub/cargador, por lo que no se valida su capacidad.

[Referencia familia bobinas JQC-3FF-S-Z](https://denkovi.com/Documents/JQC-3FF-S-Z.pdf); [referencia detector KY-038](https://sensorkit.joy-it.net/en/sensors/ky-038).

## Bancos I²S aislados propuestos · 24/10/2026

Estos mapas son nuevos **candidatos de ensayo**, no asignaciones implementadas
en el nodo ni habilitación para conectarlos simultáneamente:

| Banco | Alimentación | Relojes | Datos | Condición |
|---|---|---|---|---|
| M-07A · D-07 INMP441 | 3V3/GND; L/R a GND para canal izquierdo | GPIO26 → SCK/BCLK, GPIO25 → WS | SD → GPIO33 | Revisar módulo/cabecera; driver de captura pendiente |
| M-07B · D-08 MAX98357A + una D-09 | Fuente 5 V DC adecuada → VIN del amplificador; masa común con ESP32 | GPIO26 → BCLK, GPIO25 → LRC/WS | GPIO22 → DIN | Fuente/corriente, GAIN/SD, soldadura y driver pendientes; SPK+/SPK− solo a una bocina, ninguno a GND |

No derivar alimentación de la bocina del GPIO o del regulador 3V3 del ESP32.
No unir dos bocinas de 4 Ω en paralelo sobre la única salida mono. GPIO26
coincide con TFT RST y relé; GPIO25 con LED y WS. Ver [guías por banco](esquemas/README.md)
y sus condiciones. La cabecera/adaptador de NFC y los adaptadores de bocinas
están en proceso de soldadura según Joaquín; no se ha confirmado finalización.

## Guía física NFC

[Montaje PN532 SPI](banco-nfc.md): 3V3/GND y GPIO18/19/23/5,
12 M–H con cabecera macho confirmada: riel + izquierdo para 3V3, − izquierdo
para GND (solo mitad superior) y cuatro tiras de señal independientes.
DIP 1 OFF / 2 ON con alimentación desconectada; IRQ/RSTO y rieles derechos libres.
Coincide con `firmware/nfc_bench`; no cambia el mapa del producto integrado.
