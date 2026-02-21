from __future__ import annotations

from datetime import datetime
from threading import Lock
from typing import Optional

from app.models import SessionState


class SessionStore:
    """Thread-safe in-memory store for hackathon MVP sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
        self._lock = Lock()

    def create(self, session: SessionState) -> SessionState:
        with self._lock:
            self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> Optional[SessionState]:
        with self._lock:
            return self._sessions.get(session_id)

    def save(self, session: SessionState) -> SessionState:
        session.updated_at = datetime.utcnow()
        with self._lock:
            self._sessions[session.session_id] = session
        return session

    def list_all(self) -> list[SessionState]:
        with self._lock:
            return list(self._sessions.values())


store = SessionStore()
