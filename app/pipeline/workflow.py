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
    completed: set[str] = set()

    for step in workflow:
        if step.dependencies and not all(dep in completed for dep in step.dependencies):
            step.status = StepStatus.blocked
            continue

        if not step.required_fields:
            if step.status != StepStatus.complete:
                step.status = StepStatus.pending
            else:
                completed.add(step.step_id)
            continue

        is_ready = all(str(field_values.get(field, "")).strip() for field in step.required_fields)
        step.status = StepStatus.complete if is_ready else StepStatus.pending
        if step.status == StepStatus.complete:
            completed.add(step.step_id)


def sync_graph_from_workflow(case_graph: CaseGraph, workflow: list[WorkflowStep]) -> None:
    status_map = {step.step_id: step.status for step in workflow}
    for node in case_graph.nodes:
        if node.node_id in status_map:
            node.status = status_map[node.node_id]


def mark_step(workflow: list[WorkflowStep], step_id: str, complete: bool) -> None:
    target = StepStatus.complete if complete else StepStatus.pending
    for step in workflow:
        if step.step_id == step_id:
            step.status = target
            break
