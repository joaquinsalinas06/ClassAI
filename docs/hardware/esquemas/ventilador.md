# M-09 · Ventilador + relé

Dejar el fan desconectado. Tras identificar A-01 y el relé, enviar arm y on: escuchar un clic de hasta 2 s; stop apaga y desarma.

**Montaje condicionado · revisar pendientes.** Diseño de referencia, sin ensayo físico nuevo.

![Distribución física de referencia](ventilador.svg)

[JSON de montaje importable](ventilador-fisico.json) · [SVG físico](ventilador-fisico.svg). ESP32 USB abajo; orientación de referencia, cotejar serigrafía. Terminales rotulados por función donde el conector aún no está identificado.

## Materiales

- esp1: A-01 · identificar antes de cargar
- relay1: B-11 · módulo relé doble
- fan1: D-05 · ventilador 5 V · NO CONECTAR

Cables: 3 M–H + 1 M–M dibujados; cero H–H. 4 tramos de potencia por bornera. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · GND_L | Protoboard · RN28 | c1 · M–H | Referencia |
| Protoboard · LN30 | Protoboard · RN30 | c2 · M–M | Referencia |
| ESP32 · VIN | Protoboard · LP26 | c3 · potencia | Pendiente; no conectar |
| ESP32 · GPIO26 | Protoboard · J12 | c4 · M–H | Referencia |
| Protoboard · H12 | Relé · IN1 | c5 · M–H | Pendiente; no conectar |
| Protoboard · LP5 | Relé · VCC | c6 · potencia | Pendiente; no conectar |
| Protoboard · LN7 | Relé · GND | c7 · potencia | Referencia |
| Protoboard · LP9 | Relé · IN2 | c8 · potencia | Pendiente; no conectar |

## Armado cable por cable · USB desconectado

Referencia física, sin escala métrica. USB desconectado al armar. Usar A-01 solo tras identificar placa/puerto y preservar respaldo; B-02/NFC permanece conservado. Cables reutilizados entre ensayos; cero H–H.

| Nº | Color | Tipo | Origen | Destino | Condición |
|---|---|---|---|---|---|
| 1 | black | M–H | esp1:GND_L | bb:RN28 | Cable 1 · M–H · esp1:GND_L → bb:RN28. Conectar sin USB; comprobar etiquetas y agujeros. |
| 2 | black | M–M | bb:LN30 | bb:RN30 | Cable 2 · M–M · bb:LN30 → bb:RN30. Conectar sin USB; comprobar etiquetas y agujeros. |
| 3 | orange | potencia | esp1:VIN | bb:LP26 | NO conectar: Usar como 5 V de USB solo si A-01 confirma pin VIN/5V unido a VBUS. Esta rama alimenta el relé sin fan. |
| 4 | green | M–H | esp1:GPIO26 | bb:J12 | Cable 4 · M–H · esp1:GPIO26 → bb:J12. Conectar sin USB; comprobar etiquetas y agujeros. |
| 5 | green | M–H | bb:H12 | relay1:IN1 | NO conectar: Confirmar módulo LOW-trigger con lógica 3,3 V, sin 5 V retornando a GPIO. Si no es compatible, usar la alternativa NPN. |
| 6 | orange | potencia | bb:LP5 | relay1:VCC | NO conectar: Confirmar pin VIN/5V de A-01 y puente VCC/JD-VCC reales del módulo. |
| 7 | black | potencia | bb:LN7 | relay1:GND | Cable 7 · potencia DC por bornes · bb:LN7 → relay1:GND. Conectar sin USB; comprobar etiquetas y agujeros. |
| 8 | orange | potencia | bb:LP9 | relay1:IN2 | NO conectar: Solo bajo referencia LOW-trigger: canal 2 apagado a VCC; confirmar lógica real. |

M–H: hembra al conector macho del módulo/ESP32 y macho al agujero. M–M: ambos extremos en agujeros distintos. Nunca dos puntas en un agujero.

LP/LN: riel izquierdo +/−; RP/RN: derecho +/−. A–E y F–J son tiras separadas por fila. Confirmar continuidad/cortes de la protoboard real; los rieles opuestos no están unidos. Patas colocadas: módulos externos, conectores por verificar.

Cruces no unen redes. Las condiciones de cada tramo aparecen en esta tabla; un cable por verificar no cuenta como continuidad confirmada aunque se dibuje continuo. Colores son identificadores del dibujo: elegir cables reales y anotar equivalencias. SVG no demuestra alcance físico.

## Compatibilidad eléctrica

[Montaje alternativo con adaptación](ventilador-adaptado.md). No se muestra como material obligatorio del montaje principal; usarlo si los niveles o la carga exigen esa etapa.

## Antes de energizar

1. Identificar placa A-01/puerto, preservar respaldo y armar sin alimentación. B-02/NFC se conserva.
2. Prueba disponible ahora: solo clic del relé, sin conectar COM1, NO1, NC1 ni el ventilador.
3. Para mover el fan falta una fuente regulada de 5 V con corriente de arranque suficiente; no se dibuja como si estuviera disponible.
4. Confirmar pin VIN/5V de A-01, LOW-trigger y compatibilidad 3,3 V de IN1. La alternativa NPN y la etapa completa quedan como referencia para cuando exista la fuente.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: firmware/relay_fan_bench; compilar sin carga; Serial 115200. Ver guía física.

## Compilar y cargar manualmente

Arduino CLI 1.5.1, ESP32 core 3.3.12; DHT sensor library 1.4.7 y Adafruit Unified Sensor 1.1.15 solo si el perfil utiliza DHT11. Actuadores usan ClassAIBench local y pantalla Adafruit GFX 1.12.6 + ST7735/ST7789 1.12.0.

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-ventilador-build firmware/relay_fan_bench
```

Antes de cargar: identificar A-01 y puerto explícito, comprobar su FQBN, registrar cableado real y conservar respaldo privado verificado. Desconectar módulos ajenos y cerrar cualquier monitor. Solo después de resolver TODOS los pendientes eléctricos de esta receta:

```sh
# Sustituir PUERTO_A01 por el puerto reidentificado; no usar el de B-02/NFC.
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_A01 --input-dir /tmp/classai-ventilador-build firmware/relay_fan_bench
arduino-cli monitor --port PUERTO_A01 --config baudrate=115200
```

Cargar utiliza el binario del perfil recién compilado; no recompilar otro perfil entre compile/upload. Abrir Serial puede reiniciar la placa. No se ejecutaron estos comandos de carga/monitor durante esta entrega.

## Prueba guiada y fallos

Acción: Dejar el fan desconectado. Tras identificar A-01 y el relé, enviar arm y on: escuchar un clic de hasta 2 s; stop apaga y desarma.

Aprobación esperada: Solo el relé hace clic y vuelve a reposo; el ventilador no está conectado y no debe girar.

Diagnóstico: Sin clic: stop, retirar USB y revisar VIN/5V, GND, VCC, IN1 y trigger LOW. No conectar el fan para diagnosticar.

Conflictos: GPIO26 coincide con RST TFT y propuesta BCLK I²S.

Faltantes/confirmaciones:
- Identificar placa A-01/puerto, preservar respaldo y armar sin alimentación. B-02/NFC se conserva.
- Prueba disponible ahora: solo clic del relé, sin conectar COM1, NO1, NC1 ni el ventilador.
- Para mover el fan falta una fuente regulada de 5 V con corriente de arranque suficiente; no se dibuja como si estuviera disponible.
- Confirmar pin VIN/5V de A-01, LOW-trigger y compatibilidad 3,3 V de IN1. La alternativa NPN y la etapa completa quedan como referencia para cuando exista la fuente.

## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia física; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [TONG LING · familia relé](https://denkovi.com/Documents/JQC-3FF-S-Z.pdf)
- [Material de la U y criterios de armado](https://github.com/joaquinsalinas06/ClassAI/blob/codex/physical-benches/docs/hardware/circuitos-referencia.md)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
