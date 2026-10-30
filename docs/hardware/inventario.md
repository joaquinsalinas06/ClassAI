# Inventario físico y propiedad

Fuente: declaraciones de Joaquín del **23/10/2026**; no es un conteo automático
ni una verificación de almacén. Los IDs identifican piezas o lotes de este
inventario, no GPIO ni identidades MQTT.

**Estados:** `en mano` = declarado recibido; `pedido` = recepción sin confirmar;
`incluido por confirmar` = parte esperada de un kit, no otra compra. Las cantidades
`~` son estimadas; `?` significa sin contar. Salvo anotación explícita, ubicación
posterior, foto/serie y prueba física están pendientes. «Devolución pendiente»
significa pieza prestada, no fecha vencida.

## A — Adrián («Auki»)

Propietario: **Adrián**. Custodio declarado: Joaquín. Devolver a Adrián;
**fecha y condiciones por acordar**, no se comunicó un plazo. Todos los registros
A están pendientes de devolución. Se conserva el alias sin inventar apellido.

| ID | Pieza / modelo | Cantidad y unidad | Estado | Uso / observaciones |
|---|---|---|---|---|
| A-01 | ESP32 con micro USB | 1 placa | en mano; identificada por Joaquín 26/10 | Placa de Adrián según Joaquín; ESP32-D0WDQ6 rev 1.0, flash 4 MiB, identidad distinta de B-02 y respaldo propio privado verificado. M-08A/B-10: caras 8×8 observadas; último firmware aislado de caras. Puerto debe reidentificarse al cambiar placa; R-050–R-052 |
| A-02 | Jumpers | ~14 cables | en mano | ~8 iniciales + ~6 posteriores; parte serían macho–hembra, tipos sin separar |
| A-03 | USB a micro USB | 1 cable | en mano | Cable prestado junto con A-01; no duplicarlo como accesorio de la U |
| A-04 | Protoboard descrita como doble/dividida o cortada a la mitad | 1 unidad/conjunto declarado | en mano | Montajes temporales; dimensiones, puntos y número de mitades útiles por confirmar |

## B — Préstamo formal de la universidad

Propietario: **universidad**. Custodio declarado: Joaquín. Devolver por el canal
del préstamo; **profesor responsable, acta, fecha de préstamo y vencimiento no
comunicados**. Todos los registros B están pendientes de devolución.

| ID | Pieza / modelo | Cantidad y unidad | Estado | Uso / observaciones |
|---|---|---|---|---|
| B-01 | Protoboard con A–J, 30 posiciones numeradas y rieles ± laterales | 1 placa | en mano | Probablemente 30 filas; no equivale a 30 puntos. Tamaño total y continuidad de rieles por confirmar |
| B-02 | ESP32 con micro USB, puente CP210x | 1 placa | en mano; identificada | ESP32-D0WDQ6 rev 1.0, flash 4 MiB; identidad/puerto y respaldo privado verificados antes de las cargas. Usada sucesivamente en NFC, M-06 y M-07B; no son montajes simultáneos. Último firmware: variante privada de audio, desarmada al terminar; ver montajes.md |
| B-03 | Módulo DHT11 | 1 módulo | en mano | Temperatura/humedad; NO es DHT22. Joaquín reporta etiquetas − / OUT / + (24/10); Anexo X aportado el 25/10: módulo con pull-up integrado de 10 kΩ y alimentación desde 3 V; cotejar orientación real; ensayo pendiente |
| B-04 | PIR parecido a D-06, de otro color | 1 módulo | en mano | Movimiento; HC-SR501 probable, modelo y orden de pines sin confirmar |
| B-05 | LED verde | 1 LED | en mano | Señalización con resistencia en serie |
| B-06 | LED amarillo | 1 LED | en mano | Señalización con resistencia en serie |
| B-07 | LED blanco | 2 LEDs | en mano | Lote propio de B, separado de C-06 |
| B-08 | Detector analógico/digital de sonido: AO/G/+/DO, micrófono electret y potenciómetro W104/VR1 | 1 módulo | en mano; fotografiado 24/10 | LED1/LED2 y U1 de 8 patas visibles; tipo KY-038 semejante, **no confirmado**. AO respondió al ruido relativo en dos rondas del 25/10 (+3V3/G/AO34); LED de umbral reaccionó según Joaquín. DO no probado, sin dB ni niveles eléctricos medidos; ver R-032–R-039 |
| B-09 | Buzzer cilíndrico con orificio acústico, dos patas y signo + | 1 unidad | en mano; fotografiado 24/10 | Polaridad + visible; tipo activo/pasivo, modelo, tensión y corriente **sin confirmar**. No alimentarlo desde GPIO sin validar |
| B-10 | Matriz LED 8×8, 1 DIP de 24 patas, entrada VCC/GND/DIN/CS/CLK y salida VCC/GND/DOUT/CS/CLK | 1 módulo/conjunto | en mano; fotografiado 24/10 | MAX7219 identificado por la guía de laboratorio Anexo K aportada por Joaquín el 25/10; no se leyó físicamente el chip; dos conectores son entrada y salida de **una misma matriz**, no dos dispositivos. Caras feliz/triste/enojada observadas con A-01 el 26/10; de frente y cara derecha, cables de entrada a la izquierda (giro 0°). Señales directas ensayadas sin garantizar niveles MAX7219; R-050–R-052 |
| B-11 | Relé doble: 2 × TONG LING JQC-3FF-S-Z **5VDC**; COM1/NO1/NC1 y COM2/NO2/NC2 | 1 módulo, 2 canales | en mano; fotografiado 24/10 | Control GND/IN1/IN2/VCC; bloque JD-VCC/VCC/GND con puente amarillo. Bobina 5 V confirmada; Anexo V del laboratorio describe disparo LOW y lógica 5 V; cotejar variante/puente. Corriente de placa, aislamiento y compatibilidad GPIO 3,3 V **pendientes** |

## C — Material temporal facilitado por el profesor

Procedencia: **universidad/profesor**, obtenido con permiso; sin registro formal
comunicado. Custodio: Joaquín. **Revisar devolución con prioridad**, pero no existe
fecha concreta comunicada ni constancia de cesión definitiva. Confirmar si
resistencias/LEDs son consumibles cedidos o deben devolverse; hasta entonces no
tratarlos como propiedad personal. Responsable y condiciones por acordar.

| ID | Pieza / modelo | Cantidad y unidad | Estado | Uso / observaciones |
|---|---|---|---|---|
| C-01 | Resistencias café–negro–rojo–dorado | ? resistencias | en mano | 1 kΩ ±5 % si las cuatro bandas están leídas en ese orden; verificar valor/potencia |
| C-02 | Resistencias café–negro–naranja–dorado | ? resistencias | en mano | 10 kΩ ±5 % bajo la misma condición |
| C-03 | Resistencias con otras bandas, incluidas verdes | ? resistencias | en mano | Valor/potencia pendientes; hace falta secuencia completa o medición |
| C-04 | Pulsador de cuatro patas | 1 unidad | en mano | Un pulsador, no cuatro entradas; comprobar parejas conectadas internamente |
| C-05 | LED rojo | 1 LED | en mano | Señalización con resistencia |
| C-06 | LED blanco | 1 LED | en mano | Distinto del lote B-07 |
| C-07 | Jumpers macho–macho | ~10 cables | en mano | Estimación declarada |
| C-08 | Jumpers macho–hembra | ~16 cables | en mano | Estimación declarada |

## D — Compra conjunta del equipo en AliExpress

Propietario: **equipo ClassAI**, NO exclusivamente Joaquín. Custodio inicial
comunicado: Joaquín. No es un préstamo externo; **custodia y reparto final del
equipo por acordar**, sin asignar automáticamente la propiedad a un integrante.
Recibido según el recuento presencial. Modelos indicados por anuncio/etiquetas;
no confundir con fabricante genuino o comportamiento ya probado.

| ID | Pieza / modelo | Cantidad y unidad | Estado | Uso / observaciones |
|---|---|---|---|---|
| D-01 | PN532 NFC MODULE V3 serigrafiado **ELECHOUSE** | 1 módulo | en mano; fotografiado 24/10 | Selector DIP de dos canales; SPI SCK/MISO/MOSI/SS/VCC/GND/IRQ/RSTO; I²C SCL/SDA/VCC/GND; HSU GND/VCC/TXD/RXD al dorso. Cabecera macho confirmada por Joaquín al aprobar guía NFC; soldadura declarada en curso, terminación por revisar; placa compatible visualmente con manual V3, autenticidad/función no probadas |
| D-02 | Tarjeta NFC incluida con D-01 | 1 tarjeta | en mano | Tipo exacto y UID no verificados; no publicar credenciales completas |
| D-03 | Llavero NFC incluido con D-01 | 1 llavero | en mano | Tipo exacto no verificado |
| D-04 | TFT SPI marcada **1.54TFT-SPI-ST7789 Ver:1.1** | 1 pantalla | en mano, fotografiada 24/10; desconectada | Pines reales GND/VCC/SCL/SDA/RST/DC/CS/BL; cabecera visible. Controlador ST7789 identificado por serigrafía, resolución probable 240×240 sin medición; tensión VCC/BL no validada |
| D-05 | Ventilador brushless **PENGDALANTU / 鹏达蓝图 / DC 5V**, variante 4010 del anuncio | 1 ventilador | en mano; fotografiado 24/10 | 2 cables rojo/negro y ficha blanca de 2 posiciones. 5 V confirmado por etiqueta, **corriente no indicada**; paso del conector, polaridad y dimensiones físicas no medidos |
| D-06 | PIR, variante HC-SR501-green | 1 módulo | en mano | Tres pines y jumper amarillo; leer VCC/OUT/GND y modo antes de alimentar |
| D-07 | Micrófono digital INMP441 | 1 módulo | en mano | VCC/GND/SD/LR/WS/SCK; I²S, no ADC; no es B-08 |
| D-08 | Amplificador I²S MAX98357A, identificación según anuncio | 1 módulo | en mano | LRC/BCLK/DIN/GAIN/SD/GND/VIN; cabecera/bornera y adaptación usadas en el ensayo M-07B según cableado confirmado. Archivo reproducido al 15 % digital; ruido/pitido inestable pendientes. Fuente USB/VIN y potencia sin medir; ver R-040–R-048 |
| D-09 | Altavoces pasivos 4 Ω, 3 W, ~40 mm | 2 altavoces (1 lote) | en mano | Conector anunciado PH de 2 pines, paso exacto por confirmar; una bocina ensayada con D-08 el 25/10, segunda sin probar. No conectar directamente a GPIO |
| D-10 | USB a micro USB | 1 cable | en mano | Compra del equipo, separado de A-03; longitud no medida |
| D-11 | Tiras de pines / conectores suministrados | ? piezas | en mano | Accesorios del PN532/amplificador; contar tipo y paso, no inventar unidades |

## E — Compras exclusivamente personales de Joaquín

Propietario: **Joaquín**, quien conserva estas piezas al finalizar el proyecto.
No hay obligación de devolución por pertenecerle. Pedidos con fecha 15/10/2026;
**«Esperando entrega» en el texto compartido**, recepción física todavía no
confirmada. No publicar números de pedido, enlaces de cuenta o seguimiento.

| ID | Pieza / variante comprada | Cantidad y unidad | Estado | Uso / observaciones |
|---|---|---|---|---|
| E-01 | ESP32, variante **38Pin Type C** | 1 placa | en mano; recepción declarada 29/10/2026 | 38 contactos físicos, no 38 GPIO libres. SoC/módulo, controlador USB y pinout exactos por verificar al recibir |
| E-02 | Protoboard, variante **400 Points Breadboar** | 1 placa | pedido | Sin cables: confirmado por Joaquín. Es independiente de la mini del kit E-04 |
| E-03 | Kit Dupont, variante **20cm KIT** | 1 kit | pedido | Se esperan macho–macho, macho–hembra y hembra–hembra; cantidades internas no fijadas. Las menciones 10/20/40 son aproximaciones, no conteos |
| E-04 | Kit de inicio R3 | 1 kit | pedido | **NO incluye placa Arduino**, confirmado por Joaquín. Mini protoboard, LEDs, botones, jumpers, resistencias y posibles fotorresistencias; contenido y cantidades por verificar. No contarlos también como compras separadas |

Enlaces públicos de producto (no sustituyen inspección de la variante):
[E-01](https://www.aliexpress.com/item/1005012688550347.html),
[E-02](https://www.aliexpress.com/item/1005003073275216.html),
[E-03](https://www.aliexpress.com/item/1005009071621102.html),
[E-04](https://www.aliexpress.com/item/32392610240.html).

## Trazabilidad de anuncios y revisión fotográfica

Lista de vendedores/variantes visibles, sin número de orden y sin atribuirles fabricación del dispositivo. **La compra conjunta D es propiedad del equipo, no de Joaquín**; E es personal aunque pueda usarse temporalmente en ClassAI.

| ID | Tienda/escaparate mostrado | Variante o producto observado |
|---|---|---|
| D-05 | YX Technology | 4010 5V Negro |
| D-09 | KY WIN ROBOT Store | 2 altavoces 4 Ω / 3 W |
| D-08 | SZFYDOSH Technology Store | MAX98357A «Small chip» |
| D-07 | JiaDenuo Store | «1pcsINMP441» |
| D-10 | KIMCHOW 3C Store | Cable micro USB plata; longitud sin confirmar |
| D-04 | YouKeyi Store | «1.54 Inch TFT» |
| D-01/D-02/D-03 | Tienda oficial ZAVE (nombre del escaparate) | PN532 V3 con tarjeta y llavero |
| D-06 | No legible en captura | HC-SR501-green |
| E-01 | 3C-World Dropshipping Store | ESP32 38Pin Type C |
| E-02 | Eiechip Official Store | 400 Points Breadboard |
| E-03 | Realpoy Module Wholesale Store | 20cm KIT |
| E-04 | S+S+S+ Store | Kit R3 Mini Breadboard **sin Arduino** |

Ver [identificacion-fisica.md](identificacion-fisica.md) para transcripciones, enlaces técnicos, alimentación y lista mínima de faltantes. Fotografías del 24/10 confirman la presencia física de D-01/D-04/D-05/B-08/B-09/B-10/B-11; **no certifican pruebas de funcionamiento**. La recepción E continúa sin confirmar.

## Seguimiento de préstamos, recepciones y devoluciones

Registrar una fila por movimiento; no sobrescribir el historial. La ausencia de
fecha se escribe «por acordar», nunca como un vencimiento inventado. Al devolver,
actualizar disponibilidad de los IDs afectados y revisar montajes que los usan.

| Fecha real | IDs y cantidades | Movimiento | Entrega / recibe | Estado observado / fecha de devolución acordada |
|---|---|---|---|---|
| Por completar | A-* | Préstamo declarado; fecha de entrega no comunicada | Adrián → Joaquín | Pendiente devolver; fecha por acordar |
| Por completar | B-* | Préstamo formal declarado | Universidad → Joaquín | Responsable/acta/vencimiento por confirmar |
| Por completar | C-* | Préstamo temporal autorizado declarado | Profesor → Joaquín | Confirmar devolución o cesión de consumibles |

## Datos que faltan para cerrar el inventario

- Contar y separar tipos de A-02; contar resistencias, D-11 y contenido de kits al recibir.
- Confirmar responsable y fechas/condiciones de A/B/C; distribución final de D.
- Fotografiar/leer cada ESP32 y asociarlo a A-01/B-02/E-01 antes de asignarle un rol.
- D-04 ya identificada por serigrafía ST7789 V1.1, falta VCC/BL y prueba de panel; ventilador DC 5V confirmado sin corriente medida.
- B-09 ya fotografiado con signo + pero tipo/tensión sin verificar; B-10 es matriz 8×8 con MAX7219 por confirmar; B-11 son dos bobinas 5V TONG LING, faltan disparo 3,3V/jumper/consumo.
- Identificar B-08, el PIR B-04 y el orden de terminales de cada placa real.
- Confirmar recepción de E; disponer de cable de DATOS USB-C apropiado para E-01
  (no se ha inventariado uno, y los micro USB no encajan).

## Aclaración para el banco de ambiente · 24/10/2026

Joaquín reporta una placa ESP32 de **30 pines**, aún sin asociarla a A-01 o B-02 ni confirmar serigrafía/modelo. El PIR descrito tiene tres patas y selector de tres pines con puente amarillo; esto no permite asignarlo inequívocamente a B-04/D-06 ni fijar VCC/OUT/GND. Se conserva el inventario y su propiedad. Véase [banco-ambiente.md](banco-ambiente.md).

## Pinout declarado el 24/10/2026

B-02 (universidad): Joaquín reportó 15 contactos por lado, con orden compatible
con DevKit V1; VN se leyó con duda. Ver [banco-ambiente.md](banco-ambiente.md)
para el orden completo. Primera placa descrita: 30 contactos aparentes, ID aún
por asociar y etiquetas D4/D14, D5/B5 y VN por cotejar. Son declaraciones, no
identificaciones USB ni ensayos. E-01 sigue pendiente de recepción.

## Fotografías de ESP32/PIR y cables disponibles · 24/10/2026

- Fotos 7/8: una placa **ESP32 DEVKITV1**, módulo con marcado ESP-WROOM-32,
  micro USB, EN/BOOT y 30 contactos macho. D4, D5, VP y VN son legibles y
  coinciden con el mapa documentado. No atribuir fabricación DOIT por ese texto;
  falta asociar esa foto a A-01 o B-02 y a un puerto USB. No se ha observado
  eléctricamente VIN ni se ha leído/cargado flash.
- Fotos 1–6: un PIR con lente Fresnel, cuatro condensadores, dos potenciómetros,
  conector macho de tres terminales y jumper amarillo de selección. Aspecto
  compatible con el HC-SR501 ya declarado; no se distinguen las letras VCC/OUT/GND
  ni el marcado del chip. No asignar B-04/D-06 por el color ni certificar el orden
  de terminales por semejanza. No se recibió una nueva pieza por fotografiarla.
- Joaquín confirma **cero cables H–H disponibles**. La receta preferida se cambia
  a **11 M–H + 1 M–M** con uniones por tiras de protoboard. C-08 (~16 M–H) y
  C-07 (~10 M–M) siguen siendo cantidades declaradas: comprobar unidades libres
  y alcance físico, sin duplicarlas ni contar E pendiente. No hace falta pedir
  H–H para esa receta si los jumpers declarados están disponibles y alcanzan.

## Preparación de NFC y bocinas · 24/10/2026

Joaquín declara **soldadura de adaptadores para bocinas y NFC en curso**. Se
asocia a la preparación de D-09 y D-01, con conectores del lote D-11 cuando
corresponda; no se crean cantidades ni se presupone que la cabecera de D-08 ya
esté terminada. El tipo de conectores y la revisión final siguen pendientes.
No cambiar estos módulos a «probados» ni afirmar soldadura terminada. Se
conservan los propietarios y la disponibilidad declarada de dos ESP32.

Para NFC con cabecera macho, la receta por cuatro tiras de señal y rieles +/− izquierdos usa 12 M–H; si se suelda
cabecera hembra, usa 6 M–H + 6 M–M. Ambas evitan H–H. Confirmar tipo al terminar,
no pedir más cables antes de revisar C-07/C-08 y material libre. Una sola bocina
D-09 se ensaya en la salida mono de D-08; la segunda queda sin conectar.

Revisión documental 25/10/2026: [componentes de laboratorio y límites](circuitos-referencia.md). No cambia recepción, propiedad ni evidencia de funcionamiento. B-09 sigue sin modelo/consumo confirmado; el uso a 3,3 V es un reporte del usuario.


## Actualización declarada · 29/10/2026

Joaquín confirma tres ESP32 disponibles, incluida E-01 Type-C de 38 contactos,
y **cuatro protoboards de 400 puntos**, cada una con rieles ± a ambos lados.
Este total reemplaza la disponibilidad histórica de dos placas; no añade otras
tres ESP32 ni otras cuatro protoboards al inventario. La asociación individual
entre las cuatro protoboards y A-04/B-01/E-02/el kit E-04 queda por identificar,
sin cambiar su propiedad ni duplicar unidades.

Declara los módulos probados por separado. Se conserva esa confirmación como
reporte del usuario, sin convertirla en ensayo conjunto, medición eléctrica o
nuevo log individual. Hay fotoresistencias suficientes y resistencias de diversos
valores; cantidades y modelos no contados. Para la integración se reservan dos
LDR y dos resistencias de 10 kΩ, ajustables tras caracterización.

Cada nodo se alimentará por USB desde una laptop distinta. No hay multímetro.
Fuente, capacidad por puerto, ruta USB–VIN, identidad/SoC exactos y respaldo de
E-01 siguen por comprobar antes de carga o habilitación de potencia.

Asignación lógica propuesta: B-02 acceso, A-01 ambiente, E-01 asistente.
A/B siguen siendo préstamos y E-01 sigue siendo de Joaquín.
[Receta integrada y aceptación](tres-nodos.md).


30/10/2026: Joaquín autoriza incluir H–H en el diseño de los tres montajes
integrados. No se registra una recepción ni cantidad nueva de cables por esa
autorización; el visor presenta el presupuesto necesario por tipo.
