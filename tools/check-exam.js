#!/usr/bin/env node
/* 문제 파일 점검 도구
 *   node tools/check-exam.js exams/exam02.json
 * - 형식 오류 검사
 * - 모범답안을 그대로 답안으로 넣었을 때 만점(100%)이 나오는지 자가 채점
 * - 빈 답안이 0점인지 확인
 */
const fs = require('fs'), path = require('path');
const E = require('../engine.js');
const file = process.argv[2];
if (!file) { console.error('사용법: node tools/check-exam.js exams/examXX.json'); process.exit(1); }
let exam;
try { exam = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error('✗ JSON 형식 오류:', e.message); process.exit(1); }

const problems = [], warns = [];
if (!Array.isArray(exam.questions) || !exam.questions.length) { console.error('✗ questions 배열이 없습니다.'); process.exit(1); }
E.normalizeExam(exam);
exam.questions.forEach((q, i) => {
  const n = i + 1;
  if (!q.question) problems.push(`${n}번: question(문제) 없음`);
  if (q.type === 'essay') {
    if (!q.answer && !(q.rubric && q.rubric.length)) problems.push(`${n}번: answer(모범답안) 없음`);
    if (!(q.rubric && q.rubric.length) && E.autoRubric(q.answer, q.points).length < 2)
      warns.push(`${n}번: 모범답안이 짧아 자동 채점요소가 2개 미만입니다. rubric을 직접 지정하세요.`);
    if (q.rubric) {
      const sum = q.rubric.reduce((s, r) => s + (Number(r.p) || 0), 0);
      if (Math.abs(sum - q.points) > 0.05) warns.push(`${n}번: rubric 배점 합계(${sum})가 문항 배점(${q.points})과 다릅니다.`);
    }
  } else if (q.type === 'short') {
    if (!q.parts || !q.parts.length) problems.push(`${n}번: parts 없음`);
    else q.parts.forEach(p => { if (!(p.keys && p.keys.length)) warns.push(`${n}번 ${p.label}: keys(인정 답안)가 없어 정답 텍스트로 자동 판정합니다.`); });
  } else if (q.type === 'choice') {
    if (!q.choices || !q.choices.length || q.answer == null) problems.push(`${n}번: choices/answer 없음`);
    else if ([].concat(q.answer).some(a => a < 1 || a > q.choices.length)) problems.push(`${n}번: answer 번호가 보기 범위를 벗어났습니다.`);
  } else problems.push(`${n}번: 알 수 없는 type "${q.type}" (essay/short/choice)`);
});
if (problems.length) { console.error('✗ 오류\n  - ' + problems.join('\n  - ')); process.exit(1); }

const model = exam.questions.map(q => q.type === 'short' ? q.parts.map(p => p.answer)
  : q.type === 'choice' ? q.answer : q.answer);
const blank = exam.questions.map(q => q.type === 'short' ? q.parts.map(() => '') : q.type === 'choice' ? null : '');
const rm = E.gradeExam(exam, model), rb = E.gradeExam(exam, blank);
console.log(`문항 ${exam.questions.length}개 · 만점 ${rm.max}점 · 합격선 ${exam.pass.percent}%`);
console.log(`모범답안 자가 채점: ${rm.total} / ${rm.max}   |   빈 답안: ${rb.total}`);
rm.items.forEach(it => { if (it.score < it.max) warns.push(`${it.no}번: 모범답안 그대로 입력해도 ${it.score}/${it.max}점 (채점요소/keys 점검 필요)`); });
if (rb.total > 0) warns.push('빈 답안이 0점이 아닙니다.');
if (warns.length) console.log('△ 확인 필요\n  - ' + warns.join('\n  - ')); else console.log('✓ 이상 없음');
