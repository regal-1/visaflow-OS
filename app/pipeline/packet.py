from __future__ import annotations

from datetime import datetime, timezone

from app.models import SessionState, StepStatus


def build_advisor_packet(session: SessionState) -> str:
    completed_steps = [step for step in session.workflow if step.status == StepStatus.complete]
    pending_steps = [step for step in session.workflow if step.status != StepStatus.complete]

    packet = f"""# VisaFlow Advisor Packet

Generated: {datetime.now(timezone.utc).isoformat()}  
Session ID: `{session.session_id}`

## Disclaimer
Workflow-preparation assistant output only. This is **not legal advice**.

## 1) Input Summary
- Intent: {session.intent}
- Selected Flow: {session.selected_flow_title} (`{session.selected_flow_id}`)
- Ambiguity Flags: {", ".join(session.ambiguity_flags) if session.ambiguity_flags else "none"}

## 2) Process Summary
- Current Mode: `{session.current_mode.value}`
- Understanding: {session.scores.understanding_score}/100
- Clarity: {session.scores.clarity_score}/100
- Completeness: {session.scores.completeness_score}/100
- Escalation Risk: {session.scores.escalation_risk}/100

### Completed Workflow Nodes
{_steps_md(completed_steps)}

### Pending / Blocked Workflow Nodes
{_steps_md(pending_steps)}

## 3) Docs & Field Readiness
### Captured Fields
{_captured_fields_md(session.fields)}

### Missing Required Entities
{_list_md(session.missing_items)}

### Advisor / Attorney Questions
{_list_md(_advisor_questions(session))}

## 4) Source Context
{_citations_md(session.citations)}
"""
    return packet


def _steps_md(steps) -> str:
    if not steps:
        return "- None"
    return "\n".join(f"- **{step.title}** ({step.status.value}): {step.description}" for step in steps)


def _captured_fields_md(fields: dict[str, str]) -> str:
    populated = [(k, v) for k, v in fields.items() if str(v).strip()]
    if not populated:
        return "- None"
    return "\n".join(f"- {key}: {value}" for key, value in sorted(populated))


def _list_md(items: list[str]) -> str:
    if not items:
        return "- None"
    return "\n".join(f"- {item}" for item in items)


def _citations_md(citations) -> str:
    if not citations:
        return "- No citations available for this session."
    return "\n".join(f"- [{citation.title}]({citation.url})" for citation in citations[:6])


def _advisor_questions(session: SessionState) -> list[str]:
    questions = [
        "Which assumptions in this packet should be verified before any filing action?",
        "Which missing entities block advisor-ready preparation?",
    ]

    if session.selected_flow_id == "cap_gap_transition_prep":
        questions.append("What petition-status evidence is needed to validate transition timing?")
    if "work_start_date" in session.missing_items:
        questions.append("What is the intended work start date and how does it affect timeline readiness?")
    if "employer_name" in session.missing_items:
        questions.append("Which employer details are required before handoff?")
    if session.scores.escalation_risk >= 70:
        questions.append("Should this case be escalated to immigration counsel for legal review?")

    return questions
