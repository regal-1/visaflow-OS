# VisaFlow OS (Simplified, Adaptive, End-to-End)

VisaFlow OS is a dynamic interface engine for high-friction immigration workflow preparation.

## First-principles pipeline
`Intent -> Flow Router -> Case Graph -> Readiness Scoring -> Adaptive Mode -> Advisor Packet`

## What this version ships
- Deterministic multi-flow router (`F-1 basics`, `CPT`, `Initial OPT`, `STEM OPT`, `Cap Gap/H-1B transition`).
- Stable disambiguation for ambiguous inputs (especially CPT vs OPT).
- Case graph + workflow statuses (`pending`, `blocked`, `complete`) with dependency logic.
- Live scores: `understanding`, `clarity`, `completeness`, `escalation risk`.
- Bounded adaptation loop with user mode lock (manual mode changes are respected).
- Micro-check system tied to active flow + current missing blockers.
- Advisor packet generation with source citations (UCSD + USCIS grounding).

## Data & source layout
- Flow packs: `/Users/arunimaanand/Downloads/Hackathon Compiled/data/flows/*.json`
- Shared checks/glossary/docs: `/Users/arunimaanand/Downloads/Hackathon Compiled/data/shared/*.json`
- Demo scenarios: `/Users/arunimaanand/Downloads/Hackathon Compiled/data/scenarios/demo_cases.json`
- Source map: `/Users/arunimaanand/Downloads/Hackathon Compiled/app/data/source_map.json`
- Retrieval chunks: `/Users/arunimaanand/Downloads/Hackathon Compiled/data/knowledge_chunks.json`

## Disclaimer
This is a workflow-preparation and comprehension assistant. It is **not legal advice**.

## Quick start
```bash
cd "/Users/arunimaanand/Downloads/Hackathon Compiled"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 scripts/build_uscis_kb.py
uvicorn app.main:app --reload
```

Open: `http://127.0.0.1:8000`

## API surface
- `GET /api/health`
- `GET /api/sources`
- `GET /api/flows`
- `GET /api/scenarios`
- `POST /api/session/start`
- `GET /api/session/{session_id}`
- `POST /api/session/{session_id}/event`
- `POST /api/session/{session_id}/micro-check`
- `POST /api/session/{session_id}/packet`

## Demo path (clean and judge-friendly)
1. Start with ambiguous intent (`CPT or OPT`).
2. Show candidate flows + disambiguation card.
3. Fill 2-3 required fields and show score movement.
4. Trigger one confusion event and show adaptive mode reaction.
5. Run one micro-check.
6. Generate advisor packet.
