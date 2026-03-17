const STORAGE_KEY = "lexi-sprint-ai-state-v1";

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

const DEFAULT_STATE = {
  words: [],
  todayLog: [],
  settings: {
    exam: "cet4",
    generatorMode: "demo",
    apiBase: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    outputType: "sentence",
  },
};

const els = {
  statsGrid: document.querySelector("#statsGrid"),
  examSelect: document.querySelector("#examSelect"),
  generatorModeSelect: document.querySelector("#generatorModeSelect"),
  apiBaseInput: document.querySelector("#apiBaseInput"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  modelInput: document.querySelector("#modelInput"),
  modeBadge: document.querySelector("#modeBadge"),
  addWordForm: document.querySelector("#addWordForm"),
  wordInput: document.querySelector("#wordInput"),
  meaningInput: document.querySelector("#meaningInput"),
  tagInput: document.querySelector("#tagInput"),
  wordList: document.querySelector("#wordList"),
  seedBtn: document.querySelector("#seedBtn"),
  studyCard: document.querySelector("#studyCard"),
  resetTodayBtn: document.querySelector("#resetTodayBtn"),
  generateBtn: document.querySelector("#generateBtn"),
  topicInput: document.querySelector("#topicInput"),
  aiOutput: document.querySelector("#aiOutput"),
  wordItemTemplate: document.querySelector("#wordItemTemplate"),
  segmentButtons: Array.from(document.querySelectorAll(".segment")),
};

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return structuredClone(DEFAULT_STATE);
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: {
        ...structuredClone(DEFAULT_STATE).settings,
        ...(parsed.settings || {}),
      },
    };
  } catch (error) {
    console.warn("Failed to parse app state:", error);
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWord(input) {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureTodayLogFresh() {
  const today = getTodayDateKey();
  state.todayLog = (state.todayLog || []).filter((entry) => entry.date === today);
}

function seedWords() {
  const existing = new Set(state.words.map((item) => item.word));
  DEMO_LIBRARY.forEach((item) => {
    const normalized = normalizeWord(item.word);
    if (existing.has(normalized)) {
      return;
    }

    state.words.push({
      id: uid(),
      word: normalized,
      meaning: item.meaning.trim(),
      tag: item.tag.trim(),
      familiarity: 0,
      reviewCount: 0,
      nextDueAt: Date.now(),
      createdAt: Date.now(),
      lastReviewedAt: null,
    });
  });

  saveState();
  render();
}

function addWord(word, meaning, tag) {
  const normalized = normalizeWord(word);

  if (!normalized || !meaning.trim()) {
    return;
  }

  const exists = state.words.some((item) => item.word === normalized);
  if (exists) {
    window.alert("这个单词已经在词库里了。");
    return;
  }

  state.words.unshift({
    id: uid(),
    word: normalized,
    meaning: meaning.trim(),
    tag: tag.trim(),
    familiarity: 0,
    reviewCount: 0,
    nextDueAt: Date.now(),
    createdAt: Date.now(),
    lastReviewedAt: null,
  });

  saveState();
  render();
}

function deleteWord(id) {
  state.words = state.words.filter((item) => item.id !== id);
  state.todayLog = state.todayLog.filter((entry) => entry.wordId !== id);
  saveState();
  render();
}

function getDueWords() {
  const now = Date.now();
  return [...state.words]
    .filter((item) => item.nextDueAt <= now)
    .sort((a, b) => a.nextDueAt - b.nextDueAt || a.familiarity - b.familiarity);
}

function getNextWord() {
  const dueWords = getDueWords();
  if (dueWords.length > 0) {
    return dueWords[0];
  }

  if (state.words.length === 0) {
    return null;
  }

  return [...state.words].sort((a, b) => a.familiarity - b.familiarity || a.reviewCount - b.reviewCount)[0];
}

function reviewWord(id, rating) {
  const word = state.words.find((item) => item.id === id);
  if (!word) {
    return;
  }

  const now = Date.now();
  const intervals = {
    know: 3,
    vague: 1,
    forget: 0,
  };

  const familiarityChange = {
    know: 2,
    vague: 1,
    forget: -1,
  };

  word.familiarity = Math.max(0, Math.min(10, word.familiarity + familiarityChange[rating]));
  word.reviewCount += 1;
  word.lastReviewedAt = now;

  const delayDays = intervals[rating];
  const delayHours = rating === "forget" ? 8 : delayDays * 24;
  word.nextDueAt = now + delayHours * 60 * 60 * 1000;

  ensureTodayLogFresh();
  state.todayLog.unshift({
    id: uid(),
    date: getTodayDateKey(),
    wordId: word.id,
    word: word.word,
    meaning: word.meaning,
    rating,
    familiarityAfter: word.familiarity,
    reviewedAt: now,
  });

  saveState();
  render();
}

function getMasteredWords() {
  return state.words.filter((item) => item.familiarity >= 6);
}

function getTodayStudiedWords() {
  ensureTodayLogFresh();
  const seen = new Set();
  return state.todayLog.filter((entry) => {
    if (seen.has(entry.wordId)) {
      return false;
    }
    seen.add(entry.wordId);
    return true;
  });
}

function getStats() {
  const todayWords = getTodayStudiedWords();
  const mastered = getMasteredWords();
  const due = getDueWords();
  const totalReviews = state.words.reduce((sum, item) => sum + item.reviewCount, 0);

  return [
    { label: "词库总量", value: state.words.length },
    { label: "今日已学", value: todayWords.length },
    { label: "已掌握", value: mastered.length },
    { label: "待复习", value: due.length },
    { label: "总复习次数", value: totalReviews },
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
  const stats = getStats();
  els.statsGrid.innerHTML = "";

  stats.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.style.animationDelay = `${index * 60}ms`;
    card.innerHTML = `<strong>${item.value}</strong><span>${item.label}</span>`;
    els.statsGrid.appendChild(card);
  });
}

function renderWordList() {
  els.wordList.innerHTML = "";

  if (state.words.length === 0) {
    els.wordList.innerHTML = '<div class="empty-state">词库还是空的。你可以手动添加，或者先载入一组示例词。</div>';
    return;
  }

  const sorted = [...state.words].sort((a, b) => b.createdAt - a.createdAt);
  sorted.forEach((item) => {
    const fragment = els.wordItemTemplate.content.cloneNode(true);
    fragment.querySelector(".word-text").textContent = item.word;
    fragment.querySelector(".mastery-pill").textContent = masteryLabel(item.familiarity);
    fragment.querySelector(".word-meaning").textContent = item.meaning;
    fragment.querySelector(".word-meta").textContent =
      `标签：${item.tag || "未分类"} · 熟悉度：${item.familiarity}/10 · 复习 ${item.reviewCount} 次`;

    fragment.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteWord(item.id);
    });

    els.wordList.appendChild(fragment);
  });
}

function renderStudyCard() {
  const nextWord = getNextWord();

  if (!nextWord) {
    els.studyCard.innerHTML = `
      <div class="empty-state">
        还没有学习任务。先在上方加入词汇，系统就会开始安排今日复习。
      </div>
    `;
    return;
  }

  const todayWords = getTodayStudiedWords();
  els.studyCard.innerHTML = `
    <p class="study-subcopy">系统优先展示应复习词，其次补充低熟悉度词。今日已处理 ${todayWords.length} 个单词。</p>
    <h3 class="study-word">${nextWord.word}</h3>
    <p class="study-meaning">${nextWord.meaning}</p>
    <p class="study-subcopy">标签：${nextWord.tag || "未分类"} · 当前熟悉度：${nextWord.familiarity}/10 · 已复习 ${nextWord.reviewCount} 次</p>
    <div class="study-actions">
      <button class="btn-know" data-rate="know">认识</button>
      <button class="btn-vague" data-rate="vague">模糊</button>
      <button class="btn-forget" data-rate="forget">不认识</button>
    </div>
  `;

  els.studyCard.querySelectorAll("[data-rate]").forEach((button) => {
    button.addEventListener("click", () => {
      reviewWord(nextWord.id, button.dataset.rate);
    });
  });
}

function renderAiOutputPlaceholder() {
  els.aiOutput.innerHTML = `
    <p class="placeholder-copy">生成结果会出现在这里。系统会优先结合今日新词与已掌握基础词，尽量贴近你的考试语境。</p>
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
  const lines = content.split("\n");
  els.aiOutput.innerHTML = lines
    .map((line, index) => {
      const safe = escapeHtml(line);
      if (index === 0) {
        return `<h3>${safe}</h3>`;
      }
      if (line.startsWith("关键词：")) {
        return `<h4>${safe}</h4>`;
      }
      return `<p>${safe || "&nbsp;"}</p>`;
    })
    .join("");
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
    const sentence = `Although many students believe that improving English depends mainly on memorizing isolated words, a more ${payload.masteredWords[0]?.word || "effective"} approach is to ${payload.todayWords[0]?.word || "sustain"} daily practice, because this habit not only helps them ${payload.todayWords[1]?.word || "analyze"} complex ideas in reading tasks but also enables them to express ${payload.masteredWords[1]?.word || "significant"} opinions with greater confidence in exam writing.`;

    return [
      `${payload.examLabel} 长句练习`,
      `关键词：${todayWordText || "sustain, analyze"} | 基础词：${baseWordText || "effective, significant"}`,
      `主题：${payload.topic}`,
      sentence,
      "用法提示：先拆主干，再定位 although 引导的让步逻辑和 because 引导的原因逻辑。",
    ].join("\n");
  }

  const paragraph = [
    `In preparation for ${payload.examLabel}, students need more than a mechanical memory of vocabulary. When learners ${payload.todayWords[0]?.word || "sustain"} a steady review routine, they gradually turn passive knowledge into active expression. This process becomes even more ${payload.masteredWords[0]?.word || "effective"} when new words are recycled in meaningful contexts such as ${payload.topic}. For example, if a student can ${payload.todayWords[1]?.word || "analyze"} a social issue, explain its causes, and offer an ${payload.masteredWords[1]?.word || "innovative"} solution, the vocabulary learned that day is far more likely to remain available during reading and writing tasks. In this sense, a well-designed word-learning plan does not simply expand one's vocabulary size; it also ${payload.todayWords[2]?.word || "contribute"}s to clearer thinking and more convincing communication.`,
      "参考思路：这段短文适合做精读、仿写或中译英练习，可以把其中的连接词和长难句结构单独摘出来复盘。",
    ];

  return [
    `${payload.examLabel} 短文练习`,
    `关键词：${todayWordText || "sustain, analyze, contribute"} | 基础词：${baseWordText || "effective, innovative"}`,
    `主题：${payload.topic}`,
    ...paragraph,
  ].join("\n");
}

async function generateWithApi(payload) {
  if (!state.settings.apiBase || !state.settings.apiKey || !state.settings.model) {
    throw new Error("API 模式需要填写 Base URL、API Key 和模型名称。");
  }

  const endpoint = `${state.settings.apiBase.replace(/\/$/, "")}/chat/completions`;
  const taskInstruction =
    payload.outputType === "sentence"
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
          `今日学习词：${payload.todayWords.map((item) => `${item.word}(${item.meaning})`).join(", ") || "无"}`,
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
    window.alert("请先学习几个单词，或者先载入示例词库后完成一轮复习。");
    return;
  }

  els.generateBtn.disabled = true;
  els.generateBtn.textContent = "生成中...";

  try {
    const content =
      state.settings.generatorMode === "api"
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

function syncSettingsFromInputs() {
  state.settings.exam = els.examSelect.value;
  state.settings.generatorMode = els.generatorModeSelect.value;
  state.settings.apiBase = els.apiBaseInput.value.trim();
  state.settings.apiKey = els.apiKeyInput.value.trim();
  state.settings.model = els.modelInput.value.trim();
  saveState();
  renderModeBadge();
  renderStats();
}

function renderModeBadge() {
  els.modeBadge.textContent = state.settings.generatorMode === "api" ? "API 模式" : "演示模式";
}

function renderSettings() {
  els.examSelect.value = state.settings.exam;
  els.generatorModeSelect.value = state.settings.generatorMode;
  els.apiBaseInput.value = state.settings.apiBase;
  els.apiKeyInput.value = state.settings.apiKey;
  els.modelInput.value = state.settings.model;
  renderModeBadge();

  els.segmentButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.outputType === state.settings.outputType);
  });
}

function resetToday() {
  state.todayLog = [];
  saveState();
  render();
}

function bindEvents() {
  els.addWordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addWord(els.wordInput.value, els.meaningInput.value, els.tagInput.value);
    els.addWordForm.reset();
  });

  els.seedBtn.addEventListener("click", seedWords);
  els.resetTodayBtn.addEventListener("click", resetToday);
  els.generateBtn.addEventListener("click", generateContent);

  [els.examSelect, els.generatorModeSelect, els.apiBaseInput, els.apiKeyInput, els.modelInput].forEach((input) => {
    input.addEventListener("change", syncSettingsFromInputs);
    input.addEventListener("blur", syncSettingsFromInputs);
  });

  els.segmentButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.outputType = button.dataset.outputType;
      saveState();
      renderSettings();
    });
  });
}

function render() {
  ensureTodayLogFresh();
  renderSettings();
  renderStats();
  renderWordList();
  renderStudyCard();

  if (!els.aiOutput.dataset.hasContent) {
    renderAiOutputPlaceholder();
  }
}

const originalRenderAiOutput = renderAiOutput;
renderAiOutput = function patchedRenderAiOutput(content) {
  els.aiOutput.dataset.hasContent = "true";
  originalRenderAiOutput(content);
};

const originalRenderAiOutputPlaceholder = renderAiOutputPlaceholder;
renderAiOutputPlaceholder = function patchedRenderAiOutputPlaceholder() {
  delete els.aiOutput.dataset.hasContent;
  originalRenderAiOutputPlaceholder();
};

bindEvents();
render();
