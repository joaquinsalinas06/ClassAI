"""Bounded, authenticated voice requests; no continuous recording or model downloads."""
import hmac
import io
import os
import wave

import requests
from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from assistant_api import AskIn, ask

router = APIRouter(tags=['assistant'])
MAX_WAV = 16_000 * 2 * 15 + 128


def validate_wav(content):
    try:
        with wave.open(io.BytesIO(content), 'rb') as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
                raise ValueError('expected mono PCM16, 16000 Hz')
            frames = audio.getnframes()
            if not 1600 <= frames <= 16_000 * 15 or len(audio.readframes(frames)) != frames * 2:
                raise ValueError('invalid audio duration or truncated samples')
    except (wave.Error, EOFError, ValueError) as error:
        raise HTTPException(400, detail='Se requiere WAV mono PCM16, 16 kHz, entre 0,1 y 15 s') from error


def process_voice(content, room="a101"):
    validate_wav(content)
    base = os.getenv('SPEECH_BASE_URL', '').rstrip('/')
    if not base:
        raise HTTPException(503, detail='Servidor de voz no configurado')
    try:
        transcript = requests.post(f'{base}/transcribe', data=content, headers={'Content-Type': 'audio/wav'}, timeout=90)
        transcript.raise_for_status()
        text = transcript.json()['text']
        if not isinstance(text, str) or not text.strip() or len(text) > 1000:
            raise HTTPException(400, detail='No se obtuvo una consulta válida')
        answer = ask(AskIn(question=f'En el aula {room}: {text}'[:1000]))['answer']
        with requests.post(f'{base}/synthesize', json={'text': answer[:600]}, timeout=45, stream=True) as speech:
            speech.raise_for_status()
            wav = bytearray()
            for part in speech.iter_content(8192):
                wav.extend(part)
                if len(wav) > 4_000_000:
                    raise HTTPException(502, detail='Respuesta de voz demasiado larga')
        return bytes(wav)
    except (requests.RequestException, ValueError, KeyError) as error:
        raise HTTPException(502, detail='El servicio de voz no respondió correctamente') from error


@router.post('/assistant/voice', summary='Consulta WAV activada localmente; respuesta WAV')
async def voice(request: Request, room: str = Query(default="a101", pattern="^[a-z0-9-]{1,32}$")):
    expected = os.getenv('VOICE_API_KEY')
    if not expected:
        raise HTTPException(503, detail='VOICE_API_KEY no configurada')
    supplied = request.headers.get('X-Voice-Key', '')
    if not hmac.compare_digest(expected, supplied):
        raise HTTPException(401, detail='Credencial de voz inválida')
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_WAV:
            raise HTTPException(413, detail='Consulta de voz demasiado larga')
    wav = await run_in_threadpool(process_voice, bytes(content), room)
    return Response(wav, media_type='audio/wav', headers={'Cache-Control': 'no-store'})
