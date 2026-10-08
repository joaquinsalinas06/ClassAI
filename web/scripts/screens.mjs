// Visual check: screenshots of every page, light and dark, desktop and mobile; fails on console errors.
//   node scripts/screens.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });

// Rooms from the real API when there is one; mock mode serves them in-browser, so fall back to its ids.
let roomIds = ["a101", "b204", "c310"];
try {
  const res = await fetch(`${base}/api/rooms`);
  if (res.ok && res.headers.get("content-type")?.includes("json")) roomIds = (await res.json()).map((r) => r.id);
} catch {
  // mock mode
}
const pages = [
  ["resumen", "/"],
  ...roomIds.map((id) => [`aula-${id}`, `/aula/${id}`]),
  ["sesiones", "/sesiones"],
  ["sesion-detalle", "SESSION"],
  ["asistente", "/asistente"],
  ["estudiantes", "/estudiantes"],
  ["design", "/design"],
];
const only = process.env.ONLY?.split(",");
const errors = [];
const browser = await chromium.launch();

for (const [vpName, viewport, list] of [
  ["desktop", { width: 1440, height: 900 }, pages],
  ["mobile", { width: 390, height: 844 }, pages.filter(([n]) => ["resumen", `aula-${roomIds[0]}`, "sesiones", "asistente"].includes(n))],
]) {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: vpName === "mobile" ? 2 : 1, colorScheme: theme });
    await context.addInitScript((t) => localStorage.setItem("classai.theme", t), theme);
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // A backend without an LLM key answers /assistant/ask with 503 by design; the page handles it.
      if (page.url().endsWith("/asistente") && m.text().includes("status of 503")) return console.log("  (expected) assistant 503: no LLM key");
      errors.push(`${vpName}/${theme} ${page.url()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`${vpName}/${theme} ${page.url()}: ${e.message}`));
    for (const [name, path] of list) {
      if (only && !only.includes(name)) continue;
      if (path === "SESSION") {
        await page.goto(`${base}/sesiones`);
        await page.waitForSelector("tbody tr", { timeout: 15000 });
        await page.locator("tbody tr").nth(3).click();
      } else {
        await page.goto(`${base}${path}`);
      }
      if (name === "asistente") {
        await page.waitForTimeout(600);
        await page.getByRole("button", { name: /calurosa/ }).click().catch(() => {});
      }
      if (name === "sesion-detalle") {
        await page.waitForTimeout(1200);
        const select = page.getByLabel("Sesión para comparar");
        const value = await select.locator("option").nth(1).getAttribute("value").catch(() => null);
        if (value) await select.selectOption(value);
      }
      await page.waitForTimeout(name.startsWith("aula") ? 4200 : 2600);
      await page.screenshot({ path: `${out}/${name}-${vpName}-${theme}.png`, fullPage: true });
      console.log(`saved ${name}-${vpName}-${theme}`);
    }
    await context.close();
  }
}
await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} console error(s):\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("\nno console errors");
