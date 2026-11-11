# Nodo de acceso ClassAI · ensayo local

Esta variante amplía `classai_multinode`, rol 1. Se cargó en E-01 y se comprobó
un tap NFC/HCE con asistencia persistida y relecturas duplicadas en laboratorio.
La placa usa PN532 SPI
18/19/23/5, matriz DIN13/CLK14/CS27, LED25, buzzer17, PIR35 y pulsador32.
La fotoresistencia es opcional en GPIO34/ADC1: divisor a 3V3 y GND, resistencia
nominal 10 kΩ y unión al ADC; confirmar sus piezas y conexiones antes de activarla.
No conectar el divisor a 5 V. `ACCESS_LDR_VALIDATED=0` publica `light_rel:null`;
si se habilita publica ADC/4095, valor relativo sin calibrar, nunca lux;
también ajusta el brillo en cuatro niveles bajos.

La matriz tiene expresiones de sueño, bienvenida, espera, confirmación y rechazo;
el PIR despierta la cara tras calentamiento de 60 s, sin decidir si hay personas.
Esperando ACK no se muestra éxito. Después del ACK aceptado hay sonrisa, patrón
LED y melodía breve; rechazo usa cara y tono diferentes. El buzzer pasivo requiere
`BUZZER_PASSIVE=1`. Matriz y buzzer permanecen deshabilitados por defecto con
`MATRIX_VALIDATED=0` y `BUZZER_VALIDATED=0`; activar solo tras revisar las etapas,
alimentación y niveles reales. La conexión directa de matriz probada antes no
certifica compatibilidad de niveles. GPIO17 necesita validar consumo/accionamiento.

## MQTT y semántica

Para `room=a101`, `device=a101-access`:

- `classai/v1/a101/nodes/a101-access/telemetry`: cada 5 s, v/room/device/role,
  timestamp o null, session_id o null, presence (PIR, null en calentamiento),
  light_rel (0–1 o null), lux y comfort null. QoS de publicación ESP: 0.
- `.../nodes/a101-access/events`: credencial con tipo y token
  opacos (proteger el transporte con TLS); `event_id` estable, `session_id`, hora o null. Outbox LittleFS intenta
  reenviar sin borrar hasta ACK; lleno o fallo del almacenamiento rechaza el tap.
- `.../nodes/a101-access/ack`: backend envía `stored` y `accepted` después de la
  transacción SQLite. `stored` permite retirar el evento y `accepted` decide la
  reacción. ACK repetido o de otro dispositivo no debe producir otra reacción.
- `classai/v1/a101/session`: sesión compartida retenida, emitida por backend;
  el botón solicita inicio/cierre mediante `.../nodes/a101-access/commands`.
- `.../nodes/a101-access/status` y `.../snapshot`: estado y último contexto del
  nodo. Credenciales no van en mensajes confirmados ni logs de usuario.

Publicación QoS 0 no garantiza entrega. El outbox y los ACK mitigan pérdidas, pero
no garantizan resistencia a cortes físicos ni cola ilimitada. El ACK incluye outcome new/duplicate/rejected y attendance_count conservados en
SQLite; solo cada quinta asistencia nueva dispara una celebración. Para eventos
antiguos sin outcome se usa respuesta genérica sin celebrar.
La sesión y el estado de red deben probarse con broker y base reales de laboratorio.
No se incluyen secretos. El broker de producción necesita autenticación, TLS,
identidades por nodo y ACL; no publicar credenciales ni paquetes fuera de la LAN.

## Comprobar antes de usar

`scripts/ci/multinode-build.sh`, pruebas host y backend con datos sintéticos; no
requieren hardware ni claves. Antes de cargar, confirmar E-01, puerto y respaldo,
estado del montaje, ruta de 5 V, salida PIR, etapa de buzzer y niveles de matriz.
Verificar fuera de línea, con servidor y reconexiones, luego prueba física NFC/HCE,
confirmación en SQLite, duplicados, credencial desconocida y corte real. La LDR
requiere calibración y el sonido bajo sigue pendiente de consulta al profesor.
