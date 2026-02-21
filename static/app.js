const state = {
  session: null,
  scenarios: [],
  activeTab: "input",
  lastMutationReason: "",
};

const FIELD_LABELS = {
  school_name: "School name",
  status_type: "Current status",
  program_stage: "Program stage",
  employment_offer: "Employment offer",
  employer_name: "Employer name",
  work_start_date: "Work start date",
  work_end_date: "Work end date",
  graduation_date: "Graduation date",
  petition_status: "Petition status",
  documents_available: "Documents available",
  work_location: "Work location",
  major_program: "Major/program",
};

const els = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: {
    input: document.getElementById("tab-input"),
    process: document.getElementById("tab-process"),
    output: document.getElementById("tab-output"),
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

  readinessBadge: document.getElementById("readiness_badge"),
  reviewBadge: document.getElementById("review_badge"),
  adaptiveSurface: document.getElementById("adaptive_surface"),
  missingPreview: document.getElementById("missing_preview"),

  fields: Array.from(document.querySelectorAll(".case-field")),
  missingItems: document.getElementById("missing_items"),
  finalChecklist: document.getElementById("final_checklist"),
  advisorQuestions: document.getElementById("advisor_questions"),
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
  state.lastMutationReason = "Plan created from your context and situation.";
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
  state.lastMutationReason = friendlyReason(data.mutation.reason);
  render();
}

async function generatePacket() {
  if (!state.session) return;
  const res = await fetch(`/api/session/${state.session.session_id}/packet`, { method: "POST" });
  if (!res.ok) return;
  const data = await res.json();
  els.packetOutput.textContent = data.packet_markdown;
  setTab("output");
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

  renderWorkflow(session.workflow || []);
  renderStatusPanel(session);
  renderMissingItems(session.missing_items || [], els.missingPreview);
  renderMissingItems(session.missing_items || [], els.missingItems);
  renderFinalChecklist(session);
  renderAdvisorQuestions(session);
  renderCitations(session.citations || []);
  populateFields(session.fields || {});

  if (session.advisor_packet_markdown) {
    els.packetOutput.textContent = session.advisor_packet_markdown;
  }
}

function renderProgress(session) {
  const total = Math.max(1, (session.workflow || []).length);
  const done = (session.workflow || []).filter((step) => step.status === "complete").length;
  els.progressText.textContent = `Progress: Step ${Math.min(done + 1, total)} of ${total}`;
}

function renderCandidateFlows(candidates, selectedFlowId) {
  els.candidateFlows.innerHTML = "";
  if (!candidates.length) {
    const li = document.createElement("li");
    li.textContent = "No suggestions yet.";
    els.candidateFlows.appendChild(li);
    return;
  }

  for (const candidate of candidates.slice(0, 3)) {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${candidate.title}${candidate.flow_id === selectedFlowId ? " ✓" : ""}</strong>
      <div class="muted">${candidate.reason}</div>
    `;
    const btn = document.createElement("button");
    btn.textContent = "Use this path";
    btn.addEventListener("click", () => sendEvent("select_flow", { flow_id: candidate.flow_id }));
    li.appendChild(btn);
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
  els.currentModeChip.textContent = `View: ${humanMode(currentMode)}`;
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
    const status = step.status === "complete" ? "✅" : step.status === "blocked" ? "⚠️" : "⏳";
    li.innerHTML = `
      <strong>${status} ${step.title}</strong>
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

function renderStatusPanel(session) {
  const missing = session.missing_items || [];
  const risk = Number(session.scores?.escalation_risk || 0);
  const nextStep = (session.workflow || []).find((step) => step.status !== "complete");

  let readinessText = "Needs Info";
  let readinessClass = "needs";
  if (!missing.length && risk < 60) {
    readinessText = "Ready";
    readinessClass = "ready";
  } else if (risk >= 70) {
    readinessText = "Needs Advisor Verification";
    readinessClass = "verify";
  }

  els.readinessBadge.className = `badge ${readinessClass}`;
  els.readinessBadge.textContent = readinessText;

  els.reviewBadge.className = `badge neutral`;
  els.reviewBadge.textContent = nextStep ? "In Progress" : "Packet Ready";

  const why = state.lastMutationReason || "Guidance updated from your latest inputs.";
  const next = nextStep ? nextStep.title : "Generate full prep packet";
  els.whyMode.textContent = why;
  els.adaptiveSurface.innerHTML = `
    <p><strong>What changed:</strong> ${why}</p>
    <p><strong>Next best step:</strong> ${next}</p>
    <p><strong>Current focus:</strong> ${humanMode(session.current_mode)} view</p>
  `;
}

function renderMissingItems(missing, targetEl) {
  targetEl.innerHTML = "";
  if (!missing.length) {
    const li = document.createElement("li");
    li.textContent = "Nothing missing right now.";
    targetEl.appendChild(li);
    return;
  }
  for (const item of missing) {
    const li = document.createElement("li");
    li.textContent = humanField(item);
    targetEl.appendChild(li);
  }
}

function renderFinalChecklist(session) {
  const items = session.workflow || [];
  els.finalChecklist.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "No checklist yet.";
    els.finalChecklist.appendChild(li);
    return;
  }

  for (const step of items) {
    const li = document.createElement("li");
    li.textContent = `${step.status === "complete" ? "[x]" : "[ ]"} ${step.title}`;
    els.finalChecklist.appendChild(li);
  }
}

function renderAdvisorQuestions(session) {
  els.advisorQuestions.innerHTML = "";
  const missing = session.missing_items || [];
  const questions = [
    "Which parts of this plan should I verify with my international office?",
    "Are any timeline assumptions in this case incorrect?",
  ];

  if (missing.includes("employer_name")) {
    questions.push("What exact employer details are required before review?");
  }
  if (missing.includes("petition_status")) {
    questions.push("What petition status proof should I provide?");
  }
  if (session.selected_flow_id === "cap_gap_transition_prep") {
    questions.push("Can we confirm my transition timing and bridge eligibility?");
  }

  for (const q of questions) {
    const li = document.createElement("li");
    li.textContent = q;
    els.advisorQuestions.appendChild(li);
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

function humanMode(mode) {
  return String(mode || "checklist")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function humanField(field) {
  return FIELD_LABELS[field] || String(field || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function friendlyReason(reason) {
  const text = String(reason || "");
  if (text.includes("Completeness still low")) return "I still need a few details, so I kept this in a simple checklist.";
  if (text.includes("Understanding dropped")) return "This looked confusing, so I switched to a clearer explanation view.";
  if (text.includes("Escalation risk is high")) return "Some parts need advisor verification before proceeding.";
  if (text.includes("Transition flow needs petition-state clarity")) return "I need petition details to safely continue this transition path.";
  if (text.includes("Mode locked")) return "Keeping the view you selected.";
  if (text.includes("No mode change needed")) return "Your current plan looks stable, so no view change was needed.";
  return text || "Guidance updated from your latest inputs.";
}
