"""USB capture -> local wake word -> bounded HTTPS request -> USB playback.
Run in a separate Python 3.11 environment; the backend never imports ML dependencies.
"""
import argparse
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import io
import os
import re
import struct
import time
import wave

from protocol import Decoder, encode


class Interaction:
    def __init__(self, predict, threshold=.65):
        self.predict = predict
        self.threshold = threshold
        self.state = 'idle'
        self.frames = bytearray()
        self.query = bytearray()
        self.silent = 0
        self.elapsed = 0
        self.background = deque(maxlen=10)

    def feed(self, pcm):
        if self.state not in ('idle', 'listening'):
            return None
        if len(pcm) != 640:
            self.reset()
            return None
        self.frames.extend(pcm)
        samples = struct.unpack('<320h', pcm)
        rms = (sum(value * value for value in samples) / 320) ** .5
        if self.state == 'idle':
            self.background.append(rms)
            if len(self.frames) >= 2560:
                score = self.predict(bytes(self.frames[:2560]))
                del self.frames[:2560]
                if score >= self.threshold:
                    self.state = 'listening'
                    self.query.clear()
                    self.elapsed = self.silent = 0
        else:
            self.frames.clear()
            self.query.extend(pcm)
            self.elapsed += 1
            floor = max(200, (sum(self.background) / max(1, len(self.background))) * 1.5)
            self.silent = self.silent + 1 if rms < floor else 0
            if self.elapsed >= 750 or (self.elapsed >= 50 and self.silent >= 50):
                self.state = 'processing'
                return bytes(self.query)
        return None

    def reset(self):
        self.state = 'idle'
        self.frames.clear()
        self.query.clear()
        self.background.clear()
        self.elapsed = self.silent = 0


def wav_query(pcm):
    target = io.BytesIO()
    with wave.open(target, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(pcm)
    return target.getvalue()


def response_pcm(content):
    import numpy as np
    with wave.open(io.BytesIO(content), 'rb') as wav:
        if wav.getsampwidth() != 2 or wav.getnchannels() not in (1, 2) or not 8000 <= wav.getframerate() <= 48000:
            raise ValueError('unsupported response WAV')
        if wav.getnframes() / wav.getframerate() > 60:
            raise ValueError('response exceeds 60 seconds')
        audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float64)
        if wav.getnchannels() == 2:
            audio = audio.reshape(-1, 2).mean(axis=1)
        if not len(audio):
            raise ValueError('empty response')
        frames = round(len(audio) * 32000 / wav.getframerate())
        output = np.interp(np.arange(frames) * wav.getframerate() / 32000, np.arange(len(audio)), audio)
        return output.clip(-32768, 32767).astype('<i2').tobytes()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', required=True, help='Explicit port of E-01, never autodetected')
    parser.add_argument('--wake-model', required=True, help='Path to an installed pretrained ONNX wake model')
    parser.add_argument('--server', required=True, help='HTTPS API base, including /api')
    parser.add_argument('--room', default='a101')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]{1,32}', args.room):
        parser.error('invalid room')
    if not args.server.startswith('https://'):
        parser.error('server must use HTTPS')
    key = os.environ.get('CLASSAI_VOICE_KEY')
    if not key:
        parser.error('set CLASSAI_VOICE_KEY outside the repository')
    import numpy as np
    import requests
    import serial
    from openwakeword.model import Model
    model = Model(wakeword_models=[args.wake_model], inference_framework='onnx')
    interaction = Interaction(lambda pcm: max(model.predict(np.frombuffer(pcm, dtype='<i2')).values(), default=0))
    decoder = Decoder()
    future = None
    playback = b''
    offset = 0
    last_capture = last_heartbeat = 0
    last_sequence = None
    sequence = 0
    next_audio = 0
    cooldown = 0

    def query(pcm):
        with requests.post(args.server.rstrip('/') + '/assistant/voice?room=' + args.room, data=wav_query(pcm),
                           headers={'Content-Type': 'audio/wav', 'X-Voice-Key': key}, timeout=(10, 180), stream=True) as reply:
            reply.raise_for_status()
            content = bytearray()
            for part in reply.iter_content(8192):
                content.extend(part)
                if len(content) > 4_000_000:
                    raise ValueError('oversized voice response')
        return response_pcm(bytes(content))

    with serial.Serial(args.port, 921600, timeout=.01, write_timeout=.5) as link, ThreadPoolExecutor(max_workers=1) as executor:
        def send(kind, payload=b''):
            nonlocal sequence
            frame = encode(kind, sequence, payload)
            if link.write(frame) != len(frame):
                raise OSError('partial serial write')
            sequence = (sequence + 1) & 0xffffffff
        try:
            while True:
                now = time.monotonic()
                if now-last_heartbeat >= .25:
                    send(4)
                    send(3, interaction.state.encode())
                    last_heartbeat = now
                for kind, frame_seq, pcm in decoder.feed(link.read(4096)):
                    if kind != 1:
                        continue
                    if last_sequence is not None and frame_seq != (last_sequence+1)&0xffffffff and interaction.state in ("idle", "listening"):
                        interaction.reset()
                        model.reset()
                    last_sequence = frame_seq
                    last_capture = now
                    if now < cooldown:
                        continue
                    clip = interaction.feed(pcm)
                    if clip is not None and future is None:
                        future = executor.submit(query, clip)
                if last_capture and now-last_capture > 1:
                    send(5)
                    playback = b''
                    interaction.reset()
                    model.reset()
                    last_capture = 0
                if future is not None and future.done():
                    try:
                        result = future.result()
                        if not last_capture or now-last_capture > 1:
                            raise OSError("capture link lost")
                        playback = result
                        offset = 0
                        interaction.state = 'speaking'
                        send(6)
                        next_audio = now
                    except Exception:
                        send(5)
                        interaction.reset()
                        model.reset()
                        cooldown = now+2
                        print('Voice request failed; output muted. Check server configuration.')
                    future = None
                if playback and now >= next_audio:
                    chunk = playback[offset:offset+1280]
                    send(2, chunk)
                    offset += len(chunk)
                    next_audio = now + len(chunk)/64000
                    if offset >= len(playback):
                        # Let the final queued DMA frame drain before STOP.
                        time.sleep(len(chunk)/64000+.03)
                        send(5)
                        playback = b''
                        interaction.reset()
                        model.reset()
                        cooldown = time.monotonic()+.5
                time.sleep(.001)
        finally:
            send(5)


if __name__ == '__main__':
    main()
