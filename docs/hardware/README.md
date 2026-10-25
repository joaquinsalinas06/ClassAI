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

## Propiedad y disponibilidad

| Grupo | Procedencia | Destino al terminar |
|---|---|---|
| A | Préstamo de Adrián, llamado «Auki» en la conversación; apellido por confirmar | Devolverle |
| B | Préstamo formal de la universidad | Devolver según el préstamo; acta/fecha no comunicadas |
| C | Material facilitado temporalmente por el profesor, con permiso, sin registro formal comunicado | Acordar devolución/prioridad con el profesor |
| D | Compra conjunta del equipo en AliExpress | Es del equipo; custodio/reparto final por acordar |
| E | Compras exclusivamente personales de Joaquín | Joaquín conserva su propiedad aunque las use el proyecto |

**No confundir D con E.** La pantalla usada en la mascota pertenece a D. El ESP32
Type-C pertenece a E y su recepción todavía no está confirmada. No contar
pedidos pendientes como hardware disponible.

## Resumen de cantidades

Resumen derivado de [inventario.md](inventario.md); si cambia una cantidad,
actualizar también esta tabla. No incluye contenido interno sin contar de kits.

| Categoría | Disponible según declaración | Pedido / todavía no confirmado recibido |
|---|---|---|
| ESP32 | 2: A-01 y B-02 | 1: E-01 (38 pines, Type-C); 3 previstos |
| Protoboards | 2 unidades/conjuntos: A-04 y B-01 | E-02 + mini incluida en E-04; 4 previstas si el kit trae una mini |
| Jumpers | Aproximadamente 40: A-02 (~14) + C-07 (~10) + C-08 (~16) | E-03 y contenido de E-04, sin cantidades verificadas |
| Cables USB a micro USB | **2**: A-03 y D-10 | Ninguno adicional confirmado; cable USB-C no inventariado |
| Pantalla TFT | 1: D-04; retirada del montaje según Joaquín | — |
| PIR | 2: B-04 y D-06 | — |
| Temperatura/humedad | 1 DHT11: B-03 | — |
| Módulos de micrófono | 2: B-08 y D-07, de interfaces distintas | — |
| Audio de salida | 1 amplificador D-08, 2 altavoces D-09, 1 buzzer B-09 | — |
| Señalización | 1 matriz B-10 y **6 LEDs sueltos** | LEDs adicionales de E-04, sin contar |
| Control | 1 pulsador C-04, 1 relé doble B-11 (2 bobinas de 5 V), 1 ventilador D-05 (DC 5 V) | Pulsadores adicionales de E-04, sin contar |
| NFC | 1 lector D-01 + 1 tarjeta D-02 + 1 llavero D-03 | — |
| Resistencias y conectores | Lotes sin contar | Resistencias/accesorios de E-04, sin contar |

No hay un total exacto de «piezas» mientras falten cantidades de lotes/kits.
Los rangos conversados de 10/20/40 cables no son conteos: no se convierten en
un total ficticio de 60/120 jumpers.

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

La alimentación prevista es USB/hub para ESP32 y **fuente independiente regulada 5 V DC** para ventilador/relé, pendiente de conocer consumos y comprobar GPIO 3,3 V. No declarar hub ni cargador suficientes sin leer su etiqueta. Las compras E-01 a E-04 siguen pendientes de recepción física.

[Bancos físicos, materiales y evidencia R-025](bancos-fisicos.md): ensayos sucesivos con la otra placa, sin desmontar NFC automáticamente.

Entrega actual: [bancos físicos](bancos-fisicos.md) y [componentes del laboratorio](circuitos-referencia.md), revisión R-026 del 25/10/2026.
