"""API FastAPI de consulta segura para ClassAI (temperatura legado, sesiones y asistencia)."""

import hmac
import os
import sqlite3
from typing import Annotated, Literal, Optional

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from temperature_service import (
    ConfigurationError,
    DatabaseTemporarilyUnavailableError,
    InvalidTimeRangeError,
    TemperatureService,
    enroll_credential,
    revoke_credential,
)


app = FastAPI(
    title="MLX90614 Temperature API",
    version="1.0.0",
    description="Consultas de solo lectura para datos de temperatura agregados por minuto.",
    openapi_tags=[
        {"name": "system", "description": "Estado del servicio."},
        {"name": "temperature", "description": "Consultas históricas y agregadas de temperatura."},
        {"name": "classes", "description": "Sesiones de clase, series por métrica y asistencia."},
        {"name": "credentials", "description": "Enrolamiento de credenciales (requiere X-API-Key)."},
    ],
)

try:
    import tuner

    app.include_router(tuner.router)
except Exception as error:  # la API sigue funcionando sin el tuner
    print(f"Tuner no disponible en la API: {error!r}")

try:
    import live

    app.include_router(live.router)
except Exception as error:  # la API sigue funcionando sin datos en vivo
    print(f"Live no disponible en la API: {error!r}")

try:
    import assistant_api

    app.include_router(assistant_api.router)
except Exception as error:  # la API sigue funcionando sin el asistente
    print(f"Asistente no disponible en la API: {error!r}")


def get_service() -> TemperatureService:
    try:
        return TemperatureService.from_environment()
    except ConfigurationError as error:
        raise HTTPException(status_code=500, detail="La configuración de la API no es válida") from error


def run_query(callback):
    try:
        return callback()
    except InvalidTimeRangeError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except DatabaseTemporarilyUnavailableError as error:
        raise HTTPException(status_code=503, detail="La base de datos está temporalmente ocupada") from error


@app.get("/health", tags=["system"], summary="Comprobar el estado de la API")
def health() -> dict[str, str]:
    try:
        service = get_service()
    except HTTPException:
        return {"status": "ok", "database": "unavailable"}
    return {"status": "ok", "database": "available" if service.database_available() else "unavailable"}


@app.get("/temperature/latest", tags=["temperature"], summary="Obtener el último minuto disponible")
def latest_temperature() -> dict:
    service = get_service()
    result = run_query(service.get_latest)
    if result is None:
        return {"found": False, "message": "No hay datos disponibles"}
    return {"found": True, **result}


@app.get("/temperature/stats", tags=["temperature"], summary="Calcular estadísticas ponderadas por muestras")
def temperature_stats(
    start: Annotated[str, Query(description="Inicio ISO 8601; sin zona horaria se interpreta en LOCAL_TIMEZONE")],
    end: Annotated[str, Query(description="Fin ISO 8601 exclusivo; sin zona horaria se interpreta en LOCAL_TIMEZONE")],
) -> dict:
    service = get_service()
    result = run_query(lambda: service.get_stats(start, end))
    if result is None:
        return {"found": False, "message": "No hay datos para ese periodo"}
    return {"found": True, **result}


@app.get("/temperature/history", tags=["temperature"], summary="Obtener resúmenes por minuto")
def temperature_history(
    start: Annotated[str, Query(description="Inicio ISO 8601")],
    end: Annotated[str, Query(description="Fin ISO 8601 exclusivo")],
    limit: Annotated[int, Query(ge=1, le=5000, description="Máximo de filas a devolver")] = 500,
) -> dict:
    service = get_service()
    result = run_query(lambda: service.get_history(start, end, limit))
    if not result:
        return {"found": False, "count": 0, "data": []}
    return {"found": True, "count": len(result), "data": result}


@app.get("/temperature/daily-summary", tags=["temperature"], summary="Calcular el resumen de un día local")
def daily_summary(
    date: Annotated[str, Query(description="Fecha local en formato YYYY-MM-DD")],
) -> dict:
    service = get_service()
    result = run_query(lambda: service.get_daily_summary(date))
    if result is None:
        return {"found": False, "message": "No hay datos para ese día"}
    return {"found": True, **result}



@app.get("/classes/current", tags=["classes"], summary="Sesión abierta y última lectura de un aula")
def current_class(room: Annotated[str, Query(pattern="^[a-z0-9-]+$", description="ID del aula, p.ej. a101")]) -> dict:
    service = get_service()
    return run_query(lambda: service.get_current_class(room))


@app.get("/sessions", tags=["classes"], summary="Listar sesiones con su resumen")
def sessions(
    room: Optional[str] = None,
    course: Optional[str] = None,
    start: Annotated[Optional[str], Query(description="Inicio ISO 8601 (started_at >= start)")] = None,
    end: Annotated[Optional[str], Query(description="Fin ISO 8601 exclusivo")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> dict:
    service = get_service()
    result = run_query(lambda: service.list_sessions(room, course, start, end, limit))
    return {"found": bool(result), "count": len(result), "data": result}


@app.get("/sessions/compare", tags=["classes"], summary="Comparar resúmenes de varias sesiones")
def compare_sessions(ids: Annotated[list[str], Query(description="session_id repetido: ?ids=a&ids=b")]) -> dict:
    service = get_service()
    result = run_query(lambda: service.compare_sessions(ids))
    return {"found": bool(result), "count": len(result), "data": result}


@app.get("/sessions/{session_id}/summary", tags=["classes"], summary="Resumen de una sesión")
def session_summary(session_id: str) -> dict:
    service = get_service()
    result = run_query(lambda: service.get_session_summary(session_id))
    if result is None:
        return {"found": False, "message": "La sesión no existe"}
    return {"found": True, **result}


@app.get("/sessions/{session_id}/series", tags=["classes"], summary="Serie de una métrica agrupada por minutos")
def session_series(
    session_id: str,
    metric: str,
    bucket_minutes: Annotated[int, Query(ge=1, le=60)] = 5,
) -> dict:
    service = get_service()
    result = run_query(lambda: service.get_metric_series(session_id, metric, bucket_minutes))
    if result is None:
        return {"found": False, "message": "La sesión no existe"}
    return {"found": bool(result), "count": len(result), "data": result}


@app.get("/sessions/{session_id}/attendance", tags=["classes"], summary="Asistentes de una sesión (sin tokens)")
def session_attendance(session_id: str) -> dict:
    service = get_service()
    result = run_query(lambda: service.get_attendance(session_id))
    return {"found": bool(result), "count": len(result), "data": result}


class CredentialIn(BaseModel):
    student_code: str = Field(min_length=1, max_length=32)
    full_name: str = Field(min_length=1, max_length=120)
    type: Literal["nfc_card_uid", "android_hce"]
    token: str = Field(min_length=8, max_length=64)


def require_admin(api_key: Optional[str]) -> None:
    expected = os.getenv("ADMIN_API_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="ADMIN_API_KEY no está configurada")
    if api_key is None or not hmac.compare_digest(api_key, expected):
        raise HTTPException(status_code=401, detail="X-API-Key inválida")


def run_write(callback):
    service = get_service()
    try:
        connection = run_query(service.write_connection)
        try:
            return callback(connection)
        finally:
            connection.close()
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="Esa credencial ya está activa") from error
    except sqlite3.OperationalError as error:
        raise HTTPException(status_code=503, detail="La base de datos está temporalmente ocupada") from error


@app.post("/credentials", tags=["credentials"], status_code=201, summary="Enrolar una credencial a un estudiante")
def create_credential(
    credential: CredentialIn,
    x_api_key: Annotated[Optional[str], Header()] = None,
) -> dict:
    require_admin(x_api_key)
    return run_write(lambda connection: enroll_credential(
        connection, credential.student_code, credential.full_name, credential.type, credential.token
    ))


@app.post("/credentials/{credential_id}/revoke", tags=["credentials"], summary="Revocar una credencial")
def revoke(credential_id: int, x_api_key: Annotated[Optional[str], Header()] = None) -> dict:
    require_admin(x_api_key)
    if not run_write(lambda connection: revoke_credential(connection, credential_id)):
        raise HTTPException(status_code=404, detail="Credencial inexistente o ya revocada")
    return {"revoked": True, "credential_id": credential_id}
