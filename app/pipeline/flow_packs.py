from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

from app.models import CaseGraph, CaseGraphEdge, CaseGraphNode, FlowCandidate, StepStatus, WorkflowStep


TOKEN_RE = re.compile(r"[a-zA-Z0-9\-_/]{2,}")


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


STATUS_PATTERNS = [
    (re.compile(r"\bcap[\s\-]?gap\b", re.I), "cap_gap"),
    (re.compile(r"\bh-?1b\b", re.I), "h1b"),
    (re.compile(r"\bcpt\b", re.I), "cpt"),
    (re.compile(r"\bstem opt\b", re.I), "stem_opt"),
    (re.compile(r"\bopt\b", re.I), "opt"),
    (re.compile(r"\bf-?1\b", re.I), "f1"),
]

STAGE_PATTERNS = [
    (re.compile(r"\benrolled|current student|this quarter|this semester|while studying\b", re.I), "enrolled"),
    (re.compile(r"\bgraduating|graduation|final quarter|about to graduate\b", re.I), "graduating"),
    (re.compile(r"\bgraduated|alumni\b", re.I), "graduated"),
    (re.compile(r"\bworking|already working|currently employed\b", re.I), "working"),
]

PETITION_PATTERNS = [
    (re.compile(r"\bfiled|submitted|registered\b", re.I), "filed"),
    (re.compile(r"\bpending|waiting|processing\b", re.I), "pending"),
    (re.compile(r"\bapproved|selected\b", re.I), "approved_or_selected"),
    (re.compile(r"\brejected|denied|not selected\b", re.I), "denied_or_not_selected"),
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

    def rank(
        self,
        intent: str,
        fields: Optional[dict[str, str]] = None,
    ) -> tuple[list[FlowCandidate], list[str], dict[str, str]]:
        fields = fields or {}
        entities = extract_entities(intent=intent, fields=fields)
        text = intent.lower()
        tokens = _tokenize(intent)
        explicit_cpt_opt_ambiguity = "cpt" in text and "opt" in text

        candidates: list[FlowCandidate] = []
        ambiguity_flags: list[str] = []

        for pack in self.list():
            score = 0.0
            reasons: list[str] = []

            keyword_hits = _keyword_hits(text=text, tokens=tokens, keywords=pack.applies_if.keywords_any)
            if keyword_hits:
                score += 1.4 * len(keyword_hits)
                reasons.append(f"keywords: {', '.join(keyword_hits[:3])}")

            status = entities.get("status_type")
            if status and pack.applies_if.status_any:
                normalized_statuses = {_normalize_status(v) for v in pack.applies_if.status_any}
                status_equivalents = _status_equivalents(status)
                if status_equivalents.intersection(normalized_statuses):
                    score += 1.8
                    reasons.append("status match")
                    if pack.flow_id == "cpt_prep" and "cpt" in status_equivalents:
                        score += 0.9
                        reasons.append("explicit CPT status")
                    if pack.flow_id == "cap_gap_transition_prep" and status_equivalents.intersection({"h1b", "cap_gap"}):
                        score += 1.1
                        reasons.append("transition status signal")
                else:
                    score -= 0.6

            stage = entities.get("program_stage")
            if stage and pack.applies_if.program_stage_any:
                normalized_stages = {_normalize_value(v) for v in pack.applies_if.program_stage_any}
                if _normalize_value(stage) in normalized_stages:
                    score += 1.6
                    reasons.append("program stage match")
                else:
                    score -= 0.6

            if pack.flow_id == "cap_gap_transition_prep" and (
                "h-1b" in text or "h1b" in text or "cap gap" in text or entities.get("petition_status")
            ):
                score += 2.2
                reasons.append("transition petition signal")

            if pack.flow_id == "cpt_prep" and ("internship" in text or stage == "enrolled"):
                score += 0.9

            if pack.flow_id == "opt_initial_prep" and ("opt" in text or stage in {"graduating", "graduated"}):
                score += 0.9

            if explicit_cpt_opt_ambiguity:
                if pack.flow_id == "f1_work_basics":
                    score += 3.0
                    reasons.append("explicit CPT/OPT ambiguity")
                if pack.flow_id in {"cpt_prep", "opt_initial_prep"}:
                    score -= 1.2

            if score >= 0.6:
                reason = "; ".join(reasons[:2]) if reasons else "general intent fit"
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
                candidates = [
                    FlowCandidate(
                        flow_id=fallback.flow_id,
                        title=fallback.title,
                        score=0.2,
                        reason="fallback orientation flow",
                    )
                ]
                ambiguity_flags.append("no_direct_match")

        if len(candidates) >= 2:
            if (candidates[0].score - candidates[1].score) < 1.1:
                ambiguity_flags.append("top_flows_close")

        candidate_ids = {c.flow_id for c in candidates[:3]}
        if "cpt_prep" in candidate_ids and "opt_initial_prep" in candidate_ids and not entities.get("program_stage"):
            ambiguity_flags.append("cpt_opt_overlap")

        if candidates and candidates[0].score < 2.0:
            ambiguity_flags.append("low_confidence_route")

        if not entities.get("program_stage"):
            ambiguity_flags.append("program_stage_unclear")
        if not entities.get("status_type"):
            ambiguity_flags.append("status_unclear")

        return candidates, sorted(set(ambiguity_flags)), entities


def extract_entities(intent: str, fields: Optional[dict[str, str]] = None) -> dict[str, str]:
    fields = fields or {}
    text = intent.lower()
    entities: dict[str, str] = {}

    for key in (
        "status_type",
        "program_stage",
        "petition_status",
        "employment_offer",
        "employer_name",
        "work_start_date",
        "work_end_date",
        "graduation_date",
    ):
        value = str(fields.get(key, "")).strip()
        if value:
            entities[key] = value

    if "status_type" not in entities:
        for pattern, status in STATUS_PATTERNS:
            if pattern.search(text):
                entities["status_type"] = status
                break

    if "program_stage" not in entities:
        for pattern, stage in STAGE_PATTERNS:
            if pattern.search(text):
                entities["program_stage"] = stage
                break
    normalized_status = _normalize_status(entities.get("status_type", ""))
    if "program_stage" not in entities and normalized_status == "cpt":
        entities["program_stage"] = "enrolled"
    if "program_stage" not in entities and normalized_status in {"h1b", "cap_gap"}:
        entities["program_stage"] = "working"

    if "petition_status" not in entities and ("h-1b" in text or "h1b" in text or "cap gap" in text):
        entities["petition_status"] = "unknown"
        for pattern, value in PETITION_PATTERNS:
            if pattern.search(text):
                entities["petition_status"] = value
                break
    if "petition_status" not in entities and normalized_status in {"h1b", "cap_gap"}:
        entities["petition_status"] = "unknown"

    if "employment_offer" not in entities:
        if re.search(r"\binternship|offer|job|employment\b", text, re.I):
            entities["employment_offer"] = "yes"

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
    return [
        WorkflowStep(
            step_id=node.node_id,
            title=node.title,
            description=node.description,
            node_type=node.node_type,
            required_fields=node.required_fields,
            dependencies=node.dependencies,
            status=node.status,
        )
        for node in graph.nodes
    ]


def _tokenize(text: str) -> set[str]:
    return {token.lower() for token in TOKEN_RE.findall(text)}


def _keyword_hits(text: str, tokens: set[str], keywords: list[str]) -> list[str]:
    hits: list[str] = []
    lowered = text.lower()
    for raw in keywords:
        kw = raw.lower().strip()
        if not kw:
            continue
        if " " in kw:
            if kw in lowered:
                hits.append(raw)
        elif kw in tokens:
            hits.append(raw)
    return hits


def _normalize_value(value: str) -> str:
    return value.strip().lower().replace("-", "_")


def _normalize_status(value: str) -> str:
    normalized = _normalize_value(value)
    if normalized in {"f_1", "f1", "f-1"}:
        return "f1"
    if normalized in {"stem", "stemopt", "stem_opt"}:
        return "stem_opt"
    if normalized in {"capgap", "cap_gap"}:
        return "cap_gap"
    return normalized


def _status_equivalents(status: str) -> set[str]:
    normalized = _normalize_status(status)
    if normalized == "cpt":
        return {"cpt", "f1"}
    if normalized == "stem_opt":
        return {"stem_opt", "opt"}
    if normalized == "cap_gap":
        return {"cap_gap", "h1b", "opt", "stem_opt", "f1"}
    if normalized == "h1b":
        return {"h1b", "cap_gap", "opt", "stem_opt", "f1"}
    return {normalized}
