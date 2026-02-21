from __future__ import annotations

from app.models import AdaptationEvent, EventType, InterfaceMode, SessionState, UIMutation


def compute_adaptation(
    session: SessionState,
    trigger_event: EventType | None = None,
) -> UIMutation:
    previous_mode = session.current_mode

    if trigger_event == EventType.mode_change:
        session.manual_mode_events_remaining = 3
        return UIMutation(
            new_mode=session.current_mode,
            reason="Mode locked to user selection for the next few interactions.",
            ui_changes=["Pinned user-selected mode"],
        )

    if session.manual_mode_events_remaining > 0:
        session.manual_mode_events_remaining -= 1
        if session.scores.escalation_risk < 85:
            return UIMutation(
                new_mode=session.current_mode,
                reason=(
                    "Respecting user-selected mode while continuing to update scores and checklist."
                ),
                ui_changes=[],
            )

    target_mode = previous_mode
    reason = "No mode change needed."
    ui_changes: list[str] = []

    if session.scores.escalation_risk >= 85:
        target_mode = InterfaceMode.advisor
        reason = "Escalation risk is high; switched to advisor mode."
        ui_changes = [
            "Pinned escalation checklist",
            "Elevated handoff questions",
        ]
    elif (
        session.selected_flow_id == "cap_gap_transition_prep"
        and not str(session.fields.get("petition_status", "")).strip()
    ):
        target_mode = InterfaceMode.transition
        reason = "Transition flow needs petition-state clarity; switched to transition mode."
        ui_changes = [
            "Expanded bridge timeline",
            "Highlighted petition dependencies",
        ]
    elif session.scores.understanding_score < 55:
        target_mode = InterfaceMode.explain
        reason = "Understanding dropped; switched to explain mode."
        ui_changes = [
            "Expanded plain-language hints",
            "Promoted micro-check guidance",
        ]
    elif session.scores.completeness_score < 45 and len(session.missing_items) >= 3:
        target_mode = InterfaceMode.doc_prep
        reason = "Readiness is low with multiple missing entities; switched to doc prep mode."
        ui_changes = [
            "Pinned missing required entities",
            "Grouped required steps by dependency",
        ]
    elif session.scores.completeness_score < 72:
        target_mode = InterfaceMode.checklist
        reason = "Completeness still low; prioritized checklist mode."
        ui_changes = ["Sorted unresolved steps first"]
    elif session.scores.clarity_score >= 74 and session.scores.completeness_score >= 72:
        target_mode = InterfaceMode.timeline
        reason = "Clarity and completeness are stable; switched to timeline mode."
        ui_changes = ["Expanded date-dependent planning steps"]

    session.current_mode = target_mode

    if target_mode != previous_mode:
        session.adaptation_log.append(
            AdaptationEvent(
                reason=reason,
                from_mode=previous_mode,
                to_mode=target_mode,
                ui_changes=ui_changes,
            )
        )

    return UIMutation(new_mode=target_mode, reason=reason, ui_changes=ui_changes)
