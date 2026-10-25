# Qué seguir armando

Corte del 24/10/2026. Propuesta según inventario y código; **ningún ensayo físico
nuevo realizado**. Joaquín declara adaptadores de NFC y bocinas en soldadura,
sin confirmar que hayan terminado. Los esquemas están en
[la colección](esquemas/README.md) y en `/montajes?banco=nfc`.

## División que conservamos

| Bloque | Material principal | Cómo se prueba ahora |
|---|---|---|
| NFC / sesión | D-01 PN532, D-02 tarjeta, D-03 llavero; luego C-04 y Android | Primero lector y credenciales; HCE y sesión después |
| Ambiente / actuación | B-03 DHT11, un PIR, B-08; más adelante B-11 y D-05 | Entradas por separado; fan/relé solo al cerrar fuente y lógica |
| Interfaz / audio | D-04 TFT, D-07 micrófono, D-08 amplificador y una D-09 | Pantalla, captura y reproducción en ensayos separados |

Son roles, no tres ESP32 instalados. Solo A-01 y B-02 están disponibles según el
inventario. E-01 sigue pedido. No unir GPIO entre placas ni clonar dos nodos con
el mismo client ID MQTT; la sincronización multinodo no está implementada.

## Orden práctico

1. **M-00: identidad y preservación.** Asociar A-01/B-02 a sus puertos uno por
   uno. Conservar respaldo/firmware previo y registrar cableado antes de cargar.
2. **Mientras sueldan: M-01 LED + botón.** C-05, C-01 (1 kΩ), C-04 y una
   protoboard. Es la prueba mínima de control: una pulsación, un cambio de LED.
   Identificar polaridad del LED y las parejas internas del pulsador.
3. **Al terminar la cabecera: M-10 NFC aislado.** Inspeccionar soldadura, elegir
   las seis redes SPI, DIP 1 OFF / 2 ON sin alimentación, VCC 3,3 V, IRQ/RSTO
   libres. Primero versión y 20 detecciones con retirada entre lecturas. Hay
   tarjeta y llavero; no afirmar que se completó una prueba con tres credenciales.
   Android HCE se comprueba después, no por leer una tarjeta.
4. **Después del adaptador: M-07B audio mono.** D-08 + solo una D-09 entre SPK+
   y SPK−. Ninguno va a GND; no poner las dos de 4 Ω en paralelo. Revisar fuente,
   polaridad/bornera, GAIN/SD y firmware I²S antes de alimentar. La soldadura no
   valida fuente ni completa el driver. Fuente de carga independiente adecuada;
   no colgar la bocina del regulador 3V3 o GPIO del ESP32.
5. **Retomar M-04/05 ambiente** con la [guía física sin H–H](banco-ambiente.md).
   Se conservan pendientes de orden PIR, ruta VIN y niveles; no volver a pedir
   documentación de piezas ya identificadas salvo un dato concreto que falte.
6. **Interfaz por separado: M-02 TFT y M-07A micrófono.** TFT conserva mapa del
   prototipo, con VCC/BL pendientes. INMP441 usa un mapa candidato I²S; no hay
   driver integrado. No unirlos automáticamente a los bancos anteriores.
7. **Dejar al final potencia y piezas sin identificar:** M-06 sonido analógico,
   M-08A matriz, M-08B buzzer y M-09 fan/relé. Los esquemas muestran condiciones
   y adaptación pendiente, no un cableado final habilitado para energizar.
8. **M-03 transporte:** comparar serial → broker → BD → web cuando una lectura
   o evento local ya sea fiable. El smoke sintético no prueba un sensor real.

## Dos bancos y presupuesto de cables

La disponibilidad libre debe contarse antes de reservar; cantidades de C-07 y
C-08 son aproximadas, no un conteo nuevo. No se usa H–H.

| Combinación candidata | M–H | M–M | Lectura del inventario |
|---|---:|---:|---|
| NFC con cabecera macho + LED/botón | 12 + 3 = 15 | 0 + 2 = 2 | Cabe nominalmente en C-08 ~16 / C-07 ~10; requiere dos protoboards libres/aptas |
| NFC con cabecera hembra + LED/botón | 6 + 3 = 9 | 6 + 2 = 8 | Alternativa según lo que realmente se suelde |
| NFC con cabecera macho + ambiente | 12 + 11 = 23 | 0 + 1 = 1 | C-08 solo no alcanza; no dar ambos por reservados a la vez |

La opción inicial es **NFC en una placa y LED/botón en la otra**, tras M-00.
Después desmontar, registrar y reutilizar jumpers. Para audio, revisar conectores
reales antes de cerrar su presupuesto: señales, potencia y bocina no son el
mismo tipo de cable. Si hay patas macho en ambos módulos, unir M–H por contactos
diferentes de una tira; si un módulo tiene hembra, elegir M–M donde corresponda.
Nunca juntar puntas al aire, meter dos en un agujero ni forzar el cuerpo del PIR.

## Firmware mínimo preparado

- [LED/botón](../../firmware/led_button_bench/README.md): GPIO25 con R1 de 1 kΩ,
  GPIO32 INPUT_PULLUP; debounce de 35 ms, una alternancia por pulsación.
- [NFC](../../firmware/nfc_bench/README.md): SPI 18/19/23/5, versión y conteo de
  detecciones/retirada. Omite valores UID y no implementa HCE ni asistencia.
- [Ambiente](banco-ambiente.md): sketch previo DHT11/PIR, compilado sin cargar.

Los dos nuevos sketches compilaron para ESP32 core 3.3.12 sin upload. Las pruebas
host ejercitan el código real con stubs de GPIO/serial/PN532: rebote/mantenimiento
de botón y fallo/retirada/reentrada NFC. No prueban soldaduras, RF ni sensores.
No se cargó firmware, no se leyó flash ni se alteró un respaldo privado.

Cada banco debe registrar criterio, resultado real, fallo, qué queda conectado
y desmontaje en [montajes.md](montajes.md). Los códigos M-07A/B y M-08A/B son
subensayos de las recetas existentes, no inventario ni cantidades nuevas.

## Orden actualizado · R-025

Consultar [bancos físicos](bancos-fisicos.md): preparar DHT11/PIR separados antes
del conjunto; LED/pulsador es el primer candidato práctico de menor incertidumbre.
B-08 e INMP441 ya tienen sketches aislados compilados, sin aprobar identificación
ni hardware. Tres LEDs tienen dibujo/Serial propio, condicionado al conteo de
resistencias. Matriz/buzzer/fan siguen bloqueados eléctricamente; pantalla/audio
conservan alcance de Lando #91–#93. Iluminación carece de sensor recibido.
Cables reutilizados entre ensayos; no reservar los 16 bancos simultáneamente.
