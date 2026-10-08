-- Migración única e idempotente: copia temperature_minutes (MLX90614 legado) a sensor_minutes.
-- Requiere que schema.sql ya se haya aplicado (basta con arrancar backend.py una vez).
-- Uso: python -c "import sqlite3; sqlite3.connect('data/mlx90614.db').executescript(open('migrate_legacy.sql').read())"
-- INSERT OR IGNORE: los minutos que el backend nuevo ya escribió no se tocan.
INSERT OR IGNORE INTO sensor_minutes (room, device, metric, minute_utc, samples, min, max, avg)
SELECT 'legacy', 'mlx90614-legacy', 'temp_c', minute_utc, samples, ambient_min, ambient_max, ambient_avg
FROM temperature_minutes;

INSERT OR IGNORE INTO sensor_minutes (room, device, metric, minute_utc, samples, min, max, avg)
SELECT 'legacy', 'mlx90614-legacy', 'ir_object_c', minute_utc, samples, object_min, object_max, object_avg
FROM temperature_minutes;
