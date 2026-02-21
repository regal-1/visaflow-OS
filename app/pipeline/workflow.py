from __future__ import annotations

from app.models import CaseGraph, StepStatus, WorkflowStep


def compute_missing_items(required_fields: list[str], field_values: dict[str, str]) -> list[str]:
    missing: list[str] = []
    for field in required_fields:
        value = str(field_values.get(field, "")).strip()
        if not value:
            missing.append(field)
    return missing


def refresh_workflow_step_statuses(workflow: list[WorkflowStep], field_values: dict[str, str]) -> None:
    step_map = {step.step_id: step for step in workflow}

    # Flow packs are authored in dependency order for this MVP.
    for step in workflow:
        deps_satisfied = all(
            step_map[dep].status == StepStatus.complete
            for dep in step.dependencies
            if dep in step_map
        )
        if not deps_satisfied:
            step.status = StepStatus.blocked
            continue

        if step.manually_completed:
            step.status = StepStatus.complete
            continue

        if not step.required_fields:
            if step.status == StepStatus.blocked:
                step.status = StepStatus.pending
            continue

        has_required_values = all(
            str(field_values.get(field, "")).strip()
            for field in step.required_fields
        )
        step.status = StepStatus.complete if has_required_values else StepStatus.pending


def sync_graph_from_workflow(case_graph: CaseGraph, workflow: list[WorkflowStep]) -> None:
    status_map = {step.step_id: step.status for step in workflow}
    for node in case_graph.nodes:
        if node.node_id in status_map:
            node.status = status_map[node.node_id]


def mark_step(workflow: list[WorkflowStep], step_id: str, complete: bool) -> None:
    for step in workflow:
        if step.step_id == step_id:
            step.manually_completed = complete
            step.status = StepStatus.complete if complete else StepStatus.pending
            break
