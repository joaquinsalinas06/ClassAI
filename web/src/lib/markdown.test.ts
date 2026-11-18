import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("parses tables, lists glued to paragraphs and headings", () => {
    const md = "### Resumen\nLa clase fue cálida:\n- 28,1 °C\n- 95 %\n\n| Métrica | Valor |\n|---|---:|\n| Temp | 28,1 °C |\n| Confort | 31 |";
    expect(parseMarkdown(md)).toEqual([
      { kind: "heading", text: "Resumen" },
      { kind: "paragraph", lines: ["La clase fue cálida:"] },
      { kind: "list", ordered: false, items: ["28,1 °C", "95 %"] },
      { kind: "table", header: ["Métrica", "Valor"], rows: [["Temp", "28,1 °C"], ["Confort", "31"]] },
    ]);
  });

  it("tolerates a half-typed table", () => {
    expect(parseMarkdown("| Métrica | Val")).toEqual([{ kind: "table", header: ["Métrica", "Val"], rows: [] }]);
    expect(parseMarkdown("| a | b |\n|--")).toEqual([{ kind: "table", header: ["a", "b"], rows: [] }]);
  });
});
