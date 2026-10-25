# sound_bench

Banco aislado, sin red ni inicialización de actuadores ajenos.

[Guía física, pines, materiales, pasos, carga y Serial](../../docs/hardware/esquemas/ruido.md).
[Compilación real, versiones, tamaños y pendientes](../../docs/hardware/bancos-fisicos.md).

```sh
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2 --output-dir /tmp/classai-ruido-build firmware/sound_bench
```

No ejecuta upload. Antes de cargar: identificar A-01/puerto y FQBN, preservar
respaldo privado, registrar montaje real y resolver pendientes eléctricos de la
guía. Mantener B-02/NFC. Solo entonces usar `arduino-cli upload` con
`--input-dir /tmp/classai-ruido-build` y puerto explícito; Serial 115200.

Prueba host: `bash scripts/ci/sensor-benches-host.sh`. No demuestra circuito
físico. No convertir compilación en permiso de energización.
