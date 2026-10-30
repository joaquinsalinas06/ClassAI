// Viewed from the component side, antenna above and USB below.
export const devkit30 = {
  left: ["EN", "GPIO36", "GPIO39", "GPIO34", "GPIO35", "GPIO32", "GPIO33", "GPIO25", "GPIO26", "GPIO27", "GPIO14", "GPIO12", "GPIO13", "GND_L", "VIN"],
  right: ["GPIO23", "GPIO22", "GPIO1", "GPIO3", "GPIO21", "GPIO19", "GPIO18", "GPIO5", "GPIO17", "GPIO16", "GPIO4", "GPIO2", "GPIO15", "GND", "3V3"],
};
// PN532 V3 manual p. 2, component face rotated 90° counterclockwise: SPI edge at left.
export const pn532SpiFrontCCW = ["RSTO", "IRQ", "GND", "VCC", "SS", "MOSI", "MISO", "SCK"];

// Official DevKitC V4 header labels, J2 / J3, pins 1–19. Not an identification of E-01.
export const devkit38 = {
  left: ["3V3", "EN", "VP", "VN", "IO34", "IO35", "IO32", "IO33", "IO25", "IO26", "IO27", "IO14", "IO12", "GND", "IO13", "D2", "D3", "CMD", "5V"],
  right: ["GND", "IO23", "IO22", "TX", "RX", "IO21", "GND", "IO19", "IO18", "IO5", "IO17", "IO16", "IO4", "IO0", "IO2", "IO15", "D1", "D0", "CLK"],
};
export const silkscreen30 = (id: string) => ({ GPIO36: "VP", GPIO39: "VN", GPIO1: "TX0", GPIO3: "RX0", GPIO17: "TX2", GPIO16: "RX2", GND_L: "GND" }[id] ?? id.replace("GPIO", "D"));

export const devkit38GPIO = {
  left: devkit38.left.map(id => id === "GND" ? "GND_L" : id === "5V" ? "VIN" : id === "VP" ? "GPIO36" : id === "VN" ? "GPIO39" : id.replace(/^IO/, "GPIO")),
  right: devkit38.right.map((id,i) => id === "GND" ? (i === 0 ? "GND" : "GND2") : id === "TX" ? "GPIO1" : id === "RX" ? "GPIO3" : id.replace(/^IO/, "GPIO")),
};
