from __future__ import annotations

from datetime import datetime

from app.models import SessionState, StepStatus


def build_advisor_packet(session: SessionState) -> str:
    complete_steps = [step for step in session.workflow if step.status == StepStatus.complete]
    pending_steps = [step for step in session.workflow if step.status != StepStatus.complete]

    citations_md = "\n".join(
        f"- [{citation.title}]({citation.url})"
        for citation in session.citations[:6]
    )
    if not citations_md:
        citations_md = "- No external citations resolved in this session."

    candidate_md = "\n".join(
        f"- {candidate.title} ({candidate.flow_id}) score={candidate.score:.2f}"
        for candidate in session.candidate_flows[:4]
    ) or "- None"

    packet = f"""# VisaFlow Advisor Packet

Generated: {datetime.utcnow().isoformat()}Z  
Session ID: `{session.session_id}`

## Disclaimer
This packet is a workflow-preparation artifact and is **not legal advice**.

## Selected Flow
- Flow ID: `{session.selected_flow_id}`
- Flow Title: {session.selected_flow_title}
- Scenario Label: {session.scenario}

## Candidate Flows (Router Output)
{candidate_md}

## Intent Snapshot
- Intent: {session.intent}
- Ambiguity Flags: {", ".join(session.ambiguity_flags) if session.ambiguity_flags else "none"}

## Live Readiness Metrics
- Understanding Score: {session.scores.understanding_score}/100
- Clarity Score: {session.scores.clarity_score}/100
- Completeness Score: {session.scores.completeness_score}/100
- Escalation Risk: {session.scores.escalation_risk}/100

## Completed Nodes
{_steps_as_markdown(complete_steps)}

## Remaining Nodes
{_steps_as_markdown(pending_steps)}

## Missing Required Entities
{_list_as_markdown(session.missing_items)}

## Advisor / Attorney Questions
{_list_as_markdown(_advisor_questions(session))}

## Source Context
{citations_md}
"""
    return packet


def _steps_as_markdown(steps) -> str:
    if not steps:
        return "- None"
    return "\n".join(f"- {step.title}: {step.description}" for step in steps)


def _list_as_markdown(items: list[str]) -> str:
    if not items:
        return "- None"
    return "\n".join(f"- {item}" for item in items)


def _advisor_questions(session: SessionState) -> list[str]:
    questions = [
        "Which timeline assumptions in this packet need official confirmation?",
        "Which unresolved entities block next-step readiness?",
    ]

    if session.selected_flow_id == "cap_gap_transition_prep":
        questions.append("Can we validate petition-state timing and bridge assumptions?")
    if session.scores.escalation_risk >= 65:
        questions.append("Should this case be escalated to licensed legal counsel?")

    if "employer_name" in session.missing_items:
        questions.append("Which employer details are mandatory before workflow handoff?")
    if "petition_status" in session.missing_items:
        questions.append("What petition documentation should be requested from employer or counsel?")

    return questions
