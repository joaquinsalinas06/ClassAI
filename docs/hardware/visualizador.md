# Visualizador de montajes

Primera versión del banco de trabajo de ClassAI, accesible en `/montajes` de la
web. Funciona con datos locales, sin servicio de simulación ni acceso a placas.
Para abrir toda la aplicación sin backend: `cd web` y `pnpm dev:mock`.
El modo mock afecta a las aulas; el visualizador muestra propuestas de cableado,
no lecturas simuladas ni montajes físicos verificados.

## Decisión y alcance

El visualizador es parte de la web existente. El catálogo y los montajes se
conservan en JSON versionado/exportable, separado del dibujo y de la validación.
No se crea una skill instalada en el equipo: estas instrucciones y los archivos
legibles permiten a un asistente editar datos revisables sin depender de una
configuración personal. No se añaden dependencias.

El primer ejemplo usa referencias de ESP32, B-03 DHT11 y un PIR por escoger entre
D-06/B-04. A-01/B-02 aún no tienen identidad física asociada. Las alimentaciones
VCC de sensores están incluidas en el diseño de referencia completo de
[banco-ambiente.md](banco-ambiente.md), junto con pull-up y alimentación USB.
ESP32 tiene vista de 30 pines con USB y DHT11 sigue el orden −/OUT/+ reportado;
contrastar la serigrafía antes de trasladar posiciones a la placa. El PIR incluye
lente/reverso ilustrados; su orden de terminales sigue pendiente de confirmar.

El núcleo entiende tiras de cinco contactos A–E y F–J por fila, separadas por la
ranura; modela rieles de alimentación continuos o cortados a mitad. Los rieles
positivos izquierdo y derecho son independientes. Comprueba fuentes incompatibles
y entradas de alimentación sin fuente o con tensión de referencia distinta.
No valida la continuidad medida, cuerpos a escala, longitudes, corriente,
tolerancias ni comportamiento de firmware.
La resistencia opcional permite probar colocación de dos patas y puenteado.
Todavía no hay arrastre de footprints, optimización automática ni PN532 funcional.

## Fuente editable

- [Ejemplo JSON](../../web/src/hardware/example.json): catálogo inicial y propuesta.
- [Modelo y comprobaciones](../../web/src/hardware/model.ts).
- [Página](../../web/src/pages/Hardware.tsx).

Formato `version: 1`:

- `catalog`: definiciones, pines, función eléctrica y datos pendientes. No son
  piezas adicionales del inventario. Los terminales usan nombres documentados;
  un dibujo lógico no confirma su orden físico.
- `parts`: instancias con ID propio, referencia de catálogo e ID de inventario.
  Dos ESP32 pueden tener GPIO4 sin colisionar: `esp1:GPIO4` y `esp2:GPIO4` son
  terminales distintos. Un ID de fuente no se debe duplicar para fingir que dos
  salidas de reguladores son una sola fuente.
- `board`: filas, `rails` y `splitRails`; confirmar placa y continuidad reales.
  Contactos de riel `bb:LP1`, `bb:LN1`, `bb:RP1`, `bb:RN1` (izquierda/derecha, positivo/negativo).
- `wires`: terminales `instancia:pin` o agujeros `bb:A2`. Su orden define los
  pasos de armado. `note` describe la acción, sin credenciales. `color` indica
  color del conductor; `bends` conserva su recorrido ilustrativo sin definir
  longitud real. Un cambio de color conserva el recorrido si no cambian extremos.
- `parts[].holes`: colocación de patas de la resistencia, p. ej. `1: C20` y
  `2: G20`; `resistance` guarda ohmios y dibuja bandas 1 kΩ/10 kΩ; valor y
  separación física se verifican por separado.
- `revisions`: fecha UTC, nota y copia completa del montaje sin historial
  recursivo. La interfaz muestra hora America/Lima. No implica prueba física.

Para reutilizar una pieza, conservar su ID del inventario. Para crear otro banco,
exportar/copiar el montaje y asignar instancias/placas distintas; no contar dos
veces una pieza compartida. Para una nueva definición, describir únicamente pines
conocidos y dejar el resto en `pending`; importar luego el JSON para revisarlo.
NFC puede representarse mediante terminales lógicos; no se simulan lector, RF,
APDU ni compatibilidad HCE.

## Edición, continuidad e historial

1. Seleccionar un terminal o agujero: se ilumina toda su red de conductores.
   La resistencia no une sus patas como si fuera un cable.
2. Añadir/editar cables, componentes o patas de resistencia. Las comprobaciones
   señalan ocupación doble, resistencia puenteada, fuentes unidas entre sí/GND,
   señales conectadas a alimentación y funciones DHT/PIR en una misma red.
   Pines `bus` del mismo componente comparten conductor interno (GND del ESP32);
   `required: false` distingue pines sin usar de conexiones omitidas.
   Esta última regla es conservadora: compartir buses reales requiere ampliar
   el modelo, no eliminar conflictos por conveniencia.
3. Recorrer el armado: solo se dibujan los cables añadidos hasta ese paso.
4. Escribir el cambio y guardar revisión en el navegador. Los cambios sin guardar
   quedan en memoria; al recargar se recupera la última revisión guardada.
5. Exportar JSON para respaldo e intercambio. Importar valida formato,
   referencias, límites y agujeros antes de sustituir el borrador en memoria.
   Un archivo inválido deja intacto el montaje actual. Un fallo de almacenamiento
   se informa; no se declara guardado.
6. Recuperar una revisión abre su copia como borrador y conserva el historial;
   guardar otra revisión para registrar la recuperación. Deshacer conserva el
   historial guardado. Los archivos exportados pueden versionarse tras revisar
   que no contengan datos privados.

Máximos de esta versión: 20 instancias, 150 cables, 63 filas, 50 revisiones y
500 kB por archivo. Exportar con frecuencia; localStorage no es copia compartida
ni respaldo garantizado. No almacenar flash/NVS, claves, WiFi, tokens ni imágenes
privadas. El catálogo solo contrasta tensiones de referencia declaradas; no certifica
niveles reales ni presupuesto de fuente. Borradores anteriores siguen legibles y
no se sobrescriben automáticamente: **Cargar guía completa** es una edición
reversible que conserva el historial.

## Evidencia y continuación

Los resultados físicos se anotan aparte en [montajes.md](montajes.md), con placa,
cableado observado, mediciones, firmware y desmontaje. Ningún botón marca un
montaje como probado. Antes de añadir footprints reales hacen falta medidas,
orientación/paso de pines y fotos de las piezas específicas.

Siguiente incremento propuesto: registrar esos datos físicos y representar el
cuerpo/zonas inaccesibles; después comparar distribuciones de cableado conservando
la misma red lógica. La integración con Wokwi o un renderizador externo puede
consumir este registro, sin convertirlo en fuente de verdad del hardware.

## Verificación de esta versión

En `web/`: `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build`.
Con el servidor mock abierto, ejecutar
`node scripts/hardware-smoke.mjs http://127.0.0.1:5188` (ajustar puerto).
La comprobación recorre pasos, resistencia puenteada/deshacer, guardado/recarga,
rechazo de importación inválida, exportación/reimportación y recuperación del
historial; además captura claro/oscuro y móvil sin desbordamiento de la página.
El lienzo tiene desplazamiento horizontal propio para conservar legibles los
agujeros. Las capturas se guardan localmente en `web/screenshots/`, ignorado por Git.
Estas pruebas son de software; no certifican un montaje.

## Aclaración de pinout y señal (24/10/2026)

El dibujo de 30 pines muestra etiquetas D4/D27 y mantiene GPIO4/GPIO27 como
identificadores eléctricos. El esquema explicativo separa el + directo del
DHT11 y la rama pull-up de 10 kΩ; el botón resalta la red real OUT/GPIO4 del
borrador actual. El esquema explica la receta original, no se recalcula al editarla.
El comparador 30/38 muestra filas con USB abajo y referencia oficial DevKitC
J2/J3, sin modificar el montaje ni asignar esa variante a E-01. La tensión del
riel naranja sigue nominal y pendiente de medir VIN–GND en cada placa.
