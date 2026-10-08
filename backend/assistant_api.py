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

from llm_tools import answer_question


router = APIRouter(tags=["assistant"])


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    history: list[Turn] = Field(default_factory=list, max_length=20)


@router.post("/assistant/ask", summary="Preguntar al asistente (solo datos de la API de ClassAI)")
def ask(body: AskIn) -> dict:
    load_dotenv()
    load_dotenv(Path(__file__).with_name(".env.chatbot"))  # misma configuración que chatbot.py
    api_key, model = os.getenv("DEEPSEEK_API_KEY"), os.getenv("DEEPSEEK_MODEL")
    if not api_key or not model:
        raise HTTPException(status_code=503,
                            detail="El asistente no está configurado: faltan DEEPSEEK_API_KEY y/o DEEPSEEK_MODEL")
    base_url = (os.getenv("TEMPERATURE_API_BASE_URL") or f"http://127.0.0.1:{os.getenv('API_PORT', '8000')}").rstrip("/")
    client = OpenAI(api_key=api_key, base_url=os.getenv("LLM_BASE_URL") or "https://api.deepseek.com", timeout=60)
    tools_used: list[str] = []
    try:
        answer = answer_question(client, model, base_url, [turn.model_dump() for turn in body.history],
                                 body.question, tools_used)
    except OpenAIError as error:
        print(f"Asistente: error del proveedor LLM: {error!r}")
        raise HTTPException(status_code=502, detail="El proveedor del LLM no respondió; intenta de nuevo") from error
    return {"answer": answer, "tools_used": tools_used}
