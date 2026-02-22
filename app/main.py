from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.models import (
    EventRequest,
    EventResponse,
    MicroCheckRequest,
    MicroCheckResponse,
    PacketResponse,
    StartSessionRequest,
    StartSessionResponse,
)
from app.pipeline.engine import PipelineEngine
from app.state import store


ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "static"
SOURCE_INDEX = ROOT / "app" / "data" / "source_map.json"
SCENARIOS_INDEX = ROOT / "data" / "scenarios" / "demo_cases.json"

app = FastAPI(
    title="VisaFlow OS",
    version="0.1.0",
    description="Adaptive visa workflow interface prototype (not legal advice).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

engine = PipelineEngine()


@app.get("/")
def root() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "product": "VisaFlow OS"}


@app.get("/api/sources")
def sources() -> dict:
    payload = json.loads(SOURCE_INDEX.read_text()) if SOURCE_INDEX.exists() else {"sources": []}
    return payload


@app.get("/api/flows")
def flows() -> dict:
    return {
        "flows": [
            {
                "flow_id": pack.flow_id,
                "title": pack.title,
                "description": pack.description,
            }
            for pack in engine.flow_store.list()
        ]
    }


@app.get("/api/scenarios")
def scenarios() -> dict:
    payload = (
        json.loads(SCENARIOS_INDEX.read_text())
        if SCENARIOS_INDEX.exists()
        else {"scenarios": []}
    )
    return payload


@app.post("/api/session/start", response_model=StartSessionResponse)
def start_session(request: StartSessionRequest) -> StartSessionResponse:
    session, checks, _ = engine.start_session(request)
    store.create(session)
    return StartSessionResponse(session=session, micro_checks=checks)


@app.get("/api/session/{session_id}")
def get_session(session_id: str):
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/api/session/{session_id}/event", response_model=EventResponse)
def post_event(session_id: str, request: EventRequest) -> EventResponse:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    mutation = engine.apply_event(session, request)
    store.save(session)
    return EventResponse(session=session, mutation=mutation)


@app.post("/api/session/{session_id}/micro-check", response_model=MicroCheckResponse)
def post_micro_check(session_id: str, request: MicroCheckRequest) -> MicroCheckResponse:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result, mutation = engine.apply_micro_check(session, request)
    store.save(session)
    return MicroCheckResponse(result=result, session=session, mutation=mutation)


@app.post("/api/session/{session_id}/packet", response_model=PacketResponse)
def build_packet(session_id: str) -> PacketResponse:
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    packet = engine.build_packet(session)
    store.save(session)
    return PacketResponse(session_id=session_id, packet_markdown=packet)
