from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from app.models import CaseGraph, CaseGraphEdge, CaseGraphNode, FlowCandidate, StepStatus, WorkflowStep


class FlowAppliesIf(BaseModel):
    keywords_any: list[str] = Field(default_factory=list)
    status_any: list[str] = Field(default_factory=list)
    program_stage_any: list[str] = Field(default_factory=list)


class FlowNode(BaseModel):
    node_id: str
    node_type: str
    title: str
    description: str
    required_fields: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)


class FlowPack(BaseModel):
    flow_id: str
    title: str
    description: str
    applies_if: FlowAppliesIf
    required_entities: list[str] = Field(default_factory=list)
    step_nodes: list[FlowNode] = Field(default_factory=list)
    doc_requirements: list[str] = Field(default_factory=list)
    common_confusions: list[str] = Field(default_factory=list)
    micro_checks: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    handoff_rules: list[str] = Field(default_factory=list)
    disclaimer: str = "Workflow preparation assistant only. Not legal advice."


_STATUS_PATTERNS = [
    (re.compile(r"\bstem opt\b", re.I), "stem_opt"),
    (re.compile(r"\bopt\b", re.I), "opt"),
    (re.compile(r"\bf-?1\b", re.I), "f1"),
]

_STAGE_PATTERNS = [
    (re.compile(r"\benrolled|current student|this quarter|this semester\b", re.I), "enrolled"),
    (re.compile(r"\bgraduating|senior|last quarter\b", re.I), "graduating"),
    (re.compile(r"\bgraduated|alumni\b", re.I), "graduated"),
    (re.compile(r"\bworking|job|internship started\b", re.I), "working"),
]


class FlowPackStore:
    def __init__(self, flows_dir: str = "data/flows") -> None:
        self._flows_dir = Path(flows_dir)
        self._packs: dict[str, FlowPack] = {}
        self.reload()

    def reload(self) -> None:
        self._packs = {}
        if not self._flows_dir.exists():
            return

        for file_path in sorted(self._flows_dir.glob("*.json")):
            payload = json.loads(file_path.read_text())
            pack = FlowPack(**payload)
            self._packs[pack.flow_id] = pack

    def get(self, flow_id: str) -> Optional[FlowPack]:
        return self._packs.get(flow_id)

    def list(self) -> list[FlowPack]:
        return list(self._packs.values())

    def rank(self, intent: str, fields: Optional[dict[str, str]] = None) -> tuple[list[FlowCandidate], list[str], dict[str, str]]:
        fields = fields or {}
        entities = extract_entities(intent=intent, fields=fields)
        text = intent.lower()

        candidates: list[FlowCandidate] = []
        ambiguity_flags: list[str] = []

        for pack in self.list():
            score = 0.0
            matched_terms: list[str] = []

            for term in pack.applies_if.keywords_any:
                if term.lower() in text:
                    score += 1.4
                    matched_terms.append(term)

            if entities.get("status_type") and entities["status_type"] in pack.applies_if.status_any:
                score += 1.2
            if entities.get("program_stage") and entities["program_stage"] in pack.applies_if.program_stage_any:
                score += 1.2

            if fields.get("petition_status") and "cap_gap" in pack.flow_id:
                score += 1.0

            if score > 0:
                reason = "Matched: " + ", ".join(matched_terms[:3]) if matched_terms else "Matched context signals"
                candidates.append(
                    FlowCandidate(
                        flow_id=pack.flow_id,
                        title=pack.title,
                        score=round(score, 2),
                        reason=reason,
                    )
                )

        candidates.sort(key=lambda c: c.score, reverse=True)

        if not candidates:
            fallback = self.get("f1_work_basics")
            if fallback:
                candidates.append(
                    FlowCandidate(
                        flow_id=fallback.flow_id,
                        title=fallback.title,
                        score=0.1,
                        reason="Fallback orientation flow for ambiguous intent",
                    )
                )
                ambiguity_flags.append("no_direct_match")

        if len(candidates) >= 2:
            gap = candidates[0].score - candidates[1].score
            if gap < 1.6:
                ambiguity_flags.append("top_flows_close")

        if "cpt" in text and "opt" in text:
            ambiguity_flags.append("cpt_opt_overlap")

        if entities.get("program_stage") is None:
            ambiguity_flags.append("program_stage_unclear")
        if entities.get("status_type") is None:
            ambiguity_flags.append("status_unclear")

        return candidates, sorted(set(ambiguity_flags)), entities


def extract_entities(intent: str, fields: Optional[dict[str, str]] = None) -> dict[str, str]:
    fields = fields or {}
    entities: dict[str, str] = {}
    text = intent.lower()

    for pattern, status in _STATUS_PATTERNS:
        if pattern.search(text):
            entities["status_type"] = status
            break

    for pattern, stage in _STAGE_PATTERNS:
        if pattern.search(text):
            entities["program_stage"] = stage
            break

    if "h-1b" in text or "h1b" in text or "cap gap" in text:
        entities["petition_status"] = fields.get("petition_status", "filed_or_planned")

    if "internship" in text or "offer" in text or "job" in text:
        entities["employment_offer"] = fields.get("employment_offer", "yes")

    return entities


def build_case_graph(pack: FlowPack) -> CaseGraph:
    nodes: list[CaseGraphNode] = []
    edges: list[CaseGraphEdge] = []

    for node in pack.step_nodes:
        nodes.append(
            CaseGraphNode(
                node_id=node.node_id,
                node_type=node.node_type,
                title=node.title,
                description=node.description,
                required_fields=node.required_fields,
                dependencies=node.dependencies,
                status=StepStatus.pending,
            )
        )

    for node in pack.step_nodes:
        for dep in node.dependencies:
            edges.append(
                CaseGraphEdge(
                    edge_id=f"{dep}->{node.node_id}",
                    from_node=dep,
                    to_node=node.node_id,
                    edge_type="dependency",
                )
            )

    return CaseGraph(flow_id=pack.flow_id, nodes=nodes, edges=edges)


def graph_to_workflow(graph: CaseGraph) -> list[WorkflowStep]:
    steps: list[WorkflowStep] = []
    for node in graph.nodes:
        steps.append(
            WorkflowStep(
                step_id=node.node_id,
                title=node.title,
                description=node.description,
                node_type=node.node_type,
                required_fields=node.required_fields,
                dependencies=node.dependencies,
                status=node.status,
            )
        )
    return steps
