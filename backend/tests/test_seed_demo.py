import sqlite3
from datetime import date

import seed_demo


def test_seed_is_consistent_and_deterministic(tmp_path):
    counts = seed_demo.seed(str(tmp_path / "a.db"), 7, date(2026, 10, 2))
    assert all(counts.values()), counts
    assert counts["sessions"] == counts["session_summaries"] == 16  # una semana del horario (SCHEDULE)

    connection = sqlite3.connect(tmp_path / "a.db")
    mismatched = connection.execute(
        "SELECT COUNT(*) FROM session_summaries m "
        "WHERE attendance_count != (SELECT COUNT(*) FROM attendance a WHERE a.session_id = m.session_id) "
        "OR params_version IS NULL "
        "OR NOT EXISTS (SELECT 1 FROM comfort_params p WHERE p.room = m.room AND p.params_version = m.params_version)"
    ).fetchone()[0]
    assert mismatched == 0
    assert connection.execute("SELECT COUNT(*) FROM sessions WHERE ended_at IS NULL").fetchone()[0] == 0
    assert connection.execute("SELECT COUNT(*) FROM rooms WHERE latitude IS NULL").fetchone()[0] == 0
    summaries = connection.execute("SELECT * FROM session_summaries ORDER BY session_id").fetchall()

    seed_demo.seed(str(tmp_path / "b.db"), 7, date(2026, 10, 2))
    again = sqlite3.connect(tmp_path / "b.db").execute("SELECT * FROM session_summaries ORDER BY session_id").fetchall()
    assert again == summaries
