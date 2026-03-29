(function () {
  const DATA = window.APP_DATA;

  if (!DATA) return;

  const DEFAULT_REMINDERS = {
    enabled: false,
    times: {
      "late-night": "00:30",
      morning: "08:30",
      afternoon: "14:00",
      evening: "20:30"
    },
    lastNotified: {}
  };

  const PROJECT_COLOR_PALETTE = [
    "#5a84c6",
    "#d87354",
    "#6d9a70",
    "#8a66d8",
    "#c27594",
    "#d1a44f",
    "#4f8f8b",
    "#b36b63"
  ];

  const BUILTIN_PROJECTS = createBuiltinProjects();
  const state = loadState();
  const ui = createInitialUi();
  const els = {};

  let deferredInstallPrompt = null;
  let reminderTimer = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheEls();
    seedExportDefaults();
    ensureExportSelectionValid();
    bindEvents();
    bootstrapPwa();
    syncReminderStatusText();
    startReminderMonitor();
    renderApp();
  }

  function cacheEls() {
    els.currentSlotTag = document.getElementById("current-slot-tag");
    els.todayLabel = document.getElementById("today-label");
    els.currentSlotLabel = document.getElementById("current-slot-label");
    els.weeklyCountLabel = document.getElementById("weekly-count-label");

    els.quickEmotionSelected = document.getElementById("quick-emotion-selected");
    els.quickEmotionInput = document.getElementById("quick-emotion-input");
    els.quickEmotionSuggestions = document.getElementById("quick-emotion-suggestions");

    els.quickSomaticSelected = document.getElementById("quick-somatic-selected");
    els.quickSomaticInput = document.getElementById("quick-somatic-input");
    els.quickSomaticSuggestions = document.getElementById("quick-somatic-suggestions");

    els.quickIntensity = document.getElementById("quick-intensity");
    els.quickIntensityLabel = document.getElementById("quick-intensity-label");
    els.quickNote = document.getElementById("quick-note");
    els.saveQuickBtn = document.getElementById("save-quick-btn");

    els.otherRecordsSelected = document.getElementById("other-records-selected");
    els.otherProjectInput = document.getElementById("other-project-input");
    els.otherProjectSuggestions = document.getElementById("other-project-suggestions");
    els.otherTagInput = document.getElementById("other-tag-input");
    els.otherTagSuggestions = document.getElementById("other-tag-suggestions");
    els.otherNote = document.getElementById("other-note");
    els.addOtherEntryBtn = document.getElementById("add-other-entry-btn");

    els.guidedSlotLabel = document.getElementById("guided-slot-label");
    els.guidedStepper = document.getElementById("guided-stepper");
    els.guidedStepContent = document.getElementById("guided-step-content");
    els.guidedResetBtn = document.getElementById("guided-reset-btn");
    els.guidedPrevBtn = document.getElementById("guided-prev-btn");
    els.guidedNextBtn = document.getElementById("guided-next-btn");
    els.guidedSaveBtn = document.getElementById("guided-save-btn");

    els.statsRangeSelector = document.getElementById("stats-range-selector");
    els.statsSummary = document.getElementById("stats-summary");
    els.emotionDonut = document.getElementById("emotion-donut");
    els.donutCenterLabel = document.getElementById("donut-center-label");
    els.emotionLegend = document.getElementById("emotion-legend");
    els.intensityTrend = document.getElementById("intensity-trend");
    els.projectFrequency = document.getElementById("project-frequency");
    els.somaticFrequency = document.getElementById("somatic-frequency");

    els.recentRecords = document.getElementById("recent-records");
    els.settingsView = document.getElementById("settings-view");
    els.toast = document.getElementById("toast");
  }

  function bindEvents() {
    document.querySelectorAll(".nav-button").forEach((button) => {
      button.addEventListener("click", () => {
        ui.activeScreen = button.dataset.screen;
        renderApp();
      });
    });

    bindAutocompleteInput(els.quickEmotionInput, (value) => {
      ui.quick.emotionQuery = value;
      renderQuickEmotionSuggestions();
    }, () => commitQuickTag("emotion"));

    bindAutocompleteInput(els.quickSomaticInput, (value) => {
      ui.quick.somaticQuery = value;
      renderQuickSomaticSuggestions();
    }, () => commitQuickTag("somatic"));

    els.quickEmotionSuggestions.addEventListener("click", onSuggestionClick);
    els.quickSomaticSuggestions.addEventListener("click", onSuggestionClick);
    els.quickEmotionSelected.addEventListener("click", onQuickSelectedClick);
    els.quickSomaticSelected.addEventListener("click", onQuickSelectedClick);

    els.quickIntensity.addEventListener("input", (event) => {
      ui.quick.intensity = Number(event.target.value);
      renderQuickIntensityLabel();
    });

    els.quickNote.addEventListener("input", (event) => {
      ui.quick.note = event.target.value;
    });

    els.saveQuickBtn.addEventListener("click", saveQuickRecord);

    bindAutocompleteInput(els.otherProjectInput, (value) => {
      ui.other.projectQuery = value;
      if (!projectNameMatchesSelection(value)) {
        ui.other.selectedProjectId = "";
        ui.other.selectedTagId = "";
        ui.other.tagQuery = "";
        els.otherTagInput.value = "";
      }
      renderOtherProjectSuggestions();
      renderOtherTagSuggestions();
    }, commitOtherProjectQuery);

    bindAutocompleteInput(els.otherTagInput, (value) => {
      ui.other.tagQuery = value;
      if (!tagNameMatchesOtherSelection(value)) {
        ui.other.selectedTagId = "";
      }
      renderOtherTagSuggestions();
    }, commitOtherTagQuery);

    els.otherProjectSuggestions.addEventListener("click", onSuggestionClick);
    els.otherTagSuggestions.addEventListener("click", onSuggestionClick);
    els.otherNote.addEventListener("input", (event) => {
      ui.other.note = event.target.value;
    });
    els.addOtherEntryBtn.addEventListener("click", saveOtherProjectRecord);
    els.otherRecordsSelected.addEventListener("click", onOtherRecordStripClick);

    els.guidedResetBtn.addEventListener("click", () => {
      ui.guided = newGuidedDraft();
      renderGuided();
      toast("已经重新开始这次引导");
    });
    els.guidedPrevBtn.addEventListener("click", () => {
      ui.guided.step = Math.max(0, ui.guided.step - 1);
      renderGuided();
    });
    els.guidedNextBtn.addEventListener("click", () => {
      ui.guided.step = Math.min(DATA.guidedStepTitles.length - 1, ui.guided.step + 1);
      renderGuided();
    });
    els.guidedSaveBtn.addEventListener("click", saveGuidedRecord);

    els.guidedStepContent.addEventListener("click", onGuidedClick);
    els.guidedStepContent.addEventListener("input", onGuidedInput);
    els.guidedStepContent.addEventListener("keydown", onGuidedKeydown);

    els.statsRangeSelector.addEventListener("click", (event) => {
      const button = event.target.closest("[data-range]");
      if (!button) return;
      ui.statsRange = button.dataset.range;
      renderStats();
      renderNav();
    });

    els.settingsView.addEventListener("click", onSettingsClick);
    els.settingsView.addEventListener("input", onSettingsInput);
    els.settingsView.addEventListener("change", onSettingsChange);
  }

  function bindAutocompleteInput(inputEl, onChange, onCommit) {
    if (!inputEl) return;

    inputEl.addEventListener("input", (event) => {
      onChange(event.target.value);
    });

    inputEl.addEventListener("focus", () => {
      onChange(inputEl.value);
    });

    inputEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      onCommit();
    });
  }

  function renderApp() {
    renderHeader();
    renderNav();
    renderScreenVisibility();
    renderHome();
    renderGuided();
    renderStats();
    renderRecentRecords();
    renderSettings();
  }

  function renderScreenVisibility() {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.toggle("active", screen.id === `screen-${ui.activeScreen}`);
    });
  }

  function renderHeader() {
    const now = new Date();
    const slot = getCurrentSlot(now);
    const weeklyCount = filterRecordsByRange("7d").length;

    els.currentSlotTag.textContent = `当前时段 · ${slot.name}`;
    els.todayLabel.textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日`;
    els.currentSlotLabel.textContent = `${slot.name} ${slot.start}-${slot.end}`;
    els.weeklyCountLabel.textContent = `${weeklyCount} 次`;
    els.guidedSlotLabel.textContent = slot.name;
  }

  function renderNav() {
    document.querySelectorAll(".nav-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.screen === ui.activeScreen);
    });
  }

  function renderHome() {
    renderQuickInputs();
    renderOtherProjectInputs();
    renderRecentOtherEntries();
  }

  function renderQuickInputs() {
    els.quickEmotionInput.value = ui.quick.emotionQuery;
    els.quickSomaticInput.value = ui.quick.somaticQuery;
    els.quickIntensity.value = String(ui.quick.intensity);
    els.quickNote.value = ui.quick.note;

    renderQuickIntensityLabel();
    renderQuickSelectedStrips();
    renderQuickEmotionSuggestions();
    renderQuickSomaticSuggestions();
  }

  function renderQuickIntensityLabel() {
    els.quickIntensityLabel.textContent = DATA.intensityLabels[ui.quick.intensity];
  }

  function renderQuickSelectedStrips() {
    renderSelectedStrip(els.quickEmotionSelected, {
      projectId: "emotion",
      selectedIds: ui.quick.selectedEmotionIds,
      removeDataset: { action: "remove-quick-tag", kind: "emotion" },
      emptyText: "还没有选择情绪标签。上方输入框支持联想，也可以直接回车新增自己的情绪命名。"
    });

    renderSelectedStrip(els.quickSomaticSelected, {
      projectId: "somatic",
      selectedIds: ui.quick.selectedSomaticIds,
      removeDataset: { action: "remove-quick-tag", kind: "somatic" },
      emptyText: "还没有选择躯体感觉。你可以直接写下自己身体里的感觉。"
    });
  }

  function renderQuickEmotionSuggestions() {
    renderTagSuggestionList(els.quickEmotionSuggestions, {
      context: "quick-emotion",
      projectId: "emotion",
      query: ui.quick.emotionQuery,
      selectedIds: ui.quick.selectedEmotionIds,
      emptyText: "这里会出现你之前用过的情绪标签联想。"
    });
  }

  function renderQuickSomaticSuggestions() {
    renderTagSuggestionList(els.quickSomaticSuggestions, {
      context: "quick-somatic",
      projectId: "somatic",
      query: ui.quick.somaticQuery,
      selectedIds: ui.quick.selectedSomaticIds,
      emptyText: "这里会出现你之前用过的躯体感觉联想。"
    });
  }

  function renderOtherProjectInputs() {
    els.otherProjectInput.value = ui.other.projectQuery;
    els.otherTagInput.value = ui.other.tagQuery;
    els.otherNote.value = ui.other.note;

    renderOtherProjectSuggestions();
    renderOtherTagSuggestions();
  }

  function renderOtherProjectSuggestions() {
    const query = ui.other.projectQuery.trim();
    const suggestions = getProjectSuggestions(query);
    const usage = getUsageMaps();
    const parts = [];

    if (query && !findCustomProjectByName(query)) {
      parts.push(
        suggestionButtonMarkup({
          context: "other-project",
          type: "project",
          title: `创建新项目“${query}”`,
          meta: "创建后就可以继续给它添加标签",
          dotColor: pickProjectColor(query),
          createName: query,
          isCreate: true
        })
      );
    }

    suggestions.forEach((project) => {
      parts.push(
        suggestionButtonMarkup({
          context: "other-project",
          type: "project",
          title: project.name,
          meta: `${(project.tags || []).length} 个标签 · 已记录 ${usage.projectById.get(project.id) || 0} 次`,
          dotColor: project.color,
          projectId: project.id
        })
      );
    });

    els.otherProjectSuggestions.innerHTML = parts.length
      ? parts.join("")
      : `<div class="empty-inline">选择已有项目，或者直接输入一个新项目名。</div>`;
  }

  function renderOtherTagSuggestions() {
    const project = getSelectedOtherProject(false);
    if (!project && !ui.other.projectQuery.trim()) {
      els.otherTagSuggestions.innerHTML = `<div class="empty-inline">先选一个项目，再继续填写标签。</div>`;
      return;
    }

    if (!project && ui.other.projectQuery.trim()) {
      els.otherTagSuggestions.innerHTML = `<div class="empty-inline">项目会在保存这条记录时创建，你现在也可以先写标签。</div>`;
      return;
    }

    renderTagSuggestionList(els.otherTagSuggestions, {
      context: "other-tag",
      projectId: project.id,
      query: ui.other.tagQuery,
      selectedIds: ui.other.selectedTagId ? [ui.other.selectedTagId] : [],
      emptyText: `这里会联想“${project.name}”项目里已经用过的标签。`
    });
  }

  function renderRecentOtherEntries() {
    const recent = getRecentOtherRecords(8);

    if (!recent.length) {
      els.otherRecordsSelected.innerHTML = `<div class="selected-placeholder">这里会显示你最近添加过的其他项目记录，点右侧 × 可以删除。</div>`;
      return;
    }

    els.otherRecordsSelected.innerHTML = recent.map((record) => {
      const entry = record.projectEntries[0];
      const tag = entry && entry.entries && entry.entries[0];
      const projectRef = entry ? getProject(entry.projectId) : null;
      const projectColor = (entry && entry.projectColor) || (projectRef && projectRef.color) || "#4f8f8b";
      const title = tag ? `${entry.projectName} / ${tag.label}` : entry.projectName;
      const note = (entry && entry.note) || record.note || "这条记录没有额外备注。";

      return `
        <article class="entry-card">
          <div class="entry-card-head">
            <div class="entry-card-title">
              <span class="tag-dot" style="--dot-color:${safeColor(projectColor)}"></span>
              <span>${escapeHtml(title)}</span>
            </div>
            <button
              type="button"
              class="entry-card-remove"
              data-action="delete-other-record"
              data-record-id="${record.id}"
              aria-label="删除这条记录"
            >×</button>
          </div>
          <div class="entry-card-meta">${escapeHtml(formatRecordMoment(record.createdAt))} · ${escapeHtml(record.slotName)}</div>
          <div class="entry-card-note">${escapeHtml(note)}</div>
        </article>
      `;
    }).join("");
  }

  function renderGuided() {
    renderGuidedStepper();
    renderGuidedStepContent();
    els.guidedPrevBtn.disabled = ui.guided.step === 0;
    els.guidedNextBtn.classList.toggle("hidden", ui.guided.step === DATA.guidedStepTitles.length - 1);
    els.guidedSaveBtn.classList.toggle("hidden", ui.guided.step !== DATA.guidedStepTitles.length - 1);
  }

  function renderGuidedStepper() {
    els.guidedStepper.innerHTML = DATA.guidedStepTitles.map((title, index) => {
      const classes = [
        "step-pill",
        index === ui.guided.step ? "active" : "",
        index < ui.guided.step ? "done" : ""
      ].filter(Boolean).join(" ");
      return `
        <div class="${classes}">
          <span>${index + 1}</span>
          <span>${escapeHtml(title)}</span>
        </div>
      `;
    }).join("");
  }

  function renderGuidedStepContent() {
    els.guidedStepContent.innerHTML = guidedStepMarkup(ui.guided.step);
    renderGuidedStepExtras();
  }

  function renderGuidedStepExtras() {
    if (ui.guided.step === 0) {
      renderTagSuggestionList(document.getElementById("guided-somatic-suggestions"), {
        context: "guided-somatic",
        projectId: "somatic",
        query: ui.guided.somaticQuery,
        selectedIds: ui.guided.selectedSomaticIds,
        emptyText: "这里会联想你以前记录过的躯体感觉。"
      });
    }

    if (ui.guided.step === 1) {
      renderTagSuggestionList(document.getElementById("guided-emotion-suggestions"), {
        context: "guided-emotion",
        projectId: "emotion",
        query: ui.guided.emotionQuery,
        selectedIds: ui.guided.selectedEmotionIds,
        emptyText: "这里会联想你以前记录过的情绪标签。"
      });

      const intensityLabel = document.getElementById("guided-intensity-label");
      if (intensityLabel) {
        intensityLabel.textContent = DATA.intensityLabels[ui.guided.intensity];
      }
    }
  }

  function guidedStepMarkup(step) {
    if (step === 0) return guidedBodyStepMarkup();
    if (step === 1) return guidedEmotionStepMarkup();
    if (step === 2) return guidedEventStepMarkup();
    return guidedEchoStepMarkup();
  }

  function guidedBodyStepMarkup() {
    return `
      <div class="step-card">
        <div class="step-copy">
          <h3>先停一下，感受身体哪里最明显</h3>
          <p class="body-copy">可以先把手放在最有感觉的地方，看看那里是紧、麻、热、堵，还是别的什么感觉。</p>
        </div>

        <div>
          <p class="group-title">身体部位</p>
          <div class="choice-grid">
            ${DATA.bodyAreas.map((area) => choiceChipMarkup({
              label: area,
              active: ui.guided.bodyAreas.includes(area),
              dataset: { guidedBodyArea: area }
            })).join("")}
          </div>
        </div>

        <div>
          <p class="group-title">已选躯体感觉</p>
          <div class="selected-strip">
            ${selectedStripMarkup({
              projectId: "somatic",
              selectedIds: ui.guided.selectedSomaticIds,
              removeDataset: { guidedRemove: "somatic" },
              emptyText: "你可以从下方联想里选，也可以自己输入新的躯体感觉。"
            })}
          </div>
        </div>

        <div>
          <p class="group-title">躯体感觉</p>
          <div class="input-shell">
            <input
              id="guided-somatic-input"
              type="text"
              autocomplete="off"
              placeholder="例如：胸口发紧、后背发凉、太阳穴刺痛"
              value="${escapeHtml(ui.guided.somaticQuery)}"
            >
          </div>
          <div id="guided-somatic-suggestions" class="suggestion-list"></div>
        </div>
      </div>
    `;
  }

  function guidedEmotionStepMarkup() {
    return `
      <div class="step-card">
        <div class="step-copy">
          <h3>给情绪命名，并为它打一个强度</h3>
          <p class="body-copy">情绪之轮只作为参考。你既可以点选已有标签，也可以写下属于你自己的情绪命名。</p>
        </div>

        <div>
          <p class="group-title">已选情绪</p>
          <div class="selected-strip">
            ${selectedStripMarkup({
              projectId: "emotion",
              selectedIds: ui.guided.selectedEmotionIds,
              removeDataset: { guidedRemove: "emotion" },
              emptyText: "还没有选情绪。可以先从最接近的词开始。"
            })}
          </div>
        </div>

        <div>
          <p class="group-title">输入情绪</p>
          <div class="input-shell">
            <input
              id="guided-emotion-input"
              type="text"
              autocomplete="off"
              placeholder="例如：伤心、麻木、担心、安心"
              value="${escapeHtml(ui.guided.emotionQuery)}"
            >
          </div>
          <div id="guided-emotion-suggestions" class="suggestion-list"></div>
        </div>

        <div class="form-block">
          <label class="field-label" for="guided-intensity">这股情绪的强度</label>
          <div class="range-wrap">
            <input id="guided-intensity" type="range" min="1" max="5" step="1" value="${ui.guided.intensity}">
            <div class="range-meta">
              <span>轻微</span>
              <strong id="guided-intensity-label">${escapeHtml(DATA.intensityLabels[ui.guided.intensity])}</strong>
              <span>强烈</span>
            </div>
          </div>
        </div>

        <details class="details-card" open>
          <summary>情绪之轮参考</summary>
          <div class="details-inner wheel-grid">
            ${DATA.emotionCategories.map((category) => `
              <div class="wheel-group">
                <div class="record-entry-title">
                  <span class="tag-dot large" style="--dot-color:${safeColor(category.color)}"></span>
                  <span>${escapeHtml(category.label)}</span>
                </div>
                ${category.groups.map((group) => `
                  <div>
                    <div class="wheel-label">${escapeHtml(group.label)}</div>
                    <div class="choice-grid">
                      ${group.tags.map((tagLabel) => {
                        const tagId = `${category.id}-${tagLabel}`;
                        return choiceChipMarkup({
                          label: tagLabel,
                          dotColor: category.color,
                          active: ui.guided.selectedEmotionIds.includes(tagId),
                          dataset: { guidedSelect: "emotion", tagId }
                        });
                      }).join("")}
                    </div>
                  </div>
                `).join("")}
              </div>
            `).join("")}
          </div>
        </details>
      </div>
    `;
  }

  function guidedEventStepMarkup() {
    return `
      <div class="step-card">
        <div class="step-copy">
          <h3>发生了什么</h3>
          <p class="body-copy">可以写现在刚发生的事，也可以写前几天延续下来的事，或者某段回忆突然被勾起来。</p>
        </div>
        <div class="form-block">
          <label class="field-label" for="guided-event-text">这一刻最想记下来的事情</label>
          <textarea
            id="guided-event-text"
            rows="6"
            placeholder="例如：下午开会前突然想到上周的冲突，胸口一下就紧了起来。"
          >${escapeHtml(ui.guided.eventText)}</textarea>
        </div>
      </div>
    `;
  }

  function guidedEchoStepMarkup() {
    return `
      <div class="step-card">
        <div class="step-copy">
          <h3>旧日回声</h3>
          <p class="body-copy">这一步可以跳过。如果你愿意，可以记下小时候或更早以前有没有类似感觉。</p>
        </div>
        <div class="form-block">
          <label class="field-label" for="guided-childhood-echo">这个感觉小时候有没有类似经历</label>
          <textarea
            id="guided-childhood-echo"
            rows="6"
            placeholder="例如：小时候被点名批评时，也会有同样胸口发紧、想躲起来的感觉。"
          >${escapeHtml(ui.guided.childhoodEcho)}</textarea>
        </div>
      </div>
    `;
  }

  function renderStats() {
    renderStatsRangeButtons();

    const records = filterRecordsByRange(ui.statsRange);
    const emotionEntries = collectProjectTagEntries(records, "emotion");
    const somaticEntries = collectProjectTagEntries(records, "somatic");
    const projectCounts = countProjectUsage(records);

    const avgIntensity = emotionEntries.length
      ? (emotionEntries.reduce((sum, item) => sum + Number(item.intensity || 0), 0) / emotionEntries.length).toFixed(1)
      : "--";

    els.statsSummary.innerHTML = `
      ${summaryCardMarkup("记录总数", `${records.length}`, "当前筛选范围里一共记下了多少次。")}
      ${summaryCardMarkup("记录天数", `${new Set(records.map((record) => record.day)).size}`, "这一段时间里有多少天留下了记录。")}
      ${summaryCardMarkup("平均强度", `${avgIntensity}`, "按所有情绪标签的强度平均值估算。")}
      ${summaryCardMarkup("涉及项目", `${Object.keys(projectCounts).length}`, "这段时间里被记录过的项目数量。")}
    `;

    renderEmotionDonut(emotionEntries);
    renderIntensityTrend(records);
    renderProjectFrequency(projectCounts);
    renderSomaticFrequency(somaticEntries);
  }

  function renderStatsRangeButtons() {
    els.statsRangeSelector.querySelectorAll("[data-range]").forEach((button) => {
      button.classList.toggle("active", button.dataset.range === ui.statsRange);
    });
  }

  function renderEmotionDonut(entries) {
    const counts = new Map();

    entries.forEach((entry) => {
      const key = entry.categoryName || "自定义";
      const color = entry.color || getProject("emotion").color;
      if (!counts.has(key)) counts.set(key, { label: key, count: 0, color });
      counts.get(key).count += 1;
    });

    const list = Array.from(counts.values()).sort((a, b) => b.count - a.count);
    const total = list.reduce((sum, item) => sum + item.count, 0);

    if (!total) {
      els.emotionDonut.classList.add("empty");
      els.emotionDonut.style.background = "conic-gradient(#ddd2c7 0deg, #efe4d8 360deg)";
      els.donutCenterLabel.textContent = "暂无情绪数据";
      els.emotionLegend.innerHTML = renderEmptyState("开始记录情绪后，这里会看到分类分布。");
      return;
    }

    els.emotionDonut.classList.remove("empty");
    let current = 0;
    const gradient = list.map((item) => {
      const start = current;
      const delta = (item.count / total) * 360;
      current += delta;
      return `${safeColor(item.color)} ${start}deg ${current}deg`;
    }).join(", ");

    els.emotionDonut.style.background = `conic-gradient(${gradient})`;
    els.donutCenterLabel.textContent = `${total} 次情绪命名`;
    els.emotionLegend.innerHTML = list.map((item) => `
      <div class="legend-item">
        <span class="legend-label">
          <span class="tag-dot" style="--dot-color:${safeColor(item.color)}"></span>
          <span>${escapeHtml(item.label)}</span>
        </span>
        <span>${item.count}</span>
      </div>
    `).join("");
  }

  function renderIntensityTrend(records) {
    const days = trendDays(ui.statsRange, records);

    els.intensityTrend.innerHTML = days.map((dayKey) => {
      const dayEntries = collectProjectTagEntries(records.filter((record) => record.day === dayKey), "emotion");
      const average = dayEntries.length
        ? dayEntries.reduce((sum, entry) => sum + Number(entry.intensity || 0), 0) / dayEntries.length
        : 0;
      const height = average ? Math.max(12, Math.round((average / 5) * 100)) : 10;

      return `
        <div class="trend-bar-wrap">
          <span class="trend-value">${average ? average.toFixed(1) : "--"}</span>
          <div class="trend-bar ${average ? "" : "empty"}" style="height:${height}%"></div>
          <span class="trend-day">${escapeHtml(formatMiniDay(dayKey))}</span>
        </div>
      `;
    }).join("");
  }

  function renderProjectFrequency(projectCounts) {
    const list = Object.entries(projectCounts)
      .map(([projectId, count]) => ({
        projectId,
        project: getProject(projectId),
        count
      }))
      .filter((item) => item.project)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    if (!list.length) {
      els.projectFrequency.innerHTML = renderEmptyState("开始记录不同项目后，这里会显示每个项目出现的频率。");
      return;
    }

    const max = Math.max(...list.map((item) => item.count));

    els.projectFrequency.innerHTML = list.map((item) => `
      <div class="bar-item">
        <div class="bar-head">
          <span class="legend-label">
            <span class="tag-dot" style="--dot-color:${safeColor(item.project.color)}"></span>
            <span>${escapeHtml(item.project.name)}</span>
          </span>
          <span>${item.count}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${Math.max(8, Math.round((item.count / max) * 100))}%"></div>
        </div>
      </div>
    `).join("");
  }

  function renderSomaticFrequency(entries) {
    const counts = new Map();

    entries.forEach((entry) => {
      const key = entry.label;
      if (!counts.has(key)) counts.set(key, { label: key, count: 0, color: entry.color || getProject("somatic").color });
      counts.get(key).count += 1;
    });

    const list = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 8);

    if (!list.length) {
      els.somaticFrequency.innerHTML = renderEmptyState("记录躯体感觉后，这里会显示最常出现的身体线索。");
      return;
    }

    els.somaticFrequency.innerHTML = list.map((item) => `
      <div class="pill-item">
        <span class="legend-label">
          <span class="tag-dot" style="--dot-color:${safeColor(item.color)}"></span>
          <strong>${escapeHtml(item.label)}</strong>
        </span>
        <span class="record-meta">出现 ${item.count} 次</span>
      </div>
    `).join("");
  }

  function renderRecentRecords() {
    const recent = [...state.records]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 50);

    if (!recent.length) {
      els.recentRecords.innerHTML = renderEmptyState("还没有记录。你可以先从首页快速记录，或者去引导页慢慢整理一次。");
      return;
    }

    els.recentRecords.innerHTML = recent.map((record) => `
      <article class="record-card">
        <div class="record-header">
          <div>
            <h4>${escapeHtml(`${record.slotName} · ${formatRecordMoment(record.createdAt)}`)}</h4>
            <div class="record-meta">${escapeHtml(sourceLabel(record.source))}${record.projectEntries.length ? ` · ${escapeHtml(record.projectEntries.map((entry) => entry.projectName).join(" / "))}` : ""}</div>
          </div>
          <span class="usage-badge">${escapeHtml(record.day)}</span>
        </div>
        ${recordBodyMarkup(record)}
        <div class="record-entry-list">
          ${record.projectEntries.map((entry) => recordEntryMarkup(entry)).join("")}
        </div>
      </article>
    `).join("");
  }

  function renderSettings() {
    els.settingsView.innerHTML = settingsPageMarkup();
  }

  function settingsPageMarkup() {
    if (ui.settings.page === "root") return settingsRootMarkup();
    if (ui.settings.page === "export") return settingsExportMarkup();
    if (ui.settings.page === "library") return settingsLibraryMarkup();
    if (ui.settings.page === "project-detail") return settingsProjectDetailMarkup();
    if (ui.settings.page === "reminders") return settingsRemindersMarkup();
    if (ui.settings.page === "backup") return settingsBackupMarkup();
    if (ui.settings.page === "install") return settingsInstallMarkup();
    return settingsPrivacyMarkup();
  }

  function settingsRootMarkup() {
    return `
      <div class="card settings-shell">
        <div class="settings-header">
          <p class="eyebrow">Settings</p>
          <h2>设置</h2>
          <p class="body-copy">把复杂功能都收在这里，首页只保留最常用的记录动作。</p>
        </div>
        <div class="settings-list">
          ${DATA.settingsMenu.map((item) => `
            <button class="settings-row" type="button" data-settings-open="${item.id}">
              <div class="settings-row-copy">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.description)}</p>
              </div>
              <span class="settings-chevron">›</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function settingsExportMarkup() {
    ensureExportSelectionValid();

    return settingsShellMarkup({
      eyebrow: "Export",
      title: "导出记录",
      description: "按时间范围筛选项目，整理成适合复制给 AI 或自己回看的文字版。",
      backTo: "root",
      content: `
        <div class="manager-panel">
          <div class="time-grid">
            <div class="form-block">
              <label class="field-label" for="export-from">开始日期</label>
              <input id="export-from" type="date" value="${escapeHtml(ui.export.from)}">
            </div>
            <div class="form-block">
              <label class="field-label" for="export-to">结束日期</label>
              <input id="export-to" type="date" value="${escapeHtml(ui.export.to)}">
            </div>
          </div>
          <div class="form-block">
            <label class="field-label">选择项目</label>
            <div class="filter-wrap">
              ${state.projects.map((project) => `
                <button
                  type="button"
                  class="filter-chip ${ui.export.selectedProjectIds.includes(project.id) ? "active" : ""}"
                  data-export-project-id="${project.id}"
                >
                  <span class="tag-dot" style="--dot-color:${safeColor(project.color)}"></span>
                  <span>${escapeHtml(project.name)}</span>
                </button>
              `).join("")}
            </div>
          </div>
          <div class="button-row">
            <button class="secondary-button" type="button" data-settings-action="generate-export">生成文字版</button>
            <button class="ghost-button" type="button" data-settings-action="copy-export">复制</button>
            <button class="ghost-button" type="button" data-settings-action="download-export">下载 txt</button>
          </div>
        </div>

        <div class="form-block">
          <label class="field-label" for="export-preview">预览</label>
          <textarea id="export-preview" rows="12" readonly>${escapeHtml(ui.export.preview)}</textarea>
        </div>
      `
    });
  }

  function settingsLibraryMarkup() {
    const tab = ui.settings.libraryTab;

    let content = "";

    if (tab === "emotion" || tab === "somatic") {
      const project = getProject(tab);
      content = `
        <div class="manager-panel">
          <p class="settings-note">保留内置标签，也支持继续添加你自己的标签。颜色可以随时再改。</p>
          <div class="input-grid two-up">
            <input id="library-tag-name" type="text" placeholder="输入一个新标签">
            <input id="library-tag-color" type="color" value="${safeColor(project.color)}" aria-label="标签颜色">
          </div>
          <button class="secondary-button" type="button" data-settings-action="add-library-tag" data-project-id="${project.id}">
            新增${project.name}标签
          </button>
        </div>
        <div class="manager-list">
          ${managerTagRowsMarkup(project.id)}
        </div>
      `;
    } else {
      const customProjects = getCustomProjects().sort((a, b) => {
        const usage = getUsageMaps().projectById;
        return (usage.get(b.id) || 0) - (usage.get(a.id) || 0);
      });

      content = `
        <div class="manager-panel">
          <p class="settings-note">先创建项目，再点进去逐个添加标签和颜色。</p>
          <div class="input-grid two-up">
            <input id="new-project-name" type="text" placeholder="例如：学习、饭量、社交">
            <input id="new-project-color" type="color" value="#4f8f8b" aria-label="项目主题色">
          </div>
          <button class="secondary-button" type="button" data-settings-action="create-project">新增项目</button>
        </div>
        <div class="manager-list">
          ${customProjects.length ? customProjects.map((project) => projectRowMarkup(project)).join("") : renderEmptyState("还没有自定义项目。先创建一个项目，再进去逐个添加标签。")}
        </div>
      `;
    }

    return settingsShellMarkup({
      eyebrow: "Library",
      title: "标签与项目管理",
      description: "这里统一管理情绪、躯体和其他自定义项目。",
      backTo: "root",
      content: `
        <div class="settings-tabs">
          ${settingsTabMarkup("emotion", "情绪")}
          ${settingsTabMarkup("somatic", "躯体")}
          ${settingsTabMarkup("projects", "其他项目")}
        </div>
        ${content}
      `
    });
  }

  function settingsProjectDetailMarkup() {
    const project = getProject(ui.settings.projectId);

    if (!project || isBuiltinProject(project.id)) {
      ui.settings.page = "library";
      ui.settings.libraryTab = "projects";
      return settingsLibraryMarkup();
    }

    return settingsShellMarkup({
      eyebrow: "Custom Project",
      title: project.name,
      description: "在这里管理项目名称、主题色，以及它下面的标签。",
      backTo: "library",
      content: `
        <div class="manager-panel">
          <div class="input-grid two-up">
            <input id="project-detail-name" type="text" value="${escapeHtml(project.name)}" placeholder="项目名称">
            <input id="project-detail-color" type="color" value="${safeColor(project.color)}" aria-label="项目主题色">
          </div>
          <div class="button-row">
            <button class="secondary-button" type="button" data-settings-action="save-project-detail" data-project-id="${project.id}">保存项目设置</button>
            <button class="danger-button" type="button" data-settings-action="delete-project" data-project-id="${project.id}">删除项目</button>
          </div>
        </div>

        <div class="manager-panel">
          <p class="settings-note">标签一次添加一个，后面还可以继续补充和换颜色。</p>
          <div class="input-grid two-up">
            <input id="project-detail-tag-name" type="text" placeholder="例如：数学、英语、语文">
            <input id="project-detail-tag-color" type="color" value="${safeColor(project.color)}" aria-label="标签颜色">
          </div>
          <button class="secondary-button" type="button" data-settings-action="add-project-tag" data-project-id="${project.id}">新增项目标签</button>
        </div>

        <div class="manager-list">
          ${managerTagRowsMarkup(project.id)}
        </div>
      `
    });
  }

  function settingsRemindersMarkup() {
    const reminders = state.settings.reminders || deepCopy(DEFAULT_REMINDERS);

    return settingsShellMarkup({
      eyebrow: "Reminders",
      title: "提醒设置",
      description: "按时段检查今天有没有漏记，帮助你把记录慢慢变成习惯。",
      backTo: "root",
      content: `
        <div class="switch-row">
          <div class="settings-row-copy">
            <strong>开启记录提醒</strong>
            <p>网页和安装后的主屏幕模式都可以用，但浏览器通知权限需要你手动允许。</p>
          </div>
          <input id="reminder-enabled" type="checkbox" ${reminders.enabled ? "checked" : ""}>
        </div>
        <p class="settings-note" id="reminder-status">${escapeHtml(getReminderStatusText())}</p>
        <div class="manager-panel">
          <div class="time-grid">
            ${reminderTimeFieldMarkup("late-night", "凌晨", reminders.times["late-night"])}
            ${reminderTimeFieldMarkup("morning", "早上", reminders.times.morning)}
            ${reminderTimeFieldMarkup("afternoon", "下午", reminders.times.afternoon)}
            ${reminderTimeFieldMarkup("evening", "晚上", reminders.times.evening)}
          </div>
          <div class="button-row">
            <button class="ghost-button" type="button" data-settings-action="request-notification">通知权限</button>
            <button class="secondary-button" type="button" data-settings-action="test-reminder">发送测试提醒</button>
          </div>
        </div>
      `
    });
  }

  function settingsBackupMarkup() {
    return settingsShellMarkup({
      eyebrow: "Backup",
      title: "备份与恢复",
      description: "记录默认只保存在本机浏览器里，所以备份很重要。",
      backTo: "root",
      content: `
        <div class="manager-panel">
          <div class="button-row">
            <button class="secondary-button" type="button" data-settings-action="export-backup">导出 JSON 备份</button>
            <button class="ghost-button" type="button" data-settings-action="trigger-import">导入备份</button>
          </div>
          <input id="backup-import-file" type="file" accept=".json,application/json" class="hidden">
          <p class="settings-note" id="backup-status">导入备份会覆盖当前浏览器里的本地数据。</p>
        </div>
      `
    });
  }

  function settingsInstallMarkup() {
    return settingsShellMarkup({
      eyebrow: "Install",
      title: "安装到主屏幕",
      description: "安装后会更像一个小型 App，也更适合在手机上打开和记录。",
      backTo: "root",
      content: `
        <div class="manager-panel">
          <div class="button-row">
            <button class="primary-button" type="button" data-settings-action="install-app">安装到主屏幕</button>
            <button class="ghost-button" type="button" data-settings-action="refresh-app">刷新离线缓存</button>
          </div>
          <p class="settings-note" id="install-status">${escapeHtml(getInstallStatusText())}</p>
        </div>
      `
    });
  }

  function settingsPrivacyMarkup() {
    return settingsShellMarkup({
      eyebrow: "Privacy",
      title: "隐私与紧急提示",
      description: "这里放的是使用上的重要提醒，不会替代专业帮助。",
      backTo: "root",
      content: `
        <div class="notice-list">
          <div class="manager-row">
            <div class="manager-copy">
              <strong>数据默认只存在本机</strong>
              <p>当前版本没有账号系统，也不会自动上传到云端。清理浏览器数据或更换设备前，记得先去“备份与恢复”导出一份 JSON。</p>
            </div>
          </div>
          <div class="manager-row">
            <div class="manager-copy">
              <strong>导出文本适合和 AI 或咨询记录一起使用</strong>
              <p>导出内容会包含时间、项目、标签和备注，方便你一次整理一周或一个阶段的状态。</p>
            </div>
          </div>
          <div class="manager-row">
            <div class="manager-copy">
              <strong>如果你正在经历紧急风险</strong>
              <p>请优先联系当地紧急援助、可信任的人，或线下专业支持。这一页只是记录工具，不适合在紧急时刻单独承担帮助功能。</p>
            </div>
          </div>
        </div>
      `
    });
  }

  function settingsShellMarkup({ eyebrow, title, description, backTo, content }) {
    return `
      <div class="card settings-shell">
        <button class="settings-back" type="button" data-settings-back="${backTo}">‹ 返回</button>
        <div class="settings-header">
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h2>${escapeHtml(title)}</h2>
          <p class="body-copy">${escapeHtml(description)}</p>
        </div>
        ${content}
      </div>
    `;
  }

  function managerTagRowsMarkup(projectId) {
    const project = getProject(projectId);
    if (!project) return renderEmptyState("这个项目还不存在。");

    const usage = getUsageMaps();
    const tags = [...(project.tags || [])].sort((a, b) => {
      const countA = usage.tagById.get(a.id) || usage.tagByLabel.get(normalizeLabel(a.label)) || 0;
      const countB = usage.tagById.get(b.id) || usage.tagByLabel.get(normalizeLabel(b.label)) || 0;
      if (countA !== countB) return countB - countA;
      return a.label.localeCompare(b.label, "zh-CN");
    });

    if (!tags.length) return renderEmptyState("这里还没有标签。先新增一个。");

    return tags.map((tag) => {
      const count = usage.tagById.get(tag.id) || usage.tagByLabel.get(normalizeLabel(tag.label)) || 0;
      const meta = tag.categoryName
        ? `${tag.categoryName}${tag.groupLabel ? ` · ${tag.groupLabel}` : ""}`
        : `已记录 ${count} 次`;

      return `
        <div class="manager-row">
          <div class="manager-info">
            <span class="tag-dot large" style="--dot-color:${safeColor(tag.color || project.color)}"></span>
            <div class="manager-copy">
              <strong>${escapeHtml(tag.label)}</strong>
              <p>${escapeHtml(meta)}</p>
            </div>
          </div>
          <div class="manager-actions">
            <span class="usage-badge">已记录 ${count} 次</span>
            <input
              type="color"
              value="${safeColor(tag.color || project.color)}"
              data-settings-action="tag-color"
              data-project-id="${project.id}"
              data-tag-id="${tag.id}"
              aria-label="修改标签颜色"
            >
            <button
              class="mini-button"
              type="button"
              data-settings-action="delete-tag"
              data-project-id="${project.id}"
              data-tag-id="${tag.id}"
            >删除</button>
          </div>
        </div>
      `;
    }).join("");
  }

  function projectRowMarkup(project) {
    const count = getUsageMaps().projectById.get(project.id) || 0;
    return `
      <button class="project-row" type="button" data-settings-action="open-project" data-project-id="${project.id}">
        <div class="manager-info">
          <span class="tag-dot large" style="--dot-color:${safeColor(project.color)}"></span>
          <div class="project-copy">
            <strong>${escapeHtml(project.name)}</strong>
            <p>${(project.tags || []).length} 个标签 · 已记录 ${count} 次</p>
          </div>
        </div>
        <span class="settings-chevron">›</span>
      </button>
    `;
  }

  function settingsTabMarkup(tabId, label) {
    return `
      <button
        class="settings-tab ${ui.settings.libraryTab === tabId ? "active" : ""}"
        type="button"
        data-settings-tab="${tabId}"
      >${escapeHtml(label)}</button>
    `;
  }

  function reminderTimeFieldMarkup(slotId, label, value) {
    return `
      <div class="form-block">
        <label class="field-label" for="reminder-time-${slotId}">${escapeHtml(label)}</label>
        <input id="reminder-time-${slotId}" type="time" value="${escapeHtml(value || DEFAULT_REMINDERS.times[slotId])}">
      </div>
    `;
  }

  function choiceChipMarkup({ label, active, dataset, dotColor }) {
    const attrs = Object.entries(dataset || {}).map(([key, value]) => `data-${toDataAttr(key)}="${escapeHtml(String(value))}"`).join(" ");
    return `
      <button type="button" class="choice-chip ${active ? "active" : ""}" ${attrs}>
        ${dotColor ? `<span class="tag-dot" style="--dot-color:${safeColor(dotColor)}"></span>` : ""}
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }

  function selectedStripMarkup({ projectId, selectedIds, removeDataset, emptyText }) {
    pruneMissingSelectedIds(projectId, selectedIds);
    const project = getProject(projectId);

    if (!project || !selectedIds.length) {
      return `<div class="selected-placeholder">${escapeHtml(emptyText)}</div>`;
    }

    const usage = getUsageMaps();
    const tags = selectedIds
      .map((tagId) => getTag(projectId, tagId))
      .filter(Boolean)
      .sort((a, b) => {
        const countA = usage.tagById.get(a.id) || usage.tagByLabel.get(normalizeLabel(a.label)) || 0;
        const countB = usage.tagById.get(b.id) || usage.tagByLabel.get(normalizeLabel(b.label)) || 0;
        if (countA !== countB) return countB - countA;
        return a.label.localeCompare(b.label, "zh-CN");
      });

    return tags.map((tag) => {
      const attrs = Object.entries(removeDataset || {})
        .map(([key, value]) => `data-${toDataAttr(key)}="${escapeHtml(String(value))}"`)
        .join(" ");
      return `
        <div class="selected-chip">
          <span class="tag-dot" style="--dot-color:${safeColor(tag.color || project.color)}"></span>
          <span class="selected-chip__label">${escapeHtml(tag.label)}</span>
          <button
            type="button"
            class="chip-remove"
            ${attrs}
            data-tag-id="${tag.id}"
            aria-label="移除 ${escapeHtml(tag.label)}"
          >×</button>
        </div>
      `;
    }).join("");
  }

  function renderSelectedStrip(container, options) {
    container.innerHTML = selectedStripMarkup(options);
  }

  function renderTagSuggestionList(container, { context, projectId, query, selectedIds, emptyText }) {
    const project = getProject(projectId);

    if (!container) return;

    if (!project) {
      container.innerHTML = `<div class="empty-inline">${escapeHtml(emptyText)}</div>`;
      return;
    }

    const trimmed = String(query || "").trim();
    const suggestions = getTagSuggestions(projectId, trimmed, selectedIds || [], 8);
    const usage = getUsageMaps();
    const parts = [];

    if (trimmed && !findTagByLabel(projectId, trimmed)) {
      parts.push(suggestionButtonMarkup({
        context,
        type: "tag",
        title: `新增“${trimmed}”`,
        meta: "按这个名字创建一个新标签",
        dotColor: project.color,
        projectId,
        createLabel: trimmed,
        isCreate: true
      }));
    }

    suggestions.forEach((tag) => {
      const meta = tag.categoryName
        ? `${tag.categoryName}${tag.groupLabel ? ` · ${tag.groupLabel}` : ""}`
        : `已记录 ${usage.tagById.get(tag.id) || usage.tagByLabel.get(normalizeLabel(tag.label)) || 0} 次`;

      parts.push(suggestionButtonMarkup({
        context,
        type: "tag",
        title: tag.label,
        meta,
        dotColor: tag.color || project.color,
        projectId,
        tagId: tag.id
      }));
    });

    container.innerHTML = parts.length
      ? parts.join("")
      : `<div class="empty-inline">${escapeHtml(emptyText)}</div>`;
  }

  function suggestionButtonMarkup({ context, type, title, meta, dotColor, projectId, tagId, createLabel, createName, isCreate }) {
    const dataset = [
      `data-suggestion-type="${type}"`,
      `data-context="${context}"`
    ];

    if (projectId) dataset.push(`data-project-id="${projectId}"`);
    if (tagId) dataset.push(`data-tag-id="${tagId}"`);
    if (createLabel) dataset.push(`data-create-label="${escapeHtml(createLabel)}"`);
    if (createName) dataset.push(`data-create-name="${escapeHtml(createName)}"`);

    return `
      <button type="button" class="suggestion-item ${isCreate ? "create" : ""}" ${dataset.join(" ")}>
        <span class="suggestion-main">
          <span class="tag-dot" style="--dot-color:${safeColor(dotColor)}"></span>
          <span class="suggestion-title">${escapeHtml(title)}</span>
        </span>
        <span class="suggestion-meta">${escapeHtml(meta)}</span>
      </button>
    `;
  }

  function summaryCardMarkup(title, value, description) {
    return `
      <div class="summary-card">
        <p class="eyebrow">${escapeHtml(title)}</p>
        <strong>${escapeHtml(value)}</strong>
        <p>${escapeHtml(description)}</p>
      </div>
    `;
  }

  function recordBodyMarkup(record) {
    const lines = [];

    if (record.bodyAreas && record.bodyAreas.length) {
      lines.push(`身体部位：${record.bodyAreas.join(" / ")}`);
    }

    if (record.eventText) {
      lines.push(`发生了什么：${record.eventText}`);
    }

    if (record.childhoodEcho) {
      lines.push(`旧日回声：${record.childhoodEcho}`);
    }

    if (record.note && record.source !== "other") {
      lines.push(`备注：${record.note}`);
    }

    if (!lines.length) return "";

    return `<div class="record-body">${lines.map((line) => escapeHtml(line)).join("<br>")}</div>`;
  }

  function recordEntryMarkup(entry) {
    const project = getProject(entry.projectId);
    const projectColor = entry.projectColor || (project && project.color) || "#4f8f8b";
    return `
      <div class="record-entry">
        <div class="record-entry-title">
          <span class="tag-dot" style="--dot-color:${safeColor(projectColor)}"></span>
          <span>${escapeHtml(entry.projectName)}</span>
        </div>
        <div class="record-badges">
          ${(entry.entries || []).map((item) => `
            <span class="tag-badge">
              <span class="tag-dot" style="--dot-color:${safeColor(item.color || projectColor)}"></span>
              <span>${escapeHtml(item.label)}${item.intensity ? ` · ${item.intensity}` : ""}</span>
            </span>
          `).join("")}
        </div>
        ${entry.note ? `<div class="record-entry-note">${escapeHtml(entry.note)}</div>` : ""}
      </div>
    `;
  }

  function renderEmptyState(message) {
    return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
  }

  function onQuickSelectedClick(event) {
    const button = event.target.closest("[data-action='remove-quick-tag']");
    if (!button) return;

    const list = button.dataset.kind === "emotion"
      ? ui.quick.selectedEmotionIds
      : ui.quick.selectedSomaticIds;

    removeFromArray(list, button.dataset.tagId);
    renderQuickSelectedStrips();
    renderQuickEmotionSuggestions();
    renderQuickSomaticSuggestions();
  }

  function onOtherRecordStripClick(event) {
    const button = event.target.closest("[data-action='delete-other-record']");
    if (!button) return;

    const record = state.records.find((item) => item.id === button.dataset.recordId);
    if (!record) return;

    const ok = window.confirm("删除这条其他项目记录后将无法恢复，确定继续吗？");
    if (!ok) return;

    state.records = state.records.filter((item) => item.id !== record.id);
    saveState();
    renderApp();
    toast("已删除这条其他项目记录");
  }

  function onSuggestionClick(event) {
    const button = event.target.closest("[data-suggestion-type]");
    if (!button) return;
    handleSuggestion(button.dataset);
  }

  function handleSuggestion(dataset) {
    if (dataset.suggestionType === "project") {
      if (dataset.context !== "other-project") return;
      if (dataset.createName) {
        const project = createCustomProject(dataset.createName, pickProjectColor(dataset.createName));
        selectOtherProject(project.id);
        renderHome();
        toast(`已创建项目：${project.name}`);
        return;
      }

      selectOtherProject(dataset.projectId);
      renderHome();
      return;
    }

    if (dataset.suggestionType !== "tag") return;

    let tagId = dataset.tagId;
    const projectId = dataset.projectId;

    if (dataset.createLabel) {
      const project = getProject(projectId);
      const createdTag = ensureTag(
        projectId,
        dataset.createLabel,
        project ? project.color : "#4f8f8b",
        projectId === "emotion" ? { categoryName: "自定义" } : {}
      );
      tagId = createdTag.id;
    }

    if (dataset.context === "quick-emotion") {
      addQuickTagById("emotion", tagId);
      return;
    }

    if (dataset.context === "quick-somatic") {
      addQuickTagById("somatic", tagId);
      return;
    }

    if (dataset.context === "guided-emotion") {
      addGuidedTagById("emotion", tagId);
      return;
    }

    if (dataset.context === "guided-somatic") {
      addGuidedTagById("somatic", tagId);
      return;
    }

    if (dataset.context === "other-tag") {
      selectOtherTag(projectId, tagId);
      renderHome();
    }
  }

  function onGuidedClick(event) {
    const suggestionButton = event.target.closest("[data-suggestion-type]");
    if (suggestionButton) {
      handleSuggestion(suggestionButton.dataset);
      return;
    }

    const bodyButton = event.target.closest("[data-guided-body-area]");
    if (bodyButton) {
      toggleInArray(ui.guided.bodyAreas, bodyButton.dataset.guidedBodyArea);
      renderGuided();
      return;
    }

    const selectButton = event.target.closest("[data-guided-select]");
    if (selectButton) {
      const tagId = selectButton.dataset.tagId;
      if (selectButton.dataset.guidedSelect === "emotion") {
        toggleTagSelection(ui.guided.selectedEmotionIds, tagId);
      } else {
        toggleTagSelection(ui.guided.selectedSomaticIds, tagId);
      }
      renderGuided();
      return;
    }

    const removeButton = event.target.closest("[data-guided-remove]");
    if (removeButton) {
      if (removeButton.dataset.guidedRemove === "emotion") {
        removeFromArray(ui.guided.selectedEmotionIds, removeButton.dataset.tagId);
      } else {
        removeFromArray(ui.guided.selectedSomaticIds, removeButton.dataset.tagId);
      }
      renderGuided();
    }
  }

  function onGuidedInput(event) {
    const target = event.target;

    if (target.id === "guided-somatic-input") {
      ui.guided.somaticQuery = target.value;
      renderGuidedStepExtras();
      return;
    }

    if (target.id === "guided-emotion-input") {
      ui.guided.emotionQuery = target.value;
      renderGuidedStepExtras();
      return;
    }

    if (target.id === "guided-intensity") {
      ui.guided.intensity = Number(target.value);
      renderGuidedStepExtras();
      return;
    }

    if (target.id === "guided-event-text") {
      ui.guided.eventText = target.value;
      return;
    }

    if (target.id === "guided-childhood-echo") {
      ui.guided.childhoodEcho = target.value;
    }
  }

  function onGuidedKeydown(event) {
    if (event.key !== "Enter") return;

    if (event.target.id === "guided-somatic-input") {
      event.preventDefault();
      commitGuidedTag("somatic");
    }

    if (event.target.id === "guided-emotion-input") {
      event.preventDefault();
      commitGuidedTag("emotion");
    }
  }

  function onSettingsClick(event) {
    const openButton = event.target.closest("[data-settings-open]");
    if (openButton) {
      ui.settings.page = openButton.dataset.settingsOpen;
      if (ui.settings.page === "library") {
        ui.settings.libraryTab = ui.settings.libraryTab || "emotion";
      }
      renderSettings();
      return;
    }

    const backButton = event.target.closest("[data-settings-back]");
    if (backButton) {
      ui.settings.page = backButton.dataset.settingsBack;
      if (ui.settings.page === "library" && !ui.settings.libraryTab) {
        ui.settings.libraryTab = "emotion";
      }
      renderSettings();
      return;
    }

    const tabButton = event.target.closest("[data-settings-tab]");
    if (tabButton) {
      ui.settings.libraryTab = tabButton.dataset.settingsTab;
      renderSettings();
      return;
    }

    const exportChip = event.target.closest("[data-export-project-id]");
    if (exportChip) {
      toggleInArray(ui.export.selectedProjectIds, exportChip.dataset.exportProjectId);
      renderSettings();
      return;
    }

    const actionButton = event.target.closest("[data-settings-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.settingsAction;

    if (action === "generate-export") {
      generateExportText();
      return;
    }

    if (action === "copy-export") {
      copyExportText();
      return;
    }

    if (action === "download-export") {
      downloadExportText();
      return;
    }

    if (action === "add-library-tag") {
      addLibraryTag(actionButton.dataset.projectId);
      return;
    }

    if (action === "create-project") {
      createProjectFromSettings();
      return;
    }

    if (action === "open-project") {
      ui.settings.projectId = actionButton.dataset.projectId;
      ui.settings.page = "project-detail";
      renderSettings();
      return;
    }

    if (action === "save-project-detail") {
      saveProjectDetail(actionButton.dataset.projectId);
      return;
    }

    if (action === "delete-project") {
      deleteProject(actionButton.dataset.projectId);
      return;
    }

    if (action === "add-project-tag") {
      addProjectTag(actionButton.dataset.projectId);
      return;
    }

    if (action === "delete-tag") {
      deleteTag(actionButton.dataset.projectId, actionButton.dataset.tagId);
      return;
    }

    if (action === "export-backup") {
      exportBackupJson();
      return;
    }

    if (action === "trigger-import") {
      const fileInput = document.getElementById("backup-import-file");
      if (fileInput) fileInput.click();
      return;
    }

    if (action === "install-app") {
      promptInstallApp();
      return;
    }

    if (action === "refresh-app") {
      refreshServiceWorker();
      return;
    }

    if (action === "request-notification") {
      requestNotificationPermission();
      return;
    }

    if (action === "test-reminder") {
      sendTestReminder();
    }
  }

  function onSettingsInput(event) {
    const target = event.target;

    if (target.id === "export-from") {
      ui.export.from = target.value;
      return;
    }

    if (target.id === "export-to") {
      ui.export.to = target.value;
    }
  }

  function onSettingsChange(event) {
    const target = event.target;

    if (target.dataset.settingsAction === "tag-color") {
      updateTagColor(target.dataset.projectId, target.dataset.tagId, target.value);
      return;
    }

    if (target.id === "reminder-enabled") {
      state.settings.reminders.enabled = Boolean(target.checked);
      saveState();
      syncReminderStatusText();
      startReminderMonitor();
      renderSettings();
      return;
    }

    if (target.id === "reminder-time-late-night") {
      updateReminderTime("late-night", target.value);
      return;
    }

    if (target.id === "reminder-time-morning") {
      updateReminderTime("morning", target.value);
      return;
    }

    if (target.id === "reminder-time-afternoon") {
      updateReminderTime("afternoon", target.value);
      return;
    }

    if (target.id === "reminder-time-evening") {
      updateReminderTime("evening", target.value);
      return;
    }

    if (target.id === "backup-import-file") {
      importBackupJson(target);
    }
  }

  function updateReminderTime(slotId, value) {
    state.settings.reminders.times[slotId] = value;
    saveState();
    syncReminderStatusText();
  }

  function commitQuickTag(kind) {
    const projectId = kind === "emotion" ? "emotion" : "somatic";
    const query = kind === "emotion" ? ui.quick.emotionQuery.trim() : ui.quick.somaticQuery.trim();
    if (!query) return;

    const tag = findTagByLabel(projectId, query) || ensureTag(
      projectId,
      query,
      getProject(projectId).color,
      projectId === "emotion" ? { categoryName: "自定义" } : {}
    );

    addQuickTagById(kind, tag.id);
  }

  function addQuickTagById(kind, tagId) {
    const list = kind === "emotion" ? ui.quick.selectedEmotionIds : ui.quick.selectedSomaticIds;
    if (!list.includes(tagId)) list.push(tagId);

    if (kind === "emotion") {
      ui.quick.emotionQuery = "";
      els.quickEmotionInput.value = "";
    } else {
      ui.quick.somaticQuery = "";
      els.quickSomaticInput.value = "";
    }

    renderQuickSelectedStrips();
    renderQuickEmotionSuggestions();
    renderQuickSomaticSuggestions();
  }

  function commitGuidedTag(kind) {
    const projectId = kind === "emotion" ? "emotion" : "somatic";
    const query = kind === "emotion" ? ui.guided.emotionQuery.trim() : ui.guided.somaticQuery.trim();
    if (!query) return;

    const tag = findTagByLabel(projectId, query) || ensureTag(
      projectId,
      query,
      getProject(projectId).color,
      projectId === "emotion" ? { categoryName: "自定义" } : {}
    );

    addGuidedTagById(kind, tag.id);
  }

  function addGuidedTagById(kind, tagId) {
    const list = kind === "emotion" ? ui.guided.selectedEmotionIds : ui.guided.selectedSomaticIds;
    if (!list.includes(tagId)) list.push(tagId);

    if (kind === "emotion") {
      ui.guided.emotionQuery = "";
    } else {
      ui.guided.somaticQuery = "";
    }

    renderGuided();
  }

  function commitOtherProjectQuery() {
    const query = ui.other.projectQuery.trim();
    if (!query) return;

    const project = findCustomProjectByName(query) || getProjectSuggestions(query)[0];
    if (!project) return;
    selectOtherProject(project.id);
    renderHome();
  }

  function commitOtherTagQuery() {
    const project = getSelectedOtherProject(true);
    if (!project) {
      toast("先选一个项目，再继续写标签。");
      return;
    }

    const query = ui.other.tagQuery.trim();
    if (!query) return;

    const tag = findTagByLabel(project.id, query) || ensureTag(project.id, query, project.color);
    selectOtherTag(project.id, tag.id);
    renderHome();
  }

  function selectOtherProject(projectId) {
    const project = getProject(projectId);
    if (!project) return;

    ui.other.selectedProjectId = project.id;
    ui.other.projectQuery = project.name;
    ui.other.selectedTagId = "";
    ui.other.tagQuery = "";
  }

  function selectOtherTag(projectId, tagId) {
    const tag = getTag(projectId, tagId);
    if (!tag) return;

    ui.other.selectedProjectId = projectId;
    ui.other.projectQuery = getProject(projectId).name;
    ui.other.selectedTagId = tag.id;
    ui.other.tagQuery = tag.label;
  }

  function saveQuickRecord() {
    const note = ui.quick.note.trim();
    const emotionProject = getProject("emotion");
    const somaticProject = getProject("somatic");

    const emotionEntries = ui.quick.selectedEmotionIds
      .map((tagId) => toTagEntry(emotionProject, tagId, ui.quick.intensity))
      .filter(Boolean);
    const somaticEntries = ui.quick.selectedSomaticIds
      .map((tagId) => toTagEntry(somaticProject, tagId))
      .filter(Boolean);

    if (!emotionEntries.length && !somaticEntries.length && !note) {
      toast("至少留下一点情绪、躯体感受或一句话备注再保存。");
      return;
    }

    const record = createRecordBase("quick");
    record.note = note;

    if (emotionEntries.length) {
      record.projectEntries.push({
        projectId: emotionProject.id,
        projectName: emotionProject.name,
        projectColor: emotionProject.color,
        entries: emotionEntries,
        note: ""
      });
    }

    if (somaticEntries.length) {
      record.projectEntries.push({
        projectId: somaticProject.id,
        projectName: somaticProject.name,
        projectColor: somaticProject.color,
        entries: somaticEntries,
        note: ""
      });
    }

    state.records.push(record);
    saveState();
    ui.quick = {
      emotionQuery: "",
      somaticQuery: "",
      selectedEmotionIds: [],
      selectedSomaticIds: [],
      intensity: 3,
      note: ""
    };
    renderApp();
    toast("这次快速记录已经保存");
  }

  function saveOtherProjectRecord() {
    const project = getSelectedOtherProject(true);
    const tagLabel = ui.other.tagQuery.trim();
    const note = ui.other.note.trim();

    if (!project) {
      toast("先选择或输入一个项目。");
      return;
    }

    if (!tagLabel) {
      toast("再写一个标签，后面统计和回看会更清楚。");
      return;
    }

    const tag = ui.other.selectedTagId
      ? getTag(project.id, ui.other.selectedTagId)
      : findTagByLabel(project.id, tagLabel) || ensureTag(project.id, tagLabel, project.color);

    if (!tag) {
      toast("这个标签暂时没有创建成功，请再试一次。");
      return;
    }

    const record = createRecordBase("other");
    record.note = note;
    record.projectEntries.push({
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      entries: [toTagEntry(project, tag.id)],
      note
    });

    state.records.push(record);
    saveState();

    ui.other.tagQuery = "";
    ui.other.selectedTagId = "";
    ui.other.note = "";

    renderApp();
    toast("已添加一条其他项目记录");
  }

  function saveGuidedRecord() {
    const emotionProject = getProject("emotion");
    const somaticProject = getProject("somatic");
    const emotionEntries = ui.guided.selectedEmotionIds
      .map((tagId) => toTagEntry(emotionProject, tagId, ui.guided.intensity))
      .filter(Boolean);
    const somaticEntries = ui.guided.selectedSomaticIds
      .map((tagId) => toTagEntry(somaticProject, tagId))
      .filter(Boolean);

    const hasContent = emotionEntries.length
      || somaticEntries.length
      || ui.guided.bodyAreas.length
      || ui.guided.eventText.trim()
      || ui.guided.childhoodEcho.trim();

    if (!hasContent) {
      toast("这次引导还是空的，先留下一个感受或一件事再保存。");
      return;
    }

    const record = createRecordBase("guided");
    record.bodyAreas = [...ui.guided.bodyAreas];
    record.eventText = ui.guided.eventText.trim();
    record.childhoodEcho = ui.guided.childhoodEcho.trim();

    if (emotionEntries.length) {
      record.projectEntries.push({
        projectId: emotionProject.id,
        projectName: emotionProject.name,
        projectColor: emotionProject.color,
        entries: emotionEntries,
        note: ""
      });
    }

    if (somaticEntries.length) {
      record.projectEntries.push({
        projectId: somaticProject.id,
        projectName: somaticProject.name,
        projectColor: somaticProject.color,
        entries: somaticEntries,
        note: ""
      });
    }

    state.records.push(record);
    saveState();
    ui.guided = newGuidedDraft();
    renderApp();
    toast("这次引导记录已经保存");
  }

  function addLibraryTag(projectId) {
    const nameInput = document.getElementById("library-tag-name");
    const colorInput = document.getElementById("library-tag-color");
    const label = nameInput ? nameInput.value.trim() : "";
    const project = getProject(projectId);
    const color = colorInput ? colorInput.value : (project && project.color);

    if (!label) {
      toast("先输入一个标签名称。");
      return;
    }

    ensureTag(projectId, label, color, projectId === "emotion" ? { categoryName: "自定义" } : {});
    renderApp();
    toast("标签已经添加");
  }

  function createProjectFromSettings() {
    const nameInput = document.getElementById("new-project-name");
    const colorInput = document.getElementById("new-project-color");
    const name = nameInput ? nameInput.value.trim() : "";
    const color = colorInput ? colorInput.value : pickProjectColor(name);

    if (!name) {
      toast("先写一个项目名称。");
      return;
    }

    if (findCustomProjectByName(name)) {
      toast("这个项目已经存在了。");
      return;
    }

    const project = createCustomProject(name, color);
    ui.settings.projectId = project.id;
    ui.settings.page = "project-detail";
    renderApp();
    toast(`已创建项目：${project.name}`);
  }

  function saveProjectDetail(projectId) {
    const project = getProject(projectId);
    if (!project || isBuiltinProject(project.id)) return;

    const nameInput = document.getElementById("project-detail-name");
    const colorInput = document.getElementById("project-detail-color");
    const name = nameInput ? nameInput.value.trim() : project.name;
    const color = colorInput ? colorInput.value : project.color;

    if (!name) {
      toast("项目名称不能为空。");
      return;
    }

    const duplicated = getCustomProjects().find((item) => item.id !== project.id && normalizeLabel(item.name) === normalizeLabel(name));
    if (duplicated) {
      toast("已经有同名项目了，请换一个名字。");
      return;
    }

    project.name = name;
    project.color = safeColor(color, project.color);
    saveState();
    renderApp();
    toast("项目设置已保存");
  }

  function addProjectTag(projectId) {
    const project = getProject(projectId);
    if (!project || isBuiltinProject(project.id)) return;

    const nameInput = document.getElementById("project-detail-tag-name");
    const colorInput = document.getElementById("project-detail-tag-color");
    const label = nameInput ? nameInput.value.trim() : "";
    const color = colorInput ? colorInput.value : project.color;

    if (!label) {
      toast("先输入标签名称。");
      return;
    }

    ensureTag(projectId, label, color);
    renderApp();
    toast("项目标签已添加");
  }

  function deleteProject(projectId) {
    const project = getProject(projectId);
    if (!project || isBuiltinProject(project.id)) return;

    const ok = window.confirm("删除项目只会影响以后选择，不会删掉历史记录。确定继续吗？");
    if (!ok) return;

    state.projects = state.projects.filter((item) => item.id !== projectId);
    ui.export.selectedProjectIds = ui.export.selectedProjectIds.filter((id) => id !== projectId);

    if (ui.other.selectedProjectId === projectId) {
      ui.other.selectedProjectId = "";
      ui.other.selectedTagId = "";
      ui.other.projectQuery = "";
      ui.other.tagQuery = "";
    }

    ui.settings.page = "library";
    ui.settings.libraryTab = "projects";
    ui.settings.projectId = "";
    saveState();
    renderApp();
    toast("项目已删除");
  }

  function deleteTag(projectId, tagId) {
    const project = getProject(projectId);
    if (!project) return;

    const ok = window.confirm("删除标签只会影响以后联想和选择，不会删除历史记录。确定继续吗？");
    if (!ok) return;

    project.tags = (project.tags || []).filter((tag) => tag.id !== tagId);

    if (projectId === "emotion") {
      removeFromArray(ui.quick.selectedEmotionIds, tagId);
      removeFromArray(ui.guided.selectedEmotionIds, tagId);
    }

    if (projectId === "somatic") {
      removeFromArray(ui.quick.selectedSomaticIds, tagId);
      removeFromArray(ui.guided.selectedSomaticIds, tagId);
    }

    if (ui.other.selectedProjectId === projectId && ui.other.selectedTagId === tagId) {
      ui.other.selectedTagId = "";
      ui.other.tagQuery = "";
    }

    saveState();
    renderApp();
    toast("标签已删除");
  }

  function updateTagColor(projectId, tagId, value) {
    const tag = getTag(projectId, tagId);
    if (!tag) return;
    const project = getProject(projectId);
    tag.color = safeColor(value, tag.color || (project && project.color));
    saveState();
    renderApp();
  }

  function getSelectedOtherProject(allowCreate) {
    if (ui.other.selectedProjectId) {
      const project = getProject(ui.other.selectedProjectId);
      if (project) return project;
    }

    const query = ui.other.projectQuery.trim();
    if (!query) return null;

    const existing = findCustomProjectByName(query);
    if (existing) {
      ui.other.selectedProjectId = existing.id;
      return existing;
    }

    if (!allowCreate) return null;

    const project = createCustomProject(query, pickProjectColor(query));
    ui.other.selectedProjectId = project.id;
    ui.other.projectQuery = project.name;
    if (!ui.export.selectedProjectIds.includes(project.id)) {
      ui.export.selectedProjectIds.push(project.id);
    }
    toast(`已创建项目：${project.name}`);
    return project;
  }

  function projectNameMatchesSelection(value) {
    const project = getProject(ui.other.selectedProjectId);
    return project ? normalizeLabel(project.name) === normalizeLabel(value) : false;
  }

  function tagNameMatchesOtherSelection(value) {
    if (!ui.other.selectedProjectId || !ui.other.selectedTagId) return false;
    const tag = getTag(ui.other.selectedProjectId, ui.other.selectedTagId);
    return tag ? normalizeLabel(tag.label) === normalizeLabel(value) : false;
  }

  function generateExportText() {
    if (!ui.export.from || !ui.export.to) {
      toast("先选好导出时间范围。");
      return;
    }

    if (ui.export.from > ui.export.to) {
      toast("开始日期不能晚于结束日期。");
      return;
    }

    if (!ui.export.selectedProjectIds.length) {
      toast("至少选一个项目再导出。");
      return;
    }

    const rows = [...state.records]
      .filter((record) => record.day >= ui.export.from && record.day <= ui.export.to)
      .map((record) => ({
        ...record,
        projectEntries: record.projectEntries.filter((entry) => ui.export.selectedProjectIds.includes(entry.projectId))
      }))
      .filter((record) => record.projectEntries.length)
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

    ui.export.preview = buildExportText(rows);
    renderSettings();
    toast(rows.length ? "文字版已经生成" : "这个时间范围内没有匹配记录");
  }

  function copyExportText() {
    const text = ui.export.preview.trim();
    if (!text) {
      toast("先生成文字版，再复制。");
      return;
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => toast("已复制到剪贴板"))
        .catch(() => fallbackCopyText(text));
      return;
    }

    fallbackCopyText(text);
  }

  function fallbackCopyText(text) {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
    toast("已复制到剪贴板");
  }

  function downloadExportText() {
    const text = ui.export.preview.trim();
    if (!text) {
      toast("先生成文字版，再下载。");
      return;
    }

    downloadBlob(
      `心绪记录_${ui.export.from}_${ui.export.to}.txt`,
      text,
      "text/plain;charset=utf-8"
    );
    toast("txt 已开始下载");
  }

  function buildExportText(records) {
    const header = [
      "心绪记录导出",
      `时间范围：${ui.export.from} 至 ${ui.export.to}`,
      `导出项目：${ui.export.selectedProjectIds.map((id) => {
        const project = getProject(id);
        return project ? project.name : "";
      }).filter(Boolean).join("、")}`,
      `记录条数：${records.length}`,
      ""
    ];

    if (!records.length) {
      return header.concat(["这个时间范围内没有匹配记录。"]).join("\n");
    }

    const body = records.map((record, index) => {
      const created = new Date(record.createdAt);
      const lines = [
        `${index + 1}. ${record.day} ${record.slotName} ${pad(created.getHours())}:${pad(created.getMinutes())}`,
        `来源：${sourceLabel(record.source)}`
      ];

      if (record.bodyAreas && record.bodyAreas.length) {
        lines.push(`身体部位：${record.bodyAreas.join("、")}`);
      }

      record.projectEntries.forEach((entry) => {
        const tags = (entry.entries || []).map((item) => {
          const extras = [];
          if (item.categoryName) extras.push(item.categoryName);
          if (item.intensity) extras.push(`强度 ${item.intensity}`);
          return extras.length ? `${item.label}（${extras.join("，")}）` : item.label;
        }).join("、");

        lines.push(`${entry.projectName}：${tags}`);

        if (entry.note) {
          lines.push(`${entry.projectName}备注：${entry.note}`);
        }
      });

      if (record.eventText) lines.push(`发生了什么：${record.eventText}`);
      if (record.childhoodEcho) lines.push(`旧日回声：${record.childhoodEcho}`);
      if (record.note && record.source !== "other") lines.push(`备注：${record.note}`);

      return lines.join("\n");
    });

    return header.concat(body).join("\n\n");
  }

  function exportBackupJson() {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      app: DATA.appName,
      version: 2,
      payload: deepCopy(state)
    };

    downloadBlob(
      `心绪记录备份_${toDayKey(new Date())}.json`,
      JSON.stringify(snapshot, null, 2),
      "application/json;charset=utf-8"
    );

    toast("JSON 备份已导出");
  }

  function importBackupJson(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const payload = parsed.payload || parsed;
        const nextState = normalizeState(payload);
        const ok = window.confirm("导入备份会覆盖当前浏览器里的本地数据，确定继续吗？");
        if (!ok) return;

        overwriteState(nextState);
        seedExportDefaults();
        ensureExportSelectionValid();
        startReminderMonitor();
        renderApp();
        toast("备份已经恢复");
      } catch (_) {
        toast("这个备份文件格式不正确。");
      } finally {
        input.value = "";
      }
    };

    reader.readAsText(file, "utf-8");
  }

  function refreshServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      toast("当前浏览器不支持离线缓存刷新。");
      return;
    }

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) {
        toast("当前还没有注册离线缓存。");
        return;
      }

      registration.update();
      toast("已尝试刷新离线缓存");
    });
  }

  function bootstrapPwa() {
    registerServiceWorker();

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (ui.activeScreen === "settings" && ui.settings.page === "install") {
        renderSettings();
      }
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      if (ui.activeScreen === "settings" && ui.settings.page === "install") {
        renderSettings();
      }
      toast("已经安装到主屏幕");
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
    const isSecure = location.protocol === "https:" || isLocalhost;
    if (!isSecure) return;

    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  function getInstallStatusText() {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
      return "当前已经是安装后的独立模式。";
    }

    if (location.protocol === "file:") {
      return "当前是本地文件模式。想测试安装效果，请使用 http:// 或 https:// 打开。";
    }

    if (location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)) {
      return "安装和离线缓存通常需要 https 环境。";
    }

    if (deferredInstallPrompt) {
      return "当前浏览器已经给出安装资格，可以直接点击上方按钮安装。";
    }

    return "如果没有弹出安装按钮，也可以试试浏览器菜单里的“添加到主屏幕”。";
  }

  function promptInstallApp() {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
      toast("当前已经是主屏幕安装模式");
      return;
    }

    if (!deferredInstallPrompt) {
      toast("当前浏览器没有提供一键安装入口，可以试试浏览器菜单里的“添加到主屏幕”。");
      return;
    }

    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      renderSettings();
    });
  }

  function requestNotificationPermission() {
    if (typeof Notification === "undefined") {
      toast("当前浏览器不支持通知。");
      return;
    }

    Notification.requestPermission().then(() => {
      syncReminderStatusText();
      renderSettings();
      toast(Notification.permission === "granted" ? "通知权限已开启" : "通知权限暂未开启");
    });
  }

  function sendTestReminder() {
    pushReminderNotification(
      "心绪记录测试提醒",
      "这是一次测试提醒。如果你现在有感受，欢迎顺手记录一条。",
      true
    );
  }

  function syncReminderStatusText() {
    if (!state.settings.reminders) {
      state.settings.reminders = deepCopy(DEFAULT_REMINDERS);
    }
  }

  function getReminderStatusText() {
    const enabled = Boolean(state.settings.reminders && state.settings.reminders.enabled);
    const permission = typeof Notification === "undefined" ? "不支持" : Notification.permission;

    return enabled
      ? `提醒已开启，当前通知权限：${permission}。`
      : "提醒已关闭。开启后会按当前时段检查今天有没有漏记。";
  }

  function startReminderMonitor() {
    if (reminderTimer) {
      clearInterval(reminderTimer);
      reminderTimer = null;
    }

    if (!(state.settings.reminders && state.settings.reminders.enabled)) return;

    checkReminderNow();
    reminderTimer = setInterval(checkReminderNow, 60000);
  }

  function checkReminderNow() {
    const reminders = state.settings.reminders;
    if (!(reminders && reminders.enabled)) return;

    const now = new Date();
    const slot = getCurrentSlot(now);
    const triggerTime = (reminders.times && reminders.times[slot.id]) || DEFAULT_REMINDERS.times[slot.id];
    if (!triggerTime) return;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const triggerMinutes = toMinutes(triggerTime);
    if (currentMinutes < triggerMinutes) return;

    const dayKey = toDayKey(now);
    const alreadyRecorded = state.records.some((record) => record.day === dayKey && record.slotId === slot.id);
    if (alreadyRecorded) return;

    const notifyKey = `${dayKey}:${slot.id}`;
    if (reminders.lastNotified && reminders.lastNotified[notifyKey]) return;

    reminders.lastNotified[notifyKey] = now.toISOString();
    saveState();

    const message = `现在是${slot.name}，你还没有记录。可以花 20 秒快速记一下。`;
    pushReminderNotification("心绪记录提醒", message, true);
  }

  function pushReminderNotification(title, body, forceToast) {
    if (forceToast) toast(body);

    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) {
          registration.showNotification(title, {
            body,
            icon: "./assets/icons/icon-192.png",
            badge: "./assets/icons/icon-192.png"
          });
          return;
        }

        new Notification(title, { body, icon: "./assets/icons/icon-192.png" });
      });
      return;
    }

    new Notification(title, { body, icon: "./assets/icons/icon-192.png" });
  }

  function filterRecordsByRange(range) {
    if (range === "all") {
      return [...state.records];
    }

    const days = range === "30d" ? 30 : 7;
    const today = new Date();
    const from = new Date(today);
    from.setHours(0, 0, 0, 0);
    from.setDate(today.getDate() - (days - 1));
    const fromKey = toDayKey(from);
    const todayKey = toDayKey(today);
    return state.records.filter((record) => record.day >= fromKey && record.day <= todayKey);
  }

  function trendDays(range, records) {
    if (range === "all") {
      const unique = [...new Set(records.map((record) => record.day))].sort();
      return unique.slice(-10);
    }

    const count = range === "30d" ? 10 : 7;
    const list = [];
    const now = new Date();

    for (let index = count - 1; index >= 0; index -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - index);
      list.push(toDayKey(date));
    }

    return list;
  }

  function collectProjectTagEntries(records, projectId) {
    return records.flatMap((record) => {
      const entry = record.projectEntries.find((item) => item.projectId === projectId);
      return entry ? entry.entries || [] : [];
    });
  }

  function countProjectUsage(records) {
    return records.reduce((acc, record) => {
      record.projectEntries.forEach((entry) => {
        acc[entry.projectId] = (acc[entry.projectId] || 0) + 1;
      });
      return acc;
    }, {});
  }

  function getRecentOtherRecords(limit) {
    return [...state.records]
      .filter((record) => record.source === "other")
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, limit);
  }

  function getTagSuggestions(projectId, query, selectedIds, limit) {
    const project = getProject(projectId);
    if (!project) return [];

    const usage = getUsageMaps();
    const normalizedQuery = normalizeLabel(query);

    return (project.tags || [])
      .filter((tag) => !(selectedIds || []).includes(tag.id))
      .map((tag) => ({
        ...tag,
        usage: usage.tagById.get(tag.id) || usage.tagByLabel.get(normalizeLabel(tag.label)) || 0
      }))
      .filter((tag) => !normalizedQuery || normalizeLabel(tag.label).includes(normalizedQuery))
      .sort((a, b) => {
        const scoreA = matchScore(a.label, normalizedQuery);
        const scoreB = matchScore(b.label, normalizedQuery);
        if (scoreA !== scoreB) return scoreB - scoreA;
        if (a.usage !== b.usage) return b.usage - a.usage;
        return a.label.localeCompare(b.label, "zh-CN");
      })
      .slice(0, limit);
  }

  function getProjectSuggestions(query) {
    const normalizedQuery = normalizeLabel(query);
    const usage = getUsageMaps();

    return getCustomProjects()
      .filter((project) => !normalizedQuery || normalizeLabel(project.name).includes(normalizedQuery))
      .sort((a, b) => {
        const scoreA = matchScore(a.name, normalizedQuery);
        const scoreB = matchScore(b.name, normalizedQuery);
        if (scoreA !== scoreB) return scoreB - scoreA;
        const usageA = usage.projectById.get(a.id) || 0;
        const usageB = usage.projectById.get(b.id) || 0;
        if (usageA !== usageB) return usageB - usageA;
        return a.name.localeCompare(b.name, "zh-CN");
      })
      .slice(0, 8);
  }

  function matchScore(label, normalizedQuery) {
    if (!normalizedQuery) return 1;
    const normalizedLabel = normalizeLabel(label);
    if (normalizedLabel === normalizedQuery) return 4;
    if (normalizedLabel.startsWith(normalizedQuery)) return 3;
    if (normalizedLabel.includes(normalizedQuery)) return 2;
    return 0;
  }

  function getUsageMaps() {
    const tagById = new Map();
    const tagByLabel = new Map();
    const projectById = new Map();

    state.records.forEach((record) => {
      (record.projectEntries || []).forEach((entry) => {
        projectById.set(entry.projectId, (projectById.get(entry.projectId) || 0) + 1);
        (entry.entries || []).forEach((item) => {
          if (item.tagId) tagById.set(item.tagId, (tagById.get(item.tagId) || 0) + 1);
          if (item.label) {
            const key = normalizeLabel(item.label);
            tagByLabel.set(key, (tagByLabel.get(key) || 0) + 1);
          }
        });
      });
    });

    return { tagById, tagByLabel, projectById };
  }

  function createBuiltinProjects() {
    return [
      {
        id: "emotion",
        name: "情绪",
        type: "emotion",
        builtin: true,
        color: "#d87354",
        tags: flattenEmotionTags(DATA.emotionCategories)
      },
      {
        id: "somatic",
        name: "躯体化症状",
        type: "somatic",
        builtin: true,
        color: "#5a84c6",
        tags: DATA.somaticTags.map((tag) => ({
          id: tag.id,
          label: tag.label,
          color: safeColor(tag.color, "#5a84c6"),
          builtin: true,
          categoryId: null,
          categoryName: null,
          groupLabel: null
        }))
      }
    ];
  }

  function flattenEmotionTags(categories) {
    const result = [];

    categories.forEach((category) => {
      category.groups.forEach((group) => {
        group.tags.forEach((tagLabel) => {
          result.push({
            id: `${category.id}-${tagLabel}`,
            label: tagLabel,
            color: safeColor(category.color, "#d87354"),
            categoryId: category.id,
            categoryName: category.label,
            groupLabel: group.label,
            builtin: true
          });
        });
      });
    });

    return result;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(DATA.storageKey);
      if (!raw) return initialState();
      return normalizeState(JSON.parse(raw));
    } catch (_) {
      return initialState();
    }
  }

  function initialState() {
    return {
      version: 2,
      slotTemplates: [deepCopy(DATA.slotTemplate)],
      settings: {
        activeSlotTemplateId: DATA.slotTemplate.id,
        reminders: deepCopy(DEFAULT_REMINDERS)
      },
      projects: deepCopy(BUILTIN_PROJECTS),
      records: []
    };
  }

  function normalizeState(parsed) {
    const incomingProjects = Array.isArray(parsed && parsed.projects) ? parsed.projects : [];
    const incomingSettings = (parsed && parsed.settings) || {};
    const incomingReminders = incomingSettings.reminders || {};
    const slotTemplates = Array.isArray(parsed && parsed.slotTemplates) && parsed.slotTemplates.length
      ? deepCopy(parsed.slotTemplates)
      : [deepCopy(DATA.slotTemplate)];
    const activeSlotTemplateId = incomingSettings.activeSlotTemplateId || DATA.slotTemplate.id;
    const mergedProjects = [
      ...BUILTIN_PROJECTS.map((builtin) => mergeBuiltinProject(builtin, incomingProjects.find((project) => project.id === builtin.id))),
      ...incomingProjects
        .filter((project) => !isBuiltinProject(project.id))
        .map(sanitizeCustomProject)
    ];

    return {
      version: 2,
      slotTemplates,
      settings: {
        activeSlotTemplateId,
        reminders: {
          enabled: Boolean(incomingReminders.enabled),
          times: {
            ...DEFAULT_REMINDERS.times,
            ...(incomingReminders.times || {})
          },
          lastNotified: incomingReminders.lastNotified || {}
        }
      },
      projects: mergedProjects,
      records: sanitizeRecords(
        Array.isArray(parsed && parsed.records) ? parsed.records : [],
        mergedProjects,
        slotTemplates,
        activeSlotTemplateId
      )
    };
  }

  function sanitizeCustomProject(project) {
    return {
      id: project.id || createId("project"),
      name: String(project.name || "未命名项目").trim(),
      type: "custom",
      builtin: false,
      color: safeColor(project.color, pickProjectColor(project.name || "custom")),
      tags: Array.isArray(project.tags)
        ? project.tags.map((tag) => sanitizeTag(tag, project.color))
        : []
    };
  }

  function sanitizeTag(tag, fallbackColor) {
    return {
      id: tag.id || createId("tag"),
      label: String(tag.label || "未命名标签").trim(),
      color: safeColor(tag.color, fallbackColor || "#4f8f8b"),
      builtin: Boolean(tag.builtin),
      categoryId: tag.categoryId || null,
      categoryName: tag.categoryName || null,
      groupLabel: tag.groupLabel || null
    };
  }

  function sanitizeRecords(records, projectList, slotTemplates, activeSlotTemplateId) {
    return records.filter(Boolean).map((record) => {
      const createdAt = record.createdAt || new Date().toISOString();
      const createdDate = new Date(createdAt);
      const slotId = record.slotId || getCurrentSlotFromTemplates(slotTemplates, activeSlotTemplateId, createdDate).id;
      const slotName = record.slotName || getSlotNameFromTemplates(slotTemplates, activeSlotTemplateId, slotId);

      return {
        id: record.id || createId("record"),
        createdAt,
        day: record.day || toDayKey(createdDate),
        slotId,
        slotName,
        source: record.source || "quick",
        note: String(record.note || ""),
        eventText: String(record.eventText || ""),
        childhoodEcho: String(record.childhoodEcho || ""),
        bodyAreas: Array.isArray(record.bodyAreas) ? [...new Set(record.bodyAreas)] : [],
        projectEntries: Array.isArray(record.projectEntries)
          ? record.projectEntries.map((entry) => ({
            projectId: entry.projectId,
            projectName: entry.projectName || (getProjectFromList(projectList, entry.projectId) && getProjectFromList(projectList, entry.projectId).name) || "未命名项目",
            projectColor: safeColor(entry.projectColor, (getProjectFromList(projectList, entry.projectId) && getProjectFromList(projectList, entry.projectId).color) || "#4f8f8b"),
            note: String(entry.note || ""),
            entries: Array.isArray(entry.entries)
              ? entry.entries.map((item) => ({
                tagId: item.tagId || "",
                label: String(item.label || ""),
                color: safeColor(item.color, (getProjectFromList(projectList, entry.projectId) && getProjectFromList(projectList, entry.projectId).color) || "#4f8f8b"),
                categoryId: item.categoryId || null,
                categoryName: item.categoryName || null,
                groupLabel: item.groupLabel || null,
                intensity: item.intensity ? Number(item.intensity) : null
              }))
              : []
          }))
          : []
      };
    });
  }

  function getProjectFromList(projects, projectId) {
    return (projects || []).find((project) => project.id === projectId);
  }

  function getCurrentSlotFromTemplates(slotTemplates, activeSlotTemplateId, date) {
    const template = (slotTemplates || []).find((item) => item.id === activeSlotTemplateId) || DATA.slotTemplate;
    const minute = date.getHours() * 60 + date.getMinutes();

    return template.slots.find((slot) => {
      const start = toMinutes(slot.start);
      const end = toMinutes(slot.end);
      if (start <= end) {
        return minute >= start && minute <= end;
      }
      return minute >= start || minute <= end;
    }) || template.slots[0];
  }

  function getSlotNameFromTemplates(slotTemplates, activeSlotTemplateId, slotId) {
    const template = (slotTemplates || []).find((item) => item.id === activeSlotTemplateId) || DATA.slotTemplate;
    const slot = template.slots.find((item) => item.id === slotId);
    return slot ? slot.name : slotId;
  }

  function mergeBuiltinProject(builtin, stored) {
    const builtinTags = deepCopy(builtin.tags || []);
    if (!stored) {
      return {
        ...deepCopy(builtin),
        tags: builtinTags
      };
    }

    const storedTags = Array.isArray(stored.tags) ? stored.tags.map((tag) => sanitizeTag(tag, builtin.color)) : [];
    const mergedTags = [];

    builtinTags.forEach((tag) => {
      const match = storedTags.find((item) => item.id === tag.id || normalizeLabel(item.label) === normalizeLabel(tag.label));
      mergedTags.push({
        ...tag,
        color: match ? safeColor(match.color, tag.color) : tag.color,
        builtin: true
      });
    });

    storedTags.forEach((tag) => {
      const exists = mergedTags.some((item) => item.id === tag.id || normalizeLabel(item.label) === normalizeLabel(tag.label));
      if (!exists) {
        mergedTags.push({
          ...tag,
          builtin: Boolean(tag.builtin)
        });
      }
    });

    return {
      ...deepCopy(builtin),
      color: safeColor(stored.color, builtin.color),
      tags: mergedTags
    };
  }

  function overwriteState(next) {
    state.version = next.version;
    state.slotTemplates = next.slotTemplates;
    state.settings = next.settings;
    state.projects = next.projects;
    state.records = next.records;
    saveState();
  }

  function saveState() {
    localStorage.setItem(DATA.storageKey, JSON.stringify(state));
  }

  function createInitialUi() {
    return {
      activeScreen: "home",
      statsRange: "7d",
      quick: {
        emotionQuery: "",
        somaticQuery: "",
        selectedEmotionIds: [],
        selectedSomaticIds: [],
        intensity: 3,
        note: ""
      },
      other: {
        projectQuery: "",
        tagQuery: "",
        selectedProjectId: "",
        selectedTagId: "",
        note: ""
      },
      guided: newGuidedDraft(),
      settings: {
        page: "root",
        libraryTab: "emotion",
        projectId: ""
      },
      export: {
        from: "",
        to: "",
        selectedProjectIds: state.projects.map((project) => project.id),
        preview: ""
      },
      toastTimer: null
    };
  }

  function newGuidedDraft() {
    return {
      step: 0,
      bodyAreas: [],
      somaticQuery: "",
      emotionQuery: "",
      selectedSomaticIds: [],
      selectedEmotionIds: [],
      intensity: 3,
      eventText: "",
      childhoodEcho: ""
    };
  }

  function seedExportDefaults() {
    if (!ui.export.from || !ui.export.to) {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      ui.export.from = toDayKey(from);
      ui.export.to = toDayKey(today);
    }
  }

  function ensureExportSelectionValid() {
    const allIds = state.projects.map((project) => project.id);
    ui.export.selectedProjectIds = ui.export.selectedProjectIds.filter((id) => allIds.includes(id));
    if (!ui.export.selectedProjectIds.length) {
      ui.export.selectedProjectIds = [...allIds];
    }
  }

  function createCustomProject(name, color) {
    const existing = findCustomProjectByName(name);
    if (existing) return existing;

    const project = {
      id: createId("project"),
      name: String(name).trim(),
      type: "custom",
      builtin: false,
      color: safeColor(color, pickProjectColor(name)),
      tags: []
    };

    state.projects.push(project);
    if (!ui.export.selectedProjectIds.includes(project.id)) {
      ui.export.selectedProjectIds.push(project.id);
    }
    saveState();
    return project;
  }

  function ensureTag(projectId, label, color, extras) {
    const project = getProject(projectId);
    if (!project) return null;

    const existing = findTagByLabel(projectId, label);
    if (existing) return existing;

    const tag = {
      id: createId(`${projectId}-tag`),
      label: String(label).trim(),
      color: safeColor(color, project.color),
      builtin: false,
      categoryId: extras && extras.categoryId || null,
      categoryName: extras && extras.categoryName || null,
      groupLabel: extras && extras.groupLabel || null
    };

    project.tags.push(tag);
    saveState();
    return tag;
  }

  function toTagEntry(project, tagId, intensity) {
    const tag = getTag(project.id, tagId);
    if (!tag) return null;

    return {
      tagId: tag.id,
      label: tag.label,
      color: safeColor(tag.color, project.color),
      categoryId: tag.categoryId || null,
      categoryName: tag.categoryName || null,
      groupLabel: tag.groupLabel || null,
      intensity: project.type === "emotion" ? Number(intensity || 3) : null
    };
  }

  function createRecordBase(source) {
    const now = new Date();
    const slot = getCurrentSlot(now);

    return {
      id: createId("record"),
      createdAt: now.toISOString(),
      day: toDayKey(now),
      slotId: slot.id,
      slotName: slot.name,
      source,
      note: "",
      eventText: "",
      childhoodEcho: "",
      bodyAreas: [],
      projectEntries: []
    };
  }

  function getProject(projectId) {
    return state.projects.find((project) => project.id === projectId);
  }

  function getCustomProjects() {
    return state.projects.filter((project) => !isBuiltinProject(project.id));
  }

  function getTag(projectId, tagId) {
    const project = getProject(projectId);
    return project ? (project.tags || []).find((tag) => tag.id === tagId) : null;
  }

  function findTagByLabel(projectId, label) {
    const project = getProject(projectId);
    if (!project) return null;
    const normalized = normalizeLabel(label);
    return (project.tags || []).find((tag) => normalizeLabel(tag.label) === normalized) || null;
  }

  function findCustomProjectByName(name) {
    const normalized = normalizeLabel(name);
    return getCustomProjects().find((project) => normalizeLabel(project.name) === normalized) || null;
  }

  function pruneMissingSelectedIds(projectId, selectedIds) {
    for (let index = selectedIds.length - 1; index >= 0; index -= 1) {
      if (!getTag(projectId, selectedIds[index])) {
        selectedIds.splice(index, 1);
      }
    }
  }

  function isBuiltinProject(projectId) {
    return BUILTIN_PROJECTS.some((project) => project.id === projectId);
  }

  function getCurrentSlot(date) {
    const template = state.slotTemplates.find((item) => item.id === state.settings.activeSlotTemplateId) || DATA.slotTemplate;
    const minute = date.getHours() * 60 + date.getMinutes();

    return template.slots.find((slot) => {
      const start = toMinutes(slot.start);
      const end = toMinutes(slot.end);
      if (start <= end) {
        return minute >= start && minute <= end;
      }
      return minute >= start || minute <= end;
    }) || template.slots[0];
  }

  function getSlotName(slotId) {
    const template = state.slotTemplates.find((item) => item.id === state.settings.activeSlotTemplateId) || DATA.slotTemplate;
    const slot = template.slots.find((item) => item.id === slotId);
    return slot ? slot.name : slotId;
  }

  function sourceLabel(source) {
    if (source === "guided") return "引导记录";
    if (source === "other") return "其他项目记录";
    return "快速记录";
  }

  function formatRecordMoment(timestamp) {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatMiniDay(dayKey) {
    const parts = dayKey.split("-");
    return `${Number(parts[1])}/${Number(parts[2])}`;
  }

  function pickProjectColor(seed) {
    const value = normalizeLabel(seed);
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(index);
      hash |= 0;
    }
    return PROJECT_COLOR_PALETTE[Math.abs(hash) % PROJECT_COLOR_PALETTE.length];
  }

  function toggleTagSelection(list, tagId) {
    const index = list.indexOf(tagId);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(tagId);
    }
  }

  function toggleInArray(list, value) {
    const index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
    else list.push(value);
  }

  function removeFromArray(list, value) {
    const index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
  }

  function toDayKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function toMinutes(time) {
    const [hours, minutes] = String(time || "00:00").split(":").map(Number);
    return (hours * 60) + minutes;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeLabel(value) {
    return String(value || "").trim().toLowerCase();
  }

  function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeColor(value, fallback) {
    const raw = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : (fallback || "#4f8f8b");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toDataAttr(camelCase) {
    return camelCase.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
  }

  function downloadBlob(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function toast(message) {
    clearTimeout(ui.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    ui.toastTimer = setTimeout(() => {
      els.toast.classList.remove("visible");
    }, 2200);
  }
})();
