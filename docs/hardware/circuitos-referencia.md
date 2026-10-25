# Componentes del laboratorio y compatibilidad con ESP32

Revisión documental del 25/10/2026. Fuentes aportadas por Joaquín: **Matriz .pdf**, Anexo K; **Rele DHT11.pdf**, anexos V y X; **PIR.pdf**. Se consultaron texto y dibujos; los PDF privados no se redistribuyen en el repositorio. No hubo ensayo físico nuevo.

- **B-10:** un módulo MAX7219 con una matriz 8×8 y dos conectores de cinco vías. IN usa DIN; OUT usa DOUT para cascada y se deja libre. La guía de clase emplea alimentación y lógica Arduino de 5 V. Esto identifica la familia del módulo, pero no demuestra que su entrada reconozca 3,3 V del ESP32. El montaje simple muestra las cinco funciones; los tres datos permanecen pendientes. El montaje alternativo especifica SN74AHCT125N, alimentación de 5 V, sus habilitaciones y desacoplo. No usar un conversor bidireccional I²C como sustitución automática. GPIO13 DIN, GPIO14 CLK, GPIO27 CS; se evita GPIO15 de arranque. Estos bancos se ensayan por separado del PIR.
- **B-03:** el módulo DHT11 de tres pines del Anexo X contiene pull-up de 10 kΩ y admite alimentación desde 3 V. El dibujo principal usa 3,3 V y elimina la resistencia externa. Cotejar +/OUT/− sobre la pieza: una foto invertida no fija el orden del conector. GPIO4 y periodo de 2,5 s conservados.
- **PIR:** referencia de laboratorio HC-SR501, VCC de 5 V, OUT y GND. Conservar GPIO27 y calentamiento. Las vistas aportadas no justifican intercambiar posiciones; cotejar etiquetas. Se propone fuente externa regulada de 5 V, manteniendo VIN desconectado. OUT compatible con ESP32 debe confirmarse en la variante real.
- **B-11:** módulo de dos relés, con su electrónica de control incluida. Anexo V describe entrada activa LOW, VCC de 5 V y carga por COM/NO. La bobina de 5 V no certifica compatibilidad de IN1 con GPIO de 3,3 V. El dibujo principal contiene módulo, ventilador y fuente propuesta. La alternativa con 2N3904 invierte la señal y usa el perfil BENCH_RELAY_NPN_ONLY; no intercambiar perfiles. Confirmar puente JD-VCC, lógica, corriente del ventilador y conector antes de conectar potencia. IN2 queda apagado según la referencia LOW-trigger.
- **B-09:** buzzer de dos patas con +; Joaquín reporta uso previo desde alimentación de Arduino y menciona 3,3 V. Se representa insertado en dos tiras de la protoboard, con señal GPIO17 y masa. Dos patas no identifican activo/pasivo ni consumo desde GPIO. El cable de señal sigue pendiente hasta confirmar compatibilidad; la alternativa con transistor está disponible por separado. No se añaden resistencias a la vista principal por defecto.

## Alimentación y piezas propuestas

La fuente dibujada es una **propuesta genérica regulada de 5 V / 2 A**, con salida USB y cable USB a bornes DC. No representa una fuente recibida, una medición ni un módulo MB102 capaz de 2 A. Confirmar capacidad de arranque del ventilador y polaridad. La potencia del motor va por conexiones de carga/borneras, fuera de los contactos de la protoboard. El ESP32 conserva alimentación USB y masa común cuando corresponde; VIN no se usa como prueba de 5 V.

Los montajes alternativos identifican expresamente piezas adicionales y pendientes. Su disponibilidad no se infiere del inventario. Los cables se dibujan continuos para seguirlos visualmente; `pending` conserva el bloqueo y excluye esa arista de la continuidad confirmada del modelo. Ninguno de estos dibujos autoriza energizar un tramo pendiente.

## Pantalla y audio aislados

Se añaden ensayos de diagnóstico ST7789 y MAX98357A con un altavoz, sin sustituir los entregables de mascota/audio de Lando (#91–#93). El patrón de pantalla comprueba orientación/color; el tono de audio comprueba TX I²S. No son reconocimiento de voz ni reproducción de la mascota. No unir a masa ninguna salida diferencial del amplificador ni conectar dos altavoces en paralelo por inferencia.

## Uso del visor

La vista principal muestra las piezas del banco; Compatibilidad abre la alternativa cuando corresponde. Los pequeños componentes van sobre contactos definidos de la protoboard. Los recorridos se ordenan según los GPIO, con masas cercanas y un puente explícito entre negativos cuando hace falta. Los dibujos no son plantillas métricas: ajustar separación real de patas sin forzarlas, conservando las mismas redes. Las revisiones guardadas anteriores siguen disponibles y pueden representar el diseño anterior.
