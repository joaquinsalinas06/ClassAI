# M-00 · Identificar y conservar

Una placa cada vez: asociar propietario, puerto y firmware previo antes de conectar dos ESP32.

**Antes de cualquier carga.** Diseño de referencia, sin ensayo físico nuevo.

![Esquema funcional](identidad.svg)

Este mapa lógico no acredita posiciones físicas ni autoriza conexiones pendientes.

## Materiales

- A-01 o B-02, una placa
- A-03 o D-10: USB de datos

Cables: Sin jumpers; 1 USB por placa. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| Laptop · USB | ESP32 · micro USB | Cable de datos | Referencia |

## Antes de energizar

1. Asociar la placa fotografiada a A-01/B-02 sin atribuir propietario por apariencia.
2. Preservar el respaldo privado existente; anotar tamaño/hash, sin publicarlo.
3. Con dos placas, seleccionar puerto explícito; no usar autodetección.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: Sin carga de firmware.

## Prueba guiada y fallos

Acción: Una placa cada vez: asociar propietario, puerto y firmware previo antes de conectar dos ESP32.

Aprobación esperada: Reconocer cada puerto y placa; el respaldo se registra por separado de su restauración probada.

Diagnóstico: E-01 sigue pedido; no contar una tercera placa recibida.

Conflictos: E-01 sigue pedido; no contar una tercera placa recibida.


## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia funcional; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [Espressif · ESP32](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
