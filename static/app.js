const state = {
  session: null,
  scenarios: [],
  lastReason: "Complete the intake form to generate your plan.",
};

const FIELD_LABELS = {
  school_name: "School name",
  status_type: "Current status",
  program_stage: "Program stage",
  employment_offer: "Employment offer",
  employer_name: "Employer name",
  work_location: "Work location",
  work_start_date: "Work start date",
  work_end_date: "Work end date",
  graduation_date: "Graduation date",
  petition_status: "Petition status",
  documents_available: "Documents available",
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

  schoolInput: document.getElementById("school_name_input"),
  statusInput: document.getElementById("status_type_input"),
  stageInput: document.getElementById("program_stage_input"),
  preferredMode: document.getElementById("preferred_mode"),
  intent: document.getElementById("intent"),
  startBtn: document.getElementById("start_btn"),

  scenarioChips: document.getElementById("scenario_chips"),
  candidateFlows: document.getElementById("candidate_flows"),
  disambiguationCard: document.getElementById("disambiguation_card"),
  disambiguationPrompt: document.getElementById("disambiguation_prompt"),
  disambiguationOptions: document.getElementById("disambiguation_options"),

  currentView: document.getElementById("current_view"),
  guidanceText: document.getElementById("guidance_text"),
  modeButtons: Array.from(document.querySelectorAll("[data-manual-mode]")),
  workflowSteps: document.getElementById("workflow_steps"),
  statusPrimary: document.getElementById("status_primary"),
  statusSecondary: document.getElementById("status_secondary"),
  nextAction: document.getElementById("next_action"),
  missingPreview: document.getElementById("missing_preview"),

  fields: Array.from(document.querySelectorAll(".case-field")),
  missingItems: document.getElementById("missing_items"),
  caseSummary: document.getElementById("case_summary"),
  finalChecklist: document.getElementById("final_checklist"),
  finalTimeline: document.getElementById("final_timeline"),
  advisorQuestions: document.getElementById("advisor_questions"),
  citations: document.getElementById("citations"),
  packetOutput: document.getElementById("packet_output"),
  packetStatus: document.getElementById("packet_status"),
  generatePacket: document.getElementById("generate_packet"),
  copyPacket: document.getElementById("copy_packet"),
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
  els.copyPacket.addEventListener("click", copyPacketToClipboard);

  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      sendEvent("mode_change", { mode: button.dataset.manualMode });
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
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  Object.entries(els.panels).forEach(([name, panel]) => {
    panel.classList.toggle("active", name === tabName);
  });
}

async function loadScenarios() {
  const res = await fetch("/api/scenarios");
  if (!res.ok) {
    return;
  }
  const data = await res.json();
  state.scenarios = data.scenarios || [];
}

function renderScenarioChips() {
  els.scenarioChips.innerHTML = "";
  if (!state.scenarios.length) {
    const span = document.createElement("span");
    span.className = "chip static";
    span.textContent = "No demo cases found.";
    els.scenarioChips.appendChild(span);
    return;
  }

  for (const scenario of state.scenarios) {
    const button = document.createElement("button");
    button.className = "chip-btn";
    button.textContent = scenario.label || beautifyId(scenario.scenario_id || "demo_case");
    button.addEventListener("click", () => applyScenario(scenario));
    els.scenarioChips.appendChild(button);
  }
}

function applyScenario(scenario) {
  els.intent.value = scenario.intent || "";
  const initial = scenario.initial_fields || {};
  els.schoolInput.value = initial.school_name || "";
  els.statusInput.value = initial.status_type || "";
  els.stageInput.value = initial.program_stage || "";
}

async function startSession() {
  const intent = els.intent.value.trim();
  if (!intent) {
    alert("Please describe your situation first.");
    return;
  }

  const payload = {
    intent,
    profile: {
      familiarity_level: "new",
      preferred_mode: els.preferredMode.value,
      stress_level: 3,
      role: "student",
    },
    initial_fields: {
      school_name: els.schoolInput.value.trim(),
      status_type: els.statusInput.value,
      program_stage: els.stageInput.value,
    },
  };

  const res = await fetch("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    alert("Could not generate plan. Try again.");
    return;
  }

  const data = await res.json();
  state.session = data.session;
  state.lastReason = "Plan generated from your context and intent.";
  render();
  setTab("process");
}

async function sendEvent(eventType, payload = {}) {
  if (!state.session) {
    return;
  }

  const res = await fetch(`/api/session/${state.session.session_id}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: eventType, payload }),
  });
  if (!res.ok) {
    return;
  }

  const data = await res.json();
  state.session = data.session;
  state.lastReason = friendlyReason(data.mutation.reason);
  render();
}

async function generatePacket() {
  if (!state.session) {
    return;
  }
  const res = await fetch(`/api/session/${state.session.session_id}/packet`, { method: "POST" });
  if (!res.ok) {
    alert("Could not generate packet.");
    return;
  }
  const data = await res.json();
  els.packetOutput.textContent = data.packet_markdown;
  els.packetStatus.textContent = "Full prep packet generated. You can copy it now.";
  setTab("output");
}

async function copyPacketToClipboard() {
  const text = els.packetOutput.textContent || "";
  if (!text.trim()) {
    els.packetStatus.textContent = "Generate packet first, then copy.";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    els.packetStatus.textContent = "Packet copied to clipboard.";
  } catch {
    els.packetStatus.textContent = "Clipboard copy failed. You can still select and copy manually.";
  }
}

function render() {
  const session = state.session;
  if (!session) {
    return;
  }

  renderHeader(session);
  renderCandidateFlows(session);
  renderDisambiguation(session.disambiguation_card);
  renderView(session.current_mode);
  renderGuidance(session);
  renderWorkflow(session.workflow || [], session.current_mode);

  renderMissing(session.missing_items || [], els.missingPreview);
  renderMissing(session.missing_items || [], els.missingItems);
  renderSummary(session);
  renderChecklist(session.workflow || []);
  renderTimeline(session.workflow || []);
  renderAdvisorQuestions(session);
  renderCitations(session.citations || []);
  syncFields(session.fields || {});

  if (session.advisor_packet_markdown) {
    els.packetOutput.textContent = session.advisor_packet_markdown;
  }
}

function renderHeader(session) {
  const school = String(session.fields.school_name || "").trim() || "not set";
  const done = (session.workflow || []).filter((step) => step.status === "complete").length;
  const total = Math.max(1, (session.workflow || []).length);
  els.schoolLabel.textContent = `School: ${school}`;
  els.flowLabel.textContent = `Path: ${session.selected_flow_title}`;
  els.progressText.textContent = `Progress: Step ${Math.min(done + 1, total)} of ${total}`;
}

function renderCandidateFlows(session) {
  const candidates = session.candidate_flows || [];
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
      <strong>${candidate.title}${candidate.flow_id === session.selected_flow_id ? " (selected)" : ""}</strong>
      <div class="subtle">${candidate.reason}</div>
    `;
    const button = document.createElement("button");
    button.textContent = "Use this path";
    button.addEventListener("click", () => sendEvent("select_flow", { flow_id: candidate.flow_id }));
    li.appendChild(button);
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
    const button = document.createElement("button");
    button.className = "chip-btn";
    button.textContent = label;
    button.addEventListener("click", () => sendEvent("select_flow", { flow_id: flowId }));
    els.disambiguationOptions.appendChild(button);
  }
}

function renderView(currentMode) {
  els.currentView.textContent = `View: ${humanizeText(currentMode)}`;
  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.manualMode === currentMode);
  });
}

function renderGuidance(session) {
  const missing = session.missing_items || [];
  const nextStep = (session.workflow || []).find((step) => step.status !== "complete");
  const risk = Number(session.scores?.escalation_risk || 0);

  els.guidanceText.textContent = state.lastReason;
  els.nextAction.textContent = nextStep ? nextStep.title : "Generate the full prep packet.";

  if (!missing.length && risk < 65) {
    els.statusPrimary.className = "badge ready";
    els.statusPrimary.textContent = "Ready";
    els.statusSecondary.textContent = "Packet can be reviewed";
  } else if (risk >= 70) {
    els.statusPrimary.className = "badge verify";
    els.statusPrimary.textContent = "Needs Verification";
    els.statusSecondary.textContent = "Review with advisor or attorney";
  } else {
    els.statusPrimary.className = "badge needs";
    els.statusPrimary.textContent = "Needs Info";
    els.statusSecondary.textContent = "Complete missing details";
  }
}

function renderWorkflow(steps, mode) {
  els.workflowSteps.innerHTML = "";
  if (!steps.length) {
    const li = document.createElement("li");
    li.textContent = "No workflow yet.";
    els.workflowSteps.appendChild(li);
    return;
  }

  for (const step of steps) {
    const li = document.createElement("li");
    const status = step.status === "complete" ? "Done" : step.status === "blocked" ? "Blocked" : "Pending";
    li.innerHTML = `
      <strong>${step.title}</strong>
      <div class="subtle">Status: ${status}</div>
      <div class="subtle">${describeStep(step, mode)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "actions inline";

    const mark = document.createElement("button");
    mark.textContent = step.status === "complete" ? "Mark Pending" : "Mark Done";
    mark.addEventListener("click", () =>
      sendEvent(step.status === "complete" ? "unmark_step" : "mark_step", { step_id: step.step_id })
    );
    actions.appendChild(mark);

    if (step.status === "blocked") {
      const reopen = document.createElement("button");
      reopen.textContent = "Re-open";
      reopen.addEventListener("click", () => sendEvent("step_reopen", { step_id: step.step_id }));
      actions.appendChild(reopen);
    }

    li.appendChild(actions);
    els.workflowSteps.appendChild(li);
  }
}

function renderMissing(missingItems, target) {
  target.innerHTML = "";
  if (!missingItems.length) {
    const li = document.createElement("li");
    li.textContent = "No missing items right now.";
    target.appendChild(li);
    return;
  }
  for (const missing of missingItems) {
    const li = document.createElement("li");
    li.textContent = humanFieldLabel(missing);
    target.appendChild(li);
  }
}

function renderSummary(session) {
  const summaryItems = [];
  summaryItems.push(`Selected path: ${session.selected_flow_title}`);
  summaryItems.push(`School: ${session.fields.school_name || "Not provided"}`);
  summaryItems.push(`Status: ${session.fields.status_type || "Not provided"}`);
  summaryItems.push(`Program stage: ${session.fields.program_stage || "Not provided"}`);
  summaryItems.push(`Intent: ${session.intent}`);

  els.caseSummary.innerHTML = "";
  for (const item of summaryItems) {
    const li = document.createElement("li");
    li.textContent = item;
    els.caseSummary.appendChild(li);
  }
}

function renderChecklist(steps) {
  els.finalChecklist.innerHTML = "";
  if (!steps.length) {
    const li = document.createElement("li");
    li.textContent = "No checklist available.";
    els.finalChecklist.appendChild(li);
    return;
  }
  for (const step of steps) {
    const li = document.createElement("li");
    li.textContent = `${step.status === "complete" ? "[x]" : "[ ]"} ${step.title}`;
    els.finalChecklist.appendChild(li);
  }
}

function renderTimeline(steps) {
  els.finalTimeline.innerHTML = "";
  if (!steps.length) {
    const li = document.createElement("li");
    li.textContent = "No timeline available.";
    els.finalTimeline.appendChild(li);
    return;
  }

  steps.forEach((step, index) => {
    const li = document.createElement("li");
    const deps = step.dependencies && step.dependencies.length
      ? ` (depends on ${step.dependencies.join(", ")})`
      : "";
    li.textContent = `${index + 1}. ${step.title}${deps}`;
    els.finalTimeline.appendChild(li);
  });
}

function renderAdvisorQuestions(session) {
  const questions = [
    "Which assumptions in this plan should be verified by my international office?",
    "Are there timeline risks I should resolve before submission?",
  ];

  if ((session.missing_items || []).includes("employer_name")) {
    questions.push("Which employer details are required before advisor review?");
  }
  if ((session.missing_items || []).includes("petition_status")) {
    questions.push("What petition status documents should I provide?");
  }
  if (session.selected_flow_id === "cap_gap_transition_prep") {
    questions.push("Can we confirm my transition bridge timing and handoff sequence?");
  }

  els.advisorQuestions.innerHTML = "";
  for (const question of questions) {
    const li = document.createElement("li");
    li.textContent = question;
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
  for (const citation of citations.slice(0, 5)) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = citation.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = citation.title;
    li.appendChild(link);
    els.citations.appendChild(li);
  }
}

function syncFields(fields) {
  els.fields.forEach((input) => {
    const key = input.dataset.field;
    const value = fields[key] || "";
    if (input.value !== value) {
      input.value = value;
    }
  });
}

function describeStep(step, mode) {
  if (mode === "timeline") {
    if (step.dependencies && step.dependencies.length) {
      return `This step comes after ${step.dependencies.join(", ")}.`;
    }
    return "This is an early step in your timeline.";
  }
  if (mode === "explain") {
    return step.description;
  }
  if (step.required_fields && step.required_fields.length) {
    return `Required details: ${step.required_fields.map(humanFieldLabel).join(", ")}.`;
  }
  return step.description;
}

function humanFieldLabel(field) {
  return FIELD_LABELS[field] || humanizeText(field);
}

function humanizeText(text) {
  return String(text || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function beautifyId(value) {
  return String(value || "")
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function friendlyReason(reason) {
  const text = String(reason || "");
  if (text.includes("Mode locked")) {
    return "Using your selected view.";
  }
  if (text.includes("Understanding dropped")) {
    return "This looked confusing, so the plan switched to a clearer format.";
  }
  if (text.includes("Completeness still low")) {
    return "Still waiting on a few details, so we stayed in checklist mode.";
  }
  if (text.includes("Transition flow needs petition-state clarity")) {
    return "Petition details are needed before this transition can be finalized.";
  }
  if (text.includes("Escalation risk is high")) {
    return "This case needs advisor verification before moving forward.";
  }
  if (!text) {
    return "Plan updated based on your latest input.";
  }
  return text;
}
