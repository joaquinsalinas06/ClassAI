import { useState } from "react";
import { Button } from "../ui/Button";
import { devkit30, devkit38, silkscreen30 } from "./pinouts";

export function WiringReference({ onSignal }: { onSignal: () => void }) {
  const [profile, setProfile] = useState<30 | 38>(30);
  const pins = profile === 30 ? { left: devkit30.left.map(silkscreen30), right: devkit30.right.map(silkscreen30) } : devkit38;
  return <section className="mb-6 space-y-4" aria-label="Entender el cableado">
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="min-w-0 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-heading">OUT comparte señal; + alimenta el sensor</h2>
        <svg viewBox="0 0 620 245" className="mt-3 w-full" role="img" aria-label="3,3 voltios alimentan directamente el positivo del DHT11. Otra rama pasa por 10 kiloohmios hacia un nodo compartido por OUT y GPIO4.">
          <rect width="620" height="245" rx="12" fill="#edf2f5" />
          <g fontFamily="inherit" fontSize="15" fill="#26344a">
            <path d="M90 45 H440 M90 45 V120 H155 M225 120 H300" fill="none" stroke="#db3345" strokeWidth="4" strokeLinejoin="round" />
            <rect x="155" y="108" width="70" height="24" rx="5" fill="#e1c39a" stroke="#92734b" strokeWidth="2" />
            <text x="190" y="98" textAnchor="middle">R1 · 10 kΩ</text>
            <path d="M300 120 H440 M300 120 V188 H440" fill="none" stroke="#15855e" strokeWidth="4" strokeLinejoin="round" />
            <circle cx="90" cy="45" r="5" fill="#db3345" /><circle cx="300" cy="120" r="6" fill="#15855e" />
            <text x="24" y="30" fontWeight="700">3,3 V</text><text x="450" y="50" fontWeight="700">DHT11 +</text>
            <text x="450" y="125" fontWeight="700">D4 / GPIO4</text><text x="450" y="193" fontWeight="700">DHT11 OUT</text>
            <text x="290" y="225" textAnchor="middle">● Unión eléctrica: A8 = B8 = C8 = D8 = E8</text>
          </g>
        </svg>
        <p className="mt-3 text-small text-fg-2">La resistencia es una rama hacia la señal, no un paso en serie ni un divisor. OUT y GPIO4 están unidos directamente por la tira de cobre de la fila 8. El DHT11 y el ESP32 se turnan para comunicar por esa línea.</p>
        <p className="mt-2 text-small text-fg-2">El pull-up mantiene la señal alta cuando nadie la lleva a GND. El cable rojo a J8 alimenta esa rama; el otro cable rojo alimenta + del sensor. Si el módulo ya incorpora pull-up a 3,3 V, se puede omitir R1 externa tras comprobarlo.</p>
        <div className="mt-3"><Button size="sm" onClick={onSignal}>Resaltar señal OUT ↔ D4 en el montaje</Button></div>
        <p className="mt-2 text-caption text-muted">Esquema de la guía original. Si editas agujeros o conexiones, consulta la red resaltada del montaje actual.</p>
      </article>
      <article className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-heading">VIN: comprobar antes de alimentar el PIR</h2>
        <p className="mt-3 text-small text-fg-2"><strong>VIN no significa salida regulada de 5 V.</strong> Es la entrada del regulador de 3,3 V. Algunas variantes permiten obtener allí la alimentación USB; otras rutas o diodos pueden cambiar la tensión disponible.</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-small text-fg-2">
          <li>Con sensores desconectados, alimentar solo el ESP32 por USB.</li>
          <li>Medir tensión DC entre VIN (+) y GND (−). Anotar placa y lectura real.</li>
          <li>Usar VIN → VCC del PIR únicamente si su tensión y capacidad de alimentación son adecuadas para ese módulo.</li>
        </ol>
        <p className="mt-3 text-small text-fg-2">PIR: <strong>VCC → alimentación verificada · GND → masa común · OUT → D27 / GPIO27</strong>, tras comprobar orden y nivel de salida. Sin H–H: VIN llega a F20 y VCC del PIR a H20; GPIO27 llega a G24 y OUT del PIR a J24. Cada pareja comparte su tira de cobre. Ambos GND de sensores usan el riel derecho −. El riel derecho + queda libre.</p>
        <p className="mt-3 text-caption text-regular-text">En esta guía, naranja significa alimentación nominal de 5 V pendiente de medir. No conectar una fuente externa a VIN mientras se alimenta por USB.</p>
        <p className="mt-3 text-caption text-muted">Referencias: <a className="text-link underline" href="https://learn.adafruit.com/dht/connecting-to-a-dhtxx-sensor">Adafruit · pull-up DHT</a> · <a className="text-link underline" href="https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html">Espressif · alimentación y DevKitC</a>. La ruta VIN de cada clon sigue pendiente.</p>
      </article>
    </div>
    <details className="rounded-lg border border-line bg-surface p-4">
      <summary className="cursor-pointer text-heading">Comparar placas · mapa de 30 y referencia de 38 pines</summary>
      <div className="my-3 flex flex-wrap gap-2"><Button size="sm" aria-pressed={profile === 30} onClick={() => setProfile(30)}>30 pines · disponibles</Button><Button size="sm" aria-pressed={profile === 38} onClick={() => setProfile(38)}>38 pines · referencia E-01 pendiente</Button></div>
      <p className="text-small text-fg-2">{profile === 30 ? "La placa fotografiada muestra ESP32 DEVKITV1 y 30 pines; D4, D5, VP y VN son legibles y coinciden con este mapa. La foto aún no está asociada a A-01/B-02 ni a un puerto USB. La otra placa conserva su pinout reportado." : "Referencia oficial ESP32-DevKitC V4: J2 y J3, 19 contactos por lado. E-01 sigue pedida; USB-C y 38 pines no confirman este orden. Consultar esta referencia no cambia la placa ni el cableado de la guía."}</p>
      <p className="mt-2 text-caption text-muted">Vista frontal: antena arriba, USB abajo. Filas de arriba hacia abajo; para comparar con tu relato, leer desde la última fila.</p>
      <div className="mx-auto mt-3 max-w-xl overflow-x-auto"><table className="w-full text-left text-small" aria-label={`Pinout de referencia ${profile} pines`}><thead><tr className="border-b border-line"><th className="p-2">Fila ↓</th><th>{profile === 30 ? "Izquierda" : "J2 · izquierda"}</th><th>{profile === 30 ? "Derecha" : "J3 · derecha"}</th></tr></thead><tbody>{pins.left.map((pin, i) => <tr key={i} className="border-b border-line"><td className="p-2 text-muted">{i + 1}</td><td className={pin === "D27" || pin === "IO27" ? "font-bold text-link" : ""}>{pin}</td><td className={pins.right[i] === "D4" || pins.right[i] === "IO4" ? "font-bold text-link" : ""}>{pins.right[i]}</td></tr>)}</tbody></table></div>
      <p className="mt-3 text-small text-fg-2">{profile === 30 ? "D4 = GPIO4; D27 = GPIO27; VP = GPIO36; VN = GPIO39; RX2 = GPIO16; TX2 = GPIO17. EN es reinicio y VIN/3V3/GND son alimentación." : "Aquí IO4 = GPIO4 e IO27 = GPIO27. Atención: D2 del DevKitC es GPIO9 de memoria; no es el D2 = GPIO2 de la placa de 30 pines. CLK/D0/D1/D2/D3/CMD se reservan para flash. No trasladar posiciones entre placas."}</p>
    </details>
  </section>;
}
