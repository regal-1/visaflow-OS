from __future__ import annotations

import json
from pathlib import Path

from app.models import MicroCheck, MicroCheckResult, SessionState


SHARED_CHECKS_PATH = Path("data/shared/micro_checks.json")
GENERIC_FIELDS = [
    "status_type",
    "program_stage",
    "employment_offer",
    "employer_name",
    "work_start_date",
    "documents_available",
]


def _load_shared_checks() -> dict[str, MicroCheck]:
    if not SHARED_CHECKS_PATH.exists():
        return {}
    payload = json.loads(SHARED_CHECKS_PATH.read_text())
    checks = payload.get("checks", [])
    return {check["check_id"]: MicroCheck(**check) for check in checks}


SHARED_CHECKS = _load_shared_checks()


def build_micro_checks(session: SessionState) -> list[MicroCheck]:
    checks: list[MicroCheck] = []

    for check_id in session.active_check_ids:
        check = SHARED_CHECKS.get(check_id)
        if check:
            checks.append(check)

    checks.append(_build_missing_item_check(session))

    if session.disambiguation_card is not None:
        checks.append(_build_disambiguation_check(session))

    return checks


def evaluate_micro_check(
    session: SessionState,
    check_id: str,
    selected_option: str,
) -> MicroCheckResult:
    checks = {check.check_id: check for check in build_micro_checks(session)}
    check = checks.get(check_id)
    if not check:
        return MicroCheckResult(
            check_id=check_id,
            selected_option=selected_option,
            is_correct=False,
            feedback="Unknown check id.",
        )

    is_correct = selected_option == check.correct_option
    feedback = (
        f"Correct. {check.explanation}"
        if is_correct
        else f"Not quite. {check.explanation}"
    )

    return MicroCheckResult(
        check_id=check_id,
        selected_option=selected_option,
        is_correct=is_correct,
        feedback=feedback,
    )


def _build_missing_item_check(session: SessionState) -> MicroCheck:
    missing = session.missing_items or ["status_type"]
    top_missing = missing[0]

    distractors: list[str] = []
    for field in session.required_entities + GENERIC_FIELDS:
        if field != top_missing and field not in missing and field not in distractors:
            distractors.append(field)
        if len(distractors) >= 3:
            break

    while len(distractors) < 3:
        fallback = GENERIC_FIELDS[len(distractors) % len(GENERIC_FIELDS)]
        if fallback != top_missing and fallback not in distractors:
            distractors.append(fallback)

    options = [top_missing] + distractors

    return MicroCheck(
        check_id="missing_item_check",
        prompt="Which unresolved item is currently the top blocker to readiness?",
        options=options,
        correct_option=top_missing,
        explanation="Resolve the highest-priority missing required entity first.",
    )


def _build_disambiguation_check(session: SessionState) -> MicroCheck:
    parsed_options = [_parse_option(option) for option in session.disambiguation_card.options]
    labels = [label for _, label in parsed_options]
    correct_label = labels[0] if labels else "Top ranked flow"

    return MicroCheck(
        check_id="flow_disambiguation_check",
        prompt="Which route should you confirm first based on current context?",
        options=labels,
        correct_option=correct_label,
        explanation="Start with the highest-ranked route, then validate assumptions with an advisor.",
    )


def _parse_option(raw: str) -> tuple[str, str]:
    if "|" not in raw:
        value = raw.strip()
        return value, value
    left, right = raw.split("|", 1)
    return left.strip(), right.strip()
