# ClassAI web

Panel web de ClassAI: aulas en vivo, sesiones, asistencia, asistente y el sistema de diseño.
Vite + React 19 + TypeScript estricto, Tailwind CSS v4 sobre los tokens de [`../design`](../design/README.md),
`motion` para animación, `lucide-react`, gráficos SVG propios con `d3-scale`/`d3-shape`, TanStack Query y `EventSource`.

## Requisitos

Node 20+ y pnpm.

```bash
cd web
pnpm install
```

## Desarrollo

| Modo | Comando | Datos |
|---|---|---|
| Con backend | `pnpm dev` → <http://localhost:5173> | `/api/*` se reenvía a `CLASSAI_API` (por defecto `http://127.0.0.1:8000`) sin el prefijo `/api` |
| Demostración | `pnpm dev:mock` | Generador determinista en el navegador (`src/lib/mock.ts`): mismas formas que la API y el SSE, 3 aulas, ~3 semanas de clases, llegadas en vivo |

Backend completo (broker, histórico sembrado, ingesta, API y simulador): ver [`backend/DEMO.md`](../backend/DEMO.md).
Otro puerto de API: `CLASSAI_API=http://127.0.0.1:8011 pnpm dev`.

## Calidad

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test        # vitest: formato, estados de confort (paridad con firmware), series/picos, reductor SSE
pnpm build       # typecheck + build de producción en dist/
pnpm tokens      # regenera tokens.css y los XML de Android desde design/tokens.json
```

Capturas de todas las páginas (claro/oscuro, escritorio 1440×900 y móvil 390×844); falla si hay errores en consola:

```bash
pnpm dev:mock --port 5181 &
node scripts/screens.mjs http://localhost:5181 screenshots
```

## Estructura

| Ruta | Contenido |
|---|---|
| `src/lib` | `api.ts` (REST + SSE), `live.ts` (reductor en vivo), `useLive.ts`, `comfort.ts` (índice y estados, igual que `tuner.py`), `series.ts`, `format.ts`, `mock.ts` |
| `src/ui` | Componentes base (Button, Card, Badge, Tabs, Table, Tooltip, Toast, Skeleton, EmptyState, Avatar, Kbd…) |
| `src/charts` | Gauge, ComfortRing, ComfortBar, Sparkline, TimeSeries |
| `src/features` | Paneles compuestos: métricas, tendencia, asistencia, "¿Por qué este rango?" |
| `src/pages` | Resumen, Aula en vivo, Sesiones, Detalle de sesión, Asistente, Estudiantes, Sistema de diseño |
| `src/app` | Shell (barra lateral, barra superior, atajos), paleta de comandos, tema |

## Atajos

`⌘K` paleta · `g o` resumen · `g l` aula en vivo · `g s` sesiones · `g a` asistente · `g e` estudiantes · `g d` sistema de diseño · `[` barra lateral. En los gráficos: `←`/`→` recorren los valores (`⇧` de 10 en 10), `Esc` sale.

## Notas

- La clave de administrador (`X-API-Key`) se guarda solo en `sessionStorage` de la pestaña.
- Si `POST /assistant/ask` responde 503 (sin clave del modelo) la página del asistente se desactiva con un aviso; el navegador igual registra la respuesta 503 en la consola de red.
- La API no tiene un listado de estudiantes: la página Estudiantes los arma con la asistencia de las últimas 12 clases, y solo puede revocar credenciales cuyo ID se conoce.
- El estado del ventilador no viaja en la telemetría: se estima con la regla del firmware (ALERT y temperatura sobre el máximo → encendido; OK → apagado; 60 s de retención).
