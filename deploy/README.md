# Servidor persistente ClassAI

Preparación, **sin contratación ni despliegue automático**. Linux con Docker
Compose, DNS para web y MQTT, entrada80/443/8883 y salida a NTP/proveedores
configurados. Estimación inicial2vCPU/4GiB para API/ingesta/broker/web; medir y
ampliar para inferencia de voz. Cada ESP32 necesita Wi-Fi2,4GHz con acceso al
broker; tres laptops solo aportan USB, salvo el agente del profesor.

## Preparación privada

Instalar OpenSSL y mosquitto_passwd. En el servidor, con este checkout:

```sh
python3 deploy/prepare.py --web-host classai.TU_DOMINIO --mqtt-host mqtt.TU_DOMINIO
# El proceso rechaza sobreescritura. No imprime secretos; no ejecutar bajo set -x.
sudo chown -R 1883:1883 deploy/.secrets/mqtt
```

El helper genera CA privada, certificado MQTT con SAN externo y `broker`,
contraseñas distintas y .env ignorado. `.secrets/device-passwords.txt` conserva
usuarios de nodos; transferir solo su credencial a cada secrets.h y el CA PEM.
No copiar la clave de CA a nodos. Servidor.crt expira90d; CA365d. Renovar antes
de caducar con la misma CA, conservar SAN broker+host, sustituir certificado/
clave con propietario1883/modo640 y reiniciar broker; no desactivar verificación.
Guardar CA/secretos y respaldos fuera de Git. No ejecutar el helper sobre una
instalación existente para renovar: se niega a sobrescribir datos.

ACL actual corresponde a a101. Para otra aula, cambiar ROOM_ID y añadir entradas
explícitas equivalentes; no usar patrón que permita publicar en snapshots/ACK
ajenos. classai-ingest produce confirmaciones y classai-api publica config.
TLS usa CA verificada en paho y ESP32. Caddy obtiene HTTPS para el dominio web.

## Arranque y comprobación

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml up --build -d
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
```

No usar `config` sin --quiet en logs compartidos: la expansión incluye secretos.
Únicamente broker8883 y Caddy80/443 se publican. API/SQLite/worker de voz son
internos. DATABASE_PATH compartido en volumen, WAL y un worker API. Los LWT,
snapshots y sesión sobreviven en broker; el backend repone estado desde SQLite.
La API actual conserva sus rutas públicas de lectura/enrolamiento; este paquete
no introduce login de estudiantes. Administrar/revocar requiere ADMIN_API_KEY y
voz requiere VOICE_API_KEY. Revisar el acceso deseado antes de publicar datos
reales del aula; el stack no se ha desplegado desde esta entrega.

Verificar /api/health (database available), los tres nodos en /api/rooms/a101/nodes,
una sesión común, desconexión individual y la web. Los secretos incorrectos o
certificados vencidos deben fallar; nunca arreglarlos con setInsecure.

## Voz opcional

El agente local detecta la palabra y envía WAV activado. El worker privado
transcribe con faster-whisper CPU/int8 y sintetiza español con espeak-ng.
La calidad de síntesis es básica; no se afirma latencia sin medir.

Instalar previamente modelo CTranslate2 en `deploy/.models/whisper-small/`.
Por ejemplo, en un entorno temporal con las dependencias de speech:

```sh
python -c 'from huggingface_hub import snapshot_download; snapshot_download("Systran/faster-whisper-small", local_dir="deploy/.models/whisper-small")'
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile voice up --build -d
```

Descarga explícita, no ejecutada por CI. El worker no descarga durante inicio.
Configurar DEEPSEEK_API_KEY/MODEL solo si se desea usar el asistente textual
existente; sin ellos /assistant/voice devuelve503. La transcripción/síntesis son
locales al servidor; el LLM usa el proveedor ya configurado y puede tener coste.
No se hacen consultas al proveedor al construir o probar el stack.

## Operación y recuperación

- Vigilar salud API, espacio de disco, antigüedad por nodo, reinicios y errores
  de voz. Snapshots de más15s no son prueba de conexión actual.
- Copia consistente: usar `sqlite3 .backup` contra el volumen; no copiar solo
  el .db mientras WAL está activo. Probar restauración en volumen temporal.
- Antes de actualizar, respaldar SQLite/CA/credenciales y registrar commit.
  Construir nueva imagen; rollback de imágenes conserva volúmenes. Esta entrega
  solo añade tablas idempotentes; no elimina ni modifica datos anteriores.
- No usar `docker compose down -v` como rollback: elimina persistencia.
- Una caída de Internet mantiene confort local y cola de acceso, pero no
  ofrece nuevas sesiones coordinadas ni respuestas remotas. Al reanudar,
  backend restaura retenidos y acceso reenvía eventos hasta ACK.
