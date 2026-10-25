# Montajes: decisiones de interfaz

## Contexto y alcance

ClassAI es un prototipo universitario. Esta pantalla debe responder «¿qué conecto,
dónde y con qué piezas?» para el banco seleccionado. No carga firmware ni convierte
el análisis del modelo en validación eléctrica. Se conserva la identidad visual
existente: `design/tokens.json`, CSS generado, Geist/Geist Mono y componentes de
`web/src/ui`. El resto de la web mantiene su estructura.

## Fuentes consultadas el 24/10/2026

- [Taste Skill](https://github.com/Leonxlnx/taste-skill), de Leonxlnx:
  `design-taste-frontend`, capítulo de app screens. Jerarquía alrededor de una tarea,
  navegación discreta, color para información y revisión mediante capturas.
- [Emil Kowalski Skills](https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng):
  `emil-design-eng`. Buenos valores iniciales, coherencia entre componentes,
  interacciones rápidas y respeto por movimiento reducido.
- [Impeccable](https://github.com/pbakaus/impeccable), de Paul Bakaus:
  `impeccable`. Modo Operate: legibilidad, consistencia y detalles accesibles antes
  que decoración; contexto de producto y revisión responsive.

Son tres proyectos distintos. Se instalaron en el catálogo personal de Codex;
no se ejecutó un instalador npm dentro del proyecto ni se añadieron dependencias
web. Las fuentes se aplican subordinadas al brief y a los tokens de ClassAI:
no se reemplazan colores/fuentes por una paleta o composición aleatoria de una skill.
La ausencia de PRODUCT.md detectada por Impeccable no elimina la autoridad visual
que existe en los tokens y en el dashboard del repositorio.

## Composición e interacción

- El Shell global se conserva. Solo Montajes usa todo el espacio disponible.
- Barra de bancos de 224 px con scroll independiente y selección única.
- Dibujo como contenido principal; un clic abre el montaje físico NFC o ambiente.
  Los otros diez bancos indican que su esquema es lógico y su distribución física
  está pendiente. No aparece un editor ambiental debajo de otro banco.
- Barra inferior para pasos, conexión anterior/siguiente y ajuste de escala.
- Inspector accesible con Guía, Materiales, Pines y cables, Editar e Historial.
  Se cierra con Escape, devuelve foco y conserva el dibujo de fondo.
- Navegación, selección, superficies y estados usan tokens compartidos. Los colores
  reales de cables/componentes siguen perteneciendo al dibujo eléctrico.
- El banco NFC cita el ensayo R-023 y la irregularidad RF. Los demás conservan sus
  pendientes. Editar un borrador no aprueba un nuevo montaje físico.

## Datos y compatibilidad

URL `?guia=nfc`/`?guia=ambiente` y `?banco=<id>`; Atrás/Adelante sincronizan el
banco y el dibujo. Borradores independientes en memoria al cambiar de banco.
`classai.hardware.v1` conserva formato, historial, importación y exportación.
Solo Guardar revisión escribe localStorage. Reabrir el banco de la revisión
local recupera esa revisión; abrir otra receta no la sobrescribe.

## Verificación

Desde `web/`: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` y
`node scripts/hardware-smoke.mjs http://127.0.0.1:5188`.
El smoke comprueba doce bancos aislados, guardado/recarga, rechazo de importación,
JSON/SVG, pasos, historial del navegador, inspector y ausencia de scroll global
horizontal/vertical en los tamaños probados. Capturas locales en `web/screenshots/`,
fuera de Git, para 1440×900, 1024×768, 390×844 y temas claro/oscuro.
El detector Impeccable devolvió `[]` en los archivos UI revisados. Es una
comprobación mecánica complementaria: no valida cableado ni sustituye mirar el render.

Taste Skill también inspeccionó tres tamaños en navegador. Su detector clasifica
el SVG como gráfico estadístico y objetó los siete colores: se conserva esa
excepción explícita (`--allow rainbow-chart`) porque aquí son conductores físicos
identificables, solicitados por el usuario. Se aumentaron las anotaciones pequeñas
del dibujo a 11 unidades SVG y se corrigió el contraste del estado sin conexión.
Los nombres de pines se pueden ampliar con escala y consultar en el inspector.

Revisión final sobre build de producción (`vite preview`, 5190 temporal): smoke
de navegador aprobado y Taste Skill sin FAIL con la excepción de colores de
conductores indicada. Conserva un aviso de margen de texto en móvil (15 px frente
a 16 px recomendado). No se presenta como una certificación automática del diseño.

## Bancos físicos sucesivos · R-025

La selección se resuelve por ID de banco, conservando los enlaces anteriores.
DHT11/PIR pueden probarse por separado; LED/pulsador, LEDs de estado, B-08 e
INMP441 tienen sus referencias físicas. Matriz/buzzer/relé-fan muestran piezas
identificables y paneles por función donde el orden de conectores está pendiente;
no se presentan como circuitos terminados. Iluminación declara material ausente.
Se conserva la composición y los tokens, sin dependencias web nuevas.

Los cables tienen número/color/tipo y las condiciones aparecen en el inspector;
los discontinuos se excluyen de continuidad confirmada. Los recorridos nuevos
salen por fuera del cuerpo ESP32 y rodean el pulsador; las longitudes SVG siguen
sin equivalencia en centímetros. Campos nuevos son opcionales en JSON v1;
se conserva localStorage, historia anterior y borradores por banco.
