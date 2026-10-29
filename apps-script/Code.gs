/**
 * 강연자 설명회 신청 페이지 — 구글시트 연동 스크립트
 * 흐름: 원장님 신청(소장님 최대 MAX_PICKS명 + 소장님별 설명회 하나 + 날짜 하나·시작 시간 + 요청사항)
 *       → 고른 소장님께 각각 출강 요청 알림톡(RESPONSE_HOURS 안에 응답, 마감 REMIND_HOURS 전 독촉 한 번) + 원장님 접수 알림 + 본사 알림
 *       → 소장님이 coach.html에서 「가능 / 시간 조율 필요 / 불가」 (기한 안에 답이 없으면 「응답 없음(불가)」)
 *       → 가능·시간 조율 응답은 그때마다 본사에 알림, 모두 답하거나 기한이 지나면 본사에 응답 마감 알림
 *       → 본사 담당자가 소장님·원장님과 직접 조율 → 시트에 확정 내용·금액을 넣고 메뉴 「확정·결제 안내 보내기」
 *         (원장님께 확정·결제 안내, 확정 소장님께 확정 안내, 나머지 소장님께 다른 소장님으로 진행 안내)
 *       → 결제완료 → 진행완료
 * 원장님은 신청할 때 말고는 본사 담당자와 직접 조율합니다(원장님이 소장님을 고르는 화면 없음).
 * 같은 소장님 같은 날 일정: 시작 시간 앞뒤 OVERLAP_HOURS 안이면 겹침. 확정 일정과 겹치면 원장님 신청을 막고, 대기 중인 요청과 겹치면 소장님 화면에 표시만 함.
 * 본사 알림 받을 사람은 시트 「본사 알림」에, 결제 방법은 「설정」에 적습니다(이 파일은 공개 저장소에 있어 번호를 적지 않음).
 * 설치 방법은 README.md의 "구글시트 연결" 참고.
 */

// ▼ 소장님 응답 페이지 주소
var COACH_PAGE_URL = 'https://clubhawaii.github.io/info-session-signup-page/coach.html';
// ▼ 원장님이 한 번에 고를 수 있는 소장님 수 (config.js의 MAX_PICKS와 같게)
var MAX_PICKS = 3;
// ▼ 소장님 응답 기한(시간, 밤·주말 포함) — 지나면 「응답 없음(불가)」. config.js의 RESPONSE_HOURS와 같게
var RESPONSE_HOURS = 24;
// ▼ 마감 몇 시간 전에 아직 답이 없는 소장님께 독촉 알림톡을 한 번 보낼지
var REMIND_HOURS = 6;
// ▼ 같은 날 일정 겹침 기준(시간) — config.js의 OVERLAP_HOURS와 같게
var OVERLAP_HOURS = 3;
// ▼ 결제 기한: 확정·결제 안내를 보낸 때부터 (시간). 기한이 주말에 걸리면 월요일 같은 시각으로 미룸
var PAY_HOURS = 24;
// ▼ 진행일까지 최소 남아야 하는 날 수 (config.js의 MIN_DAYS와 같게)
var MIN_DAYS = 14;

/*
 * 알림톡 발송 설정 (솔라피 기준) — 스크립트 편집기 ⚙ 프로젝트 설정 → 스크립트 속성
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID(카카오 채널 연동 ID), SOLAPI_FROM(발신 번호)
 *   템플릿 ID: TPL_ + 아래 TEMPLATES의 이름 (예: TPL_COACH_REQUEST)
 * 설정 전이거나 템플릿 ID가 없으면 보내지 않고 「알림기록」 시트에 "미발송(설정 전)"으로 문구만 남깁니다.
 */

var SH = { APPS: '신청내역', ANS: '소장님 응답', COACH: '강연자', TOPIC: '설명회', SUBMIT: '프로필 제출', BLOCK: '예약불가', HQ: '본사 알림', CONF: '설정', LOG: '알림기록' };
var TZ = 'Asia/Seoul';
// 신청 한 건의 상태
var ST = {
  ASKING: '소장님 응답 대기', RESULT: '본사 조율 중', NONE: '가능한 소장님 없음',
  CONFIRMED: '일정확정', PAY: '결제안내', PAID: '결제완료', DONE: '진행완료', CANCEL: '취소'
};
var STATUS = Object.keys(ST).map(function (k) { return ST[k]; });
var NEEDS_HQ = [ST.RESULT, ST.NONE];   // 본사가 다음 행동을 해야 하는 상태
// 소장님 한 분의 응답
var NO_PHONE_MEMO = '연락처가 없어 요청을 보내지 못함';
var ANS = { WAIT: '응답 대기', OK: '가능', ADJ: '시간 조율 필요', NO: '불가', NONE: '응답 없음(불가)', PICKED: '확정', RELEASED: '다른 소장님으로 진행' };

var APP_HEADERS = ['신청번호', '신청일시', '상태', '학원명', '원장님 성함', '연락처', '학원 주소', '진행 장소', '회원 여부', '설명회 대상', '예상 참석 인원',
  '희망일', '시작 시간', '요청사항', '요청사항 확인', '신청 소장님', '응답 기한', '응답 현황', '응답 마감 일시',
  '확정 강연자', '확정 설명회', '확정일', '확정 시간', '금액', '출장비', '결제 기한', '100% 환불 마감', '70% 환불 마감', '50% 환불 마감',
  '결제 안내 문구', '확정 안내 일시', '담당자', '메모', '결제 기한 알림'];
// 소장님 응답 — 신청 한 건에 고른 소장님 수만큼 줄이 생김
var ANS_HEADERS = ['신청번호', '소장님', '설명회', '희망일', '시작 시간', '학원명', '요청 일시', '응답 기한', '응답', '응답 일시', '소장님 메모', '독촉 알림', '응답 토큰'];
// 강연자 — 줄 단위 칸(경력·관련 링크)은 한 줄에 하나씩. 슬로건은 셀 안 줄바꿈. 관련 링크 한 줄 = 「구분 | 주소」
// 클럽하와이 직함은 본사가 정하는 줄 — 경력 맨 위에 항상 보이고, 소장님 입력 페이지에서는 고칠 수 없음
var COACH_HEADERS = ['이름', '노출', '연락처', '클럽하와이 직함', '슬로건', '경력', '관련 링크',
  '프로필 사진 URL', '현장 사진 URL', '우선 수락 동의', '최근 제출', '본사 메모'];
// 설명회(= 소장님 상품) — 소장님 한 명당 여러 줄. 카테고리·대상·적합 시기는 쉼표로 구분, 핵심 내용은 한 줄에 하나씩
var TOPIC_HEADERS = ['강연자', '순서', '노출', '영역', '카테고리', '설명회 이름', '한 줄 소개', '핵심 내용', '대상', '적합 시기'];
// 프로필 제출 — 소장님이 profile.html에서 제출한 내용. 본사가 확인 후 메뉴로 반영
var SUBMIT_HEADERS = ['제출일시', '강연자', '상태', '바뀐 항목', '변경 내용', '개인정보 동의', '게시 동의', '우선 수락 동의', '반영일시', '데이터'];
var SUBMIT_ST = { WAIT: '확인 대기', DONE: '반영 완료', SKIP: '반영 안 함' };
// 소장님이 올린 사진을 모을 드라이브 폴더 이름 (내 드라이브 맨 위에 자동으로 만듦)
var PHOTO_FOLDER = '강연자 사진';
// 예약불가 — 시작 시간이 비어 있으면 그날 하루 전체가 막힘
var BLOCK_HEADERS = ['강연자', '날짜', '사유', '신청번호', '시작 시간'];
// 본사 알림 — 한 줄에 한 사람. 휴대폰이 있으면 알림톡, 메일이 있으면 메일
var HQ_HEADERS = ['이름', '휴대폰', '메일', '메모'];
// 설정 — 항목 이름은 바꾸지 말고 「값」만 고칩니다
var CONF_HEADERS = ['항목', '값', '설명'];
var CONF_ROWS = [
  ['결제 방법', '', '확정·결제 안내 알림톡에 들어갑니다. 예) 계좌이체 ○○은행 000-0000-0000 (예금주 ○○○). 비워 두면 「담당자가 따로 안내드립니다」로 나갑니다.']
];
var LOG_HEADERS = ['일시', '종류', '받는 사람', '번호', '결과', '내용'];
// 소장님이 넣을 수 있는 링크 — 클럽하와이 유튜브·블로그에 있는 본인 영상·글만 (config.js와 같게). 기준 밖 링크는 저장·노출하지 않음
var LINK_TYPES = ['클럽하와이 유튜브', '클럽하와이 블로그'];
var CH_YOUTUBE = '@ISYOUHAWAII', CH_YOUTUBE_ID = 'UCpPQizkoUXzT-xN_ELtEMfA', CH_BLOG = 'isyou0943';

/*
 * 알림톡 문구 — 카카오 템플릿 검수에 이 글을 그대로 등록합니다(#{…}는 변수).
 * 문구를 바꾸면 템플릿도 다시 검수받아야 합니다.
 */
var TEMPLATES = {
  // ── 원장님 ──
  DIRECTOR_RECEIVED:
    '[클럽하와이] 설명회 신청이 접수되었습니다\n\n#{원장님} 원장님, 신청해 주셔서 감사합니다.\n\n' +
    '■ 신청번호: #{신청번호}\n■ 희망 일정: #{일정}\n■ 신청 소장님: #{소장님목록}\n\n' +
    '고르신 소장님들께 일정이 되는지 먼저 확인하고 있습니다.\n가능한 소장님과 조율한 뒤 담당자가 최대한 빠르게 연락드리겠습니다.\n\n' +
    '요청사항도 담당자가 확인한 뒤 함께 안내드립니다.',
  DIRECTOR_CONFIRMED:
    '[클럽하와이] 설명회 일정 확정 및 결제 안내\n\n#{원장님} 원장님, 설명회 일정이 확정되었습니다.\n\n' +
    '■ 소장님: #{확정강연자}\n■ 설명회: #{확정설명회}\n■ 일정: #{확정일시}\n■ 장소: #{장소}\n\n' +
    '■ 결제 금액: #{결제금액}\n■ 결제 기한: #{결제기한}\n■ 결제 방법: #{결제방법}\n\n' +
    '■ 취소·환불: #{환불규정}\n\n궁금한 점은 담당자에게 편하게 연락 주세요.',
  // ── 소장님 ──
  COACH_REQUEST:
    '[클럽하와이] 설명회 출강 요청\n\n#{소장님}님, 설명회 출강 요청이 들어왔습니다.\n\n' +
    '■ 설명회: #{설명회}\n■ 일정: #{일정}\n■ 학원: #{학원명}\n■ 장소: #{장소}\n■ 대상: #{대상} · 예상 인원 #{인원}\n■ 요청사항: #{요청사항}\n\n' +
    '아래 링크에서 「가능 / 시간 조율 필요 / 불가」 중 하나를 골라 주세요.\n▶ #{링크}\n\n' +
    '※ #{응답기한}까지 응답해 주세요. (밤·주말 포함 ' + RESPONSE_HOURS + '시간) 기한 안에 응답이 없으면 「불가」로 처리됩니다.\n' +
    '※ 한 번 보낸 응답은 바꿀 수 없어요. 바꾸셔야 하면 본사 담당자에게 연락 주세요.',
  COACH_REMIND:
    '[클럽하와이] 설명회 출강 요청 — 응답 마감이 다가왔습니다\n\n#{소장님}님, 아래 요청에 아직 응답하지 않으셨습니다.\n\n' +
    '■ 설명회: #{설명회}\n■ 일정: #{일정}\n■ 학원: #{학원명}\n\n▶ #{링크}\n\n※ #{응답기한}까지 응답이 없으면 「불가」로 처리됩니다.',
  COACH_CONFIRMED:
    '[클럽하와이] 설명회 출강 확정 안내\n\n#{소장님}님, 응답해 주셔서 감사합니다.\n아래 설명회가 소장님 출강으로 확정되었습니다.\n\n' +
    '■ 설명회: #{확정설명회}\n■ 일정: #{확정일시}\n■ 학원: #{학원명}\n■ 장소: #{장소}\n■ 대상: #{대상} · 예상 인원 #{인원}\n■ 요청사항: #{요청사항}\n\n' +
    '준비에 필요한 내용은 담당자가 따로 연락드리겠습니다.\n좋은 설명회 부탁드립니다!',
  COACH_RELEASED:
    '[클럽하와이] 설명회 출강 요청 결과 안내\n\n#{소장님}님, 바쁘신 중에도 시간을 내어 응답해 주셔서 정말 감사합니다.\n\n' +
    '#{학원명} 설명회(#{일정})는 원장님과 일정을 맞추는 과정에서 이번에는 다른 소장님과 진행하게 되었습니다.\n' +
    '소장님께서 흔쾌히 시간을 내어 주신 덕분에 원장님께 좋은 선택지를 드릴 수 있었습니다.\n\n' +
    '소장님과 꼭 맞는 요청이 오면 다시 가장 먼저 연락드리겠습니다. 늘 감사합니다.',
  COACH_CLOSED:
    '[클럽하와이] 설명회 출강 요청 마감 안내\n\n#{소장님}님, 안녕하세요.\n\n' +
    '#{학원명} 설명회(#{일정}) 출강 요청은 다른 소장님과 일정이 먼저 확정되어 마감되었습니다.\n' +
    '이 요청에는 따로 응답하지 않으셔도 됩니다.\n\n바쁘신 중에 연락드려 죄송하고, 다음 요청 때 다시 찾아뵙겠습니다. 감사합니다.',
  // ── 본사 ──
  HQ_NEW:
    '[설명회 신청] 새 신청 #{신청번호}\n\n학원: #{학원명} (#{원장님} 원장님 · #{회원})\n연락처: #{연락처}\n진행 장소: #{장소}\n' +
    '대상: #{대상} · 예상 인원 #{인원}\n일정: #{일정}\n요청사항: #{요청사항}\n\n■ 신청 소장님 · 설명회\n#{소장님설명회}\n\n' +
    '소장님께 각각 출강 요청을 보냈습니다(응답 기한 #{응답기한}). 가능 응답이 오면 바로 알려 드립니다.',
  HQ_ANSWER:
    '[설명회] 소장님 응답 #{신청번호}\n\n#{소장님} 소장님: #{응답}#{메모}\n\n#{학원명} (#{원장님} 원장님 · #{연락처})\n일정: #{일정}\n설명회: #{설명회}\n\n' +
    '■ 지금까지 응답\n#{응답현황}\n\n소장님·원장님과 조율해 주세요.',
  HQ_RESULT:
    '[설명회] 소장님 응답 마감 #{신청번호}\n\n#{학원명} (#{원장님} 원장님 · #{연락처})\n일정: #{일정}\n\n#{결과}\n\n#{다음}',
  HQ_PROFILE:
    '[강연자 정보] #{소장님} 소장님이 정보를 제출했습니다\n\n바뀐 항목: #{바뀐항목}\n\n' +
    '시트 「프로필 제출」에서 내용을 확인한 뒤, 그 줄을 고르고 메뉴 「설명회 → 선택한 프로필 제출을 강연자 정보에 반영」을 눌러 주세요.',
  HQ_PAY_OVERDUE:
    '[설명회] 결제 기한 지남 #{신청번호}\n\n#{학원명} (#{원장님} 원장님 · #{연락처})\n확정: #{확정강연자} · #{확정일시}\n결제 기한: #{결제기한}\n\n' +
    '원장님께 확인 후 결제 또는 취소 처리해 주세요. 취소하면 강연자 날짜가 다시 열립니다.'
};

function col_(name) { return APP_HEADERS.indexOf(name) + 1; }
function acol_(name) { return ANS_HEADERS.indexOf(name) + 1; }

/* ================= 처음 한 번 실행 ================= */

/** 시트·머리글·드롭다운·조건부 서식·트리거를 만듭니다. 편집기에서 이 함수를 한 번 실행하세요. */
function setupSheets() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  var apps = ensureSheet_(ss, SH.APPS, APP_HEADERS);
  var ans = ensureSheet_(ss, SH.ANS, ANS_HEADERS);
  ensureSheet_(ss, SH.COACH, COACH_HEADERS);
  ensureSheet_(ss, SH.TOPIC, TOPIC_HEADERS);
  var sub = ensureSheet_(ss, SH.SUBMIT, SUBMIT_HEADERS);
  sub.getRange(2, SUBMIT_HEADERS.indexOf('상태') + 1, sub.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([SUBMIT_ST.WAIT, SUBMIT_ST.DONE, SUBMIT_ST.SKIP], true).build());
  sub.hideColumns(SUBMIT_HEADERS.indexOf('데이터') + 1);
  ensureSheet_(ss, SH.BLOCK, BLOCK_HEADERS);
  var hq = ensureSheet_(ss, SH.HQ, HQ_HEADERS);
  if (hq.getLastRow() === 1) hq.getRange(2, 1, 3, 1).setValues([['담당자'], ['이사님'], ['대표님']]);
  hq.getRange(2, 2, hq.getMaxRows() - 1, 1).setNumberFormat('@');   // 0으로 시작하는 번호가 숫자로 바뀌지 않게
  var conf = ensureSheet_(ss, SH.CONF, CONF_HEADERS);
  var have = rows_(conf).map(function (r) { return String(r['항목']).trim(); });
  CONF_ROWS.forEach(function (r) { if (have.indexOf(r[0]) < 0) conf.appendRow(r); });
  ensureSheet_(ss, SH.LOG, LOG_HEADERS);

  var rows = apps.getMaxRows() - 1;
  apps.getRange(2, col_('상태'), rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS, true).build());
  apps.getRange(2, col_('요청사항 확인'), rows, 1).insertCheckboxes();
  ['확정일', '100% 환불 마감', '70% 환불 마감', '50% 환불 마감'].forEach(function (h) {
    apps.getRange(2, col_(h), rows, 1).setNumberFormat('yyyy-mm-dd');
  });
  ['신청일시', '응답 기한', '응답 마감 일시', '결제 기한', '확정 안내 일시', '결제 기한 알림'].forEach(function (h) {
    apps.getRange(2, col_(h), rows, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
  apps.getRange(2, col_('확정 시간'), rows, 1).setNumberFormat('@');
  apps.hideColumns(col_('결제 기한 알림'));
  ['요청 일시', '응답 기한', '응답 일시', '독촉 알림'].forEach(function (h) {
    ans.getRange(2, acol_(h), ans.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
  ans.hideColumns(acol_('응답 토큰'));

  // 본사가 다음 행동을 해야 하는 줄은 파랗게
  var s = colLetter_(col_('상태'));
  var formula = '=OR(' + NEEDS_HQ.map(function (x) { return '$' + s + '2="' + x + '"'; }).join(',') + ')';
  apps.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula)
    .setBackground('#DCE6FB').setRanges([apps.getRange(2, 1, rows, APP_HEADERS.length)]).build()]);

  var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (handlers.indexOf('onEditInstalled') < 0) ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();
  // 응답 기한·독촉은 15분마다 확인 (기한이 지난 뒤 늦어도 15분 안에 본사에 마감 알림)
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'checkDeadlines') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkDeadlines').timeBased().everyMinutes(15).create();

  // 스크립트 시간대는 코드로 못 바꿔서 확인만 함
  if (Session.getScriptTimeZone() !== TZ) {
    SpreadsheetApp.getUi().alert('스크립트 시간대가 서울이 아닙니다 (지금: ' + Session.getScriptTimeZone() + ').\n' +
      '확장 프로그램 → Apps Script → ⚙ 프로젝트 설정 → 시간대를 「(GMT+09:00) 서울」로 바꾼 뒤 setupSheets를 한 번 더 실행해 주세요.');
  }
  ss.toast('시트 준비가 끝났습니다. 새로고침하면 위쪽에 「설명회」 메뉴가 생깁니다.');
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#111111').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('설명회')
    .addItem('선택한 신청 확정·결제 안내 보내기', 'menuConfirm')
    .addItem('선택한 신청에 소장님 추가 요청', 'menuAddCoach')
    .addSeparator()
    .addItem('선택한 프로필 제출을 강연자 정보에 반영', 'menuApplyProfile')
    .addToUi();
}

/* ================= 페이지 데이터 제공 ================= */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'request') return json_(getRequest_(p.t));
    var ss = SpreadsheetApp.getActive();
    var topics = topicsByCoach_(true);
    var coaches = rows_(ss.getSheetByName(SH.COACH)).filter(function (r) {
      return String(r['노출']).trim().toUpperCase() === 'Y' && r['이름'];
    }).map(function (r) {
      var c = coachFromRow_(r, topics);   // 연락처·동의·본사 메모는 내보내지 않는다
      delete c.agreePriority;
      c.links = c.links.filter(function (l) { return !linkProblem_(l, LINK_TYPES); });   // 기준 밖 링크는 원장님 화면에 안 보임
      return c;
    });
    var blocked = blocks_().map(function (b) { return { coach: b.coach, date: b.date, time: b.time }; });
    // 「신청내역」「소장님 응답」은 절대 내보내지 않는다
    return json_({ ok: true, coaches: coaches, blocked: blocked });
  } catch (err) {
    return json_({ ok: false, error: '데이터를 불러오지 못했습니다.' });
  }
}

/** 소장님 응답 페이지용 — 토큰이 맞는 요청 1건만, 원장님 이름·연락처는 빼고 돌려줍니다. */
function getRequest_(token) {
  var a = findAns_(token);
  if (!a) return { ok: false, error: '요청을 찾을 수 없습니다. 알림톡의 링크로 다시 들어와 주세요.' };
  var app = findApp_(String(a.get('신청번호')));
  if (!app) return { ok: false, error: '신청을 찾을 수 없습니다.' };
  var g = app.get, coach = String(a.get('소장님')).trim(), ds = dateStr_(a.get('희망일')), tm = timeStr_(a.get('시작 시간'));
  return {
    ok: true,
    request: {
      id: String(g('신청번호')), coach: coach, product: String(a.get('설명회') || ''),
      academy: String(g('학원명')), venue: String(g('진행 장소') || g('학원 주소')), target: String(g('설명회 대상')),
      attendees: String(g('예상 참석 인원') || ''), request: String(g('요청사항') || ''),
      date: ds, time: tm, deadline: new Date(a.get('응답 기한')).toISOString(),
      answer: String(a.get('응답')), memo: String(a.get('소장님 메모') || ''),
      others: sameDay_(coach, ds, tm, String(g('신청번호')))
    }
  };
}

/** 같은 소장님 같은 날의 다른 일정 — 확정 일정과, 아직 진행 중인 다른 요청 */
function sameDay_(coach, ds, tm, id) {
  var out = [];
  blocks_().forEach(function (b) {
    if (b.coach === coach && b.date === ds && b.id !== id) out.push({ time: b.time, state: '확정', clash: overlap_(b.time, tm) });
  });
  rows_(SpreadsheetApp.getActive().getSheetByName(SH.ANS)).forEach(function (r) {
    if (String(r['소장님']).trim() !== coach || dateStr_(r['희망일']) !== ds || String(r['신청번호']) === id) return;
    var ans = String(r['응답']);
    if ([ANS.WAIT, ANS.OK, ANS.ADJ].indexOf(ans) < 0) return;
    if (blocks_().some(function (b) { return b.id === String(r['신청번호']); })) return;   // 이미 확정으로 위에 나옴
    out.push({ time: timeStr_(r['시작 시간']), state: ans === ANS.WAIT ? '다른 요청 (응답 대기)' : '다른 요청 (' + ans + ')', clash: overlap_(timeStr_(r['시작 시간']), tm), academy: String(r['학원명'] || '') });
  });
  return out.sort(function (x, y) { return String(x.time).localeCompare(String(y.time)); });
}

function driveImage_(url) {
  url = String(url || '').trim();
  var m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : url;
}

/* ================= 저장 (신청 · 소장님 응답) ================= */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: '요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action === 'profileLogin') return json_(profileLogin_(d));
    if (d.action === 'profileUpload') return json_(profileUpload_(d));
    if (d.action === 'profileSubmit') return json_(profileSubmit_(d));
    if (d.action === 'respond') return json_(respond_(d));
    return json_(apply_(d));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  } finally {
    lock.releaseLock();
  }
}

/** 원장님 신청 저장 → 소장님별 출강 요청 + 원장님 접수 알림 + 본사 알림 */
function apply_(d) {
  var err = validate_(d);
  if (err) return { ok: false, error: err };

  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(SH.APPS);
  var now = new Date(), due = new Date(now.getTime() + RESPONSE_HOURS * 3600 * 1000);
  var id = nextId_(sh, now);
  var picks = d.picks.map(function (p) { return { coach: String(p.coach).trim(), product: String(p.product || '').trim() }; });
  var row = new Array(APP_HEADERS.length).fill('');
  function set(h, v) { row[col_(h) - 1] = v; }
  set('신청번호', id); set('신청일시', now); set('상태', ST.ASKING);
  set('학원명', safe_(d.academy)); set('원장님 성함', safe_(d.director)); set('연락처', "'" + d.phone);
  set('학원 주소', safe_(d.address)); set('진행 장소', safe_(d.venue || d.address)); set('회원 여부', d.member); set('설명회 대상', safe_(d.target));
  set('예상 참석 인원', safe_(d.attendees)); set('희망일', d.date); set('시작 시간', d.time);
  set('요청사항', safe_(d.request)); set('요청사항 확인', d.request ? false : '');
  set('신청 소장님', picks.map(function (p) { return p.coach + ' — ' + (p.product || '요청사항으로 상의'); }).join('\n'));
  set('응답 기한', due);
  set('응답 현황', picks.map(function (p) { return p.coach + ': ' + ANS.WAIT; }).join('\n'));

  var r = sh.getLastRow() + 1;
  sh.getRange(r, col_('희망일'), 1, 2).setNumberFormat('@');   // 날짜·시간이 자동 변환되지 않게 먼저 글자 형식으로
  sh.getRange(r, 1, 1, APP_HEADERS.length).setValues([row]);
  var g = rowGetter_(sh.getRange(r, 1, 1, APP_HEADERS.length).getValues()[0]);
  var v = vars_(g);

  // 소장님마다 응답 줄을 만들고 각각 알림톡
  var ash = ss.getSheetByName(SH.ANS), failed = [];
  picks.forEach(function (p) {
    var token = Utilities.getUuid().replace(/-/g, '');
    var ar = ash.getLastRow() + 1;
    ash.getRange(ar, acol_('희망일'), 1, 2).setNumberFormat('@');
    // 연락처가 없으면 요청을 못 보내니 기한까지 기다리지 않고 바로 불가로 둔다
    var phone = coachPhone_(p.coach);
    ash.getRange(ar, 1, 1, ANS_HEADERS.length).setValues([[id, safe_(p.coach), safe_(p.product), d.date, d.time, safe_(d.academy), now, due,
      phone ? ANS.WAIT : ANS.NO, phone ? '' : now, phone ? '' : NO_PHONE_MEMO, '', token]]);
    if (!phone) { failed.push(p.coach); log_('COACH_REQUEST', p.coach, '', '미발송(연락처 없음)', ''); return; }
    notify_('COACH_REQUEST', p.coach, phone, coachVars_(v, p.coach, p.product, token));
  });
  if (failed.length) v['소장님설명회'] += '\n※ 연락처가 없어 요청을 못 보낸 소장님: ' + failed.join(', ');
  notify_('DIRECTOR_RECEIVED', String(d.director), d.phone, v);
  notifyHQ_('HQ_NEW', v);
  if (failed.length) refreshApp_(id);   // 모두 답한 상태가 됐으면 마감 알림을 바로 보냄
  return { ok: true, id: id };
}

function validate_(d) {
  if (!d) return '신청 내용이 비어 있습니다.';
  var req = ['academy', 'director', 'phone', 'address', 'member', 'target'];
  for (var i = 0; i < req.length; i++) if (!String(d[req[i]] || '').trim()) return '필수 항목이 비어 있습니다.';
  if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(d.phone)) return '휴대폰 번호를 확인해 주세요.';
  if (!Array.isArray(d.picks) || !d.picks.length) return '소장님을 골라 주세요.';
  if (d.picks.length > MAX_PICKS) return '소장님은 최대 ' + MAX_PICKS + '명까지 고를 수 있습니다.';
  var names = d.picks.map(function (p) { return String(p && p.coach || '').trim(); });
  if (names.some(function (n, k) { return !n || names.indexOf(n) !== k; })) return '소장님 선택을 확인해 주세요.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.time)) return '희망 날짜와 시작 시간을 확인해 주세요.';
  var min = today_(); min.setDate(min.getDate() + MIN_DAYS);
  if (parseDate_(d.date) < min) return '진행일 최소 2주 전까지만 신청할 수 있습니다.';
  for (var k = 0; k < names.length; k++) {
    if (clash_(names[k], d.date, d.time)) return names[k] + ' 소장님은 그 시간 앞뒤로 이미 확정된 일정이 있습니다. 시간을 바꾸거나 다른 소장님을 골라 주세요.';
  }
  return '';
}

/** 소장님 응답: choice = 'ok'(가능) / 'adjust'(시간 조율 필요) / 'decline'(불가) */
function respond_(d) {
  var a = findAns_(d.t);
  if (!a) return { ok: false, error: '요청을 찾을 수 없습니다.' };
  if (String(a.get('응답')) !== ANS.WAIT) return { ok: false, error: '이미 응답하신 요청입니다. (' + a.get('응답') + ')' };
  if (new Date(a.get('응답 기한')) < new Date()) return { ok: false, error: '응답 기한이 지났습니다.' };
  var map = { ok: ANS.OK, adjust: ANS.ADJ, decline: ANS.NO }, ans = map[d.choice];
  if (!ans) return { ok: false, error: '응답을 골라 주세요.' };
  var memo = safe_(String(d.memo || '').slice(0, 500));
  var coach = String(a.get('소장님')).trim(), id = String(a.get('신청번호'));
  if (ans === ANS.OK && clash_(coach, dateStr_(a.get('희망일')), timeStr_(a.get('시작 시간')), id)) {
    return { ok: false, error: '이 시간 앞뒤로 이미 확정된 설명회가 있습니다. 「시간 조율 필요」로 가능한 일자·시간을 알려 주세요.' };
  }
  setAns_(a, { '응답': ans, '응답 일시': new Date(), '소장님 메모': memo });
  // 가능·시간 조율 응답은 바로 본사에 — 담당자가 최대한 빨리 원장님과 연결
  var app = findApp_(id);
  if (app && ans !== ANS.NO) {
    var v = coachVars_(vars_(app.get), coach, String(a.get('설명회') || ''), '');
    v['응답'] = ans;
    v['메모'] = memo ? ' (' + memo + ')' : '';
    v['응답현황'] = statusText_(ansOf_(id));
    notifyHQ_('HQ_ANSWER', v);
  }
  refreshApp_(id);
  return { ok: true };
}

/* ================= 응답이 모두 모이면 본사에 마감 알림 ================= */

/** 응답이 바뀔 때마다 신청 줄의 응답 현황을 고치고, 모두 답했으면 본사에 마감 알림 */
function refreshApp_(id) {
  var app = findApp_(id);
  if (!app) return;
  var list = ansOf_(id);
  writeStatus_(app.sheet, app.row, list);
  if (String(app.get('상태')) !== ST.ASKING) return;
  if (list.some(function (a) { return String(a.get('응답')) === ANS.WAIT; })) return;
  var r = resultText_(list);
  setCells_(app.sheet, app.row, { '상태': r.any ? ST.RESULT : ST.NONE, '응답 마감 일시': new Date() });
  var v = vars_(rowGetter_(app.sheet.getRange(app.row, 1, 1, APP_HEADERS.length).getValues()[0]));
  v['결과'] = r.text;
  v['다음'] = r.any
    ? '가능한 소장님·원장님과 조율한 뒤, 시트에 확정 강연자·확정일·확정 시간·금액을 넣고 메뉴 「설명회 → 선택한 신청 확정·결제 안내 보내기」를 눌러 주세요.'
    : '가능한 소장님이 없습니다. 원장님께 연락해 다른 날짜·소장님을 정한 뒤 메뉴 「설명회 → 선택한 신청에 소장님 추가 요청」을 써 주세요.';
  notifyHQ_('HQ_RESULT', v);
}

function statusText_(list) {
  return list.map(function (a) {
    return a.get('소장님') + ': ' + a.get('응답') + (a.get('소장님 메모') ? ' (' + a.get('소장님 메모') + ')' : '');
  }).join('\n');
}
function writeStatus_(sh, row, list) { sh.getRange(row, col_('응답 현황')).setValue(statusText_(list)); }

function resultText_(list) {
  function names(arr) { return arr.map(function (a) { return a.get('소장님') + (a.get('설명회') ? '(' + a.get('설명회') + ')' : ''); }).join(', '); }
  function pick(ans) { return list.filter(function (a) { return ans.indexOf(String(a.get('응답'))) >= 0; }); }
  var ok = pick([ANS.OK]), adj = pick([ANS.ADJ]), no = pick([ANS.NO, ANS.NONE]);
  var lines = [];
  if (ok.length) lines.push('■ 가능: ' + names(ok));
  if (adj.length) lines.push('■ 시간 조율 시 가능: ' + adj.map(function (a) { return a.get('소장님') + ' — ' + (a.get('소장님 메모') || ''); }).join(', '));
  if (no.length) lines.push('■ 불가: ' + no.map(function (a) { return a.get('소장님'); }).join(', '));
  return { text: lines.join('\n'), any: ok.length + adj.length > 0 };
}

/* ================= 담당자 메뉴: 확정·결제 안내 ================= */

/**
 * 담당자가 소장님·원장님과 조율을 끝낸 뒤 — 「신청내역」에서 그 줄을 고르고 실행
 * 원장님께 확정·결제 안내, 확정 소장님께 확정 안내, 가능하다고 했던 다른 소장님께 다른 소장님으로 진행 안내,
 * 아직 응답 전인 소장님께 요청 마감 안내를 보내고, 그 시간을 예약불가로 막습니다.
 */
function menuConfirm() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSheet(), row = sh.getActiveRange().getRow();
  if (sh.getName() !== SH.APPS || row < 2) { ui.alert('「신청내역」에서 확정할 신청 줄을 먼저 눌러 주세요.'); return; }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var g = rowGetter_(sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0]);
    var id = String(g('신청번호')), status = String(g('상태'));
    if ([ST.PAID, ST.DONE, ST.CANCEL].indexOf(status) >= 0) { ui.alert('이미 「' + status + '」인 신청입니다.'); return; }
    var coach = String(g('확정 강연자')).trim(), date = g('확정일'), tm = timeStr_(g('확정 시간'));
    var miss = [];
    if (!coach) miss.push('확정 강연자');
    if (!(date instanceof Date)) miss.push('확정일 (날짜 형식)');
    if (!/^\d{1,2}:\d{2}$/.test(tm)) miss.push('확정 시간 (예: 14:00)');
    if (!num_(g('금액'))) miss.push('금액');
    if (miss.length) { ui.alert('먼저 채워 주세요: ' + miss.join(', ')); return; }
    if (!coachPhone_(coach)) { ui.alert('「강연자」 시트에서 ' + coach + ' 소장님의 연락처를 찾지 못했습니다. 이름을 확인해 주세요.'); return; }
    if (clash_(coach, dateStr_(date), tm, id)) {
      ui.alert(coach + ' 소장님은 ' + krDate_(date) + ' ' + krTime_(tm) + ' 앞뒤 ' + OVERLAP_HOURS + '시간 안에 이미 확정된 일정이 있습니다.');
      return;
    }
    var resend = !!g('확정 안내 일시');
    if (resend && ui.alert('이미 ' + Utilities.formatDate(new Date(g('확정 안내 일시')), TZ, 'M월 d일 HH:mm') + '에 확정 안내를 보냈습니다.\n' +
      '원장님께만 확정·결제 안내를 다시 보낼까요? (소장님들께는 다시 보내지 않습니다)', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

    // 확정 설명회가 비어 있으면 그 소장님이 요청받은 설명회로
    var list = ansOf_(id);
    var mine = list.filter(function (a) { return String(a.get('소장님')).trim() === coach; })[0];
    if (!g('확정 설명회') && mine && mine.get('설명회')) sh.getRange(row, col_('확정 설명회')).setValue(String(mine.get('설명회')));
    if (!g('결제 기한')) sh.getRange(row, col_('결제 기한')).setValue(payDeadline_(new Date()));
    fillPayment_(sh, row);
    g = rowGetter_(sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0]);
    var v = vars_(g);

    var others = list.filter(function (a) { return String(a.get('소장님')).trim() !== coach; });
    var released = others.filter(function (a) { return [ANS.OK, ANS.ADJ].indexOf(String(a.get('응답'))) >= 0; });
    var closed = others.filter(function (a) { return String(a.get('응답')) === ANS.WAIT; });
    var preview = '아래 내용으로 보낼까요?\n\n[원장님께 — ' + v['원장님'] + ' 원장님]\n' + fill_(TEMPLATES.DIRECTOR_CONFIRMED, v) +
      (resend ? '' : '\n\n[소장님께]\n· 확정 안내: ' + coach +
        (released.length ? '\n· 다른 소장님으로 진행 안내: ' + released.map(function (a) { return a.get('소장님'); }).join(', ') : '') +
        (closed.length ? '\n· 요청 마감 안내(응답 전): ' + closed.map(function (a) { return a.get('소장님'); }).join(', ') : ''));
    if (ui.alert('확정·결제 안내 — ' + id, preview, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

    notify_('DIRECTOR_CONFIRMED', v['원장님'], v['연락처'], v);
    if (!resend) {
      notify_('COACH_CONFIRMED', coach, coachPhone_(coach), coachVars_(v, coach, String(g('확정 설명회') || ''), mine ? String(mine.get('응답 토큰')) : ''));
      if (mine) setAns_(mine, { '응답': ANS.PICKED });
      released.concat(closed).forEach(function (a) {
        var name = String(a.get('소장님')).trim(), wasWaiting = String(a.get('응답')) === ANS.WAIT;
        setAns_(a, { '응답': ANS.RELEASED });
        notify_(wasWaiting ? 'COACH_CLOSED' : 'COACH_RELEASED', name, coachPhone_(name), coachVars_(v, name, String(a.get('설명회') || ''), String(a.get('응답 토큰'))));
      });
      writeStatus_(sh, row, ansOf_(id));
    }
    removeBlock_(id);
    sh.getParent().getSheetByName(SH.BLOCK).appendRow([coach, date, '확정 예약', id, "'" + tm]);
    setCells_(sh, row, { '상태': ST.PAY, '확정 안내 일시': new Date() });
    SpreadsheetApp.getActive().toast('확정·결제 안내를 보냈습니다. 결과는 「알림기록」에서 확인할 수 있습니다.');
  } finally {
    lock.releaseLock();
  }
}

/* ================= 담당자 메뉴: 소장님 추가 요청 ================= */

function menuAddCoach() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSheet();
  var row = sh.getActiveRange().getRow();
  if (sh.getName() !== SH.APPS || row < 2) { ui.alert('「신청내역」에서 요청을 보낼 신청 줄을 먼저 눌러 주세요.'); return; }
  var g = rowGetter_(sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0]);
  var status = String(g('상태')), id = String(g('신청번호'));
  if ([ST.CONFIRMED, ST.PAY, ST.PAID, ST.DONE, ST.CANCEL].indexOf(status) >= 0) { ui.alert('이미 「' + status + '」인 신청입니다.'); return; }
  var ds = dateStr_(g('희망일')), tm = timeStr_(g('시작 시간'));
  var res = ui.prompt('소장님 추가 요청 — ' + id, '지금까지: \n' + g('응답 현황') + '\n\n요청할 소장님 이름과 설명회를 「이름 / 설명회」로 입력하세요. (설명회는 비워도 됩니다)\n' +
    '날짜·시간은 신청과 같습니다(' + ds + ' ' + tm + '). 다른 날짜·시간이면 먼저 「희망일」·「시작 시간」 칸을 고친 뒤 실행하세요.\n응답 기한은 지금부터 ' + RESPONSE_HOURS + '시간입니다.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var parts = res.getResponseText().split('/'), coach = String(parts[0] || '').trim(), product = String(parts[1] || '').trim();
  if (!coach) { ui.alert('소장님 이름을 입력해 주세요.'); return; }
  var phone = coachPhone_(coach);
  if (!phone) { ui.alert('「강연자」 시트에서 ' + coach + '님의 연락처를 찾지 못했습니다.'); return; }
  if (ansOf_(id).some(function (a) { return String(a.get('소장님')).trim() === coach && String(a.get('응답')) === ANS.WAIT; })) { ui.alert('이미 응답을 기다리는 소장님입니다.'); return; }
  if (clash_(coach, ds, tm, id)) { ui.alert(coach + ' 소장님은 그 시간 앞뒤 ' + OVERLAP_HOURS + '시간 안에 이미 확정된 일정이 있습니다.'); return; }

  var now = new Date(), due = new Date(now.getTime() + RESPONSE_HOURS * 3600 * 1000), token = Utilities.getUuid().replace(/-/g, '');
  var ash = sh.getParent().getSheetByName(SH.ANS), ar = ash.getLastRow() + 1;
  ash.getRange(ar, acol_('희망일'), 1, 2).setNumberFormat('@');
  ash.getRange(ar, 1, 1, ANS_HEADERS.length).setValues([[id, safe_(coach), safe_(product), ds, tm, String(g('학원명')), now, due, ANS.WAIT, '', '', '', token]]);
  // 다시 「응답 대기」로 — 새 소장님까지 답하면 본사에 마감 알림을 다시 보냄
  setCells_(sh, row, { '상태': ST.ASKING, '응답 기한': due });
  writeStatus_(sh, row, ansOf_(id));
  var sent = notify_('COACH_REQUEST', coach, phone, coachVars_(vars_(rowGetter_(sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0])), coach, product, token));
  ui.alert(coach + '님에게 출강 요청을 ' + (sent ? '보냈습니다.' : '기록했습니다. (알림톡 설정 전이라 「알림기록」에 문구만 남겼습니다)') +
    '\n응답 링크: ' + COACH_PAGE_URL + '?t=' + token);
}

/* ================= 15분마다: 응답 기한 · 독촉 · 결제 기한 ================= */

function checkDeadlines() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActive(), now = new Date(), touched = {};
    var ash = ss.getSheetByName(SH.ANS), n = ash.getLastRow();
    if (n >= 2) {
      ash.getRange(2, 1, n - 1, ANS_HEADERS.length).getValues().forEach(function (r, k) {
        var a = ansRow_(ash, k + 2, r);
        if (String(a.get('응답')) !== ANS.WAIT) return;
        var due = a.get('응답 기한');
        if (!(due instanceof Date)) return;
        if (due < now) {
          setAns_(a, { '응답': ANS.NONE, '응답 일시': now });
          touched[String(a.get('신청번호'))] = true;
        } else if (due - now < REMIND_HOURS * 3600 * 1000 && !a.get('독촉 알림')) {
          setAns_(a, { '독촉 알림': now });
          var app = findApp_(String(a.get('신청번호')));
          if (app) notify_('COACH_REMIND', String(a.get('소장님')), coachPhone_(String(a.get('소장님')).trim()),
            coachVars_(vars_(app.get), String(a.get('소장님')).trim(), String(a.get('설명회') || ''), String(a.get('응답 토큰'))));
        }
      });
    }
    Object.keys(touched).forEach(refreshApp_);

    var sh = ss.getSheetByName(SH.APPS), m = sh.getLastRow();
    if (m < 2) return;
    sh.getRange(2, 1, m - 1, APP_HEADERS.length).getValues().forEach(function (r, k) {
      var g = rowGetter_(r), pay = g('결제 기한');
      if (String(g('상태')) === ST.PAY && pay instanceof Date && pay < now && !g('결제 기한 알림')) {
        sh.getRange(k + 2, col_('결제 기한 알림')).setValue(now);
        notifyHQ_('HQ_PAY_OVERDUE', vars_(g));
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/* ================= 시트 직접 편집 시 자동 처리 ================= */

function onEditInstalled(e) {
  var sh = e.range.getSheet();
  if (sh.getName() !== SH.APPS || e.range.getRow() < 2 || e.range.getNumRows() > 1 || e.range.getNumColumns() > 1) return;
  var c = e.range.getColumn(), row = e.range.getRow();
  if (['상태', '확정 강연자', '확정일', '확정 시간', '금액', '출장비'].map(col_).indexOf(c) < 0) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var g = rowGetter_(sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0]);
    var id = String(g('신청번호')), coach = String(g('확정 강연자')).trim(), status = g('상태'), date = g('확정일'), tm = timeStr_(g('확정 시간'));

    if (status === ST.CANCEL) {
      removeBlock_(id);
    } else if ((status === ST.CONFIRMED || status === ST.PAY) && (c === col_('상태') || c === col_('확정일') || c === col_('확정 강연자') || c === col_('확정 시간'))) {
      // 메뉴를 쓰지 않고 상태를 직접 「일정확정」·「결제안내」로 바꿔도 그 시간을 막는다 (알림톡은 메뉴로만 나감)
      if (!coach || !(date instanceof Date)) {
        if (c === col_('상태')) {
          SpreadsheetApp.getUi().alert('「확정 강연자」와 「확정일」을 먼저 입력한 뒤 상태를 「일정확정」으로 바꿔 주세요.');
          e.range.setValue(e.oldValue || ST.RESULT);
        }
        return;
      }
      if (clash_(coach, dateStr_(date), tm, id)) {
        SpreadsheetApp.getUi().alert('이 시간 앞뒤 ' + OVERLAP_HOURS + '시간 안에 이미 확정된 일정이 있습니다.\n(' + coach + ' · ' + krDate_(date) + ' ' + krTime_(tm) + ')');
        e.range.setValue(e.oldValue || (c === col_('상태') ? ST.RESULT : ''));
        return;
      }
      removeBlock_(id);
      sh.getParent().getSheetByName(SH.BLOCK).appendRow([coach, date, '확정 예약', id, tm ? "'" + tm : '']);
      if (status === ST.PAY && !g('결제 기한')) sh.getRange(row, col_('결제 기한')).setValue(payDeadline_(new Date()));
    }
    fillPayment_(sh, row);
  } finally {
    lock.releaseLock();
  }
}

/** 결제 기한 = 지금 + PAY_HOURS. 주말에 걸리면 월요일 같은 시각으로 미룬다. */
function payDeadline_(from) {
  var d = new Date(from.getTime() + PAY_HOURS * 3600 * 1000);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function removeBlock_(id) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.BLOCK);
  var n = sh.getLastRow();
  if (n < 2) return;
  var vals = sh.getRange(2, 1, n - 1, 4).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][3]) === id) sh.deleteRow(i + 2);
}

/** 확정일·금액이 있으면 환불 마감일과 결제 안내 문구를 채웁니다. */
function fillPayment_(sh, row) {
  var g = rowGetter_(sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0]);
  var date = g('확정일');
  var cells = ['100% 환불 마감', '70% 환불 마감', '50% 환불 마감', '결제 안내 문구'].map(function (h) { return sh.getRange(row, col_(h)); });
  if (!(date instanceof Date)) { cells.forEach(function (r) { r.clearContent(); }); return; }
  var d100 = shift_(date, -15), d70 = shift_(date, -8), d50 = shift_(date, -4), dNo = shift_(date, -3);
  cells[0].setValue(d100); cells[1].setValue(d70); cells[2].setValue(d50);
  var fee = num_(g('금액')), trip = num_(g('출장비'));
  if (!fee) { cells[3].setValue('(금액을 입력하면 문구가 만들어집니다)'); return; }
  var total = fee + trip;
  var msg = '[클럽하와이] ' + g('확정 강연자') + ' 소장님 설명회 일정이 ' + krDate_(date) + (g('확정 시간') ? ' ' + krTime_(timeStr_(g('확정 시간'))) : '') + '로 확정되었습니다. ' +
    '결제 금액은 ' + total.toLocaleString('ko-KR') + '원(VAT 별도' + (trip ? ', 출장비 ' + trip.toLocaleString('ko-KR') + '원 포함' : '') + ')입니다. ' +
    '취소 시 ' + krMD_(d100) + '까지 100%, ' + krMD_(d70) + '까지 70%, ' + krMD_(d50) + '까지 50% 환불되며, ' + krMD_(dNo) + '부터는 환불되지 않습니다.';
  cells[3].setValue(msg);
}

/* ================= 일정 겹침 ================= */

/** 예약불가 목록 — { coach, date, time('' = 하루 전체), id } */
function blocks_() {
  return rows_(SpreadsheetApp.getActive().getSheetByName(SH.BLOCK)).filter(function (r) { return r['강연자'] && r['날짜']; }).map(function (r) {
    return { coach: String(r['강연자']).trim(), date: dateStr_(r['날짜']), time: timeStr_(r['시작 시간']), id: String(r['신청번호'] || '') };
  });
}
function mins_(t) { var p = String(t).split(':'); return +p[0] * 60 + +(p[1] || 0); }
/** 두 시작 시간이 OVERLAP_HOURS 안이면 겹침. 어느 한쪽 시간이 비어 있으면(하루 전체) 겹침 */
function overlap_(a, b) { return !a || !b || Math.abs(mins_(a) - mins_(b)) < OVERLAP_HOURS * 60; }
/** 그 소장님이 그 날짜·시간에 확정된 일정과 겹치는지 (exceptId 신청은 빼고) */
function clash_(coach, ds, tm, exceptId) {
  return blocks_().some(function (b) { return b.coach === coach && b.date === ds && b.id !== (exceptId || '-') && overlap_(b.time, tm); });
}

/* ================= 알림톡 ================= */

/** 알림톡 변수 값 — 신청 한 줄에서 만듭니다. */
function vars_(g) {
  function when(v) { return v instanceof Date ? krDate_(v) + ' ' + krTime_(Utilities.formatDate(v, TZ, 'HH:mm')) : ''; }
  var date = g('확정일'), ds = dateStr_(g('희망일'));
  return {
    '신청번호': String(g('신청번호')), '원장님': String(g('원장님 성함')), '학원명': String(g('학원명')),
    '연락처': String(g('연락처')).replace(/^'/, ''), '회원': String(g('회원 여부')),
    '장소': String(g('진행 장소') || g('학원 주소')), '대상': String(g('설명회 대상')),
    '인원': g('예상 참석 인원') ? g('예상 참석 인원') + '명' : '미정', '요청사항': String(g('요청사항') || '없음'),
    '일정': ds ? krDate_(parseDate_(ds)) + ' ' + krTime_(timeStr_(g('시작 시간'))) + ' 시작' : '-',
    '소장님목록': String(g('신청 소장님')).split('\n').map(function (x) { return x.split(' — ')[0]; }).join(', '),
    '소장님설명회': String(g('신청 소장님')),
    '응답기한': when(g('응답 기한')),
    '확정강연자': String(g('확정 강연자')),
    '확정일시': date instanceof Date ? krDate_(date) + (g('확정 시간') ? ' ' + krTime_(timeStr_(g('확정 시간'))) : '') : '',
    '확정설명회': String(g('확정 설명회') || '') || '담당자와 협의한 내용',
    '결제기한': when(g('결제 기한')),
    '결제금액': payText_(g),
    '결제방법': conf_('결제 방법') || '담당자가 따로 안내드립니다.',
    '환불규정': date instanceof Date ? refundText_(date) : ''
  };
}
/** 소장님 한 분에게 보낼 변수 — 신청 변수 + 소장님·설명회·응답 링크 */
function coachVars_(v, coach, product, token) {
  var o = {};
  Object.keys(v).forEach(function (k) { o[k] = v[k]; });
  o['소장님'] = coach;
  o['설명회'] = product || '요청사항으로 상의';
  o['링크'] = COACH_PAGE_URL + '?t=' + token;
  return o;
}

function payText_(g) {
  var fee = num_(g('금액')), trip = num_(g('출장비'));
  if (!fee) return '';
  return (fee + trip).toLocaleString('ko-KR') + '원 (VAT 별도' + (trip ? ', 출장비 ' + trip.toLocaleString('ko-KR') + '원 포함' : '') + ')';
}
function refundText_(date) {
  return krMD_(shift_(date, -15)) + '까지 100%, ' + krMD_(shift_(date, -8)) + '까지 70%, ' + krMD_(shift_(date, -4)) + '까지 50% 환불, ' +
    krMD_(shift_(date, -3)) + '부터는 환불되지 않습니다.';
}
/** 「설정」 시트의 값 */
function conf_(key) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.CONF);
  var hit = sh ? rows_(sh).filter(function (r) { return String(r['항목']).trim() === key; })[0] : null;
  return hit ? String(hit['값'] || '').trim() : '';
}

function fill_(tpl, v) { return tpl.replace(/#\{([^}]+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }

/** 본사 알림 — 「본사 알림」 시트의 사람마다 휴대폰이면 알림톡, 메일이면 메일 */
function notifyHQ_(type, v) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.HQ);
  var list = sh ? rows_(sh) : [];
  var text = fill_(TEMPLATES[type], v), any = false;
  list.forEach(function (r) {
    var name = String(r['이름'] || '본사').trim(), phone = digits_(r['휴대폰']), mail = String(r['메일'] || '').trim();
    if (phone) { notify_(type, name, phone, v); any = true; }
    if (mail) {
      any = true;
      try {
        MailApp.sendEmail({ to: mail, subject: text.split('\n')[0], body: text + '\n\n시트: ' + SpreadsheetApp.getActive().getUrl() });
      } catch (e) { console.error(e); }
    }
  });
  if (!any) log_(type, '본사', '', '미발송(「본사 알림」 시트에 번호·메일 없음)', text);
}

/** 알림톡 1건 보내기. 설정 전이면 「알림기록」에 내용만 남기고 false를 돌려줍니다. */
function notify_(type, who, phone, v) {
  var text = fill_(TEMPLATES[type], v);
  if (!phone) { log_(type, who, '', '미발송(번호 없음)', text); return false; }
  var p = PropertiesService.getScriptProperties().getProperties();
  var tpl = p['TPL_' + type];
  if (!p.SOLAPI_API_KEY || !p.SOLAPI_API_SECRET || !p.SOLAPI_PFID || !tpl) {
    log_(type, who, phone, '미발송(설정 전)', text);
    return false;
  }
  var variables = {};
  (TEMPLATES[type].match(/#\{[^}]+\}/g) || []).forEach(function (k) { variables[k] = String(v[k.slice(2, -1)] || '-'); });
  var body = {
    messages: [{
      to: String(phone).replace(/[^\d]/g, ''),
      from: p.SOLAPI_FROM || '',
      kakaoOptions: { pfId: p.SOLAPI_PFID, templateId: tpl, variables: variables }
    }]
  };
  try {
    var res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
      headers: { Authorization: solapiAuth_(p.SOLAPI_API_KEY, p.SOLAPI_API_SECRET) }, muteHttpExceptions: true
    });
    var ok = res.getResponseCode() < 300;
    log_(type, who, phone, ok ? '발송 요청' : '실패 ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200), text);
    return ok;
  } catch (e) {
    log_(type, who, phone, '실패 ' + e, text);
    return false;
  }
}

function solapiAuth_(key, secret) {
  var date = new Date().toISOString();
  var salt = Utilities.getUuid().replace(/-/g, '');
  var sig = Utilities.computeHmacSha256Signature(date + salt, secret).map(function (b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
  return 'HMAC-SHA256 apiKey=' + key + ', date=' + date + ', salt=' + salt + ', signature=' + sig;
}

function log_(type, who, phone, result, text) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.LOG);
  if (sh) sh.appendRow([new Date(), type, who, phone ? "'" + phone : '', result, text]);
}

/* ================= 도우미 ================= */

function nextId_(sh, now) {
  var prefix = 'SEM-' + Utilities.formatDate(now, TZ, 'yyyyMMdd') + '-';
  var max = 0;
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var v = String(r[0]);
      if (v.indexOf(prefix) === 0) max = Math.max(max, parseInt(v.slice(prefix.length), 10) || 0);
    });
  }
  return prefix + String(max + 1).padStart(3, '0');
}

/** 신청 한 줄 찾기 — 신청번호로 */
function findApp_(id) { return findAppBy_(col_('신청번호'), String(id)); }
function findAppBy_(c, val) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.APPS), n = sh.getLastRow();
  if (n < 2) return null;
  var vals = sh.getRange(2, 1, n - 1, APP_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][c - 1]) === val) return { sheet: sh, row: i + 2, get: rowGetter_(vals[i]) };
  }
  return null;
}

/** 소장님 응답 줄 — 토큰으로 하나 / 신청번호로 모두 */
function ansRow_(sh, row, r) { return { sheet: sh, row: row, get: function (h) { return r[acol_(h) - 1]; } }; }
function findAns_(token) {
  token = String(token || '');
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return allAns_().filter(function (a) { return String(a.get('응답 토큰')) === token; })[0] || null;
}
function ansOf_(id) { return allAns_().filter(function (a) { return String(a.get('신청번호')) === id; }); }
function allAns_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.ANS), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, ANS_HEADERS.length).getValues().map(function (r, i) { return ansRow_(sh, i + 2, r); });
}
function setAns_(a, map) { Object.keys(map).forEach(function (h) { a.sheet.getRange(a.row, acol_(h)).setValue(map[h]); }); }

function rowGetter_(r) { return function (h) { return r[col_(h) - 1]; }; }
function setCells_(sh, row, map) { Object.keys(map).forEach(function (h) { sh.getRange(row, col_(h)).setValue(map[h]); }); }

// 연락처 칸에 번호가 여러 개면 쉼표·줄바꿈으로 구분 — 알림은 첫 번호로, 입력 페이지 로그인은 어느 번호로든
function phones_(v) {
  return String(v || '').split(/[,\n\/]|또는/).map(function (x) { return x.replace(/[^\d]/g, ''); })
    .filter(function (x) { return x.length >= 10; });
}

function coachPhone_(name) {
  var hit = rows_(SpreadsheetApp.getActive().getSheetByName(SH.COACH)).filter(function (r) { return String(r['이름']).trim() === name; })[0];
  return hit ? (phones_(hit['연락처'])[0] || '') : '';
}

function rows_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getDataRange().getValues();
  var head = vals.shift().map(function (h) { return String(h).trim(); });
  return vals.map(function (r) {
    var o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

/** 입력값이 =, +, -, @ 로 시작하면 시트가 수식으로 읽지 않게 글자로 저장합니다. */
function safe_(v) { v = String(v == null ? '' : v).trim(); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function today_() { return parseDate_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')); }
function dateStr_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v).trim().slice(0, 10).replace(/\./g, '-'); }
function timeStr_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'HH:mm') : String(v || '').trim(); }
function parseDate_(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function shift_(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function num_(v) { return Number(String(v || '').replace(/[^\d.]/g, '')) || 0; }
function krMD_(d) { return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
function krDate_(d) { return d.getFullYear() + '년 ' + krMD_(d) + '(' + '일월화수목금토'.charAt(d.getDay()) + ')'; }
function krTime_(t) {
  var p = String(t).split(':'), h = +p[0], m = +(p[1] || 0);
  if (isNaN(h)) return String(t);
  return (h < 12 ? '오전 ' : '오후 ') + (h % 12 === 0 ? 12 : h % 12) + '시' + (m ? ' ' + m + '분' : '');
}

/* ================= 강연자 정보 입력 (profile.html) ================= */

function lines_(v) { return String(v || '').split('\n').map(function (x) { return x.trim(); }).filter(String); }
function commas_(v) { return String(v || '').split(/[,\n]/).map(function (x) { return x.trim(); }).filter(String); }
function digits_(v) { return String(v || '').replace(/\D/g, ''); }

/** 「설명회」를 강연자 이름별로 묶음. onlyShown이면 노출이 N인 설명회는 뺌 */
function topicsByCoach_(onlyShown) {
  var out = {};
  rows_(SpreadsheetApp.getActive().getSheetByName(SH.TOPIC)).filter(function (r) {
    return r['강연자'] && r['설명회 이름'] && !(onlyShown && String(r['노출']).trim().toUpperCase() === 'N');
  }).sort(function (a, b) { return (Number(a['순서']) || 99) - (Number(b['순서']) || 99); }).forEach(function (r) {
    var who = String(r['강연자']).trim();
    (out[who] = out[who] || []).push({
      area: String(r['영역'] || ''), cats: commas_(r['카테고리']), name: String(r['설명회 이름']).trim(), intro: String(r['한 줄 소개'] || ''),
      points: lines_(r['핵심 내용']), targets: commas_(r['대상']), seasons: commas_(r['적합 시기'])
    });
  });
  return out;
}

function coachFromRow_(r, topics) {
  var name = String(r['이름']).trim();
  return {
    name: name, title: String(r['클럽하와이 직함'] || '').trim(), slogan: lines_(r['슬로건']),
    history: lines_(r['경력']),
    links: lines_(r['관련 링크']).map(function (l) {
      var i = l.indexOf('|');
      return i >= 0 ? { type: l.slice(0, i).trim(), url: l.slice(i + 1).trim() } : { type: '', url: l };
    }).filter(function (l) { return l.url; }),
    photo: driveImage_(r['프로필 사진 URL']), photos: commas_(r['현장 사진 URL']).map(driveImage_),
    agreePriority: String(r['우선 수락 동의']).trim().toUpperCase() === 'Y',
    topics: topics[name] || []
  };
}

/** 번호로 강연자 찾기 — 노출 여부와 상관없이 「강연자」 시트에 있으면 들어올 수 있음 */
function coachByPhone_(phone) {
  phone = digits_(phone);
  if (phone.length < 10) return null;
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.COACH);
  var list = rows_(sh);
  for (var i = 0; i < list.length; i++) {
    if (list[i]['이름'] && phones_(list[i]['연락처']).indexOf(phone) >= 0) return { row: i + 2, r: list[i] };
  }
  return null;
}

function profileLogin_(d) {
  var hit = coachByPhone_(d.phone);
  if (!hit) return { ok: false, error: '등록된 번호가 아니에요. 번호를 다시 확인하시거나 본사 담당자에게 말씀해 주세요.' };
  var coach = coachFromRow_(hit.r, topicsByCoach_(false));
  // 아직 반영 전인 제출이 있으면 그 내용으로 이어서 고치게 함
  var wait = lastSubmit_(coach.name, SUBMIT_ST.WAIT);
  if (wait) {
    var data = JSON.parse(wait.r['데이터']);
    data.photo = driveImage_(data.photo);
    data.photos = (data.photos || []).map(driveImage_);
    data.title = coach.title;   // 직함은 늘 시트 값
    data.name = coach.name;
    return { ok: true, coach: data, pending: true };
  }
  return { ok: true, coach: coach, pending: false };
}

function lastSubmit_(name, state) {
  var list = rows_(SpreadsheetApp.getActive().getSheetByName(SH.SUBMIT));
  for (var i = list.length - 1; i >= 0; i--) {
    if (String(list[i]['강연자']).trim() === name && (!state || list[i]['상태'] === state)) return { row: i + 2, r: list[i] };
  }
  return null;
}

/** 사진 1장 저장 — 드라이브 「강연자 사진/이름」 폴더, 링크가 있는 사람은 볼 수 있게 */
function profileUpload_(d) {
  var hit = coachByPhone_(d.phone);
  if (!hit) return { ok: false, error: '번호를 확인하지 못했습니다. 다시 들어와 주세요.' };
  var bytes = Utilities.base64Decode(String(d.data || ''));
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) return { ok: false, error: '사진을 올리지 못했습니다. 15MB 이하의 사진으로 다시 올려 주세요.' };
  var name = String(hit.r['이름']).trim();
  var folder = subFolder_(subFolder_(DriveApp.getRootFolder(), PHOTO_FOLDER), name);
  var stamp = Utilities.formatDate(new Date(), TZ, 'yyMMdd-HHmmss');
  var file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', (d.kind === 'main' ? '프로필_' : '현장_') + stamp + '.jpg'));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
}

function subFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** 제출 저장 — 바로 반영하지 않고 「프로필 제출」에 쌓은 뒤 본사 알림 */
function profileSubmit_(d) {
  var hit = coachByPhone_(d.phone);
  if (!hit) return { ok: false, error: '번호를 확인하지 못했습니다. 다시 들어와 주세요.' };
  var data = cleanProfile_(d.data || {});
  for (var k = 0; k < data.links.length; k++) {
    if (data.links[k].type !== '클럽하와이 유튜브') continue;
    var bad = ytChannelProblem_(data.links[k].url);
    if (bad) return { ok: false, error: '링크 ' + (k + 1) + ': ' + bad };
  }
  if (!data.topics.length) return { ok: false, error: '설명회를 1개 이상 적어 주세요.' };
  if (!data.agreePrivacy || !data.agreePriority || !data.agreePublish) return { ok: false, error: '확인 및 동의 세 항목에 모두 체크해 주세요.' };
  if (!data.photo) return { ok: false, error: '프로필 사진을 올려 주세요.' };
  var name = String(hit.r['이름']).trim();
  var before = coachFromRow_(hit.r, topicsByCoach_(false));
  var diff = profileDiff_(before, data);
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.SUBMIT);
  // 같은 강연자의 확인 대기 제출이 있으면 새 내용으로 덮어씀 (여러 번 제출해도 한 줄)
  var wait = lastSubmit_(name, SUBMIT_ST.WAIT);
  var row = [new Date(), name, SUBMIT_ST.WAIT, diff.keys.join(', ') || '바뀐 내용 없음', diff.text.join('\n'),
    data.agreePrivacy ? 'Y' : 'N', data.agreePublish ? 'Y' : 'N', data.agreePriority ? 'Y' : 'N', '', JSON.stringify(data)];
  if (wait) sh.getRange(wait.row, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  SpreadsheetApp.getActive().getSheetByName(SH.COACH).getRange(hit.row, COACH_HEADERS.indexOf('최근 제출') + 1).setValue(new Date());
  notifyHQ_('HQ_PROFILE', { '소장님': name, '바뀐항목': diff.keys.join(', ') || '없음' });
  return { ok: true };
}

function ytId_(u) { var m = String(u).match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/|live\/)([\w-]{11})/); return /youtube\.com|youtu\.be/i.test(u) && m ? m[1] : ''; }
function blogOk_(u) {
  var id = CH_BLOG.toLowerCase(), x = String(u).toLowerCase();
  if (x.indexOf('blog.naver.com') < 0) return false;
  return x.indexOf('blog.naver.com/' + id + '/') >= 0 && /\/\d{5,}/.test(x) || x.indexOf('blogid=' + id) >= 0 && /logno=\d+/.test(x);
}
/** 링크 모양 검사 — 클럽하와이 유튜브 영상 하나 / 클럽하와이 블로그 글 하나 */
function linkProblem_(l, types) {
  var u = String(l.url || '').trim(), t = l.type;
  if (!u || types.indexOf(t) < 0) return '구분';
  if (t === '클럽하와이 유튜브' && !ytId_(u)) return '클럽하와이 유튜브 영상 하나의 주소가 아닙니다.';
  if (t === '클럽하와이 블로그' && !blogOk_(u)) return '클럽하와이 블로그 글 하나의 주소가 아닙니다.';
  return '';
}
/** 유튜브 영상이 클럽하와이 채널 영상인지 (oEmbed) — 문제가 없으면 '' */
function ytChannelProblem_(u) {
  try {
    var res = UrlFetchApp.fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://youtu.be/' + ytId_(u)), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return '영상을 확인할 수 없어요. 클럽하와이 유튜브에 공개된 영상인지 확인해 주세요.';
    var j = JSON.parse(res.getContentText()), a = String(j.author_url || '').toLowerCase();
    if (a.slice(-CH_YOUTUBE.length - 1) === '/' + CH_YOUTUBE.toLowerCase() || a.indexOf(CH_YOUTUBE_ID.toLowerCase()) >= 0) return '';
    return '클럽하와이 유튜브 채널의 영상이 아니에요. (이 영상의 채널: ' + j.author_name + ')';
  } catch (e) {
    return '';   // 확인 서버 문제면 막지 않음 — 본사가 반영 전에 확인
  }
}

/** 받은 값을 정해진 모양으로만 남김 (모르는 칸은 버림, 글자 수 제한) */
function cleanProfile_(x) {
  function str(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 500); }
  function arr(v, n) { return (Array.isArray(v) ? v : []).map(function (s) { return str(s, n); }).filter(String); }
  return {
    slogan: arr(x.slogan, 80).slice(0, 2),
    history: arr(x.history, 200).slice(0, 30),
    links: (Array.isArray(x.links) ? x.links : []).map(function (l) {
      return { type: str(l.type, 20).replace(/\|/g, '/'), url: str(l.url, 500) };
    }).filter(function (l) { return !linkProblem_(l, LINK_TYPES); }).slice(0, 20),
    agreePrivacy: x.agreePrivacy === true, agreePriority: x.agreePriority === true, agreePublish: x.agreePublish === true,
    photo: /^https:\/\/(drive\.google\.com|lh3\.googleusercontent\.com)\//.test(x.photo) || !x.photo ? str(x.photo, 300) : '',
    photos: arr(x.photos, 300).filter(function (u) { return /^https:\/\/(drive\.google\.com|lh3\.googleusercontent\.com)\//.test(u); }).slice(0, 10),
    topics: (Array.isArray(x.topics) ? x.topics : []).map(function (t) {
      return {
        area: str(t.area, 30), cats: arr(t.cats, 30).map(function (c) { return c.replace(/,/g, ' '); }).slice(0, 10), name: str(t.name, 40),
        intro: str(t.intro, 120), points: arr(t.points, 200).slice(0, 8), targets: arr(t.targets, 20), seasons: arr(t.seasons, 20)
      };
    }).filter(function (t) { return t.name; })
  };
}

/** 본사가 읽기 쉬운 변경 내용: 「항목: 전 → 후」 */
function profileDiff_(a, b) {
  var names = { slogan: '슬로건', history: '경력' };
  var keys = [], text = [];
  function show(v) { return Array.isArray(v) ? (v.length ? v.join(' / ') : '(없음)') : (v || '(없음)'); }
  Object.keys(names).forEach(function (k) {
    if (JSON.stringify(a[k] || '') !== JSON.stringify(b[k] || '')) { keys.push(names[k]); text.push('· ' + names[k] + ': ' + show(a[k]) + ' → ' + show(b[k])); }
  });
  function linkStr(l) { return (l.type ? '[' + l.type + '] ' : '') + l.url; }
  if (JSON.stringify(a.links.map(linkStr)) !== JSON.stringify(b.links.map(linkStr))) {
    keys.push('관련 링크');
    text.push('· 관련 링크: ' + b.links.length + '개 — ' + (b.links.map(linkStr).join(' / ') || '(없음)'));
  }
  if (b.photo !== a.photo && b.photo !== '' && !/googleusercontent/.test(b.photo)) { keys.push('프로필 사진'); text.push('· 프로필 사진: 새로 올림'); }
  if (a.photo && !b.photo) { keys.push('프로필 사진'); text.push('· 프로필 사진: 지움'); }
  var newPhotos = b.photos.filter(function (u) { return /drive\.google\.com/.test(u); }).length;
  if (newPhotos || b.photos.length !== a.photos.length) { keys.push('현장 사진'); text.push('· 현장 사진: ' + b.photos.length + '장' + (newPhotos ? ' (새로 ' + newPhotos + '장)' : '')); }
  var an = a.topics.map(function (t) { return t.name; }), bn = b.topics.map(function (t) { return t.name; });
  var added = bn.filter(function (n) { return an.indexOf(n) < 0; }), removed = an.filter(function (n) { return bn.indexOf(n) < 0; });
  var changed = b.topics.filter(function (t) {
    var o = a.topics.filter(function (x) { return x.name === t.name; })[0];
    return o && sortedJson_(o) !== sortedJson_(t);
  }).map(function (t) { return t.name; });
  if (added.length || removed.length || changed.length) {
    keys.push('설명회');
    text.push('· 설명회 ' + b.topics.length + '개' + (added.length ? ' / 추가: ' + added.join(', ') : '') +
      (changed.length ? ' / 수정: ' + changed.join(', ') : '') + (removed.length ? ' / 뺌: ' + removed.join(', ') : ''));
  }
  return { keys: keys, text: text };
}

function sortedJson_(o) { return JSON.stringify(Object.keys(o).sort().map(function (k) { return [k, o[k]]; })); }

/** 메뉴: 「프로필 제출」에서 고른 줄을 「강연자」·「설명회」에 반영 — 소장님이 마지막으로 제출한 내용 그대로 */
function menuApplyProfile() {
  var ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActive(), sh = ss.getActiveSheet();
  if (sh.getName() !== SH.SUBMIT) { ui.alert('「' + SH.SUBMIT + '」 시트에서 반영할 줄을 먼저 골라 주세요.'); return; }
  var row = sh.getActiveRange().getRow();
  if (row < 2) { ui.alert('반영할 제출 줄을 골라 주세요.'); return; }
  var head = sh.getRange(1, 1, 1, SUBMIT_HEADERS.length).getValues()[0];
  var vals = sh.getRange(row, 1, 1, SUBMIT_HEADERS.length).getValues()[0];
  var g = function (h) { return vals[head.indexOf(h)]; };
  var name = String(g('강연자')).trim();
  var latest = lastSubmit_(name);
  if (latest && latest.row !== row) { ui.alert(name + ' 소장님은 이 줄보다 나중에 제출한 내용이 있습니다(' + latest.row + '번째 줄). 가장 최근 제출을 반영해 주세요.'); return; }
  if (g('상태') === SUBMIT_ST.DONE && ui.alert('이미 반영한 제출입니다. 다시 반영할까요?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  if (ui.alert(name + ' 소장님의 제출 내용을 강연자 정보와 설명회에 반영할까요?\n(이 소장님의 설명회는 제출 내용으로 모두 바뀝니다)', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  applyProfile_(name, JSON.parse(g('데이터')));
  sh.getRange(row, head.indexOf('상태') + 1).setValue(SUBMIT_ST.DONE);
  sh.getRange(row, head.indexOf('반영일시') + 1).setValue(new Date());
  ss.toast(name + ' 소장님 정보를 반영했습니다. 신청 페이지에 바로 보입니다.');
}

function applyProfile_(name, d) {
  var ss = SpreadsheetApp.getActive();
  var csh = ss.getSheetByName(SH.COACH);
  var head = csh.getRange(1, 1, 1, csh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var names = csh.getRange(2, head.indexOf('이름') + 1, Math.max(csh.getLastRow() - 1, 1), 1).getValues().map(function (r) { return String(r[0]).trim(); });
  var row = names.indexOf(name) + 2;
  if (row < 2) throw new Error('「강연자」 시트에 ' + name + ' 소장님이 없습니다.');
  var set = {
    '슬로건': d.slogan.join(' '), '경력': d.history.join('\n'),
    '관련 링크': d.links.map(function (l) { return l.type + ' | ' + l.url; }).join('\n'),
    '프로필 사진 URL': d.photo, '현장 사진 URL': d.photos.join(', '), '우선 수락 동의': d.agreePriority ? 'Y' : 'N'
  };
  Object.keys(set).forEach(function (h) {
    var c = head.indexOf(h);
    if (c >= 0) csh.getRange(row, c + 1).setValue(safe_(set[h]));
  });

  // 설명회: 이 강연자 줄을 지우고 소장님이 마지막으로 제출한 내용 그대로 다시 씀
  var tsh = ss.getSheetByName(SH.TOPIC);
  var all = rows_(tsh);
  for (var i = all.length - 1; i >= 0; i--) {
    if (String(all[i]['강연자']).trim() === name) tsh.deleteRow(i + 2);
  }
  var rows = d.topics.map(function (t, i) {
    return [name, i + 1, 'Y', t.area, t.cats.join(', '), t.name, t.intro, t.points.join('\n'), t.targets.join(', '),
      t.seasons.join(', ')].map(safe_);
  });
  if (rows.length) tsh.getRange(tsh.getLastRow() + 1, 1, rows.length, TOPIC_HEADERS.length).setValues(rows);
}
