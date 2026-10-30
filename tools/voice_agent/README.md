# Agente local de voz

La laptop del profesor procesa la activación. Acceso/ambiente solo necesitan
USB para alimentación. No se almacena audio continuo ni se envía al servidor
antes de detectar la palabra. El agente necesita ejecutarse durante la sesión.

## Instalación separada, sin servicios pagados

Python3.11; dependencias/modelos fuera del venv del backend:

```sh
uv venv --python 3.11 tools/voice_agent/.venv
uv pip install --python tools/voice_agent/.venv/bin/python -r tools/voice_agent/requirements.txt
# Descargar explícitamente los modelos preentrenados, una sola vez con Internet.
tools/voice_agent/.venv/bin/python -c 'import openwakeword.utils; openwakeword.utils.download_models(["hey_jarvis"])'
```

Elegir el archivo ONNX descargado con `--wake-model`; la frase inicial es la del
modelo preentrenado, **no «ClassAI»**. Comprobar licencia/condiciones del modelo
para usos posteriores al prototipo. Los modelos no se descargan en CI.

Configurar `CLASSAI_VOICE_KEY` en el entorno privado con el mismo valor que
`VOICE_API_KEY` del servidor. Ejecutar tras asociar el puerto a E-01:

```sh
tools/voice_agent/.venv/bin/python tools/voice_agent/agent.py \
  --port PUERTO_E01_VERIFICADO --wake-model RUTA_MODELO.onnx \
  --server https://classai.example.invalid/api
```

No autodetecta puertos ni acepta HTTP. No abrir otro monitor sobre ese puerto.
Ante pérdida de USB debe reiniciarse el agente con el puerto reidentificado.
`AMPLIFIER_VALIDATED=1` exige haber revisado previamente circuito y alimentación.

## Interacción y límites

Idle: analiza ventanas monoPCM16 a16kHz/80ms; umbral inicial0,65. Tras activación,
captura hasta15s o1s de silencio después del primer segundo. La detección de fin
usa RMS relativo al fondo y requiere ajuste/ensayo en el aula. Consulta HTTPS a
`POST /assistant/voice`; reproduce respuesta WAV remuestreada a32kHz. Durante
procesamiento/reproducción no evalúa palabras; al terminar añade500ms de pausa.

Error de servicio/serial o ausencia de captura descarta la consulta/reproducción
y silencia. No se imprime texto del aula, tokens ni audio. El reconocimiento,
latencia y falsas activaciones reales quedan por medir.

## Tramas USB v1

Little endian: `CA`(2), versión1(u8), tipo(u8), longitud(u16), secuencia(u32),
payload(0..1280), CRC32(u32) sobre versión..payload. CRC estándar IEEE, igual a
zlib.crc32. El parser resintoniza tras texto de arranque, CRC inválido o longitud
excesiva. Secuencias de captura permiten detectar pérdidas.

| Tipo | Dirección | Payload |
|---|---|---|
|1| ESP→laptop |640bytes =20ms monoPCM16/16kHz |
|2| laptop→ESP |hasta1280bytes, número par; monoPCM16/32kHz |
|3| laptop→ESP |estado ASCII, menos de20bytes |
|4| laptop→ESP |heartbeat vacío cada250ms |
|5| laptop→ESP |STOP/desarmado; vacía cola |
|6| laptop→ESP |armado para reproducción tras validación de amplificador |

Timeout1500ms y cola acotada. El firmware convierte PCM16 a slots32 estéreo,
con atenuación1/8. Captura y reproducción usan controladores I²S distintos;
ninguno transporta audio por MQTT. Pruebas puras en `backend/tests/test_voice.py`.
