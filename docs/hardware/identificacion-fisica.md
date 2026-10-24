# Verificación fotográfica y alimentación — ClassAI
Fecha de revisión: 24/10/2026. Evidencia: fotografías entregadas en la conversación. El registro **no publica imágenes personales ni números de pedido**. Las marcas leídas en el componente prevalecen sobre la descripción de tienda. Una foto no equivale a una prueba eléctrica. Consultar los IDs y propietarios en [inventario.md](inventario.md), señales y firmware en [conexiones.md](conexiones.md).

## Componentes físicamente identificados
| ID | Evidencia confirmada en las fotos | Lo que NO confirma la foto | Conexión prevista |
|---|---|---|---|
| D-05 | Ventilador PENGDALANTU («鹏达蓝图»), Brushless Fan, DC 5V, Made in China; cables rojo/negro y ficha blanca de **dos posiciones**; apariencia cuadrada | Corriente nominal / pico de arranque, dimensiones exactas 4010 (solo anuncio), fabricante verificable por ficha, polaridad comprobada y familia/paso del conector | Fuente de 5 V DC con corriente suficiente; contacto seco NO/COM del relé, **nunca** GPIO/3V3 |
| D-04 | PCB serigrafiada **1.54TFT-SPI-ST7789 Ver:1.1**; ocho pines GND, VCC, SCL, SDA, RST, DC, CS, BL; cabecera montada | Regulador real, tolerancia de VCC a 5 V, control de BL, calidad de soldaduras y 240×240 exactos del panel | SPI 3,3 V tras validar VCC y BL; código mascota usa SCK14, MOSI23, CS5, DC27, RST26 |
| D-01 | PCB «NFC MODULE V3» y «ELECHOUSE»; selector DIP de dos canales; SCK/MISO/MOSI/SS/VCC/GND/IRQ/RSTO, SCL/SDA/VCC/GND y HSU GND/VCC/TXD/RXD | Autenticidad comercial del fabricante, lectura funcional, posición eléctrica real del selector y contactos sin soldar | SPI 3,3 V, VCC 3,3–5 V según manual del diseño V3; soldar cabezal antes de pruebas |
| B-10 | Una sola matriz 8×8, un DIP de 24 patas; entrada **VCC/GND/DIN/CS/CLK** y salida para cascada **VCC/GND/DOUT/CS/CLK** | Marcado del DIP y confirmación MAX7219; alimentación y niveles altos admitidos por placa específica | Si se confirma MAX7219 a 5 V, usar adaptador de señales 3,3→5 V, no asumir compatibilidad directa |
| B-11 | Dos relés marcados **TONG LING JQC-3FF-S-Z 5VDC**; terminales NO2/COM2/NC2 y NO1/COM1/NC1; control GND/IN1/IN2/VCC y bloque JD-VCC/VCC/GND con puente amarillo; dos integrados ópticos de cuatro pines por lado (marcado no fiable en foto) | Disparo LOW/HIGH, que un HIGH de 3,3 V desactive correctamente, aislamiento efectivo, circuito del jumper, corriente de placa y potencia admisible de motor DC | Bobinas de 5 V; control por GPIO solo **tras prueba de nivel**, contactos para alimentación DC del fan |
| B-09 | Buzzer cilíndrico negro, dos patas, orificio acústico, símbolo **+** visible | Fabricante/modelo, activo/pasivo, tensión, consumo y si GPIO puede accionarlo sin transistor | Solo tras identificar y ensayar tensión/corriente; respetar polaridad |
| B-08 | Placa roja con micrófono electret, U1 de ocho terminales, potenciómetro **W104/VR1**, LED1/LED2; cabezal **AO / G / + / DO** de arriba abajo en foto | Número de referencia impreso, KY-038 frente a otras variantes, tensión efectiva de AO/DO y precisión en dB | Sensor analógico de ruido relativo + salida digital de umbral; alimentación y tensiones de salida primero, ADC1 del ESP32 después |

**Lectura prudente:** PENGDALANTU es el texto de una etiqueta, ELECHOUSE es serigrafía de PCB y TONG LING identifica el relé electromecánico; ninguno identifica necesariamente al vendedor del módulo terminado. KY-038, MAX7219 y el paso JST son **hipótesis**, no datos confirmados.

## Procedencia: proveedor de tienda versus fabricante
Los nombres proceden de capturas de AliExpress, **no** de facturas ni verificación de autenticidad. D es compra conjunta con piezas declaradas recibidas; E es compra personal que continuaba como «esperando entrega» en captura. No publicar links de cuenta, códigos de seguimiento ni números de pedido.

| ID / grupo | Producto de la captura | Tienda mostrada | Estado/propiedad |
|---|---|---|---|
| D-05 | 4010 5V/Negro/Black | YX Technology | Equipo, en mano |
| D-09 | Lote 2 altavoces 4 Ω/3 W | KY WIN ROBOT Store | Equipo, en mano |
| D-08 | MAX98357A, Small chip | SZFYDOSH Technology Store | Equipo, en mano |
| D-07 | 1pcs INMP441 | JiaDenuo Store | Equipo, en mano |
| D-10 | Cable micro USB plata (longitud no confirmada) | KIMCHOW 3C Store | Equipo, en mano |
| D-04 | TFT 1.54 Inch | YouKeyi Store | Equipo, en mano |
| D-01/D-02/D-03 | PN532 V3 y tarjeta/llavero | Tienda oficial ZAVE (denominación del escaparate) | Equipo, en mano |
| D-06 | PIR HC-SR501-green | Nombre de tienda no legible en captura | Equipo, en mano |
| E-01 | ESP32 38Pin Type C | 3C-World Dropshipping Store | Personal, recepción pendiente |
| E-02 | Protoboard 400 Points | Eiechip Official Store | Personal, recepción pendiente |
| E-03 | Dupont 20cm KIT | Realpoy Module Wholesale Store | Personal, recepción pendiente |
| E-04 | Kit R3 mini breadboard, sin Arduino | S+S+S+ Store | Personal, recepción pendiente |

Precios del anuncio y variantes seleccionadas no son evidencia de funcionamiento o recepción. A = préstamo de Adrián; B = universidad, préstamo formal; C = profesor, material temporal; D = equipo, compra conjunta; E = personal, compra pendiente. Véase [inventario.md](inventario.md) para cantidades y devoluciones.

## Alimentación y lógica (montaje propuesto, NO probado)
1. **ESP32**: conectar a Mac/hub mediante USB de datos **si el hub soporta la carga agregada**. El USB alimenta el ESP32; no hacer pasar corriente del motor ni de las bobinas a través del regulador de 3,3 V o GPIO. No alimentar un ESP32 simultáneamente por USB y por un pin de entrada 5V/3V3 sin un diseño explícito de gestión de potencia.
2. **Fuente de carga**: utilizar una fuente **DC regulada de 5 V**, externa al hub por defecto, comprobando voltaje de salida, capacidad de corriente, conectores/polaridad y margen para arranque. No se conoce todavía la corriente del ventilador ni el consumo completo de la placa relé. No afirmar que el hub es suficiente ni que una fuente particular de 2 A está verificada.
3. **Ventilador ON/OFF en un canal del relé**: solo después de comprobar con multímetro los contactos. Camino propuesto **+5 V externo → COM1 → NO1 → positivo del ventilador; negativo ventilador → negativo fuente**. NO1/COM1 son contactos y **no** alimentación de bobina. El ventilador no se conecta a IN1 ni GPIO. Verificar polaridad antes de usar el conector blanco; su paso no está identificado.
4. **Bobina y activación**: los encapsulados dicen 5VDC, pero el módulo B-11 exige confirmar el lado JD-VCC/VCC, función real del jumper, masa de referencia, consumo, nivel activo y compatibilidad de IN1 con 3,3 V. El marcado PC817 u optoacoplamiento aparente **no demuestra aislamiento**. No modificar el puente energizado.
5. **Cargas digitales**: PN532 modo SPI y TFT usar señales de 3,3 V. Matriz presumiblemente MAX7219 a 5 V: si se confirma, adaptar DIN/CS/CLK a niveles válidos; no aplicar 5 V a GPIO ESP32. El micrófono B-08 no ha sido validado con 3,3 V; no aplicar AO/DO a un ESP32 hasta medir o verificar niveles.
6. **Audio**: D-07 INMP441 es entrada de voz I²S (3,3 V); D-08 MAX98357A es amplificador I²S (VIN según placa/ficha); D-09 son dos altavoces pasivos 4 Ω / 3 W, **uno por salida mono del amplificador**, no directos a GPIO ni dos en paralelo sin rediseñar impedancia. B-09 buzzer es un dispositivo independiente.
7. Usar **solo tensión DC de baja tensión**. Probar por separado, con cables apagados al modificarlos y fusible/protección apropiados en instalación final. No usar contactos con tensión de red.

**Nota sobre bobina:** las fichas técnicas JQC-3FF-S-Z de referencia describen bobinas 5 V (aprox. 0,36 W por bobina en una versión típica), pero esta cifra NO es una medición del consumo de B-11 ni incluye LEDs/electrónica. Las capacidades de contacto para cargas resistivas no autorizan aplicar el mismo límite a un motor de corriente continua.

## Mínimo pendiente para probar el ventilador
| Tipo | Elemento / comprobación | Acción |
|---|---|---|
| Imprescindible | Fuente de 5 V DC y cableado seguro de baja tensión | Confirmar etiqueta OUTPUT y capacidad para arranque de ventilador + relé; podría servir cargador USB con salida comprobada, pero requiere adaptador a cables |
| Imprescindible | Conector compatible con ficha blanca de 2 posiciones del fan **o** empalme soldado/aislado | Medir paso y polaridad; no comprar «JST-XH/PH» por apariencia |
| Imprescindible | Comprobar lógica de activación B-11 con 3,3 V y alimentación JD-VCC/VCC | Si no funciona adecuadamente, añadir etapa de adaptación/transistor adecuada |
| Imprescindible | Multímetro/medición y verificación de contactos COM/NO | Herramientas anunciadas, disponibilidad real por confirmar |
| Condicional | Headers, cable Dupont y soldadura | Revisar lote D-11 y kit personal antes de volver a comprar |
| Opcional | Buffer nivel lógico tipo 74AHCT para matriz confirmada MAX7219 | No bloquea fan ni PN532 |
| Opcional | Fusible y supresión de transitorios dimensionados para carga DC | Recomendable para robustez; elegir tras corriente de arranque |

### Lo que NO se necesita comprar de nuevo, por ahora
Otros ESP32, otro ventilador, otro relé, otro PN532, más pantallas, amplificador adicional, cables Dupont o protoboards **antes de recibir/contar E**.

## Referencias técnicas públicas (son referencias de diseño, no prueba de clon)
- [Espressif ESP32-DevKitC: alimentación y GPIO](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html).
- [Elechouse PN532 V3: selector HSU/I²C/SPI y alimentación](https://www.elechouse.com/elechouse/images/product/PN532_module_V3/PN532_%20Manual_V3.pdf).
- [TONG LING JQC-3FF-S-Z: ficha de familia distribuida por Denkovi](https://denkovi.com/Documents/JQC-3FF-S-Z.pdf).
- [Joy-IT KY-038: referencia funcional, NO identificación confirmada B-08](https://sensorkit.joy-it.net/en/sensors/ky-038).
- [Analog Devices MAX7219: referencia condicional para B-10](https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf).
- [TDK INMP441: micrófono I²S](https://invensense.tdk.com/wp-content/uploads/2015/02/INMP441.pdf).
- [Analog Devices MAX98357A: amplificador I²S](https://www.analog.com/en/products/max98357a.html).
- [LCDWiki MSP1541 ST7789, módulo similar (no garantiza la tensión de D-04)](https://www.lcdwiki.com/res/MSP1541/1.54inch_4-line-SPI_IPS_Module_MSP1541_User_Manual_EN.pdf).

## Registro de verificaciones pendientes
- D-05: amperaje en funcionamiento y arranque; dimensiones y paso/polaridad conector.
- B-11: multímetro, corriente total de placa, compatibilidad 3,3 V, jumper, modo LOW/HIGH y estado seguro de arranque.
- B-09: lectura de marcas adicionales, activo/pasivo y potencia.
- B-08: foto reverso/marca U1; tensión de alimentación segura y tensión máxima AO/DO.
- B-10: macro del DIP para confirmar MAX7219.
- D-04: VCC/BL, panel real y soldadura de pinera.
- D-01: headers, selector SPI OFF/ON y prueba tarjeta/llavero.
- E-01 a E-04: recepción, conteo de kit y características físicas.
- Cargadores/hub: modelo, etiqueta OUTPUT y número de puertos/corriente disponible.
