/* =====================================================================
 * 모의고사 공통 채점 엔진 (브라우저/Node 공용)
 * ---------------------------------------------------------------------
 * 문항 유형
 *   essay  : 서술형. rubric(채점요소)이 있으면 그 기준으로, 없으면 모범답안(answer)에서
 *            자동으로 채점요소를 만들어 채점
 *   short  : 단답형. parts[] 소문항별로 keys(인정 답) 포함 여부 채점
 *   choice : 객관식. choices[] 와 answer(1부터 시작하는 번호, 복수정답은 배열)
 *
 * 채점 단계 (서술형)
 *   1) 정확한 핵심 키워드(rubric.k)가 있으면            → 배점 100%
 *      (단, 보조 표현 rubric.s 가 있는데 suppFull 비율 미만만 쓰였으면
 *       keyOnlyRate~100% 사이 비례 — 핵심어만 얹은 불완전 답안 방지)
 *   2) 없지만 유사 표현(rubric.s)이 softMany개 이상이면   → softManyRate
 *      1개면                                           → softOneRate
 *   3) rubric이 없으면 모범답안을 문장 단위로 나눠 핵심어 포함 비율로 자동 채점
 * ===================================================================== */
(function (root) {
  "use strict";

  const DEFAULT_GRADING = {
    softMany: 2, softManyRate: 0.7, softOneRate: 0.3, groupPartRate: 0.4,
    suppFull: 0.5, keyOnlyRate: 0.83,
    auto: { full: 0.5, fullRate: 1.0, mid: 0.3, midRate: 0.8, low: 0.15, lowRate: 0.5 }
  };

  const round1 = (n) => Math.round(n * 10) / 10;
  const round2 = (n) => Math.round(n * 100) / 100;

  /** 비교용 정규화: 공백·쉼표 제거, 소문자화, 전각 % 통일 */
  const normalize = (s) => String(s == null ? "" : s)
    .toLowerCase()
    .replace(/％/g, "%").replace(/[，,]/g, "")
    .replace(/퍼센트|프로/g, "%")
    .replace(AMOUNT_RE, amountToDigits)
    .replace(/\s+/g, "");

  /** 금액 표기 통일: "12백만원"·"1억2000만"·"3.5억"·"1천2백만" 처럼 한글 단위가 섞인 숫자를
   *  아라비아 숫자(예: 12000000)로 바꿔서, 키워드·답안이 표기 방식과 상관없이 일치하도록 한다.
   *  (공백으로 떨어진 뒤의 숫자는 단위가 붙어 있을 때만 같은 금액으로 이어 붙인다.) */
  const UNIT = { "십": 10, "백": 100, "천": 1000, "만": 1e4, "억": 1e8, "조": 1e12 };
  const AMOUNT_RE = /\d+(?:\.\d+)?\s*[억만천백십](?:(?:\s*\d+(?:\.\d+)?)?\s*[억만천백십])*(?:\d+(?:\.\d+)?(?![\d.]|\s*[억만천백십]))?/g;
  function amountToDigits(m) {
    let total = 0, section = 0, cur = null;
    const toks = m.match(/\d+(?:\.\d+)?|[억만천백십]/g);
    for (const t of toks) {
      if (/\d/.test(t)) { cur = parseFloat(t); continue; }
      const u = UNIT[t];
      if (u < 1e4) { section += (cur == null ? 1 : cur) * u; cur = null; }
      else {
        if (cur != null) section += cur;
        if (section === 0) section = 1;
        total += section * u; section = 0; cur = null;
      }
    }
    total += section + (cur == null ? 0 : cur);
    return String(Math.round(total));
  }

  /* ---------- 핵심어 추출 (자동 채점용) ---------- */
  const STOP = new Set(["등", "및", "또는", "대한", "위한", "통해", "따라", "경우", "있는", "하는", "한다", "이다",
    "때문", "것이다", "이를", "그리고", "하여", "있다", "된다", "해당", "각각", "모두", "대해", "관한", "같은", "또한"]);
  const JOSA = /(으로서|으로써|에서는|에게는|으로|에서|에게|까지|부터|처럼|보다|이다|한다|된다|하는|하여|하고|이며|하며|에는|에도|이나|이란|라는|라고|과|와|은|는|이|가|을|를|의|에|도|로|만|며)$/;

  function extractTerms(text) {
    let s = String(text || "");
    const c = s.indexOf(":");
    if (c > 0 && c <= 30) s = s.slice(c + 1);              // "정의:" 같은 머리말 제거
    s = s.replace(/(\d),(?=\d)/g, "$1").replace(/[①②③④⑤⑥⑦⑧⑨⑩➔→]/g, " ");
    const toks = s.match(/[가-힣A-Za-z0-9%.]+/g) || [];
    const out = [], seen = new Set();
    for (let t of toks) {
      t = t.replace(/^\.+|\.+$/g, "");
      if (!t) continue;
      if (/^\d{1,2}$/.test(t)) continue;                    // 번호(1, 2 ...) 제외
      if (/[가-힣]/.test(t)) {
        const stripped = t.replace(JOSA, "");
        if (stripped.length >= 2) t = stripped;
      }
      if (t.length < 2 && !/%/.test(t)) continue;
      if (STOP.has(t)) continue;
      const n = normalize(t);
      if (seen.has(n)) continue;
      seen.add(n); out.push(t);
    }
    return out;
  }

  /** 답안에 키워드가 있는지. 숫자만으로 된 키워드("4억"→400000000, "5" 등)는 앞뒤에 다른 숫자가
   *  붙어 있으면 인정하지 않는다. (예: 정답 4억에 40억·15를 쓴 경우를 걸러냄) */
  function has(t, n) {
    if (/^\d+(?:\.\d+)?$/.test(n)) {
      const tail = n.includes(".") ? "0*(?!\\d)" : "(?!\\d)";          // 소수는 19.5 = 19.5000
      const re = new RegExp("(?<!\\d)(?<!\\d\\.)" + n.replace(/\./g, "\\.") + tail);
      return re.test(t);
    }
    return t.includes(n);
  }

  /** 핵심어가 답안에 있는지 (어미 변화를 고려해 앞부분 일치도 인정) */
  function termHit(tNorm, term) {
    const n = normalize(term);
    if (!n) return false;
    if (has(tNorm, n)) return true;
    if (/[가-힣]/.test(n)) {
      if (n.length >= 3 && tNorm.includes(n.slice(0, -1))) return true;
      if (n.length >= 5 && tNorm.includes(n.slice(0, -2))) return true;
    }
    return false;
  }

  /** 모범답안 → 자동 채점요소 */
  function autoRubric(answer, points) {
    const lines = String(answer || "")
      .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, "\n")
      .split(/\n+/)
      .flatMap(l => l.split(/(?<=[다요음임함]\.)\s+|;\s*/))
      .map(l => l.replace(/^\s*(\d+[.)]|\(\d+\)|[-•*])\s*/, "").trim())
      .filter(Boolean);
    const clauses = lines.map(l => ({ label: l, terms: extractTerms(l) })).filter(c => c.terms.length >= 2);
    if (!clauses.length) return [];
    const totalW = clauses.reduce((s, c) => s + c.terms.length, 0);
    return clauses.map(c => ({
      label: c.label.length > 60 ? c.label.slice(0, 58) + "…" : c.label,
      terms: c.terms,
      p: round2(points * c.terms.length / totalW)
    }));
  }

  function softHits(t, words) {
    const seen = new Set();
    (words || []).forEach(w => { const n = normalize(w); if (n && t.includes(n)) seen.add(n); });
    return seen.size;
  }

  /** 연산기호(×÷+−*)가 숫자 2개 이상과 함께 등장하면 산식(풀이)을 보여준 것으로 본다.
   *  한국어 산식은 "600,000,000원 × 지수조정률 5%"처럼 기호와 다음 숫자 사이에 단어가
   *  끼는 경우가 대부분이라 숫자-기호-숫자가 바로 붙어 있는지는 보지 않는다.
   *  [풀이] 채점요소는 이 증거가 전혀 없으면(=답만 나열) 점수를 주지 않는다 — 문항 라벨을 그대로
   *  베낀 답안이 우연히 보조 키워드와 겹쳐 부분점수를 받는 것을 막기 위함. */
  const OP_RE = /[×÷+\-−*]/;
  function hasCalcWork(text) {
    const s = String(text || "");
    if (!OP_RE.test(s)) return false;
    const nums = s.match(/[0-9][0-9,]*(?:\.[0-9]+)?/g) || [];
    return nums.length >= 2;
  }

  /* ---------- 서술형 ---------- */
  function gradeEssay(q, text, cfg) {
    const g = cfg;
    const t = normalize(text);
    const showedWork = hasCalcWork(text);
    const items = (q.rubric && q.rubric.length) ? q.rubric : autoRubric(q.answer, q.points);
    const detail = items.map(item => {
      let rate = 0, level = "miss";
      const isProcessItem = /^\[풀이\]/.test(item.label || "");
      if (t.length > 0 && !(isProcessItem && !showedWork)) {
        const hasExplicit = item.seq || (item.k && item.k.length);
        if (hasExplicit) {
          let strict;
          if (item.seq) {                                    // 순서까지 맞아야 하는 항목
            let pos = -1; strict = true;
            for (const kw of item.seq) {
              const i = t.indexOf(normalize(kw), pos + 1);
              if (i < 0) { strict = false; break; }
              pos = i;
            }
          } else {                                           // 그룹 AND, 그룹 안은 OR
            strict = item.k.every(group => group.some(kw => has(t, normalize(kw))));
          }
          if (strict) {
            rate = 1; level = "full";
            // 완결성 검사: 핵심 키워드 한두 개만 맞고 보조 표현(s)이 거의 없으면 만점 대신 감점한다.
            // s의 suppFull 비율 이상을 충족하면 만점, 미달이면 keyOnlyRate ~ 1.0 사이에서 비례 부여.
            if (!item.seq && item.s && item.s.length) {
              const total = new Set(item.s.map(normalize).filter(Boolean)).size;
              const sr = total ? softHits(t, item.s) / total : 1;
              // 보조 표현이 모범답안과 다른 어휘로 적힌 문항이 있어, 모범답안 자신의 충족률을 상한으로 삼는다
              // (모범답안은 항상 만점)
              const ref = total ? softHits(normalize(q.answer), item.s) / total : 1;
              const need = Math.min(g.suppFull, ref);
              if (sr < need) {
                rate = g.keyOnlyRate + (1 - g.keyOnlyRate) * (sr / need);
                level = "part";
              }
            }
          }
          else if (item.seq && Array.isArray(item.s)) {      // 순서 무관 일치 비율
            const found = item.s.filter(grp => grp.some(kw => t.includes(normalize(kw)))).length;
            if (found > 0) { rate = (found / item.s.length) * g.softManyRate; level = "part"; }
          } else {
            // 설명·방안형(키워드 묶음이 여럿)은 맞는 묶음 비율만큼 부분점수. 숫자가 든 묶음을 놓치면 이 부분점수는 없다.
            if (!item.seq && item.k && item.k.length > 1) {
              const miss = item.k.filter(grp => !grp.some(kw => has(t, normalize(kw))));
              if (!miss.some(grp => grp.some(kw => /\d/.test(kw)))) {
                const r = ((item.k.length - miss.length) / item.k.length) * (g.groupPartRate || 0);
                if (r > rate) { rate = r; level = "part"; }
              }
            }
            if (item.s && item.s.length) {
              const n = softHits(t, item.s);
              let r = 0;
              if (n >= g.softMany) r = g.softManyRate;
              else if (n >= 1) r = g.softOneRate;
              if (r > rate) { rate = r; level = "part"; }
            }
          }
        } else {                                             // 키워드 없는 항목: 핵심어 비율로 자동 판정
          const terms = item.terms || extractTerms(item.label);
          if (terms.length) {
            const ratio = terms.filter(w => termHit(t, w)).length / terms.length;
            const a = g.auto;
            if (ratio >= a.full) { rate = a.fullRate; level = "full"; }
            else if (ratio >= a.mid) { rate = a.midRate; level = "part"; }
            else if (ratio >= a.low) { rate = a.lowRate; level = "part"; }
          }
        }
      }
      return { label: item.label, p: round1(item.p), got: round1(item.p * rate), level };
    });
    const score = Math.min(q.points, detail.reduce((s, d) => s + d.got, 0));
    return { score: round1(score), detail };
  }

  /* ---------- 단답형 ---------- */
  function autoKeys(answer) {
    const a = String(answer || "");
    const num = a.replace(/(\d),(?=\d)/g, "$1").match(/\d+(\.\d+)?/);
    const keys = [normalize(a)];
    if (num) keys.push(num[0].replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""));
    return keys;
  }
  function gradeShort(q, arr) {
    const per = q.points / q.parts.length;
    const detail = q.parts.map((p, j) => {
      const t = normalize((arr || [])[j]);
      const keys = (p.keys && p.keys.length) ? p.keys : autoKeys(p.answer);
      const hit = t.length > 0 && keys.some(k => k && has(t, normalize(k)));
      return { label: `${p.label} → ${p.answer}`, p: round1(per), got: hit ? round1(per) : 0, level: hit ? "full" : "miss" };
    });
    const hits = detail.filter(d => d.level === "full").length;
    return { score: round1(Math.min(q.points, hits * per)), detail };
  }

  /* ---------- 객관식 ---------- */
  function toSet(v) { return new Set([].concat(v == null ? [] : v).map(Number).filter(n => !isNaN(n))); }
  function gradeChoice(q, ans) {
    const right = toSet(q.answer), mine = toSet(ans);
    const ok = right.size === mine.size && [...right].every(x => mine.has(x));
    return { score: ok ? q.points : 0, detail: [{ label: "정답 선택", p: q.points, got: ok ? q.points : 0, level: ok ? "full" : "miss" }] };
  }

  /* ---------- 문항 기본값 ---------- */
  function normalizeExam(exam) {
    const dp = exam.defaultPoints || 5;
    exam.questions.forEach((q, i) => {
      q.no = q.no || i + 1;
      q.type = q.type || "essay";
      q.points = Number(q.points) || dp;
      if (!q.subject) q.subject = "전체";
    });
    exam.pass = Object.assign({ percent: 60, subjectMinPercent: 0 }, exam.pass || {});
    return exam;
  }

  function mergeGrading(cfg) {
    const c = cfg || {};
    return Object.assign({}, DEFAULT_GRADING, c, { auto: Object.assign({}, DEFAULT_GRADING.auto, c.auto || {}) });
  }

  /* ---------- 단일 문항 채점 (중간 확인용) ---------- */
  function gradeQuestion(q, answer, gradingCfg) {
    const cfg = mergeGrading(gradingCfg);
    const r = q.type === "short" ? gradeShort(q, answer)
      : q.type === "choice" ? gradeChoice(q, answer)
      : gradeEssay(q, answer, cfg);
    return { no: q.no, subject: q.subject, max: q.points, score: r.score, detail: r.detail };
  }

  /* ---------- 전체 채점 ---------- */
  function gradeExam(exam, answers, gradingCfg) {
    const cfg = mergeGrading(gradingCfg);
    normalizeExam(exam);
    const items = exam.questions.map((q, i) => {
      const a = answers[i];
      const r = q.type === "short" ? gradeShort(q, a)
        : q.type === "choice" ? gradeChoice(q, a)
        : gradeEssay(q, a, cfg);
      return { no: q.no, subject: q.subject, max: q.points, score: r.score, detail: r.detail };
    });
    const total = round1(items.reduce((s, x) => s + x.score, 0));
    const max = items.reduce((s, x) => s + x.max, 0);
    const subjMap = new Map();
    items.forEach(x => {
      const s = subjMap.get(x.subject) || { name: x.subject, score: 0, max: 0 };
      s.score += x.score; s.max += x.max; subjMap.set(x.subject, s);
    });
    const subjects = [...subjMap.values()].map(s => ({ name: s.name, score: round1(s.score), max: s.max }));
    const percent = max ? total / max * 100 : 0;
    const subjFail = exam.pass.subjectMinPercent > 0 &&
      subjects.some(s => s.max && s.score / s.max * 100 < exam.pass.subjectMinPercent);
    const pass = percent >= exam.pass.percent && !subjFail;
    return { items, total, max, percent: round1(percent), subjects, pass, subjFail };
  }

  /* ---------- 표시용: 모범답안 텍스트 ---------- */
  function modelAnswerText(q) {
    if (q.type === "short") return q.parts.map(p => `${p.label} ${p.answer}`).join("\n");
    if (q.type === "choice") return [...toSet(q.answer)].map(n => `${n}번 ${q.choices[n - 1] || ""}`).join("\n");
    return q.answer || "";
  }
  function userAnswerText(q, a) {
    if (q.type === "short") return q.parts.map((p, j) => `${p.label} ${(a && a[j]) || "-"}`).join("\n");
    if (q.type === "choice") { const s = [...toSet(a)]; return s.length ? s.map(n => `${n}번 ${q.choices[n - 1] || ""}`).join("\n") : ""; }
    return a || "";
  }
  function isBlank(q, a) {
    if (q.type === "short") return !a || a.every(v => !String(v || "").trim());
    if (q.type === "choice") return toSet(a).size === 0;
    return !String(a || "").trim();
  }

  const api = { DEFAULT_GRADING, normalize, extractTerms, autoRubric, gradeExam, gradeQuestion, normalizeExam, mergeGrading,
    modelAnswerText, userAnswerText, isBlank, round1 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ExamEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
