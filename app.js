(function () {
  const DATA = window.APP_DATA;
  const EMOTION_TAGS = flattenEmotionTags(DATA.emotionCategories);
  if (!EMOTION_TAGS.some((tag) => tag.label === "伤心")) {
    EMOTION_TAGS.push({
      id: "sadness-伤心",
      label: "伤心",
      color: "#5585c0",
      categoryId: "sadness",
      categoryName: "悲伤",
      groupLabel: "失落"
    });
  }
  const BUILTIN_PROJECTS = [
    {
      id: "emotion",
      name: "情绪",
      type: "emotion",
      color: "#d96d4f",
      description: "用情绪之轮更细致地命名感受",
      quickTagIds: DATA.quickEmotionIds,
      tags: deepCopy(EMOTION_TAGS)
    },
    {
      id: "somatic",
      name: "躯体化症状",
      type: "somatic",
      color: "#4b8fbb",
      description: "把身体感觉记录下来，方便和情绪联动观察",
      tags: DATA.somaticTags
    }
  ];
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
  const els = {};
  const state = loadState();
  let deferredInstallPrompt = null;
  let reminderTimer = null;
  const ui = {
    activeScreen: "home",
    quickSelections: {},
    quickNote: "",
    quickIntensity: 3,
    guidedStep: 0,
    guided: newGuidedDraft(),
    statsRange: "7d",
    exportSelectedProjects: state.projects.map((p) => p.id),
    toastTimer: null
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheEls();
    seedExportDates();
    bindEvents();
    bootstrapPwa();
    syncReminderControls();
    startReminderMonitor();
    renderApp();
  }

  function cacheEls() {
    [
      "today-label", "current-slot-label", "weekly-count-label", "quick-projects", "quick-intensity",
      "quick-intensity-label", "quick-note", "quick-emotion-input", "quick-emotion-color", "quick-add-emotion-tag",
      "quick-emotion-suggestions", "quick-somatic-input", "quick-somatic-color", "quick-add-somatic-tag",
      "quick-somatic-suggestions", "recent-records", "custom-project-form", "custom-project-name",
      "custom-project-tags", "custom-project-color", "custom-project-list", "guided-slot-label", "guided-stepper",
      "guided-step-content", "guided-reset-btn", "guided-prev-btn", "guided-next-btn", "guided-save-btn", "stats-summary",
      "emotion-donut", "donut-center-label", "emotion-legend", "intensity-trend", "project-frequency",
      "somatic-frequency", "export-from", "export-to", "export-project-filters", "export-preview",
      "install-app-btn", "refresh-app-btn", "install-status", "backup-export-btn", "backup-import-btn",
      "backup-import-file", "backup-status", "reminder-enabled", "reminder-time-late-night",
      "reminder-time-morning", "reminder-time-afternoon", "reminder-time-evening",
      "notification-permission-btn", "reminder-test-btn", "reminder-status", "toast"
    ].forEach((id) => {
      els[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
    });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(DATA.storageKey);
      if (!raw) return initialState();
      const parsed = JSON.parse(raw);
      const parsedProjects = Array.isArray(parsed.projects) ? parsed.projects : [];
      const builtins = BUILTIN_PROJECTS.map((builtin) => mergeBuiltinProject(builtin, parsedProjects.find((item) => item.id === builtin.id)));
      const custom = parsedProjects.filter((project) => !isBuiltinProject(project.id));
      const parsedSettings = parsed.settings || {};
      const parsedReminders = parsedSettings.reminders || {};
      return {
        version: 1,
        slotTemplates: Array.isArray(parsed.slotTemplates) && parsed.slotTemplates.length ? parsed.slotTemplates : [DATA.slotTemplate],
        settings: {
          activeSlotTemplateId: DATA.slotTemplate.id,
          ...parsedSettings,
          reminders: {
            enabled: Boolean(parsedReminders.enabled),
            times: {
              ...DEFAULT_REMINDERS.times,
              ...(parsedReminders.times || {})
            },
            lastNotified: parsedReminders.lastNotified || {}
          }
        },
        projects: [...builtins, ...custom],
        records: Array.isArray(parsed.records) ? parsed.records : []
      };
    } catch (_) {
      return initialState();
    }
  }

  function initialState() {
    return {
      version: 1,
      slotTemplates: [DATA.slotTemplate],
      settings: { activeSlotTemplateId: DATA.slotTemplate.id, reminders: deepCopy(DEFAULT_REMINDERS) },
      projects: deepCopy(BUILTIN_PROJECTS),
      records: []
    };
  }

  function saveState() {
    localStorage.setItem(DATA.storageKey, JSON.stringify(state));
  }

  function bindEvents() {
    document.querySelectorAll(".nav-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.activeScreen = btn.dataset.screen;
        renderApp();
      });
    });

    els.quickProjects.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-project-id][data-tag-id]");
      if (!chip) return;
      toggleInArray(getQuickArray(chip.dataset.projectId), chip.dataset.tagId);
      renderQuickProjects();
      renderQuickSuggestions();
    });

    els.quickIntensity.addEventListener("input", (event) => {
      ui.quickIntensity = Number(event.target.value);
      els.quickIntensityLabel.textContent = DATA.intensityLabels[ui.quickIntensity];
    });

    els.quickNote.addEventListener("input", (event) => {
      ui.quickNote = event.target.value;
    });

    document.getElementById("save-quick-btn").addEventListener("click", saveQuickRecord);
    els.customProjectForm.addEventListener("submit", createCustomProject);
    els.customProjectList.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-delete-project-id]");
      if (!btn) return;
      deleteCustomProject(btn.dataset.deleteProjectId);
    });

    if (els.guidedResetBtn) {
      els.guidedResetBtn.addEventListener("click", () => {
        ui.guided = newGuidedDraft();
        ui.guidedStep = 0;
        renderGuided();
        toast("已清空本次引导输入");
      });
    }

    els.guidedPrevBtn.addEventListener("click", () => {
      ui.guidedStep = Math.max(0, ui.guidedStep - 1);
      renderGuided();
    });
    els.guidedNextBtn.addEventListener("click", () => {
      if (!validateGuidedStep(ui.guidedStep)) return;
      ui.guidedStep = Math.min(DATA.stepTitles.length - 1, ui.guidedStep + 1);
      renderGuided();
    });
    els.guidedSaveBtn.addEventListener("click", saveGuidedRecord);

    els.guidedStepContent.addEventListener("click", onGuidedClick);
    els.guidedStepContent.addEventListener("input", onGuidedInput);
    els.guidedStepContent.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (event.target.id === "guided-emotion-input") {
        event.preventDefault();
        addGuidedCustomTag("emotion");
      }
      if (event.target.id === "guided-somatic-input") {
        event.preventDefault();
        addGuidedCustomTag("somatic");
      }
    });

    if (els.quickEmotionInput) {
      els.quickEmotionInput.addEventListener("input", renderQuickSuggestions);
      els.quickEmotionInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addQuickCustomTag("emotion");
        }
      });
    }
    if (els.quickSomaticInput) {
      els.quickSomaticInput.addEventListener("input", renderQuickSuggestions);
      els.quickSomaticInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addQuickCustomTag("somatic");
        }
      });
    }
    if (els.quickAddEmotionTag) {
      els.quickAddEmotionTag.addEventListener("click", () => addQuickCustomTag("emotion"));
    }
    if (els.quickAddSomaticTag) {
      els.quickAddSomaticTag.addEventListener("click", () => addQuickCustomTag("somatic"));
    }
    if (els.quickEmotionSuggestions) {
      els.quickEmotionSuggestions.addEventListener("click", onQuickSuggestionClick);
    }
    if (els.quickSomaticSuggestions) {
      els.quickSomaticSuggestions.addEventListener("click", onQuickSuggestionClick);
    }

    document.getElementById("stats-range-selector").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-range]");
      if (!btn) return;
      ui.statsRange = btn.dataset.range;
      document.querySelectorAll(".segmented-button").forEach((item) => item.classList.toggle("active", item.dataset.range === ui.statsRange));
      renderStats();
    });

    document.getElementById("generate-export-btn").addEventListener("click", generateExportText);
    document.getElementById("copy-export-btn").addEventListener("click", copyExportText);
    document.getElementById("download-export-btn").addEventListener("click", downloadExportText);
    els.exportProjectFilters.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-export-project-id]");
      if (!btn) return;
      toggleInArray(ui.exportSelectedProjects, btn.dataset.exportProjectId);
      renderExportFilters();
    });

    if (els.installAppBtn) {
      els.installAppBtn.addEventListener("click", promptInstallApp);
    }
    if (els.refreshAppBtn) {
      els.refreshAppBtn.addEventListener("click", () => {
        if (!navigator.serviceWorker) {
          toast("当前浏览器不支持离线缓存");
          return;
        }
        navigator.serviceWorker.getRegistration().then((registration) => {
          if (registration) {
            registration.update();
            toast("已触发缓存刷新");
          } else {
            toast("还没有注册离线缓存");
          }
        });
      });
    }

    if (els.backupExportBtn) {
      els.backupExportBtn.addEventListener("click", exportBackupJson);
    }
    if (els.backupImportBtn) {
      els.backupImportBtn.addEventListener("click", () => {
        els.backupImportFile.click();
      });
    }
    if (els.backupImportFile) {
      els.backupImportFile.addEventListener("change", importBackupJson);
    }

    if (els.reminderEnabled) {
      els.reminderEnabled.addEventListener("change", (event) => {
        state.settings.reminders.enabled = Boolean(event.target.checked);
        saveState();
        syncReminderStatusText();
        startReminderMonitor();
      });
    }

    [
      ["reminderTimeLateNight", "late-night"],
      ["reminderTimeMorning", "morning"],
      ["reminderTimeAfternoon", "afternoon"],
      ["reminderTimeEvening", "evening"]
    ].forEach(([id, slotId]) => {
      if (!els[id]) return;
      els[id].addEventListener("change", (event) => {
        state.settings.reminders.times[slotId] = event.target.value;
        saveState();
      });
    });

    if (els.notificationPermissionBtn) {
      els.notificationPermissionBtn.addEventListener("click", requestNotificationPermission);
    }
    if (els.reminderTestBtn) {
      els.reminderTestBtn.addEventListener("click", sendTestReminder);
    }
  }

  function renderApp() {
    if (!document.getElementById(`screen-${ui.activeScreen}`)) {
      ui.activeScreen = "home";
    }
    renderHeader();
    renderNav();
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.toggle("active", screen.id === `screen-${ui.activeScreen}`);
    });
    renderHome();
    renderGuided();
    if (ui.activeScreen === "stats") renderStats();
    if (ui.activeScreen === "recent") renderRecentRecords(50);
    if (ui.activeScreen === "settings") renderSettings();
  }

  function renderHeader() {
    const now = new Date();
    const slot = getCurrentSlot(now);
    els.todayLabel.textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日`;
    els.currentSlotLabel.textContent = `${slot.name} · ${slot.start}-${slot.end}`;
    els.guidedSlotLabel.textContent = slot.name;
    els.weeklyCountLabel.textContent = `${filterByRange("7d").length} 次`;
    els.quickIntensity.value = String(ui.quickIntensity);
    els.quickIntensityLabel.textContent = DATA.intensityLabels[ui.quickIntensity];
  }

  function renderNav() {
    document.querySelectorAll(".nav-button").forEach((btn) => btn.classList.toggle("active", btn.dataset.screen === ui.activeScreen));
  }

  function renderHome() {
    renderQuickProjects();
    renderQuickSuggestions();
    renderCustomProjects();
  }

  function renderQuickProjects() {
    els.quickProjects.innerHTML = state.projects.map((project) => {
      const selected = getQuickArray(project.id);
      const pool = project.tags || [];
      let tags = pool;
      if (project.type === "emotion") {
        const quickIds = Array.isArray(project.quickTagIds) && project.quickTagIds.length
          ? project.quickTagIds
          : pool.map((item) => item.id).slice(0, 18);
        tags = quickIds.map((id) => pool.find((item) => item.id === id)).filter(Boolean);
      }
      selected.forEach((id) => {
        const hit = pool.find((item) => item.id === id);
        if (hit && !tags.some((item) => item.id === id)) {
          tags.push(hit);
        }
      });
      return `
        <article class="project-card">
          <header>
            <div><h4>${project.name}</h4><p>${project.description || `${tags.length} 个标签`}</p></div>
            <span class="project-meta">${selected.length ? `已选 ${selected.length}` : "可多选"}</span>
          </header>
          <div class="chip-wrap">
            ${tags.map((tag) => {
              const on = selected.includes(tag.id);
              const color = tag.color || project.color;
              return `<button type="button" class="chip ${on ? "selected" : ""}" data-project-id="${project.id}" data-tag-id="${tag.id}" style="${on ? `background:${color};` : ""}">${tag.label}</button>`;
            }).join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderQuickSuggestions() {
    renderSuggestionList({
      projectId: "emotion",
      inputEl: els.quickEmotionInput,
      targetEl: els.quickEmotionSuggestions,
      selectedIds: getQuickArray("emotion"),
      actionPrefix: "quick-suggest"
    });
    renderSuggestionList({
      projectId: "somatic",
      inputEl: els.quickSomaticInput,
      targetEl: els.quickSomaticSuggestions,
      selectedIds: getQuickArray("somatic"),
      actionPrefix: "quick-suggest"
    });
  }

  function onQuickSuggestionClick(event) {
    const button = event.target.closest("[data-action='quick-suggest']");
    if (!button) return;
    const projectId = button.dataset.projectId;
    const tagId = button.dataset.tagId;
    toggleInArray(getQuickArray(projectId), tagId);
    renderQuickProjects();
    renderQuickSuggestions();
  }

  function addQuickCustomTag(projectId) {
    const isEmotion = projectId === "emotion";
    const inputEl = isEmotion ? els.quickEmotionInput : els.quickSomaticInput;
    const colorEl = isEmotion ? els.quickEmotionColor : els.quickSomaticColor;
    if (!inputEl || !colorEl) return;
    const label = inputEl.value.trim();
    if (!label) {
      toast("先输入标签文字");
      return;
    }
    const tag = ensureProjectTag(projectId, label, colorEl.value, isEmotion ? "自定义情绪" : null);
    const selected = getQuickArray(projectId);
    if (!selected.includes(tag.id)) selected.push(tag.id);
    inputEl.value = "";
    saveState();
    renderQuickProjects();
    renderQuickSuggestions();
    toast(`已新增标签：${label}`);
  }

  function renderCustomProjects() {
    const custom = state.projects.filter((p) => !isBuiltinProject(p.id));
    if (!custom.length) {
      els.customProjectList.innerHTML = `<div class="record-card"><p>现在只有内置的“情绪”和“躯体化症状”，你可以添加饭量、学习、社交等项目。</p></div>`;
      return;
    }
    els.customProjectList.innerHTML = custom.map((project) => `
      <div class="custom-project-item">
        <div><h4>${project.name}</h4><p>${(project.tags || []).map((t) => t.label).join("、")}</p></div>
        <button type="button" class="delete-button" data-delete-project-id="${project.id}">删除</button>
      </div>
    `).join("");
  }

  function renderRecentRecords(limit = 8) {
    if (!state.records.length) {
      els.recentRecords.innerHTML = `<div class="record-card"><p>还没有记录。可以先用首页快速记录，或者去引导模式慢慢梳理一次。</p></div>`;
      return;
    }
    const recent = [...state.records].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, limit);
    els.recentRecords.innerHTML = recent.map((record) => {
      const tags = record.projectEntries.flatMap((entry) => entry.entries).slice(0, 8);
      const d = new Date(record.createdAt);
      const title = `${record.slotName} · ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const desc = record.source === "guided" ? "引导记录" : "快速记录";
      const text = escapeHtml(record.eventText || record.note || "这次记录没有额外备注。");
      return `
        <article class="record-card">
          <div class="record-header">
            <div><h4>${title}</h4><p>${desc} · ${record.projectEntries.map((entry) => entry.projectName).join(" / ")}</p></div>
            <span class="timestamp">${record.day}</span>
          </div>
          <p>${text}</p>
          <div class="record-tags">${tags.map((tag) => `<span class="tag-chip">${tag.label}</span>`).join("")}</div>
        </article>
      `;
    }).join("");
  }

  function renderGuided() {
    els.guidedStepper.innerHTML = DATA.stepTitles.map((title, index) => `<div class="step-pill ${index === ui.guidedStep ? "active" : ""}">${index + 1}. ${title}</div>`).join("");
    els.guidedPrevBtn.disabled = ui.guidedStep === 0;
    els.guidedNextBtn.classList.toggle("hidden", ui.guidedStep === DATA.stepTitles.length - 1);
    els.guidedSaveBtn.classList.toggle("hidden", ui.guidedStep !== DATA.stepTitles.length - 1);
    els.guidedStepContent.innerHTML = guidedStepMarkup(ui.guidedStep);
    renderGuidedSuggestionLists();
  }

  function guidedStepMarkup(step) {
    if (step === 0) {
      const somaticPool = (getProject("somatic")?.tags) || [];
      return `
        <div class="guided-step-card">
          <div><h3>先感受身体哪里最有感觉</h3><p class="body-copy">这里选中的躯体感觉会自动同步到“躯体化症状项目”。</p></div>
          <div><p class="group-title">身体部位</p><div class="chip-wrap">${DATA.bodyAreas.map((name) => chip(name, ui.guided.bodyAreas.includes(name), `data-guided-body-area="${name}"`)).join("")}</div></div>
          <div><p class="group-title">躯体感觉</p><div class="chip-wrap">${somaticPool.map((tag) => chip(tag.label, ui.guided.somaticTagIds.includes(tag.id), `data-guided-somatic-id="${tag.id}"`, tag.color)).join("")}</div></div>
          <div class="custom-tag-editor">
            <p class="group-title">自定义躯体标签</p>
            <div class="tag-entry-row">
              <input id="guided-somatic-input" type="text" placeholder="例如：后背发凉、太阳穴刺痛">
              <input id="guided-somatic-color" type="color" value="#4b8fbb" aria-label="自定义躯体标签颜色">
              <button class="ghost-button" id="guided-add-somatic-tag" type="button">新增并选中</button>
            </div>
            <div id="guided-somatic-suggestions" class="chip-wrap"></div>
          </div>
        </div>
      `;
    }
    if (step === 1) {
      return `
        <div class="guided-step-card">
          <div><h3>用情绪之轮帮自己命名</h3><p class="body-copy">先选最贴近的词就可以，之后随时能改。</p></div>
          ${DATA.emotionCategories.map((category) => {
            const count = ui.guided.emotionTagIds.filter((id) => id.startsWith(`${category.id}-`)).length;
            return `
              <details class="details-card" ${count ? "open" : ""}>
                <summary><span>${category.label}</span><span class="project-meta">${count ? `已选 ${count}` : "展开查看"}</span></summary>
                <div class="details-inner">
                  ${category.groups.map((group) => `
                    <div>
                      <p class="group-title">${group.label}</p>
                      <div class="chip-wrap">${group.tags.map((label) => chip(label, ui.guided.emotionTagIds.includes(`${category.id}-${label}`), `data-guided-emotion-id="${category.id}-${label}"`, category.color)).join("")}</div>
                    </div>
                  `).join("")}
                </div>
              </details>
            `;
          }).join("")}
          <div class="custom-tag-editor">
            <p class="group-title">自定义情绪标签</p>
            <div class="tag-entry-row">
              <input id="guided-emotion-input" type="text" placeholder="例如：空落落、像被抽空、微微轻松">
              <input id="guided-emotion-color" type="color" value="#5f7fd1" aria-label="自定义情绪标签颜色">
              <button class="ghost-button" id="guided-add-emotion-tag" type="button">新增并选中</button>
            </div>
            <div id="guided-emotion-suggestions" class="chip-wrap"></div>
            <p class="project-meta">当前已选：${ui.guided.emotionTagIds.length} 个情绪标签（含自定义）</p>
          </div>
        </div>
      `;
    }
    if (step === 2) {
      return `
        <div class="guided-step-card">
          <div><h3>给这次感受一个强度</h3><p class="body-copy">强度用来帮助你看趋势，不是评判你。</p></div>
          <div class="form-block">
            <label class="field-label" for="guided-intensity">当前强度</label>
            <div class="range-wrap">
              <input id="guided-intensity" type="range" min="1" max="5" step="1" value="${ui.guided.intensity}">
              <div class="range-meta"><span>轻微</span><strong>${DATA.intensityLabels[ui.guided.intensity]}</strong><span>强烈</span></div>
            </div>
          </div>
        </div>
      `;
    }
    if (step === 3) {
      return `
        <div class="guided-step-card">
          <div><h3>发生了什么</h3><p class="body-copy">不用再额外打“刚发生/前几天/回忆被勾起”标签了，直接写经过本身就够了。</p></div>
          <div class="form-block">
            <label class="field-label" for="guided-event">事件记录</label>
            <textarea id="guided-event" rows="7" placeholder="可以写现在发生的事，也可以写延续中的感受和被勾起的回忆。">${escapeHtml(ui.guided.eventText)}</textarea>
          </div>
        </div>
      `;
    }
    return `
      <div class="guided-step-card">
        <div><h3>这个感觉以前也来过吗</h3><p class="body-copy">可选填写：从小到大，有没有某件事让你出现过类似感觉？</p></div>
        <div class="form-block">
          <label class="field-label" for="guided-childhood">旧日回声</label>
          <textarea id="guided-childhood" rows="6" placeholder="可选，不写也可以。">${escapeHtml(ui.guided.childhoodEcho)}</textarea>
        </div>
      </div>
    `;
  }

  function onGuidedClick(event) {
    if (event.target.id === "guided-add-emotion-tag") {
      addGuidedCustomTag("emotion");
      return;
    }
    if (event.target.id === "guided-add-somatic-tag") {
      addGuidedCustomTag("somatic");
      return;
    }
    const suggest = event.target.closest("[data-action='guided-suggest']");
    if (suggest) {
      const projectId = suggest.dataset.projectId;
      const tagId = suggest.dataset.tagId;
      if (projectId === "emotion") {
        toggleInArray(ui.guided.emotionTagIds, tagId);
      }
      if (projectId === "somatic") {
        toggleInArray(ui.guided.somaticTagIds, tagId);
      }
      renderGuided();
      return;
    }
    const area = event.target.closest("[data-guided-body-area]");
    if (area) {
      toggleInArray(ui.guided.bodyAreas, area.dataset.guidedBodyArea);
      renderGuided();
      return;
    }
    const somatic = event.target.closest("[data-guided-somatic-id]");
    if (somatic) {
      toggleInArray(ui.guided.somaticTagIds, somatic.dataset.guidedSomaticId);
      renderGuided();
      return;
    }
    const emotion = event.target.closest("[data-guided-emotion-id]");
    if (emotion) {
      toggleInArray(ui.guided.emotionTagIds, emotion.dataset.guidedEmotionId);
      renderGuided();
    }
  }

  function onGuidedInput(event) {
    if (event.target.id === "guided-intensity") {
      ui.guided.intensity = Number(event.target.value);
      renderGuided();
    }
    if (event.target.id === "guided-emotion-input" || event.target.id === "guided-somatic-input") {
      renderGuidedSuggestionLists();
    }
    if (event.target.id === "guided-event") {
      ui.guided.eventText = event.target.value;
    }
    if (event.target.id === "guided-childhood") {
      ui.guided.childhoodEcho = event.target.value;
    }
  }

  function renderGuidedSuggestionLists() {
    const emotionInput = document.getElementById("guided-emotion-input");
    const emotionWrap = document.getElementById("guided-emotion-suggestions");
    if (emotionInput && emotionWrap) {
      renderSuggestionList({
        projectId: "emotion",
        inputEl: emotionInput,
        targetEl: emotionWrap,
        selectedIds: ui.guided.emotionTagIds,
        actionPrefix: "guided-suggest"
      });
    }

    const somaticInput = document.getElementById("guided-somatic-input");
    const somaticWrap = document.getElementById("guided-somatic-suggestions");
    if (somaticInput && somaticWrap) {
      renderSuggestionList({
        projectId: "somatic",
        inputEl: somaticInput,
        targetEl: somaticWrap,
        selectedIds: ui.guided.somaticTagIds,
        actionPrefix: "guided-suggest"
      });
    }
  }

  function addGuidedCustomTag(projectId) {
    const isEmotion = projectId === "emotion";
    const inputEl = document.getElementById(isEmotion ? "guided-emotion-input" : "guided-somatic-input");
    const colorEl = document.getElementById(isEmotion ? "guided-emotion-color" : "guided-somatic-color");
    if (!inputEl || !colorEl) return;
    const label = inputEl.value.trim();
    if (!label) {
      toast("先输入标签文字");
      return;
    }

    const tag = ensureProjectTag(projectId, label, colorEl.value, isEmotion ? "自定义情绪" : null);
    if (isEmotion) {
      if (!ui.guided.emotionTagIds.includes(tag.id)) ui.guided.emotionTagIds.push(tag.id);
    } else if (!ui.guided.somaticTagIds.includes(tag.id)) {
      ui.guided.somaticTagIds.push(tag.id);
    }
    inputEl.value = "";
    saveState();
    renderGuided();
    toast(`已新增标签：${label}`);
  }

  function validateGuidedStep(step) {
    if (step === 1 && !ui.guided.emotionTagIds.length) {
      toast("至少选一个情绪词再继续");
      return false;
    }
    if (step === 3 && ui.guided.eventText.trim().length < 4) {
      toast("写一点发生了什么，再继续会更有意义");
      return false;
    }
    return true;
  }

  function saveQuickRecord() {
    const entries = state.projects.map((project) => {
      const selected = getQuickArray(project.id);
      const row = selected.map((tagId) => toTagEntry(project, tagId, ui.quickIntensity)).filter(Boolean);
      if (!row.length) return null;
      return { projectId: project.id, projectName: project.name, entries: row };
    }).filter(Boolean);
    if (!entries.length) {
      toast("先选一个标签再保存");
      return;
    }
    const now = new Date();
    const slot = getCurrentSlot(now);
    state.records.unshift({
      id: createId(),
      createdAt: now.toISOString(),
      day: toDayKey(now),
      slotTemplateId: state.settings.activeSlotTemplateId,
      slotId: slot.id,
      slotName: slot.name,
      source: "quick",
      bodyAreas: [],
      eventText: "",
      childhoodEcho: "",
      note: ui.quickNote.trim(),
      projectEntries: entries
    });
    ui.quickSelections = {};
    ui.quickNote = "";
    ui.quickIntensity = 3;
    els.quickNote.value = "";
    if (els.quickEmotionInput) els.quickEmotionInput.value = "";
    if (els.quickSomaticInput) els.quickSomaticInput.value = "";
    saveState();
    renderApp();
    toast("快速记录已保存");
  }

  function saveGuidedRecord() {
    for (let i = 0; i < DATA.stepTitles.length; i += 1) {
      if (!validateGuidedStep(i)) {
        ui.guidedStep = i;
        renderGuided();
        return;
      }
    }
    const now = new Date();
    const slot = getCurrentSlot(now);
    const emotion = ui.guided.emotionTagIds.map((id) => toTagEntry(getProject("emotion"), id, ui.guided.intensity)).filter(Boolean);
    const somatic = ui.guided.somaticTagIds.map((id) => toTagEntry(getProject("somatic"), id)).filter(Boolean);
    const projectEntries = [];
    if (emotion.length) projectEntries.push({ projectId: "emotion", projectName: "情绪", entries: emotion });
    if (somatic.length) projectEntries.push({ projectId: "somatic", projectName: "躯体化症状", entries: somatic });

    state.records.unshift({
      id: createId(),
      createdAt: now.toISOString(),
      day: toDayKey(now),
      slotTemplateId: state.settings.activeSlotTemplateId,
      slotId: slot.id,
      slotName: slot.name,
      source: "guided",
      bodyAreas: [...ui.guided.bodyAreas],
      eventText: ui.guided.eventText.trim(),
      childhoodEcho: ui.guided.childhoodEcho.trim(),
      note: "",
      projectEntries
    });
    ui.guided = newGuidedDraft();
    ui.guidedStep = 0;
    ui.activeScreen = "home";
    saveState();
    renderApp();
    toast("引导记录已保存");
  }

  function createCustomProject(event) {
    event.preventDefault();
    const name = els.customProjectName.value.trim();
    const tags = (els.customProjectTags.value || "")
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const color = els.customProjectColor.value;
    if (!name) {
      toast("先给项目起一个名字");
      return;
    }
    if (!tags.length) {
      toast("请至少写一个标签");
      return;
    }
    const id = `custom-${slug(name)}-${Date.now()}`;
    state.projects.push({
      id,
      name,
      type: "custom",
      color,
      description: "自定义项目",
      tags: tags.map((label) => ({ id: `${id}-${slug(label)}`, label, color }))
    });
    ui.exportSelectedProjects = state.projects.map((project) => project.id);
    els.customProjectForm.reset();
    els.customProjectColor.value = "#3b8f89";
    saveState();
    renderHome();
    renderExportFilters();
    toast(`已创建项目：${name}`);
  }

  function deleteCustomProject(projectId) {
    state.projects = state.projects.filter((project) => project.id !== projectId || isBuiltinProject(project.id));
    delete ui.quickSelections[projectId];
    ui.exportSelectedProjects = ui.exportSelectedProjects.filter((id) => id !== projectId);
    saveState();
    renderHome();
    renderExportFilters();
    toast("自定义项目已删除，旧记录会保留");
  }

  function renderStats() {
    const records = filterByRange(ui.statsRange);
    const emotionEntries = records.flatMap((r) => r.projectEntries).filter((entry) => entry.projectId === "emotion").flatMap((entry) => entry.entries);
    const avg = emotionEntries.length ? (emotionEntries.reduce((s, e) => s + (e.intensity || 0), 0) / emotionEntries.length).toFixed(1) : "--";
    els.statsSummary.innerHTML = `
      <div class="summary-card"><h4>记录次数</h4><p>当前筛选范围内保存的记录次数。</p><strong>${records.length}</strong></div>
      <div class="summary-card"><h4>记录天数</h4><p>至少有一条记录的日期数量。</p><strong>${new Set(records.map((r) => r.day)).size}</strong></div>
      <div class="summary-card"><h4>平均情绪强度</h4><p>仅统计情绪项目的标签。</p><strong>${avg}</strong></div>
      <div class="summary-card"><h4>当前时段</h4><p>首页快速记录会自动归入这个时段。</p><strong>${getCurrentSlot(new Date()).name}</strong></div>
    `;
    renderEmotionDonut(records);
    renderIntensityTrend(records);
    renderProjectFrequency(records);
    renderSomaticTips(records);
  }

  function renderEmotionDonut(records) {
    const counts = {};
    records.forEach((record) => {
      record.projectEntries.filter((entry) => entry.projectId === "emotion").forEach((entry) => {
        entry.entries.forEach((item) => {
          if (!item.categoryId) return;
          counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
        });
      });
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) {
      els.emotionDonut.className = "donut-chart empty";
      els.emotionDonut.style.background = "";
      els.donutCenterLabel.textContent = "暂无情绪数据";
      els.emotionLegend.innerHTML = `<p class="body-copy">等你记录几次之后，这里会出现最近常见的情绪分类。</p>`;
      return;
    }
    const categoryMap = [
      ...DATA.emotionCategories,
      { id: "custom", label: "自定义", color: "#6b7d8d" }
    ];
    let angle = 0;
    const seg = categoryMap.filter((c) => counts[c.id]).map((c) => {
      const from = angle;
      angle += (counts[c.id] / total) * 360;
      return `${c.color} ${from}deg ${angle}deg`;
    });
    els.emotionDonut.className = "donut-chart";
    els.emotionDonut.style.background = `conic-gradient(${seg.join(", ")})`;
    els.donutCenterLabel.textContent = `${total} 个情绪标签`;
    els.emotionLegend.innerHTML = categoryMap.filter((c) => counts[c.id]).map((c) => {
      const n = counts[c.id];
      const p = Math.round((n / total) * 100);
      return `<div class="legend-item"><span class="legend-label"><span class="legend-dot" style="background:${c.color};"></span>${c.label}</span><strong>${n} · ${p}%</strong></div>`;
    }).join("");
  }

  function renderIntensityTrend(records) {
    const days = trendDays(ui.statsRange, records);
    if (!days.length) {
      els.intensityTrend.innerHTML = `<p class="body-copy">还没有足够的数据来画出趋势。</p>`;
      return;
    }
    const values = days.map((day) => {
      const list = records
        .filter((r) => r.day === day)
        .flatMap((r) => r.projectEntries)
        .filter((e) => e.projectId === "emotion")
        .flatMap((e) => e.entries)
        .map((e) => e.intensity)
        .filter(Boolean);
      if (!list.length) return { day, value: 0 };
      return { day, value: Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(1)) };
    });
    els.intensityTrend.innerHTML = values.map((row) => {
      const h = row.value ? Math.max(row.value * 32, 18) : 18;
      const cls = row.value ? "trend-bar" : "trend-bar empty";
      return `<div class="trend-bar-wrap"><span class="trend-value">${row.value || "--"}</span><div class="${cls}" style="height:${h}px;"></div><span class="trend-day">${row.day.slice(5)}</span></div>`;
    }).join("");
  }

  function renderProjectFrequency(records) {
    const map = {};
    records.forEach((record) => record.projectEntries.forEach((entry) => { map[entry.projectId] = (map[entry.projectId] || 0) + 1; }));
    const rows = state.projects.map((project) => ({ project, count: map[project.id] || 0 })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
    if (!rows.length) {
      els.projectFrequency.innerHTML = `<p class="body-copy">开始记录后，这里会看到各个项目被使用的频率。</p>`;
      return;
    }
    const top = rows[0].count;
    els.projectFrequency.innerHTML = rows.map((row) => `
      <div class="bar-item">
        <div class="record-header"><strong>${row.project.name}</strong><span class="timestamp">${row.count} 次</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(row.count / top) * 100}%; background:${row.project.color};"></div></div>
      </div>
    `).join("");
  }

  function renderSomaticTips(records) {
    const map = {};
    records.forEach((record) => {
      record.projectEntries.filter((entry) => entry.projectId === "somatic").forEach((entry) => {
        entry.entries.forEach((item) => { map[item.tagId] = (map[item.tagId] || 0) + 1; });
      });
    });
    const rows = DATA.somaticTags.map((tag) => ({ tag, count: map[tag.id] || 0 })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 8);
    if (!rows.length) {
      els.somaticFrequency.innerHTML = `<p class="body-copy">如果你常记录身体感受，这里会出现自己的高频提示。</p>`;
      return;
    }
    els.somaticFrequency.innerHTML = rows.map((row) => `<div class="pill-item"><strong>${row.tag.label}</strong><span class="timestamp">${row.count} 次</span></div>`).join("");
  }

  function renderExportFilters() {
    els.exportProjectFilters.innerHTML = state.projects.map((project) => {
      const on = ui.exportSelectedProjects.includes(project.id);
      return `<button type="button" class="filter-chip ${on ? "selected" : ""}" data-export-project-id="${project.id}" style="${on ? `background:${project.color};` : ""}">${project.name}</button>`;
    }).join("");
  }

  function renderSettings() {
    if (!els.reminderEnabled) return;
    renderExportFilters();
    syncReminderControls();
    syncReminderStatusText();
    updateInstallStatus();
    if (els.backupStatus) {
      els.backupStatus.textContent = `当前本地记录：${state.records.length} 条 · 上次更新：${new Date().toLocaleString("zh-CN")}`;
    }
  }

  function renderSuggestionList({ projectId, inputEl, targetEl, selectedIds, actionPrefix }) {
    if (!inputEl || !targetEl) return;
    const keyword = inputEl.value.trim();
    const project = getProject(projectId);
    const pool = project?.tags || [];
    const matches = findTagsByKeyword(projectId, keyword, 12);
    const selectedHits = selectedIds
      .map((id) => pool.find((tag) => tag.id === id))
      .filter(Boolean);
    const map = new Map();
    selectedHits.forEach((tag) => map.set(tag.id, tag));
    matches.forEach((tag) => map.set(tag.id, tag));
    const candidates = [...map.values()].slice(0, 12);
    if (!candidates.length) {
      targetEl.innerHTML = keyword
        ? `<span class="project-meta">没有匹配项，可以直接新增“${escapeHtml(keyword)}”。</span>`
        : `<span class="project-meta">输入关键词可联想已有标签，例如输入“伤”会联想出“【蓝色】伤心”。</span>`;
      return;
    }
    targetEl.innerHTML = candidates.map((tag) => {
      const selected = selectedIds.includes(tag.id);
      const prefix = `【${describeColor(tag.color)}】`;
      return `<button type="button" class="chip ${selected ? "selected" : ""}" data-action="${actionPrefix}" data-project-id="${projectId}" data-tag-id="${tag.id}" style="${selected ? `background:${tag.color || "#2f7f79"};` : ""}">${prefix}${escapeHtml(tag.label)}</button>`;
    }).join("");
  }

  function findTagsByKeyword(projectId, keyword, limit = 12) {
    const project = getProject(projectId);
    const pool = project?.tags || [];
    if (!keyword) {
      return pool.slice(0, limit);
    }
    const query = normalizeLabel(keyword);
    return pool.filter((tag) => normalizeLabel(tag.label).includes(query)).slice(0, limit);
  }

  function ensureProjectTag(projectId, label, color, emotionCategoryName) {
    const project = getProject(projectId);
    if (!project) return null;
    if (!Array.isArray(project.tags)) project.tags = [];
    const existing = project.tags.find((tag) => normalizeLabel(tag.label) === normalizeLabel(label));
    if (existing) {
      if (color) existing.color = color;
      return existing;
    }
    const id = `${projectId}-custom-${slug(label)}-${Date.now()}`;
    const entry = {
      id,
      label,
      color: color || project.color || "#3b8f89",
      categoryId: projectId === "emotion" ? "custom" : null,
      categoryName: projectId === "emotion" ? (emotionCategoryName || "自定义情绪") : null,
      groupLabel: null,
      custom: true
    };
    project.tags.unshift(entry);
    if (projectId === "emotion") {
      if (!Array.isArray(project.quickTagIds)) project.quickTagIds = [];
      if (!project.quickTagIds.includes(id)) project.quickTagIds.unshift(id);
    }
    return entry;
  }

  function mergeBuiltinProject(builtin, stored) {
    const merged = deepCopy(builtin);
    if (!stored) return merged;
    if (stored.description) merged.description = stored.description;
    if (stored.color) merged.color = stored.color;
    if (Array.isArray(merged.tags) || Array.isArray(stored.tags)) {
      const map = new Map();
      (Array.isArray(merged.tags) ? merged.tags : []).forEach((tag) => {
        map.set(tag.id, deepCopy(tag));
      });
      (Array.isArray(stored.tags) ? stored.tags : []).forEach((tag) => {
        if (!tag || !tag.id) return;
        if (map.has(tag.id)) {
          map.set(tag.id, { ...map.get(tag.id), ...tag });
          return;
        }
        const duplicate = [...map.values()].find((item) => normalizeLabel(item.label) === normalizeLabel(tag.label));
        if (!duplicate) {
          map.set(tag.id, deepCopy(tag));
        }
      });
      merged.tags = [...map.values()];
    }
    if (Array.isArray(merged.quickTagIds) || Array.isArray(stored.quickTagIds)) {
      const ids = [...(merged.quickTagIds || []), ...(stored.quickTagIds || [])];
      merged.quickTagIds = [...new Set(ids)];
    }
    return merged;
  }

  function bootstrapPwa() {
    registerServiceWorker();
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallStatus();
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      if (els.installStatus) {
        els.installStatus.textContent = "已安装到主屏幕。后续可直接像 app 一样打开。";
      }
    });
    updateInstallStatus();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const isLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
    const isSecure = location.protocol === "https:" || isLocalhost;
    if (!isSecure) {
      if (els.installStatus) {
        els.installStatus.textContent = "PWA 安装和离线缓存需要 https 或 localhost。";
      }
      return;
    }
    navigator.serviceWorker.register("./sw.js").catch(() => {
      if (els.installStatus) {
        els.installStatus.textContent = "离线缓存注册失败，请检查部署路径。";
      }
    });
  }

  function promptInstallApp() {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      toast("已经是主屏幕安装模式");
      return;
    }
    if (!deferredInstallPrompt) {
      if (els.installStatus) {
        els.installStatus.textContent = "当前浏览器暂不支持一键安装，请使用浏览器菜单“添加到主屏幕”。";
      }
      return;
    }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      updateInstallStatus();
    });
  }

  function updateInstallStatus() {
    if (!els.installStatus) return;
    if (window.matchMedia("(display-mode: standalone)").matches) {
      els.installStatus.textContent = "当前已是安装后的独立模式。";
      return;
    }
    if (deferredInstallPrompt) {
      els.installStatus.textContent = "可以点击“安装到主屏幕”进行安装。";
      return;
    }
    if (location.protocol === "file:") {
      els.installStatus.textContent = "当前是本地文件模式。要测试安装，请改用 http:// 或 https:// 打开。";
      return;
    }
    els.installStatus.textContent = "如无法一键安装，可用浏览器菜单“添加到主屏幕”。";
  }

  function exportBackupJson() {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      app: "心绪记录",
      version: 1,
      payload: deepCopy(state)
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `心绪记录备份_${toDayKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (els.backupStatus) {
      els.backupStatus.textContent = `已导出备份：${snapshot.exportedAt.replace("T", " ").slice(0, 19)}`;
    }
    toast("JSON 备份已导出");
  }

  function importBackupJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ""));
        const payload = data.payload || data;
        const next = sanitizeImportedState(payload);
        const ok = window.confirm("恢复备份会覆盖当前本地数据，确定继续吗？");
        if (!ok) return;
        overwriteState(next);
        saveState();
        ui.exportSelectedProjects = state.projects.map((project) => project.id);
        syncReminderControls();
        startReminderMonitor();
        renderApp();
        if (els.backupStatus) {
          els.backupStatus.textContent = `已恢复备份：${new Date().toLocaleString("zh-CN")}`;
        }
        toast("备份恢复成功");
      } catch (_) {
        toast("备份文件格式不正确");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function sanitizeImportedState(payload) {
    const base = initialState();
    const incomingProjects = Array.isArray(payload.projects) ? payload.projects : [];
    const builtinProjects = BUILTIN_PROJECTS.map((builtin) => mergeBuiltinProject(builtin, incomingProjects.find((item) => item.id === builtin.id)));
    const customProjects = incomingProjects.filter((project) => !isBuiltinProject(project.id));
    const safeProjects = [...builtinProjects, ...customProjects];
    const safeRecords = Array.isArray(payload.records) ? payload.records : [];
    const safeSlots = Array.isArray(payload.slotTemplates) && payload.slotTemplates.length ? payload.slotTemplates : base.slotTemplates;
    const incomingSettings = payload.settings || {};
    const incomingReminders = incomingSettings.reminders || {};
    return {
      version: 1,
      slotTemplates: safeSlots,
      settings: {
        activeSlotTemplateId: incomingSettings.activeSlotTemplateId || DATA.slotTemplate.id,
        reminders: {
          enabled: Boolean(incomingReminders.enabled),
          times: { ...DEFAULT_REMINDERS.times, ...(incomingReminders.times || {}) },
          lastNotified: incomingReminders.lastNotified || {}
        }
      },
      projects: safeProjects,
      records: safeRecords
    };
  }

  function overwriteState(next) {
    state.version = next.version;
    state.slotTemplates = next.slotTemplates;
    state.settings = next.settings;
    state.projects = next.projects;
    state.records = next.records;
  }

  function syncReminderControls() {
    if (!state.settings.reminders) {
      state.settings.reminders = deepCopy(DEFAULT_REMINDERS);
    }
    if (els.reminderEnabled) {
      els.reminderEnabled.checked = Boolean(state.settings.reminders.enabled);
    }
    const times = state.settings.reminders.times || DEFAULT_REMINDERS.times;
    if (els.reminderTimeLateNight) els.reminderTimeLateNight.value = times["late-night"] || DEFAULT_REMINDERS.times["late-night"];
    if (els.reminderTimeMorning) els.reminderTimeMorning.value = times.morning || DEFAULT_REMINDERS.times.morning;
    if (els.reminderTimeAfternoon) els.reminderTimeAfternoon.value = times.afternoon || DEFAULT_REMINDERS.times.afternoon;
    if (els.reminderTimeEvening) els.reminderTimeEvening.value = times.evening || DEFAULT_REMINDERS.times.evening;
  }

  function syncReminderStatusText() {
    if (!els.reminderStatus) return;
    const enabled = Boolean(state.settings.reminders?.enabled);
    const permission = (typeof Notification !== "undefined") ? Notification.permission : "unsupported";
    els.reminderStatus.textContent = enabled
      ? `提醒已开启。通知权限：${permission}。`
      : "提醒已关闭。开启后会在打开网页时按时段检查漏记。";
  }

  function startReminderMonitor() {
    if (reminderTimer) {
      clearInterval(reminderTimer);
      reminderTimer = null;
    }
    if (!state.settings.reminders?.enabled) return;
    checkReminderNow();
    reminderTimer = setInterval(checkReminderNow, 60000);
  }

  function checkReminderNow() {
    const reminders = state.settings.reminders;
    if (!reminders?.enabled) return;

    const now = new Date();
    const slot = getCurrentSlot(now);
    const dayKey = toDayKey(now);
    const trigger = (reminders.times && reminders.times[slot.id]) || DEFAULT_REMINDERS.times[slot.id];
    if (!trigger) return;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const triggerMinutes = toMinutes(trigger);
    if (currentMinutes < triggerMinutes) return;

    const hasRecorded = state.records.some((record) => record.day === dayKey && record.slotId === slot.id);
    if (hasRecorded) return;

    const key = `${dayKey}:${slot.id}`;
    if (reminders.lastNotified && reminders.lastNotified[key]) return;

    if (!reminders.lastNotified) reminders.lastNotified = {};
    reminders.lastNotified[key] = now.toISOString();
    saveState();

    const text = `现在是${slot.name}，你还没有记录。可以花 20 秒快速记录一下。`;
    toast(text);
    pushReminderNotification("心绪记录提醒", text);
  }

  function requestNotificationPermission() {
    if (typeof Notification === "undefined") {
      toast("当前浏览器不支持通知");
      return;
    }
    Notification.requestPermission().then((permission) => {
      syncReminderStatusText();
      if (permission === "granted") {
        toast("通知权限已开启");
      } else {
        toast("通知权限未开启");
      }
    });
  }

  function sendTestReminder() {
    const message = "这是测试提醒：如果你现在有感受，欢迎记录一条。";
    pushReminderNotification("心绪记录测试提醒", message, true);
  }

  function pushReminderNotification(title, body, forceToast) {
    if (forceToast) toast(body);
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) {
          registration.showNotification(title, { body, icon: "./assets/icons/icon-192.png", badge: "./assets/icons/icon-192.png" });
        } else {
          new Notification(title, { body, icon: "./assets/icons/icon-192.png" });
        }
      });
    } else {
      new Notification(title, { body, icon: "./assets/icons/icon-192.png" });
    }
  }

  function generateExportText() {
    const from = els.exportFrom.value;
    const to = els.exportTo.value;
    if (!from || !to) {
      toast("先选好导出时间范围");
      return;
    }
    if (from > to) {
      toast("开始日期不能晚于结束日期");
      return;
    }
    if (!ui.exportSelectedProjects.length) {
      toast("至少勾选一个项目");
      return;
    }
    const rows = [...state.records]
      .filter((record) => record.day >= from && record.day <= to)
      .map((record) => ({ ...record, projectEntries: record.projectEntries.filter((entry) => ui.exportSelectedProjects.includes(entry.projectId)) }))
      .filter((record) => record.projectEntries.length)
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    els.exportPreview.value = exportText(from, to, rows);
    toast(rows.length ? "文字版已生成" : "这个时间范围内没有匹配记录");
  }

  function copyExportText() {
    const text = els.exportPreview.value.trim();
    if (!text) {
      toast("先生成文字，再复制");
      return;
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => toast("已复制到剪贴板")).catch(copyFallback);
    } else {
      copyFallback();
    }
  }

  function copyFallback() {
    els.exportPreview.focus();
    els.exportPreview.select();
    toast(document.execCommand("copy") ? "已复制到剪贴板" : "复制失败，可以手动全选复制");
  }

  function downloadExportText() {
    const text = els.exportPreview.value.trim();
    if (!text) {
      toast("先生成文字，再下载");
      return;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `心绪记录_${els.exportFrom.value}_${els.exportTo.value}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast("txt 已开始下载");
  }

  function exportText(from, to, records) {
    const title = [
      "心绪记录导出",
      `时间范围：${from} 至 ${to}`,
      `导出项目：${ui.exportSelectedProjects.map((id) => getProject(id)?.name).filter(Boolean).join("、")}`,
      `记录条数：${records.length}`,
      ""
    ];
    if (!records.length) return [...title, "这个时间范围内没有符合筛选条件的记录。"].join("\n");
    const body = records.map((record, index) => {
      const d = new Date(record.createdAt);
      const lines = [`${index + 1}. ${record.day} ${record.slotName} ${pad(d.getHours())}:${pad(d.getMinutes())}`, `来源：${record.source === "guided" ? "引导记录" : "快速记录"}`];
      if (record.bodyAreas?.length) lines.push(`身体部位：${record.bodyAreas.join("、")}`);
      record.projectEntries.forEach((entry) => {
        const tags = entry.entries.map((item) => {
          const extra = [];
          if (item.categoryName) extra.push(item.categoryName);
          if (item.intensity) extra.push(`强度 ${item.intensity}`);
          return extra.length ? `${item.label}（${extra.join("，")}）` : item.label;
        }).join("、");
        lines.push(`${entry.projectName}：${tags}`);
      });
      if (record.eventText) lines.push(`发生了什么：${record.eventText}`);
      if (record.childhoodEcho) lines.push(`旧日回声：${record.childhoodEcho}`);
      if (record.note) lines.push(`备注：${record.note}`);
      return lines.join("\n");
    });
    return title.concat(body).join("\n\n");
  }

  function seedExportDates() {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    els.exportFrom.value = toDayKey(from);
    els.exportTo.value = toDayKey(today);
  }

  function filterByRange(range) {
    if (range === "all") return [...state.records];
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
    if (range === "all") return [...new Set(records.map((r) => r.day))].sort().slice(-10);
    const n = range === "30d" ? 10 : 7;
    const list = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      list.push(toDayKey(d));
    }
    return list;
  }

  function getCurrentSlot(date) {
    const template = state.slotTemplates.find((item) => item.id === state.settings.activeSlotTemplateId) || DATA.slotTemplate;
    const minute = date.getHours() * 60 + date.getMinutes();
    return template.slots.find((slot) => {
      const start = toMinutes(slot.start);
      const end = toMinutes(slot.end);
      return start <= end ? (minute >= start && minute <= end) : (minute >= start || minute <= end);
    }) || template.slots[0];
  }

  function toTagEntry(project, tagId, intensity) {
    if (!project) return null;
    if (project.type === "emotion") {
      const tagPool = project.tags || EMOTION_TAGS;
      const tag = tagPool.find((item) => item.id === tagId);
      if (!tag) return null;
      return {
        tagId: tag.id,
        label: tag.label,
        color: tag.color,
        categoryId: tag.categoryId,
        categoryName: tag.categoryName,
        groupLabel: tag.groupLabel,
        intensity: intensity || 3
      };
    }
    const tag = (project.tags || []).find((item) => item.id === tagId);
    if (!tag) return null;
    return {
      tagId: tag.id,
      label: tag.label,
      color: tag.color || project.color,
      categoryId: null,
      categoryName: null,
      groupLabel: null,
      intensity: null
    };
  }

  function getProject(id) {
    return state.projects.find((project) => project.id === id);
  }

  function getQuickArray(projectId) {
    if (!ui.quickSelections[projectId]) ui.quickSelections[projectId] = [];
    return ui.quickSelections[projectId];
  }

  function chip(label, selected, attrs, color) {
    return `<button type="button" class="chip ${selected ? "selected" : ""}" ${attrs} style="${selected && color ? `background:${color};` : ""}">${label}</button>`;
  }

  function newGuidedDraft() {
    return { bodyAreas: [], somaticTagIds: [], emotionTagIds: [], intensity: 3, eventText: "", childhoodEcho: "" };
  }

  function flattenEmotionTags(categories) {
    const out = [];
    categories.forEach((category) => {
      category.groups.forEach((group) => {
        group.tags.forEach((label) => out.push({
          id: `${category.id}-${label}`,
          label,
          color: category.color,
          categoryId: category.id,
          categoryName: category.label,
          groupLabel: group.label
        }));
      });
    });
    return out;
  }

  function isBuiltinProject(id) {
    return BUILTIN_PROJECTS.some((p) => p.id === id);
  }

  function toggleInArray(arr, value) {
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(value);
  }

  function createId() {
    const c = (typeof window !== "undefined" && window.crypto) ? window.crypto : null;
    return (c && typeof c.randomUUID === "function")
      ? c.randomUUID()
      : `record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function toDayKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function toMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function normalizeLabel(value) {
    return String(value || "").trim().toLowerCase();
  }

  function describeColor(hex) {
    const raw = String(hex || "").replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return "默认色";
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const saturation = max === 0 ? 0 : delta / max;
    if (saturation < 0.15) return "灰色";
    let hue = 0;
    if (delta !== 0) {
      if (max === r) hue = ((g - b) / delta) % 6;
      if (max === g) hue = (b - r) / delta + 2;
      if (max === b) hue = (r - g) / delta + 4;
      hue = Math.round(hue * 60);
      if (hue < 0) hue += 360;
    }
    if (hue < 15 || hue >= 345) return "红色";
    if (hue < 45) return "橙色";
    if (hue < 70) return "黄色";
    if (hue < 165) return "绿色";
    if (hue < 200) return "青色";
    if (hue < 260) return "蓝色";
    if (hue < 320) return "紫色";
    return "粉色";
  }

  function slug(value) {
    return value.toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fa5-]/g, "").replace(/-+/g, "-").slice(0, 24);
  }

  function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(message) {
    clearTimeout(ui.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    ui.toastTimer = setTimeout(() => els.toast.classList.remove("visible"), 2200);
  }
})();
