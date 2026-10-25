# M-04 · DHT11 aislado

Ensayo DHT11 aislado sin inicializar el otro sensor.

**Diseño y sketch · ensayo físico pendiente.** Diseño de referencia, sin ensayo físico nuevo.

![Distribución física de referencia](dht11.svg)

[JSON de montaje importable](dht11-fisico.json) · [SVG físico](dht11-fisico.svg). ESP32 USB abajo; orientación de referencia, cotejar serigrafía. Terminales rotulados por función donde el conector aún no está identificado.

## Materiales

- B-03: DHT11 con pull-up integrado
- Protoboard y jumpers recibidos

Cables: 6 M–H + 0 M–M dibujados; cero H–H. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · 3V3 | DHT11 · + | 3,3 V | Pendiente; no conectar |
| DHT11 · − | ESP32 · GND | — | Referencia |
| DHT11 · OUT | ESP32 · GPIO4 | — | Referencia |

## Armado cable por cable · USB desconectado

12 jumpers: 11 macho–hembra y 1 macho–macho. PIR se conecta por nodos independientes de la protoboard; sin empalmes ni H–H. ESP32 DEVKITV1 30 pines fotografiado, ID A/B por asociar; terminales PIR aún no legibles y VIN sin medir. Propuesta, no ensayo físico. Guía UTEC aportada: breakout DHT11 con pull-up integrado; se elimina R externa.

| Nº | Color | Tipo | Origen | Destino | Condición |
|---|---|---|---|---|---|
| 1 | black | M–H | esp1:GND | bb:RN28 | GND derecho del ESP32 → RN28. Riel derecho − para ambos sensores; comprobar continuidad, USB apagado. |
| 2 | red | M–H | esp1:3V3 | bb:LP29 | 3V3 → LP29. Riel izquierdo + solo 3,3 V; riel izquierdo − queda libre. |
| 3 | black | M–H | bb:RN5 | dht1:GND | RN5 → − del DHT11. M–H: hembra al módulo y macho a RN5. |
| 4 | red | M–H | bb:LP15 | dht1:VCC | M–H rojo: + del módulo DHT11 a 3,3 V. Pull-up integrado, según guía UTEC aportada. |
| 5 | green | M–H | dht1:DATA | bb:A8 | Terminal OUT del DHT11 → A8. A8 y C8 pertenecen a la misma tira, lado A–E. |
| 6 | green | M–H | esp1:GPIO4 | bb:B8 | GPIO4 del ESP32 → B8; misma red de OUT y pata 1 de R1. |

M–H: hembra al conector macho del módulo/ESP32 y macho al agujero. M–M: ambos extremos en agujeros distintos. Nunca dos puntas en un agujero.

LP/LN: riel izquierdo +/−; RP/RN: derecho +/−. A–E y F–J son tiras separadas por fila. Confirmar continuidad/cortes de la protoboard real; los rieles opuestos no están unidos. Patas colocadas: módulos externos, conectores por verificar.

Cruces no unen redes. Las condiciones de cada tramo aparecen en esta tabla; un cable por verificar no cuenta como continuidad confirmada aunque se dibuje continuo. Colores son identificadores del dibujo: elegir cables reales y anotar equivalencias. SVG no demuestra alcance físico.

## Antes de energizar

1. Distribución física de ambiente: VCC PIR en F20/H20 y OUT en G24/J24; no confundir tiras.
2. Etiquetas del PIR no legibles en fotos: no inferir orden por lente o jumper amarillo.
3. VIN no es salida regulada garantizada; mantener esa alimentación pendiente hasta resolver la variante.
4. Guía UTEC Anexo X: DHT11 de tres pines con pull-up integrado; sin resistencia externa. ESP32: alimentar a 3,3 V y cotejar +/OUT/−.
5. Identificar A-01/puerto y preservar respaldo privado antes de cargar.
6. Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
7. Cotejar etiquetas +/OUT/− del módulo DHT11 de laboratorio, alimentado a 3,3 V.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: firmware/ambient_bench · perfil dht; compilar sin carga; Serial 115200. Ver guía física.

## Compilar y cargar manualmente

Arduino CLI 1.5.1, ESP32 core 3.3.12; DHT sensor library 1.4.7 y Adafruit Unified Sensor 1.1.15 solo si el perfil utiliza DHT11. Actuadores usan ClassAIBench local y pantalla Adafruit GFX 1.12.6 + ST7735/ST7789 1.12.0.

```sh
arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --build-property 'compiler.cpp.extra_flags=-DBENCH_DHT_ONLY=1' --output-dir /tmp/classai-dht11-build firmware/ambient_bench
```

Antes de cargar: identificar A-01 y puerto explícito, comprobar su FQBN, registrar cableado real y conservar respaldo privado verificado. Desconectar módulos ajenos y cerrar cualquier monitor. Solo después de resolver TODOS los pendientes eléctricos de esta receta:

```sh
# Sustituir PUERTO_A01 por el puerto reidentificado; no usar el de B-02/NFC.
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port PUERTO_A01 --input-dir /tmp/classai-dht11-build firmware/ambient_bench
arduino-cli monitor --port PUERTO_A01 --config baudrate=115200
```

Cargar utiliza el binario del perfil recién compilado; no recompilar otro perfil entre compile/upload. Abrir Serial puede reiniciar la placa. No se ejecutaron estos comandos de carga/monitor durante esta entrega.

## Prueba guiada y fallos

Acción: Observar 20 lecturas; desconectar DATA solo con USB retirado para ensayar error y reiniciar.

Aprobación esperada: temp_c/rh_pct válidos o null con dht_valid:false; nunca cero inventado.

Diagnóstico: Error: revisar −/OUT/+, GPIO4 y pull-up a 3,3 V.

Conflictos: PIR GPIO27 entra en conflicto con DC de la TFT.

Faltantes/confirmaciones:
- Identificar A-01/puerto y preservar respaldo privado antes de cargar.
- Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
- Cotejar etiquetas +/OUT/− del módulo DHT11 de laboratorio, alimentado a 3,3 V.

## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia física; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [Adafruit · DHT y pull-up](https://learn.adafruit.com/dht/connecting-to-a-dhtxx-sensor)
- [Joy-IT · HC-SR501](https://joy-it.net/en/products/SEN-HC-SR501)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
