"""POST /assistant/ask: el asistente de chatbot.py expuesto por HTTP para el dashboard web.

Mismo bucle de tool-calling (llm_tools.answer_question); las herramientas consultan esta misma API
por HTTP, por eso el endpoint es `def` (corre en el threadpool y no bloquea el loop que las atiende).
"""

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

from llm_tools import answer_question, explicit_fan_mode


router = APIRouter(tags=["assistant"])


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    room: str | None = Field(default=None, pattern=r"^[a-z0-9-]{1,32}$")
    history: list[Turn] = Field(default_factory=list, max_length=20)


@router.post("/assistant/ask", summary="Preguntar al asistente (solo datos de la API de ClassAI)")
def ask(body: AskIn) -> dict:
    load_dotenv()
    load_dotenv(Path(__file__).with_name(".env.chatbot"))  # misma configuración que chatbot.py
    api_key, model = os.getenv("DEEPSEEK_API_KEY"), os.getenv("DEEPSEEK_MODEL")
    provider_url = os.getenv("LLM_BASE_URL") or "https://api.deepseek.com"
    if groq_key := os.getenv("GROQ_API_KEY"):
        api_key = groq_key
        model = os.getenv("GROQ_MODEL") or "openai/gpt-oss-120b"
        provider_url = "https://api.groq.com/openai/v1"
    if not api_key or not model:
        raise HTTPException(status_code=503,
                            detail="El asistente no está configurado: configura GROQ_API_KEY o DEEPSEEK_API_KEY y DEEPSEEK_MODEL")
    base_url = (os.getenv("TEMPERATURE_API_BASE_URL") or f"http://127.0.0.1:{os.getenv('API_PORT', '8000')}").rstrip("/")
    client = OpenAI(api_key=api_key, base_url=provider_url, timeout=60)
    tools_used: list[str] = []
    fan_action = None
    if body.room and (mode := explicit_fan_mode(body.question)):
        from live import set_room_fan
        fan_action = (mode, lambda: set_room_fan(body.room, mode))
    try:
        answer = answer_question(client, model, base_url, [turn.model_dump() for turn in body.history],
                                 body.question, tools_used, room=body.room, fan_action=fan_action)
    except OpenAIError as error:
        print(f"Asistente: error del proveedor LLM: {type(error).__name__}")
        raise HTTPException(status_code=502, detail="El proveedor del LLM no respondió; intenta de nuevo") from error
    return {"answer": answer, "tools_used": tools_used}
