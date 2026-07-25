const CHAPTER_RANGES = {
  1: [1, 17],
  2: [18, 58],
  3: [59, 138],
  4: [139, 162],
  5: [163, 205],
  6: [206, 237],
};

const REACTION_SECONDS = 5;
const EDIT_KEY = "vquiz_vpoint_edits_v2";

let words = [];
let settings = {
  mode: "multiple",
  selectedChapter: "all",
  customRangeActive: false,
  start: 1,
  end: 237,
  count: 15,
};

let pool = [];
let questions = [];
let currentIndex = 0;
let score = 0;
let missed = [];
let reactionFrameId = null;
let reactionRunId = 0;
let timerRemaining = REACTION_SECONDS;
let reactionRated = false;
let vPointEdits = loadEdits();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);


async function removeOldPwaState() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.toLowerCase().includes("vquiz"))
          .map((key) => caches.delete(key))
      );
    }
  } catch (error) {
    console.warn("Old PWA cleanup skipped:", error);
  }
}

async function init() {
  try {
    await removeOldPwaState();
    const response = await fetch("data/words.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    words = await response.json();
    validateWords(words);
    bindEvents();
    updateModeDescription();
    syncRangeFromChapter();
    updatePoolInfo();
  } catch (error) {
    console.error(error);
    alert("단어 데이터를 불러오지 못했어. Live Server로 실행했는지 확인해줘.");
  }
}

function validateWords(items) {
  if (!Array.isArray(items) || items.length !== 237) {
    throw new Error(`words.json expected 237 items, got ${items?.length ?? "invalid"}`);
  }
}

function updateModeDescription() {
  const el = $("#modeDescription");
  if (!el) return;
  el.textContent = settings.mode === "reaction"
    ? "5초 동안 떠올린 뒤 뜻과 V Point를 확인"
    : "뜻을 보고 정답을 고르는 기본 퀴즈";
}

function bindEvents() {
  $$("#modeSelector .segment").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearReactionTimer();
      settings.mode = button.dataset.mode;
      $$("#modeSelector .segment").forEach((b) => b.classList.toggle("active", b === button));
      updateModeDescription();
    });
  });

  $$("#chapterGrid .chapter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      settings.selectedChapter = button.dataset.chapter;
      settings.customRangeActive = false;
      $$("#chapterGrid .chapter-chip").forEach((b) => b.classList.toggle("active", b === button));
      $(".range-card").classList.remove("custom-active");
      syncRangeFromChapter();
      updatePoolInfo();
    });
  });

  ["rangeStart", "rangeEnd"].forEach((id) => {
    const input = $(`#${id}`);

    // While the user is typing, keep the raw value exactly as entered.
    input.addEventListener("input", onCustomRangeInput);

    // Validate only after editing is finished.
    input.addEventListener("blur", () => {
      validateRangeInputs({ focusInvalid: false });
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        validateRangeInputs({ focusInvalid: true });
        input.blur();
      }
    });
  });

  $$("#countSelector .count-chip").forEach((button) => {
    button.addEventListener("click", () => {
      settings.count = Number(button.dataset.count);
      $$("#countSelector .count-chip").forEach((b) => b.classList.toggle("active", b === button));
      updatePoolInfo();
    });
  });

  $("#startBtn").addEventListener("click", (event) => {
    event.preventDefault();
    try {
      startQuiz();
    } catch (error) {
      console.error("V Quiz start error:", error);
      alert("퀴즈 시작 중 오류가 났어. 새로고침 후 다시 눌러줘.");
    }
  });
  $("#exitBtn").addEventListener("click", exitQuiz);
  $("#revealNowBtn").addEventListener("click", (event) => {
    event.preventDefault();
    revealReactionAnswer(reactionRunId);
  });
  $("#nextBtn").addEventListener("click", goNext);
  $("#knewBtn").addEventListener("click", () => rateReaction(true));
  $("#forgotBtn").addEventListener("click", () => rateReaction(false));
  $("#retryBtn").addEventListener("click", startQuiz);
  $("#homeBtn").addEventListener("click", () => showScreen("homeScreen"));

  $("#editVPointBtn").addEventListener("click", openVPointEditor);
  $("#saveVPointBtn").addEventListener("click", saveVPointEdit);
  $("#cancelVPointBtn").addEventListener("click", closeVPointEditor);
  $("#resetVPointBtn").addEventListener("click", resetVPointEdit);
}

function onCustomRangeInput() {
  settings.customRangeActive = true;
  settings.selectedChapter = null;
  $$("#chapterGrid .chapter-chip").forEach((b) => b.classList.remove("active"));
  $(".range-card").classList.add("custom-active");

  // Do not swap, clamp, or rewrite values while typing.
  updateRangeDraftState();
}

function readRangeDraft() {
  const startRaw = $("#rangeStart").value.trim();
  const endRaw = $("#rangeEnd").value.trim();

  const start = Number.parseInt(startRaw, 10);
  const end = Number.parseInt(endRaw, 10);

  const complete =
    startRaw !== "" &&
    endRaw !== "" &&
    Number.isFinite(start) &&
    Number.isFinite(end);

  const inBounds =
    complete &&
    start >= 1 && start <= 237 &&
    end >= 1 && end <= 237;

  const ordered = inBounds && start <= end;

  return { startRaw, endRaw, start, end, complete, inBounds, ordered };
}

function updateRangeDraftState() {
  const draft = readRangeDraft();
  const note = $(".range-note");
  const card = $(".range-card");
  const startBtn = $("#startBtn");

  card.classList.remove("range-invalid");
  note.classList.remove("range-error");

  if (!draft.complete) {
    $("#rangeHint").textContent = "입력 중";
    note.textContent = "원하는 번호를 편하게 입력해. 입력이 끝난 뒤 범위를 확인할게.";
    startBtn.disabled = true;
    updatePoolInfoDraft(draft);
    return;
  }

  $("#rangeHint").textContent = `${draft.start}–${draft.end}`;

  if (!draft.inBounds) {
    card.classList.add("range-invalid");
    note.classList.add("range-error");
    note.textContent = "1번부터 237번 사이의 숫자를 입력해줘.";
    startBtn.disabled = true;
    updatePoolInfoDraft(draft);
    return;
  }

  if (!draft.ordered) {
    card.classList.add("range-invalid");
    note.classList.add("range-error");
    note.textContent = "입력 중에는 괜찮아. 끝 번호가 시작 번호 이상이 되면 자동으로 정상 범위가 돼.";
    startBtn.disabled = true;
    updatePoolInfoDraft(draft);
    return;
  }

  settings.start = draft.start;
  settings.end = draft.end;
  note.textContent = "숫자를 바꾸면 챕터 선택보다 직접 범위가 우선돼.";
  startBtn.disabled = false;
  updatePoolInfoDraft(draft);
}

function validateRangeInputs({ focusInvalid = false } = {}) {
  const draft = readRangeDraft();

  if (!draft.complete || !draft.inBounds || !draft.ordered) {
    updateRangeDraftState();

    if (focusInvalid) {
      if (!draft.complete || !draft.inBounds || draft.start > draft.end) {
        const target = draft.start > draft.end ? $("#rangeEnd") : $("#rangeStart");
        target.focus();
        target.select();
      }
    }
    return false;
  }

  settings.start = draft.start;
  settings.end = draft.end;

  // Normalize only once the range is valid.
  $("#rangeStart").value = String(draft.start);
  $("#rangeEnd").value = String(draft.end);
  $("#rangeHint").textContent = `${draft.start}–${draft.end}`;
  $("#startBtn").disabled = false;

  const note = $(".range-note");
  $(".range-card").classList.remove("range-invalid");
  note.classList.remove("range-error");
  note.textContent = "숫자를 바꾸면 챕터 선택보다 직접 범위가 우선돼.";

  updatePoolInfo();
  return true;
}

function finalizeRangeInputs() {
  return validateRangeInputs({ focusInvalid: false });
}

function updatePoolInfoDraft(draft) {
  if (!words.length) return;

  if (!draft.complete || !draft.inBounds || !draft.ordered) {
    $("#poolInfo").textContent = "범위를 입력하는 중";
    return;
  }

  const currentPool = words.filter(
    (item) => item.id >= draft.start && item.id <= draft.end
  );
  const count = Math.min(settings.count, currentPool.length);
  $("#poolInfo").textContent = `출제 가능 ${currentPool.length}개 · 이번 퀴즈 ${count}문제`;
}

function syncRangeFromChapter() {
  let start = 1;
  let end = 237;
  if (settings.selectedChapter !== "all") {
    [start, end] = CHAPTER_RANGES[Number(settings.selectedChapter)];
  }
  settings.start = start;
  settings.end = end;
  $("#rangeStart").value = start;
  $("#rangeEnd").value = end;
  $("#rangeHint").textContent = `${start}–${end}`;
}

function getCurrentPool() {
  return words.filter((item) => item.id >= settings.start && item.id <= settings.end);
}

function updatePoolInfo() {
  if (!words.length) return;

  if (settings.customRangeActive) {
    const draft = readRangeDraft();
    if (!draft.complete || !draft.inBounds || !draft.ordered) {
      updatePoolInfoDraft(draft);
      return;
    }
    settings.start = draft.start;
    settings.end = draft.end;
  }

  const currentPool = getCurrentPool();
  const count = Math.min(settings.count, currentPool.length);
  $("#poolInfo").textContent = `출제 가능 ${currentPool.length}개 · 이번 퀴즈 ${count}문제`;
}

function startQuiz() {
  clearReactionTimer();

  // Validate the visible custom range only when the user actually starts the quiz.
  if (settings.customRangeActive && !validateRangeInputs({ focusInvalid: true })) {
    return;
  }

  pool = getCurrentPool();
  if (!pool.length) {
    alert("출제할 단어가 없어. 범위를 다시 확인해줘.");
    return;
  }

  const questionCount = Math.min(settings.count, pool.length);
  questions = shuffle(pool).slice(0, questionCount);
  currentIndex = 0;
  score = 0;
  missed = [];
  reactionRated = false;

  showScreen("quizScreen");
  renderQuestion();
}

function renderQuestion() {
  clearReactionTimer();
  closeVPointEditor();

  const q = questions[currentIndex];
  const isReaction = settings.mode === "reaction";

  $("#progressText").textContent = `${currentIndex + 1} / ${questions.length}`;
  $("#progressBar").style.width = `${(currentIndex / questions.length) * 100}%`;
  $("#wordNumber").textContent = `NO. ${String(q.id).padStart(3, "0")}`;
  $("#wordDisplay").textContent = q.word;

  $("#multipleArea").classList.toggle("hidden", isReaction);
  $("#reactionArea").classList.toggle("hidden", !isReaction);
  $("#answerPanel").classList.add("hidden");
  $("#reactionRating").classList.add("hidden");
  $("#nextBtn").classList.add("hidden");
  $("#knewBtn").classList.remove("selected");
  $("#forgotBtn").classList.remove("selected");
  reactionRated = false;

  if (isReaction) {
    startReactionTimer();
  } else {
    renderChoices(q);
  }
}

function renderChoices(q) {
  const choicesBox = $("#choices");
  choicesBox.innerHTML = "";

  // Important: distractors come only from the currently selected range.
  const distractors = shuffle(pool.filter((item) => item.id !== q.id))
    .slice(0, 3)
    .map((item) => item.meaning);

  const options = shuffle([q.meaning, ...distractors]);

  options.forEach((meaning) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.textContent = meaning;
    button.addEventListener("click", () => answerMultiple(button, meaning === q.meaning));
    choicesBox.appendChild(button);
  });
}

function answerMultiple(selectedButton, correct) {
  const q = questions[currentIndex];

  $$("#choices .choice").forEach((button) => {
    button.disabled = true;
    if (button.textContent === q.meaning) button.classList.add("correct");
  });

  if (correct) {
    score += 1;
  } else {
    selectedButton.classList.add("wrong");
    missed.push(q);
  }

  revealAnswer();
  $("#nextBtn").classList.remove("hidden");
}

function startReactionTimer() {
  clearReactionTimer();

  const runId = ++reactionRunId;
  const startedAt = performance.now();
  const durationMs = REACTION_SECONDS * 1000;

  timerRemaining = REACTION_SECONDS;
  $("#timerText").textContent = String(timerRemaining);

  const frame = (now) => {
    // Ignore any stale animation callback from an older question.
    if (runId !== reactionRunId || settings.mode !== "reaction") return;

    const elapsed = now - startedAt;
    const remainingMs = Math.max(0, durationMs - elapsed);
    const seconds = Math.ceil(remainingMs / 1000);

    if (seconds !== timerRemaining) {
      timerRemaining = seconds;
      $("#timerText").textContent = String(seconds);
    }

    if (elapsed >= durationMs) {
      reactionFrameId = null;
      revealReactionAnswer(runId);
      return;
    }

    reactionFrameId = requestAnimationFrame(frame);
  };

  reactionFrameId = requestAnimationFrame(frame);
}

function revealReactionAnswer(expectedRunId = reactionRunId) {
  // Prevent a stale callback from revealing a later question.
  if (expectedRunId !== reactionRunId) return;

  clearReactionTimer(false);

  const reactionArea = $("#reactionArea");
  const answerPanel = $("#answerPanel");
  const rating = $("#reactionRating");

  if (!reactionArea || !answerPanel || !rating) return;

  reactionArea.classList.add("hidden");
  revealAnswer();
  rating.classList.remove("hidden");
}

function rateReaction(knew) {
  if (reactionRated) return;
  reactionRated = true;

  const q = questions[currentIndex];
  if (knew) {
    score += 1;
    $("#knewBtn").classList.add("selected");
  } else {
    missed.push(q);
    $("#forgotBtn").classList.add("selected");
  }

  $("#knewBtn").disabled = true;
  $("#forgotBtn").disabled = true;
  $("#nextBtn").classList.remove("hidden");
}

function revealAnswer() {
  const q = questions[currentIndex];
  $("#meaningDisplay").textContent = q.meaning;
  $("#vPointDisplay").textContent = getEffectiveVPoint(q);
  $("#answerPanel").classList.remove("hidden");
}

function goNext() {
  $("#knewBtn").disabled = false;
  $("#forgotBtn").disabled = false;

  currentIndex += 1;
  if (currentIndex >= questions.length) {
    finishQuiz();
  } else {
    renderQuestion();
  }
}

function finishQuiz() {
  clearReactionTimer();
  $("#progressBar").style.width = "100%";
  showScreen("resultScreen");

  $("#scoreDisplay").textContent = `${score} / ${questions.length}`;
  $("#resultMessage").textContent =
    settings.mode === "reaction"
      ? "스스로 알고 있었다고 체크한 개수"
      : "맞힌 문제 수";

  const missedList = $("#missedList");
  missedList.innerHTML = "";

  if (!missed.length) {
    const p = document.createElement("p");
    p.className = "result-message";
    p.textContent = "놓친 단어 없음.";
    missedList.appendChild(p);
    return;
  }

  missed.forEach((item) => {
    const row = document.createElement("div");
    row.className = "missed-item";
    row.innerHTML = `
      <span class="missed-num">${String(item.id).padStart(3, "0")}</span>
      <span class="missed-word"></span>
      <span class="missed-meaning"></span>
    `;
    row.querySelector(".missed-word").textContent = item.word;
    row.querySelector(".missed-meaning").textContent = item.meaning;
    missedList.appendChild(row);
  });
}

function exitQuiz() {
  clearReactionTimer();
  showScreen("homeScreen");
}

function showScreen(id) {
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

function clearReactionTimer(invalidate = true) {
  if (reactionFrameId !== null) {
    cancelAnimationFrame(reactionFrameId);
    reactionFrameId = null;
  }

  if (invalidate) {
    reactionRunId += 1;
  }
}

function openVPointEditor() {
  const q = questions[currentIndex];
  $("#vPointInput").value = getEffectiveVPoint(q);
  $("#vPointDisplay").classList.add("hidden");
  $("#vPointEditor").classList.remove("hidden");
}

function closeVPointEditor() {
  $("#vPointDisplay").classList.remove("hidden");
  $("#vPointEditor").classList.add("hidden");
}

function saveVPointEdit() {
  const q = questions[currentIndex];
  const value = $("#vPointInput").value.trim();
  if (!value) return;

  vPointEdits[String(q.id)] = value;
  persistEdits();
  $("#vPointDisplay").textContent = value;
  closeVPointEditor();
}

function resetVPointEdit() {
  const q = questions[currentIndex];
  delete vPointEdits[String(q.id)];
  persistEdits();
  $("#vPointDisplay").textContent = q.vPoint;
  $("#vPointInput").value = q.vPoint;
  closeVPointEditor();
}

function getEffectiveVPoint(q) {
  return vPointEdits[String(q.id)] ?? q.vPoint;
}

function loadEdits() {
  try {
    return JSON.parse(localStorage.getItem(EDIT_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistEdits() {
  localStorage.setItem(EDIT_KEY, JSON.stringify(vPointEdits));
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}


window.addEventListener("error", (event) => {
  console.error("V Quiz runtime error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("V Quiz promise error:", event.reason);
});
