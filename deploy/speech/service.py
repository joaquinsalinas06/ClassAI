"""Private, optional speech worker: local Whisper model and espeak-ng, no paid APIs."""
import io
import json
import os
import subprocess
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MAX_BODY = 500_000


class Handler(BaseHTTPRequestHandler):
    model = None

    def log_message(self, *args):
        pass  # Requests can contain classroom speech; never log transcripts.

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                self.send_error(413)
                return
            body = self.rfile.read(length)
            if self.path == '/transcribe':
                from faster_whisper import WhisperModel
                path = Path(os.environ.get('WHISPER_MODEL', '/models/whisper-small'))
                if not path.is_dir():
                    self.send_error(503, 'Install local model first')
                    return
                if Handler.model is None:
                    Handler.model = WhisperModel(str(path), device='cpu', compute_type='int8', local_files_only=True)
                segments, _ = Handler.model.transcribe(io.BytesIO(body), language='es', beam_size=1, vad_filter=True)
                result = json.dumps({'text': ' '.join(s.text for s in segments)[:1000]}).encode()
                media = 'application/json'
            elif self.path == '/synthesize':
                text = json.loads(body).get('text')
                if not isinstance(text, str) or not 1 <= len(text) <= 3000:
                    self.send_error(400)
                    return
                result = subprocess.run(['espeak-ng', '--stdout', '-v', 'es', '-s', '160', '--stdin'],
                                        input=text.encode(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        check=True, timeout=40).stdout
                # espeak's stdout WAV uses an unknown-length header; normalize it.
                with wave.open(io.BytesIO(result), 'rb') as source:
                    params = source.getparams()
                    pcm = source.readframes(2_000_000)
                output = io.BytesIO()
                with wave.open(output, 'wb') as target:
                    target.setparams(params)
                    target.writeframes(pcm)
                result = output.getvalue()
                media = 'audio/wav'
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header('Content-Type', media)
            self.send_header('Content-Length', str(len(result)))
            self.end_headers()
            self.wfile.write(result)
        except Exception:
            self.send_error(502, 'Speech processing failed')


if __name__ == '__main__':
    HTTPServer(('0.0.0.0', 8090), Handler).serve_forever()
