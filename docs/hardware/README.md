# Hardware ClassAI: inventario y montajes

Registro inicial: **23/10/2026**; revisión fotográfica **24/10/2026**, basada en el inventario narrado por Joaquín y
contrastado con el código del repositorio. Las etiquetas de una pieza y una
prueba física prevalecen sobre el título de un anuncio. Ninguna fecha de
préstamo, devolución o entrega se ha supuesto.

## Dónde consultar o actualizar

| Archivo | Para qué sirve |
|---|---|
| [inventario.md](inventario.md) | Fuente de verdad de piezas/lotes, IDs, propietario, cantidades, recepción, devolución y uso |
| [identificacion-fisica.md](identificacion-fisica.md) | Fotografías revisadas (sin publicarlas), etiquetas verificadas, proveedores, fuente 5 V, riesgos y faltantes |
| [conexiones.md](conexiones.md) | Señales necesarias, pinouts de referencia, asignaciones del código y conflictos |
| [nfc-hce-local.md](nfc-hce-local.md) | Unión teléfono HCE → PN532 → MQTT → backend/web locales, sin cambiar token |
| [banco-nfc.md](banco-nfc.md) | NFC físico: ESP32 + PN532, 12 M–H, selector SPI y prueba tarjeta/llavero |
| [banco-ambiente.md](banco-ambiente.md) | Primer circuito completo DHT11/PIR: alimentación, cableado, referencias y firmware de ensayo |
| [esquemas/README.md](esquemas/README.md) | Colección de 16 guías, 13 montajes físicos y alternativas de compatibilidad, exportables desde la web |
| [siguientes-bancos.md](siguientes-bancos.md) | Orden práctico, reparto de dos placas, presupuesto de cables y preparación tras soldadura |
| [visualizador.md](visualizador.md) | Banco local, formato JSON y límites de validación |
| [montajes.md](montajes.md) | Recetas con lista de materiales, orden de pruebas, propuesta de nodos y registro de montaje/desmontaje |

Actualizar primero el inventario cuando llegue una compra, se cuenten cables,
se identifique un modelo o se devuelva un préstamo. Referenciar sus IDs desde
los montajes; no volver a crear una pieza con otro nombre. No renombrar un ID
cuando cambie su ubicación o función. Un lote se puede dividir después en IDs
individuales, dejando registrado el origen y evitando duplicar cantidades.

## Disponibilidad actual · 02/11/2026

Joaquín ratifica **tres ESP32** (una USB-C de 38 pines de su propiedad), y
actualiza el stock a **cinco protoboards**: dos de Adrián/Auki, una de la
universidad y dos personales. Declara **140 cables personales de 20 cm**
(60 macho–macho, 40 macho–hembra, 40 hembra–hembra), además de seis botones,
LEDs de tres colores, resistencias y adaptador de batería. Ver el corte
[con IDs, propiedad y devolución](inventario.md#corte-vigente-de-hardware-y-devolución--02112026).

El reparto acceso/ambiente/asistente usa cuatro de las cinco protoboards,
con una en reserva; está en [tres-nodos.md](tres-nodos.md). El corte previo
del 29/10 hablaba de cuatro y queda como registro histórico. No se afirma
que la integración física conjunta esté aprobada.

## Propiedad y disponibilidad

| Grupo | Procedencia | Destino al terminar |
|---|---|---|
| A | Préstamo de Adrián, llamado «Auki» en la conversación; apellido por confirmar | Devolverle |
| B | Préstamo formal de la universidad | Devolver según el préstamo; acta/fecha no comunicadas |
| C | Material facilitado temporalmente por el profesor, con permiso, sin registro formal comunicado | Acordar devolución/prioridad con el profesor |
| D | Compra conjunta del equipo en AliExpress | Es del equipo; custodio/reparto final por acordar |
| E | Compras exclusivamente personales de Joaquín | Joaquín conserva su propiedad aunque las use el proyecto |

**No confundir D con E.** La pantalla usada en la mascota pertenece a D. El ESP32
Type-C pertenece a E; su recepción fue confirmada el 29/10/2026. No contar
pedidos pendientes como hardware disponible.

## Resumen de cantidades

Resumen derivado de [inventario.md](inventario.md); si cambia una cantidad,
actualizar también esta tabla. No incluye contenido interno sin contar de kits.

| Categoría | Disponible según declaración | Pedido / todavía no confirmado recibido |
|---|---|---|
| ESP32 | **3**: A-01, B-02 y E-01 (personal de Joaquín, 38 pines, USB-C) | Pinout E-01 sin verificar |
| Protoboards | **5**: A-04 ×2 (Auki), B-01 ×1 (universidad), E-02 ×1 y mini E-04 ×1 (Joaquín) | Asociar físicamente las cinco a IDs; P1–P4 usan cuatro |
| Jumpers | **140 personales de 20 cm**: 60 M–M, 40 M–H, 40 H–H (E-03 + E-04); aparte préstamos A-02 (~14), C-07 (~10), C-08 (~16) | Recuento pieza por pieza pendiente; no confundir lotes |
| Cables USB a micro USB | **2**: A-03 y D-10 | Ninguno adicional confirmado; cable USB-C no inventariado |
| Pantalla TFT | 1: D-04; retirada del montaje según Joaquín | — |
| PIR | 2: B-04 y D-06 | — |
| Temperatura/humedad | 1 DHT11: B-03 | — |
| Módulos de micrófono | 2: B-08 y D-07, de interfaces distintas | — |
| Audio de salida | 1 amplificador D-08, 2 altavoces D-09, 1 buzzer B-09 | — |
| Señalización | 1 matriz B-10, 6 LEDs de B/C y LEDs personales E-04 (~4–5 de cada color amarillo/rojo/verde, por confirmar) | Conteo y separación por propietario pendientes |
| Control | 1 pulsador C-04 + **6 pulsadores personales E-04**, 1 relé doble B-11, 1 ventilador D-05 | Verificación física pendiente |
| NFC | 1 lector D-01 + 1 tarjeta D-02 + 1 llavero D-03 | — |
| Resistencias y conectores | Lotes C por contar; lote personal E-04: 1 kΩ, 10 kΩ, 100 kΩ y quizá 100 Ω; adaptador batería ×1 | Confirmar 100 Ω, cantidades y tipo de adaptador |

No hay un total exacto de «piezas» mientras falten cantidades de lotes/kits.
**140** es el total **declarado de jumpers propios de Joaquín**, no el total
exacto de todos los cables del equipo; los préstamos A/C conservan estimaciones.
La devolución se registra por ID, cantidad, propietario y fecha real en inventario.md.

## Antes de reconstruir un montaje

1. Elegir una receta de [montajes.md](montajes.md) y una placa físicamente identificada.
2. Confirmar que sus materiales están disponibles; anotar préstamo y vencimiento.
3. Con alimentación desconectada, comprobar modelo, tensión, conectores y GPIO.
4. Verificar que el firmware corresponde a esa receta y que otras salidas están deshabilitadas.
5. Registrar conexiones, firmware/commit, resultado real y cómo se desmontó.

El estado «en mano» no significa «probado». No cambiar progreso de issues por
la mera compra, documentación o simulación. No guardar contraseñas WiFi/MQTT,
claves de API, contenido de flash/NVS ni números de pedidos privados aquí.


## Corte de verificación física (24/10/2026)
Se fotografiaron y asociaron a sus IDs sin duplicar stock: **D-05 ventilador 5 V**, **D-04 TFT ST7789 Ver:1.1**, **D-01 PN532 V3 serigrafiado Elechouse**, **B-10 matriz LED 8×8**, **B-11 módulo con dos relés TONG LING 5VDC**, **B-09 buzzer polarizado** y **B-08 detector AO/G/+/DO**. **No se ha ejecutado ninguna prueba eléctrica**; revisar [identificacion-fisica.md](identificacion-fisica.md) y [conexiones.md](conexiones.md) antes de montar.

La alimentación prevista es USB/hub para ESP32 y **fuente independiente regulada 5 V DC** para ventilador/relé, pendiente de conocer consumos y comprobar GPIO 3,3 V. No declarar hub ni cargador suficientes sin leer su etiqueta. **En el corte histórico del 24/10**, las compras E-01 a E-04 aún no tenían recepción confirmada; ver actualización del 02/11.

[Bancos físicos, materiales y evidencia R-025](bancos-fisicos.md): ensayos sucesivos con la otra placa, sin desmontar NFC automáticamente.

Entrega actual: [bancos físicos](bancos-fisicos.md) y [componentes del laboratorio](circuitos-referencia.md), revisión R-026 del 25/10/2026.


## Ensayos de sonido · 25/10/2026

Ambos bancos usaron sucesivamente el ESP32 **B-02 de la universidad** con
identidad y respaldo revalidados; el NFC anterior no permanece activo en esa
placa. El visor marca estos ensayos como realizados y muestra sus pendientes.

| Banco | Resultado físico | Pendiente |
|---|---|---|
| M-06 · Sensor AO/G/+/DO | Respuesta analógica relativa observada en dos rondas; LED de umbral responde tras ajuste | No dB, nivel bajo no separable de forma fiable, DO sin probar y niveles eléctricos sin medir; [detalle](../../firmware/sound_bench/README.md) |
| M-07B · Amplificador y una bocina | Tono y archivo completo audibles; mejor volumen al 15 % digital según Joaquín | Pitido inestable/ruido, calidad y alimentación USB/VIN sin medir; [detalle](../../firmware/audio_output_bench/README.md) |

Ver R-032–R-048 en [montajes.md](montajes.md). Son ensayos parciales, no aprobación
de todos los criterios del producto. Último estado conocido: audio desarmado y
puerto cerrado. Para el siguiente módulo, retirar USB, registrar desmontaje y
reutilizar materiales disponibles; volver a identificar la placa antes de cargar.


## Matriz 8 × 8 · 26/10/2026

M-08A/B-10 ensayado con **A-01 (Adrián, identificado por Joaquín)** y respaldo propio de 4 MiB verificado. Joaquín confirmó caras feliz, triste y enojada. Referencia frontal: **cara derecha, cabecera de entrada/cables a la izquierda = giro 0°**. La [guía del firmware](../../firmware/matrix_bench/README.md) documenta giros para otros montajes; el ensayo físico usó 0°. Dos secuencias Serial finalizan en STOP y puerto cerrado; R-050–R-052. Señales directas mediante protoboard funcionaron en esta unidad, sin garantizar niveles MAX7219 ni certificar alimentación USB/VIN. Integración con confort y buzzer pendientes.


## Ver cómo se construye cada nodo

En el visor `/montajes`, abrir **ClassAI · tres nodos**: acceso, ambiente y
asistente. Usa cuatro de las cinco protoboards disponibles, H–H admitidos en las propuestas, recorrido
cable por cable, condiciones visibles y exportación. [Montajes integrados](tres-nodos.md#montajes-visuales-integrados--30102026).
