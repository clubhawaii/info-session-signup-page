/**
 * 소장님 설명회 신청 페이지 — 구글시트 연동 스크립트
 * 흐름: 원장님 신청 → (알림톡) 원장님·소장님·본사 → 소장님이 coach.html에서 날짜 선택 또는 「조율 필요」
 *       → (알림톡) 본사 / 3일 안에 응답이 없으면 자동 「기한 만료」 → (알림톡) 본사
 * 설치 방법은 README.md의 "구글시트 연결" 참고.
 */

// ▼ 본사 알림 받을 휴대폰 번호(알림톡)·메일 주소 — 여러 개면 쉼표로 구분
var HQ_PHONES = '';
var HQ_EMAIL = '';
// ▼ 소장님 응답 페이지 주소 (배포 후 GitHub Pages 주소 + coach.html)
var COACH_PAGE_URL = 'https://clubhawaii.github.io/info-session-signup-page/coach.html';
// ▼ 소장님이 날짜를 골라야 하는 기한 (시간) — config.js의 RESPONSE_HOURS와 같게
var RESPONSE_HOURS = 72;
// ▼ 진행일까지 최소 남아야 하는 날 수 (config.js의 MIN_DAYS와 같게)
var MIN_DAYS = 15;

/*
 * 알림톡 발송 설정 (솔라피 기준) — 스크립트 편집기 왼쪽 ⚙ 프로젝트 설정 → 스크립트 속성에 넣습니다.
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID(카카오 채널 연동 ID), SOLAPI_FROM(발신 번호)
 *   TPL_DIRECTOR_RECEIVED, TPL_COACH_REQUEST, TPL_HQ_NEW, TPL_HQ_CONFIRMED, TPL_HQ_ADJUST, TPL_HQ_EXPIRED (검수 받은 템플릿 ID)
 * 설정 전이거나 템플릿 ID가 없으면 보내지 않고 「알림기록」 시트에 "미발송(설정 전)"으로 내용만 남깁니다.
 */

var SH = { APPS: '신청내역', COACH: '소장님', BLOCK: '예약불가', LOG: '알림기록' };
var TZ = 'Asia/Seoul';
var WAITING = '소장님 확인중';
var STATUS = [WAITING, '일정확정', '조율 필요', '기한 만료', '결제안내', '결제완료', '진행완료', '취소'];

var APP_HEADERS = ['신청번호', '신청일시', '학원명', '원장님 성함', '연락처', '학원 주소', '회원 여부', '설명회 대상',
  '예상 참석 인원', '요청사항', '소장님', '희망일1', '시간1', '희망일2', '시간2', '희망일3', '시간3',
  '응답 기한', '상태', '소장님 선택', '응답 일시', '조율 메모', '확정일', '확정 시간', '금액', '출장비',
  '100% 환불 마감', '70% 환불 마감', '50% 환불 마감', '결제 안내 문구', '담당자', '메모', '응답 토큰'];
var COACH_HEADERS = ['이름', '노출', '연락처', '프로필 사진 URL', '대표 경력 (요약)', '대표 경력 (전체)', '설명회 주제', '대상 태그', '진행 지역', '강의 영상 URL', '사진 샘플 URL'];
var BLOCK_HEADERS = ['소장님', '날짜', '사유', '신청번호'];
var LOG_HEADERS = ['일시', '종류', '받는 사람', '번호', '결과', '내용'];

/*
 * 알림톡 문구 — 카카오 템플릿 검수에 이 글을 그대로 등록합니다(#{…}는 변수).
 * 문구를 바꾸면 템플릿도 다시 검수받아야 합니다.
 */
var TEMPLATES = {
  DIRECTOR_RECEIVED:
    '[클럽하와이] 설명회 신청 완료\n\n#{원장님} 원장님, 소장님 설명회 신청이 완료되었습니다.\n\n' +
    '■ 신청번호: #{신청번호}\n■ 소장님: #{소장님}\n■ 희망 일정\n1순위 #{희망일1}\n2순위 #{희망일2}\n3순위 #{희망일3}\n\n' +
    '현재 소장님께서 일정을 확인하고 계십니다.\n일정이 확정되면 바로 연락드리겠습니다.\n\n※ 신청만으로 일정이 확정되지는 않습니다.',
  COACH_REQUEST:
    '[클럽하와이] 설명회 일정 확인 요청\n\n#{소장님}님, 새 설명회 신청이 들어왔습니다.\n\n' +
    '■ 학원: #{학원명}\n■ 지역: #{지역}\n■ 대상: #{대상}\n■ 예상 인원: #{인원}\n■ 요청사항: #{요청사항}\n\n' +
    '■ 희망 일정\n1순위 #{희망일1}\n2순위 #{희망일2}\n3순위 #{희망일3}\n\n' +
    '아래 링크에서 가능한 날짜 하나를 골라 주세요. 세 날짜 모두 어려우시면 「조율 필요」를 눌러 주세요.\n▶ #{링크}\n\n' +
    '※ #{응답기한}까지 날짜를 선택하지 않으시면 신청은 자동 취소되며, 설명회 기회는 다른 소장님께 넘어갑니다.',
  HQ_NEW:
    '[설명회 신청] 새 신청 #{신청번호}\n\n학원: #{학원명} (#{원장님} 원장님 · #{회원})\n연락처: #{연락처}\n주소: #{지역}\n' +
    '대상: #{대상} · 예상 인원 #{인원}\n요청사항: #{요청사항}\n\n소장님: #{소장님}\n1순위 #{희망일1}\n2순위 #{희망일2}\n3순위 #{희망일3}\n\n' +
    '소장님 응답 기한: #{응답기한}',
  HQ_CONFIRMED:
    '[설명회] 소장님 일정 확정 #{신청번호}\n\n#{소장님} → #{확정일시} (#{순위})\n학원: #{학원명} (#{원장님} 원장님 · #{연락처})\n\n' +
    '원장님께 확정 안내와 결제 안내를 진행해 주세요.',
  HQ_ADJUST:
    '[설명회] 조율 필요 #{신청번호}\n\n#{소장님}님이 희망 날짜 3개 모두 어렵다고 답했습니다.\n소장님 메모: #{메모}\n\n' +
    '학원: #{학원명} (#{원장님} 원장님 · #{연락처})\n1순위 #{희망일1}\n2순위 #{희망일2}\n3순위 #{희망일3}\n\n소장님·원장님과 직접 조율해 주세요.',
  HQ_EXPIRED:
    '[설명회] 응답 기한 만료 #{신청번호}\n\n#{소장님}님이 기한(#{응답기한})까지 날짜를 고르지 않아 자동 취소되었습니다.\n' +
    '학원: #{학원명} (#{원장님} 원장님 · #{연락처})\n\n다른 소장님 배정 또는 원장님 안내가 필요합니다.'
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
  ['신청일시', '응답 기한', '응답 일시'].forEach(function (h) {
    apps.getRange(2, col_(h), rows, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
  apps.hideColumns(col_('응답 토큰'));

  // 조건부 서식: 조율 필요·기한 만료는 본사가 처리해야 하므로 칸을 표시
  var range = apps.getRange(2, 1, rows, APP_HEADERS.length);
  var s = colLetter_(col_('상태'));
  var todo = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=OR($' + s + '2="조율 필요",$' + s + '2="기한 만료")')
    .setBackground('#DCE6FB').setRanges([range]).build();
  apps.setConditionalFormatRules([todo]);

  // 트리거 (중복 설치 방지)
  var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (handlers.indexOf('onEditInstalled') < 0) ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();
  if (handlers.indexOf('checkExpired') < 0) ScriptApp.newTrigger('checkExpired').timeBased().everyHours(1).create();

  ss.toast('시트 준비가 끝났습니다.');
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
    var blocked = rows_(ss.getSheetByName(SH.BLOCK)).filter(function (r) { return r['소장님'] && r['날짜']; })
      .map(function (r) { return { coach: String(r['소장님']).trim(), date: dateStr_(r['날짜']) }; });
    // 「신청내역」은 절대 내보내지 않는다
    return json_({ ok: true, coaches: coaches, blocked: blocked });
  } catch (err) {
    return json_({ ok: false, error: '데이터를 불러오지 못했습니다.' });
  }
}

/** 소장님 응답 페이지용 — 토큰이 맞는 신청 1건만, 원장님 연락처는 빼고 돌려줍니다. */
function getRequest_(token) {
  var hit = findByToken_(token);
  if (!hit) return { ok: false, error: '신청을 찾을 수 없습니다. 알림톡의 링크로 다시 들어와 주세요.' };
  var g = hit.get;
  var chosen = String(g('소장님 선택')).match(/^(\d)순위/);
  return {
    ok: true,
    request: {
      id: String(g('신청번호')), coach: String(g('소장님')), academy: String(g('학원명')),
      address: String(g('학원 주소')), target: String(g('설명회 대상')),
      attendees: String(g('예상 참석 인원') || ''), request: String(g('요청사항') || ''),
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
    return json_(d.action === 'respond' ? respond_(d) : apply_(d));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  } finally {
    lock.releaseLock();
  }
}

/** 원장님 신청 저장 + 알림톡 3종 */
function apply_(d) {
  var err = validate_(d);
  if (err) return { ok: false, error: err };

  var ss = SpreadsheetApp.getActive();
  var blocked = blockedSet_();
  var conflicts = d.options.filter(function (o) { return blocked[d.coach + '|' + o.date]; })
    .map(function (o) { return { coach: d.coach, date: o.date }; });
  if (conflicts.length) {
    var names = conflicts.map(function (c) { return krDate_(parseDate_(c.date)); }).join(', ');
    return { ok: false, conflicts: conflicts, error: '방금 소장님 일정이 잡혀 고를 수 없게 된 날짜가 있습니다(' + names + '). 날짜를 다시 골라 주세요.' };
  }

  var sh = ss.getSheetByName(SH.APPS);
  var now = new Date();
  var id = nextId_(sh, now);
  var deadline = new Date(now.getTime() + RESPONSE_HOURS * 3600 * 1000);
  var token = Utilities.getUuid().replace(/-/g, '');
  var row = new Array(APP_HEADERS.length).fill('');
  function set(h, v) { row[col_(h) - 1] = v; }
  set('신청번호', id); set('신청일시', now);
  set('학원명', safe_(d.academy)); set('원장님 성함', safe_(d.director)); set('연락처', "'" + d.phone);
  set('학원 주소', safe_(d.address)); set('회원 여부', d.member); set('설명회 대상', safe_(d.target));
  set('예상 참석 인원', safe_(d.attendees)); set('요청사항', safe_(d.request)); set('소장님', d.coach);
  d.options.forEach(function (o, i) { set('희망일' + (i + 1), o.date); set('시간' + (i + 1), o.time); });
  set('응답 기한', deadline); set('상태', WAITING); set('응답 토큰', token);

  var r = sh.getLastRow() + 1;
  sh.getRange(r, col_('희망일1'), 1, 6).setNumberFormat('@');   // 날짜·시간이 자동 변환되지 않게 먼저 글자 형식으로
  sh.getRange(r, 1, 1, APP_HEADERS.length).setValues([row]);
  markOverlaps_();

  var v = vars_(rowGetter_(row));
  v['링크'] = COACH_PAGE_URL + '?t=' + token;
  notify_('DIRECTOR_RECEIVED', d.director + ' 원장님', d.phone, v);
  var coachPhone = coachPhone_(d.coach);
  if (coachPhone) notify_('COACH_REQUEST', d.coach, coachPhone, v);
  else log_('COACH_REQUEST', d.coach, '', '미발송(「소장님」 시트에 연락처 없음)', fill_(TEMPLATES.COACH_REQUEST, v));
  notifyHQ_('HQ_NEW', v);
  return { ok: true, id: id };
}

function validate_(d) {
  if (!d || !d.coach) return '소장님을 골라 주세요.';
  var req = ['academy', 'director', 'phone', 'address', 'member', 'target'];
  for (var i = 0; i < req.length; i++) if (!String(d[req[i]] || '').trim()) return '필수 항목이 비어 있습니다.';
  if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(d.phone)) return '휴대폰 번호를 확인해 주세요.';
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

/** 소장님 응답: choice = 0·1·2(순위) 또는 'adjust'(조율 필요) */
function respond_(d) {
  var hit = findByToken_(d.t);
  if (!hit) return { ok: false, error: '신청을 찾을 수 없습니다.' };
  var g = hit.get, sh = hit.sheet, row = hit.row;
  if (String(g('상태')) !== WAITING) return { ok: false, error: '이미 처리된 신청입니다. (' + g('상태') + ')' };
  if (new Date(g('응답 기한')) < new Date()) return { ok: false, error: '응답 기한이 지났습니다.' };

  var v = vars_(g);
  var now = new Date();
  if (d.choice === 'adjust') {
    var memo = safe_(String(d.memo || '').slice(0, 500));
    setCells_(sh, row, { '상태': '조율 필요', '소장님 선택': '조율 필요', '응답 일시': now, '조율 메모': memo });
    v['메모'] = memo || '없음';
    notifyHQ_('HQ_ADJUST', v);
    return { ok: true };
  }

  var i = parseInt(d.choice, 10);
  if (!(i >= 0 && i <= 2)) return { ok: false, error: '날짜를 골라 주세요.' };
  var coach = String(g('소장님')).trim(), ds = dateStr_(g('희망일' + (i + 1))), tm = timeStr_(g('시간' + (i + 1)));
  if (blockedSet_()[coach + '|' + ds]) {
    return { ok: false, error: '이 날짜에는 이미 다른 설명회가 확정되어 있습니다. 다른 날짜를 고르거나 「조율 필요」를 눌러 주세요.' };
  }
  var date = parseDate_(ds);
  setCells_(sh, row, { '상태': '일정확정', '소장님 선택': (i + 1) + '순위', '응답 일시': now, '확정일': date, '확정 시간': tm });
  sh.getParent().getSheetByName(SH.BLOCK).appendRow([coach, date, '확정 예약', String(g('신청번호'))]);
  fillPayment_(sh, row);
  markOverlaps_();
  v['확정일시'] = krDate_(date) + ' ' + krTime_(tm);
  v['순위'] = (i + 1) + '순위';
  notifyHQ_('HQ_CONFIRMED', v);
  return { ok: true };
}

/** 1시간마다 실행: 응답 기한이 지난 「소장님 확인중」 신청을 「기한 만료」로 바꾸고 본사에 알립니다. */
function checkExpired() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(SH.APPS);
    var n = sh.getLastRow();
    if (n < 2) return;
    var vals = sh.getRange(2, 1, n - 1, APP_HEADERS.length).getValues();
    var now = new Date();
    vals.forEach(function (r, k) {
      var g = rowGetter_(r);
      var due = g('응답 기한');
      if (String(g('상태')) !== WAITING || !(due instanceof Date) || due > now) return;
      sh.getRange(k + 2, col_('상태')).setValue('기한 만료');
      notifyHQ_('HQ_EXPIRED', vars_(g));
    });
    markOverlaps_();
  } finally {
    lock.releaseLock();
  }
}

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
    if (r['소장님'] && r['날짜']) set[String(r['소장님']).trim() + '|' + dateStr_(r['날짜'])] = true;
  });
  return set;
}

function coachPhone_(name) {
  var hit = rows_(SpreadsheetApp.getActive().getSheetByName(SH.COACH)).filter(function (r) { return String(r['이름']).trim() === name; })[0];
  return hit ? String(hit['연락처'] || '').replace(/[^\d]/g, '') : '';
}

/* ================= 알림톡 ================= */

/** 알림톡 변수 값 — 신청 한 줄에서 만듭니다. */
function vars_(g) {
  function opt(i) {
    var d = g('희망일' + i);
    return d ? krDate_(parseDate_(dateStr_(d))) + ' ' + krTime_(timeStr_(g('시간' + i))) : '-';
  }
  var due = g('응답 기한');
  return {
    '신청번호': String(g('신청번호')), '원장님': String(g('원장님 성함')), '학원명': String(g('학원명')),
    '연락처': String(g('연락처')).replace(/^'/, ''), '회원': String(g('회원 여부')),
    '지역': String(g('학원 주소')), '대상': String(g('설명회 대상')),
    '인원': g('예상 참석 인원') ? g('예상 참석 인원') + '명' : '미정', '요청사항': String(g('요청사항') || '없음'),
    '소장님': String(g('소장님')), '희망일1': opt(1), '희망일2': opt(2), '희망일3': opt(3),
    '응답기한': due instanceof Date ? krDate_(due) + ' ' + krTime_(Utilities.formatDate(due, TZ, 'HH:mm')) : ''
  };
}

function fill_(tpl, v) { return tpl.replace(/#\{([^}]+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }

function notifyHQ_(type, v) {
  HQ_PHONES.split(',').map(function (s) { return s.replace(/[^\d]/g, ''); }).filter(String).forEach(function (p) {
    notify_(type, '본사', p, v);
  });
  if (HQ_EMAIL) {
    var text = fill_(TEMPLATES[type], v);
    try {
      MailApp.sendEmail({ to: HQ_EMAIL, subject: text.split('\n')[0], body: text + '\n\n시트: ' + SpreadsheetApp.getActive().getUrl() });
    } catch (e) { console.error(e); }
  }
}

/** 알림톡 1건 보내기. 설정 전이면 「알림기록」에 내용만 남깁니다. */
function notify_(type, who, phone, v) {
  var text = fill_(TEMPLATES[type], v);
  var p = PropertiesService.getScriptProperties().getProperties();
  var tpl = p['TPL_' + type];
  if (!p.SOLAPI_API_KEY || !p.SOLAPI_API_SECRET || !p.SOLAPI_PFID || !tpl) {
    log_(type, who, phone, '미발송(설정 전)', text);
    return;
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
  } catch (e) {
    log_(type, who, phone, '실패 ' + e, text);
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

/* ================= 시트 직접 편집 시 자동 처리 ================= */

function onEditInstalled(e) {
  var sh = e.range.getSheet();
  if (sh.getName() !== SH.APPS || e.range.getRow() < 2) return;
  var c = e.range.getColumn(), row = e.range.getRow();
  var watch = ['상태', '확정일', '확정 시간', '금액', '출장비'].map(col_);
  if (e.range.getNumRows() > 1 || e.range.getNumColumns() > 1 || watch.indexOf(c) < 0) {
    if ([col_('희망일1'), col_('희망일2'), col_('희망일3'), col_('소장님')].indexOf(c) >= 0) markOverlaps_();
    return;
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var g = rowGetter_(sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0]);
    var id = String(g('신청번호')), coach = String(g('소장님')).trim(), status = g('상태'), date = g('확정일');

    if (status === '취소' || status === '기한 만료') {
      removeBlock_(id, coach);
    } else if (status === '일정확정' && (c === col_('상태') || c === col_('확정일'))) {
      // 본사가 조율 후 직접 확정하는 경우
      if (!(date instanceof Date)) {
        if (c === col_('상태')) {
          SpreadsheetApp.getUi().alert('확정일을 먼저 입력한 뒤 상태를 "일정확정"으로 바꿔 주세요.');
          e.range.setValue(e.oldValue || '조율 필요');
        }
        return;
      }
      if (isBlockedByOther_(coach, dateStr_(date), id)) {
        SpreadsheetApp.getUi().alert('이미 이 날짜에 예약이 있습니다.\n(' + coach + ' 소장님 · ' + krDate_(date) + ')');
        if (c === col_('상태')) e.range.setValue(e.oldValue || '조율 필요');
        else e.range.setValue(e.oldValue ? (isNaN(+e.oldValue) ? e.oldValue : +e.oldValue) : '');
        return;
      }
      removeBlock_(id, coach);
      sh.getParent().getSheetByName(SH.BLOCK).appendRow([coach, date, '확정 예약', id]);
    }
    fillPayment_(sh, row);
    markOverlaps_();
  } finally {
    lock.releaseLock();
  }
}

function isBlockedByOther_(coach, ds, id) {
  return rows_(SpreadsheetApp.getActive().getSheetByName(SH.BLOCK)).some(function (r) {
    return String(r['소장님']).trim() === coach && r['날짜'] && dateStr_(r['날짜']) === ds && String(r['신청번호']) !== id;
  });
}

function removeBlock_(id, coach) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.BLOCK);
  var n = sh.getLastRow();
  if (n < 2) return;
  var vals = sh.getRange(2, 1, n - 1, 4).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim() === coach && String(vals[i][3]) === id) sh.deleteRow(i + 2);
  }
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
  var msg = '[클럽하와이] ' + g('소장님') + ' 소장님 설명회 일정이 ' + krDate_(date) + (g('확정 시간') ? ' ' + krTime_(timeStr_(g('확정 시간'))) : '') + '로 확정되었습니다. ' +
    '결제 금액은 ' + total.toLocaleString('ko-KR') + '원(VAT 별도' + (trip ? ', 출장비 ' + trip.toLocaleString('ko-KR') + '원 포함' : '') + ')입니다. ' +
    '취소 시 ' + krMD_(d100) + '까지 100%, ' + krMD_(d70) + '까지 70%, ' + krMD_(d50) + '까지 50% 환불되며, ' + krMD_(dNo) + '부터는 환불되지 않습니다.';
  cells[3].setValue(msg);
}

/** 「소장님 확인중」 신청끼리 같은 소장님·같은 희망일이 겹치면 그 칸을 표시합니다. */
function markOverlaps_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.APPS);
  var n = sh.getLastRow();
  if (n < 2) return;
  var vals = sh.getRange(2, 1, n - 1, APP_HEADERS.length).getValues();
  var dateCols = [col_('희망일1'), col_('희망일2'), col_('희망일3')];
  var count = {};
  function active(r) { return r[col_('상태') - 1] === WAITING; }
  vals.forEach(function (r) {
    if (!active(r)) return;
    var coach = String(r[col_('소장님') - 1]).trim(), seen = {};
    dateCols.forEach(function (c) {
      var d = r[c - 1] ? dateStr_(r[c - 1]) : '';
      if (d && !seen[d]) { seen[d] = 1; count[coach + '|' + d] = (count[coach + '|' + d] || 0) + 1; }
    });
  });
  dateCols.forEach(function (c) {
    sh.getRange(2, c, vals.length, 1).setBackgrounds(vals.map(function (r) {
      var coach = String(r[col_('소장님') - 1]).trim(), d = r[c - 1] ? dateStr_(r[c - 1]) : '';
      return [active(r) && d && count[coach + '|' + d] > 1 ? '#B7CBF7' : null];
    }));
  });
}

/* ================= 도우미 ================= */

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
