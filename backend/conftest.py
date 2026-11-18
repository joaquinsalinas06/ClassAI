# Hace importables los módulos de backend/ al correr pytest desde la raíz del repo.
import sys

import pytest


@pytest.fixture(autouse=True)
def _teacher_logged_in():
    """Las pruebas previas al login llaman rutas del panel sin cookie; test_auth lo desactiva."""
    api = sys.modules.get("api")
    if api is None:
        yield
        return
    import auth

    api.app.dependency_overrides[auth.teacher_guard] = lambda: None
    yield
    api.app.dependency_overrides.pop(auth.teacher_guard, None)
