# ClassAI — guía para asistentes

Fuente única para Codex y Claude Code. Leer README.md, docs/contracts.md y las
instrucciones del componente antes de editar. No asumir que documentación o
issues describen funcionalidad terminada: comprobar código y pruebas.

## Mapa

- firmware/classai_node: ESP32 Arduino, PN532 SPI, PubSubClient, confort local.
- mobile/android: Kotlin nativo, AGP 9.1, Gradle wrapper 9.3.1, SDK 36, JDK 17.
- backend: Python 3.13, ingesta MQTT, SQLite schema.sql, FastAPI, tuner, asistente.
- web: Node 24, pnpm 11.22.0, lockfile pnpm, React/Vite/TypeScript.
- design: tokens compartidos. scripts/generate-issue-graph.py y Pages: solo grafo.

## Comandos desde la raíz

- Instalar backend: `python3.13 -m venv .venv` y `.venv/bin/python -m pip install -r backend/requirements-ci.txt`.
- Lint: `.venv/bin/ruff check backend scripts/ci --select E9,F63,F7,F82` (solo errores fatales; no alegar lint de estilo completo).
- Backend: `PYTHON_DOTENV_DISABLED=1 .venv/bin/python -m pytest backend -q`.
- MQTT: `PYTHON=.venv/bin/python scripts/ci/smoke.sh` (requiere binario mosquitto).
- Filtros CI: `python3 -m unittest discover -s scripts/ci -p 'test_*.py'`.
- Firmware host: `scripts/ci/firmware-host.sh`.
- Firmware compile: Arduino CLI 1.5.1; `scripts/ci/arduino-install.sh` y `scripts/ci/firmware-build.sh`.
- Web, desde web/: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- Android, desde mobile/android/: `./gradlew --no-daemon testDebugUnitTest assembleDebug`; SDK platform 36/build-tools 36.0.0.

## Convenciones y revisión

- Contrato fuente: docs/contracts.md (`classai/v1`, v=1, room coincide con topic,
  null para sensor inválido, tokens HEX opacos con type obligatorio). Mantener
  consumidores y fixtures alineados. APDU en nfc_protocol.h/ApduHandler.kt.
- Mantener paridad comfort.h / tuner.py / web/src/lib/comfort.ts y casos compartidos.
- Asistencia única por estudiante/sesión; deduplicación por event_id. No confundir
  entrega MQTT con persistencia. PubSubClient publica QoS 0, aun en eventos.
- No exigir hardware, emulador, claves LLM ni llamadas pagadas en CI. No afirmar
  que tests simulados validan NFC físico, sensores o tolerancia a cortes.
- Cambio mínimo en rama feature + PR. Describir problema, comandos ejecutados,
  resultados reales, omisiones y validación física pendiente. No fusionar main
  ni cambiar issues, estados/progreso, credenciales o infraestructura por inferencia.
- No versionar .env, secrets.h, local.properties, DB, tokens reales, claves o
  artefactos locales. Usar ejemplos y temporales para las pruebas; nunca publicar
  credenciales en logs/PR. No sustituir instrucciones útiles de otros archivos.
- Product CI y Pages son independientes. Mantener paths, caché, concurrency,
  timeouts y permisos mínimos. No añadir matrices, cron de producto, emuladores,
  despliegues ni cargas de artefactos sin una necesidad concreta.
- Si cambian dependencias Python, regenerar requirements-ci.txt con el comando
  universal del README; web siempre mantiene pnpm-lock.yaml coherente.

## Hardware físico

Antes de asignar placas, cablear o preparar un ensayo, leer
`docs/hardware/README.md`, `inventario.md`, `conexiones.md` y `montajes.md` en esa
carpeta. Mantener IDs y propiedad: A/B/C son préstamos, D es compra del equipo y
E es personal de Joaquín. No inventar plazos, cantidades de kits ni recepción.
Asociar el dispositivo físico a su ID antes de cargar firmware y registrar
montaje/desmontaje. El tercer ESP32 sigue pendiente de recepción; la propuesta
multinodo no está implementada. Verificar niveles/pinout reales y conflictos TFT
antes de usar el firmware integrado; no publicar secretos ni respaldos de flash.

## Skill de montajes

Para diseñar, revisar u optimizar montajes de hardware, leer y aplicar
`.agents/skills/classai-hardware-assembly/SKILL.md`. También cuando Joaquín pida
«usa classai-hardware-assembly». Si faltan instrumentos o datos, adaptar el
procedimiento y conservar los pendientes; una simulación no aprueba el montaje real.
