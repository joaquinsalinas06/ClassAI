"""Explicit local provisioning, never run by CI or on import. Does not deploy."""
import argparse
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import os


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--web-host', required=True)
    parser.add_argument('--mqtt-host', required=True)
    args = parser.parse_args()
    for name in (args.web_host, args.mqtt_host):
        if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{0,250}', name):
            parser.error('hostnames must be lowercase DNS names')
    root = Path(__file__).resolve().parent
    if (root / '.env').exists() or (root / '.secrets').exists():
        parser.error('refusing to overwrite existing credentials')
    if not shutil.which('openssl') or not shutil.which('mosquitto_passwd'):
        parser.error('install openssl and mosquitto_passwd first')
    os.umask(0o077)
    private = root / '.secrets'
    mqtt = private / 'mqtt'
    mqtt.mkdir(parents=True)

    def run(*command):
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    run('openssl', 'req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-days', '365',
        '-subj', '/CN=ClassAI private CA', '-keyout', str(private / 'ca.key'), '-out', str(mqtt / 'ca.crt'))
    run('openssl', 'req', '-newkey', 'rsa:3072', '-nodes', '-subj', f'/CN={args.mqtt_host}',
        '-keyout', str(mqtt / 'server.key'), '-out', str(private / 'server.csr'))
    extension = private / 'server.ext'
    extension.write_text(f'subjectAltName=DNS:{args.mqtt_host},DNS:broker\nextendedKeyUsage=serverAuth\n')
    run('openssl', 'x509', '-req', '-in', str(private / 'server.csr'), '-CA', str(mqtt / 'ca.crt'),
        '-CAkey', str(private / 'ca.key'), '-CAcreateserial', '-days', '90',
        '-extfile', str(extension), '-out', str(mqtt / 'server.crt'))
    passwords = {user: secrets.token_urlsafe(32) for user in
                 ('a101-access', 'a101-environment', 'a101-assistant', 'classai-ingest', 'classai-api')}
    auth_path = mqtt.joinpath('passwd')
    auth_path.write_text(''.join(f'{user}:{password}\n' for user, password in passwords.items()))
    run('mosquitto_passwd', '-U', str(auth_path))
    for file in mqtt.iterdir():
        file.chmod(0o640)
    (mqtt / 'ca.crt').chmod(0o644)
    mqtt.chmod(0o750)
    private.chmod(0o755)  # Traversal only; CA key and device credentials stay 0600.
    (private / 'device-passwords.txt').write_text(''.join(f'{user}={passwords[user]}\n' for user in passwords if user.startswith('a101-')))
    (root / '.env').write_text(
        f'WEB_HOST={args.web_host}\nMQTT_INGEST_PASSWORD={passwords["classai-ingest"]}\n'
        f'MQTT_API_PASSWORD={passwords["classai-api"]}\nADMIN_API_KEY={secrets.token_urlsafe(32)}\n'
        f'VOICE_API_KEY={secrets.token_urlsafe(32)}\nSPEECH_BASE_URL=http://speech:8090\n'
        'DEEPSEEK_API_KEY=\nDEEPSEEK_MODEL=\nLLM_BASE_URL=https://api.deepseek.com\n')
    print('Private configuration prepared. No deployment performed. See deploy/README.md for ownership and startup.')


if __name__ == '__main__':
    main()
