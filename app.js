const ADMIN_PASSWORD = "88888888";

const EXAM_LABELS = {
  cet4: "CET-4",
  cet6: "CET-6",
  ielts: "IELTS",
  toefl: "TOEFL",
  kaoyan: "考研英语",
};

const EXAM_GUIDANCE = {
  cet4: "词汇和句式以大学英语四级常见阅读、翻译和写作难度为准，句子要清晰规范。",
  cet6: "词汇和句式略高于四级，兼顾抽象表达和书面语准确性。",
  ielts: "突出学术场景、逻辑连接与自然书面表达，适度使用复合句。",
  toefl: "偏向学术英语与校园话题，体现信息整合和清晰推理。",
  kaoyan: "贴近考研阅读和写作语感，强调长难句理解与逻辑衔接。",
};

const DEMO_LIBRARY = [
  { word: "sustain", meaning: "维持；支撑", tag: "写作" },
  { word: "significant", meaning: "显著的；重要的", tag: "阅读" },
  { word: "innovative", meaning: "创新的", tag: "写作" },
  { word: "approach", meaning: "方法；接近", tag: "阅读" },
  { word: "contribute", meaning: "促成；贡献", tag: "写作" },
  { word: "decline", meaning: "下降；拒绝", tag: "阅读" },
  { word: "analyze", meaning: "分析", tag: "阅读" },
  { word: "essential", meaning: "必要的；本质的", tag: "写作" },
];

const ACTIVE_ROUND_STORAGE_KEY = "lexisprint-active-round-v1";

const DEFAULT_STATE = {
  words: [],
  todayLog: [],
  libraryMeta: {
    totalWords: 0,
    boundExam: null,
    sourceLabel: "",
  },
  settings: {
    exam: "cet4",
    generatorMode: "demo",
    apiBase: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    outputType: "sentence",
    roundSize: "8",
  },
};

const els = {
  entryScreen: document.querySelector("#entryScreen"),
  enterAppBtn: document.querySelector("#enterAppBtn"),
  homeShell: document.querySelector("#homeShell"),
  studyShell: document.querySelector("#studyShell"),
  aiShell: document.querySelector("#aiShell"),
  openSettingsBtn: document.querySelector("#openSettingsBtn"),
  closeSettingsBtn: document.querySelector("#closeSettingsBtn"),
  closeAdminBtn: document.querySelector("#closeAdminBtn"),
  settingsModal: document.querySelector("#settingsModal"),
  adminModal: document.querySelector("#adminModal"),
  statsGrid: document.querySelector("#statsGrid"),
  modeBadge: document.querySelector("#modeBadge"),
  memorizeBtn: document.querySelector("#memorizeBtn"),
  reviewBtn: document.querySelector("#reviewBtn"),
  writeBtn: document.querySelector("#writeBtn"),
  actionCaption: document.querySelector("#actionCaption"),
  studyPanel: document.querySelector("#studyPanel"),
  aiPanel: document.querySelector("#aiPanel"),
  studyPageTitle: document.querySelector("#studyPageTitle"),
  studyPageCaption: document.querySelector("#studyPageCaption"),
  studyTitle: document.querySelector("#studyTitle"),
  studyBackBtn: document.querySelector("#studyBackBtn"),
  aiBackBtn: document.querySelector("#aiBackBtn"),
  studyCard: document.querySelector("#studyCard"),
  resetTodayBtn: document.querySelector("#resetTodayBtn"),
  generateBtn: document.querySelector("#generateBtn"),
  topicInput: document.querySelector("#topicInput"),
  aiOutput: document.querySelector("#aiOutput"),
  segmentButtons: Array.from(document.querySelectorAll(".segment")),
  roundSizeInput: document.querySelector("#roundSizeInput"),
  examBindingNote: document.querySelector("#examBindingNote"),
  adminPasswordInput: document.querySelector("#adminPasswordInput"),
  adminUnlockBtn: document.querySelector("#adminUnlockBtn"),
  examSelect: document.querySelector("#examSelect"),
  generatorModeSelect: document.querySelector("#generatorModeSelect"),
  apiBaseInput: document.querySelector("#apiBaseInput"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  modelInput: document.querySelector("#modelInput"),
  addWordForm: document.querySelector("#addWordForm"),
  wordInput: document.querySelector("#wordInput"),
  meaningInput: document.querySelector("#meaningInput"),
  tagInput: document.querySelector("#tagInput"),
  wordList: document.querySelector("#wordList"),
  seedBtn: document.querySelector("#seedBtn"),
  importDatasetBtn: document.querySelector("#importDatasetBtn"),
  wordItemTemplate: document.querySelector("#wordItemTemplate"),
};

let state = structuredClone(DEFAULT_STATE);
let uiState = {
  appEntered: false,
  currentView: "home",
  studyMode: "memorize",
  settingsOpen: false,
  adminOpen: false,
  round: null,
};

function createEmptyRound() {
  return {
    size: 0,
    queue: [],
    completed: [],
    activeId: null,
    mode: "memorize",
  };
}

function createRoundQueueEntry(item) {
  return {
    id: item.id,
    stage: 1,
    attempts: 0,
    stageOneOptions: [],
    stage1SelectedIndex: null,
    stage2Choice: null,
    stage2Judge: null,
    stage3Choice: null,
  };
}

function isRoundInProgress(round) {
  return Boolean(round && round.size > 0 && round.queue.length > 0);
}

function normalizeRound(round) {
  if (!round || typeof round !== "object") {
    return null;
  }

  const validIds = new Set(state.words.map((item) => item.id));
  const queue = Array.isArray(round.queue)
    ? round.queue
      .filter((entry) => entry && validIds.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        stage: Math.max(1, Math.min(3, Number.parseInt(entry.stage, 10) || 1)),
        attempts: Math.max(0, Number.parseInt(entry.attempts, 10) || 0),
        stageOneOptions: Array.isArray(entry.stageOneOptions)
          ? entry.stageOneOptions
            .filter((option) => option && typeof option.text === "string")
            .map((option) => ({
              text: option.text,
              english: typeof option.english === "string" ? option.english : "",
              correct: option.correct === true,
            }))
          : [],
        stage1SelectedIndex: Number.isInteger(entry.stage1SelectedIndex) ? entry.stage1SelectedIndex : null,
        stage2Choice: ["know", "fuzzy", "dontKnow"].includes(entry.stage2Choice) ? entry.stage2Choice : null,
        stage2Judge: ["correct", "wrong"].includes(entry.stage2Judge) ? entry.stage2Judge : null,
        stage3Choice: ["know", "dontKnow"].includes(entry.stage3Choice) ? entry.stage3Choice : null,
      }))
    : [];

  const queuedIds = new Set(queue.map((entry) => entry.id));
  const completed = Array.isArray(round.completed)
    ? round.completed
      .filter((entry) => entry && validIds.has(entry.id) && !queuedIds.has(entry.id))
      .map((entry) => ({
        id: entry.id,
        completedAt: Number.parseInt(entry.completedAt, 10) || Date.now(),
      }))
    : [];

  const size = Math.max(queue.length + completed.length, Number.parseInt(round.size, 10) || 0);
  if (size === 0) {
    return null;
  }

  return {
    size,
    mode: round.mode === "review" ? "review" : "memorize",
    queue,
    completed,
    activeId: queue.some((entry) => entry.id === round.activeId) ? round.activeId : (queue[0]?.id || null),
  };
}

function loadPersistedRound() {
  try {
    const raw = window.localStorage.getItem(ACTIVE_ROUND_STORAGE_KEY);
    return raw ? normalizeRound(JSON.parse(raw)) : null;
  } catch (_error) {
    return null;
  }
}

function persistRound() {
  try {
    if (isRoundInProgress(uiState.round)) {
      window.localStorage.setItem(ACTIVE_ROUND_STORAGE_KEY, JSON.stringify(uiState.round));
    } else {
      window.localStorage.removeItem(ACTIVE_ROUND_STORAGE_KEY);
    }
  } catch (_error) {
    // Ignore persistence failures and keep the current session usable.
  }
}

function hydrateRoundFromStorage() {
  const restoredRound = loadPersistedRound();
  if (restoredRound && !isRoundInProgress(uiState.round)) {
    uiState.round = restoredRound;
    uiState.studyMode = restoredRound.mode;
  } else if (uiState.round) {
    uiState.round = normalizeRound(uiState.round);
  }
  persistRound();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `请求失败：${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function refreshState() {
  const data = await api("/api/state");
  state = {
    ...structuredClone(DEFAULT_STATE),
    ...data,
    settings: {
      ...structuredClone(DEFAULT_STATE).settings,
      ...(data.settings || {}),
    },
  };
  hydrateRoundFromStorage();
  render();
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeWord(input) {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function getMasteredWords() {
  return state.words.filter((item) => item.reviewCount > 0);
}

function getTodayStudiedWords() {
  const seen = new Set();
  return state.todayLog.filter((entry) => {
    if (entry.rating !== "know") {
      return false;
    }
    if (seen.has(entry.wordId)) {
      return false;
    }
    seen.add(entry.wordId);
    return true;
  });
}

function getStats() {
  {
    const round = uiState.round || createEmptyRound();
    return [
      { label: "词库总量", value: state.words.length },
      { label: "今日过关", value: getTodayStudiedWords().length },
      { label: "已掌握", value: getMasteredWords().length },
      { label: "未背新词", value: state.words.filter((item) => item.reviewCount === 0).length },
      { label: "本轮完成", value: round.completed.length },
      { label: "目标考试", value: EXAM_LABELS[state.settings.exam] },
    ];
  }

  const round = uiState.round || createEmptyRound();
  return [
    { label: "词库总量", value: state.words.length },
    { label: "今日过关", value: getTodayStudiedWords().length },
    { label: "已掌握", value: getMasteredWords().length },
    { label: "未背新词", value: state.words.filter((item) => item.reviewCount === 0).length },
    { label: "本轮完成", value: round.completed.length },
    { label: "目标考试", value: EXAM_LABELS[state.settings.exam] },
  ];
}

function masteryLabel(level) {
  if (level >= 8) {
    return "熟练";
  }
  if (level >= 6) {
    return "已掌握";
  }
  if (level >= 3) {
    return "巩固中";
  }
  return "新词";
}

function renderStats() {
  els.statsGrid.innerHTML = "";
  getStats().forEach((item) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `<strong>${item.value}</strong><span>${item.label}</span>`;
    els.statsGrid.appendChild(card);
  });
}

function renderModeBadge() {
  els.modeBadge.textContent = state.settings.generatorMode === "api" ? "API 模式" : "演示模式";
}

function renderShellVisibility() {
  const appVisible = uiState.appEntered;
  els.entryScreen.hidden = appVisible;
  els.homeShell.hidden = !appVisible || uiState.currentView !== "home";
  els.studyShell.hidden = !appVisible || uiState.currentView !== "study";
  els.aiShell.hidden = !appVisible || uiState.currentView !== "ai";
  els.openSettingsBtn.hidden = !appVisible;
}

function renderMainView() {
  {
    const captionMap = {
      memorize: `背诵单词会从主词库中随机抽取本轮 ${state.settings.roundSize} 个“还没背诵过”的单词进入三阶段流程。`,
      review: `复习单词会从已完成背诵的单词里抽取本轮 ${state.settings.roundSize} 个进入三阶段复习。`,
      ai: "生成文章 / 句子会优先调用今天真正通过三阶段的词汇，再结合已掌握基础词生成内容。",
    };

    els.actionCaption.textContent = captionMap.memorize;
    els.studyPageTitle.textContent = uiState.studyMode === "review" ? "三阶段复习" : "三阶段背诵";
    els.studyPageCaption.textContent = captionMap[uiState.studyMode];
    return;
  }

  const captionMap = {
    memorize: `背诵单词会从主词库中随机抽取本轮 ${state.settings.roundSize} 个“还没背诵过”的单词进入三阶段流程。`,
    review: `复习单词会从已背过的单词里抽取本轮 ${state.settings.roundSize} 个进入三阶段复习。`,
    ai: "生成文章 / 句子会优先调用今天真正通过三阶段的词汇，再结合已掌握基础词生成内容。",
  };

  els.actionCaption.textContent = captionMap.memorize;
  els.studyPageTitle.textContent = uiState.studyMode === "review" ? "涓夐樁娈靛涔?" : "涓夐樁娈佃儗璇?";
  els.studyPageCaption.textContent = captionMap[uiState.studyMode];
}

function renderSettingsModal() {
  els.settingsModal.hidden = !uiState.settingsOpen;
  els.roundSizeInput.value = state.settings.roundSize;

  const boundExam = state.libraryMeta?.boundExam || null;
  els.examBindingNote.textContent = boundExam
    ? `当前词库来源：${state.libraryMeta.sourceLabel}，目标考试已自动绑定为 ${EXAM_LABELS[boundExam]}。`
    : "当前可自由调整本轮单词数。";
}

function renderAdminModal() {
  els.adminModal.hidden = !uiState.adminOpen;
  els.examSelect.value = state.settings.exam;
  els.generatorModeSelect.value = state.settings.generatorMode;
  els.apiBaseInput.value = state.settings.apiBase;
  els.apiKeyInput.value = state.settings.apiKey;
  els.modelInput.value = state.settings.model;
  els.examSelect.disabled = Boolean(state.libraryMeta?.boundExam);
}

function renderWordList() {
  if (!uiState.adminOpen) {
    els.wordList.innerHTML = "";
    return;
  }

  if (state.words.length === 0) {
    els.wordList.innerHTML = '<div class="empty-state">词库还是空的。你可以手动添加，或者导入考研词汇文件。</div>';
    return;
  }

  els.wordList.innerHTML = "";
  const sorted = [...state.words].sort((a, b) => b.createdAt - a.createdAt);
  sorted.forEach((item) => {
    const fragment = els.wordItemTemplate.content.cloneNode(true);
    fragment.querySelector(".word-text").textContent = item.word;
    fragment.querySelector(".mastery-pill").textContent = masteryLabel(item.familiarity);
    fragment.querySelector(".word-meaning").textContent = item.meaning;
    fragment.querySelector(".word-meta").textContent =
      `标签：${item.tag || "未分类"} · 熟悉度：${item.familiarity}/10 · 复习 ${item.reviewCount} 次`;

    fragment.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      try {
        await api(`/api/words/${item.id}`, { method: "DELETE" });
        if (uiState.round) {
          uiState.round.queue = uiState.round.queue.filter((entry) => entry.id !== item.id);
          uiState.round.completed = uiState.round.completed.filter((entry) => entry.id !== item.id);
          uiState.round.activeId = uiState.round.queue[0]?.id || null;
          persistRound();
        }
        await refreshState();
      } catch (error) {
        window.alert(error.message);
      }
    });

    els.wordList.appendChild(fragment);
  });
}

function currentRoundEntry() {
  if (!uiState.round || !uiState.round.activeId) {
    return null;
  }
  return uiState.round.queue.find((entry) => entry.id === uiState.round.activeId) || null;
}

function currentRoundWord() {
  const entry = currentRoundEntry();
  if (!entry) {
    return null;
  }
  return state.words.find((item) => item.id === entry.id) || null;
}

function buildMemorizePool() {
  return state.words.filter((item) => item.reviewCount === 0);
}

function buildReviewPool() {
  {
    const reviewed = getMasteredWords();
    const due = reviewed.filter((item) => item.nextDueAt <= Date.now());
    const backup = reviewed.filter((item) => item.nextDueAt > Date.now());
    return [...shuffle(due), ...shuffle(backup)];
  }

  const reviewed = state.words.filter((item) => item.reviewCount > 0);
  const due = reviewed.filter((item) => item.nextDueAt <= Date.now());
  const backup = reviewed.filter((item) => item.nextDueAt > Date.now());
  return [...shuffle(due), ...shuffle(backup)];
}

function createRoundFromPool(mode) {
  {
    const requestedSize = Math.max(1, Math.min(50, Number.parseInt(state.settings.roundSize, 10) || 8));
    const pool = mode === "memorize" ? buildMemorizePool() : buildReviewPool();
    const limit = mode === "memorize"
      ? Math.min(requestedSize, pool.length)
      : Math.min(requestedSize, getMasteredWords().length, pool.length);
    const selected = pool.slice(0, limit);

    return {
      size: selected.length,
      mode,
      queue: selected.map((item) => createRoundQueueEntry(item)),
      completed: [],
      activeId: selected[0]?.id || null,
    };
  }

  const size = Math.max(1, Math.min(50, Number.parseInt(state.settings.roundSize, 10) || 8));
  const pool = mode === "memorize" ? buildMemorizePool() : buildReviewPool();
  const selected = shuffle(pool).slice(0, Math.min(size, pool.length));

  return {
    size: selected.length,
    mode,
    queue: selected.map((item) => createRoundQueueEntry(item)),
    completed: [],
    activeId: selected[0]?.id || null,
  };
}

function reconcileActiveRoundSize(previousSize, nextSize) {
  if (!uiState.round || !isRoundInProgress(uiState.round)) {
    return;
  }

  const currentSize = Math.max(
    uiState.round.queue.length + uiState.round.completed.length,
    Number.parseInt(uiState.round.size, 10) || 0,
  );
  const targetSize = Math.max(1, Number.parseInt(nextSize, 10) || currentSize || 1);
  if (targetSize === currentSize) {
    return;
  }

  if (targetSize > currentSize) {
    const addCount = targetSize - currentSize;
    const existingIds = new Set([
      ...uiState.round.queue.map((entry) => entry.id),
      ...uiState.round.completed.map((entry) => entry.id),
    ]);
    const pool = uiState.round.mode === "memorize" ? buildMemorizePool() : buildReviewPool();
    const additions = pool
      .filter((item) => !existingIds.has(item.id))
      .slice(0, addCount)
      .map((item) => createRoundQueueEntry(item));

    if (additions.length > 0) {
      uiState.round.queue.push(...additions);
      uiState.round.size = currentSize + additions.length;
      if (!uiState.round.activeId) {
        uiState.round.activeId = uiState.round.queue[0]?.id || null;
      }
      persistRound();
    }
    return;
  }

  const stageOneCandidates = uiState.round.queue.filter((entry) => entry.stage === 1);
  const removeCount = Math.min(stageOneCandidates.length, currentSize - targetSize);
  if (removeCount <= 0) {
    return;
  }

  const removableIds = [];
  const queueTail = [...uiState.round.queue].reverse();
  for (const entry of queueTail) {
    if (entry.stage !== 1 || entry.id === uiState.round.activeId) {
      continue;
    }
    removableIds.push(entry.id);
    if (removableIds.length === removeCount) {
      break;
    }
  }

  if (removableIds.length < removeCount) {
    const activeEntry = currentRoundEntry();
    if (activeEntry && activeEntry.stage === 1) {
      removableIds.push(activeEntry.id);
    }
  }

  const removalSet = new Set(removableIds.slice(0, removeCount));
  if (removalSet.size === 0) {
    return;
  }

  uiState.round.queue = uiState.round.queue.filter((entry) => !removalSet.has(entry.id));
  uiState.round.size = Math.max(0, currentSize - removalSet.size);
  if (!uiState.round.queue.some((entry) => entry.id === uiState.round.activeId)) {
    uiState.round.activeId = uiState.round.queue[0]?.id || null;
  }
  persistRound();
}

async function startRound(mode) {
  const resumedRound = normalizeRound(uiState.round) || loadPersistedRound();
  if (isRoundInProgress(resumedRound)) {
    uiState.studyMode = resumedRound.mode;
    uiState.currentView = "study";
    uiState.round = resumedRound;
    persistRound();
    render();
    return;
  }

  const round = createRoundFromPool(mode);
  if (round.size === 0) {
    window.alert(mode === "memorize" ? "主词库里暂时没有还没背诵过的新词了。" : "当前还没有可复习的已背单词。");
    return;
  }

  uiState.studyMode = mode;
  uiState.currentView = "study";
  uiState.round = round;
  persistRound();
  render();
}

function formatTranslationOption(item) {
  if (!item) {
    return "";
  }

  if (typeof item === "string") {
    return item.trim();
  }

  const meaning = item.meaning?.trim() || "";
  const pos = item.pos?.trim() || "";
  return pos && meaning ? `${pos}. ${meaning}` : meaning;
}

function primaryOptionText(word) {
  return formatTranslationOption(word.translations?.[0]) || word.meaning;
}

function countSharedBigrams(left, right) {
  const bigrams = new Set();
  for (let index = 0; index < left.length - 1; index += 1) {
    bigrams.add(left.slice(index, index + 2));
  }

  let matches = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    if (bigrams.has(right.slice(index, index + 2))) {
      matches += 1;
    }
  }
  return matches;
}

function wordShapeSimilarity(source, candidate) {
  const left = source.toLowerCase();
  const right = candidate.toLowerCase();
  if (!left || !right || left === right) {
    return Number.NEGATIVE_INFINITY;
  }

  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < left.length
    && suffix < right.length
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return (prefix * 4) + (suffix * 2) + (countSharedBigrams(left, right) * 3) - Math.abs(left.length - right.length);
}

function buildStageOneOptions(word) {
  const bestOption = primaryOptionText(word);
  const distractors = [];
  const usedTexts = new Set([bestOption]);
  const similarWords = state.words
    .filter((item) => item.id !== word.id)
    .map((item) => ({ item, score: wordShapeSimilarity(word.word, item.word) }))
    .sort((left, right) => right.score - left.score);

  for (const entry of similarWords) {
    const optionText = primaryOptionText(entry.item);
    if (!optionText || usedTexts.has(optionText)) {
      continue;
    }
    distractors.push({
      text: optionText,
      english: entry.item.word,
    });
    usedTexts.add(optionText);
    if (distractors.length === 3) {
      break;
    }
  }

  if (distractors.length < 3) {
    for (const item of shuffle(state.words.filter((entry) => entry.id !== word.id))) {
      const optionText = primaryOptionText(item);
      if (!optionText || usedTexts.has(optionText)) {
        continue;
      }
      distractors.push({
        text: optionText,
        english: item.word,
      });
      usedTexts.add(optionText);
      if (distractors.length === 3) {
        break;
      }
    }
  }

  while (distractors.length < 3) {
    distractors.push(`干扰项 ${distractors.length + 1}`);
  }

  return shuffle([
    { text: bestOption, english: word.word, correct: true },
    ...distractors.map((item) => ({
      text: typeof item === "string" ? item : item.text,
      english: typeof item === "string" ? "" : item.english,
      correct: false,
    })),
  ]);
}

function resetEntryCardState(entry) {
  entry.stageOneOptions = [];
  entry.stage1SelectedIndex = null;
  entry.stage2Choice = null;
  entry.stage2Judge = null;
  entry.stage3Choice = null;
}

function ensureStageOneOptions(entry, word) {
  if (!Array.isArray(entry.stageOneOptions) || entry.stageOneOptions.length !== 4) {
    entry.stageOneOptions = buildStageOneOptions(word);
  }
  return entry.stageOneOptions;
}

function sentenceTranslation(word) {
  return word.exampleCn || `暂未提供整句中文释义，可先结合该词释义“${word.meaning}”自行判断。`;
}

function stageChoiceLabel(choice) {
  if (choice === "know") {
    return "会";
  }
  if (choice === "fuzzy") {
    return "模糊";
  }
  if (choice === "dontKnow") {
    return "不会";
  }
  return "";
}

function moveEntryToQueueEnd(entry, nextStage, options = {}) {
  if (!uiState.round) {
    return;
  }

  entry.stage = nextStage;
  if (options.incrementAttempts) {
    entry.attempts += 1;
  }
  resetEntryCardState(entry);
  uiState.round.queue = uiState.round.queue.filter((item) => item.id !== entry.id);
  uiState.round.queue.push(entry);
  markQueueNextActive();
  persistRound();
  render();
}

function handleStageOneChoice(choiceIndex) {
  const entry = currentRoundEntry();
  const word = currentRoundWord();
  if (!entry || !word || entry.stage1SelectedIndex !== null) {
    return;
  }

  const options = ensureStageOneOptions(entry, word);
  if (!options[choiceIndex]) {
    return;
  }

  entry.stage1SelectedIndex = choiceIndex;
  persistRound();
  render();
}

function advanceStageOne() {
  const entry = currentRoundEntry();
  if (!entry) {
    return;
  }

  const selected = entry.stageOneOptions?.[entry.stage1SelectedIndex];
  if (!selected) {
    return;
  }

  if (selected.correct) {
    moveEntryToQueueEnd(entry, 2);
    return;
  }

  moveEntryToQueueEnd(entry, 1, { incrementAttempts: true });
}

function handleStageTwoChoice(choice) {
  const entry = currentRoundEntry();
  if (!entry || entry.stage2Choice) {
    return;
  }

  entry.stage2Choice = choice;
  persistRound();
  render();
}

function getStageTwoTarget(choice, result) {
  if (choice === "know" && result === "correct") {
    return { nextStage: 3, incrementAttempts: false };
  }

  if (choice === "dontKnow") {
    return { nextStage: 1, incrementAttempts: true };
  }

  if (choice === "fuzzy" && result === "wrong") {
    return { nextStage: 1, incrementAttempts: true };
  }

  return { nextStage: 2, incrementAttempts: false };
}

function handleStageTwoJudge(result) {
  const entry = currentRoundEntry();
  if (!entry || !entry.stage2Choice) {
    return;
  }

  entry.stage2Judge = result;
  const target = getStageTwoTarget(entry.stage2Choice, result);
  moveEntryToQueueEnd(entry, target.nextStage, { incrementAttempts: target.incrementAttempts });
}

function handleStageThreeChoice(choice) {
  const entry = currentRoundEntry();
  if (!entry || entry.stage3Choice) {
    return;
  }

  entry.stage3Choice = choice;
  persistRound();
  render();
}

async function advanceStageThree() {
  const entry = currentRoundEntry();
  if (!entry || !entry.stage3Choice) {
    return;
  }

  if (entry.stage3Choice === "know") {
    resetEntryCardState(entry);
    await completeWord(entry);
    render();
    return;
  }

  moveEntryToQueueEnd(entry, 1, { incrementAttempts: true });
}

function fallbackSentence(word) {
  return `During exam preparation, students often review the word "${word.word}" several times so they can connect it with the right meaning in context.`;
}

function renderRoundSummary() {
  const round = uiState.round;
  if (!round || round.size === 0) {
    return `
      <div class="empty-state">
        点击“背诵单词”或“复习单词”后，系统会按设置中的 n 值自动开始本轮练习。
      </div>
    `;
  }

  return `
    <div class="round-status">
      <span class="mastery-pill">模式：${round.mode === "memorize" ? "背诵新词" : "复习单词"}</span>
      <span class="mastery-pill">本轮抽词 ${round.size}</span>
      <span class="mastery-pill">已过关 ${round.completed.length}</span>
      <span class="mastery-pill">队列剩余 ${round.queue.length}</span>
    </div>
  `;
}

function renderRoundComplete() {
  els.studyCard.innerHTML = `
    ${renderRoundSummary()}
    <div class="empty-state success-state">
      本轮所有单词已完成三阶段流程。你可以继续开新一轮，或切换去生成文章 / 长句。
    </div>
  `;
}

function renderStudyCard() {
  els.studyTitle.textContent = uiState.studyMode === "review" ? "三阶段复习" : "三阶段背诵";

  if (!uiState.round || uiState.round.size === 0) {
    els.studyCard.innerHTML = renderRoundSummary();
    return;
  }

  if (uiState.round.queue.length === 0) {
    renderRoundComplete();
    return;
  }

  const entry = currentRoundEntry();
  const word = currentRoundWord();
  if (!entry || !word) {
    uiState.round.activeId = uiState.round.queue[0]?.id || null;
    persistRound();
    els.studyCard.innerHTML = renderRoundSummary();
    return;
  }

  const stageMap = {
    1: "阶段 1 · 看单词选出正确翻译和词性",
    2: "阶段 2 · 先判断自己懂不懂，再核对整句中文",
    3: "阶段 3 · 只看中文意思，回想对应英文",
  };

  let content = `${renderRoundSummary()}<p class="study-subcopy">${stageMap[entry.stage]} · 当前阶段处理完后会切到下一词，当前词按结果回到队列中继续流转。</p>`;

  if (entry.stage === 1) {
    const options = ensureStageOneOptions(entry, word);
    const answered = entry.stage1SelectedIndex !== null;
    content += `
      <h3 class="study-word">${escapeHtml(word.word)}</h3>
      <p class="study-meaning">请选择唯一正确的“词性 + 中文释义”。</p>
      <div class="option-grid">
        ${options.map((option, index) => `
          <button
            class="option-btn${answered && option.correct ? " is-correct" : ""}${answered && index === entry.stage1SelectedIndex && !option.correct ? " is-wrong" : ""}"
            data-choice-index="${index}"
            type="button"
            ${answered ? "disabled" : ""}
          >
            <span class="option-cn">${escapeHtml(option.text)}</span>
            ${answered ? `<span class="option-en">${escapeHtml(option.english || "")}</span>` : ""}
          </button>
        `).join("")}
      </div>
      ${answered ? `
        <div class="study-actions">
          <button class="primary-btn" id="stageOneNextBtn" type="button">下一词</button>
        </div>
      ` : ""}
    `;
  }

  if (entry.stage === 2) {
    const translationVisible = Boolean(entry.stage2Choice);
    content += `
      <h3 class="study-word">${escapeHtml(word.word)}</h3>
      <p class="study-meaning">${escapeHtml(word.exampleSentence || fallbackSentence(word))}</p>
      <p class="study-subcopy">先判断你对这句英文的理解程度。</p>
      ${translationVisible ? `
        <div class="study-reveal">
          <p class="study-reveal-label">你的判断：${stageChoiceLabel(entry.stage2Choice)}</p>
          <p class="study-reveal-text">${escapeHtml(sentenceTranslation(word))}</p>
        </div>
        <div class="study-actions">
          <button class="btn-know" data-stage2-judge="correct" type="button">正确</button>
          <button class="btn-forget" data-stage2-judge="wrong" type="button">错误</button>
        </div>
      ` : `
        <div class="study-actions">
          <button class="btn-know" data-stage2-choice="know" type="button">会</button>
          <button class="btn-neutral" data-stage2-choice="fuzzy" type="button">模糊</button>
          <button class="btn-forget" data-stage2-choice="dontKnow" type="button">不会</button>
        </div>
      `}
    `;
  }

  if (entry.stage === 3) {
    const revealed = Boolean(entry.stage3Choice);
    content += `
      <h3 class="study-word">${escapeHtml(word.meaning)}</h3>
      <p class="study-meaning">先不要看单词，判断你能不能从这个中文意思直接想到英文。</p>
      ${revealed ? `
        <div class="study-reveal">
          <p class="study-reveal-label">你的选择：${entry.stage3Choice === "know" ? "会" : "不会"}</p>
          <p class="study-reveal-word">${escapeHtml(word.word)}</p>
        </div>
        <div class="study-actions">
          <button class="primary-btn" id="stageThreeNextBtn" type="button">下一词</button>
        </div>
      ` : `
        <div class="study-actions">
          <button class="btn-know" data-stage3-choice="know" type="button">会</button>
          <button class="btn-forget" data-stage3-choice="dontKnow" type="button">不会</button>
        </div>
      `}
    `;
  }

  els.studyCard.innerHTML = content;

  if (entry.stage === 1) {
    els.studyCard.querySelectorAll("[data-choice-index]").forEach((button) => {
      button.addEventListener("click", () => {
        handleStageOneChoice(Number.parseInt(button.dataset.choiceIndex, 10));
      });
    });
    els.studyCard.querySelector("#stageOneNextBtn")?.addEventListener("click", advanceStageOne);
  }

  if (entry.stage === 2) {
    els.studyCard.querySelectorAll("[data-stage2-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        handleStageTwoChoice(button.dataset.stage2Choice);
      });
    });
    els.studyCard.querySelectorAll("[data-stage2-judge]").forEach((button) => {
      button.addEventListener("click", () => {
        handleStageTwoJudge(button.dataset.stage2Judge);
      });
    });
  }

  if (entry.stage === 3) {
    els.studyCard.querySelectorAll("[data-stage3-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        handleStageThreeChoice(button.dataset.stage3Choice);
      });
    });
    els.studyCard.querySelector("#stageThreeNextBtn")?.addEventListener("click", advanceStageThree);
  }
}

function markQueueNextActive() {
  uiState.round.activeId = uiState.round.queue[0]?.id || null;
  persistRound();
}

async function completeWord(entry) {
  await api("/api/review", {
    method: "POST",
    body: JSON.stringify({ id: entry.id, rating: "know" }),
  });

  uiState.round.completed.push({
    id: entry.id,
    completedAt: Date.now(),
  });
  uiState.round.queue = uiState.round.queue.filter((item) => item.id !== entry.id);
  markQueueNextActive();
  persistRound();
  await refreshState();
}

function renderAiOutputPlaceholder() {
  delete els.aiOutput.dataset.hasContent;
  els.aiOutput.innerHTML = `
    <p class="placeholder-copy">生成结果会出现在这里。系统会优先结合今天真正通过三阶段的词汇与已掌握基础词。</p>
  `;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderAiOutput(content) {
  els.aiOutput.dataset.hasContent = "true";
  const lines = content.split("\n");
  els.aiOutput.innerHTML = lines.map((line, index) => {
    const safe = escapeHtml(line);
    if (index === 0) {
      return `<h3>${safe}</h3>`;
    }
    if (line.startsWith("关键词：")) {
      return `<h4>${safe}</h4>`;
    }
    return `<p>${safe || "&nbsp;"}</p>`;
  }).join("");
}

function buildPromptPayload() {
  const todayWords = getTodayStudiedWords().slice(0, 8);
  const masteredWords = getMasteredWords().slice(0, 12);
  const topic = els.topicInput.value.trim() || "校园成长与学习能力";

  return {
    exam: state.settings.exam,
    examLabel: EXAM_LABELS[state.settings.exam],
    guidance: EXAM_GUIDANCE[state.settings.exam],
    outputType: state.settings.outputType,
    topic,
    todayWords,
    masteredWords,
  };
}

function buildOfflineContent(payload) {
  const todayWordText = payload.todayWords.map((item) => item.word).join(", ");
  const baseWordText = payload.masteredWords.map((item) => item.word).join(", ");

  if (payload.outputType === "sentence") {
    return [
      `${payload.examLabel} 长句练习`,
      `关键词：${todayWordText || "sustain, analyze"} | 基础词：${baseWordText || "effective, significant"}`,
      `主题：${payload.topic}`,
      `Although many students believe that improving English depends mainly on memorizing isolated words, a more ${payload.masteredWords[0]?.word || "effective"} approach is to ${payload.todayWords[0]?.word || "sustain"} daily practice, because this habit not only helps them ${payload.todayWords[1]?.word || "analyze"} complex ideas in reading tasks but also enables them to express ${payload.masteredWords[1]?.word || "significant"} opinions with greater confidence in exam writing.`,
      "用法提示：先拆主干，再定位 although 引导的让步逻辑和 because 引导的原因逻辑。",
    ].join("\n");
  }

  return [
    `${payload.examLabel} 短文练习`,
    `关键词：${todayWordText || "sustain, analyze, contribute"} | 基础词：${baseWordText || "effective, innovative"}`,
    `主题：${payload.topic}`,
    `In preparation for ${payload.examLabel}, students need more than a mechanical memory of vocabulary. When learners ${payload.todayWords[0]?.word || "sustain"} a steady review routine, they gradually turn passive knowledge into active expression. This process becomes even more ${payload.masteredWords[0]?.word || "effective"} when new words are recycled in meaningful contexts such as ${payload.topic}. For example, if a student can ${payload.todayWords[1]?.word || "analyze"} a social issue, explain its causes, and offer an ${payload.masteredWords[1]?.word || "innovative"} solution, the vocabulary learned that day is far more likely to remain available during reading and writing tasks. In this sense, a well-designed word-learning plan does not simply expand one's vocabulary size; it also ${payload.todayWords[2]?.word || "contribute"}s to clearer thinking and more convincing communication.`,
    "参考思路：这段短文适合做精读、仿写或中译英练习，可以把其中的连接词和长难句结构单独摘出来复盘。",
  ].join("\n");
}

async function generateWithApi(payload) {
  if (!state.settings.apiBase || !state.settings.apiKey || !state.settings.model) {
    throw new Error("API 模式需要填写 Base URL、API Key 和模型名称。");
  }

  const endpoint = `${state.settings.apiBase.replace(/\/$/, "")}/chat/completions`;
  const taskInstruction = payload.outputType === "sentence"
    ? "生成 1 句英文长句，并附 2 条中文学习提示。"
    : "生成 1 篇 120 到 180 词的英文短文，并附 3 条中文学习提示。";

  const body = {
    model: state.settings.model,
    messages: [
      {
        role: "system",
        content: "You are an English exam preparation coach. Generate exam-aligned content based on today's learned words and mastered base vocabulary. Output clean text with a title line, a keyword line beginning with 关键词：, then the English content, then Chinese learning tips.",
      },
      {
        role: "user",
        content: [
          `目标考试：${payload.examLabel}`,
          `考试要求：${payload.guidance}`,
          `输出形式：${payload.outputType === "sentence" ? "英文长句" : "英文短文"}`,
          `主题：${payload.topic}`,
          `今日过关词：${payload.todayWords.map((item) => `${item.word}(${item.meaning})`).join(", ") || "无"}`,
          `已掌握基础词：${payload.masteredWords.map((item) => `${item.word}(${item.meaning})`).join(", ") || "无"}`,
          taskInstruction,
          "尽量自然使用提供的词汇，难度符合目标考试，不要输出 JSON。",
        ].join("\n"),
      },
    ],
    temperature: 0.8,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API 调用失败：${response.status} ${detail}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "模型没有返回内容。";
}

async function generateContent() {
  const payload = buildPromptPayload();
  if (payload.todayWords.length === 0 && payload.masteredWords.length === 0) {
    window.alert("请先完成至少一个三阶段过关单词，或先导入并学习词库。");
    return;
  }

  els.generateBtn.disabled = true;
  els.generateBtn.textContent = "生成中...";
  try {
    const content = state.settings.generatorMode === "api"
      ? await generateWithApi(payload)
      : buildOfflineContent(payload);
    renderAiOutput(content);
  } catch (error) {
    renderAiOutput(`生成失败\n关键词：请检查配置\n${error.message}\n你也可以切回“离线演示”模式继续体验完整流程。`);
  } finally {
    els.generateBtn.disabled = false;
    els.generateBtn.textContent = "生成练习内容";
  }
}

async function syncSettingsFromInputs() {
  try {
    const boundExam = state.libraryMeta?.boundExam || null;
    const previousRoundSize = state.settings.roundSize;
    const roundSize = String(
      Math.max(1, Math.min(50, Number.parseInt(els.roundSizeInput.value || state.settings.roundSize, 10) || 8)),
    );
    const payload = {
      exam: boundExam || els.examSelect.value,
      generatorMode: els.generatorModeSelect.value,
      apiBase: els.apiBaseInput.value.trim(),
      apiKey: els.apiKeyInput.value.trim(),
      model: els.modelInput.value.trim(),
      outputType: state.settings.outputType,
      roundSize,
    };
    const data = await api("/api/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.settings = {
      ...state.settings,
      ...data.settings,
    };
    reconcileActiveRoundSize(previousRoundSize, state.settings.roundSize);
    render();
  } catch (error) {
    window.alert(error.message);
  }
}

async function addWord(word, meaning, tag) {
  const normalized = normalizeWord(word);
  if (!normalized || !meaning.trim()) {
    return;
  }

  await api("/api/words", {
    method: "POST",
    body: JSON.stringify({
      word: normalized,
      meaning: meaning.trim(),
      tag: tag.trim(),
    }),
  });
}

async function importDataset() {
  els.importDatasetBtn.disabled = true;
  els.importDatasetBtn.textContent = "导入中...";
  try {
    const result = await api("/api/import-dataset", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await refreshState();
    window.alert(`导入完成：新增 ${result.inserted} 个，跳过 ${result.skipped} 个。当前词库共 ${result.totalWords} 个，并已绑定到考研英语。`);
  } catch (error) {
    window.alert(error.message);
  } finally {
    els.importDatasetBtn.disabled = false;
    els.importDatasetBtn.textContent = "导入考研词库";
  }
}

async function seedWords() {
  try {
    for (const item of DEMO_LIBRARY) {
      try {
        await addWord(item.word, item.meaning, item.tag);
      } catch (error) {
        if (!error.message.includes("已经在词库里")) {
          throw error;
        }
      }
    }
    await refreshState();
  } catch (error) {
    window.alert(error.message);
  }
}

async function resetToday() {
  try {
    await api("/api/reset-today", {
      method: "POST",
      body: JSON.stringify({}),
    });
    uiState.round = null;
    persistRound();
    await refreshState();
  } catch (error) {
    window.alert(error.message);
  }
}

function openSettings() {
  uiState.settingsOpen = true;
  renderSettingsModal();
}

function closeSettings() {
  uiState.settingsOpen = false;
  renderSettingsModal();
}

function openAdmin() {
  uiState.adminOpen = true;
  render();
}

function closeAdmin() {
  uiState.adminOpen = false;
  renderAdminModal();
}

function unlockAdmin() {
  if (els.adminPasswordInput.value.trim() !== ADMIN_PASSWORD) {
    window.alert("管理员密码不正确。");
    return;
  }

  els.adminPasswordInput.value = "";
  closeSettings();
  openAdmin();
}

function enterApp() {
  uiState.appEntered = true;
  uiState.currentView = "home";
  els.entryScreen.hidden = true;
  render();
}

function goHome() {
  uiState.currentView = "home";
  render();
}

function bindEvents() {
  els.enterAppBtn.addEventListener("click", enterApp);
  els.memorizeBtn.addEventListener("click", () => startRound("memorize"));
  els.reviewBtn.addEventListener("click", () => startRound("review"));
  els.writeBtn.addEventListener("click", () => {
    uiState.currentView = "ai";
    render();
  });
  els.studyBackBtn.addEventListener("click", goHome);
  els.aiBackBtn.addEventListener("click", goHome);

  els.resetTodayBtn.addEventListener("click", resetToday);
  els.generateBtn.addEventListener("click", generateContent);

  els.openSettingsBtn.addEventListener("click", openSettings);
  els.closeSettingsBtn.addEventListener("click", closeSettings);
  els.closeAdminBtn.addEventListener("click", closeAdmin);

  els.settingsModal.addEventListener("click", (event) => {
    if (event.target === els.settingsModal) {
      closeSettings();
    }
  });

  els.adminModal.addEventListener("click", (event) => {
    if (event.target === els.adminModal) {
      closeAdmin();
    }
  });

  els.adminUnlockBtn.addEventListener("click", unlockAdmin);

  els.addWordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await addWord(els.wordInput.value, els.meaningInput.value, els.tagInput.value);
      els.addWordForm.reset();
      await refreshState();
    } catch (error) {
      window.alert(error.message);
    }
  });

  els.seedBtn.addEventListener("click", seedWords);
  els.importDatasetBtn.addEventListener("click", importDataset);

  [els.roundSizeInput, els.examSelect, els.generatorModeSelect, els.apiBaseInput, els.apiKeyInput, els.modelInput].forEach((input) => {
    input.addEventListener("change", syncSettingsFromInputs);
    input.addEventListener("blur", syncSettingsFromInputs);
  });

  els.segmentButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      state.settings.outputType = button.dataset.outputType;
      render();
      await syncSettingsFromInputs();
    });
  });
}

function render() {
  renderShellVisibility();
  renderModeBadge();
  renderStats();
  renderMainView();
  renderStudyCard();
  renderWordList();
  renderSettingsModal();
  renderAdminModal();

  els.segmentButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.outputType === state.settings.outputType);
  });

  if (!els.aiOutput.dataset.hasContent) {
    renderAiOutputPlaceholder();
  }
}

async function boot() {
  bindEvents();
  renderAiOutputPlaceholder();
  try {
    await refreshState();
  } catch (error) {
    els.studyCard.innerHTML = `<div class="empty-state">后端暂不可用：${escapeHtml(error.message)}。请先运行 python server.py。</div>`;
  }
}

boot();
