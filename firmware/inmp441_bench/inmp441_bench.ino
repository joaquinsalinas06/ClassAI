// D-07 INMP441 RX only: L/R=GND (left); verify actual breakout before wiring.
#include <Arduino.h>
#include <driver/i2s_std.h>
#include "sample_stats.h"
constexpr int MIC_BCLK = 26, MIC_WS = 25, MIC_SD = 33;
constexpr uint32_t SAMPLE_RATE = 16000;
i2s_chan_handle_t rx = nullptr;
bool ready = false;
uint32_t reportAt = 0;
SampleStats stats;
void setup() {
  Serial.begin(115200);
  i2s_chan_config_t channel = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO, I2S_ROLE_MASTER);
  esp_err_t error = i2s_new_channel(&channel, nullptr, &rx);
  if(error == ESP_OK) {
    i2s_std_config_t config = {};
    config.clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE);
    config.slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO);
    config.gpio_cfg.mclk = I2S_GPIO_UNUSED;
    config.gpio_cfg.bclk = static_cast<gpio_num_t>(MIC_BCLK);
    config.gpio_cfg.ws = static_cast<gpio_num_t>(MIC_WS);
    config.gpio_cfg.dout = I2S_GPIO_UNUSED;
    config.gpio_cfg.din = static_cast<gpio_num_t>(MIC_SD);
    error = i2s_channel_init_std_mode(rx, &config);
    if(error == ESP_OK) error = i2s_channel_enable(rx);
  }
  ready = error == ESP_OK;
  if(!ready && rx) { i2s_del_channel(rx); rx = nullptr; }
  Serial.printf("INMP441 RX BCLK26 WS25 SD33 LR=GND; 16000 Hz, stereo slots 32 bits, left slot used; init=%d\n",error);
  reportAt = millis();
}
void loop() {
  if(!ready) { delay(100); return; }
  int32_t words[128]; size_t bytes = 0;
  const esp_err_t error = i2s_channel_read(rx, words, sizeof(words), &bytes, 50);
  if(error != ESP_OK || bytes == 0 || bytes % (2*sizeof(int32_t)) != 0) {
    Serial.printf("{\"valid\":false,\"error\":%d,\"bytes\":%u}\n",error,static_cast<unsigned>(bytes));
    delay(50); return;
  }
  // Full stereo frames maintain 64 clocks/frame; discard unselected right slot.
  for(size_t i=0;i<bytes/sizeof(int32_t);i+=2) stats.add(words[i]);
  if(millis()-reportAt >= 500) {
    Serial.printf("{\"valid\":true,\"samples\":%lu,\"rms_rel\":%.6f,\"peak_to_peak_rel\":%.6f,\"silent_or_disconnected\":%s}\n",static_cast<unsigned long>(stats.count),stats.rms(),stats.peakToPeak(),stats.minimum==0&&stats.maximum==0?"true":"false");
    stats = {}; reportAt = millis();
  }
}
