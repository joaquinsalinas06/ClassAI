/** Minimal markdown for assistant answers: headings, lists, pipe tables and paragraphs. Never HTML. */
export type MdBlock =
  | { kind: "heading"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "paragraph"; lines: string[] };

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const isSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/;

// Tolerates half-typed input (the answer is revealed progressively): a table with only its header renders as a table.
export function parseMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  const at = (j: number) => lines[j] ?? "";
  for (let i = 0; i < lines.length; ) {
    const line = at(i);
    if (!line.trim()) { i++; continue; }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) { blocks.push({ kind: "heading", text: heading[1] ?? "" }); i++; continue; }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && at(i).trim().startsWith("|"); i++) if (!isSeparator(at(i))) rows.push(cells(at(i)));
      blocks.push({ kind: "table", header: rows[0] ?? [], rows: rows.slice(1) });
      continue;
    }
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      for (; i < lines.length && bullet.test(at(i)); i++) items.push(at(i).replace(bullet, ""));
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && at(i).trim() && !bullet.test(at(i)) && !at(i).trim().startsWith("|") && !/^\s*#{1,6}\s/.test(at(i)); i++) para.push(at(i));
    blocks.push({ kind: "paragraph", lines: para });
  }
  return blocks;
}
