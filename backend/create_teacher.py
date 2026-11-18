"""Crear docentes del panel web.

    python create_teacher.py USUARIO [--name "Nombre"]   # pide la contraseña sin eco
    python create_teacher.py --from-env                  # TEACHER_USER / TEACHER_PASSWORD; no hace nada si ya existe
"""
import argparse
import getpass
import os
import sqlite3
import sys
from pathlib import Path

from auth import create_teacher

SCHEMA = Path(__file__).with_name("schema.sql")


def open_database() -> sqlite3.Connection:
    path = Path(os.getenv("DATABASE_PATH", Path(__file__).with_name("data") / "classai.db"))
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.executescript(SCHEMA.read_text(encoding="utf-8"))  # idempotente, igual que la ingesta
    return connection


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("username", nargs="?")
    parser.add_argument("--name", default="")
    parser.add_argument("--from-env", action="store_true")
    args = parser.parse_args(argv)
    if args.from_env:
        username, password = os.getenv("TEACHER_USER", "").strip(), os.getenv("TEACHER_PASSWORD", "")
        if not username or not password:
            print("TEACHER_USER/TEACHER_PASSWORD no definidos: no se crea docente inicial", file=sys.stderr)
            return 0
        name = os.getenv("TEACHER_NAME", "")
    elif args.username:
        username, name = args.username, args.name
        password = getpass.getpass("Contraseña: ")
        if password != getpass.getpass("Repite la contraseña: "):
            parser.error("las contraseñas no coinciden")
    else:
        parser.error("indica USUARIO o --from-env")
    with open_database() as connection:
        if connection.execute("SELECT 1 FROM teachers WHERE username=?", (username,)).fetchone():
            print(f"El docente {username} ya existe")
            return 0 if args.from_env else 1
        try:
            create_teacher(connection, username, password, name)
        except ValueError as error:
            parser.error(str(error))
    print(f"Docente {username} creado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
