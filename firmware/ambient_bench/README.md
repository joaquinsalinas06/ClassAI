# ambient_bench

Banco aislado, sin red ni inicialización de actuadores ajenos.

[Guía física, pines, materiales, pasos, carga y Serial](../../docs/hardware/esquemas/ambiente.md).
[Compilación real, versiones, tamaños y pendientes](../../docs/hardware/bancos-fisicos.md).

```sh
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-ambiente-build firmware/ambient_bench
```

No ejecuta upload. Antes de cargar: identificar A-01/puerto y FQBN, preservar
respaldo privado, registrar montaje real y resolver pendientes eléctricos de la
guía. Mantener B-02/NFC. Solo entonces usar `arduino-cli upload` con
`--input-dir /tmp/classai-ambiente-build` y puerto explícito; Serial 115200.

Prueba host: `bash scripts/ci/sensor-benches-host.sh`. No demuestra circuito
físico. No convertir compilación en permiso de energización.

Perfiles adicionales: compilar con `--build-property 'compiler.cpp.extra_flags=-DBENCH_DHT_ONLY=1'` para DHT11 solo, o `-DBENCH_PIR_ONLY=1` para PIR solo. No combinar ambos. Usar directorios de salida distintos como indican las guías dht11/pir.
