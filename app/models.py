from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class InterfaceMode(str, Enum):
    checklist = "checklist"
    timeline = "timeline"
    explain = "explain"
    doc_prep = "doc_prep"
    transition = "transition"
    advisor = "advisor"


class StepStatus(str, Enum):
    pending = "pending"
    complete = "complete"
    blocked = "blocked"


class EventType(str, Enum):
    field_update = "field_update"
    mark_step = "mark_step"
    unmark_step = "unmark_step"
    step_reopen = "step_reopen"
    inactivity = "inactivity"
    ask_help = "ask_help"
    mode_change = "mode_change"
    select_flow = "select_flow"


class SessionProfile(BaseModel):
    familiarity_level: str = Field(
        default="new",
        description="new, intermediate, advanced",
        pattern=r"^(new|intermediate|advanced)$",
    )
    preferred_mode: InterfaceMode = InterfaceMode.checklist
    stress_level: int = Field(default=3, ge=1, le=5)
    role: str = Field(default="student", pattern=r"^(student|caregiver|advisor_helper)$")


class Citation(BaseModel):
    source_id: str
    title: str
    url: str
    snippet: str


class WorkflowStep(BaseModel):
    step_id: str
    title: str
    description: str
    node_type: str = "structured_form"
    required_fields: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    status: StepStatus = StepStatus.pending
    source_ids: list[str] = Field(default_factory=list)


class FlowCandidate(BaseModel):
    flow_id: str
    title: str
    score: float
    reason: str


class DisambiguationCard(BaseModel):
    prompt: str
    options: list[str] = Field(default_factory=list)


class CaseGraphNode(BaseModel):
    node_id: str
    node_type: str
    title: str
    description: str
    required_fields: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    status: StepStatus = StepStatus.pending


class CaseGraphEdge(BaseModel):
    edge_id: str
    from_node: str
    to_node: str
    edge_type: str = "dependency"


class CaseGraph(BaseModel):
    flow_id: str = ""
    nodes: list[CaseGraphNode] = Field(default_factory=list)
    edges: list[CaseGraphEdge] = Field(default_factory=list)


class ScoreCard(BaseModel):
    understanding_score: int = Field(default=70, ge=0, le=100)
    clarity_score: int = Field(default=70, ge=0, le=100)
    completeness_score: int = Field(default=0, ge=0, le=100)
    escalation_risk: int = Field(default=15, ge=0, le=100)


class UserEvent(BaseModel):
    event_type: EventType
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AdaptationEvent(BaseModel):
    reason: str
    from_mode: InterfaceMode
    to_mode: InterfaceMode
    ui_changes: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MicroCheck(BaseModel):
    check_id: str
    prompt: str
    options: list[str]
    correct_option: str
    explanation: str


class MicroCheckResult(BaseModel):
    check_id: str
    selected_option: str
    is_correct: bool
    feedback: str


class SessionState(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    intent: str
    profile: SessionProfile

    selected_flow_id: str = ""
    selected_flow_title: str = ""
    scenario: str
    candidate_flows: list[FlowCandidate] = Field(default_factory=list)
    ambiguity_flags: list[str] = Field(default_factory=list)
    disambiguation_card: Optional[DisambiguationCard] = None

    current_mode: InterfaceMode

    case_graph: CaseGraph = Field(default_factory=CaseGraph)
    workflow: list[WorkflowStep] = Field(default_factory=list)

    required_entities: list[str] = Field(default_factory=list)
    fields: dict[str, str] = Field(default_factory=dict)
    missing_items: list[str] = Field(default_factory=list)

    scores: ScoreCard = Field(default_factory=ScoreCard)
    citations: list[Citation] = Field(default_factory=list)

    active_check_ids: list[str] = Field(default_factory=list)
    available_micro_checks: list[MicroCheck] = Field(default_factory=list)
    events: list[UserEvent] = Field(default_factory=list)
    adaptation_log: list[AdaptationEvent] = Field(default_factory=list)
    micro_checks: dict[str, MicroCheckResult] = Field(default_factory=dict)

    advisor_packet_markdown: Optional[str] = None


class StartSessionRequest(BaseModel):
    intent: str = Field(min_length=10, max_length=5000)
    profile: SessionProfile = Field(default_factory=SessionProfile)


class StartSessionResponse(BaseModel):
    session: SessionState
    micro_checks: list[MicroCheck]


class EventRequest(BaseModel):
    event_type: EventType
    payload: dict[str, Any] = Field(default_factory=dict)


class UIMutation(BaseModel):
    new_mode: InterfaceMode
    ui_changes: list[str] = Field(default_factory=list)
    reason: str


class EventResponse(BaseModel):
    session: SessionState
    mutation: UIMutation


class MicroCheckRequest(BaseModel):
    check_id: str
    selected_option: str


class MicroCheckResponse(BaseModel):
    result: MicroCheckResult
    session: SessionState
    mutation: UIMutation


class PacketResponse(BaseModel):
    session_id: str
    packet_markdown: str


class SourceDocument(BaseModel):
    source_id: str
    title: str
    url: str
    fetched_at: str
    source_type: str
    flows: list[str] = Field(default_factory=list)
    text: str


class SourceChunk(BaseModel):
    chunk_id: str
    source_id: str
    title: str
    url: str
    source_type: str
    flows: list[str] = Field(default_factory=list)
    text: str
