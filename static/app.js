const state = {
  session: null,
  scenarios: [],
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

  schoolLabel: document.getElementById("school_label"),
  flowLabel: document.getElementById("flow_label"),
  progressText: document.getElementById("progress_text"),

  schoolNameInput: document.getElementById("school_name_input"),
  statusTypeInput: document.getElementById("status_type_input"),
  programStageInput: document.getElementById("program_stage_input"),
  intent: document.getElementById("intent"),
  preferredMode: document.getElementById("preferred_mode"),
  startBtn: document.getElementById("start_btn"),

  scenarioChips: document.getElementById("scenario_chips"),
  candidateFlows: document.getElementById("candidate_flows"),
  disambiguationCard: document.getElementById("disambiguation_card"),
  disambiguationPrompt: document.getElementById("disambiguation_prompt"),
  disambiguationOptions: document.getElementById("disambiguation_options"),

  currentModeChip: document.getElementById("current_mode_chip"),
  whyMode: document.getElementById("why_mode"),
  manualModeButtons: Array.from(document.querySelectorAll("[data-manual-mode]")),
  workflowSteps: document.getElementById("workflow_steps"),

  understanding: document.getElementById("understanding"),
  completeness: document.getElementById("completeness"),
  escalationRisk: document.getElementById("escalation_risk"),
  understandingBar: document.getElementById("understanding_bar"),
  completenessBar: document.getElementById("completeness_bar"),
  riskBar: document.getElementById("risk_bar"),
  adaptiveSurface: document.getElementById("adaptive_surface"),

  transitionBridge: document.getElementById("transition_bridge"),
  bridgeRow: document.getElementById("bridge_row"),
  outcomeSummary: document.getElementById("outcome_summary"),

  fields: Array.from(document.querySelectorAll(".case-field")),
  missingItems: document.getElementById("missing_items"),
  citations: document.getElementById("citations"),
  generatePacket: document.getElementById("generate_packet"),
  packetOutput: document.getElementById("packet_output"),
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
  els.generatePacket.addEventListener("click", generatePacket);

  els.manualModeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      sendEvent("mode_change", { mode: btn.dataset.manualMode });
    });
  });

  els.fields.forEach((input) => {
    input.addEventListener("change", () => {
      const field = input.dataset.field;
      sendEvent("field_update", { field, value: input.value });
    });
  });
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
    span.textContent = "No presets";
    els.scenarioChips.appendChild(span);
    return;
  }

  for (const scenario of state.scenarios) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = scenario.scenario_id.replaceAll("_", " ");
    btn.addEventListener("click", () => {
      els.intent.value = scenario.intent;
    });
    els.scenarioChips.appendChild(btn);
  }
}

async function startSession() {
  const payload = {
    intent: els.intent.value.trim(),
    profile: {
      familiarity_level: "new",
      preferred_mode: els.preferredMode.value,
      stress_level: 3,
      role: "student",
    },
    initial_fields: {
      school_name: els.schoolNameInput.value.trim(),
      status_type: els.statusTypeInput.value,
      program_stage: els.programStageInput.value,
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
  state.lastMutation = {
    new_mode: data.session.current_mode,
    reason: "Workflow initialized from your input context.",
  };
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
  if (!res.ok) return;

  const data = await res.json();
  state.session = data.session;
  state.lastMutation = data.mutation;
  render();
}

async function generatePacket() {
  if (!state.session) return;
  const res = await fetch(`/api/session/${state.session.session_id}/packet`, { method: "POST" });
  if (!res.ok) return;
  const data = await res.json();
  els.packetOutput.textContent = data.packet_markdown;
  setTab("docs");
}

function render() {
  const session = state.session;
  if (!session) return;

  const school = String(session.fields.school_name || "").trim() || "not set";
  els.schoolLabel.textContent = `School: ${school}`;
  els.flowLabel.textContent = `Flow: ${session.selected_flow_title}`;
  renderProgress(session);

  renderCandidateFlows(session.candidate_flows || [], session.selected_flow_id);
  renderDisambiguation(session.disambiguation_card);
  renderModes(session.current_mode);

  renderScore(els.understanding, els.understandingBar, session.scores.understanding_score);
  renderScore(els.completeness, els.completenessBar, session.scores.completeness_score);
  renderScore(els.escalationRisk, els.riskBar, session.scores.escalation_risk);

  renderWorkflow(session.workflow || []);
  renderGuidance(session);
  renderOutcomes(session);
  renderTransitionBridge(session);

  renderMissingItems(session.missing_items || []);
  renderCitations(session.citations || []);
  populateFields(session.fields || {});

  if (session.advisor_packet_markdown) {
    els.packetOutput.textContent = session.advisor_packet_markdown;
  }
}

function renderProgress(session) {
  const total = Math.max(1, (session.workflow || []).length);
  const done = (session.workflow || []).filter((step) => step.status === "complete").length;
  const pct = Math.round((done / total) * 100);
  els.progressText.textContent = `Progress: ${pct}% complete`;
}

function renderCandidateFlows(candidates, selectedFlowId) {
  els.candidateFlows.innerHTML = "";
  if (!candidates.length) {
    const li = document.createElement("li");
    li.textContent = "No flow suggestions yet.";
    els.candidateFlows.appendChild(li);
    return;
  }

  for (const candidate of candidates.slice(0, 3)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${candidate.title}${candidate.flow_id === selectedFlowId ? " ✓" : ""}</strong>
      <div class="muted">Confidence: ${candidate.score} (${candidate.reason})</div>
    `;
    const selectBtn = document.createElement("button");
    selectBtn.textContent = "Use this flow";
    selectBtn.addEventListener("click", () => sendEvent("select_flow", { flow_id: candidate.flow_id }));
    li.appendChild(selectBtn);
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

function renderModes(currentMode) {
  els.currentModeChip.textContent = `Mode: ${humanMode(currentMode)}`;
  els.manualModeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.manualMode === currentMode);
  });
}

function renderWorkflow(steps) {
  els.workflowSteps.innerHTML = "";
  if (!steps.length) {
    const li = document.createElement("li");
    li.textContent = "No workflow yet.";
    els.workflowSteps.appendChild(li);
    return;
  }

  for (const step of steps) {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${step.title} (${step.status})</strong>
      <div class="muted">${step.description}</div>
    `;
    const row = document.createElement("div");
    row.className = "inline-actions";

    const toggle = document.createElement("button");
    toggle.textContent = step.status === "complete" ? "Mark Pending" : "Mark Complete";
    toggle.addEventListener("click", () =>
      sendEvent(step.status === "complete" ? "unmark_step" : "mark_step", { step_id: step.step_id })
    );
    row.appendChild(toggle);

    li.appendChild(row);
    els.workflowSteps.appendChild(li);
  }
}

function renderGuidance(session) {
  const missing = (session.missing_items || []).slice(0, 3).join(", ") || "none";
  const next = (session.workflow || []).find((step) => step.status !== "complete");
  const nextStep = next ? next.title : "Packet generation";
  const why = state.lastMutation?.reason || "Using current readiness state.";

  els.whyMode.textContent = why;
  els.adaptiveSurface.innerHTML = `
    <p><strong>Why this mode:</strong> ${why}</p>
    <p><strong>Next step:</strong> ${nextStep}</p>
    <p><strong>Top missing items:</strong> ${missing}</p>
  `;
}

function renderOutcomes(session) {
  if (!els.outcomeSummary) return;
  const baseline = LEGACY_BASELINES[session.selected_flow_id] || LEGACY_BASELINES.f1_work_basics;
  const dynamicSteps = Math.max(1, (session.workflow || []).length);
  const completed = (session.workflow || []).filter((step) => step.status === "complete").length;
  const unresolved = (session.missing_items || []).length;
  const reduced = Math.max(0, baseline.steps - dynamicSteps);
  const prepHours = Math.max(1.5, baseline.prepHours - reduced * 0.25);

  els.outcomeSummary.innerHTML = "";
  [
    `Routed to: ${session.selected_flow_title}`,
    `Steps reduced vs legacy: ${reduced} (${baseline.steps} -> ${dynamicSteps})`,
    `Readiness now: ${session.scores.completeness_score}%`,
    `Missing blockers detected early: ${unresolved}`,
    `Estimated prep effort: ${prepHours.toFixed(1)}h (legacy ${baseline.prepHours.toFixed(1)}h)`,
    `Workflow completion: ${completed}/${dynamicSteps}`,
  ].forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    els.outcomeSummary.appendChild(li);
  });
}

function renderTransitionBridge(session) {
  const show = session.selected_flow_id === "cap_gap_transition_prep" || session.current_mode === "transition";
  if (!show) {
    els.transitionBridge.classList.add("hidden");
    els.bridgeRow.innerHTML = "";
    return;
  }
  els.transitionBridge.classList.remove("hidden");

  const status = String(session.fields.status_type || "").toLowerCase();
  const petition = String(session.fields.petition_status || "").toLowerCase();
  const steps = [
    { label: "Current", detail: status || "missing", done: Boolean(status) },
    { label: "Cap Gap Bridge", detail: petition || "verify petition", done: Boolean(petition && petition !== "unknown") },
    {
      label: "Transition Prep",
      detail: session.scores.escalation_risk >= 70 ? "advisor review needed" : "handoff ready",
      done: session.scores.completeness_score >= 70,
    },
  ];

  els.bridgeRow.innerHTML = steps
    .map(
      (step) => `
      <div class="bridge-step ${step.done ? "done" : ""}">
        <strong>${step.label}</strong>
        <span>${step.detail}</span>
      </div>`
    )
    .join('<span class="bridge-arrow">-></span>');
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
    li.textContent = "No references loaded yet.";
    els.citations.appendChild(li);
    return;
  }

  for (const citation of citations.slice(0, 4)) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = citation.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = citation.title;
    link.style.color = "#8bd9ff";
    li.appendChild(link);
    els.citations.appendChild(li);
  }
}

function populateFields(values) {
  for (const input of els.fields) {
    const key = input.dataset.field;
    const value = values[key] || "";
    if (input.value !== value) {
      input.value = value;
    }
  }
}

function renderScore(valueEl, barEl, value) {
  const n = Math.max(0, Math.min(100, Number(value || 0)));
  valueEl.textContent = `${n}%`;
  barEl.style.width = `${n}%`;
}

function humanMode(mode) {
  return String(mode || "checklist")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
