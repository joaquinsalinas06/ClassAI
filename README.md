# ClassAI

Prototipo universitario de confort del aula y asistencia NFC: ESP32 + PN532,
app Android HCE, ingesta MQTT/SQLite, API FastAPI y panel React/Vite.
[Hardware: inventario y montajes](docs/hardware/README.md) ·
[Arquitectura](docs/architecture.md) · [Contratos MQTT/APDU](docs/contracts.md) ·
[Demo](backend/DEMO.md) · [Web](web/README.md) · [Android](mobile/android/README.md).

## Comprobar software sin hardware

Requisitos: Python 3.13, Mosquitto (`brew install mosquitto` en macOS o
`sudo apt-get install mosquitto` en Ubuntu). No hace falta arrancar el broker como servicio.
Desde la raíz:

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-ci.txt
PYTHON=.venv/bin/python scripts/ci/smoke.sh
```

Ese último comando arranca y detiene su propio Mosquitto en loopback y puerto libre,
usa SQLite temporal y ejecuta el backend real. Espera CONNACK/SUBACK y condiciones
con timeout, sin pausas fijas de arranque. Falla si el broker no está instalado,
si un proceso termina antes de tiempo o si no aparece el resultado esperado.
No usa `.env`, secretos, hardware, un broker ya existente ni servicios de pago.

Comprueba:

- Publicación QoS 0 (como el ESP32), suscripción real y parsing `classai/v1`.
- Telemetría cruda y agregada en SQLite; `null` no genera una métrica.
- Inicio/fin/resumen de sesión; un `event_id` repetido solo se aplica una vez.
- Fixtures del simulador: tarjeta NFC y Android HCE, dos credenciales del mismo
  estudiante sin duplicar asistencia y credencial desconocida.
- Token inválido, JSON roto, aula incorrecta, valor no numérico y versión incorrecta.
- Consultas HTTP de salud, asistencia y resumen con FastAPI TestClient en proceso
  (no se abre un servidor HTTP externo); la respuesta no expone tokens.
- Cierre limpio de ingesta y broker, incluso al fallar; los logs salen en pytest.

Un PASS demuestra esta ruta de software con datos simulados. No demuestra el tap
PN532/teléfono, cableado, sensores, relé, calibración, alcance RF, recuperación ante
cortes físicos ni entrega garantizada. PubSubClient publica con QoS 0; ver contrato.

## Otros checks locales

```sh
# Backend: 57 tests existentes; smoke opt-in queda omitido aquí.
PYTHON_DOTENV_DISABLED=1 .venv/bin/python -m pytest backend -q
.venv/bin/ruff check backend scripts/ci --select E9,F63,F7,F82
python3 -m unittest discover -s scripts/ci -p 'test_*.py'

# Dos ejecutables C++ de host, sin Arduino ni hardware.
scripts/ci/firmware-host.sh

# Arduino CLI 1.5.1, ESP32 core 3.3.12 y bibliotecas fijadas.
scripts/ci/arduino-install.sh
scripts/ci/firmware-build.sh

# Node 24 y pnpm 11.22.0 (packageManager en web/package.json).
cd web
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
cd ..

# JDK 17 + Android SDK (sin emulador ni NFC).
cd mobile/android
sdkmanager 'platforms;android-36' 'build-tools;36.0.0'
./gradlew --no-daemon testDebugUnitTest assembleDebug
```

El build de firmware usa una copia temporal y `secrets.example.h`; no flashea.
El APK es debug y no se publica. Para cambiar versiones Python, editar los inputs
`backend/requirements.txt` / `backend/requirements-ci.in` y regenerar el lock de CI:

```sh
uv pip compile --universal --python-version 3.13 backend/requirements-ci.in -o backend/requirements-ci.txt
```

## CI y entrega

`Product CI` se ejecuta en PR y push a `main`: jobs independientes para backend,
MQTT, web, firmware host, compilación ESP32 y Android. Instala desde lockfiles,
cachea descargas y limita tiempos. Permisos solo `contents: read`, sin secretos.
Los PR se prueban al actualizarse; el push solo a main evita duplicar todas las
pruebas al subir cada rama. Una actualización del mismo PR cancela su CI anterior.

Los filtros omiten docs (excepto `docs/contracts.md`), issues y el generador del
grafo. Un job corto selecciona componentes: backend activa backend/MQTT; web
activa web; Android activa Android; design activa web/Android; firmware activa
firmware/backend/web por los casos compartidos de confort. Contratos, scripts de
CI o el workflow de producto activan todos. No configurar estos checks omitibles
como obligatorios globales sin revisar la política de protección de ramas.

Correr los checks del componente antes de cada PR. Correr smoke al cambiar
contratos, ingesta, esquema, credenciales o mensajería. Tras integrar, CI repite
los checks aplicables en main. Revisar los resultados antes de fusionar; este
cambio no modifica protección de ramas ni progreso de issues.

**CD actual:** el workflow `Issue dependency graph` sigue generando y desplegando
solo el grafo en GitHub Pages. El producto se valida y compila, sin despliegue
automático. `backend/compose.yaml` es configuración heredada para Linux, usa
`.env`, red host y no incluye Mosquitto; no es el entorno del smoke ni un despliegue
portable. La prueba local no necesita Docker.

**CD pendiente:** elegir servidor/entorno y acceso, broker con autenticación/TLS,
secretos, persistencia/backups y migraciones de SQLite, health checks y rollback;
acordar distribución/firmas de Android y carga del firmware. Hasta definirlos,
no publicar web/API, imágenes, APK ni firmware automáticamente. La validación
física de ESP32/PN532/HCE y sensores es una etapa separada del CI.
