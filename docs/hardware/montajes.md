# Montajes reconstruibles y organización propuesta

Estado: **propuesta de pruebas**, no arquitectura multinodo implementada ni
pruebas físicas aprobadas. Materiales referenciados por los IDs de
[inventario.md](inventario.md); señales y conflictos en [conexiones.md](conexiones.md).

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
| PLANTILLA · por completar | Propuesto / montado / probado / desmontado | ID de placa + IDs y cantidades usados | Tabla de conexiones real, alimentación y ruta/commit/perfil del firmware | Responsable, prueba y resultado, referencia de foto/log, limitaciones; al desmontar, destino y piezas devueltas |

En cada nueva prueba completar: receta, fecha, quién monta, placa exacta,
materiales/cantidad, conexiones/tensión, firmware, criterio de éxito, resultado
observado y desmontaje. Si falla, registrar el fallo; no mover la issue a
completada por compilación, simulador o fotogramas contados sin observación física.


## Actualización sin ensayo eléctrico (24/10/2026)
Fotos de D-01, D-04, D-05 y B-08/B-09/B-10/B-11 identificadas en [identificacion-fisica.md](identificacion-fisica.md). Ningún montaje se marca probado por ellas. Mantener M-09 bloqueado hasta medir/confirmar fuente, corriente, relé y nivel de señal. E-01/E-02/E-03/E-04 no pasan de pedido a disponible sin recepción confirmada.
