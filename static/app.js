const state = {
  session: null,
  scenarios: [],
  eventLog: [],
  selectedNodeId: null,
  activeTab: "input",
  lastMutation: null,
};

const LEGACY_BASELINES = {
  cpt_prep: { steps: 12, prepHours: 5.5 },
  opt_initial_prep: { steps: 14, prepHours: 6.5 },
  opt_stem_prep: { steps: 13, prepHours: 6.0 },
  cap_gap_transition_prep: { steps: 16, prepHours: 7.0 },
  f1_work_basics: { steps: 9, prepHours: 4.0 },
};

const els = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: {
    input: document.getElementById("tab-input"),
    process: document.getElementById("tab-process"),
    docs: document.getElementById("tab-docs"),
  },

  intent: document.getElementById("intent"),
  familiarity: document.getElementById("familiarity"),
  role: document.getElementById("role"),
  preferredMode: document.getElementById("preferred_mode"),
  stressLevel: document.getElementById("stress_level"),
  startBtn: document.getElementById("start_btn"),

  scenarioChips: document.getElementById("scenario_chips"),
  candidateFlows: document.getElementById("candidate_flows"),
  disambiguationCard: document.getElementById("disambiguation_card"),
  disambiguationPrompt: document.getElementById("disambiguation_prompt"),
  disambiguationOptions: document.getElementById("disambiguation_options"),

  scenario: document.getElementById("scenario"),
  sessionId: document.getElementById("session_id"),
  progressText: document.getElementById("progress_text"),

  modeRow: document.getElementById("mode_row"),
  workflowSteps: document.getElementById("workflow_steps"),

  understanding: document.getElementById("understanding"),
  clarity: document.getElementById("clarity"),
  completeness: document.getElementById("completeness"),
  escalationRisk: document.getElementById("escalation_risk"),
  understandingBar: document.getElementById("understanding_bar"),
  clarityBar: document.getElementById("clarity_bar"),
  completenessBar: document.getElementById("completeness_bar"),
  riskBar: document.getElementById("risk_bar"),

  adaptiveSurface: document.getElementById("adaptive_surface"),

  microChecks: document.getElementById("micro_checks"),
  simulateConfusion: document.getElementById("simulate_confusion"),
  askHelp: document.getElementById("ask_help"),
  eventStream: document.getElementById("event_stream"),
  adaptationLog: document.getElementById("adaptation_log"),

  graphSvg: document.getElementById("graph_svg"),
  graphLegend: document.getElementById("graph_legend"),

  outcomeSummary: document.getElementById("outcome_summary"),
  transitionBridge: document.getElementById("transition_bridge"),
  bridgeRow: document.getElementById("bridge_row"),

  fields: Array.from(document.querySelectorAll(".case-field")),
  missingItems: document.getElementById("missing_items"),
  citations: document.getElementById("citations"),
  generatePacket: document.getElementById("generate_packet"),
  packetOutput: document.getElementById("packet_output"),
};

const MODES = ["checklist", "timeline", "explain", "doc_prep", "transition", "advisor"];

const MODE_SCENE = {
  checklist: {
    title: "Checklist-first mode",
    copy: "This view prioritizes unresolved steps and immediate next actions.",
    tags: ["Simple execution", "Dependency aware"],
  },
  timeline: {
    title: "Timeline mode",
    copy: "This view emphasizes sequencing and timing dependencies.",
    tags: ["Date-focused", "Forward planning"],
  },
  explain: {
    title: "Explain mode",
    copy: "This view simplifies language and clarifies why each step matters.",
    tags: ["Plain language", "Guided support"],
  },
  doc_prep: {
    title: "Docs prep mode",
    copy: "This view focuses on missing documents and structured field completion.",
    tags: ["Missing items", "Readiness focus"],
  },
  transition: {
    title: "Transition mode",
    copy: "This view highlights transition-state dependencies and bridge timelines.",
    tags: ["Bridge logic", "Petition context"],
  },
  advisor: {
    title: "Advisor mode",
    copy: "This view prioritizes escalation and handoff quality.",
    tags: ["Escalation", "Safe handoff"],
  },
};

boot();

async function boot() {
  bindEvents();
  await loadScenarios();
  renderScenarioChips();
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  els.startBtn.addEventListener("click", startSession);
  els.simulateConfusion.addEventListener("click", () => sendEvent("inactivity", { seconds: 25 }));
  els.askHelp.addEventListener("click", () => sendEvent("ask_help", { topic: "clarification" }));
  els.generatePacket.addEventListener("click", generatePacket);

  for (const input of els.fields) {
    input.addEventListener("change", (event) => {
      const field = event.target.dataset.field;
      const value = event.target.value;
      sendEvent("field_update", { field, value });
    });
  }
}

function setTab(tabName) {
  state.activeTab = tabName;
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));

  Object.entries(els.panels).forEach(([name, panel]) => {
    panel.classList.toggle("active", name === tabName);
  });
}

async function loadScenarios() {
  const res = await fetch("/api/scenarios");
  if (!res.ok) return;
  const data = await res.json();
  state.scenarios = data.scenarios || [];
}

function renderScenarioChips() {
  els.scenarioChips.innerHTML = "";

  if (!state.scenarios.length) {
    const span = document.createElement("span");
    span.className = "chip";
    span.textContent = "No scenarios available";
    els.scenarioChips.appendChild(span);
    return;
  }

  for (const scenario of state.scenarios) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = scenario.scenario_id.replaceAll("_", " ");
    btn.addEventListener("click", () => {
      els.intent.value = scenario.intent;
      addEvent(`Preset loaded: ${scenario.scenario_id}`, "info");
      renderEventStream();
    });
    els.scenarioChips.appendChild(btn);
  }
}

async function startSession() {
  const payload = {
    intent: els.intent.value,
    profile: {
      familiarity_level: els.familiarity.value,
      preferred_mode: els.preferredMode.value,
      stress_level: Number(els.stressLevel.value),
      role: els.role.value,
    },
  };

  const res = await fetch("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    alert("Failed to start session");
    return;
  }

  const data = await res.json();
  state.session = data.session;
  state.selectedNodeId = null;
  state.lastMutation = {
    new_mode: data.session.current_mode,
    reason: "Session initialized from your preferred mode.",
  };

  addEvent("Session started", "success");
  render();
  setTab("process");
}

async function sendEvent(eventType, payload = {}) {
  if (!state.session) return;

  const res = await fetch(`/api/session/${state.session.session_id}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType, payload }),
  });

  if (!res.ok) {
    alert("Event failed");
    return;
  }

  const data = await res.json();
  state.session = data.session;
  state.lastMutation = data.mutation;

  const summary = eventType === "field_update"
    ? `Updated ${payload.field}`
    : eventType === "select_flow"
      ? `Selected flow ${payload.flow_id}`
      : eventType === "mode_change"
        ? `Mode changed to ${payload.mode}`
      : eventType;

  addEvent(`${summary} -> ${data.mutation.new_mode} | ${data.mutation.reason}`, "info");
  render();
}

async function answerMicroCheck(checkId, selectedOption) {
  if (!state.session) return;

  const res = await fetch(`/api/session/${state.session.session_id}/micro-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ check_id: checkId, selected_option: selectedOption }),
  });

  if (!res.ok) {
    alert("Micro-check failed");
    return;
  }

  const data = await res.json();
  state.session = data.session;
  state.lastMutation = data.mutation;
  addEvent(`Micro-check ${checkId}: ${data.result.is_correct ? "correct" : "incorrect"}`, data.result.is_correct ? "success" : "warn");
  render();
}

async function generatePacket() {
  if (!state.session) return;

  const res = await fetch(`/api/session/${state.session.session_id}/packet`, {
    method: "POST",
  });

  if (!res.ok) {
    alert("Packet generation failed");
    return;
  }

  const data = await res.json();
  els.packetOutput.textContent = data.packet_markdown;
  addEvent("Advisor packet generated", "success");
  renderEventStream();
  setTab("docs");
}

function addEvent(text, level) {
  const stamp = new Date().toLocaleTimeString("en-US", { hour12: false });
  state.eventLog.unshift({ text, level, stamp });
  if (state.eventLog.length > 40) {
    state.eventLog = state.eventLog.slice(0, 40);
  }
}

function render() {
  const session = state.session;
  if (!session) return;

  els.scenario.textContent = `Scenario: ${session.selected_flow_title} (${session.selected_flow_id})`;
  els.sessionId.textContent = `Session: ${session.session_id}`;

  renderScore(els.understanding, els.understandingBar, session.scores.understanding_score);
  renderScore(els.clarity, els.clarityBar, session.scores.clarity_score);
  renderScore(els.completeness, els.completenessBar, session.scores.completeness_score);
  renderScore(els.escalationRisk, els.riskBar, session.scores.escalation_risk);

  renderProgress(session);
  renderModes(session.current_mode);
  renderAdaptiveSurface(session);
  renderWorkflowSteps(session.workflow || [], session.current_mode);
  renderCandidateFlows(session.candidate_flows || [], session.selected_flow_id);
  renderDisambiguation(session.disambiguation_card);
  renderChecks(session.available_micro_checks || []);
  renderMissingItems(session.missing_items || []);
  renderCitations(session.citations || []);
  renderGraph(session.case_graph || { nodes: [], edges: [] });
  renderOutcomes(session);
  renderAdaptationLog(session.adaptation_log || []);
  renderEventStream();
  populateFields(session.fields || {});

  if (session.advisor_packet_markdown) {
    els.packetOutput.textContent = session.advisor_packet_markdown;
  }
}

function renderProgress(session) {
  const complete = (session.workflow || []).filter((step) => step.status === "complete").length;
  const total = Math.max(1, (session.workflow || []).length);
  const pct = Math.round((complete / total) * 100);
  els.progressText.textContent = `Progress: ${pct}% complete`;
}

function renderScore(valueEl, barEl, value) {
  const n = Number(value || 0);
  valueEl.textContent = `${n}%`;
  barEl.style.width = `${Math.max(0, Math.min(100, n))}%`;
}

function renderModes(currentMode) {
  els.modeRow.innerHTML = "";

  for (const mode of MODES) {
    const btn = document.createElement("button");
    btn.className = `mode-pill ${mode === currentMode ? "active" : ""}`;
    btn.textContent = mode;
    btn.addEventListener("click", () => sendEvent("mode_change", { mode }));
    els.modeRow.appendChild(btn);
  }
}

function renderAdaptiveSurface(session) {
  const scene = MODE_SCENE[session.current_mode] || MODE_SCENE.checklist;
  const missing = (session.missing_items || []).slice(0, 4).join(", ") || "none";
  const nextStep = (session.workflow || []).find((step) => step.status !== "complete");
  const nextStepLabel = nextStep ? nextStep.title : "All workflow steps complete";
  const reason = state.lastMutation?.reason || "Mode selected based on your current readiness state.";

  els.adaptiveSurface.innerHTML = `
    <h3>${scene.title}</h3>
    <p>${scene.copy}</p>
    <p><strong>Why this mode:</strong> ${reason}</p>
    <p><strong>Next best action:</strong> ${nextStepLabel}</p>
    <p><strong>Missing required entities:</strong> ${missing}</p>
    <div class="chip-wrap">${scene.tags.map((tag) => `<span class="chip">${tag}</span>`).join("")}</div>
  `;
}

function renderOutcomes(session) {
  if (!els.outcomeSummary) return;

  const baseline = LEGACY_BASELINES[session.selected_flow_id] || LEGACY_BASELINES.f1_work_basics;
  const dynamicSteps = (session.workflow || []).length || 1;
  const completedSteps = (session.workflow || []).filter((step) => step.status === "complete").length;
  const unresolved = (session.missing_items || []).length;
  const stepsReduced = Math.max(0, baseline.steps - dynamicSteps);
  const readinessDelta = Math.max(0, session.scores.completeness_score - 30);
  const estPrepHours = Math.max(1.5, baseline.prepHours - (stepsReduced * 0.25) - (readinessDelta * 0.01));

  els.outcomeSummary.innerHTML = "";
  const lines = [
    `Routed flow: ${session.selected_flow_title}`,
    `Flow steps reduced vs legacy: ${stepsReduced} (${baseline.steps} -> ${dynamicSteps})`,
    `Live readiness: ${session.scores.completeness_score}% complete`,
    `Understanding score: ${session.scores.understanding_score}%`,
    `Missing blockers caught before advisor handoff: ${unresolved}`,
    `Estimated prep time: ~${estPrepHours.toFixed(1)}h (legacy ~${baseline.prepHours.toFixed(1)}h)`,
    `Completed workflow nodes: ${completedSteps}/${dynamicSteps}`,
  ];
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    els.outcomeSummary.appendChild(li);
  }

  renderTransitionBridge(session);
}

function renderTransitionBridge(session) {
  if (!els.transitionBridge || !els.bridgeRow) return;
  const isTransition = session.selected_flow_id === "cap_gap_transition_prep" || session.current_mode === "transition";
  if (!isTransition) {
    els.transitionBridge.classList.add("hidden");
    els.bridgeRow.innerHTML = "";
    return;
  }

  els.transitionBridge.classList.remove("hidden");
  const statusValue = String(session.fields.status_type || "").toLowerCase();
  const petitionValue = String(session.fields.petition_status || "").toLowerCase();
  const isBridgeKnown = petitionValue && petitionValue !== "unknown";

  const phases = [
    {
      label: "Current Status",
      detail: statusValue || "missing",
      done: Boolean(statusValue),
    },
    {
      label: "Cap Gap Bridge",
      detail: isBridgeKnown ? petitionValue : "verify petition state",
      done: isBridgeKnown,
    },
    {
      label: "H-1B Transition Prep",
      detail: session.scores.escalation_risk >= 70 ? "advisor review required" : "handoff packet ready",
      done: session.scores.completeness_score >= 70,
    },
  ];

  els.bridgeRow.innerHTML = phases
    .map(
      (phase) => `
        <div class="bridge-step ${phase.done ? "done" : ""}">
          <strong>${phase.label}</strong>
          <span>${phase.detail}</span>
        </div>
      `
    )
    .join('<span class="bridge-arrow">-></span>');
}

function renderWorkflowSteps(steps, mode) {
  els.workflowSteps.innerHTML = "";

  if (!steps.length) {
    const li = document.createElement("li");
    li.textContent = "No workflow yet. Start a session in Input.";
    els.workflowSteps.appendChild(li);
    return;
  }

  for (const step of steps) {
    const li = document.createElement("li");

    const title = document.createElement("strong");
    title.textContent = `${step.title} (${step.status})`;

    const detail = document.createElement("div");
    detail.className = "muted";
    detail.textContent = describeStep(step, mode);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "0.35rem";
    actions.style.marginTop = "0.35rem";

    const markBtn = document.createElement("button");
    markBtn.textContent = step.status === "complete" ? "Mark Pending" : "Mark Complete";
    markBtn.addEventListener("click", () =>
      sendEvent(step.status === "complete" ? "unmark_step" : "mark_step", { step_id: step.step_id })
    );

    const reopenBtn = document.createElement("button");
    reopenBtn.textContent = "Reopen";
    reopenBtn.addEventListener("click", () => sendEvent("step_reopen", { step_id: step.step_id }));

    actions.appendChild(markBtn);
    actions.appendChild(reopenBtn);

    li.appendChild(title);
    li.appendChild(detail);
    li.appendChild(actions);
    els.workflowSteps.appendChild(li);
  }
}

function describeStep(step, mode) {
  if (mode === "checklist") {
    return `Required: ${step.required_fields && step.required_fields.length ? step.required_fields.join(", ") : "none"}`;
  }
  if (mode === "timeline") {
    return `Depends on: ${step.dependencies && step.dependencies.length ? step.dependencies.join(", ") : "start"}`;
  }
  if (mode === "explain") {
    return step.description;
  }
  return step.description;
}

function renderCandidateFlows(candidates, selectedFlowId) {
  els.candidateFlows.innerHTML = "";

  if (!candidates.length) {
    const li = document.createElement("li");
    li.textContent = "No suggested flows yet.";
    els.candidateFlows.appendChild(li);
    return;
  }

  for (const candidate of candidates) {
    const li = document.createElement("li");

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.gap = "0.35rem";

    const title = document.createElement("strong");
    title.textContent = `${candidate.title}${candidate.flow_id === selectedFlowId ? " ✓" : ""}`;

    const selectBtn = document.createElement("button");
    selectBtn.textContent = "Select";
    selectBtn.addEventListener("click", () => sendEvent("select_flow", { flow_id: candidate.flow_id }));

    row.appendChild(title);
    row.appendChild(selectBtn);

    const meta = document.createElement("div");
    meta.className = "muted";
    meta.textContent = `score ${candidate.score} | ${candidate.reason}`;

    li.appendChild(row);
    li.appendChild(meta);
    els.candidateFlows.appendChild(li);
  }
}

function renderDisambiguation(card) {
  if (!card) {
    els.disambiguationCard.classList.add("hidden");
    els.disambiguationPrompt.textContent = "";
    els.disambiguationOptions.innerHTML = "";
    return;
  }

  els.disambiguationCard.classList.remove("hidden");
  els.disambiguationPrompt.textContent = card.prompt;
  els.disambiguationOptions.innerHTML = "";

  for (const option of card.options) {
    const [flowRaw, labelRaw] = option.split("|");
    const flowId = (flowRaw || "").trim();
    const label = (labelRaw || option).trim();

    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = label;
    btn.addEventListener("click", () => sendEvent("select_flow", { flow_id: flowId }));
    els.disambiguationOptions.appendChild(btn);
  }
}

function renderChecks(checks) {
  els.microChecks.innerHTML = "";

  if (!checks.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No checks available yet.";
    els.microChecks.appendChild(p);
    return;
  }

  for (const check of checks) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.padding = "0.45rem";

    const q = document.createElement("p");
    q.style.margin = "0";
    q.style.fontSize = "0.79rem";
    q.innerHTML = `<strong>${check.prompt}</strong>`;

    const row = document.createElement("div");
    row.className = "chip-wrap";
    row.style.marginTop = "0.35rem";

    for (const option of check.options) {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.textContent = option;
      btn.addEventListener("click", () => answerMicroCheck(check.check_id, option));
      row.appendChild(btn);
    }

    card.appendChild(q);
    card.appendChild(row);

    const result = state.session.micro_checks[check.check_id];
    if (result) {
      const fb = document.createElement("p");
      fb.style.margin = "0.35rem 0 0";
      fb.style.fontSize = "0.74rem";
      fb.style.color = result.is_correct ? "#97f2c1" : "#ffb5c5";
      fb.textContent = result.feedback;
      card.appendChild(fb);
    }

    els.microChecks.appendChild(card);
  }
}

function renderMissingItems(missing) {
  els.missingItems.innerHTML = "";

  if (!missing.length) {
    const li = document.createElement("li");
    li.textContent = "No missing required items.";
    els.missingItems.appendChild(li);
    return;
  }

  for (const item of missing) {
    const li = document.createElement("li");
    li.textContent = item;
    els.missingItems.appendChild(li);
  }
}

function renderCitations(citations) {
  els.citations.innerHTML = "";

  if (!citations.length) {
    const li = document.createElement("li");
    li.textContent = "No source context loaded yet.";
    els.citations.appendChild(li);
    return;
  }

  for (const citation of citations) {
    const li = document.createElement("li");

    const link = document.createElement("a");
    link.href = citation.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = citation.title;
    link.style.color = "#8bd9ff";

    const snippet = document.createElement("div");
    snippet.className = "muted";
    snippet.style.marginTop = "0.2rem";
    snippet.textContent = citation.snippet;

    li.appendChild(link);
    li.appendChild(snippet);
    els.citations.appendChild(li);
  }
}

function renderEventStream() {
  els.eventStream.innerHTML = "";

  if (!state.eventLog.length) {
    const li = document.createElement("li");
    li.textContent = "No events yet.";
    els.eventStream.appendChild(li);
    return;
  }

  for (const event of state.eventLog) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${event.text}</strong><br><span class="muted">${event.stamp} | ${event.level}</span>`;
    els.eventStream.appendChild(li);
  }
}

function renderAdaptationLog(log) {
  els.adaptationLog.innerHTML = "";

  if (!log.length) {
    const li = document.createElement("li");
    li.textContent = "No adaptation transitions yet.";
    els.adaptationLog.appendChild(li);
    return;
  }

  for (const entry of [...log].reverse()) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${entry.from_mode} -> ${entry.to_mode}</strong><br><span class="muted">${entry.reason}</span>`;
    els.adaptationLog.appendChild(li);
  }
}

function renderGraph(caseGraph) {
  if (!els.graphSvg) return;

  const nodes = caseGraph.nodes || [];
  const edges = caseGraph.edges || [];

  while (els.graphSvg.firstChild) {
    els.graphSvg.removeChild(els.graphSvg.firstChild);
  }

  if (!nodes.length) {
    els.graphLegend.innerHTML = "";
    return;
  }

  const width = 920;
  const height = 360;
  const positions = layoutNodes(nodes, width, height);

  const edgeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const nodeLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");

  for (const edge of edges) {
    const src = positions[edge.from_node];
    const dst = positions[edge.to_node];
    if (!src || !dst) continue;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "edge");
    line.setAttribute("x1", src.x);
    line.setAttribute("y1", src.y);
    line.setAttribute("x2", dst.x);
    line.setAttribute("y2", dst.y);
    edgeLayer.appendChild(line);
  }

  for (const node of nodes) {
    const pt = positions[node.node_id];
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "node");
    g.setAttribute("transform", `translate(${pt.x}, ${pt.y})`);
    g.addEventListener("click", () => {
      state.selectedNodeId = node.node_id;
      sendEvent("step_reopen", { step_id: node.node_id });
    });

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("r", state.selectedNodeId === node.node_id ? "16" : "13");
    circle.setAttribute("fill", nodeColor(node.status));
    circle.setAttribute("stroke", state.selectedNodeId === node.node_id ? "#dcf8ff" : "#91c7e8");
    circle.setAttribute("stroke-width", "1.4");

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("class", "node-label");
    text.setAttribute("y", "28");
    text.textContent = truncate(node.title, 14);

    g.appendChild(circle);
    g.appendChild(text);
    nodeLayer.appendChild(g);
  }

  els.graphSvg.appendChild(edgeLayer);
  els.graphSvg.appendChild(nodeLayer);

  const types = [...new Set(nodes.map((n) => n.node_type))];
  els.graphLegend.innerHTML = types.map((type) => `<span class="chip">${type}</span>`).join("");
}

function layoutNodes(nodes, width, height) {
  const map = {};
  const cols = Math.max(2, Math.ceil(Math.sqrt(nodes.length)));
  const rows = Math.ceil(nodes.length / cols);
  const xGap = width / (cols + 1);
  const yGap = height / (rows + 1);

  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    map[node.node_id] = { x: (col + 1) * xGap, y: (row + 1) * yGap };
  });

  return map;
}

function nodeColor(status) {
  if (status === "complete") return "#29c88e";
  if (status === "blocked") return "#d9637f";
  return "#2abde7";
}

function populateFields(values) {
  for (const input of els.fields) {
    const key = input.dataset.field;
    const current = values[key] || "";
    if (input.value !== current) {
      input.value = current;
    }
  }
}

function truncate(text, length) {
  if (!text) return "";
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}
