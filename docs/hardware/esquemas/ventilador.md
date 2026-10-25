# M-09 · Ventilador + relé

Fan D-05 de 5 V con un canal de B-11. Fuente de carga independiente; nunca alimentar el motor desde GPIO.

**Montaje condicionado · revisar pendientes.** Diseño de referencia, sin ensayo físico nuevo.

![Distribución física de referencia](ventilador.svg)

[JSON de montaje importable](ventilador-fisico.json) · [SVG físico](ventilador-fisico.svg). ESP32 USB abajo; orientación de referencia, cotejar serigrafía. Terminales rotulados por función donde el conector aún no está identificado.

## Materiales

- D-05: fan 5 V ×1
- B-11: solo canal 1
- Fuente 5 V DC y conector de carga no validados
- Adaptación IN1 / jumper por confirmar

Cables: 0 M–H + 0 M–M dibujados; cero H–H. Circuito incompleto; conteo final pendiente de etapa/fuente. Se reutilizan entre bancos; no se exige montarlos todos simultáneamente. Preservar B-02/NFC; comprobar material libre en la otra placa.

## Conexiones funcionales

| Desde | Hasta | Vía | Estado |
|---|---|---|---|
| ESP32 · GPIO26 | Etapa compatible · entrada | Adaptación IN1 pendiente | Pendiente; no conectar |
| Etapa · salida | Relé · IN1 | Lógica real por validar | Pendiente; no conectar |
| Fuente 5 V DC · + | Relé · VCC / JD-VCC | Configuración de jumper pendiente | Pendiente; no conectar |
| Relé · GND | Fuente 5 V DC · − | — | Referencia |
| ESP32 · GND | Fuente 5 V DC · − | Esquema sin aislamiento asumido | Referencia |
| Fuente 5 V DC · + | Relé · COM1 | Corriente / protección pendientes | Pendiente; no conectar |
| Relé · NO1 | Ventilador · + | Contacto seco, no IN1 | Pendiente; no conectar |
| Ventilador · − | Fuente 5 V DC · − | — | Referencia |

## Armado cable por cable · USB desconectado

Referencia física, sin escala métrica. USB desconectado al armar. Usar A-01 solo tras identificar placa/puerto y preservar respaldo; B-02/NFC permanece conservado. Cables reutilizados entre ensayos; cero H–H.

| Nº | Color | Tipo | Origen | Destino | Condición |
|---|---|---|---|---|---|


Sin cableado ejecutable: faltan datos del circuito. Consultar conexiones funcionales y faltantes; no suplir etapas de adaptación con cables.

LP/LN: riel izquierdo +/−; RP/RN: derecho +/−. A–E y F–J son tiras separadas por fila. Confirmar continuidad/cortes de la protoboard real; los rieles opuestos no están unidos. Patas colocadas: módulos externos, conectores por verificar.

Cruces no unen redes. Las líneas discontinuas están pendientes y no cuentan como continuidad confirmada. Colores son identificadores del dibujo: elegir cables reales y anotar equivalencias. SVG no demuestra alcance físico.

## Antes de energizar

1. Faltan corriente de arranque, capacidad de fuente, conector/polaridad, trigger y estado seguro del relé.
2. VCC/JD-VCC se define con la configuración real: no mover jumper energizado ni presumir aislamiento por ver optos.
3. COM1/NO1 son contactos de carga; NC1 y canal 2 quedan sin uso.
4. Solo baja tensión DC; no se conecta red eléctrica.
5. Identificar A-01/puerto y preservar respaldo privado antes de cargar.
6. Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
7. Faltan fuente 5 V, capacidad/arranque, cable de potencia/conector y adaptación lógica; jumper por revisar.

Revisar agujero por agujero con USB retirado, polaridad y separación de fuentes. Sin multímetro, identificar por etiquetas y documentación exacta; una tensión o pin dudoso se mantiene desconectado. VIN no garantiza salida regulada de 5 V.

Firmware: GPIO26 existe en nodo; perfil aislado con estado seguro pendiente.

## Prueba guiada y fallos

Acción: Identificar relé, fuente y conector antes de conmutar carga.

Aprobación esperada: Boot apagado y ON/OFF sin resets: ensayo futuro.

Diagnóstico: No alimentar motor/bobinas desde GPIO/3V3 ni presumir disparo LOW.

Conflictos: GPIO26 coincide con RST TFT y propuesta BCLK I²S.

Faltantes/confirmaciones:
- Identificar A-01/puerto y preservar respaldo privado antes de cargar.
- Comprobar protoboard real, tipos y alcance de jumpers, con USB desconectado.
- Faltan fuente 5 V, capacidad/arranque, cable de potencia/conector y adaptación lógica; jumper por revisar.

## Registro de resultado

| Etapa | Resultado observado | Evidencia |
|---|---|---|
| Diseño | Referencia física; conservar condiciones | SVG/JSON y guía |
| Compilación | Consultar [resultados de esta entrega](../bancos-fisicos.md); no inferir PASS del comando | Log y tamaños por perfil |
| Simulación nueva | No ejecutada | — |
| Ensayo físico nuevo | Pendiente | Completar acción, salida, reinicios y evidencia tras ensayo |
| Desmontaje | Pendiente | Registrar qué cables/piezas quedan conectados |

- [TONG LING · familia relé](https://denkovi.com/Documents/JQC-3FF-S-Z.pdf)

[Índice](README.md). Generado desde missions.ts y sus registros físicos mediante web/scripts/export-hardware-missions.mjs.
