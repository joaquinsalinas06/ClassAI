# ClassAI: acceso, ambiente y asistente

Implementación software para ESP32 clásico; recepción y ensayos individuales
según declaración de Joaquín del 29/10/2026. **Sin nuevo montaje físico, carga,
medición ni aprobación eléctrica conjunta.** A/B son préstamos; E-01 es personal.

## Reparto y protoboards

| Rol / placa propuesta | Componentes | Protoboards |
|---|---|---|
| access / B-02 | D-01 PN532, B-10 matriz, C-04 botón, B-09 buzzer, un LED con resistencia, B-04 PIR | P1 |
| environment / A-01 | B-03 DHT11, B-08 AO, LDR1, D-06 PIR, LEDs verde/amarillo/rojo, B-11 relé y D-05 ventilador | P2 |
| assistant / E-01 | D-04 TFT, D-07 INMP441, D-08 amplificador, una D-09 bocina, LDR2 | P3/P4 |

P1–P4 son posiciones lógicas de las cuatro protoboards existentes, no compras
ni IDs de propietario nuevos. Confirmar la asociación de cada una con inventario.
Colocar ESP32 fuera de las tiras si tapa contactos. Dejar USB accesible; cables
cortos para SPI/I²S y LDR. El nodo de acceso va junto a la entrada; ambiente en
zona de estudiantes sin corriente de aire directa del fan; asistente en mesa
del profesor, con micrófono alejado de la bocina y de su cableado de potencia.

## Señales por rol

| Nodo | Función | GPIO |
|---|---|---|
| Acceso | PN532 SCK/MISO/MOSI/CS | 18/19/23/5; V3 en SPI, IRQ/RSTO libres |
| Acceso | Matriz DIN/CLK/CS | 13/14/27; entrada IN, DOUT libre |
| Acceso | Botón / LED / buzzer / PIR | 32 a GND con pull-up / 25 / 17 / 35 |
| Ambiente | DHT11 / AO / LDR / PIR | DATA4 / ADC34 / ADC35 / OUT27 |
| Ambiente | Relé / LED verde/amarillo/rojo | 26 / 18/19/23 |
| Asistente | TFT SCLK/MOSI/CS/DC/RST | 14/23/5/27/26 |
| Asistente | Amplificador BCLK/WS/DIN/SD | 33/25/22/21 |
| Asistente | Micrófono BCLK/WS/SD | 18/19/34; L/R a GND |
| Asistente | LDR | ADC35 |

GPIO no equivale al ordinal del conector. Verificar serigrafía, módulo/SoC de
E-01 y reserva de 16/17 según variante. 34/35 solo entrada, sin pull-up interno.
ADC1 conserva lectura con Wi-Fi; los relojes de I²S usan salidas. Mantener libres
flash y TX/RX de consola. Revisar el estado de CS5 durante boot en ambos nodos.
El hardware SPI de la TFT usa HSPI; la matriz tiene reloj independiente del
PN532. RX I²S0 a 16 kHz/slots32; TX I²S1 a 32 kHz/slots32, con relojes separados.

## Alimentación y conexiones funcionales

Cada nodo recibe **un USB desde su propia laptop**. No unir salidas 3V3/5V de
placas distintas. Por nodo, un carril positivo es 3V3 y el otro 5V; negativos a
GND local. Rotular tensión y verificar segmentos partidos antes de puentearlos.
Compartir riel no aumenta capacidad del regulador o del USB.

- LDR: **3V3 → fotoresistencia → unión ADC35 → 10 kΩ → GND**. Más luz disminuye
  resistencia y sube `light_rel=ADC/4095`. Una rama por zona. Sombrear/iluminar
  para detectar extremos antes de elegir otro valor. No conectar a 5 V.
- DHT11: usar módulo B-03 y su DATA4 con pull-up hacia 3V3 según variante; no
  configurar DHT22. Ruido: B-08 + a 3V3, G a GND, AO34, DO sin cable.
- PIR: identificar VCC/OUT/GND en cada unidad; OUT debe ser compatible con
  lógica 3V3. No suponer que VCC es 3V3 por el nivel de OUT. GPIO35 de acceso
  puede requerir resistencia externa de polarización; no tiene pull-down interno.
- LEDs: GPIO → resistencia inicial 1 kΩ → ánodo, cátodo a GND; una resistencia
  por LED. Botón32 a GND; comprobar parejas de patas de C-04.
- PN532: VCC3V3/GND y SPI según banco existente. Matriz: alimentación5V/GND y
  adaptación lógica compatible antes de habilitar DIN/CLK/CS.
- TFT: VCC/BL conforme al breakout identificado; conservar la receta de pantalla
  y su limitación de BL, no alimentar retroiluminación directamente desde GPIO.
- INMP441 a 3V3/GND, L/R a GND. Amplificador a su 5V/GND local por recorridos
  separados de micrófono/ADC; SD21 con pull-down1kΩ. GAIN según banco existente.
  Bocina entre SPK+/SPK−, nunca a masa; segunda bocina sin conectar.
- Relé: configurar `RELAY_ON_LEVEL` según interfaz real; salida segura inversa.
  COM/NO y alimentación5V del fan conservan la receta de relé/ventilador.
  No habilitar hasta resolver corriente de arranque y capacidad de alimentación.
- Buzzer17 es señal hacia su etapa validada. `BUZZER_PASSIVE` elige tono PWM;
  no sustituye la comprobación de transistor, consumo, polaridad o tensión.

La disponibilidad de resistencias no implica que haya adaptadores AHCT o
transistores. Las ramas inciertas permanecen desconectadas. La laptop de cada
nodo no certifica margen USB–VIN. No se ha contado tipo/longitud de cada jumper:
las tablas son conexiones funcionales, no un trazado agujero por agujero aprobado.
Preservar los bancos y revisiones guardadas del visualizador.

## Preparar firmware sin cargar

Desde raíz, dependencias del README y después:

```sh
scripts/ci/multinode-build.sh
scripts/ci/firmware-host.sh
```

El primer comando compila copias temporales de los tres perfiles con ejemplos,
sin secretos reales. Para preparar un binario propio: copiar
`firmware/classai_multinode/secrets.example.h` a `secrets.h` (ignorado), configurar
red/CA/usuario por rol, preparar PN532 con `prepare-pn532.py`, y compilar con
`--library RUTA_PN532 --libraries firmware/libraries --fqbn esp32:esp32:esp32
--build-property compiler.cpp.extra_flags=-DCLASSAI_ROLE=N` para N=1/2/3.
No escribir credenciales en argumentos ni usar `setInsecure`.

Todos los `*_VALIDATED` de potencia empiezan en 0. Activar solo la rama real
revisada, recompilar y después armar explícitamente. Acceso/ambiente:
Serial115200, `arm` y `stop`; comando inválido/overflow desarma. Al arrancar el
relé queda OFF. Ambiente usa su última configuración válida en NVS y sensores
locales aunque MQTT no esté conectado; temperatura inválida apaga el fan sin
esperar el mínimo de60s entre cambios normales.

El outbox usa LittleFS, **sin formateo automático**. Primera inicialización:
tras identificar placa y preservar respaldo, enviar `format-outbox` si el FS no
monta. El comando no formatea un FS ya montado. Nunca borrar/formatear una cola
con eventos pendientes para resolver una desconexión. 64 eventos como máximo;
si está lleno, se rechaza una nueva lectura en vez de borrar otra sin confirmar.
Flash permite reintento tras reinicio, pero su durabilidad ante cortes físicos
sigue pendiente de ensayo. Sesión/boot/config se conservan en NVS.

El botón solicita start/stop con ID idempotente; no inicia sesión nueva sin red.
Una lectura con sesión conocida se guarda antes de enviar; LED verde/cara feliz
solo tras ACK aceptado. Rechazo es distinto de pendiente. Una lectura sin sesión
no se presenta como asistencia. Si se pierde reloj, `ts:null`; un reenvío de una
sesión ya cerrada puede rechazarse por no poder demostrar la hora original.

Asistente: Serial921600 reservado para tramas binarias. No abrir monitor al
mismo tiempo que el agente. Heartbeat cada250ms, timeout1500ms y STOP silencian
el amplificador. Volumen digital inicial limitado a1/8; no equivale a potencia
ni a nivel seguro medido. [Agente y protocolo](../../tools/voice_agent/README.md).

## Aceptación física pendiente

Registrar ID/puerto/respaldo por placa antes de cargar; asociación actual de E-01
sin verificar. No se ejecutaron uploads ni se abrieron puertos físicos aquí.

1. Inspección sin USB: red3V3/5V/GND, polaridad, nivel de señales y estado OFF.
2. Sensado + Wi-Fi de los tres nodos; LDR1/LDR2 independientes y lux ausente.
3. Una sesión compartida; taps válidos/desconocidos/repetidos, pendiente y ACK.
4. Desconectar/reconectar un nodo y broker: aislar estados y conservar lecturas.
5. Armar cada rama validada de potencia por separado; después convivir sin resets.
6. 20 llamadas de varias personas y30min de conversación: contar aciertos,
   omisiones, falsos disparos y latencia. Reproducción no activa otra consulta.
7. Sesión conjunta60min: reinicios, huecos de audio, lecturas, alimentación,
   volumen/calidad y funcionamiento local sin broker.

Guardar resultados reales con fecha y pendientes; host/compilación/MQTT simulado
no prueban el NFC físico, la cobertura PIR, la calibración ni el margen eléctrico.

[Resultados software y límites de esta entrega](tres-nodos-validacion.md).


## Montajes visuales integrados · 30/10/2026

En `/montajes`, la sección **ClassAI · tres nodos** contiene el conjunto real
por rol, además de los 16 bancos aislados que se conservan:

| Montaje | Ruta del visor | Guía y dibujo |
|---|---|---|
| Acceso · B-02 · P1 | `/montajes?banco=nodo-acceso` | [Guía](esquemas/nodo-acceso.md) · [SVG](esquemas/nodo-acceso.svg) |
| Ambiente · A-01 · P2 | `/montajes?banco=nodo-ambiente` | [Guía](esquemas/nodo-ambiente.md) · [SVG](esquemas/nodo-ambiente.svg) |
| Asistente · E-01 · P3/P4 | `/montajes?banco=nodo-asistente` | [Guía](esquemas/nodo-asistente.md) · [SVG](esquemas/nodo-asistente.svg) |

**Recorrer armado** empieza sin cables y añade los listos uno a uno. Las ramas
condicionadas se ven discontinuas en **Ver todo** y se pueden ocultar con
**Ver conexiones pendientes**; no forman parte de los pasos ejecutables.
**Materiales** cuenta M–M, M–H, H–H y los conductores de potencia/bocina.
**Pines y cables** permite seleccionar redes y consultar cada extremo.
Exportar SVG conserva las condiciones; JSON permite reimportar y guardar
revisiones, sin sobrescribir automáticamente un montaje anterior.

Joaquín autoriza usar **H–H en estas propuestas**: dos conectores macho pueden
unirse directamente, evitando puentes innecesarios por protoboard. Esto no
certifica unidades recibidas ni longitud; contar el presupuesto mostrado antes
de armar. Las recetas aisladas conservan su diseño anterior sin H–H.

P4 es otra protoboard independiente: no comparte tiras/rieles con P3 hasta
colocar sus puentes explícitos. Los pasivos indican en qué placa van sus patas.
La ESP32 de 38 pines usa la referencia DevKitC documentada; confirmar las
etiquetas reales de E-01 antes de trasladar posiciones físicas del dibujo.

Los bloques de adaptación de matriz/buzzer son funciones pendientes, no pinouts
certificados ni compras nuevas. Los tres SVG son propuestas, sin ensayo físico
conjunto. No se transforma una rama condicionada en cable directo para ahorrar
jumpers. Los colores no sustituyen la lectura de las etiquetas de tensión.
