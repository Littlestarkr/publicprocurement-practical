/* =====================================================================
 * 모의고사 앱: 회차 목록 → 시험 → 결과/해설 → 구글시트 전송
 *   index.html            → 회차 목록 (exams/manifest.json)
 *   index.html?exam=exam02 → exams/exam02.json 로 시험 시작
 * ===================================================================== */
(function () {
  "use strict";
  const SITE = window.SITE || {};
  const Eng = window.ExamEngine;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = $("#app");

  /* ---------- 공통 ---------- */
  function setHeader(title, sub, showBack) {
    $("#siteTitle").textContent = title || SITE.title || "모의고사";
    $("#siteSub").textContent = sub || "";
    $("#backLink").classList.toggle("hidden", !showBack);
    document.title = (title || SITE.title || "모의고사");
  }
  function showError(msg) {
    app.innerHTML = `<div class="card error">${msg}</div><div class="center"><a class="btn secondary" href="./">회차 목록으로</a></div>`;
  }
  async function loadJson(path) {
    let res;
    try { res = await fetch(path, { cache: "no-cache" }); }
    catch (e) {
      throw new Error(location.protocol === "file:"
        ? "파일을 직접 열면(file://) 문제 파일을 읽을 수 없습니다. GitHub Pages 주소로 접속하거나, 폴더의 <b>run-local.bat</b>으로 실행하세요."
        : "문제 파일을 불러오지 못했습니다: " + esc(path));
    }
    if (!res.ok) throw new Error("문제 파일을 찾을 수 없습니다: " + esc(path));
    try { return await res.json(); }
    catch (e) { throw new Error("문제 파일의 JSON 형식이 올바르지 않습니다 (" + esc(path) + "). 쉼표·따옴표를 확인하세요."); }
  }

  /* ---------- 1) 회차 목록 ---------- */
  async function renderList() {
    setHeader(SITE.title, SITE.subtitle, false);
    try {
      const m = await loadJson("exams/manifest.json");
      const list = (m.exams || []);
      if (!list.length) { app.innerHTML = '<div class="card notice">등록된 회차가 없습니다.</div>'; return; }
      app.innerHTML = '<div class="exam-list">' + list.map(e =>
        `<a class="exam-card" href="?exam=${encodeURIComponent(e.id)}">
           <h3>${esc(e.title)}</h3><p>${esc(e.description || "")}</p><span class="go">응시하기 →</span></a>`).join("") + "</div>" +
        `<footer class="foot">${esc(SITE.footer || "")}</footer>`;
    } catch (e) { showError(e.message); }
  }

  /* ---------- 2) 시험 ---------- */
  let exam, examId, timerId = null, submitting = false;
  const DRAFT = () => "draft_" + examId;

  function validateExam(ex) {
    if (!ex || !Array.isArray(ex.questions) || !ex.questions.length) return "questions 배열이 비어 있습니다.";
    for (let i = 0; i < ex.questions.length; i++) {
      const q = ex.questions[i], n = i + 1;
      const type = q.type || "essay";
      if (!q.question) return `${n}번 문항: question(문제)이 없습니다.`;
      if (type === "essay" && !(q.answer || (q.rubric && q.rubric.length))) return `${n}번 문항: answer(모범답안)이 없습니다.`;
      if (type === "short" && !(q.parts && q.parts.length)) return `${n}번 문항: parts(소문항)가 없습니다.`;
      if (type === "choice" && !(q.choices && q.choices.length && q.answer != null)) return `${n}번 문항: choices(보기)와 answer(정답)가 필요합니다.`;
    }
    return null;
  }

  async function renderExam(id) {
    examId = id;
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return showError("잘못된 회차 주소입니다.");
    try { exam = await loadJson(`exams/${id}.json`); }
    catch (e) { return showError(e.message); }
    const err = validateExam(exam);
    if (err) return showError("문제 파일 오류: " + esc(err));
    Eng.normalizeExam(exam);
    exam.id = exam.id || id;
    setHeader(exam.title, exam.subtitle, true);

    const multi = exam.questions.some(q => q.type === "choice");
    let html = `<div class="card notice"><b>응시 안내</b><ul>
      <li>각 문항에 답안을 작성한 뒤 맨 아래 <b>[답안 제출]</b>을 누르면 자동 채점됩니다.</li>
      <li>서술형은 모범답안의 <b>핵심 채점요소</b> 포함 여부로 채점하며, 정확한 용어가 없어도 <b>같은 취지의 표현</b>이 있으면 부분점수를 인정합니다.</li>
      <li>단답형은 소문항별로 채점합니다. 숫자는 단위까지 쓰는 것을 권장합니다(예: 3,000만 원, 0.05%).</li>
      ${multi ? "<li>객관식은 보기를 선택하세요.</li>" : ""}
      <li>합격 기준: 총점 ${exam.pass.percent}% 이상${exam.pass.subjectMinPercent ? `, 과목별 ${exam.pass.subjectMinPercent}% 이상` : ""}${exam.timeLimitMin ? ` · 제한시간 ${exam.timeLimitMin}분` : ""}</li>
      <li>작성 중인 답안은 이 브라우저에 임시 저장됩니다. 제출 시 답안과 점수가 출제자에게 기록됩니다.</li></ul></div>
      <div class="card"><label class="field" for="examineeName">이름 또는 닉네임 (선택)</label>
      <input type="text" id="examineeName" maxlength="30" placeholder="예: 조달왕"></div>`;

    let prevSection = null;
    exam.questions.forEach(q => {
      if (q.section && q.section !== prevSection) html += `<div class="section-title">${esc(q.section)}</div>`;
      prevSection = q.section || prevSection;
      const no = String(q.no).padStart(2, "0");
      const typeLabel = q.type === "short" ? "단답형" : q.type === "choice" ? "객관식" : "약술형";
      html += `<div class="card" id="q${q.no}"><div class="q-head"><span class="q-no">문제 ${no}</span>
        ${q.title ? `<span class="q-title">${esc(q.title)}</span>` : ""}
        <span class="tag">${typeLabel} · ${q.points}점</span>${q.subject && q.subject !== "전체" ? `<span class="tag">${esc(q.subject)}</span>` : ""}</div>
        <div class="q-text">${esc(q.question)}</div>`;
      if (q.type === "short") {
        q.parts.forEach((p, j) => {
          html += `<div class="short-part"><label for="a${q.no}_${j}">${esc(p.label)}</label>
            <input type="text" id="a${q.no}_${j}" data-q="${q.no}" autocomplete="off"></div>`;
        });
      } else if (q.type === "choice") {
        const isMulti = Array.isArray(q.answer) && q.answer.length > 1;
        q.choices.forEach((c, j) => {
          html += `<label class="choice"><input type="${isMulti ? "checkbox" : "radio"}" name="a${q.no}" value="${j + 1}" data-q="${q.no}">
            <span>${esc(c)}</span></label>`;
        });
        if (isMulti) html += '<div class="meta">복수 정답 문항입니다.</div>';
      } else {
        html += `<textarea id="a${q.no}" data-q="${q.no}" placeholder="답안을 작성하세요."></textarea>
          <div class="meta"><span id="len${q.no}">0</span>자</div>`;
      }
      html += "</div>";
    });
    html += `<div class="center" style="margin-top:24px"><p id="unansweredWarn" class="notice hidden"></p>
      <button class="btn" id="submitBtn" type="button">답안 제출</button></div>`;
    app.innerHTML = html;

    app.removeEventListener("input", onInput);
    app.removeEventListener("change", saveDraft);
    app.addEventListener("input", onInput);
    app.addEventListener("change", saveDraft);
    $("#submitBtn").addEventListener("click", () => onSubmit(false));
    loadDraft();
    startTimer();
  }

  function onInput(e) {
    if (e.target.tagName === "TEXTAREA") $("#len" + e.target.dataset.q).textContent = e.target.value.length;
    saveDraft();
  }

  /* ---------- 답안 수집 / 임시저장 ---------- */
  function collectAnswers() {
    return exam.questions.map(q => {
      if (q.type === "short") return q.parts.map((_, j) => $(`#a${q.no}_${j}`).value.trim());
      if (q.type === "choice") {
        const v = [...document.querySelectorAll(`input[name="a${q.no}"]:checked`)].map(i => Number(i.value));
        return Array.isArray(q.answer) && q.answer.length > 1 ? v : (v[0] != null ? v[0] : null);
      }
      return $(`#a${q.no}`).value.trim();
    });
  }
  function saveDraft() {
    try { localStorage.setItem(DRAFT(), JSON.stringify({ name: $("#examineeName").value, answers: collectAnswers() })); } catch (e) {}
  }
  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT()) || "null");
      if (!d) return;
      $("#examineeName").value = d.name || "";
      exam.questions.forEach((q, i) => {
        const a = d.answers && d.answers[i];
        if (a == null) return;
        if (q.type === "short") q.parts.forEach((_, j) => { $(`#a${q.no}_${j}`).value = a[j] || ""; });
        else if (q.type === "choice") {
          const set = [].concat(a).map(Number);
          document.querySelectorAll(`input[name="a${q.no}"]`).forEach(inp => { inp.checked = set.includes(Number(inp.value)); });
        } else { $(`#a${q.no}`).value = a; $("#len" + q.no).textContent = String(a).length; }
      });
    } catch (e) {}
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT()); } catch (e) {} }

  /* ---------- 타이머 ---------- */
  function startTimer() {
    const bar = $("#timerBar");
    if (!exam.timeLimitMin) { bar.classList.add("hidden"); return; }
    const key = "start_" + examId;
    let start = Date.now();
    try { start = Number(sessionStorage.getItem(key)) || start; sessionStorage.setItem(key, String(start)); } catch (e) {}
    const end = start + exam.timeLimitMin * 60000;
    bar.classList.remove("hidden");
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      bar.textContent = `남은 시간 ${m}:${String(s).padStart(2, "0")}`;
      bar.classList.toggle("low", left < 5 * 60000);
      if (left <= 0) { clearInterval(timerId); onSubmit(true); }
    };
    tick(); timerId = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    $("#timerBar").classList.add("hidden");
    try { sessionStorage.removeItem("start_" + examId); } catch (e) {}
  }

  /* ---------- 제출 ---------- */
  function onSubmit(force) {
    if (submitting) return;
    const answers = collectAnswers();
    const blank = exam.questions.filter((q, i) => Eng.isBlank(q, answers[i]) || (q.type === "short" && answers[i].some(v => !v))).map(q => q.no);
    const warn = $("#unansweredWarn");
    if (!force && blank.length && warn.dataset.confirmed !== "1") {
      warn.textContent = `미작성(또는 일부 미작성) 문항: ${blank.join(", ")}번. 그대로 제출하려면 [답안 제출]을 한 번 더 누르세요.`;
      warn.classList.remove("hidden"); warn.dataset.confirmed = "1"; return;
    }
    submitting = true; stopTimer();
    const result = Eng.gradeExam(exam, answers, SITE.grading);
    renderResult(answers, result);
    sendToSheet({
      examId: exam.id, examTitle: exam.title, name: $("#examineeName") ? $("#examineeName").value.trim() : (window.__name || ""),
      total: result.total, max: result.max, percent: result.percent, pass: result.pass,
      subjects: result.subjects,
      items: result.items.map((it, i) => ({ no: it.no, subject: it.subject, answer: Eng.userAnswerText(exam.questions[i], answers[i]), score: it.score, max: it.max })),
      userAgent: navigator.userAgent.slice(0, 200)
    });
    clearDraft();
  }

  async function sendToSheet(payload) {
    const el = $("#saveStatus");
    if (!SITE.sheetEndpoint) { if (el) el.textContent = ""; return; }
    if (el) el.textContent = "응시 기록 저장 중…";
    try {
      // Apps Script는 CORS 응답을 주지 않으므로 no-cors + text/plain 으로 전송 (응답 본문은 읽지 않음)
      await fetch(SITE.sheetEndpoint, { method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
      if (el) el.textContent = "응시 기록이 저장되었습니다.";
    } catch (e) {
      if (el) el.textContent = "응시 기록 저장에 실패했습니다(채점 결과에는 영향 없음).";
    }
  }

  /* ---------- 3) 결과 ---------- */
  function renderResult(answers, r) {
    const msgs = Object.assign({ pass: "합격을 축하합니다.", fail: "조금만 더 분발해주세요." }, SITE.messages || {}, exam.messages || {});
    const name = $("#examineeName") ? $("#examineeName").value : "";
    window.__name = name;
    let html = `<div class="card result-hero ${r.pass ? "pass" : "fail"}">
      <div class="score">${r.total}<small> / ${r.max}점</small></div>
      <div class="msg">${esc(r.pass ? msgs.pass : msgs.fail)}</div>
      ${r.subjFail ? `<div class="notice" style="margin-top:6px">과목별 최소 점수(${exam.pass.subjectMinPercent}%) 미달 과목이 있습니다.</div>` : ""}
      <div class="save-status" id="saveStatus"></div></div>`;

    if (r.subjects.length > 1) {
      html += `<div class="card"><b>과목별 점수</b><table class="subj" style="margin-top:10px"><tr><th>과목</th><th class="num">점수</th><th class="num">만점</th><th class="num">득점률</th></tr>` +
        r.subjects.map(s => {
          const pct = s.max ? Math.round(s.score / s.max * 1000) / 10 : 0;
          const bad = exam.pass.subjectMinPercent && pct < exam.pass.subjectMinPercent;
          return `<tr><td>${esc(s.name)}</td><td class="num">${s.score}</td><td class="num">${s.max}</td><td class="num ${bad ? "subj-fail" : ""}">${pct}%${bad ? " (과락)" : ""}</td></tr>`;
        }).join("") + "</table></div>";
    }

    html += `<div class="card"><b>문항별 점수</b> <span class="notice">(누르면 해당 문항으로 이동)</span><div class="grid" style="margin-top:12px">` +
      r.items.map(it => {
        const cls = it.score >= it.max ? "full" : it.score > 0 ? "mid" : "zero";
        return `<a class="chip ${cls}" href="#r${it.no}">Q${String(it.no).padStart(2, "0")}<b>${it.score}</b></a>`;
      }).join("") + "</div></div>";

    html += '<div class="section-title">문항별 정답 비교 및 해설</div>';
    exam.questions.forEach((q, i) => {
      const it = r.items[i];
      const mine = Eng.userAnswerText(q, answers[i]);
      const empty = Eng.isBlank(q, answers[i]);
      const rub = it.detail.map(d => `<li class="${d.level === "full" ? "hit" : d.level === "part" ? "partial" : "miss"}">
        <span class="mark">${d.level === "full" ? "✓" : d.level === "part" ? "△" : "✗"}</span>
        <span>${esc(d.label)}${d.level === "part" ? " (유사 표현 인정)" : ""}</span><span class="pt">${d.got} / ${d.p}</span></li>`).join("");
      html += `<div class="card" id="r${q.no}"><div class="q-head"><span class="q-no">문제 ${String(q.no).padStart(2, "0")}</span>
        ${q.title ? `<span class="q-title">${esc(q.title)}</span>` : ""}<span class="q-score">${it.score} / ${it.max}점</span></div>
        <div class="q-text">${esc(q.question)}</div>
        <div class="cmp"><div class="box mine"><h4>내 답안</h4>${empty ? '<span class="empty">(미작성)</span>' : esc(mine)}</div>
        <div class="box model"><h4>모범 답안</h4>${esc(Eng.modelAnswerText(q))}</div></div>
        ${q.type === "choice" ? "" : `<ul class="rubric">${rub}</ul>`}
        ${q.explanation ? `<div class="box exp"><b>해설</b> ${esc(q.explanation)}</div>` : ""}</div>`;
    });
    html += `<div class="actions"><button class="btn secondary" type="button" onclick="window.print()">결과 인쇄 / PDF 저장</button>
      <button class="btn secondary" type="button" id="retryBtn">다시 풀기</button>
      <a class="btn" href="./">다른 회차 선택</a></div>`;
    app.innerHTML = html;
    $("#retryBtn").addEventListener("click", () => { submitting = false; renderExam(examId); window.scrollTo({ top: 0 }); });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- 시작 ---------- */
  const id = new URLSearchParams(location.search).get("exam");
  if (id) renderExam(id); else renderList();
})();
