# Componentes del laboratorio y compatibilidad con ESP32

Revisión documental del 25/10/2026. Fuentes aportadas por Joaquín: **Matriz .pdf**, Anexo K; **Rele DHT11.pdf**, anexos V y X; **PIR.pdf**. Se consultaron texto y dibujos; los PDF privados no se redistribuyen en el repositorio. No hubo ensayo físico nuevo.

- **B-10:** un módulo MAX7219 con una matriz 8×8 y dos conectores de cinco vías. La receta principal conecta VIN/5V, GND, DIN GPIO13, CLK GPIO14 y CS GPIO27 a la cabecera IN, siguiendo el Anexo K; OUT/DOUT es para cascada. La alternativa AHCT permanece disponible si la señal directa de 3,3 V no resulta estable.
- **B-03:** el módulo DHT11 de tres pines del Anexo X contiene pull-up de 10 kΩ y admite alimentación desde 3 V. El dibujo principal usa 3,3 V y elimina la resistencia externa. Cotejar +/OUT/− sobre la pieza: una foto invertida no fija el orden del conector. GPIO4 y periodo de 2,5 s conservados.
- **PIR:** referencia de laboratorio HC-SR501, vista frontal VCC/OUT/GND. La receta conecta VCC a VIN/5V del ESP32 por USB, OUT a GPIO27 y GND común; conserva calentamiento de 60 s.
- **B-11/D-05:** el Anexo V define relé de 5 V activo LOW y carga por COM/NO. La receta completa usa GPIO26→IN1, VIN/5V→VCC, fuente genérica 5 V→COM1, NO1→fan rojo y fan negro→negativo de la fuente. La fuente es material necesario, no recibido.
- **B-09:** buzzer polarizado usado en clase: GPIO17 a + y GND a −, con pulsos breves. La alternativa con transistor se conserva si el ensayo directo causa reinicio, calentamiento o consumo incompatible.

## Alimentación disponible y piezas futuras

Joaquín dispone del ESP32 y USB, **no de Arduino ni de una fuente externa**. Las recetas de sensores, matriz, pantalla, relé de control y audio usan 3V3 o VIN/5V del ESP32 por USB. El ventilador sí muestra la fuente genérica de 5 V / 2 A porque forma parte indispensable de la rama de potencia; debe conseguirse antes de copiar ese banco. Referencia: [ESP32-DevKitC V4 · Power Supply Options](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html#power-supply-options).

La fuente regulada de 5 V / 2 A aparece en el banco del ventilador como material requerido. No representa una fuente recibida ni medida. La potencia del motor va por COM1/NO1 y conductores adecuados, nunca por GPIO o 3V3.

Los montajes alternativos identifican expresamente piezas adicionales y pendientes. Su disponibilidad no se infiere del inventario. Los cables se dibujan continuos para seguirlos visualmente; `pending` conserva el bloqueo y excluye esa arista de la continuidad confirmada del modelo. Ninguno de estos dibujos autoriza energizar un tramo pendiente.

## Pantalla y audio aislados

Se añaden ensayos de diagnóstico ST7789 y MAX98357A con un altavoz, sin sustituir los entregables de mascota/audio de Lando (#91–#93). El patrón de pantalla comprueba orientación/color; el tono de audio comprueba TX I²S. En la vista principal, el MAX98357A usa VIN/5V del USB de forma condicionada y empieza al 1 %; la fuente separada permanece en Compatibilidad para una etapa de mayor potencia. No unir a masa ninguna salida diferencial del amplificador ni conectar dos altavoces en paralelo por inferencia.

## Uso del visor

La vista principal muestra la receta completa y Compatibilidad abre alternativas con adaptación adicional. Los pequeños componentes van sobre contactos definidos de la protoboard. Los recorridos se ordenan según los GPIO, con masas cercanas y puentes explícitos entre rieles cuando hace falta. Cada conexión visible conserva solo su número. Los dibujos no son plantillas métricas: ajustar separación real de patas sin forzarlas, conservando las mismas redes.
