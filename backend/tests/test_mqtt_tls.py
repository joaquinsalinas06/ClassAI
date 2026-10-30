"""Opt-in real TLS broker test with temporary certificates and synthetic passwords."""
import json
import os
from pathlib import Path
import shutil
import socket
import secrets
import ssl
import subprocess
import threading
import time

import paho.mqtt.client as mqtt
import pytest

from test_mqtt_integration import wait_for

pytestmark = pytest.mark.skipif(os.getenv('CLASSAI_MQTT_SMOKE') != '1', reason='run scripts/ci/smoke.sh')


def test_tls_and_role_acl(tmp_path):
    for executable in ('openssl', 'mosquitto', 'mosquitto_passwd'):
        assert shutil.which(executable), f'Install {executable}'
    def run(*args):
        subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    key, cert = tmp_path/'server.key', tmp_path/'server.crt'
    run('openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
        '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', str(key), '-out', str(cert))
    auth_path = tmp_path.joinpath('credentials')
    access_pass = secrets.token_urlsafe(24)
    ingest_pass = secrets.token_urlsafe(24)
    run('mosquitto_passwd', '-b', '-c', str(auth_path), 'a101-access', access_pass)
    run('mosquitto_passwd', '-b', str(auth_path), 'classai-ingest', ingest_pass)
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    acl = Path(__file__).resolve().parents[2]/'deploy/mosquitto.acl'
    config = tmp_path/'mosquitto.conf'
    config.write_text(f'listener {port} 127.0.0.1\nallow_anonymous false\ncertfile {cert}\nkeyfile {key}\npassword_file {auth_path}\nacl_file {acl}\npersistence false\n')
    broker = subprocess.Popen(['mosquitto', '-c', str(config)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    clients = []
    try:
        def available():
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.2):
                    return True
            except OSError:
                return False
        wait_for(available, [broker])
        received = []
        subscriptions = []
        for username, password in [('classai-ingest', ingest_pass), ('a101-access', access_pass)]:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='tls-'+username)
            client.username_pw_set(username, password)
            client.tls_set(ca_certs=str(cert))
            ready = threading.Event()
            client.on_connect = lambda client, userdata, flags, reason, props, ready=ready: ready.set() if not reason.is_failure else None
            client.on_message = lambda client, userdata, message: received.append((client._client_id.decode(), message.topic, message.payload))
            client.connect('127.0.0.1', port)
            client.loop_start()
            clients.append(client)
            wait_for(ready.is_set, [broker])
            sub = threading.Event()
            client.on_subscribe = lambda *args, sub=sub: sub.set()
            client.subscribe('classai/v1/a101/#', 1)
            wait_for(sub.is_set, [broker])
            subscriptions.append(sub)
        ingest, access = clients
        access.publish('classai/v1/a101/nodes/a101-access/ack', 'forged', qos=1).wait_for_publish(5)
        access.publish('classai/v1/a101/nodes/a101-access/status', json.dumps({'status':'online'}), qos=1).wait_for_publish(5)
        wait_for(lambda: any(topic.endswith('/status') for _, topic, _ in received), [broker])
        assert not any(payload == b'forged' for _, _, payload in received)
        ingest.publish('classai/v1/a101/nodes/a101-access/ack', 'legitimate', qos=1).wait_for_publish(5)
        wait_for(lambda: any(name == 'tls-a101-access' and payload == b'legitimate' for name, _, payload in received), [broker])
        # System trust must reject our private test CA, not silently downgrade.
        with pytest.raises(ssl.SSLCertVerificationError):
            with socket.create_connection(('127.0.0.1', port)) as connection:
                ssl.create_default_context().wrap_socket(connection, server_hostname='localhost')
    finally:
        for client in clients:
            client.disconnect()
            client.loop_stop()
        broker.terminate()
        broker.wait(5)
