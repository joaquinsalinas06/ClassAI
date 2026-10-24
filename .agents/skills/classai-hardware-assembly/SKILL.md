---
name: classai-hardware-assembly
description: Diseñar o revisar montajes físicos ClassAI y sus diagramas, contrastando inventario, pinout, alimentaciones, redes y recorridos. Usar al cambiar ubicación de componentes, jumpers o recetas de hardware.
---

Trabajar desde la raíz ClassAI. Consultar AGENTS.md y docs/hardware/{README,inventario,conexiones,montajes}.md; para ambiente, banco-ambiente.md. Inventario, recepción, propiedad y evidencia física prevalecen sobre el catálogo gráfico. No inferir componentes recibidos ni tipos/longitudes de jumpers por cantidad total.

Antes de cambiar el trazado, identificar conexiones eléctricas y pendientes: placa/serigrafía, tensión de VCC y de señal por separado, masa, fuentes y GPIO ocupados. VIN no certifica 5 V de salida; el jumper H/L del PIR no alimenta. En DHT, el pull-up es una rama entre DATA y su tensión lógica, no un divisor ni resistencia en serie con VCC. Confirmar pull-up del breakout antes de omitir el externo.

Optimizar primero ubicación de módulos junto a sus terminales, luego contactos equivalentes dentro de tiras y rieles comprobados. Eliminar puentes redundantes solo manteniendo referencia común. Preferir rutas cortas, identificables y con menos cruces; no cambiar GPIO o retirar adaptación/protección por ahorrar cable. Contar tipos M–M/M–H/H–H, disponibilidad libre y longitudes pendientes. Aclarar cuándo una ruta requiere material no confirmado; no inventar empalmes o adaptadores. SVG no certifica inserción ni alcance físico.

En web/src/hardware, contrastar `analyze()` antes/después para todas las parejas de terminales de componentes, incluidas patas de resistencias. Diferenciar rieles que se dejan libres a propósito. Revisar `assemblyGeometry` y `routingMetrics`: cables, giros y longitud del dibujo; no llamar «óptimo» a una mera mejora ni traducir píxeles a centímetros. Revisar la captura: cables fuera de PCBs/cuerpos, USB accesible, cruces sin falsa unión, colores y extremos legibles. Conservar formato/importación e historial de montajes previos.

Comprobar typecheck, lint, tests, build y hardware-smoke cuando cambie el visor. Añadir evidencia y pendientes al registro, sin convertir tests en ensayo físico. Antes de flash: identidad física/puerto y cableado real registrados, respaldo privado existente preservado; no publicar flash/NVS. Verificar identidad local Git antes de commits. No activar energización ni afirmar montaje probado a partir del dibujo.
