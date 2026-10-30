import importlib.util
import io
from pathlib import Path
import sys
import wave

from fastapi.testclient import TestClient
import pytest

import api
import voice_api

AGENT = Path(__file__).resolve().parents[2] / 'tools/voice_agent'
sys.path.insert(0, str(AGENT))
from protocol import Decoder, encode  # noqa: E402
spec = importlib.util.spec_from_file_location('voice_agent', AGENT / 'agent.py')
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


def test_serial_resync_split_crc_and_bounds():
    decoder = Decoder()
    first, second = encode(1, 1, b'\0'*640), encode(1, 2, b'\1'*640)
    corrupt = bytearray(first)
    corrupt[20] ^= 1
    assert decoder.feed(b'boot text' + first[:100]) == []
    frames = decoder.feed(first[100:] + corrupt + second)
    assert [(kind, seq) for kind, seq, _ in frames] == [(1, 1), (1, 2)]
    assert decoder.errors > 0 and not decoder.buffer
    with pytest.raises(ValueError):
        encode(2, 1, b'x'*1281)


def test_wake_gates_audio_limits_query_and_ignores_playback():
    calls = []
    interaction = agent.Interaction(lambda frame: calls.append(frame) or .9)
    pcm = b'\0'*640
    for _ in range(3):
        assert interaction.feed(pcm) is None
    assert interaction.state == 'idle'
    interaction.feed(pcm)
    assert interaction.state == 'listening' and len(calls) == 1
    result = None
    for _ in range(50):
        result = interaction.feed(pcm)
    assert result == b'\0'*(50*640) and interaction.state == 'processing'
    assert interaction.feed(pcm) is None
    interaction.state = 'speaking'
    for _ in range(100):
        assert interaction.feed(pcm) is None
    assert len(calls) == 1
    interaction.reset()
    assert interaction.state == 'idle' and not interaction.query


def test_wav_limits_and_voice_auth_without_paid_calls(monkeypatch):
    pcm = b'\0'*3200
    valid = agent.wav_query(pcm)
    voice_api.validate_wav(valid)
    with pytest.raises(Exception):
        voice_api.validate_wav(b'invalid')
    monkeypatch.setenv('VOICE_API_KEY', 'test-only')
    monkeypatch.setattr(voice_api, 'process_voice', lambda content, room: valid)
    # No lifespan/broker required by this endpoint.
    client = TestClient(api.app)
    assert client.post('/assistant/voice', content=valid).status_code == 401
    response = client.post('/assistant/voice', content=valid, headers={'X-Voice-Key': 'test-only'})
    assert response.status_code == 200 and response.content == valid
    assert response.headers['cache-control'] == 'no-store'
    assert client.post('/assistant/voice', content=b'x'*(voice_api.MAX_WAV+1), headers={'X-Voice-Key': 'test-only'}).status_code == 413


def test_response_resamples_to_stereo_driver_rate():
    target = io.BytesIO()
    with wave.open(target, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(22050)
        wav.writeframes(b'\0'*4410)
    result = agent.response_pcm(target.getvalue())
    assert len(result) == 6400 and result == b'\0'*6400
