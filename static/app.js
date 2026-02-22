const state = {
  session: null,
  scenarios: [],
  lastReason: "Fill the input form to generate your plan.",
};

const FIELD_LABELS = {
  school_name: "School / university",
  status_type: "Current status",
  program_stage: "Program stage",
  major_program: "Major / program",
  program_start_date: "Program start date",
  graduation_date: "Graduation date",
  employment_offer: "Employment offer",
  employer_name: "Employer name",
  work_location: "Work location",
  work_start_date: "Job / internship start date",
  work_end_date: "Job / internship end date",
  petition_status: "Petition status",
  documents_available: "Documents available",
};

const DOC_LABELS = {
  passport: "Passport",
  i20: "I-20",
  i94: "I-94",
  admission_letter: "School admission letter",
  internship_offer_letter: "Internship offer letter",
  employment_offer_letter: "Employment offer letter",
  employment_verification: "Employment verification",
  ead_card: "EAD card",
  h1b_receipt_notice: "H-1B receipt notice",
  sevis_record: "SEVIS record",
};

const STATUS_DOC_REQUIREMENTS = {
  f1: ["passport", "i20", "i94", "admission_letter"],
  cpt: [
    "passport",
    "i20",
    "i94",
    "admission_letter",
    "internship_offer_letter",
    "employment_offer_letter",
  ],
  opt: ["passport", "i20", "i94", "employment_offer_letter", "employment_verification"],
  stem_opt: ["passport", "i20", "i94", "ead_card", "employment_offer_letter", "employment_verification"],
  h1b: ["passport", "i20", "i94", "ead_card", "h1b_receipt_notice", "employment_offer_letter"],
  cap_gap: ["passport", "i20", "i94", "ead_card", "h1b_receipt_notice", "employment_offer_letter"],
};

const MODE_LABELS = {
  checklist: "Checklist",
  timeline: "Timeline",
  explain: "Explain",
};

const els = {
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: {
    input: document.getElementById("tab-input"),
    process: document.getElementById("tab-process"),
  },

  schoolLabel: document.getElementById("school_label"),
  flowLabel: document.getElementById("flow_label"),
  progressText: document.getElementById("progress_text"),
  processProgress: document.getElementById("process_progress"),

  schoolInput: document.getElementById("school_name_input"),
  statusInput: document.getElementById("status_type_input"),
  stageInput: document.getElementById("program_stage_input"),
  preferredMode: document.getElementById("preferred_mode"),
  stressInput: document.getElementById("stress_level_input"),
  stressValue: document.getElementById("stress_level_value"),
  majorProgramInput: document.getElementById("major_program_input"),
  programStartDateInput: document.getElementById("program_start_date_input"),
  graduationDateInput: document.getElementById("graduation_date_input"),
  jobStartDateInput: document.getElementById("job_start_date_input"),
  workEndDateInput: document.getElementById("work_end_date_input"),
  employmentOfferInput: document.getElementById("employment_offer_input"),
  employerNameInput: document.getElementById("employer_name_input"),
  workLocationInput: document.getElementById("work_location_input"),
  petitionStatusInput: document.getElementById("petition_status_input"),
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

  docsHint: document.getElementById("docs_hint"),
  docsChecklist: document.getElementById("docs_checklist"),
  missingDocs: document.getElementById("missing_docs"),

  advisorQuestions: document.getElementById("advisor_questions"),
  timelineView: document.getElementById("timeline_view"),

  explainBundle: document.getElementById("explain_bundle"),
  explainIntro: document.getElementById("explain_intro"),
  explainChecklist: document.getElementById("explain_checklist"),
  explainTimeline: document.getElementById("explain_timeline"),
  explainText: document.getElementById("explain_text"),
};

boot();

async function boot() {
  bindEvents();
  updateStressLabel();
  await loadScenarios();
  renderScenarioChips();
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  els.stressInput.addEventListener("input", updateStressLabel);
  els.startBtn.addEventListener("click", startSession);

  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      sendEvent("mode_change", { mode: button.dataset.manualMode });
    });
  });

  els.docsChecklist.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (!target.classList.contains("doc-toggle")) {
      return;
    }
    updateDocumentAvailability(target.dataset.doc || "", target.checked);
  });
}

function updateStressLabel() {
  els.stressValue.textContent = `${els.stressInput.value} / 5`;
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
  const initial = scenario.initial_fields || {};
  els.schoolInput.value = initial.school_name || "";
  els.statusInput.value = initial.status_type || "";
  els.stageInput.value = initial.program_stage || "";
  els.majorProgramInput.value = initial.major_program || "";
  els.programStartDateInput.value = initial.program_start_date || "";
  els.graduationDateInput.value = initial.graduation_date || "";
  els.jobStartDateInput.value = initial.work_start_date || "";
  els.workEndDateInput.value = initial.work_end_date || "";
  els.employmentOfferInput.value = initial.employment_offer || "";
  els.employerNameInput.value = initial.employer_name || "";
  els.workLocationInput.value = initial.work_location || "";
  els.petitionStatusInput.value = initial.petition_status || "";
  els.intent.value = scenario.intent || "";
}

function collectInitialFields() {
  return {
    school_name: els.schoolInput.value.trim(),
    status_type: els.statusInput.value,
    program_stage: els.stageInput.value,
    major_program: els.majorProgramInput.value.trim(),
    program_start_date: els.programStartDateInput.value,
    graduation_date: els.graduationDateInput.value,
    employment_offer: els.employmentOfferInput.value,
    employer_name: els.employerNameInput.value.trim(),
    work_location: els.workLocationInput.value.trim(),
    work_start_date: els.jobStartDateInput.value,
    work_end_date: els.workEndDateInput.value,
    petition_status: els.petitionStatusInput.value,
    documents_available: "",
  };
}

function buildIntent(fields) {
  const typed = els.intent.value.trim();
  if (typed.length >= 10) {
    return typed;
  }

  const school = fields.school_name || "my school";
  const status = humanizeText(fields.status_type || "international student");
  const stage = humanizeText(fields.program_stage || "unspecified stage");
  const workDate = fields.work_start_date ? ` with a start date of ${fields.work_start_date}` : "";
  return `I am a ${status} at ${school} (${stage})${workDate} and I need a clear visa workflow plan.`;
}

async function startSession() {
  const initialFields = collectInitialFields();
  const payload = {
    intent: buildIntent(initialFields),
    profile: {
      familiarity_level: "new",
      preferred_mode: els.preferredMode.value,
      stress_level: Number(els.stressInput.value) || 3,
      role: "student",
    },
    initial_fields: initialFields,
  };

  const res = await fetch("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    alert("Could not generate plan. Check the required inputs and try again.");
    return;
  }

  const data = await res.json();
  state.session = data.session;
  state.lastReason = "Context received. Built your workflow and prioritized next steps.";
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

function render() {
  const session = state.session;
  if (!session) {
    return;
  }

  renderHeader(session);
  renderCandidateFlows(session);
  renderDisambiguation(session.disambiguation_card);
  renderView(session.current_mode);
  renderWorkflow(session.workflow || [], session.current_mode);
  renderGuidance(session);
  renderMissing(session.missing_items || [], els.missingPreview);
  renderDocsChecklist(session);
  renderTimeline(session, els.timelineView);
  renderAdvisorQuestions(session);
  renderExplainBundle(session);
}

function renderHeader(session) {
  const school = String(session.fields.school_name || "").trim() || "not set";
  const flow = session.selected_flow_title || "not started";
  const done = (session.workflow || []).filter((step) => step.status === "complete").length;
  const total = Math.max(1, (session.workflow || []).length);
  const stepLabel = `Step ${Math.min(done + 1, total)} of ${total}`;

  els.schoolLabel.textContent = `School: ${school}`;
  els.flowLabel.textContent = `Flow: ${flow}`;
  els.progressText.textContent = `Progress: ${stepLabel}`;
  els.processProgress.textContent = stepLabel;
}

function renderCandidateFlows(session) {
  const candidates = session.candidate_flows || [];
  els.candidateFlows.innerHTML = "";
  if (!candidates.length) {
    const li = document.createElement("li");
    li.textContent = "Suggested flows will appear after you generate the plan.";
    els.candidateFlows.appendChild(li);
    return;
  }

  for (const candidate of candidates.slice(0, 3)) {
    const li = document.createElement("li");
    const selectedTag = candidate.flow_id === session.selected_flow_id ? " (selected)" : "";
    li.innerHTML = `
      <strong>${candidate.title}${selectedTag}</strong>
      <div class="subtle">${candidate.reason}</div>
    `;

    const button = document.createElement("button");
    button.textContent = "Use this flow";
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
  const label = MODE_LABELS[currentMode] || humanizeText(currentMode);
  els.currentView.textContent = `Mode: ${label}`;
  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.manualMode === currentMode);
  });

  const showExplain = currentMode === "explain";
  els.explainBundle.classList.toggle("hidden", !showExplain);
}

function renderWorkflow(steps, mode) {
  els.workflowSteps.innerHTML = "";
  if (!steps.length) {
    const li = document.createElement("li");
    li.textContent = "No workflow available yet.";
    els.workflowSteps.appendChild(li);
    return;
  }

  for (const step of steps) {
    const li = document.createElement("li");
    const statusText = step.status === "complete" ? "Done" : step.status === "blocked" ? "Blocked" : "Pending";

    li.innerHTML = `
      <strong>${step.title}</strong>
      <div class="subtle">Status: ${statusText}</div>
      <div class="subtle">${describeStep(step, mode)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "actions inline";

    const toggle = document.createElement("button");
    const isComplete = step.status === "complete";
    toggle.textContent = isComplete ? "Mark Pending" : "Mark Complete";
    toggle.addEventListener("click", () => {
      sendEvent(isComplete ? "unmark_step" : "mark_step", { step_id: step.step_id });
    });
    actions.appendChild(toggle);

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

function renderGuidance(session) {
  const missing = session.missing_items || [];
  const nextStep = (session.workflow || []).find((step) => step.status !== "complete");

  els.guidanceText.textContent = state.lastReason;
  els.nextAction.textContent = nextStep ? nextStep.title : "All workflow steps complete. Verify with advisor.";

  const petition = String(session.fields.petition_status || "").trim();
  const isTransition = session.selected_flow_id === "cap_gap_transition_prep";

  if (!missing.length && (!isTransition || (petition && petition !== "unknown"))) {
    els.statusPrimary.className = "badge ready";
    els.statusPrimary.textContent = "Ready";
    els.statusSecondary.textContent = "Packet-level prep looks complete";
    return;
  }

  if (isTransition && (!petition || petition === "unknown")) {
    els.statusPrimary.className = "badge verify";
    els.statusPrimary.textContent = "Needs Verification";
    els.statusSecondary.textContent = "Confirm transition details with advisor";
    return;
  }

  els.statusPrimary.className = "badge needs";
  els.statusPrimary.textContent = "Needs Info";
  els.statusSecondary.textContent = "Complete missing context and docs";
}

function renderMissing(missingItems, target) {
  target.innerHTML = "";
  if (!missingItems.length) {
    const li = document.createElement("li");
    li.textContent = "No missing required fields.";
    target.appendChild(li);
    return;
  }

  for (const item of missingItems) {
    const li = document.createElement("li");
    li.textContent = humanFieldLabel(item);
    target.appendChild(li);
  }
}

function renderDocsChecklist(session) {
  const docs = getRequiredDocs(session);
  const availableDocs = parseDocuments(session.fields.documents_available || "");

  els.docsChecklist.innerHTML = "";

  if (!docs.length) {
    const fallback = document.createElement("div");
    fallback.className = "subtle";
    fallback.textContent = "No document requirements available for this flow yet.";
    els.docsChecklist.appendChild(fallback);
    return;
  }

  for (const doc of docs) {
    const row = document.createElement("label");
    row.className = "doc-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "doc-toggle";
    checkbox.dataset.doc = doc;
    checkbox.checked = availableDocs.has(doc);

    const name = document.createElement("span");
    name.textContent = DOC_LABELS[doc] || humanizeText(doc);

    const stateBadge = document.createElement("span");
    stateBadge.className = checkbox.checked ? "doc-pill done" : "doc-pill";
    stateBadge.textContent = checkbox.checked ? "Added" : "Required";

    row.appendChild(checkbox);
    row.appendChild(name);
    row.appendChild(stateBadge);
    els.docsChecklist.appendChild(row);
  }

  const missingDocs = docs.filter((doc) => !availableDocs.has(doc));
  els.missingDocs.innerHTML = "";
  if (!missingDocs.length) {
    const li = document.createElement("li");
    li.textContent = "All listed documents are marked available.";
    els.missingDocs.appendChild(li);
  } else {
    for (const doc of missingDocs) {
      const li = document.createElement("li");
      li.textContent = DOC_LABELS[doc] || humanizeText(doc);
      els.missingDocs.appendChild(li);
    }
  }

  const status = String(session.fields.status_type || "").trim();
  const flow = session.selected_flow_title || "selected flow";
  els.docsHint.textContent = `Checklist for ${humanizeText(status || "current status")} in ${flow}.`;
}

function getRequiredDocs(session) {
  const flowDocs = (session.doc_requirements || []).map(normalizeDoc);
  const status = normalizeValue(session.fields.status_type || "");
  const statusDocs = (STATUS_DOC_REQUIREMENTS[status] || []).map(normalizeDoc);
  const merged = [...new Set([...flowDocs, ...statusDocs])].filter(Boolean);
  return merged;
}

async function updateDocumentAvailability(doc, checked) {
  if (!state.session || !doc) {
    return;
  }

  const current = parseDocuments(state.session.fields.documents_available || "");
  if (checked) {
    current.add(doc);
  } else {
    current.delete(doc);
  }

  const value = Array.from(current).sort().join(", ");
  await sendEvent("field_update", { field: "documents_available", value });
}

function parseDocuments(raw) {
  const tokens = String(raw || "")
    .split(",")
    .map((token) => normalizeDoc(token))
    .filter(Boolean);
  return new Set(tokens);
}

function normalizeDoc(value) {
  return String(value || "").trim().toLowerCase().replaceAll("-", "_");
}

function renderTimeline(session, targetElement) {
  const items = buildTimelineItems(session);
  targetElement.innerHTML = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "Timeline will appear after flow generation.";
    targetElement.appendChild(li);
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    targetElement.appendChild(li);
  }
}

function buildTimelineItems(session) {
  const flow = session.selected_flow_id;
  const jobStart = parseDateInput(session.fields.work_start_date || "");

  const schedule = {
    cpt_prep: [
      { offset: -21, text: "Collect base docs: I-20, I-94, passport, admission letter, and internship/offer letter." },
      { offset: -14, text: "Share employer details and dates with your international office for review." },
      { offset: -10, text: "Obtain CPT authorization letter / updated I-20 from your school." },
      { offset: -3, text: "Verify CPT approval on the updated I-20 before work begins." },
      { offset: 0, text: "Job / internship start date." },
    ],
    opt_initial_prep: [
      { offset: -90, text: "Start I-765 prep and gather identity + school documents." },
      { offset: -60, text: "Review timeline and eligibility assumptions with advisor." },
      { offset: -30, text: "Finalize documents and submission-ready checklist." },
      { offset: -7, text: "Do final review of dates and status details." },
      { offset: 0, text: "Planned employment start date." },
    ],
    opt_stem_prep: [
      { offset: -75, text: "Gather extension docs (including EAD and employer evidence)." },
      { offset: -45, text: "Confirm employer-side obligations and supporting details." },
      { offset: -20, text: "Review STEM extension prep packet with advisor." },
      { offset: -7, text: "Resolve remaining missing docs and date conflicts." },
      { offset: 0, text: "Planned work continuation date." },
    ],
    cap_gap_transition_prep: [
      { offset: -75, text: "Collect transition records (EAD, I-20, I-94, petition evidence)." },
      { offset: -45, text: "Confirm petition status and transition assumptions with advisor." },
      { offset: -30, text: "Validate Cap Gap/H-1B bridge timing and employer details." },
      { offset: -10, text: "Resolve open transition risks and missing notices." },
      { offset: 0, text: "Target work date for transition plan." },
    ],
    f1_work_basics: [
      { offset: -30, text: "Capture status, stage, and employment context." },
      { offset: -21, text: "Confirm whether CPT, OPT, or transition prep applies." },
      { offset: -10, text: "Prepare required school and identity docs." },
      { offset: 0, text: "Target date to start the selected specialized workflow." },
    ],
  };

  const plan = schedule[flow] || schedule.f1_work_basics;
  return plan.map((item) => formatTimelineItem(item.offset, item.text, jobStart));
}

function formatTimelineItem(offsetDays, text, anchorDate) {
  if (anchorDate) {
    const date = addDays(anchorDate, offsetDays);
    if (offsetDays < 0) {
      return `${formatDate(date)} (${Math.abs(offsetDays)} days before start): ${text}`;
    }
    if (offsetDays > 0) {
      return `${formatDate(date)} (${offsetDays} days after start): ${text}`;
    }
    return `${formatDate(date)} (job start): ${text}`;
  }

  if (offsetDays < 0) {
    return `${Math.abs(offsetDays)} days before job start: ${text}`;
  }
  if (offsetDays > 0) {
    return `${offsetDays} days after job start: ${text}`;
  }
  return `On job start date: ${text}`;
}

function parseDateInput(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return null;
  }

  const parts = value.split("-").map((token) => Number(token));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return null;
  }

  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

function addDays(date, deltaDays) {
  const clone = new Date(date.getTime());
  clone.setDate(clone.getDate() + deltaDays);
  return clone;
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function renderAdvisorQuestions(session) {
  const school = String(session.fields.school_name || "your school").trim() || "your school";
  const flow = session.selected_flow_id;
  const missing = new Set(session.missing_items || []);
  const questions = [
    `Which exact office/portal should I use for ${session.selected_flow_title || "this path"} at ${school}?`,
    "Can you confirm the top 3 highest-priority items I should finish first?",
  ];

  if (flow === "cpt_prep") {
    questions.push("Do I need CPT authorization on an updated I-20 before my start date?");
    questions.push("Are my employer details and internship dates complete for CPT review?");
  }

  if (flow === "opt_initial_prep") {
    questions.push("How should I align graduation timing, OPT prep, and planned work start?");
    questions.push("Which OPT documents should be prepared first to avoid delays?");
  }

  if (flow === "opt_stem_prep") {
    questions.push("What is still needed from my employer for STEM OPT extension readiness?");
    questions.push("Can we verify student vs employer responsibilities in my extension packet?");
  }

  if (flow === "cap_gap_transition_prep") {
    questions.push("Which transition records should I verify for Cap Gap / H-1B handoff?");
    questions.push("Does my current petition status support this transition timeline?");
  }

  if (missing.has("employer_name") || missing.has("work_location")) {
    questions.push("Which employer details are mandatory before advisor review?");
  }

  if (missing.has("program_stage") || missing.has("status_type")) {
    questions.push("Can we confirm my exact status and stage before continuing this plan?");
  }

  if ((session.profile?.stress_level || 3) >= 4) {
    questions.push("I am feeling stressed. What are the minimum safe next actions I should do this week?");
  }

  els.advisorQuestions.innerHTML = "";
  for (const question of questions) {
    const li = document.createElement("li");
    li.textContent = question;
    els.advisorQuestions.appendChild(li);
  }
}

function renderExplainBundle(session) {
  if (session.current_mode !== "explain") {
    return;
  }

  els.explainIntro.textContent =
    "Combined view: checklist + timeline + plain guidance. Use this if you want everything in one place.";

  const checklistRows = (session.workflow || []).map((step) => {
    const mark = step.status === "complete" ? "[x]" : "[ ]";
    return `${mark} ${step.title}`;
  });

  const timelineRows = buildTimelineItems(session);

  const guidanceRows = [];
  if (session.flow_description) {
    guidanceRows.push(session.flow_description);
  }
  for (const warning of session.flow_warnings || []) {
    guidanceRows.push(warning);
  }
  for (const confusion of session.common_confusions || []) {
    guidanceRows.push(`Common confusion: ${confusion}`);
  }
  if (!guidanceRows.length) {
    guidanceRows.push("Complete each required field and confirm final assumptions with your advisor.");
  }

  renderSimpleList(els.explainChecklist, checklistRows);
  renderSimpleList(els.explainTimeline, timelineRows);
  renderSimpleList(els.explainText, guidanceRows);
}

function renderSimpleList(target, values) {
  target.innerHTML = "";
  if (!values.length) {
    const li = document.createElement("li");
    li.textContent = "No items.";
    target.appendChild(li);
    return;
  }

  for (const value of values) {
    const li = document.createElement("li");
    li.textContent = value;
    target.appendChild(li);
  }
}

function describeStep(step, mode) {
  if (mode === "timeline") {
    if (step.dependencies && step.dependencies.length) {
      return `This step depends on: ${step.dependencies.join(", ")}.`;
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

function humanizeText(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function beautifyId(value) {
  return String(value || "")
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase().replaceAll("-", "_");
}

function friendlyReason(reason) {
  const text = String(reason || "");
  if (!text) {
    return "Plan updated based on your latest changes.";
  }

  if (text.includes("Mode locked")) {
    return "Using your selected view mode.";
  }
  if (text.includes("Understanding dropped")) {
    return "This section looked confusing, so the plan shifted to a clearer format.";
  }
  if (text.includes("Completeness still low")) {
    return "Missing fields detected, so the plan stayed in checklist mode.";
  }
  if (text.includes("Escalation risk is high")) {
    return "This case has risk factors. Verify assumptions with your advisor.";
  }

  return text;
}
