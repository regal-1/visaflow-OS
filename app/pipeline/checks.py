from __future__ import annotations

import json
from pathlib import Path

from app.models import MicroCheck, MicroCheckResult, SessionState


SHARED_CHECKS_PATH = Path("data/shared/micro_checks.json")


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
        checks.append(
            MicroCheck(
                check_id="flow_disambiguation_check",
                prompt="Which specialized flow should you confirm next?",
                options=session.disambiguation_card.options,
                correct_option=session.disambiguation_card.options[0],
                explanation="Choose the top matching flow first, then verify with advisor when uncertain.",
            )
        )

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
    missing = session.missing_items or ["status_type", "program_stage"]
    top_missing = missing[0]
    options = [
        top_missing,
        "ui_theme_color",
        "profile_avatar",
        "notification_sound",
    ]

    return MicroCheck(
        check_id="missing_item_check",
        prompt="Which missing item is currently the top blocker to readiness?",
        options=options,
        correct_option=top_missing,
        explanation="The top unresolved required entity should be resolved first.",
    )
