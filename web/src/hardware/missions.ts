import { benches, type BenchGuide } from "./benches";
export type LinkKind = "power" | "ground" | "signal" | "speaker" | "flow";
export interface MissionLink { from: string; to: string; kind: LinkKind; via?: string; pending?: boolean }
export interface Mission {
  physical?: BenchGuide; id: string; code: string; title: string; group: string; state: string; summary: string;
  modules: { name: string; inventory: string; shape: string }[];
  materials: string[]; jumpers: string; links: MissionLink[]; checks: string[];
  test: string; firmware: string; conflicts: string; sources: { title: string; url: string }[];
}
const link = (from: string, to: string, kind: LinkKind = "signal", via?: string, pending = false): MissionLink => ({ from, to, kind, via, pending });
const spiSource = { title: "Elechouse · PN532 V3", url: "https://www.elechouse.com/elechouse/images/product/PN532_module_V3/PN532_%20Manual_V3.pdf" };
const audioSource = { title: "Adafruit · MAX98357", url: "https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/pinouts" };
const chipSource = { title: "Espressif · ESP32", url: "https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf" };
export const missions: Mission[] = [
  {
    id: "identidad", code: "M-00", title: "Identificar y conservar", group: "Preparación", state: "Antes de cualquier carga",
    summary: "Una placa cada vez: asociar propietario, puerto y firmware previo antes de conectar dos ESP32.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "Laptop", inventory: "Equipo existente", shape: "computer" }],
    materials: ["A-01 o B-02, una placa", "A-03 o D-10: USB de datos"], jumpers: "Sin jumpers; 1 USB por placa",
    links: [link("Laptop · USB", "ESP32 · micro USB", "flow", "Cable de datos")],
    checks: ["Asociar la placa fotografiada a A-01/B-02 sin atribuir propietario por apariencia.", "Preservar el respaldo privado existente; anotar tamaño/hash, sin publicarlo.", "Con dos placas, seleccionar puerto explícito; no usar autodetección."],
    test: "Reconocer cada puerto y placa; el respaldo se registra por separado de su restauración probada.", firmware: "Sin carga de firmware.", conflicts: "E-01 sigue pedido; no contar una tercera placa recibida.", sources: [chipSource],
  },
  {
    id: "led-boton", code: "M-01", title: "LED + botón", group: "Preparación", state: "Preparar mientras sueldan",
    summary: "Banco mínimo para comprobar un GPIO de salida y una pulsación, sin cargas de potencia.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "LED + botón", inventory: "C-05 / C-04", shape: "led" }],
    materials: ["C-05: LED rojo ×1", "C-01: resistencia 1 kΩ ×1", "C-04: pulsador ×1", "B-01 o A-04: protoboard"], jumpers: "Referencia: 3 M–H + 2 M–M; patas en protoboard; 0 H–H",
    links: [link("ESP32 · GPIO25", "LED · ánodo (+)", "signal", "R1 · 1 kΩ en serie"), link("LED · cátodo (−)", "ESP32 · GND", "ground"), link("ESP32 · GPIO32", "Pulsador · contacto A", "signal", "INPUT_PULLUP"), link("Pulsador · contacto B", "ESP32 · GND", "ground")],
    checks: ["Identificar ánodo/cátodo y bandas de la resistencia; no omitir R1.", "Las cuatro patas del botón forman dos parejas; conectar contactos de parejas distintas.", "Montar apagado. Elegir placa/puerto y conservar respaldo antes de cargar."],
    test: "Una pulsación produce un cambio del LED; mantener pulsado no genera cambios repetidos.", firmware: "Banco mínimo led_button_bench preparado; no usar el nodo integrado con actuadores.", conflicts: "GPIO25 se propone también para WS de audio: ensayos aislados.", sources: [chipSource],
  },
  {
    id: "nfc", code: "M-10", title: "NFC · tarjetas y llavero", group: "NFC / sesión", state: "HCE y asistencia física comprobados; regularidad RF pendiente",
    summary: "ESP32 B-02 y PN532 D-01: montaje con rieles usado en el ensayo HCE → MQTT → asistencia. Retirar y presentar puede requerir reintentos; regularidad RF pendiente.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "PN532 V3", inventory: "D-01", shape: "nfc" }],
    materials: ["D-01: PN532 V3 ×1", "D-02: tarjeta ×1", "D-03: llavero ×1", "D-11: cabecera macho montada en el ensayo NFC", "B-01 o A-04: protoboard"], jumpers: "Con cabecera macho: 12 M–H; con hembra: 6 M–H + 6 M–M. Seis redes por protoboard, 0 H–H",
    links: [link("ESP32 · 3V3", "PN532 · VCC", "power", "Riel + izquierdo LP15 / LP2 · 3,3 V"), link("ESP32 · GND", "PN532 · GND", "ground", "Riel − izquierdo LN14 / LN4"), link("ESP32 · GPIO18", "PN532 · SCK", "signal", "A6 / B6"), link("PN532 · MISO", "ESP32 · GPIO19", "signal", "A8 / B8"), link("ESP32 · GPIO23", "PN532 · MOSI", "signal", "A10 / B10"), link("ESP32 · GPIO5", "PN532 · SS", "signal", "A12 / B12")],
    checks: ["DIP SPI, sin alimentación: canal 1 OFF / canal 2 ON; leer números, no copiar dirección de la foto.", "Revisar soldadura: sin puentes, pines firmes y antena despejada. Confirmar cabecera macho/hembra para elegir M–H/M–M. IRQ/RSTO quedan sin conectar.", "Potencia por rieles izquierdos: + LP15/LP2 y − LN14/LN4, solo mitad superior. Señales por A6/B6, A8/B8, A10/B10 y A12/B12. No unir + con −, A con F ni redes distintas.", "Primer ensayo sin pantalla ni actuadores. No imprimir ni publicar tokens/UID completos."],
    test: "PN532 responde con versión; 20 detecciones con retirada entre lecturas. Después probar Android HCE por separado.", firmware: "firmware/classai_node, perfil NFC_ONLY: SPI 18/19/23/5, Serial 115200, status/start/stop. HCE y asistencia persistida probados (R-023). firmware/nfc_bench queda para diagnóstico de tarjetas.", conflicts: "TFT comparte GPIO5/23 y usa otro SCK; no conectar ambas recetas como si fueran compatibles.", sources: [spiSource],
  },
  {
    id: "ambiente", code: "M-04/05", title: "DHT11 + PIR", group: "Ambiente / actuación", state: "Guía física disponible",
    summary: "Conservar el banco ya dibujado: temperatura/humedad y movimiento, sin hembra–hembra.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "DHT11 + PIR", inventory: "B-03 / B-04 o D-06", shape: "sensor" }],
    materials: ["B-03: DHT11 ×1", "B-04 o D-06: un PIR", "C-02: resistencia 10 kΩ ×1", "B-01 o A-04: protoboard"], jumpers: "11 M–H + 1 M–M; 0 H–H, según guía física",
    links: [link("ESP32 · 3V3", "DHT11 · +", "power", "3,3 V", true), link("DHT11 · −", "ESP32 · GND", "ground"), link("DHT11 · OUT", "ESP32 · GPIO4"), link("DHT11 · OUT", "ESP32 · 3V3", "power", "R1 · 10 kΩ, pull-up"), link("ESP32 · VIN", "PIR · VCC", "power", "Ruta USB y tensión pendientes", true), link("PIR · GND", "ESP32 · GND", "ground"), link("PIR · OUT", "ESP32 · GPIO27", "signal", "Orden y nivel pendientes", true)],
    checks: ["Distribución física de ambiente: VCC PIR en F20/H20 y OUT en G24/J24; no confundir tiras.", "Etiquetas del PIR no legibles en fotos: no inferir orden por lente o jumper amarillo.", "DHT11 + a 3,3 V según propuesta; confirmar variante y pull-up incorporado. No subir a 5 V por ensayo/error.", "VIN no es salida regulada garantizada; mantener esa alimentación pendiente hasta resolver la variante."],
    test: "20 lecturas DHT11, fallo explícito sin convertirlo en cero; PIR activa, vuelve a LOW y puede reactivar.", firmware: "firmware/ambient_bench compilado, no cargado. Wokwi usa DHT22 sustituto y no valida B-03 real.", conflicts: "PIR GPIO27 entra en conflicto con DC de la TFT.", sources: [{ title: "Adafruit · DHT y pull-up", url: "https://learn.adafruit.com/dht/connecting-to-a-dhtxx-sensor" }, { title: "Joy-IT · HC-SR501", url: "https://joy-it.net/en/products/SEN-HC-SR501" }],
  },
  {
    id: "audio-salida", code: "M-07B", title: "Audio · una bocina", group: "Interfaz / audio", state: "Soldadura y fuente pendientes",
    summary: "MAX98357A con una sola bocina de 4 Ω. Separar los datos I²S de la alimentación y la salida del altavoz.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "MAX98357A", inventory: "D-08", shape: "amp" }, { name: "Una bocina", inventory: "1 de D-09", shape: "speaker" }],
    materials: ["D-08: amplificador ×1", "D-09: solo una de las dos bocinas", "Adaptadores/bornera en soldadura; tipo y pinout por revisar", "Fuente 5 V DC adecuada, no inventariada como validada"], jumpers: "Señales por M–H y protoboard; potencia/altavoz por adaptadores; contar tras soldar; 0 H–H",
    links: [link("ESP32 · GPIO26", "MAX98357A · BCLK", "signal", "Propuesta I²S aislada"), link("ESP32 · GPIO25", "MAX98357A · LRC / WS"), link("ESP32 · GPIO22", "MAX98357A · DIN"), link("Fuente 5 V DC · +", "MAX98357A · VIN", "power", "Fuente y consumo por validar", true), link("Fuente 5 V DC · −", "MAX98357A · GND", "ground"), link("ESP32 · GND", "MAX98357A · GND", "ground"), link("MAX98357A · SPK+", "Bocina · +", "speaker", "Solo una bocina"), link("MAX98357A · SPK−", "Bocina · −", "speaker", "No conectar a GND")],
    checks: ["GPIO26/25/22 son propuesta de banco, no configuración integrada ni firmware implementado.", "Una bocina de 4 Ω entre SPK+ y SPK−; ninguno va a GND. No conectar dos de 4 Ω en paralelo.", "VIN del amplificador no significa VIN del ESP32: la fuente de carga es independiente y pendiente de validar.", "GAIN y SD se configuran según el breakout real; no inventar puentes ni dejarlos al azar.", "Primero tono corto a bajo volumen; no conectar/soldar el altavoz con alimentación."],
    test: "Tono audible a bajo volumen sin reinicios ni calentamiento anormal; detener si aparece una anomalía. Aún sin ensayo físico.", firmware: "Driver/sketch de salida I²S pendiente; no cargar ambient_bench para este banco.", conflicts: "GPIO26 coincide con RST de TFT y relé; GPIO25 con LED y WS de micrófono. Aislar recetas.", sources: [audioSource],
  },
  {
    id: "pantalla", code: "M-02", title: "Pantalla · mascota", group: "Interfaz / audio", state: "Revisar VCC / BL",
    summary: "Reconstruir el mapa del prototipo existente, dejando NFC, PIR y relé desconectados.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "TFT ST7789", inventory: "D-04", shape: "screen" }],
    materials: ["D-04: TFT 1.54 ST7789 ×1", "B-01 o A-04: protoboard", "Cabecera ya visible; revisar conexiones y BL"], jumpers: "Hasta 16 M–H si las ocho redes pasan por protoboard; 0 H–H; BL condicionado",
    links: [link("ESP32 · GPIO14", "TFT · SCL / SCK"), link("ESP32 · GPIO23", "TFT · SDA / MOSI"), link("ESP32 · GPIO26", "TFT · RST"), link("ESP32 · GPIO27", "TFT · DC"), link("ESP32 · GPIO5", "TFT · CS"), link("ESP32 · GND", "TFT · GND", "ground"), link("Alimentación TFT · por definir", "TFT · VCC", "power", "Confirmar breakout D-04", true), link("Alimentación BL · por definir", "TFT · BL", "power", "Tensión / límite de corriente", true)],
    checks: ["SCL/SDA aquí son SPI, no I²C.", "VCC y BL de D-04 no se validan copiando la ficha de otra pantalla.", "No conectar BL a un GPIO sin confirmar consumo y adaptación.", "No compartir GPIO5 con PN532 ni GPIO27 con PIR."],
    test: "Animación del prototipo estable, orientación correcta y ausencia de reinicios; no demuestra MQTT.", firmware: "prototipo/mascota_claude_basica/main.ino existente; no compilado ni cargado en este cambio.", conflicts: "5, 23, 26, 27 y bus SPI se solapan con otras recetas.", sources: [chipSource],
  },
  {
    id: "microfono", code: "M-07A", title: "Micrófono digital", group: "Interfaz / audio", state: "Propuesta de banco I²S",
    summary: "INMP441 captura audio digital. Se prueba separado del amplificador y del sensor de sonido analógico.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "INMP441", inventory: "D-07", shape: "mic" }],
    materials: ["D-07: INMP441 ×1", "Cabecera y etiquetas reales por revisar", "B-01 o A-04: protoboard"], jumpers: "Referencia: hasta 11 M–H + 1 M–M mediante tiras; revisar terminales; 0 H–H",
    links: [link("ESP32 · 3V3", "INMP441 · VDD / VCC", "power", "3,3 V"), link("ESP32 · GND", "INMP441 · GND", "ground"), link("ESP32 · GPIO26", "INMP441 · SCK / BCLK", "signal", "Propuesta aislada"), link("ESP32 · GPIO25", "INMP441 · WS"), link("INMP441 · SD", "ESP32 · GPIO33"), link("INMP441 · L/R", "ESP32 · GND", "ground", "Canal izquierdo; no flotante")],
    checks: ["L/R fija canal, no es un dato GPIO ni salida hacia la bocina.", "SD del micrófono es salida de datos; SD del amplificador tiene otra función.", "Revisar desacoplo y tensión del módulo real; la ficha INMP441 no identifica su breakout.", "Estos GPIO son propuesta nueva de ensayo, no integración I²S implementada."],
    test: "Capturar muestras que cambien con voz/palmada y comprobar canal; no afirmar reconocimiento de voz ni dB calibrados.", firmware: "Sketch/driver de captura I²S pendiente.", conflicts: "GPIO25/26 coinciden con el banco de audio y otras funciones; no conectar ambos automáticamente.", sources: [{ title: "TDK · INMP441", url: "https://invensense.tdk.com/wp-content/uploads/2015/02/INMP441.pdf" }],
  },
  {
    id: "ruido", code: "M-06", title: "Sonido relativo · AO", group: "Ambiente / actuación", state: "Niveles pendientes",
    summary: "B-08 tiene AO/G/+/DO fotografiados. Es una entrada analógica relativa, no un sonómetro.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "Detector AO/DO", inventory: "B-08", shape: "mic" }],
    materials: ["B-08: detector ×1", "B-01 o A-04: protoboard", "Adaptación de señal si AO excede lógica admitida; no inventariada"], jumpers: "Redes mediante M–H y tiras; 0 H–H; adaptación todavía por determinar",
    links: [link("Alimentación B-08 · pendiente", "Detector · +", "power", "No asumir 5 V", true), link("Detector · G", "ESP32 · GND", "ground"), link("Detector · AO", "ESP32 · GPIO34 / ADC1", "signal", "Solo tras validar nivel o adaptar", true)],
    checks: ["DO se deja sin conectar; no se le asigna GPIO por inferencia.", "Si se alimenta a 5 V, AO/DO podrían exceder lo admitido por ESP32.", "No sustituir este módulo por INMP441: interfaces distintas."],
    test: "Comparar tres estímulos y rango ADC sin saturación; no presentar el valor como dB.", firmware: "Nodo integrado contempla AO34 opcional; perfil aislado y validación eléctrica pendientes.", conflicts: "GPIO34 es solo entrada en ESP32 clásico; no usarlo como salida.", sources: [{ title: "Joy-IT · referencia KY-038", url: "https://sensorkit.joy-it.net/en/sensors/ky-038" }, chipSource],
  },
  {
    id: "matriz", code: "M-08A", title: "Matriz 8 × 8", group: "Interfaz / audio", state: "Chip y adaptación pendientes",
    summary: "B-10 parece MAX7219; si se confirma a 5 V, la adaptación de señales se dibuja como requisito.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "Adaptación 3,3 → 5 V", inventory: "No inventariada", shape: "adapter" }, { name: "Matriz LED", inventory: "B-10", shape: "matrix" }],
    materials: ["B-10: una matriz ×1", "Chip por confirmar", "Buffer compatible, por ejemplo AHCT: no inventariado", "Fuente 5 V adecuada, pendiente"], jumpers: "No cerrar conteo hasta elegir adaptador y encapsulado; 0 H–H previsto",
    links: [link("ESP32 · GPIO13", "Adaptador · entrada DIN", "signal", "GPIO reservado en firmware", true), link("Adaptador · salida DIN", "Matriz · DIN", "signal", "Nivel 5 V compatible", true), link("ESP32 · GPIO14", "Adaptador · entrada CLK", "signal", undefined, true), link("Adaptador · salida CLK", "Matriz · CLK", "signal", undefined, true), link("ESP32 · GPIO15", "Adaptador · entrada CS", "signal", undefined, true), link("Adaptador · salida CS", "Matriz · CS", "signal", undefined, true), link("Fuente 5 V DC · +", "Matriz · VCC", "power", "Chip / fuente por validar", true), link("Fuente 5 V DC · +", "Adaptador · VCC", "power", "Según el buffer elegido", true), link("Matriz / adaptador · GND", "Fuente − / ESP32 GND", "ground")],
    checks: ["No puentear el adaptador: MAX7219 a 5 V no garantiza HIGH de 3,3 V.", "Pinout/OE del buffer se define al elegirlo; este bloque no es un circuito de adaptación terminado.", "Entrada DIN y salida DOUT pertenecen a una sola matriz; DOUT queda libre."],
    test: "Un patrón de baja luminosidad y barrido de LEDs, después de resolver chip, fuente y adaptación.", firmware: "GPIO13/14/15 reservados en comentarios; driver integrado no implementado.", conflicts: "GPIO14 coincide con SCK TFT; GPIO15 afecta arranque y exige revisión.", sources: [{ title: "Analog Devices · MAX7219", url: "https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf" }],
  },
  {
    id: "buzzer", code: "M-08B", title: "Buzzer", group: "Interfaz / audio", state: "Tipo y corriente pendientes",
    summary: "B-09 tiene polaridad + visible. No dibujar alimentación directa desde GPIO mientras se desconozca el consumo.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "Etapa de accionamiento", inventory: "Por dimensionar", shape: "adapter" }, { name: "Buzzer polarizado", inventory: "B-09", shape: "speaker" }],
    materials: ["B-09: buzzer ×1", "Tipo activo/pasivo, tensión y consumo por identificar", "Etapa de accionamiento/protección por dimensionar si corresponde"], jumpers: "Conteo pendiente del circuito de accionamiento; 0 H–H previsto",
    links: [link("ESP32 · GPIO17", "Etapa · control", "signal", "No directo a buzzer", true), link("Etapa · salida", "Buzzer · circuito de carga", "signal", "Circuito por dimensionar", true), link("Fuente adecuada · +", "Buzzer · +", "power", "Tensión/corriente pendientes", true), link("Etapa · referencia", "ESP32 / fuente · GND", "ground", "Según etapa elegida", true)],
    checks: ["No asumir buzzer activo ni usar tone() hasta identificarlo.", "Etapa, retorno de carga, resistencias y protección no están dimensionados: este esquema es funcional, no cableado ejecutable."],
    test: "Un aviso corto y controlado, solo tras cerrar el circuito y consumo.", firmware: "Nodo contempla GPIO17; no habilitarlo sobre el buzzer sin adaptar el hardware.", conflicts: "GPIO17 puede depender del módulo ESP32; no usar referencia WROVER sin revisar.", sources: [chipSource],
  },
  {
    id: "ventilador", code: "M-09", title: "Ventilador + relé", group: "Ambiente / actuación", state: "Potencia bloqueada",
    summary: "Fan D-05 de 5 V con un canal de B-11. Fuente de carga independiente; nunca alimentar el motor desde GPIO.",
    modules: [{ name: "ESP32", inventory: "A-01 o B-02", shape: "esp32" }, { name: "Relé canal 1", inventory: "B-11", shape: "relay" }, { name: "Fan 5 V", inventory: "D-05", shape: "fan" }],
    materials: ["D-05: fan 5 V ×1", "B-11: solo canal 1", "Fuente 5 V DC y conector de carga no validados", "Adaptación IN1 / jumper por confirmar"], jumpers: "Señales por M–H; potencia por cable/conector adecuado, no Dupont por defecto",
    links: [link("ESP32 · GPIO26", "Etapa compatible · entrada", "signal", "Adaptación IN1 pendiente", true), link("Etapa · salida", "Relé · IN1", "signal", "Lógica real por validar", true), link("Fuente 5 V DC · +", "Relé · VCC / JD-VCC", "power", "Configuración de jumper pendiente", true), link("Relé · GND", "Fuente 5 V DC · −", "ground"), link("ESP32 · GND", "Fuente 5 V DC · −", "ground", "Esquema sin aislamiento asumido"), link("Fuente 5 V DC · +", "Relé · COM1", "power", "Corriente / protección pendientes", true), link("Relé · NO1", "Ventilador · +", "power", "Contacto seco, no IN1", true), link("Ventilador · −", "Fuente 5 V DC · −", "ground")],
    checks: ["Faltan corriente de arranque, capacidad de fuente, conector/polaridad, trigger y estado seguro del relé.", "VCC/JD-VCC se define con la configuración real: no mover jumper energizado ni presumir aislamiento por ver optos.", "COM1/NO1 son contactos de carga; NC1 y canal 2 quedan sin uso.", "Solo baja tensión DC; no se conecta red eléctrica."],
    test: "ON/OFF y boot seguro sin reinicios después de resolver potencia y lógica. Todavía no apto para ensayo de carga.", firmware: "GPIO26 existe en nodo; perfil aislado con estado seguro pendiente.", conflicts: "GPIO26 coincide con RST TFT y propuesta BCLK I²S.", sources: [{ title: "TONG LING · familia relé", url: "https://denkovi.com/Documents/JQC-3FF-S-Z.pdf" }],
  },
  {
    id: "mqtt", code: "M-03", title: "Transporte y registro", group: "Preparación", state: "Flujo de software",
    summary: "Comprobar serial → MQTT → backend → web sin presentar datos sintéticos como mediciones reales.",
    modules: [{ name: "ESP32 / simulador", inventory: "Banco identificado", shape: "esp32" }, { name: "Laptop y servicios", inventory: "Software existente", shape: "computer" }],
    materials: ["Una placa identificada o simulador host", "Broker / backend / web de prueba"], jumpers: "Sin jumpers entre ESP32; transporte por red",
    links: [link("Banco identificado", "Monitor serial", "flow", "Observación local"), link("Emisor de prueba", "Broker MQTT", "flow", "classai/v1, sin secretos publicados"), link("Broker MQTT", "Backend / SQLite", "flow", "Ingesta"), link("Backend / API", "Panel web", "flow", "Estado y datos")],
    checks: ["El firmware base no es perfil sin sensores: deshabilitar también salidas e inicializaciones incompatibles.", "Dos nodos base con el mismo ROOM_ID colisionan en client ID; separar aulas de prueba o usar un emisor.", "No unir GPIO entre placas. La sincronización de sesión multinodo no está implementada."],
    test: "Comparar evento en cada tramo, config y reconexión; PubSubClient publica QoS 0, sin garantía de persistencia física.", firmware: "Perfil aislado de transporte pendiente; smoke de host existente no prueba hardware.", conflicts: "No habilita por sí solo tres nodos de una misma aula.", sources: [],
  },
];

const ambientMission = missions.find(m=>m.id === "ambiente")!;
for (const [id,code,title,part] of [["dht11","M-04","DHT11 aislado","DHT11"],["pir","M-05","PIR aislado","PIR"]]) {
  missions.push({...ambientMission,id:id!,code:code!,title:title!,summary:`Ensayo ${title} sin inicializar el otro sensor.`,modules:[ambientMission.modules[0]!,{name:part!,inventory:id==="dht11"?"B-03":"B-04 o D-06",shape:"sensor"}],materials:id==="dht11"?["B-03: DHT11 con pull-up integrado", "Protoboard y jumpers recibidos"]:["B-04 o D-06: un PIR identificado", "Protoboard y jumpers recibidos", "Fuente compatible pendiente"],links:ambientMission.links.filter(l=>`${l.from} ${l.to}`.includes(part!)),firmware:`ambient_bench, perfil ${id==="dht11"?"BENCH_DHT_ONLY":"BENCH_PIR_ONLY"}; Serial 115200.`});
}
missions.push({id:"leds",code:"M-01B",title:"LEDs de estado",group:"Preparación",state:"Diseño y sketch; ensayo físico pendiente",summary:"Rojo, amarillo y verde separados, cada uno con resistencia de 1 kΩ. Ensayo aislado.",modules:[{name:"ESP32",inventory:"A-01 por identificar",shape:"esp32"},{name:"Tres LEDs",inventory:"C-05 / B-06 / B-05",shape:"led"}],materials:["C-05 rojo", "B-06 amarillo", "B-05 verde", "C-01: tres resistencias de 1 kΩ; confirmar cantidad", "Protoboard y jumpers recibidos"],jumpers:"4 M–H + 3 M–M; cero H–H",links:[link("ESP32 · GPIO25","LED rojo · A","signal","1 kΩ en serie"),link("ESP32 · GPIO26","LED amarillo · A","signal","1 kΩ en serie"),link("ESP32 · GPIO27","LED verde · A","signal","1 kΩ en serie"),link("LEDs · K","ESP32 · GND","ground")],checks:["Confirmar tres resistencias libres y polaridad de cada LED.","USB desconectado al armar; A-01 identificada y respaldo preservado antes de carga."],test:benches.leds!.expected,firmware:"firmware/status_led_bench; comandos red/yellow/green/off.",conflicts:"GPIO26/27 compartidos con otros bancos; ensayos separados.",sources:[chipSource]});
missions.push({id:"iluminacion",code:"M-11",title:"Iluminación · material pendiente",group:"Ambiente / actuación",state:"Sin sensor recibido",summary:"No hay BH1750 ni LDR recibido en el inventario. Los LEDs son salidas, no sensores de lux.",modules:[{name:"Sensor de luz",inventory:"No recibido",shape:"sensor"}],materials:["Falta un sensor de iluminación identificado y su breakout; para #5 se requiere BH1750.","La posible LDR del kit pedido no está recibida ni mide lux sin caracterización."],jumpers:"Pendiente de identificar sensor; no reservar cables",links:[link("Sensor por recibir","ESP32 · interfaz por definir","signal","No conectar",true)],checks:["Confirmar recepción y variante antes de asignar VCC/GPIO o librería."],test:"Pendiente: respuesta a tres condiciones de iluminación con sensor identificado.",firmware:"Sin sketch de hardware no recibido.",conflicts:"No completar #5 ni generar lux sintéticos como evidencia física.",sources:[]});
for (const mission of missions) {
  const physical=benches[mission.id];
  if (!physical) continue;
  mission.physical=physical;
  if(mission.id==="dht11"||mission.id==="ambiente") {
    mission.materials=mission.materials.filter(m=>!m.includes("10 kΩ"));
    mission.links=mission.links.filter(l=>!l.via?.includes("pull-up"));
    mission.checks=mission.checks.filter(c=>!c.includes("pull-up incorporado"));
    mission.checks.push("Guía UTEC Anexo X: DHT11 de tres pines con pull-up integrado; sin resistencia externa. ESP32: alimentar a 3,3 V y cotejar +/OUT/−.");
  }
  if(mission.id==="ambiente"||mission.id==="pir") {
    mission.links=mission.links.map(l=>l.from==="ESP32 · VIN"?{...l,from:"ESP32 · VIN/5V",via:"5 V del USB solo si A-01 confirma ese pin",pending:true}:l);
    mission.materials=mission.materials.filter(m=>!m.toLowerCase().includes("fuente externa"));
    mission.checks=mission.checks.filter(s=>!s.includes("VIN no es salida regulada"));
    mission.checks.push("Sin fuente externa: identificar A-01 y confirmar que VIN/5V expone VBUS antes de alimentar el PIR.");
  }
  if(["matriz","buzzer","ventilador","pantalla","audio-salida"].includes(mission.id)) {
    const a=physical.assembly;
    const names:Record<string,string>={esp32:"ESP32",supply5:"Fuente 5 V DC",amp:"MAX98357A",speaker:"Bocina",matriz:"Matriz",ahct125:"SN74AHCT125N",relay:"Relé",fan:"Ventilador",tft:"TFT"};
    const label=(end:string)=>{if(end.startsWith("bb:"))return `Protoboard · ${end.slice(3)}`;const [part,pin]=end.split(":");const p=a.parts.find(p=>p.id===part)!;return `${names[p.definition]??p.id} · ${pin}`;};
    mission.modules=a.parts.map(p=>({name:`${p.id} · ${a.catalog.find(d=>d.id===p.definition)!.name}`,inventory:p.inventory,shape:p.definition}));
    mission.materials=a.parts.map(p=>`${p.id}: ${p.inventory}`);
    mission.summary=physical.action;
    mission.checks=physical.blockers;
    mission.test=physical.expected;
    mission.links=a.wires.map(w=>({from:label(w.from),to:label(w.to),kind:w.jumper==="altavoz"?"speaker":w.from.includes(":GPIO")||w.to.includes(":GPIO")?"signal":w.jumper==="potencia"||w.color==="red"||w.color==="orange"?"power":w.color==="black"?"ground":"signal",via:`${w.id} · ${w.jumper}`,pending:!!w.pending}));
    if(mission.id==="audio-salida")mission.conflicts="BCLK33/WS25/DIN22/SD21; perfil mínimo separado de micrófono, TFT y mascota de Lando. GAIN libre = 9 dB bajo referencia MAX98357A.";
    if(mission.id==="matriz")mission.conflicts="Referencia MAX7219 con SN74AHCT125N a 5 V; GPIO13/14/27, CS27 evita el pin de arranque GPIO15; ensayo aislado de PIR/TFT. DOUT no recibe datos del ESP32.";
    mission.sources.push({title:"Material de la U y criterios de armado",url:"https://github.com/joaquinsalinas06/ClassAI/blob/codex/physical-benches/docs/hardware/circuitos-referencia.md"});
  }
  if (mission.id!=="nfc") mission.state=physical.assembly.wires.some(w=>w.pending)||!physical.firmware?"Montaje parcial · no conectar cables marcados":"Diseño y sketch · ensayo físico pendiente";
  const wires=physical.assembly.wires;
  mission.jumpers=`${wires.filter(w=>w.jumper==="M–H" || (!w.jumper && !w.note.includes("M–M"))).length} M–H + ${wires.filter(w=>w.jumper==="M–M" || (!w.jumper && w.note.includes("M–M"))).length} M–M dibujados; cero H–H${wires.some(w=>w.jumper==="potencia")?`. ${wires.filter(w=>w.jumper==="potencia").length} tramos de potencia por bornera`:""}${wires.some(w=>w.jumper==="altavoz")?" y un par de altavoz":""}`;
  mission.checks=[...new Set([...mission.checks,...physical.blockers])];
  if(physical.firmware && mission.id!=="nfc") mission.firmware=`firmware/${physical.firmware}${physical.profile?` · perfil ${physical.profile}`:""}; compilar sin carga; Serial 115200. Ver guía física.`;
}
