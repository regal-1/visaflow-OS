from __future__ import annotations

from datetime import datetime

from app.models import EventType, InterfaceMode, ScoreCard, SessionState, StepStatus


CONFUSION_EVENTS = {
    EventType.inactivity,
    EventType.ask_help,
    EventType.step_reopen,
}

CRITICAL_FIELDS_BY_FLOW = {
    "cpt_prep": {"status_type", "program_stage", "employer_name", "work_start_date"},
    "opt_initial_prep": {"status_type", "program_stage", "graduation_date", "work_start_date"},
    "opt_stem_prep": {"status_type", "employer_name", "work_start_date"},
    "cap_gap_transition_prep": {"status_type", "petition_status", "work_end_date"},
    "f1_work_basics": {"status_type", "program_stage", "employment_offer"},
}


def recompute_scores(session: SessionState, required_fields: list[str], flow_id: str) -> ScoreCard:
    required_count = max(1, len(required_fields))
    filled_required = sum(
        1 for field in required_fields if str(session.fields.get(field, "")).strip()
    )
    field_completion = filled_required / required_count

    step_total = max(1, len(session.workflow))
    completed_steps = sum(1 for step in session.workflow if step.status == StepStatus.complete)
    step_completion = completed_steps / step_total

    checks_total = len(session.micro_checks)
    checks_correct = sum(1 for result in session.micro_checks.values() if result.is_correct)
    checks_wrong = max(0, checks_total - checks_correct)
    check_accuracy = (checks_correct / checks_total) if checks_total else 0.0

    recent_events = session.events[-8:]
    recent_confusion = sum(1 for event in recent_events if event.event_type in CONFUSION_EVENTS)
    lifetime_confusion = sum(1 for event in session.events if event.event_type in CONFUSION_EVENTS)

    critical_fields = _critical_fields(flow_id=flow_id, required_fields=required_fields)
    critical_missing = sum(
        1 for field in critical_fields if not str(session.fields.get(field, "")).strip()
    )

    baseline = {
        "new": 62,
        "intermediate": 74,
        "advanced": 84,
    }.get(session.profile.familiarity_level, 70)

    understanding = baseline
    understanding += int(check_accuracy * 24)
    understanding += int(step_completion * 14)
    understanding += int(field_completion * 10)
    understanding -= recent_confusion * 7
    understanding -= critical_missing * 3
    if session.disambiguation_card is not None:
        understanding -= 7
    if session.current_mode == InterfaceMode.explain:
        understanding += 4

    clarity = 66
    clarity += int(field_completion * 20)
    clarity += int(check_accuracy * 12)
    clarity -= recent_confusion * 5
    clarity -= len(session.ambiguity_flags) * 3
    clarity -= critical_missing * 5
    if session.current_mode == InterfaceMode.explain:
        clarity += 10
    elif session.current_mode == InterfaceMode.timeline:
        clarity += 4
    elif session.current_mode == InterfaceMode.doc_prep:
        clarity += 3

    completeness = int((field_completion * 68) + (step_completion * 32))
    if checks_total > 0 and check_accuracy == 1.0:
        completeness += 4

    escalation = 10
    escalation += critical_missing * 12
    escalation += checks_wrong * 8
    escalation += min(18, lifetime_confusion * 2)
    escalation += max(0, 55 - understanding) // 2
    escalation += _conflict_penalty(flow_id=flow_id, session=session)
    if flow_id == "cap_gap_transition_prep" and not str(session.fields.get("petition_status", "")).strip():
        escalation += 12

    return ScoreCard(
        understanding_score=_clamp(understanding),
        clarity_score=_clamp(clarity),
        completeness_score=_clamp(completeness),
        escalation_risk=_clamp(escalation),
    )


def _critical_fields(flow_id: str, required_fields: list[str]) -> set[str]:
    defaults = {"status_type", "program_stage"}
    flow_fields = CRITICAL_FIELDS_BY_FLOW.get(flow_id, set())
    required_set = set(required_fields)
    return (flow_fields | defaults) & required_set if required_set else (flow_fields | defaults)


def _conflict_penalty(flow_id: str, session: SessionState) -> int:
    penalty = 0
    status = str(session.fields.get("status_type", "")).strip().lower()
    stage = str(session.fields.get("program_stage", "")).strip().lower()
    offer = str(session.fields.get("employment_offer", "")).strip().lower()

    if flow_id == "cpt_prep" and stage in {"graduated", "working"}:
        penalty += 10
    if flow_id == "opt_initial_prep" and stage == "enrolled":
        penalty += 10
    if flow_id == "cap_gap_transition_prep" and status in {"", "f1"}:
        penalty += 8
    if flow_id in {"cpt_prep", "opt_initial_prep", "opt_stem_prep"} and offer in {"no", "none"}:
        penalty += 6

    start = _parse_date(session.fields.get("work_start_date", ""))
    end = _parse_date(session.fields.get("work_end_date", ""))
    if start and end and end < start:
        penalty += 12

    return penalty


def _parse_date(value: str) -> datetime | None:
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _clamp(value: int) -> int:
    return max(0, min(100, int(value)))
