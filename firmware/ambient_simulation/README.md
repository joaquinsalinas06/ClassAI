# Ensayo virtual, no firmware para el montaje real

Proyecto Wokwi de ESP32 DevKit V1 + **DHT22 virtual** + PIR. El DHT22 sustituye
al DHT11 de B-03 porque es el modelo documentado utilizado aquí: no valida ese
sensor ni su breakout. El programa físico `../ambient_bench` no se modifica.
Este sketch no incluye la espera física de estabilización PIR del banco real.
No cargar este sketch de simulación a una placa para sustituir el ensayo real.

Compilar desde la raíz del repositorio, sin upload:

```sh
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --build-path firmware/ambient_simulation/build firmware/ambient_simulation
wokwi-cli lint firmware/ambient_simulation/diagram.json
```

Abrir esta carpeta con la integración Wokwi y arrancar `wokwi.toml`. Si se usa
el editor web, importar `diagram.json`, el sketch y `libraries.txt`; no se ha
publicado ningún proyecto web ni generado un enlace compartido. `build/` es
local e ignorado por Git. Se puede reproducir con las librerías listadas.

## Resultados reales del simulador · 24/10/2026

- Compilación: 273520 bytes de programa / 22132 bytes globales, core ESP32 3.3.12.
- Wokwi MCP: simulación arrancada, conectada y detenida al finalizar el ensayo.
- Lectura inicial: 24 °C / 40 % / motion=0.
- Cambios de controles de DHT a 29 °C y 65 %: observados en serial.
- PIR OUT leído LOW y motion=0 en serial. El comando de control `motion=1`
  devolvió confirmación, **pero no se observó HIGH ni motion=1**. No marcar la
  detección/retorno como aprobados. Falta accionar «Simulate Motion» o confirmar
  el control soportado por la integración y capturar la transición.
- `observed-serial.txt`: extracto real de las tres primeras líneas SIM, sin
  secretos. No es log de una placa física.
- Lint: sin errores; aviso informativo de tipo DevKit V1 no documentado por el
  linter de esa versión. El modelo sí arrancó y produjo las lecturas anteriores.

Este ensayo no mide VIN del ESP32 físico, no identifica VCC/GND/OUT del PIR
real, no comprueba jumpers, caída de tensión, cortos, corriente ni inserción.
Sin multímetro se puede avanzar identificando etiquetas, fotos y documentación
de la variante; cualquier tensión que siga incierta queda pendiente antes de
energizar. No exigir comprar instrumentos como condición para seguir diseñando.

Referencias: [ESP32](https://docs.wokwi.com/guides/esp32),
[DHT22](https://docs.wokwi.com/parts/wokwi-dht22),
[PIR y botón Simulate Motion](https://docs.wokwi.com/parts/wokwi-pir-motion-sensor),
[configuración](https://docs.wokwi.com/vscode/project-config).
