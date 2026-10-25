import type { BenchGuide } from "./benches";
export function BenchGuidePanel({guide}:{guide:BenchGuide}) {
 const command = guide.firmware ? `arduino-cli compile --libraries firmware/libraries --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2${guide.profile ? ` --build-property 'compiler.cpp.extra_flags=-DBENCH_${guide.profile.toUpperCase()}_ONLY=1'` : ""} firmware/${guide.firmware}` : undefined;
 return <section className="space-y-3 border-t border-line pt-4" aria-label="Ensayo guiado">
  <h2 className="text-label">Ensayo guiado</h2>
  <p><strong>Acción:</strong> {guide.action}</p><p><strong>Aprobación:</strong> {guide.expected}</p><p><strong>Diagnóstico:</strong> {guide.diagnosis}</p>
  {guide.adaptation && <details className="rounded border border-line p-3"><summary className="cursor-pointer text-label">Compatibilidad eléctrica y adaptación, si hace falta</summary><p className="mt-2 text-small">El montaje principal representa tus módulos. La adaptación se consulta aparte cuando la entrada no admite lógica de 3,3 V o la carga supera la capacidad del GPIO.</p><a className="mt-2 block text-link underline" href={`https://github.com/joaquinsalinas06/ClassAI/blob/codex/physical-benches/docs/hardware/esquemas/${guide.assembly.bankId}-adaptado.md`}>Ver circuito alternativo y sus piezas</a></details>}
  <h3 className="text-label">Confirmaciones antes de energizar</h3><ul className="list-disc space-y-2 pl-5">{guide.blockers.map(s=><li key={s}>{s}</li>)}</ul>
  <p className="text-caption text-muted">No instales los cables marcados NO CONECTAR. La tabla explica qué dato falta para habilitarlos. Los demás se recorren por número. Las posiciones por función no certifican el orden físico de un conector real.</p>
  {command && <><h3 className="text-label">Compilar sin placa</h3><pre className="overflow-x-auto rounded bg-surface p-3 text-caption">{command}</pre><p>Antes de cargar: identificar A-01 y su puerto, registrar cableado real, preservar respaldo privado. B-02 permanece en NFC. Consultar la guía del banco para carga explícita y Serial a 115200.</p></>}
  {!command && <p>Firmware de ensayo pendiente de identificar y dimensionar el circuito. No energizar ni usar el nodo integrado.</p>}
 </section>;
}
