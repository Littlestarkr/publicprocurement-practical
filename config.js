/* =====================================================================
 * 사이트 공통 설정 — 회차를 추가해도 이 파일은 거의 바꿀 일이 없습니다.
 * ===================================================================== */
window.SITE = {
  title: "공공조달관리사 실기 모의고사",
  subtitle: "회차를 선택해 응시하세요. 제출하면 자동 채점되고 정답·해설을 볼 수 있습니다.",

  // 구글 Apps Script 웹앱 URL (README 3단계). 비워 두면 채점만 하고 시트 저장은 건너뜁니다.
  sheetEndpoint: "https://script.google.com/macros/s/AKfycbybKnJ2TtxE4Y8RxfY9zzSJcsuxmHlLY3_Z7784b5ugN98ZmewBvsJJSkUXV9jU7Yb9/exec",

  // 합격/불합격 멘트
  messages: {
    pass: "모의고사 합격을 축하합니다.",
    fail: "조금만 더 분발해주세요."
  },

  // 채점 완화 강도 (필요할 때만 수정. 비워 두면 기본값)
  //  softMany: 유사 표현이 이 개수 이상이면 softManyRate 만큼 인정
  //  softOneRate: 유사 표현이 1개일 때 인정 비율
  //  auto.*: 채점요소(rubric)가 없는 문항을 모범답안으로 자동 채점할 때의 기준
  grading: {
    softMany: 2, softManyRate: 0.7, softOneRate: 0.3,
    auto: { full: 0.5, fullRate: 1.0, mid: 0.3, midRate: 0.8, low: 0.15, lowRate: 0.5 }
  }
};
