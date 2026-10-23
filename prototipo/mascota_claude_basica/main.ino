
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

// Pines que ya conectaste
#define TFT_CS    5
#define TFT_DC    27
#define TFT_RST   26
#define TFT_SCLK  14
#define TFT_MOSI  23

Adafruit_ST7789 tft =
  Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);

// Lienzo para evitar parpadeos
GFXcanvas16 lienzo(192, 192);

// Colores RGB565
const uint16_t FONDO = 0xFFFF;
const uint16_t NARANJA = 0xDBAA;
const uint16_t NEGRO = 0x0000;
const uint16_t GRIS = 0x8410;

const int PIXEL = 12;
unsigned long ultimoFrame = 0;

// Estados de Clawd
enum Estado {
  NORMAL,
  SALUDANDO,
  PENSANDO,
  FELIZ,
  DURMIENDO,
  SALTANDO
};

// Dibujar ojos
void dibujarOjos(int x, int y, Estado estado,
                 bool parpadeo) {
  int s = PIXEL;
  int izq = x + 5 * s;
  int der = x + 10 * s;
  int altura = y + 3 * s;

  if (estado == FELIZ) {
    // Ojos felices > <
    for (int i = 0; i < 3; i++) {
      lienzo.drawLine(
        izq, altura + i,
        izq + s, altura + s / 2 + i,
        NEGRO
      );
      lienzo.drawLine(
        izq + s, altura + s / 2 + i,
        izq, altura + s + i,
        NEGRO
      );

      lienzo.drawLine(
        der + s, altura + i,
        der, altura + s / 2 + i,
        NEGRO
      );
      lienzo.drawLine(
        der, altura + s / 2 + i,
        der + s, altura + s + i,
        NEGRO
      );
    }
  }
  else if (parpadeo || estado == DURMIENDO) {
    lienzo.fillRect(
      izq, altura + 5, s, 3, NEGRO
    );
    lienzo.fillRect(
      der, altura + 5, s, 3, NEGRO
    );
  }
  else {
    lienzo.fillRect(
      izq, altura, s, s, NEGRO
    );
    lienzo.fillRect(
      der, altura, s, s, NEGRO
    );
  }
}

// Dibujar mascota Clawd
void dibujarClawd(Estado estado, int dx, int dy,
                  bool parpadeo) {
  lienzo.fillScreen(FONDO);

  int s = PIXEL;
  int x = dx;
  int y = 12 + dy;

  // Cabeza
  lienzo.fillRect(
    x + 3*s, y + s,
    10*s, 3*s, NARANJA
  );

  // Cuerpo
  lienzo.fillRect(
    x + 2*s, y + 3*s,
    12*s, 6*s, NARANJA
  );

  // Brazo izquierdo
  lienzo.fillRect(
    x, y + 4*s,
    2*s, 3*s, NARANJA
  );

  // Brazo derecho animado
  if (estado == SALUDANDO) {
    int movimiento = (millis() / 220) % 2;
    lienzo.fillRect(
      x + 14*s,
      y + (movimiento ? s : 2*s),
      2*s, 3*s, NARANJA
    );
  } else {
    lienzo.fillRect(
      x + 14*s, y + 4*s,
      2*s, 3*s, NARANJA
    );
  }

  // Cuatro patas
  for (int i = 0; i < 4; i++) {
    lienzo.fillRect(
      x + (3 + i*3)*s,
      y + 9*s,
      2*s, 3*s,
      NARANJA
    );
  }

  dibujarOjos(x, y, estado, parpadeo);

  // Detalles según estado
  if (estado == PENSANDO) {
    lienzo.fillCircle(
      170, 15, 3, GRIS
    );
    lienzo.fillCircle(
      180, 9, 5, GRIS
    );
  }

  if (estado == DURMIENDO) {
    lienzo.setTextColor(GRIS);
    lienzo.setTextSize(2);
    lienzo.setCursor(165, 7);
    lienzo.print("Z");
  }

  // Nombre de la mascota
  lienzo.setTextColor(NEGRO);
  lienzo.setTextSize(2);
  lienzo.setCursor(66, 168);
  lienzo.print("Clawd");
}

void setup() {
  Serial.begin(115200);

  SPI.begin(
    TFT_SCLK, -1, TFT_MOSI, TFT_CS
  );

  tft.init(240, 240);
  tft.setRotation(0);
  tft.fillScreen(ST77XX_WHITE);

  if (lienzo.getBuffer() == nullptr) {
    Serial.println("Error: memoria insuficiente");
    while (true) delay(1000);
  }

  Serial.println("Clawd iniciado");
}

void loop() {
  unsigned long ahora = millis();

  // Aproximadamente 10 FPS
  if (ahora - ultimoFrame < 100) {
    return;
  }
  ultimoFrame = ahora;

  unsigned long tiempo = ahora % 17500UL;

  Estado estado = NORMAL;
  int dx = 0;
  int dy = 0;

  if (tiempo < 4500) {
    estado = NORMAL;
    int fase = (ahora / 220) % 4;
    dy = (fase == 1 || fase == 3) ? -2 :
         (fase == 2 ? -4 : 0);
  }
  else if (tiempo < 7500) {
    estado = SALUDANDO;
    dx = (ahora / 250) % 2 ? 2 : -2;
  }
  else if (tiempo < 11000) {
    estado = PENSANDO;
  }
  else if (tiempo < 13000) {
    estado = FELIZ;
    dy = (ahora / 180) % 2 ? -5 : 0;
  }
  else if (tiempo < 15500) {
    estado = DURMIENDO;
    dy = 3;
  }
  else {
    estado = SALTANDO;
    int paso = (ahora / 110) % 6;
    int salto[6] = {0, -5, -12, -18, -12, -5};
    dy = salto[paso];
  }

  // Parpadeo automático
  bool parpadeo =
    (ahora % 2900UL) < 180;

  dibujarClawd(
    estado, dx, dy, parpadeo
  );

  // Enviar fotograma a pantalla
  tft.drawRGBBitmap(
    24, 24,
    lienzo.getBuffer(),
    192, 192
  );
}
