# M-03 · Transporte y registro

Comprobar serial → MQTT → backend → web sin presentar datos sintéticos como mediciones reales.

**Flujo de software.** Diseño de referencia, sin ensayo físico nuevo.

![Esquema funcional](mqtt.svg)

Este mapa lógico no acredita posiciones físicas ni autoriza conexiones pendientes.

## Materiales

- Una placa identificada o simulador host
- Broker / backend / web de prueba

Cables: Sin jumpers entre ESP32; transporte por red. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| Banco identificado | Monitor serial | Observación local | Referencia |
| Emisor de prueba | Broker MQTT | classai/v1, sin secretos publicados | Referencia |
| Broker MQTT | Backend / SQLite | Ingesta | Referencia |
| Backend / API | Panel web | Estado y datos | Referencia |

## Antes de energizar

1. El firmware base no es perfil sin sensores: deshabilitar también salidas e inicializaciones incompatibles.
2. Dos nodos base con el mismo ROOM_ID colisionan en client ID; separar aulas de prueba o usar un emisor.
3. No unir GPIO entre placas. La sincronización de sesión multinodo no está implementada.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: Perfil aislado de transporte pendiente; smoke de host existente no prueba hardware.

## Prueba guiada y fallos

Acción: Comprobar serial → MQTT → backend → web sin presentar datos sintéticos como mediciones reales.

Aprobación esperada: Comparar evento en cada tramo, config y reconexión; PubSubClient publica QoS 0, sin garantía de persistencia física.

Diagnóstico: No habilita por sí solo tres nodos de una misma aula.

Conflictos: No habilita por sí solo tres nodos de una misma aula.


## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia funcional; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |



[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
