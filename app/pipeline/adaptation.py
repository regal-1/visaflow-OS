from __future__ import annotations

from app.models import AdaptationEvent, InterfaceMode, SessionState, UIMutation


CRITICAL_FIELDS = {
    "employer_name",
    "work_start_date",
    "status_type",
    "program_stage",
}


def compute_adaptation(session: SessionState) -> UIMutation:
    prev_mode = session.current_mode
    scores = session.scores

    missing_critical = [
        field for field in CRITICAL_FIELDS if not str(session.fields.get(field, "")).strip()
    ]

    target_mode = prev_mode
    reason = "No major adaptation needed."
    ui_changes: list[str] = []

    if scores.escalation_risk >= 72:
        target_mode = InterfaceMode.advisor
        reason = "Escalation risk is high; switched to advisor handoff mode."
        ui_changes = [
            "Pinned escalation checklist",
            "Surfaced advisor/attorney questions",
            "Collapsed non-critical sections",
        ]
    elif session.selected_flow_id == "cap_gap_transition_prep" and not str(session.fields.get("petition_status", "")).strip():
        target_mode = InterfaceMode.transition
        reason = "Transition context needs petition-state clarification; switched to transition view."
        ui_changes = [
            "Enabled status-bridge timeline",
            "Highlighted petition-status dependency",
            "Prioritized transition verification tasks",
        ]
    elif scores.understanding_score < 56 or (session.profile.stress_level >= 4 and scores.understanding_score < 70):
        target_mode = InterfaceMode.explain
        reason = "Understanding dropped; switched to explain-first guidance."
        ui_changes = [
            "Simplified language",
            "Expanded dependency hints",
            "Promoted micro-check guidance",
        ]
    elif len(missing_critical) >= 2 and scores.completeness_score < 72:
        target_mode = InterfaceMode.doc_prep
        reason = "Critical fields missing; switched to document prep mode."
        ui_changes = [
            "Pinned missing critical fields",
            "Grouped checklist tasks by dependency",
            "Added handoff preparation prompts",
        ]
    elif scores.completeness_score < 72:
        target_mode = InterfaceMode.checklist
        reason = "Completeness low; prioritized checklist execution."
        ui_changes = [
            "Sorted incomplete steps to top",
            "Promoted quick field capture cards",
        ]
    elif scores.clarity_score >= 78 and scores.completeness_score >= 72:
        target_mode = InterfaceMode.timeline
        reason = "User stable; switched to timeline planning mode."
        ui_changes = [
            "Expanded date-dependent nodes",
            "Collapsed low-signal guidance text",
        ]

    session.current_mode = target_mode

    if target_mode != prev_mode:
        session.adaptation_log.append(
            AdaptationEvent(
                reason=reason,
                from_mode=prev_mode,
                to_mode=target_mode,
                ui_changes=ui_changes,
            )
        )

    return UIMutation(new_mode=target_mode, reason=reason, ui_changes=ui_changes)
