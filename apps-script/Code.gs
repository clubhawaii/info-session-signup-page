/**
 * 소장님 설명회 신청 페이지 — 구글시트 연동 스크립트
 * 설치 방법은 README.md의 "구글시트 연결" 참고.
 */

// ▼ 담당자 알림 메일 주소 (여러 명이면 쉼표로 구분)
var NOTIFY_EMAIL = '';
// ▼ 신청자 확인 메일에 표시할 보낸 사람 이름
var SENDER_NAME = '클럽하와이';
// ▼ 진행일까지 최소 남아야 하는 날 수 (페이지 config.js의 MIN_DAYS와 같게)
var MIN_DAYS = 15;

var SH = { APPS: '신청내역', COACH: '소장님', BLOCK: '예약불가', MONTH: '월별추천', HOLI: '공휴일' };
var TZ = 'Asia/Seoul';
var STATUS = ['접수', '소장님 확인중', '일정확정', '결제안내', '결제완료', '진행완료', '취소'];

var APP_HEADERS = ['신청번호', '신청일시', '학원명', '원장님 성함', '연락처', '이메일', '학원 주소', '회원 여부',
  '예상 참석 인원', '요청사항', '소장님', '희망일1', '시간1', '희망일2', '시간2', '희망일3', '시간3',
  '연락 기한', '상태', '확정일', '확정 시간', '금액', '출장비', '100% 환불 마감', '70% 환불 마감', '50% 환불 마감',
  '결제 안내 문구', '담당자', '메모'];
var COACH_HEADERS = ['이름', '노출', '프로필 사진 URL', '대표 경력 (요약)', '대표 경력 (전체)', '설명회 주제', '대상 태그', '목적 태그', '강의 영상 URL', '사진 샘플 URL'];
var BLOCK_HEADERS = ['소장님', '날짜', '사유', '신청번호'];
var MONTH_HEADERS = ['월', '추천 테마', '설명', '추천 대상', '추천 소장님'];
var HOLI_HEADERS = ['날짜', '이름'];

function col_(name) { return APP_HEADERS.indexOf(name) + 1; }

/* ================= 처음 한 번 실행 ================= */

/** 시트·머리글·드롭다운·조건부 서식을 만듭니다. 편집기에서 이 함수를 한 번 실행하세요. */
function setupSheets() {
  var ss = SpreadsheetApp.getActive();
  var apps = ensureSheet_(ss, SH.APPS, APP_HEADERS);
  ensureSheet_(ss, SH.COACH, COACH_HEADERS);
  ensureSheet_(ss, SH.BLOCK, BLOCK_HEADERS);
  ensureSheet_(ss, SH.MONTH, MONTH_HEADERS);
  ensureSheet_(ss, SH.HOLI, HOLI_HEADERS);

  // 상태 드롭다운
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS, true).build();
  apps.getRange(2, col_('상태'), apps.getMaxRows() - 1, 1).setDataValidation(rule);
  // 확정일은 날짜 형식
  apps.getRange(2, col_('확정일'), apps.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  ['100% 환불 마감', '70% 환불 마감', '50% 환불 마감', '연락 기한'].forEach(function (h) {
    apps.getRange(2, col_(h), apps.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  });

  // 조건부 서식: 연락 기한이 지났는데 상태가 "접수"면 빨간색
  var r = colLetter_(col_('연락 기한')), s = colLetter_(col_('상태'));
  var range = apps.getRange(2, 1, apps.getMaxRows() - 1, APP_HEADERS.length);
  var overdue = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($' + r + '2<>"",$' + r + '2<TODAY(),$' + s + '2="접수")')
    .setBackground('#F8C9D1').setRanges([range]).build();
  var keep = apps.getConditionalFormatRules().filter(function (x) {
    var c = x.getBooleanCondition();
    return !(c && String(c.getCriteriaValues()[0]).indexOf('TODAY()') >= 0);
  });
  apps.setConditionalFormatRules(keep.concat([overdue]));

  // 편집 시 자동 처리용 트리거 (중복 설치 방지)
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onEditInstalled'; });
  if (!has) ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();

  SpreadsheetApp.getActive().toast('시트 준비가 끝났습니다.');
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#191919').setFontColor('#ffffff');
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

function doGet() {
  try {
    var ss = SpreadsheetApp.getActive();
    var coaches = rows_(ss.getSheetByName(SH.COACH)).filter(function (r) {
      return String(r['노출']).trim().toUpperCase() === 'Y' && r['이름'];
    }).map(function (r) {
      return {
        name: String(r['이름']).trim(),
        photo: driveImage_(r['프로필 사진 URL']),
        summary: r['대표 경력 (요약)'] || '',
        career: r['대표 경력 (전체)'] || '',
        topics: String(r['설명회 주제'] || ''),
        targets: String(r['대상 태그'] || ''),
        purposes: String(r['목적 태그'] || ''),
        video: r['강의 영상 URL'] || '',
        photos: String(r['사진 샘플 URL'] || '').split(',').map(function (u) { return driveImage_(u.trim()); }).filter(String)
      };
    });
    // 예약불가는 소장님·날짜만 (사유·신청번호는 내보내지 않음)
    var blocked = rows_(ss.getSheetByName(SH.BLOCK)).filter(function (r) { return r['소장님'] && r['날짜']; })
      .map(function (r) { return { coach: String(r['소장님']).trim(), date: dateStr_(r['날짜']) }; });
    var monthly = rows_(ss.getSheetByName(SH.MONTH)).filter(function (r) { return r['월']; }).map(function (r) {
      return {
        month: parseInt(String(r['월']).replace(/\D/g, ''), 10),
        theme: r['추천 테마'] || '', desc: r['설명'] || '', target: r['추천 대상'] || '',
        coaches: String(r['추천 소장님'] || '')
      };
    });
    // 「신청내역」은 절대 내보내지 않는다
    return json_({ ok: true, coaches: coaches, blocked: blocked, monthly: monthly });
  } catch (err) {
    return json_({ ok: false, error: '데이터를 불러오지 못했습니다.' });
  }
}

/** 구글 드라이브 공유 링크를 이미지로 바로 보이는 주소로 바꿉니다. */
function driveImage_(url) {
  url = String(url || '').trim();
  var m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([\w-]+)/);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : url;
}

/* ================= 신청 저장 ================= */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: '신청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  try {
    var d = JSON.parse(e.postData.contents);
    var err = validate_(d);
    if (err) return json_({ ok: false, error: err });

    var ss = SpreadsheetApp.getActive();
    // 저장 직전에 예약불가 날짜 다시 확인
    var blocked = {};
    rows_(ss.getSheetByName(SH.BLOCK)).forEach(function (r) {
      if (r['소장님'] && r['날짜']) blocked[String(r['소장님']).trim() + '|' + dateStr_(r['날짜'])] = true;
    });
    var conflicts = [];
    d.items.forEach(function (it) {
      [it.d1, it.d2, it.d3].forEach(function (dt) {
        if (dt && blocked[it.coach + '|' + dt]) conflicts.push({ coach: it.coach, date: dt });
      });
    });
    if (conflicts.length) {
      var names = conflicts.map(function (c) { return c.coach + ' ' + krDate_(parseDate_(c.date)); }).join(', ');
      return json_({ ok: false, conflicts: conflicts, error: '방금 다른 일정이 잡혀 선택할 수 없게 된 날짜가 있습니다(' + names + '). 일정을 다시 선택해 주세요.' });
    }

    var sh = ss.getSheetByName(SH.APPS);
    var now = new Date();
    var id = nextId_(sh, now);
    var deadline = addBusinessDays_(now, 3);
    var rows = d.items.map(function (it) {
      var row = new Array(APP_HEADERS.length).fill('');
      function set(h, v) { row[col_(h) - 1] = v; }
      set('신청번호', id); set('신청일시', now);
      set('학원명', d.academy); set('원장님 성함', d.director); set('연락처', "'" + d.phone); set('이메일', d.email);
      set('학원 주소', d.address); set('회원 여부', d.member); set('예상 참석 인원', d.attendees || ''); set('요청사항', d.request || '');
      set('소장님', it.coach);
      set('희망일1', it.d1); set('시간1', it.t1); set('희망일2', it.d2); set('시간2', it.t2); set('희망일3', it.d3 || ''); set('시간3', it.t3 || '');
      set('연락 기한', deadline); set('상태', '접수');
      return row;
    });
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rows.length, APP_HEADERS.length).setValues(rows);
    sh.getRange(start, col_('신청일시'), rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    sh.getRange(start, col_('희망일1'), rows.length, 6).setNumberFormat('@');
    markOverlaps_();

    sendMails_(id, d, deadline);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: '신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  } finally {
    lock.releaseLock();
  }
}

function validate_(d) {
  if (!d || !Array.isArray(d.items) || !d.items.length) return '선택한 소장님이 없습니다.';
  var req = ['academy', 'director', 'phone', 'email', 'address', 'member'];
  for (var i = 0; i < req.length; i++) if (!String(d[req[i]] || '').trim()) return '필수 항목이 비어 있습니다.';
  if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(d.phone)) return '연락처 형식을 확인해 주세요.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return '이메일 형식을 확인해 주세요.';
  var min = today_(); min.setDate(min.getDate() + MIN_DAYS);
  for (var k = 0; k < d.items.length; k++) {
    var it = d.items[k];
    if (!it.coach || !it.d1 || !it.t1 || !it.d2 || !it.t2) return '희망일 1·2순위를 확인해 주세요.';
    var ds = [it.d1, it.d2, it.d3].filter(String);
    if (ds.length !== new Set(ds).size) return it.coach + ' 소장님의 희망일이 겹칩니다.';
    for (var j = 0; j < ds.length; j++) if (parseDate_(ds[j]) < min) return '진행일 최소 2주 전까지만 신청할 수 있습니다.';
  }
  return '';
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

/* ================= 메일 ================= */

function sendMails_(id, d, deadline) {
  var lines = d.items.map(function (it) {
    var s = '· ' + it.coach + ' 소장님\n   1순위 ' + krDate_(parseDate_(it.d1)) + ' ' + it.t1 + '\n   2순위 ' + krDate_(parseDate_(it.d2)) + ' ' + it.t2;
    if (it.d3) s += '\n   3순위 ' + krDate_(parseDate_(it.d3)) + ' ' + it.t3;
    return s;
  }).join('\n');
  try {
    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: '[설명회 신청] ' + id + ' ' + d.academy,
        body: '새 설명회 신청이 접수되었습니다.\n\n신청번호: ' + id + '\n학원명: ' + d.academy + ' (' + d.director + ' 원장님, ' + d.member + ')\n연락처: ' + d.phone +
          '\n연락 기한: ' + krDate_(deadline) + '\n\n' + lines + '\n\n시트에서 확인해 주세요: ' + SpreadsheetApp.getActive().getUrl()
      });
    }
  } catch (e) { console.error(e); }
  try {
    MailApp.sendEmail({
      to: d.email,
      name: SENDER_NAME,
      subject: '[클럽하와이] 소장님 설명회 신청이 접수되었습니다 (' + id + ')',
      body: d.director + ' 원장님, 안녕하세요.\n소장님 설명회 신청이 접수되었습니다.\n\n신청번호: ' + id + '\n학원명: ' + d.academy + '\n\n' + lines +
        '\n\n신청 내용 확인 후 영업일 기준 3일 이내에 담당자가 연락드립니다.\n신청 후 소장님 일정 확인을 거쳐 최종 확정되며, 신청만으로 일정이 확정되지는 않습니다.\n결제는 일정 확정 후 안내드리며, 결제 전에는 언제든 비용 없이 취소할 수 있습니다.'
    });
  } catch (e) { console.error(e); }
}

/* ================= 시트 편집 시 자동 처리 ================= */

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
    var v = sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0];
    function g(h) { return v[col_(h) - 1]; }
    var id = String(g('신청번호')), coach = String(g('소장님')).trim(), status = g('상태'), date = g('확정일');

    if (status === '취소') {
      removeBlock_(id, coach);
    } else if (status === '일정확정' && (c === col_('상태') || c === col_('확정일'))) {
      if (!(date instanceof Date)) {
        if (c === col_('상태')) {
          SpreadsheetApp.getUi().alert('확정일을 먼저 입력한 뒤 상태를 "일정확정"으로 바꿔 주세요.');
          e.range.setValue(e.oldValue || '소장님 확인중');
        }
        return;
      }
      var ds = dateStr_(date);
      if (isBlockedByOther_(coach, ds, id)) {
        SpreadsheetApp.getUi().alert('이미 이 날짜에 예약이 있습니다.\n(' + coach + ' 소장님 · ' + krDate_(date) + ')');
        if (c === col_('상태')) e.range.setValue(e.oldValue || '소장님 확인중');
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
  var v = sh.getRange(row, 1, 1, APP_HEADERS.length).getValues()[0];
  function g(h) { return v[col_(h) - 1]; }
  var date = g('확정일');
  var cells = ['100% 환불 마감', '70% 환불 마감', '50% 환불 마감', '결제 안내 문구'].map(function (h) { return sh.getRange(row, col_(h)); });
  if (!(date instanceof Date)) { cells.forEach(function (r) { r.clearContent(); }); return; }
  var d100 = shift_(date, -15), d70 = shift_(date, -8), d50 = shift_(date, -4), dNo = shift_(date, -3);
  cells[0].setValue(d100); cells[1].setValue(d70); cells[2].setValue(d50);
  var fee = num_(g('금액')), trip = num_(g('출장비'));
  if (!fee) { cells[3].setValue('(금액을 입력하면 문구가 만들어집니다)'); return; }
  var total = fee + trip;
  var msg = '[클럽하와이] ' + g('소장님') + ' 소장님 설명회 일정이 ' + krDate_(date) + (g('확정 시간') ? ' ' + krTime_(g('확정 시간')) : '') + '로 확정되었습니다. ' +
    '결제 금액은 ' + total.toLocaleString('ko-KR') + '원(VAT 별도' + (trip ? ', 출장비 ' + trip.toLocaleString('ko-KR') + '원 포함' : '') + ')입니다. ' +
    '취소 시 ' + krMD_(d100) + '까지 100%, ' + krMD_(d70) + '까지 70%, ' + krMD_(d50) + '까지 50% 환불되며, ' + krMD_(dNo) + '부터는 환불되지 않습니다.';
  cells[3].setValue(msg);
}

/** 접수·소장님 확인중인 신청끼리 같은 소장님·같은 희망일이 겹치면 그 칸을 노랗게 표시합니다. */
function markOverlaps_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SH.APPS);
  var n = sh.getLastRow();
  if (n < 2) return;
  var vals = sh.getRange(2, 1, n - 1, APP_HEADERS.length).getValues();
  var dateCols = [col_('희망일1'), col_('희망일2'), col_('희망일3')];
  var count = {};
  function active(r) { var s = r[col_('상태') - 1]; return s === '접수' || s === '소장님 확인중'; }
  vals.forEach(function (r) {
    if (!active(r)) return;
    var coach = String(r[col_('소장님') - 1]).trim();
    var seen = {};
    dateCols.forEach(function (c) {
      var d = r[c - 1] ? dateStr_(r[c - 1]) : '';
      if (d && !seen[d]) { seen[d] = 1; count[coach + '|' + d] = (count[coach + '|' + d] || 0) + 1; }
    });
  });
  var bg = vals.map(function (r) {
    var coach = String(r[col_('소장님') - 1]).trim();
    return dateCols.map(function (c) {
      var d = r[c - 1] ? dateStr_(r[c - 1]) : '';
      return active(r) && d && count[coach + '|' + d] > 1 ? '#FBF2A3' : null;
    });
  });
  // 희망일1·2·3 칸(시간 칸 사이)에만 색을 칠함
  dateCols.forEach(function (c, i) {
    sh.getRange(2, c, bg.length, 1).setBackgrounds(bg.map(function (b) { return [b[i]]; }));
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

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function today_() { var d = parseDate_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')); return d; }
function dateStr_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v).trim().slice(0, 10).replace(/\./g, '-'); }
function parseDate_(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function shift_(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function num_(v) { return Number(String(v || '').replace(/[^\d.]/g, '')) || 0; }
function krMD_(d) { return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
function krDate_(d) { return krMD_(d) + '(' + '일월화수목금토'.charAt(d.getDay()) + ')'; }
function krTime_(t) {
  var h, m;
  if (t instanceof Date) { h = t.getHours(); m = t.getMinutes(); }
  else { var p = String(t).split(':'); h = +p[0]; m = +(p[1] || 0); }
  if (isNaN(h)) return String(t);
  return (h < 12 ? '오전 ' : '오후 ') + (h % 12 === 0 ? 12 : h % 12) + '시' + (m ? ' ' + m + '분' : '');
}

/** 주말·「공휴일」 시트의 날짜를 빼고 영업일 n일 뒤를 돌려줍니다. */
function addBusinessDays_(from, n) {
  var holi = {};
  rows_(SpreadsheetApp.getActive().getSheetByName(SH.HOLI)).forEach(function (r) { if (r['날짜']) holi[dateStr_(r['날짜'])] = 1; });
  var d = shift_(from, 0);
  while (n > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !holi[dateStr_(d)]) n--;
  }
  return d;
}
