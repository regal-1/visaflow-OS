from __future__ import annotations

from app.models import EventType, InterfaceMode, ScoreCard, SessionState, StepStatus


FLOW_CONFUSION_WEIGHTS = {
    "cpt_prep": {
        "employer_details": 1.3,
        "approval_before_work": 1.4,
    },
    "opt_initial_prep": {
        "timing_window": 1.4,
        "pathway_confusion": 1.2,
    },
    "opt_stem_prep": {
        "employer_compliance": 1.5,
    },
    "cap_gap_transition_prep": {
        "status_bridge": 1.8,
        "petition_state": 1.7,
    },
}


def recompute_scores(session: SessionState, required_fields: list[str], flow_id: str) -> ScoreCard:
    familiarity_base = {
        "new": 64,
        "intermediate": 74,
        "advanced": 82,
    }.get(session.profile.familiarity_level, 70)

    confusion_count = sum(
        1
        for event in session.events
        if event.event_type in {EventType.inactivity, EventType.step_reopen, EventType.ask_help}
    )
    field_updates = sum(1 for event in session.events if event.event_type == EventType.field_update)

    micro_checks_total = len(session.micro_checks)
    micro_checks_correct = sum(1 for result in session.micro_checks.values() if result.is_correct)

    confusion_multiplier = _flow_confusion_multiplier(flow_id, session)

    understanding = familiarity_base
    understanding -= min(40, int(confusion_count * 5 * confusion_multiplier))
    understanding += min(22, micro_checks_correct * 7)
    understanding += min(10, field_updates // 2)

    preference_bonus = 0
    if session.current_mode == session.profile.preferred_mode:
        preference_bonus = 9
    elif session.current_mode == InterfaceMode.explain and session.profile.familiarity_level == "new":
        preference_bonus = 8

    clarity = 66 + preference_bonus - min(28, int(confusion_count * 3 * confusion_multiplier))
    if session.current_mode == InterfaceMode.explain:
        clarity += 8
    if session.current_mode == InterfaceMode.timeline:
        clarity += 4
    if session.current_mode == InterfaceMode.transition and flow_id == "cap_gap_transition_prep":
        clarity += 5

    required_count = len(required_fields)
    filled_required = 0
    for field in required_fields:
        if str(session.fields.get(field, "")).strip():
            filled_required += 1

    completed_steps = sum(1 for step in session.workflow if step.status == StepStatus.complete)
    step_completion_ratio = completed_steps / max(1, len(session.workflow))
    field_completion_ratio = filled_required / max(1, required_count)

    completeness = int((field_completion_ratio * 72) + (step_completion_ratio * 28))
    if micro_checks_total and micro_checks_correct == micro_checks_total:
        completeness += 4

    escalation_risk = _compute_escalation_risk(
        flow_id=flow_id,
        confusion_count=confusion_count,
        missing_items=session.missing_items,
        micro_checks_total=micro_checks_total,
        micro_checks_correct=micro_checks_correct,
        fields=session.fields,
    )

    return ScoreCard(
        understanding_score=max(0, min(100, int(understanding))),
        clarity_score=max(0, min(100, int(clarity))),
        completeness_score=max(0, min(100, int(completeness))),
        escalation_risk=max(0, min(100, int(escalation_risk))),
    )


def _flow_confusion_multiplier(flow_id: str, session: SessionState) -> float:
    weights = FLOW_CONFUSION_WEIGHTS.get(flow_id, {})
    multiplier = 1.0

    for label, weight in weights.items():
        if label == "employer_details" and not session.fields.get("employer_name"):
            multiplier = max(multiplier, weight)
        if label == "approval_before_work" and not session.fields.get("work_start_date"):
            multiplier = max(multiplier, weight)
        if label == "timing_window" and not session.fields.get("graduation_date"):
            multiplier = max(multiplier, weight)
        if label == "pathway_confusion" and session.disambiguation_card is not None:
            multiplier = max(multiplier, weight)
        if label == "employer_compliance" and not session.fields.get("employment_offer"):
            multiplier = max(multiplier, weight)
        if label == "status_bridge" and not session.fields.get("status_type"):
            multiplier = max(multiplier, weight)
        if label == "petition_state" and not session.fields.get("petition_status"):
            multiplier = max(multiplier, weight)

    return multiplier


def _compute_escalation_risk(
    flow_id: str,
    confusion_count: int,
    missing_items: list[str],
    micro_checks_total: int,
    micro_checks_correct: int,
    fields: dict[str, str],
) -> int:
    risk = 15
    risk += min(30, confusion_count * 5)
    risk += min(30, len(missing_items) * 3)

    if micro_checks_total > 0 and micro_checks_correct < micro_checks_total:
        risk += 10

    if flow_id == "cap_gap_transition_prep":
        if not str(fields.get("petition_status", "")).strip():
            risk += 20
        if not str(fields.get("work_end_date", "")).strip():
            risk += 10

    if flow_id == "cpt_prep" and not str(fields.get("employer_name", "")).strip():
        risk += 10

    return risk
