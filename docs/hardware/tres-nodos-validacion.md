# Validación software de integración · 30/10/2026

Estado: tres perfiles preparados, sin carga ni montaje físico conjunto.

- Backend: 79 pruebas pasan; dos pruebas MQTT se omiten en ejecución ordinaria
  y pasan al ejecutar explícitamente `PYTHON=.venv/bin/python scripts/ci/smoke.sh`.
- MQTT real: Mosquitto temporal, ingesta real, SQLite y API; tres identidades,
  sesión compartida, asistencia idempotente y desconexión aislada. Segundo
  ensayo con certificados temporales: TLS y ACL impiden falsificar un ACK.
- Ruff `--select E9,F63,F7,F82`: sin errores fatales; no es lint completo de estilo.
- Filtros CI: ocho pruebas pasan. Firmware host: confort, NFC/APDU, bancos y
  política de GPIO/fan/CRC pasan; son stubs, no validación física.
- Web: 100 pruebas Vitest y tres pruebas de tokens; typecheck/lint/build pasan.
  Prueba de navegador con datos sintéticos para zonas, luz relativa, desconexión
  independiente y móvil; capturas locales no versionadas.
- Compilación de tres perfiles: ESP32 core3.3.12, partición estándar de4MiB;
  sin upload. No se certifican consumo ni margen de RAM en ejecución.
- Imágenes API/web/speech se construyeron durante la preparación y el worker
  sintetizó español sin usar modelo STT ni proveedor pagado. La comprobación de
  salud del contenedor API encontró falta de LOCAL_TIMEZONE en el comando de
  prueba; Compose sí lo configura. No se repitió el arranque completo del stack:
  Docker dejó de estar disponible al reanudar. No se afirma despliegue validado.
- Dependencias del agente se instalaron/importaron en Python3.11 separado;
  no se cargaron modelos ni se abrió un puerto USB real.

Pendientes: identidad/pinout/respaldo E-01; alimentación por rama, adaptación de
matriz y control de potencia; flash/outbox ante cortes físicos; NFC y cobertura
PIR del conjunto; calibración de LDR/ruido; palabra real20llamadas/30min; audio
estable y convivencia60min; provisionar dominio/servidor/credenciales y medir
latencia real del servicio de voz. Ningún resultado simulado cierra esos ensayos.


Extensión visual del 30/10/2026: tres propuestas integradas en /montajes,
P1/P2/P3/P4, H–H y huellas sobre segunda placa. Pruebas nuevas verifican
referencias de terminales, rieles separados, divisores LDR, pull-down SD, BL en
serie y ocupación de contactos P4. Se regeneran los tres nuevos SVG/JSON/guías;
los dibujos de los 16 bancos anteriores permanecen iguales. Navegador verifica
progresión, condiciones visibles, importación/exportación sin sobrescribir
historial y escritorio/móvil; revisión visual de los tres planos completada.
Detector mecánico de diseño sin hallazgos. No se ha armado hardware nuevo.
