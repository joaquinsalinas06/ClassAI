// Requires the mock web server; no backend, firmware or hardware is accessed.
// node scripts/hardware-smoke.mjs http://127.0.0.1:5188
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const base = process.argv[2] ?? "http://127.0.0.1:5188";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/montajes`);
  await page.getByRole("heading", { name: "Montajes", exact: true }).waitFor();
  await page.getByRole("button", { name: "Recorrer armado", exact: true }).click();
  assert.equal(await page.locator('svg[aria-label^="Protoboard"] path').count(), 0);
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  assert.equal(await page.locator('svg[aria-label^="Protoboard"] path').count(), 1);
  await page.getByRole("button", { name: "Ver todo", exact: true }).click();
  await page.getByRole("button", { name: "Añadir componente", exact: true }).click();
  const leg = page.getByLabel("Agujero de pata 2");
  await leg.selectOption("D20");
  await page.getByText(/la resistencia queda puenteada/).waitFor();
  await page.getByRole("button", { name: "Deshacer", exact: true }).click();
  assert.equal(await page.getByText(/la resistencia queda puenteada/).count(), 0);
  await page.getByLabel("Descripción de la revisión").fill("Borrador probado por navegador; sin ensayo eléctrico");
  await page.getByRole("button", { name: "Guardar revisión local", exact: true }).click();
  await page.reload();
  await page.getByText("Borrador probado por navegador; sin ensayo eléctrico", { exact: true }).waitFor();
  const before = await page.getByLabel("Nombre del montaje").inputValue();
  await page.getByLabel("Importar montaje JSON").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}') });
  await page.getByRole("status").filter({ hasText: "Importación rechazada" }).waitFor();
  assert.equal(await page.getByLabel("Nombre del montaje").inputValue(), before);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar JSON", exact: true }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(exported.revisions.length, 1);
  await page.getByLabel("Nombre del montaje").fill("Otra distribución");
  await page.getByRole("button", { name: "Recuperar en borrador", exact: true }).click();
  assert.equal(await page.getByLabel("Nombre del montaje").inputValue(), before);
  assert.equal(await page.getByRole("button", { name: "Recuperar en borrador", exact: true }).count(), 1);
  await page.getByLabel("Importar montaje JSON").setInputFiles({ name: "roundtrip.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  assert.equal(await page.getByLabel("Nombre del montaje").inputValue(), before);
  await mkdir("screenshots", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(t => localStorage.setItem("classai.theme", t), theme);
    await page.reload();
    await page.getByRole("heading", { name: "Montajes", exact: true }).waitFor();
    await page.screenshot({ path: `screenshots/hardware-${theme}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: `screenshots/hardware-${theme}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  console.log("PASS: steps, resistor short/undo, save/reload, import rejection/roundtrip, export, snapshot recovery, light/dark, mobile, no runtime errors.");
} finally { await browser.close(); }
