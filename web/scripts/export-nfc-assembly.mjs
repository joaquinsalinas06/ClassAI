// Standalone physical drawing and editor-compatible JSON; no user drafts or hardware access.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, logLevel: "error" });
try {
  const { benches } = await server.ssrLoadModule("/src/hardware/benches.ts");
  const nfcAssembly = benches.nfc.assembly;
  const { AssemblyBoard } = await server.ssrLoadModule("/src/hardware/AssemblyBoard.tsx");
  const svg = renderToStaticMarkup(createElement(AssemblyBoard, { assembly:nfcAssembly, wires:nfcAssembly.wires, selected:"", onSelect:()=>{}, connected:()=>false }));
  const out = `${root}../docs/hardware/esquemas/nfc-fisico`;
  await writeFile(`${out}.svg`, `${svg}\n`);
  await writeFile(`${out}.json`, `${JSON.stringify(nfcAssembly,null,2)}\n`);
  console.log("Generated NFC physical SVG and editor JSON (12 M–H, 6 nets). No hardware tested.");
} finally { await server.close(); }
