# ClassAI — sistema de diseño

Una sola fuente para web y Android: [`tokens.json`](tokens.json). Se edita ahí y se regenera:

```bash
node design/build-tokens.mjs            # escribe CSS y XML; falla si un texto no llega a 4.5:1
node design/build-tokens.mjs --verbose  # además imprime cada par de contraste
```

| Salida | Uso |
|---|---|
| `web/src/styles/tokens.css` | Variables `--ds-*`; tema por `[data-theme]` y `prefers-color-scheme` |
| `mobile/android/app/src/main/res/values/ds_tokens.xml` | Colores claros `ds_*`, `dimen` (espaciado, radios, tipo en `sp`, íconos), `integer` (duraciones) |
| `mobile/android/app/src/main/res/values-night/ds_tokens.xml` | Colores oscuros con los mismos nombres |

Los archivos `ds_tokens.xml` son independientes de `colors.xml`/`themes.xml` del equipo móvil: se referencian, no se pisan.

## Principios

| Principio | En la práctica |
|---|---|
| **El color es dato** | La estructura es gris *garúa* (neutro frío, como el cielo de Lima). El color solo aparece para una métrica o un estado. La marca es tinta, no un tono. |
| **Calma, datos primero** | Bordes finos, casi sin sombras; la jerarquía la dan el tamaño del texto y el espacio. Un único gesto decorativo: el halo del estado detrás del medidor de confort. |
| **Movimiento con propósito** | Se anima lo que cambió: una lectura nueva (el eje se desliza), alguien que llega (entra en la lista), un rango que se ajusta. Todo respeta `prefers-reduced-motion`. |
| **Explicable** | Cada número tiene unidad, rango objetivo y de dónde salió (`source`). |

## Lenguaje de estados de confort

Siempre color **+ ícono + palabra**. Nunca color solo.

| Estado | Condición | Etiqueta | Ícono (Lucide) | Token |
|---|---|---|---|---|
| `OK` | `comfort ≥ ok_min` (80) | Confortable | `circle-check` | `state.ok.*` |
| `REGULAR` | `regular_min ≤ comfort < ok_min`, o sin sensores válidos | Regular | `circle-alert` | `state.regular.*` |
| `ALERT` | `comfort < regular_min` (60) | Alerta | `triangle-alert` | `state.alert.*` |
| sin conexión | `status = offline` | Sin conexión | `wifi-off` | `state.offline.*` |

Cada estado tiene `solid` (marcas), `text` (≥ 4.5:1 sobre `surface` y `subtle`), `subtle` (fondo) y `border`.

## Color

| Grupo | Regla |
|---|---|
| Neutral garúa `0…900` | Toda la interfaz: fondos, bordes, texto |
| Texto | `primary` / `secondary` / `muted` (AA en ambos temas). `faint` solo para placeholders y deshabilitado |
| Métricas | temp naranja · humedad azul · luz ámbar · ruido violeta · presencia aqua · confort tinta. Validado con el método del skill de dataviz: ΔE CVD adyacente ≥ 24.7 (claro) / 17.3 (oscuro), visión normal ≥ 24 |
| Gráficos | `chart.band` = rango objetivo (verde 8 %), `chart.out` = periodo fuera de rango, `chart.compare` = serie de comparación (gris, punteada) |

Restricciones conocidas: luz y presencia quedan bajo 3:1 sobre blanco y ámbar de luz se parece a `regular` → el valor siempre se imprime junto a la marca y las métricas nunca comparten un eje. Azul y violeta colapsan con protanopía en oscuro si se ponen juntos: nunca se grafican en el mismo plano.

## Tipografía

| Rol | Familia | Notas |
|---|---|---|
| Todo | **Geist Variable** (`@fontsource-variable/geist`) | Cifras tabulares (`.num`) en datos y tablas |
| Identificadores | **Geist Mono Variable** | Solo códigos de estudiante, `session_id`, tokens, teclas |

Escala (px, tamaño/interlínea): hero 56/56 · display 40/44 · title 22/28 · heading 16/22 · metric 28/32 · body 14/20 · label 13/18 · small 13/18 · caption 12/16 · micro 11/14.
Por qué Geist: numerales limpios y estrechos para tableros densos, buen soporte de español, variable (un archivo) y con mono hermana para identificadores.

## Formato de números (es-PE, `America/Lima`)

| Métrica | Decimales | Unidad | Ejemplo |
|---|---|---|---|
| Temperatura (`temp_c`, `ir_object_c`) | 1 | °C | `23.4 °C` |
| Humedad (`rh_pct`) | 0 | % | `55 %` |
| Luz (`lux`) | 0 | lx | `1,250 lx` |
| Ruido (`noise_rel`) | 2 | relativo (no dB) | `0.31 rel.` · "máx. 0.42" |
| Confort | 0 | sobre 100 | `82` / "de 100" |
| Cambios | según métrica | con signo | `+0.4 °C`, `−1.2` (signo menos real) |
| Horas | 24 h | — | `14:05`; relativas: "hace 3 min" |

Punto decimal y coma de miles (uso peruano). Espacio fino no separable entre número y unidad. Sin dato → `—`.

## Voz y tono

| Hacer | Evitar |
|---|---|
| Verbos claros y la acción exacta: "Enrolar credencial" → aviso "Credencial enrolada" | "Enviar", "OK", "Procesar" |
| Decir qué pasó y qué hacer: "La clave de administrador no es válida." | "Ups, algo salió mal" |
| Lenguaje del aula: "Hace calor", "Poca luz", "Nadie ha marcado todavía" | Jerga técnica: "payload", "SSE", "ALERT" en pantalla |
| Tuteo, frases cortas, mayúscula solo inicial | MAYÚSCULAS, signos de exclamación |

## Espaciado, radios, elevación, movimiento

| Token | Valores |
|---|---|
| Espaciado | base 4 px: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Radio | xs 4 (chips en tablas) · sm 6 (badges) · md 8 (botones, inputs) · lg 12 (paneles) · xl 16 (diálogos) · full |
| Elevación | xs (paneles) · sm (hover) · md (tooltips, menús) · lg (paleta, avisos). En oscuro, sombra + borde interior claro |
| Duración | instant 80 · fast 140 · base 220 · slow 360 · update 480 (deslizamiento del gráfico) · chart 900 (dibujo de la línea) ms |
| Curvas | standard `(.2,0,0,1)` · enter `(0,0,.2,1)` · exit `(.4,0,1,1)` · emphasized `(.3,0,0,1)` |
| Resortes | snappy 520/38 (listas, layout) · gentle 220/28 (paneles) · gauge 70/18 (medidor y contadores) |
| z-index | sticky 10 · sidebar 20 · header 30 · dropdown 40 · overlay 50 · modal 60 · toast 70 · tooltip 80 |
| Breakpoints | sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536 |

## Iconografía

Lucide (web: `lucide-react`; Android: los mismos SVG como vector drawables). Trazo **1.75** en todos lados; tamaños 14 (chips, tablas), 16 (por defecto), 20, 24. Mapa concepto → ícono en `tokens.json › icon.map`.

## Inventario de componentes (`web/src/ui`, `web/src/charts`)

| Componente | Notas |
|---|---|
| Button, IconButton | primary (tinta), secondary, ghost, danger; IconButton exige `label` (tooltip + aria) |
| Card / CardHeader | el único contenedor |
| Badge, StateBadge, Dot | StateBadge siempre ícono + palabra |
| Tabs | indicador que se desliza; flechas ← → |
| Table / Th / Td | cabecera fija, cifras tabulares |
| Tooltip, Kbd, Toast | Radix Tooltip; avisos con `aria-live` |
| Skeleton, EmptyState, ErrorBoundary | ningún estado vacío o error deja la pantalla en blanco |
| Avatar | iniciales + degradado de un mismo tono (8 tonos OKLCH) |
| AnimatedNumber | interpola sin re-renderizar |
| Gauge, ComfortRing, ComfortBar | confort con zonas por estado |
| Sparkline, TimeSeries | banda objetivo, periodos fuera de rango, picos rotulados, cruz con tooltip, teclado, vista de tabla |
| CommandPalette | `⌘K`, atajos `g o/l/s/a/e/d`, `[` barra lateral |

## Hacer / no hacer

| Hacer | No hacer |
|---|---|
| Un gráfico por unidad; pestañas para cambiar de métrica | Dos ejes Y en un gráfico |
| Rango objetivo sombreado detrás de cada serie | Colorear la línea según el estado |
| Valor impreso junto a cada marca de color | Leyendas que dependan solo del color |
| Animar el cambio (nuevo punto, nueva llegada) | Animaciones de entrada en cada tarjeta al hacer scroll |
| Tokens `--ds-*` o clases Tailwind mapeadas | Hex sueltos en componentes |
