/**
 * 모의고사 응시 기록 수집기 (범용) — Google Apps Script
 * ------------------------------------------------------------------
 * - 회차(examId)마다 시트 탭이 자동 생성되고, 문항 수는 제출 데이터에서 자동 인식합니다.
 *   (회차가 늘어도, 문항 수가 달라도 코드를 고칠 필요가 없습니다)
 * - 기존 제1회 시트(practical-1)의 열 배치와 호환됩니다.
 *
 * 설치/갱신
 *  1) 기록을 쌓을 구글시트 > 확장 프로그램 > Apps Script 에 이 코드를 붙여넣고 저장
 *  2) 함수 'setup' 선택 후 [실행] (최초 1회, 권한 승인)
 *  3) 배포 > 새 배포 > 유형: 웹 앱 (실행: 나 / 액세스: 모든 사용자) → 웹 앱 URL을 config.js 에 입력
 *  ※ 이미 배포한 적이 있다면: 배포 > 배포 관리 > 연필(편집) > 버전: 새 버전 > 배포
 *     (URL이 그대로 유지되므로 config.js 를 고칠 필요가 없습니다)
 *
 * 시트 열 구성
 *  제출일시 | 회차ID | 이름 | 총점 | 합격여부 | Q01~Qn 점수 | Q01~Qn 답안 | 브라우저 | 과목별점수 | 회차명 | 만점 | 득점률(%)
 */

function pad_(n) { return ('0' + n).slice(-2); }

function setup() {
  SpreadsheetApp.getActiveSpreadsheet();   // 권한 승인용
}

/** 시트 가져오기 (없으면 생성 + 헤더). items: 첫 제출의 문항 목록 */
function getSheet_(examId, items) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = String(examId || '응시기록').slice(0, 90);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const h = ['제출일시', '회차ID', '이름', '총점', '합격여부'];
    items.forEach(function (it) { h.push('Q' + pad_(it.no) + ' 점수'); });
    items.forEach(function (it) { h.push('Q' + pad_(it.no) + ' 답안'); });
    h.push('브라우저', '과목별점수', '회차명', '만점', '득점률(%)');
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e8f0fa');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 이전 버전 시트에 없는 추가 열의 머리글 보강 */
function ensureExtraHeaders_(sh, n) {
  const base = 5 + n * 2;                     // 브라우저 열 앞까지
  const extras = ['브라우저', '과목별점수', '회차명', '만점', '득점률(%)'];
  const cells = sh.getRange(1, base + 1, 1, extras.length);
  const cur = cells.getValues()[0];
  let changed = false;
  for (let i = 0; i < extras.length; i++) {
    if (!cur[i]) { cur[i] = extras[i]; changed = true; }
  }
  if (changed) cells.setValues([cur]).setFontWeight('bold').setBackground('#e8f0fa');
}

/** 웹페이지에서 POST로 들어오는 응시 기록 저장 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);               // 동시 제출 시 행 겹침 방지
  try {
    const d = JSON.parse(e.postData.contents);
    const items = (d.items || []).slice().sort(function (a, b) { return a.no - b.no; });
    const n = items.length;

    const scores = [], answers = [];
    items.forEach(function (it) {
      scores.push(Number(it.score) || 0);
      answers.push(clean_(it.answer));
    });

    const subj = (d.subjects || []).map(function (s) { return s.name + ' ' + s.score + '/' + s.max; }).join(' | ');
    const max = Number(d.max) || '';
    const pct = d.percent != null ? Number(d.percent) : (max ? Math.round(Number(d.total) / max * 1000) / 10 : '');

    const row = [new Date(), clean_(d.examId), clean_(d.name) || '(익명)', Number(d.total) || 0,
                 d.pass ? '합격' : '불합격']
      .concat(scores, answers, [clean_(d.userAgent), clean_(subj), clean_(d.examTitle), max, pct]);

    const sh = getSheet_(d.examId, items);
    ensureExtraHeaders_(sh, n);
    sh.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/** 접속 확인용 (브라우저로 웹앱 URL을 열면 표시) */
function doGet() {
  return ContentService.createTextOutput('모의고사 기록 수집기 작동 중');
}

/** 문자열 정리: 길이 제한 + 수식 주입(=,+,-,@ 시작) 방지 */
function clean_(v) {
  let s = String(v == null ? '' : v).slice(0, 5000);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
