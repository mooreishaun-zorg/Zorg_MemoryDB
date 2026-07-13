const controlsEl = document.getElementById("adminControls");
const statusEl = document.getElementById("adminStatus");
const dbNameEl = document.getElementById("adminDbName");
const adminTitleEl = document.getElementById("adminTitle");

const proxyPrefix = location.pathname.startsWith("/zorg-memory-3d") ? "/zorg-memory-3d" : "";

function proxiedPath(path) {
  return `${proxyPrefix}${path}`;
}

const controlGroups = [
  {
    key: "historyWindow",
    title: "History",
    controls: [
      { key: "days", label: "Days of history", type: "number", min: 0.01, max: 3650, step: 0.25 }
    ]
  },
  {
    key: "buildSettings",
    title: "Build",
    controls: [
      { key: "historyStageHours", label: "History stage hours", type: "number", min: 0.0167, max: 168, step: 0.25 },
      { key: "stagedAdmissionTargetPercent", label: "Frame admission", min: 0.001, max: 10, step: 0.001 }
    ]
  },
  {
    key: "nodeSizing",
    title: "Nodes",
    controls: [
      { key: "minimumNodeRenderedSize", label: "Minimum size", min: 0.5, max: 80, step: 0.5 },
      { key: "vectorNodeSizeScale", label: "Vector growth", min: 0, max: 1, step: 0.001 },
      { key: "scaledVectorStartIndex", label: "Growth starts at vector", min: 1, max: 10, step: 1 },
      { key: "nodeCollisionRadiusScale", label: "Collision radius", min: 0.1, max: 10, step: 0.1 }
    ]
  },
  {
    key: "renderSettings",
    title: "Vectors",
    controls: [
      { key: "vectorDiameterVisualScale", label: "Vector diameter", min: 0.1, max: 10, step: 0.1 },
      { key: "packetDataNodeVisualScale", label: "Packet size", min: 0.1, max: 10, step: 0.1 },
      { key: "maxLiveVectorBullets", label: "Max live packets", min: 0, max: 1200, step: 10 },
      { key: "packetBurstMin", label: "Burst minimum", min: 1, max: 30, step: 1 },
      { key: "packetBurstMax", label: "Burst maximum", min: 1, max: 40, step: 1 },
      { key: "packetBurstShotSpacingMin", label: "Shot spacing", min: 10, max: 800, step: 10 },
      { key: "packetBurstShapeCycleMs", label: "Receipt cycle", min: 100, max: 5000, step: 100 }
    ]
  },
  {
    key: "renderSettings",
    title: "Transparency",
    controls: [
      { key: "nodeOpacity", label: "Node opacity", min: 0.02, max: 1, step: 0.01 },
      { key: "vectorOpacity", label: "Vector opacity", min: 0.02, max: 1, step: 0.01 },
      { key: "packetOpacity", label: "Packet opacity", min: 0.02, max: 1, step: 0.01 }
    ]
  },
  {
    key: "physicsTunables",
    title: "Collision",
    controls: [
      { key: "nodeCollisionPasses", label: "Node passes", min: 1, max: 160, step: 1 },
      { key: "collisionShareMin", label: "Move share min", min: 0, max: 0.5, step: 0.01 },
      { key: "collisionShareMax", label: "Move share max", min: 0.5, max: 1, step: 0.01 },
      { key: "vectorCollisionPasses", label: "Vector passes", min: 1, max: 160, step: 1 },
      { key: "vectorEndpointPadding", label: "Endpoint padding", min: 0, max: 0.49, step: 0.001 },
      { key: "settlementMaxPasses", label: "Settlement passes", min: 1, max: 160, step: 1 }
    ]
  }
];

let currentConfig = {};
let currentRules = {};
let currentEngine = null;
let saveTimer = null;
let ruleSaveTimer = null;
let historyEstimateTimer = null;
let engineStatusTimer = null;
let historyEstimateEl = null;

function setStatus(text, state = "neutral") {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function valueText(value) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? "");
  return Math.abs(number) < 1 ? number.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function centeredControlBounds(spec, value) {
  const current = Number(value ?? spec.min ?? 0);
  const step = Math.abs(Number(spec.step || 1)) || 1;
  const baseMin = Number(spec.min);
  const baseMax = Number(spec.max);
  const configuredSpan =
    Number.isFinite(baseMin) && Number.isFinite(baseMax) && baseMax > baseMin
      ? baseMax - baseMin
      : step * 100;
  const center = Number.isFinite(current) ? current : Number.isFinite(baseMin) ? baseMin : 0;
  const rawHalfSpan = Math.max(step * 10, configuredSpan / 2);
  const halfSpan = Math.max(step, Math.ceil(rawHalfSpan / step) * step);
  return {
    min: center - halfSpan,
    max: center + halfSpan,
    value: center,
  };
}

function compactInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(number);
}

function megabyteText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB`;
}

function engineStateText(engine = currentEngine) {
  if (!engine?.running) return "Stopped";
  return engine.paused ? "Paused" : "Running";
}

function renderEngineStatus(engine = currentEngine) {
  currentEngine = engine || currentEngine;
  const toggle = document.getElementById("enginePauseToggle");
  const state = document.getElementById("enginePauseState");
  const counts = currentEngine?.historyDisplayCounts || {};
  if (toggle) {
    const paused = Boolean(currentEngine?.paused);
    toggle.dataset.on = paused ? "true" : "false";
    toggle.setAttribute("aria-checked", paused ? "true" : "false");
  }
  if (state) state.textContent = engineStateText(currentEngine);
  for (const [key, value] of Object.entries({
    nodesDisplayed: counts.nodesDisplayed,
    vectorsDisplayed: counts.vectorsDisplayed,
    nodesRemaining: counts.nodesRemaining,
    vectorsRemaining: counts.vectorsRemaining
  })) {
    const el = document.querySelector(`[data-engine-count="${key}"] strong`);
    if (el) el.textContent = compactInteger(value);
  }
}

function scheduleEngineStatusRefresh() {
  if (engineStatusTimer) clearTimeout(engineStatusTimer);
  engineStatusTimer = setTimeout(() => {
    loadEngineStatus()
      .catch((error) => setStatus(`Engine status unavailable: ${error.message}`, "danger"))
      .finally(scheduleEngineStatusRefresh);
  }, 5000);
}

async function loadEngineStatus() {
  const response = await fetch(proxiedPath("/api/game/control"));
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  renderEngineStatus(data.engine);
}

async function setEnginePaused(paused) {
  setStatus(paused ? "Pausing game engine..." : "Resuming game engine...", "neutral");
  const response = await fetch(proxiedPath("/api/game/control"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paused })
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  renderEngineStatus(data.engine);
  setStatus(paused ? "Game engine paused." : "Game engine resumed.", "success");
}

function buildEngineControlSection() {
  const section = document.createElement("section");
  section.className = "admin-group admin-engine-control";
  section.dataset.group = "engine";

  const title = document.createElement("h2");
  title.textContent = "Engine";

  const pauseRow = document.createElement("label");
  pauseRow.className = "admin-control admin-engine-toggle";
  pauseRow.dataset.key = "engine.paused";

  const label = document.createElement("span");
  label.className = "admin-control-label";
  label.textContent = "Pause engine";

  const input = document.createElement("button");
  input.id = "enginePauseToggle";
  input.className = "switch-toggle";
  input.type = "button";
  input.setAttribute("role", "switch");
  input.setAttribute("aria-label", "Pause engine");
  input.dataset.on = Boolean(currentEngine?.paused) ? "true" : "false";
  input.setAttribute("aria-checked", Boolean(currentEngine?.paused) ? "true" : "false");
  const track = document.createElement("span");
  track.className = "switch-track";
  const thumb = document.createElement("span");
  thumb.className = "switch-thumb";
  track.append(thumb);
  input.append(track);

  const output = document.createElement("output");
  output.id = "enginePauseState";
  output.textContent = engineStateText(currentEngine);

  input.addEventListener("click", () => {
    const nextPaused = input.dataset.on !== "true";
    setEnginePaused(nextPaused).catch((error) => {
      renderEngineStatus(currentEngine);
      setStatus(`Engine control unavailable: ${error.message}`, "danger");
    });
  });

  pauseRow.append(label, input, output);

  const countGrid = document.createElement("div");
  countGrid.className = "engine-counts";
  const countItems = [
    ["nodesDisplayed", "Nodes shown"],
    ["vectorsDisplayed", "Vectors shown"],
    ["nodesRemaining", "Nodes remaining"],
    ["vectorsRemaining", "Vectors remaining"]
  ];
  for (const [key, labelText] of countItems) {
    const item = document.createElement("span");
    item.className = "engine-count-item";
    item.dataset.engineCount = key;
    const itemLabel = document.createElement("span");
    itemLabel.textContent = labelText;
    const itemValue = document.createElement("strong");
    itemValue.textContent = compactInteger(currentEngine?.historyDisplayCounts?.[key]);
    item.append(itemLabel, itemValue);
    countGrid.append(item);
  }

  section.append(title, pauseRow, countGrid);
  return section;
}

function renderHistoryEstimate(data) {
  if (!historyEstimateEl) return;
  const estimate = data?.estimate;
  if (!estimate) {
    historyEstimateEl.textContent = "History load estimate unavailable.";
    historyEstimateEl.dataset.state = "danger";
    return;
  }
  historyEstimateEl.dataset.state = estimate.cappedAtMaxPages ? "warning" : "success";
  historyEstimateEl.replaceChildren();
  const items = [
    ["Nodes", compactInteger(estimate.nodes)],
    ["Vectors", compactInteger(estimate.vectors)],
    ["Data", megabyteText(estimate.dataMegabytes)]
  ];
  for (const [label, value] of items) {
    const item = document.createElement("span");
    item.className = "history-estimate-item";
    const itemLabel = document.createElement("span");
    itemLabel.textContent = label;
    const itemValue = document.createElement("strong");
    itemValue.textContent = value;
    item.append(itemLabel, itemValue);
    historyEstimateEl.append(item);
  }
}

function scheduleHistoryEstimate(days) {
  if (!historyEstimateEl) return;
  if (historyEstimateTimer) clearTimeout(historyEstimateTimer);
  historyEstimateEl.textContent = "Calculating history load...";
  historyEstimateEl.dataset.state = "neutral";
  historyEstimateTimer = setTimeout(() => {
    loadHistoryEstimate(days).catch((error) => {
      if (!historyEstimateEl) return;
      historyEstimateEl.textContent = `History load estimate unavailable: ${error.message}`;
      historyEstimateEl.dataset.state = "danger";
    });
  }, 220);
}

async function loadHistoryEstimate(days) {
  const response = await fetch(proxiedPath(`/api/game/history-estimate?days=${encodeURIComponent(days)}`));
  if (!response.ok) throw new Error(await response.text());
  renderHistoryEstimate(await response.json());
}

function buildControl(group, spec, value) {
  const row = document.createElement("label");
  row.className = "admin-control";
  row.dataset.key = `${group.key}.${spec.key}`;

  const label = document.createElement("span");
  label.className = "admin-control-label";
  label.textContent = spec.label;

  const output = document.createElement("output");
  output.textContent = valueText(value);

  let input;
  if (spec.type === "checkbox") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(value);
  } else if (spec.type === "number") {
    const bounds = centeredControlBounds(spec, value);
    input = document.createElement("input");
    input.type = "number";
    input.min = String(bounds.min);
    input.max = String(bounds.max);
    input.step = String(spec.step);
    input.value = String(bounds.value);
  } else {
    const bounds = centeredControlBounds(spec, value);
    input = document.createElement("input");
    input.type = "range";
    input.min = String(bounds.min);
    input.max = String(bounds.max);
    input.step = String(spec.step);
    input.value = String(bounds.value);
    input.dataset.centerValue = String(bounds.value);
  }

  input.addEventListener("input", () => {
    const nextValue = spec.type === "checkbox" ? input.checked : Number(input.value);
    if (spec.type === "number" && !Number.isFinite(nextValue)) return;
    output.textContent = valueText(nextValue);
    if (!currentConfig[group.key]) currentConfig[group.key] = {};
    currentConfig[group.key][spec.key] = nextValue;
    if (group.key === "historyWindow" && spec.key === "days") scheduleHistoryEstimate(nextValue);
    scheduleSave({ [group.key]: { [spec.key]: nextValue } });
  });

  row.append(label, input, output);
  return row;
}

function sortedRuleEntries(rules = {}) {
  return Object.entries(rules).sort(([, left], [, right]) => {
    const leftName = left?.name || "";
    const rightName = right?.name || "";
    return leftName.localeCompare(rightName);
  });
}

function buildFeatureToggle(ruleId, rule) {
  const row = document.createElement("label");
  row.className = "admin-feature-toggle";
  row.dataset.rule = ruleId;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(rule?.enabled);

  const text = document.createElement("span");
  text.className = "admin-feature-text";

  const name = document.createElement("strong");
  name.textContent = rule?.name || ruleId;

  const description = document.createElement("span");
  description.className = "admin-feature-description";
  description.textContent = rule?.description || rule?.owns || "Runtime feature module.";

  const file = document.createElement("span");
  file.className = "admin-feature-file";
  file.textContent = rule?.file || "runtime";

  const output = document.createElement("output");
  output.textContent = input.checked ? "On" : "Off";

  input.addEventListener("input", () => {
    output.textContent = input.checked ? "On" : "Off";
    if (!currentRules[ruleId]) currentRules[ruleId] = {};
    currentRules[ruleId].enabled = input.checked;
    scheduleRuleSave({ [ruleId]: input.checked });
  });

  text.append(name, description, file);
  row.append(input, text, output);
  return row;
}

function buildFeatureModuleSection(rules = {}) {
  const section = document.createElement("section");
  section.className = "admin-group admin-feature-modules";
  section.dataset.group = "feature-modules";

  const title = document.createElement("h2");
  title.textContent = "Feature Modules";
  section.append(title);

  const entries = sortedRuleEntries(rules);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "admin-feature-empty";
    empty.textContent = "No live feature modules reported.";
    section.append(empty);
    return section;
  }

  for (const [ruleId, rule] of entries) section.append(buildFeatureToggle(ruleId, rule));
  return section;
}

function renderControls(config) {
  controlsEl.replaceChildren();
  historyEstimateEl = null;
  const columns = {
    left: document.createElement("div"),
    center: document.createElement("div"),
    right: document.createElement("div")
  };
  columns.left.className = "admin-column";
  columns.left.dataset.column = "history-vectors";
  columns.center.className = "admin-column";
  columns.center.dataset.column = "nodes-transparency";
  columns.right.className = "admin-column";
  columns.right.dataset.column = "physics";

  for (const group of controlGroups) {
    const section = document.createElement("section");
    section.className = "admin-group";
    section.dataset.group = group.title.toLowerCase();
    const title = document.createElement("h2");
    title.textContent = group.title;
    section.append(title);
    for (const spec of group.controls) {
      section.append(buildControl(group, spec, config[group.key]?.[spec.key]));
    }
    if (group.key === "historyWindow") {
      historyEstimateEl = document.createElement("div");
      historyEstimateEl.className = "history-estimate";
      historyEstimateEl.textContent = "Calculating history load...";
      historyEstimateEl.dataset.state = "neutral";
      section.append(historyEstimateEl);
      scheduleHistoryEstimate(config.historyWindow?.days);
    }
    let targetColumn = columns.right;
    if (group.title === "History" || group.title === "Vectors") targetColumn = columns.left;
    if (group.title === "Nodes" || group.title === "Transparency") targetColumn = columns.center;
    targetColumn.append(section);
  }
  columns.right.prepend(buildFeatureModuleSection(currentRules));
  columns.left.prepend(buildEngineControlSection());
  controlsEl.append(columns.left, columns.center, columns.right);
  renderEngineStatus(currentEngine);
}

function scheduleSave(partialConfig) {
  if (saveTimer) clearTimeout(saveTimer);
  setStatus("Applying live config...", "neutral");
  saveTimer = setTimeout(() => saveConfig(partialConfig), 180);
}

async function saveConfig(partialConfig) {
  const response = await fetch(proxiedPath("/api/game/config"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: partialConfig })
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  currentConfig = data.config;
  currentEngine = data.engine || currentEngine;
  setStatus("Live config applied and persisted.", "success");
  renderEngineStatus(currentEngine);
}

function scheduleRuleSave(partialRules) {
  if (ruleSaveTimer) clearTimeout(ruleSaveTimer);
  setStatus("Applying feature module switch...", "neutral");
  ruleSaveTimer = setTimeout(() => saveRules(partialRules), 120);
}

async function saveRules(partialRules) {
  const response = await fetch(proxiedPath("/api/game/rules"), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: partialRules })
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  currentRules = data.rules || {};
  setStatus("Feature module switch applied and persisted.", "success");
  renderControls(currentConfig);
}

async function loadConfig() {
  const response = await fetch(proxiedPath("/api/game/config"));
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  currentConfig = data.config;
  currentRules = data.rules || {};
  currentEngine = data.engine || currentEngine;
  if (data.identity?.databaseLabel && dbNameEl) dbNameEl.textContent = data.identity.databaseLabel;
  if (data.identity?.adminTitle) {
    document.title = data.identity.adminTitle;
    if (adminTitleEl) adminTitleEl.textContent = data.identity.adminTitle;
  }
  renderControls(currentConfig);
  setStatus("Live engine config loaded.", "success");
  scheduleEngineStatusRefresh();
}

loadConfig().catch((error) => {
  setStatus(`Config unavailable: ${error.message}`, "danger");
});
