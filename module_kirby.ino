#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <TJpg_Decoder.h>
#include <driver/i2s.h>
#include <sixseven_inferencing.h>
#include "audio_data.h"
#include "src/video_data.h"
#include "src/alert_data.h"

#define TFT_CS   5
#define TFT_DC   27
#define TFT_RST  26
#define TFT_MOSI 23
#define TFT_SCLK 14

#define MIC_SCK  18
#define MIC_WS   19
#define MIC_SD   34
#define MIC_PORT I2S_NUM_0

#define I2S_BCLK 33
#define I2S_LRC  25
#define I2S_DIN  22
#define AMP_SD   21
#define AMP_PORT I2S_NUM_1

#define MIC_SHIFT     16    // 12 = más sensible, 16 = menos
#define UMBRAL        0.95f   // probabilidad mínima de sixseven
#define HITS_NEEDED   1       // ventanas seguidas que deben superar el umbral
#define VOLUME        70      // volumen del audio, 0 a 100
#define AUDIO_SECONDS 10      // duración del audio (y del clip en pantalla)
#define COOLDOWN_MS   1500    // pausa tras el audio antes de volver a detectar
#define VIDEO_FPS     12
#define MIN_PEAK 800   

SPIClass spiTFT(VSPI);
Adafruit_ST7789 tft(&spiTFT, TFT_CS, TFT_DC, TFT_RST);

static int16_t *sampleBuf[2];
static volatile uint8_t bufSel = 0;
static volatile bool bufReady = false;
static uint32_t bufCount = 0;
static uint8_t readBuf = 0;
static volatile bool playing = false;
static volatile bool alertOn = false;
static volatile uint32_t alertFrame = 0;

bool tftOutput(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap) {
  if (y >= tft.height()) return false;
  tft.drawRGBBitmap(x, y, bitmap, w, h);
  return true;
}

void initMic() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = EI_CLASSIFIER_FREQUENCY;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 256;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = MIC_SCK;
  pins.ws_io_num = MIC_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = MIC_SD;

  i2s_driver_install(MIC_PORT, &cfg, 0, NULL);
  i2s_set_pin(MIC_PORT, &pins);
}

void initAmp() {
  pinMode(AMP_SD, OUTPUT);
  digitalWrite(AMP_SD, HIGH);

  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX);
  cfg.sample_rate = AUDIO_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = 512;
  cfg.tx_desc_auto_clear = true;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = I2S_BCLK;
  pins.ws_io_num = I2S_LRC;
  pins.data_out_num = I2S_DIN;
  pins.data_in_num = I2S_PIN_NO_CHANGE;

  i2s_driver_install(AMP_PORT, &cfg, 0, NULL);
  i2s_set_pin(AMP_PORT, &pins);
}

void captureTask(void*) {
  int32_t raw[256];
  size_t bytes;
  while (true) {
    i2s_read(MIC_PORT, raw, sizeof(raw), &bytes, portMAX_DELAY);
    int n = bytes / 4;
    for (int i = 0; i < n; i++) {
      int32_t s = raw[i] >> MIC_SHIFT;
      if (s > 32767) s = 32767;
      if (s < -32768) s = -32768;
      sampleBuf[bufSel][bufCount++] = (int16_t)s;
      if (bufCount >= EI_CLASSIFIER_SLICE_SIZE) {
        bufCount = 0;
        bufSel ^= 1;
        bufReady = true;
      }
    }
  }
}

void audioTask(void*) {
  int16_t out[512];
  size_t w;
  uint32_t total = (uint32_t)AUDIO_RATE * AUDIO_SECONDS;
  if (total > AUDIO_LEN) total = AUDIO_LEN;
  for (uint32_t i = 0; i < total; ) {
    uint32_t left = total - i;
    int cnt = left < 256 ? left : 256;
    for (int k = 0; k < cnt; k++) {
      int16_t s = (int32_t)audioData[i + k] * VOLUME / 100;
      out[2 * k] = s;
      out[2 * k + 1] = s;
    }
    i2s_write(AMP_PORT, out, cnt * 4, &w, portMAX_DELAY);
    i += cnt;
  }
  memset(out, 0, sizeof(out));
  for (int j = 0; j < 16; j++) i2s_write(AMP_PORT, out, 1024, &w, portMAX_DELAY);
  playing = false;
  vTaskDelete(NULL);
}

void videoTask(void*) {
  uint32_t frame = 0;
  const uint32_t period = 1000 / VIDEO_FPS;
  while (true) {
    uint32_t t0 = millis();
    if (alertOn) {
      uint32_t f = alertFrame;
      TJpgDec.drawJpg(0, 0, alertData + alertOffsets[f],
                      alertOffsets[f + 1] - alertOffsets[f]);
      alertFrame = (f + 1) % ALERT_FRAMES;
    } else {
      TJpgDec.drawJpg(0, 0, videoData + videoOffsets[frame],
                      videoOffsets[frame + 1] - videoOffsets[frame]);
      frame = (frame + 1) % VIDEO_FRAMES;
    }
    uint32_t dt = millis() - t0;
    delay(dt < period ? period - dt : 1);
  }
}

static int getData(size_t offset, size_t length, float *out) {
  numpy::int16_to_float(&sampleBuf[readBuf][offset], out, length);
  return 0;
}

void setup() {
  Serial.begin(115200);

  spiTFT.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
  tft.init(240, 240);
  tft.setRotation(0);
  tft.fillScreen(ST77XX_BLACK);

  TJpgDec.setJpgScale(1);
  TJpgDec.setSwapBytes(false);
  TJpgDec.setCallback(tftOutput);

  sampleBuf[0] = (int16_t*)malloc(EI_CLASSIFIER_SLICE_SIZE * sizeof(int16_t));
  sampleBuf[1] = (int16_t*)malloc(EI_CLASSIFIER_SLICE_SIZE * sizeof(int16_t));
  if (!sampleBuf[0] || !sampleBuf[1]) {
    Serial.println("Sin memoria para buffers");
    while (true) delay(1000);
  }

  initAmp();
  run_classifier_init();
  initMic();
  xTaskCreatePinnedToCore(captureTask, "capture", 4096, NULL, 2, NULL, 0);
  xTaskCreatePinnedToCore(videoTask, "video", 8192, NULL, 1, NULL, 0);
  Serial.println("Escuchando...");
}

void loop() {
  static int hits = 0;
  static bool showing = false;
  static uint32_t blockUntil = 0;

  while (!bufReady) delay(1);
  bufReady = false;
  readBuf = bufSel ^ 1;

  int peak = 0;
  for (size_t i = 0; i < EI_CLASSIFIER_SLICE_SIZE; i++) {
    int a = abs(sampleBuf[readBuf][i]);
    if (a > peak) peak = a;
  }

  signal_t signal;
  signal.total_length = EI_CLASSIFIER_SLICE_SIZE;
  signal.get_data = &getData;
  ei_impulse_result_t result = {};
  if (run_classifier_continuous(&signal, &result, false) != EI_IMPULSE_OK) return;

  float p67 = 0;
  for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    if (strcmp(result.classification[i].label, "sixseven") == 0) {
      p67 = result.classification[i].value;
    }
  }
  Serial.printf("sixseven: %.2f  pico: %d\n", p67, peak);

  if (showing) {
    if (!playing) {
      showing = false;
      hits = 0;
      blockUntil = millis() + COOLDOWN_MS;
      alertOn = false;
    }
    return;
  }

  hits = (p67 > UMBRAL && peak > MIN_PEAK && millis() > blockUntil) ? hits + 1 : 0;
  if (hits >= HITS_NEEDED) {
    Serial.printf("DETECTADO p=%.2f pico=%d\n", p67, peak);
    showing = true;
    playing = true;
    alertFrame = 0;
    alertOn = true;
    xTaskCreatePinnedToCore(audioTask, "audio", 4096, NULL, 1, NULL, 0);
  }
}
