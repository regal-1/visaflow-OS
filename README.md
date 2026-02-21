# VisaFlow OS (Advanced End-to-End MVP)

VisaFlow OS is an adaptive interface engine for high-stakes immigration workflow preparation.

## What this build now includes
- Multi-flow routing with flow packs (`CPT`, `Initial OPT`, `STEM OPT`, `Cap Gap/H-1B transition`, `F-1 basics`).
- Disambiguation card when intent maps to multiple likely flows.
- Case graph runtime (`nodes` + `dependencies`) rendered as an interactive adaptive canvas.
- Real-time metric loop: `understanding`, `clarity`, `completeness`, `escalation risk`.
- Adaptive interface modes: `checklist`, `timeline`, `explain`, `doc_prep`, `transition`, `advisor`.
- Live event stream + adaptation timeline.
- Advisor packet generation with citation context.

## Data and sources
- Flow packs: `data/flows/*.json`
- Shared controls/checks: `data/shared/*.json`
- Scenario presets: `data/scenarios/demo_cases.json`
- Source map (UCSD + USCIS): `app/data/source_map.json`
- Built retrieval index: `data/knowledge_chunks.json`

## Important disclaimer
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

## API
- `GET /api/health`
- `GET /api/sources`
- `GET /api/flows`
- `GET /api/scenarios`
- `POST /api/session/start`
- `GET /api/session/{session_id}`
- `POST /api/session/{session_id}/event`
- `POST /api/session/{session_id}/micro-check`
- `POST /api/session/{session_id}/packet`

## Recommended live demo sequence
1. Launch with ambiguous scenario preset (`CPT or OPT`).
2. Show flow ranking + disambiguation selection.
3. Show case graph adaptation and click node to reopen step.
4. Trigger confusion/help event and show mode shift + score changes.
5. Run micro-check and show feedback loop.
6. Generate advisor packet with sources.
