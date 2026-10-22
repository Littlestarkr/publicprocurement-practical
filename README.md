# 모의고사 범용 템플릿 (다회차 · 자동 채점 · 구글시트 수집)

문제 파일(JSON) 하나만 추가하면 새 회차가 생깁니다. 페이지·채점·시트 저장 코드는 그대로 씁니다.

```
index.html          회차 목록 + 시험 + 결과/해설 (페이지 하나)
config.js           사이트 제목, 시트 URL, 합격/불합격 멘트, 채점 완화 강도
engine.js           채점 엔진 (서술형 / 단답형 / 객관식, 과목별 점수, 합격 판정)
app.js              화면 동작
exams/manifest.json 회차 목록 (여기에 한 줄 추가하면 목록에 나타남)
exams/exam01.json   제1회 문제·정답·해설
exams/_sample.json  작성 예시 (목록에는 안 나옴. ?exam=_sample 로만 접속)
apps-script/Code.gs 구글시트 저장용 (범용: 회차·문항 수 자동 인식)
tools/check-exam.js 새 문제 파일 점검 도구 (선택)
run-local.bat       내 컴퓨터에서 미리보기 (Python 필요, 선택)
```

## 1. 새 회차 추가 (3단계)

1. `exams/_sample.json`을 복사해 `exams/exam02.json`으로 저장하고, 문제·정답·해설을 채웁니다.
   (또는 문제 원문을 저에게 붙여넣으면 JSON으로 만들어 드립니다.)
2. `exams/manifest.json`의 `exams` 배열에 한 줄을 추가합니다.
   ```json
   { "id": "exam02", "title": "제2회 모의고사", "description": "서술형 15 + 단답형 5 · 100점", "questions": 20 }
   ```
3. GitHub에 push합니다. (`git add .` → `git commit -m "제2회 추가"` → `git push`)

시험 주소는 `https://계정.github.io/저장소/?exam=exam02` 이고, 목록 화면에서도 선택할 수 있습니다.

## 2. 문제 파일(JSON) 작성법

### 회차 공통 설정

| 항목 | 설명 | 기본값 |
|---|---|---|
| `id` | 회차 ID. 파일명과 같게 (시트 탭 이름도 이 값) | 필수 |
| `title`, `subtitle` | 제목, 부제 | |
| `defaultPoints` | 문항 기본 배점 | 5 |
| `timeLimitMin` | 제한시간(분). 0이면 제한 없음. 시간이 끝나면 자동 제출 | 0 |
| `pass.percent` | 합격 기준(총점 득점률 %) | 60 |
| `pass.subjectMinPercent` | 과목별 최소 득점률 % (0이면 과락 없음) | 0 |
| `messages` | 이 회차만 합격/불합격 멘트를 바꿀 때 `{"pass":"…","fail":"…"}` | config.js 값 |

### 문항 공통

`type`(essay/short/choice), `question`(문제), `explanation`(해설), 그리고 선택 항목: `title`(소제목), `points`(배점), `subject`(과목. 과목별 점수 표에 사용), `section`(화면 구분 제목. 값이 바뀌는 문항 앞에 표시)

### 유형별

- **서술형 `essay`** — `answer`(모범답안)만 넣으면 됩니다. 모범답안을 문장 단위로 나눠 핵심어 포함 비율로 자동 채점합니다. 더 정밀하게 하려면 `rubric`을 직접 지정합니다.
  ```json
  "rubric": [
    { "p": 2, "label": "요소 설명", "k": [["정확한 용어","동의어"]], "s": ["유사어1","유사어2"] }
  ]
  ```
  - `p` 배점(문항 배점과 합이 같게), `k` 정확한 핵심어(그룹 안은 OR, 그룹끼리는 AND) → 100% 인정
  - `s` 유사 표현 → 2개 이상이면 70%, 1개면 30% 인정 (config.js에서 조절)
  - 순서가 중요한 항목은 `k` 대신 `"seq": ["거래실례","원가계산","감정","견적"]`
  - **계산형 문제(정답+풀이 과정 배점)**: `rubric` 항목의 `label`을 `[정답] …`, `[풀이] …`처럼 적으면
    두 부분을 따로 채점합니다. `[풀이]` 항목은 답안에 연산 기호(×÷+-)와 숫자가 2개 이상 있어야
    (`engine.js`의 `hasCalcWork()`) 채점 대상이 되고, 그 안에서 핵심어 일치 정도에 따라 부분
    점수를 줍니다. 즉 ① 풀이 과정을 아예 안 쓰면 `[정답]` 배점만 인정, ② 과정을 쓰되 표현이
    다르거나 일부 생략했으면 그 정도에 따라 부분 인정, ③ 애초에 풀이가 필요 없는 문제는 정답만
    써도 만점 — 이렇게 3가지로 나뉩니다.
- **단답형 `short`** — `parts`에 소문항을 적습니다. `keys`에 정답으로 인정할 표기를 여러 개 적으세요(공백·쉼표 자동 무시).
  ```json
  "parts": [ { "label": "(1) 공사", "answer": "0.05%", "keys": ["0.05", "0.5/1000", "1000분의0.5"] } ]
  ```
- **객관식 `choice`** — `choices`(보기 배열)와 `answer`(정답 번호, 1부터. 복수 정답은 `[1,3]`).

문제 파일을 쓴 뒤 점검하려면 (Node.js가 있을 때): `node tools/check-exam.js exams/exam02.json`
→ 형식 오류, 모범답안을 그대로 넣었을 때 만점인지, 채점요소 배점 합계를 확인해 줍니다.

## 3. 구글시트 연결

제1회 때 만든 시트와 웹앱을 그대로 쓸 수 있습니다. **Code.gs만 새 버전으로 바꾸면 됩니다.**

1. 기존 시트 > 확장 프로그램 > Apps Script 에서 `Code.gs` 내용을 이 폴더의 `apps-script/Code.gs`로 교체하고 저장
2. **배포 > 배포 관리 > 연필(편집) > 버전: 새 버전 > 배포** (웹 앱 URL은 그대로 유지)
3. `config.js`의 `sheetEndpoint`에 웹 앱 URL이 들어 있는지 확인 (이미 입력되어 있음)

시트에는 회차ID별 탭이 자동으로 생기고 한 줄에 다음이 쌓입니다.
`제출일시 | 회차ID | 이름 | 총점 | 합격여부 | Q01~Qn 점수 | Q01~Qn 답안 | 브라우저 | 과목별점수 | 회차명 | 만점 | 득점률(%) | 응시자코드`

※ 기존 제1회 사이트(`publicprocurement-practical1`)는 `practical-1` 탭에, 이 템플릿의 제1회는 `exam01` 탭에 쌓입니다.

### 3-1. 내 결과 보기 (응시자 본인만 과거 응시 기록 조회)

응시자가 제출하면 화면에 **내 결과 코드**(예: `AB3X-9K2P`)가 표시되고, 이 브라우저(`localStorage`)에 저장됩니다.
회차 목록의 **[내 결과 보기]**에서 이 코드를 입력하면, 같은 코드로 제출했던 모든 회차의 과거 기록(점수·합격 여부)을 다시 볼 수 있습니다.
코드는 본인만 알고 있으므로 사실상 로그인 없이 "내 기록만" 보는 효과를 냅니다. 코드를 분실하면 그 코드로 쌓인 기록은 복구할 수 없습니다.

- 이 기능은 Apps Script의 `doGet`에서 처리하며, 응답을 `<script>` 태그로 불러오는 **JSONP** 방식을 씁니다
  (Apps Script 웹앱은 일반 `fetch`로 응답 본문을 읽을 수 없어 제출용 POST처럼 CORS를 우회해야 합니다).
- **이 기능을 쓰려면 `Code.gs`를 위 3번 설치 절차대로 새 버전으로 배포해야 합니다.** 이미 배포된 이전 버전은 `doGet`이 파라미터를 처리하지 않아
  "내 결과 보기"가 항상 빈 결과만 돌려줍니다.
- 이 업데이트 이전에 쌓인 기록에는 응시자코드가 없어 조회 목록에 나타나지 않습니다(시트에서 직접 확인은 가능).

## 4. GitHub에 올리기 (처음 한 번)

기존 제1회 저장소와 별도의 새 저장소를 권장합니다. 예: `publicprocurement-practical`

```bash
# 이 폴더 내용을 새 폴더(예: 바탕 화면\publicprocurement-practical)로 옮긴 뒤, 그 폴더에서
git init
git add .
git commit -m "모의고사 범용 템플릿"
git branch -M main
git remote add origin https://github.com/Littlestarkr/publicprocurement-practical.git
git push -u origin main
```
이후 GitHub 저장소 **Settings > Pages**에서 `main` / `(root)`를 선택하면 `https://littlestarkr.github.io/publicprocurement-practical/` 로 열립니다.

## 5. 내 컴퓨터에서 미리보기

문제 파일을 JSON으로 읽기 때문에 `index.html`을 더블클릭(file://)하면 동작하지 않습니다.
`run-local.bat`을 실행(Python 필요)한 뒤 브라우저에서 `http://localhost:8000`을 여세요.
Python이 없으면 push 후 Pages 주소에서 확인하거나 VS Code의 *Live Server* 확장을 쓰세요.

## 6. 채점 강도 조절

`config.js`의 `grading`:
- `softMany`, `softManyRate`, `softOneRate` — 유사 표현 인정 개수/비율 (현재 2개 → 70%, 1개 → 30%)
- `suppFull`, `keyOnlyRate` — 완결성 검사. 핵심 키워드(`k`)가 맞아도 보조 표현(`s`)을 `suppFull`(50%) 미만만 썼으면 만점 대신 `keyOnlyRate`(83%)~100% 사이로 비례 감점합니다. 모범답안이 `s`를 덜 담은 문항은 모범답안 수준을 기준으로 삼아 모범답안은 항상 만점입니다.
- `auto.*` — rubric 없는 서술형의 자동 채점 기준. `full/mid/low`는 핵심어 포함 비율 경계, `*Rate`는 인정 비율

제1회 데이터로 보정되어 있습니다: 정밀 rubric 사용 시 최초 응시 답안이 76.7점, rubric 없이 자동 채점만 쓰면 약 69점 수준입니다.
회차를 거듭하며 응시 데이터가 쌓이면 시트의 점수 분포를 보고 이 값을 조절하세요.

## 7. 참고

- 정답이 문제 파일(JSON)에 들어 있어 개발자 도구로 볼 수 있습니다. 자가 학습용 모의고사에는 문제없습니다.
- 응시자 이름·답안·점수가 시트에 저장됩니다. 블로그 글에 수집 안내를 한 줄 넣어 두세요.

## 8. 관리자에게 문의하기 (회차 목록 하단)

`config.js`의 `adminEmail`에 주소를 넣으면 회차 목록 맨 아래에 문의 링크가 보입니다(비워 두면 안 보임).
일반 브라우저에서는 메일 앱을 바로 여는 `mailto:` 링크로 동작합니다.

네이버 블로그·카카오톡 등 **인앱 브라우저(웹뷰)**에서는 `mailto:` 링크가 메일 앱을 못 여는 경우가 많아,
`app.js`의 `isInAppBrowser()`로 그런 환경을 감지하면 링크 클릭 시 기본 동작 대신 이메일 주소를
클립보드에 복사하고 "다른 브라우저로 열기" 안내를 띄웁니다. (인쇄/PDF 저장 버튼도 같은 방식으로
인앱 브라우저를 감지해 안내만 보여줍니다.)
