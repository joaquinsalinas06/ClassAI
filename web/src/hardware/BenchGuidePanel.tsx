import type { BenchGuide } from "./benches";
export function BenchGuidePanel({guide}:{guide:BenchGuide}) {
 const command = guide.firmware ? `arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --jobs 2${guide.profile ? ` --build-property 'compiler.cpp.extra_flags=-DBENCH_${guide.profile.toUpperCase()}_ONLY=1'` : ""} firmware/${guide.firmware}` : undefined;
 return <section className="space-y-3 border-t border-line pt-4" aria-label="Ensayo guiado">
  <h2 className="text-label">Ensayo guiado</h2>
  <p><strong>Acción:</strong> {guide.action}</p><p><strong>Aprobación:</strong> {guide.expected}</p><p><strong>Diagnóstico:</strong> {guide.diagnosis}</p>
  <h3 className="text-label">Confirmaciones antes de energizar</h3><ul className="list-disc space-y-2 pl-5">{guide.blockers.map(s=><li key={s}>{s}</li>)}</ul>
  <p className="text-caption text-muted">Líneas discontinuas: conexiones pendientes, excluidas del análisis de continuidad. Las posiciones por función no identifican el orden de un conector real.</p>
  {command && <><h3 className="text-label">Compilar sin placa</h3><pre className="overflow-x-auto rounded bg-surface p-3 text-caption">{command}</pre><p>Antes de cargar: identificar A-01 y su puerto, registrar cableado real, preservar respaldo privado. B-02 permanece en NFC. Consultar la guía del banco para carga explícita y Serial a 115200.</p></>}
  {!command && <p>Firmware de ensayo pendiente de identificar y dimensionar el circuito. No energizar ni usar el nodo integrado.</p>}
 </section>;
}
