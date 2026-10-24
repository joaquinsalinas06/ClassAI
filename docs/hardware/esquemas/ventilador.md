# M-09 · Ventilador + relé

Fan D-05 de 5 V con un canal de B-11. Fuente de carga independiente; nunca alimentar el motor desde GPIO.

**Propuesta, sin ensayo físico. Potencia bloqueada.**

![Esquema de referencia](ventilador.svg)

Mapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.

## Materiales

- D-05: fan 5 V ×1
- B-11: solo canal 1
- Fuente 5 V DC y conector de carga no validados
- Adaptación IN1 / jumper por confirmar

Cables: Señales por M–H; potencia por cable/conector adecuado, no Dupont por defecto. No reservar material ya usado en otro banco.

## Conexiones

| Desde | Hasta | Vía / condición | Estado |
|---|---|---|---|
| ESP32 · GPIO26 | Etapa compatible · entrada | Adaptación IN1 pendiente | Resolver antes de energizar |
| Etapa · salida | Relé · IN1 | Lógica real por validar | Resolver antes de energizar |
| Fuente 5 V DC · + | Relé · VCC / JD-VCC | Configuración de jumper pendiente | Resolver antes de energizar |
| Relé · GND | Fuente 5 V DC · − | — | Propuesto |
| ESP32 · GND | Fuente 5 V DC · − | Esquema sin aislamiento asumido | Propuesto |
| Fuente 5 V DC · + | Relé · COM1 | Corriente / protección pendientes | Resolver antes de energizar |
| Relé · NO1 | Ventilador · + | Contacto seco, no IN1 | Resolver antes de energizar |
| Ventilador · − | Fuente 5 V DC · − | — | Propuesto |

## Antes de conectar

1. Faltan corriente de arranque, capacidad de fuente, conector/polaridad, trigger y estado seguro del relé.
2. VCC/JD-VCC se define con la configuración real: no mover jumper energizado ni presumir aislamiento por ver optos.
3. COM1/NO1 son contactos de carga; NC1 y canal 2 quedan sin uso.
4. Solo baja tensión DC; no se conecta red eléctrica.

Resultado esperado: ON/OFF y boot seguro sin reinicios después de resolver potencia y lógica. Todavía no apto para ensayo de carga.

Firmware: GPIO26 existe en nodo; perfil aislado con estado seguro pendiente.

Conflictos: GPIO26 coincide con RST TFT y propuesta BCLK I²S.

- [TONG LING · familia relé](https://denkovi.com/Documents/JQC-3FF-S-Z.pdf)

[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.
