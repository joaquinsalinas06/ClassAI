# Montajes reconstruibles y organización propuesta

Estado: **propuesta de pruebas**, no arquitectura multinodo implementada ni
pruebas físicas aprobadas. Materiales referenciados por los IDs de
[inventario.md](inventario.md); señales y conflictos en [conexiones.md](conexiones.md).

La colección [esquemas/README.md](esquemas/README.md) reúne las 12 guías y SVG;
[siguientes-bancos.md](siguientes-bancos.md) concreta el orden y el presupuesto de cables.

## Orden de trabajo con lo que hay disponible

Primero pruebas aisladas y después integración. Registrar resultado y desmontar
antes de reutilizar GPIO. Los módulos sin identificar o que necesiten soldadura,
fuente o adaptación se quedan bloqueados hasta resolver ese requisito.

| Receta | Material mínimo (IDs / cantidad) | Conexiones o condición | Qué demostrar y qué NO demuestra |
|---|---|---|---|
| M-00 · Identificar placas | A-01 **o** B-02; A-03 **o** D-10; laptop | USB de datos; una placa identificada cada vez | Chip/placa/puerto, propietario, firmware y respaldo privado antes de reemplazarlo; no verifica sensores |
| M-01 · LED y botón | Una placa; A-04 o B-01; C-05 x1, C-01 x1, C-04 x1; jumpers de A-02/C-07/C-08 | Prueba aislada propuesta: GPIO25 → resistencia 1 kΩ → LED → GND; botón GPIO32 → GND con INPUT_PULLUP. Verificar patas/polaridad | LED controlado y debounce: una pulsación/un cambio; resistencia/polaridad comprobadas antes de alimentar |
| M-02 · Mascota | Una placa; D-04 x1; cable USB y jumpers | Mapa TFT del prototipo: 14/23/5/27/26; verificar VCC/BL. No conectar NFC, PIR ni relé sobre esos pines | Animación visible y estable. El código de referencia es el prototipo de mascota; no produce MQTT por sí solo |
| M-03 · Transporte MQTT | Una placa, USB, red compatible y laptop | Requiere un perfil sin sensores/NFC/actuadores no conectados. El nodo base no es ese perfil por defecto. Contrato classai/v1 y SQLite de prueba | Status, telemetría null, config y reconexión; no etiquetar como medición física ni asistencia NFC |
| M-04 · Temperatura/humedad | Una placa; B-03 x1; protoboard y jumpers | Prueba aislada: DATA GPIO4; identificar alimentación/pull-up y usar DHT11 | Lecturas reales y manejo de fallo; no inventariar DHT22 ni MLX por estar en el firmware |
| M-05 · Presencia | Una placa; D-06 **o** B-04 x1; protoboard y jumpers | Prueba aislada: OUT GPIO27, solo si pantalla desconectada y niveles confirmados | Movimiento, retorno, retardo y jumper; no afirmar presencia inmóvil garantizada |
| M-06 · Sonido relativo | Una placa; B-08 x1; protoboard y jumpers | **AO/G/+/DO identificados**; tras validar alimentación y máximo AO/DO: AO GPIO34 (ADC1); DO opcional no asignado | Diferencias relativas de señal, no dB calibrados ni reconocimiento de voz |
| M-07 · Audio digital | Una placa; D-07 x1 para captura **o** D-08 x1 + D-09 x1 para reproducción | Captura/reproducción primero por separado; I²S, fuente y pines pendientes de diseño; verificar conectores/soldadura. No conectar un altavoz al micrófono | Captura digital o tono/audio a bajo volumen; no existe aún integración de estos drivers en el nodo base |
| M-08 · Matriz / buzzer | Una placa; B-10 **o** B-09 | Identificar componente, tensión y adaptación/driver antes de fijar GPIO | Señalización aislada; no marcar control completo de confort |
| M-09 · Ventilador con control | Una placa; D-05 (5 V) x1; un canal de B-11 (relés 5 V) **o** driver adecuado; fuente DC externa y conexiones seguras | Bobinas 5 V confirmadas; **bloqueado** hasta conocer arranque del fan y capacidad de fuente, probar activación GPIO 3,3 V, jumper y contactos COM1/NO1. No derivar corriente del hub/ESP32 | ON/OFF, estado seguro al boot y ausencia de resets; no usar tensión de red |
| M-10 · NFC | Una placa; D-01 x1, D-02 o D-03; jumpers; LED/resistencia opcionales | Soldar header, verificar V3 y SPI; solo entonces mapa 18/19/23/5. Pantalla desconectada | Versión PN532, tarjeta/llavero y repetibilidad; móvil requiere además Android HCE y prueba APDU física |

«Una placa» significa escoger A-01 o B-02, anotarlo en el registro y confirmar que
está disponible; E-01 solo se incorpora tras recepción. La protoboard y los cables
no son exclusivos de una receta: no sumar materiales reutilizados como si fueran
stock adicional. Las recetas son manuales/documentales; no se añaden scripts de
flash ni control remoto del hardware en este cambio.

## Propuesta de reparto por nodos

El inventario permite pensar en tres roles, pero hoy solo hay **dos ESP32 recibidos**.
Usar perfiles cambiables, sin comprometer una placa prestada a una función permanente.
Los roles son lógicos; la etiqueta física y el propietario siguen siendo los del inventario.

| Rol propuesto | Material principal | Asignación orientativa, NO desplegada | Retirada del préstamo |
|---|---|---|---|
| N-UI · Interfaz y mascota | D-04; después D-08/D-09 y eventualmente D-07 | A-01 mientras esté prestado y disponible | Retirar sin perder propiedad de D; volver a probar interfaz en otra placa disponible |
| N-ENV · Ambiente y actuación local | B-03, un PIR, B-08; luego fan/relé/matriz/buzzer validados | B-02 solo como banco temporal; priorizar pruebas y devolución | No convertir B en dependencia permanente; migrar perfil o desmontar antes de devolver |
| N-NFC · Credenciales y sesión | D-01/D-02/D-03 y LED/resistencia | E-01 cuando se reciba y se compruebe; antes, prueba aislada en A-01 o B-02 | E-01 sigue siendo personal; el equipo debe disponer después de una placa propia para continuidad |

Con dos placas: mantener un montaje de interfaz y usar la segunda para ensayos
**secuenciales** de ambiente/NFC. Si la segunda debe devolverse, continuar con
una placa y montajes alternados. El tercer ESP32 facilita separar, pero no es
requisito para empezar ni permiso para conectar tres montajes ahora.

No cambiar GPIO de un montaje ya validado solo para aprovechar todos los
componentes. Primero escoger qué funciones necesita la demo; no son obligatorios
ambos PIR, los seis LEDs, ambos altavoces y todas las pantallas a la vez.

## Misiones para dos placas conectadas (24/10/2026)

Plan previo a conectar hardware, solicitado por Joaquín. Revisión de issues y
comentarios de [#2](https://github.com/joaquinsalinas06/ClassAI/issues/2),
[#13](https://github.com/joaquinsalinas06/ClassAI/issues/13) y
[#72](https://github.com/joaquinsalinas06/ClassAI/issues/72), junto con las
aclaraciones de la [PR #87](https://github.com/joaquinsalinas06/ClassAI/pull/87),
head `18b2522`. Las issues citadas en la tabla siguen abiertas en esta revisión;
esta planificación no cambia estados, responsables, fechas ni dependencias GitHub.

Las columnas son bancos temporales, no nuevos IDs de inventario. Tras M-00,
elegir una placa distinta A-01/B-02 para cada banco y reservar materiales sin
duplicarlos. La mascota puede esperar para dedicar ambas placas a validaciones
que desbloquean el producto. E-01 solo se suma después de confirmar su recepción.

| Turno propuesto | Banco NFC, una placa | Banco de entradas, otra placa | Evidencia para avanzar |
|---|---|---|---|
| 0 · Identidad y preservación | M-00, identificar primera placa | M-00, identificar segunda placa después; luego pueden quedar ambas conectadas | ID/propietario, modelo, puerto USB asociado, firmware previo y respaldo privado por placa; ninguna carga todavía |
| 1 · Entradas mínimas | M-10: D-01 + D-02/D-03; validar SPI y tarjetas, issue [#2](https://github.com/joaquinsalinas06/ClassAI/issues/2) | M-01: C-04 + C-05 + C-01, issue [#3](https://github.com/joaquinsalinas06/ClassAI/issues/3) y parte visual de [#10](https://github.com/joaquinsalinas06/ClassAI/issues/10) | NFC: versión, 20 lecturas consecutivas y retorno tras retirar tarjeta. Botón: una transición por pulsación, sin repetir al mantenerlo; LED responde. Solo hay dos credenciales inventariadas: falta una tercera para completar #2 |
| 2 · Teléfono y ambiente | M-10 con Android: [#72](https://github.com/joaquinsalinas06/ClassAI/issues/72); después matriz de [#76](https://github.com/joaquinsalinas06/ClassAI/issues/76) | M-05 con un PIR, [#7](https://github.com/joaquinsalinas06/ClassAI/issues/7); después M-04 con B-03 y M-06 con B-08, en ensayos separados | HCE: SELECT/GET_CREDENTIAL, 10 taps con credencial estable y tarjeta legible después. PIR: activación/retorno/retardo. DHT11: 20 lecturas válidas o error explícito. Sonido: tres estímulos y rango ADC relativo, tras medir niveles |
| 3 · Cadena remota | Pasar C-04 al banco NFC tras desmontar M-01: sesión [#18](https://github.com/joaquinsalinas06/ClassAI/issues/18), transporte [#23](https://github.com/joaquinsalinas06/ClassAI/issues/23), asistencia [#34](https://github.com/joaquinsalinas06/ClassAI/issues/34) y [#75](https://github.com/joaquinsalinas06/ClassAI/issues/75) | Tras validar entradas, preparar agregación parcial [#19](https://github.com/joaquinsalinas06/ClassAI/issues/19), telemetría [#24](https://github.com/joaquinsalinas06/ClassAI/issues/24) y fallos [#41](https://github.com/joaquinsalinas06/ClassAI/issues/41) | Comparar serial → MQTT → BD → UI; distinguir las aulas de ensayo. Probar los ocho escenarios de #75, incluida deduplicación por estudiante/sesión. No declarar integración entre placas |
| 4 · Actuación y regresión | M-02 mascota como ensayo opcional separado, una vez liberada una placa | M-09 solo al resolver fuente/lógica de [#9](https://github.com/joaquinsalinas06/ClassAI/issues/9); luego [#26](https://github.com/joaquinsalinas06/ClassAI/issues/26) y [#35](https://github.com/joaquinsalinas06/ClassAI/issues/35) | ON/OFF, boot seguro y ausencia de resets; posteriormente cortes de red [#40](https://github.com/joaquinsalinas06/ClassAI/issues/40), cierre/historial [#42](https://github.com/joaquinsalinas06/ClassAI/issues/42) y sesión completa [#39](https://github.com/joaquinsalinas06/ClassAI/issues/39) con arquitectura acordada |

### Cableados candidatos por misión, por confirmar físicamente

Usar los mapas de M-01/M-04/M-05/M-06/M-10 y [conexiones.md](conexiones.md):
PN532 18/19/23/5 en su placa; botón 32 y LED 25 con resistencia en la otra.
Después, en el banco de entradas, DHT11 DATA 4, PIR OUT 27 o sonido AO 34.
Cada receta empieza aislada. Registrar alimentación, GND, pin a pin y cables
reales antes de cargar; estos números son GPIO, no posiciones del conector.
VCC/pull-up/niveles siguen sujetos a verificar la placa concreta. No unir GPIO
entre ESP32; estas misiones no necesitan un enlace eléctrico entre placas.

### Preparación que sigue pendiente

- **Firmware por misión:** el nodo base activa MLX90614/NFC e inicializa relé 26
  y buzzer 17. No es un sketch mínimo para estas pruebas; preparar y revisar cada
  perfil antes de cargar, incluidas inicializaciones y escrituras de salidas.
  El prototipo TFT existe por separado; no mezclarlo con el nodo integrado.
- **Diferencias con issues:** B-03 es DHT11, mientras [#4](https://github.com/joaquinsalinas06/ClassAI/issues/4)
  y #19 piden DHT22. Registrar el ensayo DHT11 como parcial y acordar alcance
  antes de completar esas issues. El BH1750 de [#5](https://github.com/joaquinsalinas06/ClassAI/issues/5)
  y el MLX90614 del firmware no están inventariados; no afirmar lux ni agregador
  completo. B-08 tiene modelo pendiente y exige validar niveles; D-07 INMP441
  es otra interfaz, no sustituto directo del sensor analógico.
- **Dos USB:** después de identificar cada placa por separado, mantener una
  tabla ID ↔ puerto ↔ serie USB (si existe) ↔ chip/MAC verificado. Un puente USB
  no identifica por sí solo el SoC ni el propietario. Seleccionar puerto
  explícito para cada lectura/carga; nunca usar autodetección con dos placas.
  Revalidar la asociación si se reconecta y no abrir dos monitores sobre un puerto.
- **Respaldo:** localizar el respaldo existente sin moverlo ni sobrescribirlo;
  verificar tamaño/hash y asociación con la placa. Si falta uno, obtenerlo antes
  de reemplazar firmware, solo tras identificar la placa y revisar si el acceso
  reinicia el montaje. Guardar flash/NVS fuera de Git; no publicar contenido ni
  asumir que tener un archivo demuestra que se haya probado su restauración.
- **MQTT y software:** preparar broker/backend/web y enrolamiento Android en la
  laptop mientras se prueban entradas; es trabajo independiente de las placas.
  Dos nodos base en una misma aula colisionan: usar aulas de ensayo distintas o
  un solo emisor MQTT hasta resolver identidad/sesión. El comentario de #13
  describe QoS objetivo; PubSubClient publica realmente con QoS 0, también eventos.
- **Potencia y señalización:** #9 espera fuente 5 V, corriente de arranque,
  jumper y lógica de B-11. #10 solo puede avanzar parcialmente con LED hasta
  identificar buzzer y controlador/niveles de matriz. M-07 audio queda como
  ensayo posterior independiente, con sus pines y drivers aún pendientes.
- **Cierre:** cada resultado aporta evidencia a [#52](https://github.com/joaquinsalinas06/ClassAI/issues/52),
  [#56](https://github.com/joaquinsalinas06/ClassAI/issues/56),
  [#57](https://github.com/joaquinsalinas06/ClassAI/issues/57) y
  [#58](https://github.com/joaquinsalinas06/ClassAI/issues/58).
  La issue [#36](https://github.com/joaquinsalinas06/ClassAI/issues/36) requiere
  aplicación única en ESP32: los bancos paralelos no satisfacen ese alcance ni
  aprueban una arquitectura distribuida.

### Ficha por placa al conectar

Completar una ficha por placa y anexar cada cambio al registro histórico:

| Campo | Dato que debe observarse |
|---|---|
| Fecha/hora y responsable | Hora local America/Lima; quién conecta y prueba |
| Identidad | A-01/B-02, propietario, módulo/serigrafía, chip y puerto verificados; E-01 solo tras recepción |
| Preservación | Firmware previo conocido/desconocido; referencia privada del respaldo, tamaño/hash y restauración probada/no probada |
| Montaje real | IDs/cantidades, pin ESP32 → terminal del módulo, alimentación/fuente y mediciones; foto identificable sin secretos |
| Ensayo | M-xx + issues, sketch/commit/perfil y puerto explícito, criterio esperado y resultado observado |
| Cierre | Pendiente/PASS/FAIL con evidencia, fallos, qué quedó conectado y destino de cada pieza al desmontar |

## Trabajo necesario antes de activar varios nodos en una misma aula

La arquitectura actual del producto sigue descrita en [architecture.md](../architecture.md).
Este documento propone una organización física, no la sustituye.

- El firmware base forma `deviceId` como `esp32-{ROOM_ID}` y lo usa también como
  client ID MQTT. Dos copias en la misma aula colisionarían; hace falta identidad
  única por nodo, sin confundir el ID de inventario con una credencial de alumno.
- La sesión es local (`sessionActive/sessionId`) y no existe sincronización de
  sesión entre placas. Propuesta: N-NFC sea la única autoridad de inicio/fin;
  definir y probar propagación/reanudación antes de vincular otros nodos a su sesión.
- Los tópicos actuales son por aula. No inventar aquí nuevos mensajes o cambiar
  contratos: especificar roles, estado por nodo, config y enlace de sesión en una
  tarea posterior. Status retenido compartido hoy no distingue tres nodos.
- Evitar que N-UI publique una segunda copia de mediciones o controle el mismo
  actuador. N-ENV conservaría el control local de confort con config/NVS, también
  sin red; la interfaz mostraría el estado, sin convertirse en dependencia del fan.
- Definir fuente de cada métrica, caducidad de datos, nodos desconectados y qué
  ocurre al perder N-NFC/N-ENV antes de afirmar integración. Probar agregación en
  backend/web para no mezclar mediciones o sesiones de dispositivos distintos.

Hasta resolverlo, usar ensayos aislados y diferenciar aulas de prueba cuando
corresponda; una demo con tres placas no está implementada por escribir esta tabla.

## Registro de montaje y desmontaje

Registrar una fila nueva por cambio; no sobrescribir resultados históricos.
Guardar fotos/logs relevantes sin secretos ni tokens completos. No publicar
respaldos de flash/NVS: pueden contener credenciales.

| Registro / fecha real | Estado | Placa / módulos | GPIO / firmware | Evidencia y pendientes |
|---|---|---|---|---|
| R-001 · 23/10/2026, fecha del relato | Declaración de Joaquín | D-04 es la pantalla del prototipo y fue retirada; placa física no asociada todavía a A-01 o B-02 | Prototipo TFT: 14/23/5/27/26 | No asumir montaje aún conectado. Confirmar placa/propietario antes de reconstruir. No demuestra MQTT físico |
| R-002 · 24/10/2026, America/Lima | Inspección del host y planificación; sin ensayo eléctrico | Ningún ESP32 conectado, confirmado por Joaquín; A-01/B-02 sin asociación USB; E-01 pendiente de recepción confirmada | Sin cableado real observable ni carga de firmware; propuesta de misiones de este documento | `ls /dev/cu.*` e `ioreg -r -c IOSerialBSDClient -l`: solo Bluetooth-Incoming-Port, debug-console y RedmiBuds6Play; `system_profiler SPUSBDataType -json`: lista vacía, plano IOUSB sin periféricos. Pendientes identidad de placas, cableado pin a pin, localización/verificación del respaldo existente y ensayos. No se leyó ni escribió flash/NVS |
| R-003 · 24/10/2026, America/Lima | Desarrollo de visualizador; sin ensayo eléctrico | Propuesta ESP32 + B-03 + un PIR D-06/B-04 sin asignación física | Referencias lógicas GPIO4/27, VCC de sensores pendiente; sin carga ni lectura de flash | Banco local `/montajes`, JSON, pasos e historial según [visualizador.md](visualizador.md). La interfaz no valida niveles, dimensiones, fuente ni inserción real. Cableado y recepción de placas sin nuevas comprobaciones |
| R-004 · 24/10/2026, America/Lima | Rediseño documentado y firmware compilado; sin ensayo físico | ESP32 30 pines reportado sin ID A/B; B-03 con −/OUT/+ reportados; PIR sin ID confirmado | Guía completa GPIO4/27, USB, 3,3/5 V y pull-up 10 kΩ según [banco-ambiente.md](banco-ambiente.md); `firmware/ambient_bench` | Compilación ESP32 3.3.12 aprobada, sin upload. Pendientes identidad/puerto/respaldo, orden real PIR, ruta USB–VIN y mediciones/cableado. Ningún componente pasa a probado |
| R-005 · 24/10/2026, America/Lima | Aclaración de etiquetas y circuito; sin ensayo eléctrico | B-02 reportada 30 pines compatible DevKit V1; primera placa sin ID asociado; E-01 pendiente | D4=GPIO4, D27=GPIO27; mapa J2/J3 de 38 pines solo de referencia | Relato pin a pin y explicación del pull-up en [banco-ambiente.md](banco-ambiente.md); visor añade esquema de rama y comparador. Validación software: 56 tests, typecheck/lint/build y smoke de navegador aprobados. VN/D4/D5 dudosos en primera placa; confirmar serigrafía, modelo, USB, VIN–GND medido y pull-up incorporado. Sin nuevas mediciones, cableado observado ni operación sobre flash; respaldos y guardado local conservados |
| R-006 · 24/10/2026, America/Lima | Recorrido simplificado; sin montaje ni ensayo físico | Referencias B-02/A-01 sin asociación USB; B-03; PIR B-04/D-06 por identificar; C-02 | Misma red DHT11 GPIO4 / PIR GPIO27 y pull-up; 10 jumpers / 20 giros frente a 12 / 38 | 59 pruebas, lint, typecheck/build y smoke de navegador aprobados; equivalencia de redes comprobada por software. PIR junto al ESP32, rieles derechos libres. Propuesta requiere 6 M–H, 1 M–M, **3 H–H por confirmar**; longitud/estado libres pendientes. Sin mediciones ni operaciones sobre flash; preservar historial y respaldo privado. Véase [banco-ambiente.md](banco-ambiente.md) |
| R-007 · 24/10/2026, America/Lima | Ensayo Wokwi parcial; no ensayo eléctrico | ESP32/DHT22/PIR virtuales; B-03 real sigue siendo DHT11 | Sketch independiente en [ambient_simulation](../../firmware/ambient_simulation/README.md); GPIO4/27 | Compila y arranca Wokwi: 24 °C/40 % → 29 °C/65 % observados; PIR LOW observado, HIGH/retorno pendientes pese a confirmación del comando. Simulación detenida. Joaquín declara no disponer de multímetro; no inventar medidas ni exigir compra para diseñar. Identificación/voltajes físicos y 3 H–H sin confirmar; skill accesible en checkout habitual con referencia al inventario del worktree |
| R-008 · 24/10/2026, America/Lima | Fotografías revisadas y receta sin H–H; sin ensayo físico | ESP32 DEVKITV1 30 pines fotografiado sin ID A/B; PIR aspecto HC-SR501 sin etiquetas legibles; ausencia de H–H confirmada | GPIO4/27 conservados; 11 M–H + 1 M–M; VCC PIR en F20/H20, OUT en G24/J24, masa RN | D4/D5/VP/VN legibles. 60 pruebas, typecheck/lint/build y smoke de navegador aprobados; diagrama de 12 jumpers/25 giros, equivalencia de redes y ausencia de cables componente–componente comprobadas por software. Sin soldar ni insertar PIR por fuerza. Modelos de potencia/orden PIR, continuidad y alcance físico pendientes. Fotos privadas no publicadas; sin flash ni mediciones |
| R-009 · 24/10/2026, America/Lima | Colección de esquemas y preparación; sin nuevo montaje físico | Adaptadores NFC y bocinas en soldadura según Joaquín, sin finalización confirmada; dos ESP32 disponibles | 12 referencias M-00 a M-10 con M-07/M-08 separados; LED/botón y NFC aislados compilados sin upload | 66 pruebas web, lint/typecheck/build, smoke de 12 bancos y host de sketches aprobados; biblioteca y exportación SVG/JSON en /montajes; [colección](esquemas/README.md), [orden de trabajo](siguientes-bancos.md). Rutas I²S nuevas son propuestas, no drivers integrados. Fuente/etapas de audio, buzzer, matriz y fan pendientes. Sin alterar respaldo, flash, propietarios ni recepción de E |
| R-010 · 24/10/2026, America/Lima | Montaje NFC diseñado; sin ensayo físico | ESP32 30 pines sin asociación nueva A/B; D-01 cabecera macho confirmada por Joaquín, soldadura terminada sin comprobar; D-02/D-03 | PN532 SPI 18/19/23/5 y 3V3/GND, DIP 1 OFF/2 ON; 12 M–H, A2/B2 a A12/B12; IRQ/RSTO/rieles libres | [Guía física NFC](banco-nfc.md), SVG/JSON reproducibles; 70 pruebas web, typecheck/lint/build y smoke navegador aprobados; paridad de seis redes y mapa de sketch comprobada; host stubs aprobado. Compilación del banco y resultado detallados en su README. Sin cargar firmware ni leer flash; respaldo y borradores guardados conservados. Pendientes: terminación soldadura, placa/puerto, alcance/contactos reales, versión PN532, tarjeta mantenida y 10 tarjeta + 10 llavero. HCE posterior |
| PLANTILLA · por completar | Propuesto / montado / probado / desmontado | ID de placa + IDs y cantidades usados | Tabla de conexiones real, alimentación y ruta/commit/perfil del firmware | Responsable, prueba y resultado, referencia de foto/log, limitaciones; al desmontar, destino y piezas devueltas |

En cada nueva prueba completar: receta, fecha, quién monta, placa exacta,
materiales/cantidad, conexiones/tensión, firmware, criterio de éxito, resultado
observado y desmontaje. Si falla, registrar el fallo; no mover la issue a
completada por compilación, simulador o fotogramas contados sin observación física.


## Actualización sin ensayo eléctrico (24/10/2026)
Fotos de D-01, D-04, D-05 y B-08/B-09/B-10/B-11 identificadas en [identificacion-fisica.md](identificacion-fisica.md). Ningún montaje se marca probado por ellas. Mantener M-09 bloqueado hasta medir/confirmar fuente, corriente, relé y nivel de señal. E-01/E-02/E-03/E-04 no pasan de pedido a disponible sin recepción confirmada.
