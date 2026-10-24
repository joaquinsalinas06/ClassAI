// Generate reviewable SVG/Markdown references from the same catalog used by /montajes.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = fileURLToPath(new URL("../../docs/hardware/esquemas/", import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, logLevel: "error" });
const cell = s => s.replaceAll("|", "\\|").replaceAll("\n", " ");
try {
  const { missions } = await server.ssrLoadModule("/src/hardware/missions.ts");
  const { MissionDiagram } = await server.ssrLoadModule("/src/hardware/MissionDiagram.tsx");
  await mkdir(out, { recursive: true });
  for (const mission of missions) {
    const svg = renderToStaticMarkup(createElement(MissionDiagram, { mission })).replace("<svg ", `<svg width="1000" height="${300+mission.links.length*64}" `);
    await writeFile(`${out}${mission.id}.svg`, `${svg}\n`);
    const md = `# ${mission.code} · ${mission.title}\n\n${mission.summary}\n\n**Propuesta, sin ensayo físico. ${mission.state}.**\n\n![Esquema de referencia](${mission.id}.svg)\n\nMapa eléctrico por nombres: las posiciones se ordenan por función, no corresponden a una fotografía ni certifican el orden físico de los conectores. Las líneas representan redes o tramos, no cables H–H obligatorios. Los tramos discontinuos son pendientes.\n\n## Materiales\n\n${mission.materials.map(s=>`- ${s}`).join("\n")}\n\nCables: ${mission.jumpers}. No reservar material ya usado en otro banco.\n\n## Conexiones\n\n| Desde | Hasta | Vía / condición | Estado |\n|---|---|---|---|\n${mission.links.map(w=>`| ${cell(w.from)} | ${cell(w.to)} | ${cell(w.via??"—")} | ${w.pending?"Resolver antes de energizar":"Propuesto"} |`).join("\n")}\n\n## Antes de conectar\n\n${mission.checks.map((s,i)=>`${i+1}. ${s}`).join("\n")}\n\nResultado esperado: ${mission.test}\n\nFirmware: ${mission.firmware}\n\nConflictos: ${mission.conflicts}\n\n${mission.sources.map(s=>`- [${s.title}](${s.url})`).join("\n")}\n\n[Volver al índice](README.md). Generado por web/scripts/export-hardware-missions.mjs desde web/src/hardware/missions.ts.\n`;
    await writeFile(`${out}${mission.id}.md`, md);
  }
  await writeFile(`${out}README.md`, `# Esquemas por banco\n\nReferencias generadas desde web/src/hardware/missions.ts. No prueban un montaje real ni autorizan energizar conexiones pendientes. Conservan IDs de inventario, fuentes, GPIO, condiciones y conflictos. Ver [orden y reparto de dos placas](../siguientes-bancos.md). La [guía física de ambiente](../banco-ambiente.md) conserva su diagrama con agujeros.\n\n| Banco | Grupo | Estado | Archivos |\n|---|---|---|---|\n${missions.map(m=>`| ${m.code} · ${m.title} | ${m.group} | ${m.state} | [Guía](${m.id}.md) · [SVG](${m.id}.svg) |`).join("\n")}\n\nRegenerar desde la raíz: \`node web/scripts/export-hardware-missions.mjs\`. Los diagramas son mapas lógicos por nombres, no modelos físicos de cada variante. La biblioteca en /montajes permite recorrer conexiones y exportar SVG/JSON; no modifica los guardados del editor de ambiente.\n`);
  console.log(`Generated ${missions.length} SVG diagrams, ${missions.length} guides and index.`);
} finally { await server.close(); }
