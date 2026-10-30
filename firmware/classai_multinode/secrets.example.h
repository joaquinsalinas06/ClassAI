#pragma once
#define WIFI_SSID "example-network"
#define WIFI_PASSWORD "replace-locally"
#define MQTT_HOST "mqtt.example.invalid"
#define MQTT_PORT 8883
#define MQTT_USER "a101-access" // must match the selected role
#define MQTT_PASSWORD "replace-locally"
#define ROOM_ID "a101"
#define MQTT_TLS 1
// Replace with your CA PEM; no insecure certificate fallback.
static const char MQTT_ROOT_CA[] = "-----BEGIN CERTIFICATE-----\nREPLACE_WITH_CA\n-----END CERTIFICATE-----\n";
// Enable each branch only after its actual circuit/supply has been reviewed.
#define MATRIX_VALIDATED 0
#define BUZZER_VALIDATED 0
#define RELAY_VALIDATED 0
#define AMPLIFIER_VALIDATED 0
#define RELAY_ON_LEVEL LOW // LOW-trigger direct interface; change only for a verified driver.
#define BUZZER_PASSIVE 0
