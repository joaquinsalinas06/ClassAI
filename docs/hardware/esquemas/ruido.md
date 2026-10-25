# M-06 · Sonido relativo · AO

B-08 tiene AO/G/+/DO fotografiados. Es una entrada analógica relativa, no un sonómetro.

**Propuesta, sin ensayo físico. Niveles pendientes.**

![Esquema de referencia](ruido.svg)

Mapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.

## Materiales

- B-08: detector ×1
- B-01 o A-04: protoboard
- Adaptación de señal si AO excede lógica admitida; no inventariada

Cables: Redes mediante M–H y tiras; 0 H–H; adaptación todavía por determinar. No reservar material ya usado en otro banco.

## Conexiones

| Desde | Hasta | Vía / condición | Estado |
|---|---|---|---|
| Alimentación B-08 · pendiente | Detector · + | No asumir 5 V | Resolver antes de energizar |
| Detector · G | ESP32 · GND | — | Propuesto |
| Detector · AO | ESP32 · GPIO34 / ADC1 | Solo tras validar nivel o adaptar | Resolver antes de energizar |

## Antes de conectar

1. DO se deja sin conectar; no se le asigna GPIO por inferencia.
2. Si se alimenta a 5 V, AO/DO podrían exceder lo admitido por ESP32.
3. No sustituir este módulo por INMP441: interfaces distintas.

Resultado esperado: Comparar tres estímulos y rango ADC sin saturación; no presentar el valor como dB.

Firmware: Nodo integrado contempla AO34 opcional; perfil aislado y validación eléctrica pendientes.

Conflictos: GPIO34 es solo entrada en ESP32 clásico; no usarlo como salida.

- [Joy-IT · referencia KY-038](https://sensorkit.joy-it.net/en/sensors/ky-038)
- [Espressif · ESP32](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf)

[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.
