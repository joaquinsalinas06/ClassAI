"""Asistente ClassAI local en Streamlit: LLM compatible con OpenAI (DeepSeek por defecto)
con herramientas de solo lectura sobre la API (llm_tools.py)."""

import os
from dataclasses import dataclass
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv
from openai import OpenAI

from chat_store import ChatStore
from llm_tools import answer_question


@dataclass(frozen=True)
class ChatbotSettings:
    deepseek_api_key: str
    deepseek_model: str
    llm_base_url: str
    temperature_api_base_url: str
    chat_database_path: str


def required_env(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise ValueError(f"Falta {name} en .env.chatbot")
    return value.strip()


def load_settings() -> ChatbotSettings:
    load_dotenv(Path(__file__).with_name(".env.chatbot"))
    return ChatbotSettings(
        deepseek_api_key=required_env("DEEPSEEK_API_KEY"),
        deepseek_model=required_env("DEEPSEEK_MODEL"),
        # Cualquier proveedor compatible con OpenAI: cambia LLM_BASE_URL y DEEPSEEK_MODEL.
        llm_base_url=os.getenv("LLM_BASE_URL") or "https://api.deepseek.com",
        temperature_api_base_url=required_env("TEMPERATURE_API_BASE_URL").rstrip("/"),
        chat_database_path=required_env("CHAT_DATABASE_PATH"),
    )


def select_conversation(store: ChatStore) -> int:
    conversations = store.list_conversations()
    if not conversations:
        return store.create_conversation()
    choices = {f"{item['id']} · {item['title']}": item["id"] for item in conversations}
    selected = st.sidebar.selectbox("Conversación", list(choices), key="conversation_selector")
    return choices[selected]


def main() -> None:
    st.set_page_config(page_title="ClassAI Asistente", page_icon="💬", layout="wide")
    st.title("ClassAI Asistente")
    st.caption("Clases, asistencia y confort del aula, solo con datos de la API de ClassAI.")

    try:
        settings = load_settings()
    except ValueError as error:
        st.error(str(error))
        st.stop()

    store = ChatStore(settings.chat_database_path)
    if st.sidebar.button("Nueva conversación"):
        new_id = store.create_conversation()
        st.session_state["conversation_selector"] = f"{new_id} · Nueva conversación"
        st.rerun()

    conversation_id = select_conversation(store)
    history = store.get_messages(conversation_id)
    for item in history:
        with st.chat_message(item["role"]):
            st.markdown(item["content"])

    question = st.chat_input("Pregunta sobre clases, asistencia o confort")
    if not question:
        return

    with st.chat_message("user"):
        st.markdown(question)
    store.add_message(conversation_id, "user", question)
    if len(history) == 0:
        store.update_title(conversation_id, question[:60])

    with st.chat_message("assistant"):
        with st.spinner("Consultando datos..."):
            try:
                client = OpenAI(api_key=settings.deepseek_api_key, base_url=settings.llm_base_url)
                answer = answer_question(
                    client, settings.deepseek_model, settings.temperature_api_base_url, history, question
                )
            except Exception:
                answer = "No se pudo consultar el modelo de lenguaje en este momento."
        st.markdown(answer)
    store.add_message(conversation_id, "assistant", answer)


if __name__ == "__main__":
    main()
