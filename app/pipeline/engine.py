from __future__ import annotations

from typing import Optional

from app.models import (
    DisambiguationCard,
    EventRequest,
    EventType,
    InterfaceMode,
    MicroCheck,
    MicroCheckRequest,
    MicroCheckResult,
    SessionState,
    StartSessionRequest,
    UIMutation,
)
from app.pipeline.adaptation import compute_adaptation
from app.pipeline.checks import build_micro_checks, evaluate_micro_check
from app.pipeline.flow_packs import FlowPack, FlowPackStore, build_case_graph, graph_to_workflow
from app.pipeline.packet import build_advisor_packet
from app.pipeline.scoring import recompute_scores
from app.pipeline.uscis_knowledge import USCISKnowledgeBase
from app.pipeline.workflow import (
    compute_missing_items,
    mark_step,
    refresh_workflow_step_statuses,
    sync_graph_from_workflow,
)


class PipelineEngine:
    def __init__(
        self,
        kb: Optional[USCISKnowledgeBase] = None,
        flow_store: Optional[FlowPackStore] = None,
    ) -> None:
        self.kb = kb or USCISKnowledgeBase()
        self.flow_store = flow_store or FlowPackStore()

    def start_session(self, request: StartSessionRequest) -> tuple[SessionState, list[MicroCheck], UIMutation]:
        candidates, flags, entities = self.flow_store.rank(intent=request.intent, fields={})

        selected_id = candidates[0].flow_id if candidates else "f1_work_basics"
        selected_pack = self._get_pack_or_fallback(selected_id)

        session = SessionState(
            intent=request.intent,
            profile=request.profile,
            selected_flow_id=selected_pack.flow_id,
            selected_flow_title=selected_pack.title,
            scenario=selected_pack.title,
            current_mode=request.profile.preferred_mode,
            candidate_flows=candidates,
            ambiguity_flags=flags,
            fields=self._entity_fields(entities),
        )

        self._apply_pack_state(session, selected_pack, preserve_fields=True)

        if self._needs_disambiguation(session):
            options = [f"{c.flow_id} | {c.title}" for c in session.candidate_flows[:3]]
            session.disambiguation_card = DisambiguationCard(
                prompt="Your input maps to multiple flows. Which path matches your case best?",
                options=options,
            )
        else:
            session.disambiguation_card = None

        self._refresh_session_state(session)
        mutation = compute_adaptation(session)

        checks = build_micro_checks(session)
        session.available_micro_checks = checks

        return session, checks, mutation

    def apply_event(self, session: SessionState, event: EventRequest) -> UIMutation:
        session.events.append(session_event(event))

        if event.event_type == EventType.select_flow:
            flow_id = str(event.payload.get("flow_id", "")).strip()
            if flow_id:
                self._select_flow(session, flow_id)

        elif event.event_type == EventType.field_update:
            field_name = str(event.payload.get("field", "")).strip()
            value = str(event.payload.get("value", "")).strip()
            if field_name:
                session.fields[field_name] = value

        elif event.event_type in {EventType.mark_step, EventType.unmark_step, EventType.step_reopen}:
            step_id = str(event.payload.get("step_id", "")).strip()
            if step_id:
                is_complete = event.event_type == EventType.mark_step
                mark_step(session.workflow, step_id=step_id, complete=is_complete)

        elif event.event_type == EventType.mode_change:
            mode_value = str(event.payload.get("mode", "")).strip()
            if mode_value in {m.value for m in InterfaceMode}:
                session.current_mode = InterfaceMode(mode_value)

        if event.event_type != EventType.select_flow and session.selected_flow_id:
            selected_pack = self._get_pack_or_fallback(session.selected_flow_id)
            session.required_entities = selected_pack.required_entities
            session.active_check_ids = selected_pack.micro_checks

        self._refresh_session_state(session)
        mutation = compute_adaptation(session)
        session.available_micro_checks = build_micro_checks(session)
        return mutation

    def apply_micro_check(self, session: SessionState, request: MicroCheckRequest) -> tuple[MicroCheckResult, UIMutation]:
        result = evaluate_micro_check(
            session=session,
            check_id=request.check_id,
            selected_option=request.selected_option,
        )
        session.micro_checks[result.check_id] = result

        self._refresh_session_state(session)
        mutation = compute_adaptation(session)
        session.available_micro_checks = build_micro_checks(session)
        return result, mutation

    def build_packet(self, session: SessionState) -> str:
        session.advisor_packet_markdown = build_advisor_packet(session)
        return session.advisor_packet_markdown

    def _refresh_session_state(self, session: SessionState) -> None:
        selected_pack = self._get_pack_or_fallback(session.selected_flow_id)
        session.required_entities = selected_pack.required_entities

        session.missing_items = compute_missing_items(session.required_entities, session.fields)
        refresh_workflow_step_statuses(session.workflow, session.fields)
        sync_graph_from_workflow(session.case_graph, session.workflow)

        session.scores = recompute_scores(
            session=session,
            required_fields=session.required_entities,
            flow_id=session.selected_flow_id,
        )

    def _select_flow(self, session: SessionState, flow_id: str) -> None:
        pack = self._get_pack_or_fallback(flow_id)
        self._apply_pack_state(session, pack, preserve_fields=True)

        session.disambiguation_card = None
        session.ambiguity_flags = [flag for flag in session.ambiguity_flags if flag != "top_flows_close"]

    def _apply_pack_state(self, session: SessionState, pack: FlowPack, preserve_fields: bool = True) -> None:
        existing_fields = dict(session.fields) if preserve_fields else {}

        graph = build_case_graph(pack)
        workflow = graph_to_workflow(graph)

        session.selected_flow_id = pack.flow_id
        session.selected_flow_title = pack.title
        session.scenario = pack.title
        session.required_entities = pack.required_entities
        session.active_check_ids = pack.micro_checks
        session.case_graph = graph
        session.workflow = workflow

        session.fields = existing_fields
        self._merge_entity_defaults(session)

        session.citations = self.kb.retrieve(
            query=f"{session.intent} {pack.title} {' '.join(pack.common_confusions[:2])}",
            top_k=5,
            flow_id=pack.flow_id,
        )

    def _merge_entity_defaults(self, session: SessionState) -> None:
        for entity in session.required_entities:
            session.fields.setdefault(entity, "")

    def _entity_fields(self, entities: dict[str, str]) -> dict[str, str]:
        return {k: v for k, v in entities.items() if v is not None}

    def _needs_disambiguation(self, session: SessionState) -> bool:
        flags = set(session.ambiguity_flags)
        if "top_flows_close" in flags:
            return True
        if "cpt_opt_overlap" in flags:
            return True
        if "no_direct_match" in flags:
            return True
        if len(session.candidate_flows) > 1 and session.candidate_flows[0].score < 2.3:
            return True
        return False

    def _get_pack_or_fallback(self, flow_id: str) -> FlowPack:
        pack = self.flow_store.get(flow_id)
        if pack:
            return pack

        fallback = self.flow_store.get("f1_work_basics")
        if fallback:
            return fallback

        packs = self.flow_store.list()
        if packs:
            return packs[0]

        raise ValueError("No flow packs available. Add JSON files under data/flows.")


# Pydantic enum-to-enum wrapper keeps handlers lean.
def session_event(event: EventRequest):
    from app.models import UserEvent

    return UserEvent(event_type=event.event_type, payload=event.payload)
