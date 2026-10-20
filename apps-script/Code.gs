/**
 * 강연자 설명회 신청 페이지 — 구글시트 연동 스크립트
 * 흐름: 원장님 신청(희망일 1~3순위 + 강연자 1~3순위 + 주제) → (알림톡) 본사(담당자·이사님·대표님)
 *       → 담당자가 시트 메뉴 「설명회 → 강연자에게 확인 요청」 → (알림톡) 강연자, 응답 기한 24시간
 *       → 강연자가 coach.html에서 「가능한 날짜 선택 / 조율 필요 / 진행 불가」 → (알림톡) 본사
 *       → 24시간 무응답이면 「응답 없음」 + 본사 알림 → 담당자가 차순위 강연자에게 다시 요청
 *       → 담당자가 원장님께 직접 확정 연락 후 상태를 「일정확정」으로 → 결제안내 → 결제완료 → 진행완료
 * 설치 방법은 README.md의 "구글시트 연결" 참고.
 */

// ▼ 본사 알림 받을 사람 (알림톡). 번호가 빈 줄은 건너뜁니다.
var HQ = [
  { name: '담당자', phone: '' },
  { name: '이사님', phone: '' },
  { name: '대표님', phone: '' }
];
// ▼ 본사 알림 메일 (선택, 여러 개면 쉼표로)
var HQ_EMAIL = '';
// ▼ 강연자 응답 페이지 주소 (배포 후 GitHub Pages 주소 + coach.html)
var COACH_PAGE_URL = 'https://clubhawaii.github.io/info-session-signup-page/coach.html';
// ▼ 강연자 응답 기한 (시간)
var RESPONSE_HOURS = 24;
// ▼ 결제 기한: 상태를 「결제안내」로 바꾼 때부터 (시간). 기한이 주말에 걸리면 월요일 같은 시각으로 미룸
var PAY_HOURS = 24;
// ▼ 진행일까지 최소 남아야 하는 날 수 (config.js의 MIN_DAYS와 같게)
var MIN_DAYS = 15;

/*
 * 알림톡 발송 설정 (솔라피 기준) — 스크립트 편집기 ⚙ 프로젝트 설정 → 스크립트 속성
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID(카카오 채널 연동 ID), SOLAPI_FROM(발신 번호)
 *   TPL_HQ_NEW, TPL_COACH_REQUEST, TPL_HQ_ACCEPTED, TPL_HQ_ADJUST, TPL_HQ_DECLINED, TPL_HQ_NO_RESPONSE, TPL_HQ_PAY_OVERDUE
 * 설정 전이거나 템플릿 ID가 없으면 보내지 않고 「알림기록」 시트에 "미발송(설정 전)"으로 문구만 남깁니다.
 */

var SH = { APPS: '신청내역', COACH: '강연자', BLOCK: '예약불가', LOG: '알림기록' };
var TZ = 'Asia/Seoul';
var ST = {
  NEW: '접수', ASKING: '강연자 확인중', ACCEPTED: '강연자 수락', ADJUST: '조율 필요', DECLINED: '강연자 불가',
  NO_RESPONSE: '응답 없음', CONFIRMED: '일정확정', PAY: '결제안내', PAID: '결제완료', DONE: '진행완료', CANCEL: '취소'
};
var STATUS = Object.keys(ST).map(function (k) { return ST[k]; });
var NEEDS_HQ = [ST.NEW, ST.ACCEPTED, ST.ADJUST, ST.DECLINED, ST.NO_RESPONSE];   // 본사가 다음 행동을 해야 하는 상태

var APP_HEADERS = ['신청번호', '신청일시', '상태', '학원명', '원장님 성함', '연락처', '학원 주소', '회원 여부', '설명회 대상', '예상 참석 인원',
  '설명회 종류', '주제', '주제 상세', '요청사항',
  '희망일1', '시간1', '희망일2', '시간2', '희망일3', '시간3', '강연자1', '강연자2', '강연자3', '날짜 조정 가능',
  '요청 강연자', '요청 일시', '응답 기한', '강연자 응답', '응답 일시', '강연자 메모',
  '확정 강연자', '확정일', '확정 시간', '금액', '출장비', '결제 기한', '100% 환불 마감', '70% 환불 마감', '50% 환불 마감',
  '결제 안내 문구', '담당자', '메모', '결제 기한 알림', '응답 토큰'];
var COACH_HEADERS = ['이름', '노출', '연락처', '프로필 사진 URL', '대표 경력 (요약)', '대표 경력 (전체)', '설명회 주제', '대상 태그', '진행 지역', '강의 영상 URL', '사진 샘플 URL'];
var BLOCK_HEADERS = ['강연자', '날짜', '사유', '신청번호'];
var LOG_HEADERS = ['일시', '종류', '받는 사람', '번호', '결과', '내용'];

/*
 * 알림톡 문구 — 카카오 템플릿 검수에 이 글을 그대로 등록합니다(#{…}는 변수).
 * 문구를 바꾸면 템플릿도 다시 검수받아야 합니다.
 */
var TEMPLATES = {
  HQ_NEW:
    '[설명회 신청] 새 신청 #{신청번호}\n\n학원: #{학원명} (#{원장님} 원장님 · #{회원})\n연락처: #{연락처}\n주소: #{지역}\n' +
    '대상: #{대상} · 예상 인원 #{인원}\n설명회: #{종류}\n주제: #{주제}\n요청사항: #{요청사항}\n\n' +
    '■ 희망 날짜\n1순위 #{희망일1}\n2순위 #{희망일2}\n3순위 #{희망일3}\n\n■ 강연자\n1순위 #{강연자1}\n2순위 #{강연자2}\n3순위 #{강연자3}\n#{날짜조정}\n\n' +
    '원장님께 3일 안에 연락이 가도록 1순위 강연자부터 확인 요청을 보내 주세요.',
  COACH_REQUEST:
    '[클럽하와이] 설명회 일정 확인 요청\n\n#{강연자}님, 설명회 요청이 들어왔습니다.\n\n' +
    '■ 학원: #{학원명}\n■ 지역: #{지역}\n■ 대상: #{대상} · 예상 인원 #{인원}\n■ 설명회: #{종류}\n■ 주제: #{주제}\n■ 요청사항: #{요청사항}\n\n' +
    '■ 희망 일정\n1순위 #{희망일1}\n2순위 #{희망일2}\n3순위 #{희망일3}\n#{날짜조정}\n\n' +
    '아래 링크에서 가능한 날짜를 골라 주세요. 날짜가 모두 어렵거나 진행이 어려우시면 링크에서 알려 주세요.\n▶ #{링크}\n\n' +
    '※ #{응답기한}까지 응답하지 않으시면 설명회 기회는 다른 강연자께 넘어갑니다.',
  HQ_ACCEPTED:
    '[설명회] 강연자 수락 #{신청번호}\n\n#{요청강연자}님이 #{확정일시}(#{순위}) 가능하다고 답했습니다.\n학원: #{학원명} (#{원장님} 원장님 · #{연락처})\n\n' +
    '원장님께 확정 연락 후 시트 상태를 「일정확정」으로 바꿔 주세요.',
  HQ_ADJUST:
    '[설명회] 날짜 조율 필요 #{신청번호}\n\n#{요청강연자}님이 희망 날짜 3개 모두 어렵다고 답했습니다.\n강연자 메모: #{메모}\n#{날짜조정}\n\n' +
    '학원: #{학원명} (#{원장님} 원장님 · #{연락처})\n강연자와 원장님 사이 날짜를 조율하거나 차순위 강연자에게 요청해 주세요.',
  HQ_DECLINED:
    '[설명회] 강연자 진행 불가 #{신청번호}\n\n#{요청강연자}님이 진행이 어렵다고 답했습니다.\n강연자 메모: #{메모}\n\n' +
    '학원: #{학원명}\n강연자 순위: 1순위 #{강연자1} / 2순위 #{강연자2} / 3순위 #{강연자3}\n차순위 강연자에게 확인 요청을 보내 주세요.',
  HQ_NO_RESPONSE:
    '[설명회] 강연자 응답 없음 #{신청번호}\n\n#{요청강연자}님이 기한(#{응답기한})까지 응답하지 않았습니다.\n\n' +
    '학원: #{학원명}\n강연자 순위: 1순위 #{강연자1} / 2순위 #{강연자2} / 3순위 #{강연자3}\n주제: #{주제}\n차순위 강연자에게 확인 요청을 보내 주세요.',
  HQ_PAY_OVERDUE:
    '[설명회] 결제 기한 지남 #{신청번호}\n\n#{학원명} (#{원장님} 원장님 · #{연락처})\n확정: #{확정강연자} · #{확정일시}\n결제 기한: #{결제기한}\n\n' +
    '원장님께 확인 후 결제 또는 취소 처리해 주세요. 취소하면 강연자 날짜가 다시 열립니다.'
};

function col_(name) { return APP_HEADERS.indexOf(name) + 1; }

/* ================= 처음 한 번 실행 ================= */

/** 시트·머리글·드롭다운·조건부 서식·트리거를 만듭니다. 편집기에서 이 함수를 한 번 실행하세요. */
function setupSheets() {
  var ss = SpreadsheetApp.getActive();
  var apps = ensureSheet_(ss, SH.APPS, APP_HEADERS);
  ensureSheet_(ss, SH.COACH, COACH_HEADERS);
  ensureSheet_(ss, SH.BLOCK, BLOCK_HEADERS);
  ensureSheet_(ss, SH.LOG, LOG_HEADERS);

  var rows = apps.getMaxRows() - 1;
  apps.getRange(2, col_('상태'), rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS, true).build());
  ['확정일', '100% 환불 마감', '70% 환불 마감', '50% 환불 마감'].forEach(function (h) {
    apps.getRange(2, col_(h), rows, 1).setNumberFormat('yyyy-mm-dd');
  });
  ['신청일시', '요청 일시', '응답 기한', '응답 일시', '결제 기한', '결제 기한 알림'].forEach(function (h) {
    apps.getRange(2, col_(h), rows, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
  apps.hideColumns(col_('결제 기한 알림'), 2);   // 결제 기한 알림 · 응답 토큰

  // 본사가 다음 행동을 해야 하는 줄은 파랗게
  var s = colLetter_(col_('상태'));
  var formula = '=OR(' + NEEDS_HQ.map(function (x) { return '$' + s + '2="' + x + '"'; }).join(',') + ')';
  apps.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula)
    .setBackground('#DCE6FB').setRanges([apps.getRange(2, 1, rows, APP_HEADERS.length)]).build()]);

  var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (handlers.indexOf('onEditInstalled') < 0) ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();
  if (handlers.indexOf('checkDeadlines') < 0) ScriptApp.newTrigger('checkDeadlines').timeBased().everyHours(1).create();

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

/** 시트를 열면 「설명회」 메뉴를 붙입니다. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('설명회')
    .addItem('선택한 신청의 강연자에게 확인 요청', 'menuAskCoach')
    .addToUi();
}

/* ================= 페이지 데이터 제공 ================= */

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === 'request') return json_(getRequest_(e.parameter.t));
    var ss = SpreadsheetApp.getActive();
    var coaches = rows_(ss.getSheetByName(SH.COACH)).filter(function (r) {
      return String(r['노출']).trim().toUpperCase() === 'Y' && r['이름'];
    }).map(function (r) {
      // 연락처는 내보내지 않는다
      return {
        name: String(r['이름']).trim(),
        photo: driveImage_(r['프로필 사진 URL']),
        summary: r['대표 경력 (요약)'] || '',
        career: r['대표 경력 (전체)'] || '',
        topics: String(r['설명회 주제'] || ''),
        targets: String(r['대상 태그'] || ''),
        region: String(r['진행 지역'] || ''),
        video: r['강의 영상 URL'] || '',
        photos: String(r['사진 샘플 URL'] || '').split(',').map(function (u) { return driveImage_(u.trim()); }).filter(String)
      };
    });
    var blocked = rows_(ss.getSheetByName(SH.BLOCK)).filter(function (r) { return r['강연자'] && r['날짜']; })
      .map(function (r) { return { coach: String(r['강연자']).trim(), date: dateStr_(r['날짜']) }; });
    // 「신청내역」은 절대 내보내지 않는다
    return json_({ ok: true, coaches: coaches, blocked: blocked });
  } catch (err) {
    return json_({ ok: false, error: '데이터를 불러오지 못했습니다.' });
  }
}

/** 강연자 응답 페이지용 — 토큰이 맞는 요청 1건만, 원장님 이름·연락처는 빼고 돌려줍니다. */
function getRequest_(token) {
  var hit = findByToken_(token);
  if (!hit) return { ok: false, error: '요청을 찾을 수 없습니다. 알림톡의 링크로 다시 들어와 주세요.' };
  var g = hit.get, coach = String(g('요청 강연자'));
  var rank = [1, 2, 3].filter(function (i) { return String(g('강연자' + i)) === coach; })[0] || 0;
  var chosen = String(g('강연자 응답')).match(/^(\d)순위/);
  return {
    ok: true,
    request: {
      id: String(g('신청번호')), coach: coach, rank: rank, academy: String(g('학원명')),
      address: String(g('학원 주소')), target: String(g('설명회 대상')), attendees: String(g('예상 참석 인원') || ''),
      kind: String(g('설명회 종류')), topics: String(g('주제')) + (g('주제 상세') ? ' — ' + g('주제 상세') : ''),
      request: String(g('요청사항') || ''), flexible: g('날짜 조정 가능') === 'Y' && rank === 1,
      options: [1, 2, 3].map(function (i) { return { date: dateStr_(g('희망일' + i)), time: timeStr_(g('시간' + i)) }; }),
      deadline: new Date(g('응답 기한')).toISOString(),
      status: String(g('상태')),
      chosen: chosen ? +chosen[1] - 1 : null
    }
  };
}

function driveImage_(url) {
  url = String(url || '').trim();
  var m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : url;
}

/* ================= 저장 (신청 · 강연자 응답) ================= */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: '요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  try {
    var d = JSON.parse(e.postData.contents);
    return json_(d.action === 'respond' ? respond_(d) : apply_(d));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  } finally {
    lock.releaseLock();
  }
}

/** 원장님 신청 저장 + 본사 알림 */
function apply_(d) {
  var err = validate_(d);
  if (err) return { ok: false, error: err };

  var sh = SpreadsheetApp.getActive().getSheetByName(SH.APPS);
  var now = new Date();
  var id = nextId_(sh, now);
  var row = new Array(APP_HEADERS.length).fill('');
  function set(h, v) { row[col_(h) - 1] = v; }
  set('신청번호', id); set('신청일시', now); set('상태', ST.NEW);
  set('학원명', safe_(d.academy)); set('원장님 성함', safe_(d.director)); set('연락처', "'" + d.phone);
  set('학원 주소', safe_(d.address)); set('회원 여부', d.member); set('설명회 대상', safe_(d.target));
  set('예상 참석 인원', safe_(d.attendees)); set('설명회 종류', safe_(d.kind));
  set('주제', safe_((d.topics || []).join(', '))); set('주제 상세', safe_(d.topicMemo)); set('요청사항', safe_(d.request));
  d.options.forEach(function (o, i) { set('희망일' + (i + 1), o.date); set('시간' + (i + 1), o.time); });
  d.coaches.forEach(function (c, i) { set('강연자' + (i + 1), safe_(c)); });
  set('날짜 조정 가능', d.flexible ? 'Y' : 'N');

  var r = sh.getLastRow() + 1;
  sh.getRange(r, col_('희망일1'), 1, 6).setNumberFormat('@');   // 날짜·시간이 자동 변환되지 않게 먼저 글자 형식으로
  sh.getRange(r, 1, 1, APP_HEADERS.length).setValues([row]);

  notifyHQ_('HQ_NEW', vars_(rowGetter_(row)));
  return { ok: true, id: id };
}

function validate_(d) {
  if (!d) return '신청 내용이 비어 있습니다.';
  var req = ['academy', 'director', 'phone', 'address', 'member', 'target', 'kind'];
  for (var i = 0; i < req.length; i++) if (!String(d[req[i]] || '').trim()) return '필수 항목이 비어 있습니다.';
  if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(d.phone)) return '휴대폰 번호를 확인해 주세요.';
  if (!Array.isArray(d.coaches) || !d.coaches.length || d.coaches.length > 3) return '강연자를 골라 주세요.';
  if (!Array.isArray(d.topics) || !d.topics.length) return '설명회 주제를 골라 주세요.';
  if (!Array.isArray(d.options) || d.options.length !== 3) return '희망 날짜 3개를 골라 주세요.';
  var min = today_(); min.setDate(min.getDate() + MIN_DAYS);
  var seen = {};
  for (var k = 0; k < 3; k++) {
    var o = d.options[k];
    if (!o || !/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !/^\d{2}:\d{2}$/.test(o.time)) return '희망 날짜와 시간을 확인해 주세요.';
    if (seen[o.date]) return '희망 날짜가 겹칩니다.';
    seen[o.date] = 1;
    if (parseDate_(o.date) < min) return '진행일 최소 2주 전까지만 신청할 수 있습니다.';
  }
  return '';
}

/** 강연자 응답: choice = 0·1·2(가능한 순위 날짜) / 'adjust'(날짜 조율) / 'decline'(진행 불가) */
function respond_(d) {
  var hit = findByToken_(d.t);
  if (!hit) return { ok: false, error: '요청을 찾을 수 없습니다.' };
  var g = hit.get, sh = hit.sheet, row = hit.row;
  if (String(g('상태')) !== ST.ASKING) return { ok: false, error: '이미 처리된 요청입니다. (' + g('상태') + ')' };
  if (new Date(g('응답 기한')) < new Date()) return { ok: false, error: '응답 기한이 지났습니다.' };

  var v = vars_(g), now = new Date(), memo = safe_(String(d.memo || '').slice(0, 500));
  v['메모'] = memo || '없음';
  if (d.choice === 'adjust' || d.choice === 'decline') {
    var adj = d.choice === 'adjust';
    setCells_(sh, row, { '상태': adj ? ST.ADJUST : ST.DECLINED, '강연자 응답': adj ? '날짜 조율 필요' : '진행 불가', '응답 일시': now, '강연자 메모': memo });
    notifyHQ_(adj ? 'HQ_ADJUST' : 'HQ_DECLINED', v);
    return { ok: true };
  }

  var i = parseInt(d.choice, 10);
  if (!(i >= 0 && i <= 2)) return { ok: false, error: '날짜를 골라 주세요.' };
  var coach = String(g('요청 강연자')).trim(), ds = dateStr_(g('희망일' + (i + 1))), tm = timeStr_(g('시간' + (i + 1)));
  if (blockedSet_()[coach + '|' + ds]) {
    return { ok: false, error: '이 날짜에는 이미 다른 설명회가 확정되어 있습니다. 다른 날짜를 고르거나 「날짜 조율」을 눌러 주세요.' };
  }
  setCells_(sh, row, {
    '상태': ST.ACCEPTED, '강연자 응답': (i + 1) + '순위 날짜 가능', '응답 일시': now, '강연자 메모': memo,
    '확정 강연자': coach, '확정일': parseDate_(ds), '확정 시간': tm
  });
  v['확정일시'] = krDate_(parseDate_(ds)) + ' ' + krTime_(tm);
  v['순위'] = (i + 1) + '순위';
  notifyHQ_('HQ_ACCEPTED', v);
  return { ok: true };
}

/* ================= 담당자 메뉴: 강연자에게 확인 요청 ================= */

function menuAskCoach() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSheet();
  var row = sh.getActiveRange().getRow();
  if (sh.getName() !== SH.APPS || row < 2) { ui.alert('「신청내역」에서 요청을 보낼 신청 줄을 먼저 눌러 주세요.'); return; }
  var g = rowGetter_(sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0]);
  var status = String(g('상태'));
  if ([ST.CONFIRMED, ST.PAY, ST.PAID, ST.DONE, ST.CANCEL].indexOf(status) >= 0) { ui.alert('이미 「' + status + '」인 신청입니다.'); return; }

  var ranks = [1, 2, 3].map(function (i) { return i + '순위 ' + (g('강연자' + i) || '-'); }).join('\n');
  var asked = g('요청 강연자') ? '\n\n지금까지 요청한 강연자: ' + g('요청 강연자') + ' (' + status + ')' : '';
  var res = ui.prompt('강연자에게 확인 요청 — ' + g('신청번호'),
    ranks + asked + '\n\n보낼 순위(1·2·3)나 강연자 이름을 입력하세요. 순위 밖의 강연자 이름도 됩니다.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var input = res.getResponseText().trim();
  var coach = /^[123]$/.test(input) ? String(g('강연자' + input)) : input;
  if (!coach) { ui.alert('강연자를 찾지 못했습니다.'); return; }
  var phone = coachPhone_(coach);
  if (!phone) { ui.alert('「강연자」 시트에서 ' + coach + '님의 연락처를 찾지 못했습니다. 연락처를 넣은 뒤 다시 시도해 주세요.'); return; }

  var now = new Date(), due = new Date(now.getTime() + RESPONSE_HOURS * 3600 * 1000);
  var token = Utilities.getUuid().replace(/-/g, '');   // 새 요청마다 새 링크 — 이전 강연자의 링크는 더 이상 쓸 수 없음
  setCells_(sh, row, {
    '상태': ST.ASKING, '요청 강연자': coach, '요청 일시': now, '응답 기한': due,
    '강연자 응답': '', '응답 일시': '', '강연자 메모': '', '확정 강연자': '', '확정일': '', '확정 시간': '', '응답 토큰': token
  });
  var v = vars_(rowGetter_(sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0]));
  v['링크'] = COACH_PAGE_URL + '?t=' + token;
  var sent = notify_('COACH_REQUEST', coach, phone, v);
  ui.alert(coach + '님에게 확인 요청을 ' + (sent ? '보냈습니다.' : '기록했습니다. (알림톡 설정 전이라 「알림기록」에 문구만 남겼습니다)') +
    '\n응답 기한: ' + v['응답기한'] + '\n응답 링크: ' + v['링크']);
}

/* ================= 1시간마다: 응답 기한 · 결제 기한 확인 ================= */

function checkDeadlines() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(SH.APPS);
    var n = sh.getLastRow();
    if (n < 2) return;
    var vals = sh.getRange(2, 1, n - 1, APP_HEADERS.length).getValues();
    var now = new Date();
    vals.forEach(function (r, k) {
      var g = rowGetter_(r), status = String(g('상태'));
      var due = g('응답 기한'), pay = g('결제 기한');
      if (status === ST.ASKING && due instanceof Date && due < now) {
        sh.getRange(k + 2, col_('상태')).setValue(ST.NO_RESPONSE);
        sh.getRange(k + 2, col_('강연자 응답')).setValue('기한 내 응답 없음');
        notifyHQ_('HQ_NO_RESPONSE', vars_(g));
      } else if (status === ST.PAY && pay instanceof Date && pay < now && !g('결제 기한 알림')) {
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
    var id = String(g('신청번호')), coach = String(g('확정 강연자')).trim(), status = g('상태'), date = g('확정일');

    if (status === ST.CANCEL) {
      removeBlock_(id);
    } else if (status === ST.CONFIRMED && (c === col_('상태') || c === col_('확정일') || c === col_('확정 강연자'))) {
      // 담당자가 원장님께 확정 연락한 뒤 「일정확정」으로 바꾸면 그 날짜를 막는다
      if (!coach || !(date instanceof Date)) {
        if (c === col_('상태')) {
          SpreadsheetApp.getUi().alert('「확정 강연자」와 「확정일」을 먼저 입력한 뒤 상태를 「일정확정」으로 바꿔 주세요.');
          e.range.setValue(e.oldValue || ST.ACCEPTED);
        }
        return;
      }
      if (isBlockedByOther_(coach, dateStr_(date), id)) {
        SpreadsheetApp.getUi().alert('이미 이 날짜에 예약이 있습니다.\n(' + coach + ' · ' + krDate_(date) + ')');
        e.range.setValue(e.oldValue || (c === col_('상태') ? ST.ACCEPTED : ''));
        return;
      }
      removeBlock_(id);
      sh.getParent().getSheetByName(SH.BLOCK).appendRow([coach, date, '확정 예약', id]);
    } else if (status === ST.PAY && c === col_('상태') && !g('결제 기한')) {
      sh.getRange(row, col_('결제 기한')).setValue(payDeadline_(new Date()));
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

function isBlockedByOther_(coach, ds, id) {
  return rows_(SpreadsheetApp.getActive().getSheetByName(SH.BLOCK)).some(function (r) {
    return String(r['강연자']).trim() === coach && r['날짜'] && dateStr_(r['날짜']) === ds && String(r['신청번호']) !== id;
  });
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

/* ================= 알림톡 ================= */

/** 알림톡 변수 값 — 신청 한 줄에서 만듭니다. */
function vars_(g) {
  function opt(i) {
    var d = g('희망일' + i);
    return d ? krDate_(parseDate_(dateStr_(d))) + ' ' + krTime_(timeStr_(g('시간' + i))) : '-';
  }
  function when(v) { return v instanceof Date ? krDate_(v) + ' ' + krTime_(Utilities.formatDate(v, TZ, 'HH:mm')) : ''; }
  var date = g('확정일');
  return {
    '신청번호': String(g('신청번호')), '원장님': String(g('원장님 성함')), '학원명': String(g('학원명')),
    '연락처': String(g('연락처')).replace(/^'/, ''), '회원': String(g('회원 여부')),
    '지역': String(g('학원 주소')), '대상': String(g('설명회 대상')),
    '인원': g('예상 참석 인원') ? g('예상 참석 인원') + '명' : '미정', '요청사항': String(g('요청사항') || '없음'),
    '종류': String(g('설명회 종류')), '주제': String(g('주제')) + (g('주제 상세') ? ' — ' + g('주제 상세') : ''),
    '희망일1': opt(1), '희망일2': opt(2), '희망일3': opt(3),
    '강연자1': String(g('강연자1') || '-'), '강연자2': String(g('강연자2') || '-'), '강연자3': String(g('강연자3') || '-'),
    '날짜조정': g('날짜 조정 가능') === 'Y' ? '※ 1순위 강연자를 꼭 희망하며, 강연자 일정에 맞춰 날짜 조정이 가능합니다.' : '※ 희망 날짜 외 조정은 어렵습니다.',
    '강연자': String(g('요청 강연자')), '요청강연자': String(g('요청 강연자')), '응답기한': when(g('응답 기한')),
    '확정강연자': String(g('확정 강연자')),
    '확정일시': date instanceof Date ? krDate_(date) + (g('확정 시간') ? ' ' + krTime_(timeStr_(g('확정 시간'))) : '') : '',
    '결제기한': when(g('결제 기한'))
  };
}

function fill_(tpl, v) { return tpl.replace(/#\{([^}]+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }

function notifyHQ_(type, v) {
  HQ.forEach(function (p) {
    var phone = String(p.phone || '').replace(/[^\d]/g, '');
    if (phone) notify_(type, p.name, phone, v);
    else log_(type, p.name, '', '미발송(번호 없음)', fill_(TEMPLATES[type], v));
  });
  if (HQ_EMAIL) {
    var text = fill_(TEMPLATES[type], v);
    try {
      MailApp.sendEmail({ to: HQ_EMAIL, subject: text.split('\n')[0], body: text + '\n\n시트: ' + SpreadsheetApp.getActive().getUrl() });
    } catch (e) { console.error(e); }
  }
}

/** 알림톡 1건 보내기. 설정 전이면 「알림기록」에 내용만 남기고 false를 돌려줍니다. */
function notify_(type, who, phone, v) {
  var text = fill_(TEMPLATES[type], v);
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

function findByToken_(token) {
  token = String(token || '');
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.APPS);
  var n = sh.getLastRow();
  if (n < 2) return null;
  var vals = sh.getRange(2, 1, n - 1, APP_HEADERS.length).getValues();
  var c = col_('응답 토큰') - 1;
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][c] === token) return { sheet: sh, row: i + 2, get: rowGetter_(vals[i]) };
  }
  return null;
}

function rowGetter_(r) { return function (h) { return r[col_(h) - 1]; }; }
function setCells_(sh, row, map) { Object.keys(map).forEach(function (h) { sh.getRange(row, col_(h)).setValue(map[h]); }); }

function blockedSet_() {
  var set = {};
  rows_(SpreadsheetApp.getActive().getSheetByName(SH.BLOCK)).forEach(function (r) {
    if (r['강연자'] && r['날짜']) set[String(r['강연자']).trim() + '|' + dateStr_(r['날짜'])] = true;
  });
  return set;
}

function coachPhone_(name) {
  var hit = rows_(SpreadsheetApp.getActive().getSheetByName(SH.COACH)).filter(function (r) { return String(r['이름']).trim() === name; })[0];
  return hit ? String(hit['연락처'] || '').replace(/[^\d]/g, '') : '';
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
function krDate_(d) { return krMD_(d) + '(' + '일월화수목금토'.charAt(d.getDay()) + ')'; }
function krTime_(t) {
  var p = String(t).split(':'), h = +p[0], m = +(p[1] || 0);
  if (isNaN(h)) return String(t);
  return (h < 12 ? '오전 ' : '오후 ') + (h % 12 === 0 ? 12 : h % 12) + '시' + (m ? ' ' + m + '분' : '');
}
