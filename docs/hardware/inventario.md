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
| A-01 | ESP32 con micro USB | 1 placa | en mano | Control y conectividad; número de contactos y modelo de placa por confirmar |
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
| B-02 | ESP32 con micro USB, parecido a A-01 | 1 placa | en mano | Segunda placa disponible; modelo/pinout propios por confirmar |
| B-03 | Módulo DHT11 | 1 módulo | en mano | Temperatura/humedad; NO es DHT22. Leer serigrafía de alimentación/datos |
| B-04 | PIR parecido a D-06, de otro color | 1 módulo | en mano | Movimiento; HC-SR501 probable, modelo y orden de pines sin confirmar |
| B-05 | LED verde | 1 LED | en mano | Señalización con resistencia en serie |
| B-06 | LED amarillo | 1 LED | en mano | Señalización con resistencia en serie |
| B-07 | LED blanco | 2 LEDs | en mano | Lote propio de B, separado de C-06 |
| B-08 | Módulo rojo de sonido, micrófono y ajuste azul | 1 módulo | en mano | Descritos LED1/LED2/VR1 y probable AO/G/+/DO; KY-038/KY-037 provisional, no amplificador confirmado |
| B-09 | Buzzer de dos patas | 1 unidad | en mano | Tipo activo/pasivo, tensión y consumo por confirmar |
| B-10 | Matriz LED con módulo VCC/GND/DIN/CS/CLK | 1 módulo/conjunto | en mano | Probable MAX7219; leer chip, tamaño y conectores de entrada/salida. No contar dos módulos por tener dos extremos |
| B-11 | Módulo de relé de dos canales | 1 módulo, 2 canales | en mano | Entradas GND/IN1/IN2/VCC y zona JD-VCC/VCC con puente según descripción. Tensión, nivel activo y aislamiento por confirmar; COM1/NO1/NC1 separados de COM2/NO2/NC2 |

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
| D-01 | PN532 NFC RFID V3 | 1 módulo | en mano | NFC por SPI/I²C/HSU; pines sin soldar. Etiquetas SPI SCK/MISO/MOSI/CS/VCC/GND/IRQ/RSTO; segunda fila I²C por confirmar visualmente |
| D-02 | Tarjeta NFC incluida con D-01 | 1 tarjeta | en mano | Tipo exacto y UID no verificados; no publicar credenciales completas |
| D-03 | Llavero NFC incluido con D-01 | 1 llavero | en mano | Tipo exacto no verificado |
| D-04 | TFT SPI 1,54 pulgadas, versión 1.1 | 1 pantalla | en mano; desconectada por Joaquín | Probable ST7789 240×240. Inscripción dictada «ST77689» pendiente de foto. Es la MISMA pantalla usada en la mascota, no una adicional prestada |
| D-05 | Ventilador brushless DC 5 V; variante anunciada 4010 | 1 ventilador | en mano | Etiqueta azul leída «Pegdal Antu», Made in China; corriente no indicada. Dimensiones/fabricante por confirmar |
| D-06 | PIR, variante HC-SR501-green | 1 módulo | en mano | Tres pines y jumper amarillo; leer VCC/OUT/GND y modo antes de alimentar |
| D-07 | Micrófono digital INMP441 | 1 módulo | en mano | VCC/GND/SD/LR/WS/SCK; I²S, no ADC; no es B-08 |
| D-08 | Amplificador I²S MAX98357A, identificación según anuncio | 1 módulo | en mano | LRC/BCLK/DIN/GAIN/SD/GND/VIN; pines/bornera por montar. Leer placa real |
| D-09 | Altavoces pasivos 4 Ω, 3 W, ~40 mm | 2 altavoces (1 lote) | en mano | Conector anunciado PH de 2 pines, paso exacto por confirmar; no conectar directamente a GPIO |
| D-10 | USB a micro USB | 1 cable | en mano | Compra del equipo, separado de A-03; longitud no medida |
| D-11 | Tiras de pines / conectores suministrados | ? piezas | en mano | Accesorios del PN532/amplificador; contar tipo y paso, no inventar unidades |

## E — Compras exclusivamente personales de Joaquín

Propietario: **Joaquín**, quien conserva estas piezas al finalizar el proyecto.
No hay obligación de devolución por pertenecerle. Pedidos con fecha 15/10/2026;
**«Esperando entrega» en el texto compartido**, recepción física todavía no
confirmada. No publicar números de pedido, enlaces de cuenta o seguimiento.

| ID | Pieza / variante comprada | Cantidad y unidad | Estado | Uso / observaciones |
|---|---|---|---|---|
| E-01 | ESP32, variante **38Pin Type C** | 1 placa | pedido | 38 contactos físicos, no 38 GPIO libres. SoC/módulo, controlador USB y pinout exactos por verificar al recibir |
| E-02 | Protoboard, variante **400 Points Breadboar** | 1 placa | pedido | Sin cables: confirmado por Joaquín. Es independiente de la mini del kit E-04 |
| E-03 | Kit Dupont, variante **20cm KIT** | 1 kit | pedido | Se esperan macho–macho, macho–hembra y hembra–hembra; cantidades internas no fijadas. Las menciones 10/20/40 son aproximaciones, no conteos |
| E-04 | Kit de inicio R3 | 1 kit | pedido | **NO incluye placa Arduino**, confirmado por Joaquín. Mini protoboard, LEDs, botones, jumpers, resistencias y posibles fotorresistencias; contenido y cantidades por verificar. No contarlos también como compras separadas |

Enlaces públicos de producto (no sustituyen inspección de la variante):
[E-01](https://www.aliexpress.com/item/1005012688550347.html),
[E-02](https://www.aliexpress.com/item/1005003073275216.html),
[E-03](https://www.aliexpress.com/item/1005009071621102.html),
[E-04](https://www.aliexpress.com/item/32392610240.html).

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
- Confirmar controlador/etiqueta de D-04, consumo del ventilador y características de B-09/B-10/B-11.
- Identificar B-08, el PIR B-04 y el orden de terminales de cada placa real.
- Confirmar recepción de E; disponer de cable de DATOS USB-C apropiado para E-01
  (no se ha inventariado uno, y los micro USB no encajan).
