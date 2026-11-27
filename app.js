// 설명회 신청 — 강연자 찾기(상품 → 학년 → 고민·키워드 → 강력 추천순 → 담기, 최대 MAX_PICKS명) → 「구매하러 가기」
//   (담을 때 설명회까지 함께 정함 — 자세히 보기에서 바꿈) → 날짜 하나·시작 시간·요청사항 → 신청 정보 → 완료
// 신청하면 담은 강연자께 일정이 되는지 먼저 확인하고, 가능한 강연자와 조율한 뒤 본사 담당자가 원장님께 직접 연락함
(function () {
  "use strict";

  var C = window.APP_CONFIG || {};
  var DEMO = !C.APPS_SCRIPT_URL || C.SIGNUP_OPEN === false;   // 신청 페이지는 정식 오픈 전까지 시험 모드
  var DOW = "일월화수목금토";
  var HOURS = C.RESPONSE_HOURS || 24;
  var MAX_PICKS = C.MAX_PICKS || 3;
  var OVERLAP = (C.OVERLAP_HOURS || 3) * 60;   // 분

  var S = {
    coaches: [],
    blocked: [],          // { coach, date, time } — time이 비어 있으면 그날 하루 전체
    ptype: "edu",         // 상품: edu 학부모·학생 / biz 기업·기관
    grades: [],           // 고른 학년 (필수 — 없으면 추천하지 않음)
    q: "",                // 고민·키워드
    mode: "",             // 지난 추천 결과: all(검색어 없음) / match / none(맞는 사람 없음)
    picked: [],           // 담은 강연자 이름 (누른 순서)
    product: {},          // 소장님 이름 → 고른 설명회 이름
    date: "",
    time: "",
    month: null,
    kind: ((C.KINDS || [])[0] || {}).id,
    step: 1,
    sending: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function list(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return String(v || "").split(/[\n,]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  // 경력처럼 한 줄 안에 쉼표가 들어가는 글은 줄 단위로만 나눔
  function lines(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return String(v || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  }
  // 영역이 비즈니스 교육(biz)이면 이 페이지에는 보이지 않음
  function areaPage(name) {
    var a = (C.AREAS || []).filter(function (x) { return x.name === name; })[0];
    return a ? a.page : "edu";
  }

  /* ---------- 날짜 ---------- */
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function krDate(s) { var d = parse(s); return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + DOW[d.getDay()] + ")"; }
  function krTime(t) {
    if (!t) return "";
    var p = t.split(":"), h = +p[0], m = +p[1];
    return (h < 12 ? "오전 " : "오후 ") + (h % 12 || 12) + "시" + (m ? " " + m + "분" : "");
  }
  function hhmm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function krDue(d) { return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + DOW[d.getDay()] + ") " + krTime(hhmm(d)); }
  function mins(t) { var p = String(t).split(":"); return +p[0] * 60 + +p[1]; }
  function daysFromToday(s) { return Math.round((parse(s) - today()) / 864e5); }
  // 맞춤 설명회를 하나라도 고르면 준비 기간 때문에 더 늦은 날짜부터
  var CUSTOM = C.CUSTOM_NAME || "우리 학원 맞춤 설명회";
  var CUSTOM_DAYS = C.CUSTOM_MIN_DAYS || 21;
  function hasCustom() { return S.picked.some(function (n) { return S.product[n] === CUSTOM; }); }
  function minDays() { return hasCustom() ? CUSTOM_DAYS : (C.MIN_DAYS || 14); }
  function minDate() { return addDays(today(), minDays()); }

  /* ---------- 가격 ---------- */
  function man(n) { return n % 10000 === 0 ? (n / 10000).toLocaleString("ko-KR") : (n / 10000).toFixed(1); }
  function kindOf(id) { return (C.KINDS || []).filter(function (k) { return k.id === id; })[0]; }
  var DURS = C.DURATIONS || [];
  function durOf(id) { return DURS.filter(function (d) { return d.id === id; })[0]; }
  // 금액 목록 → "60만원" 또는 "60~90만원"
  function rangeText(vals) {
    vals = vals.filter(Boolean);
    if (!vals.length) return "별도 안내";
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    return lo === hi ? man(lo) + "만원" : man(lo) + "~" + man(hi) + "만원";
  }

  /* ---------- 공통 UI ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }
  function avatar(c, size) {
    var cls = "avatar" + (size ? " " + size : "");
    if (c.photo) return '<div class="' + cls + '"><img src="' + esc(c.photo) + '" alt=""></div>';
    return '<div class="' + cls + '">' + esc(c.name.replace(/^예시\s*강연자\s*/, "").charAt(0)) + "</div>";
  }

  /* ---------- 데이터 ---------- */
  function load() {
    if (DEMO) return Promise.resolve(window.LOCAL_DATA || window.SAMPLE_DATA);
    return fetch(C.APPS_SCRIPT_URL).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      return d;
    });
  }
  function useData(d) {
    S.coaches = (d.coaches || []).filter(function (c) {
      return !/^(아니오|아니요|n|no)$/i.test(String(c.verified || "").trim());   // 소장 확인 「아니오」는 노출 보류
    }).map(function (c) {
      var all = (c.topics || []).filter(function (t) { return t.name; });
      var edu = all.filter(function (t) { return areaPage(t.area) !== "biz"; });
      var biz = all.filter(function (t) { return areaPage(t.area) === "biz"; });
      var links = (c.links || []).filter(function (l) { return l && l.url; });
      var co = {
        name: c.name, photo: c.photo || "", slogan: lines(c.slogan),
        history: lines(c.title).concat(lines(c.history), lines(c.extra), lines(c.works)),   // 클럽하와이 직함은 경력 맨 위
        links: links, photos: list(c.photos),
        edu: edu, biz: biz, topics: edu,
        // 키워드 칸(시트 「강연자」)이 비어 있으면 설명회 내용으로 대신함
        grades: list(c.grades).length ? list(c.grades) : guessGrades(edu),
        bizTargets: GRADES.biz.filter(function (x) { return biz.some(function (t) { return list(t.targets).indexOf(x) >= 0; }); }),
        mainGrade: String(c.mainGrade || "").trim(), core: list(c.core), keywords: list(c.keywords), schools: list(c.schools),
        mainTitle: String(c.mainTitle || "").trim(),
        video: links.some(function (l) { return youtubeId(l.url); })
      };
      // 검색용 글: 주력(설명회 이름·카테고리·주력 키워드·주력 제목) / 일반(일반 키워드·소개·핵심 내용·슬로건·경력)
      co.coreText = norm([co.mainTitle].concat(co.core, all.map(function (t) { return t.name; }), all.map(function (t) { return list(t.cats || t.cat).join("|"); })).join("|"));
      co.genText = norm(co.keywords.concat(all.map(function (t) { return t.intro + "|" + lines(t.points).join("|"); }), co.slogan, co.history).join("|"));
      co.schoolText = norm(co.schools.join("|"));
      return co;
    }).sort(function (a, b) { return a.name.localeCompare(b.name, "ko"); });
    useTopics();
    S.blocked = (d.blocked || []).map(function (b) { return { coach: b.coach, date: b.date, time: b.time || "" }; });
    // 저장해 둔 선택 중 지금 없는 소장님·설명회는 정리
    S.picked = S.picked.filter(findCoach);
    Object.keys(S.product).forEach(function (n) {
      var c = findCoach(n);
      if (!c || S.picked.indexOf(n) < 0 || (S.product[n] !== CUSTOM && !c.topics.some(function (t) { return t.name === S.product[n]; }))) delete S.product[n];
    });
  }

  /* ---------- 일정 겹침 ---------- */
  // 그 날짜·시간에 이미 확정된 일정이 있으면 그 일정을 돌려줌 (시간이 없는 일정 = 그날 하루 전체)
  function clashOf(name, date, time) {
    if (!date) return null;
    return S.blocked.filter(function (b) {
      if (b.coach !== name || b.date !== date) return false;
      if (!b.time || !time) return !b.time;
      return Math.abs(mins(b.time) - mins(time)) < OVERLAP;
    })[0] || null;
  }
  function dayOff(name, date) { return S.blocked.some(function (b) { return b.coach === name && b.date === date && !b.time; }); }
  function clashed() { return S.picked.filter(function (n) { return clashOf(n, S.date, S.time); }); }

  /* ---------- 회원 혜택 · 금액표 (4단계) ---------- */
  function renderPerk() {
    var save = DURS.map(function (d) { return d.nonmember - d.member; });
    $("perk").innerHTML =
      '<div class="perk-top"><strong class="perk-mark">CLUB HAWAII<br>MEMBERSHIP</strong><span class="perk-chip" aria-hidden="true"></span></div>' +
      '<span class="perk-tag">MEMBER EXCLUSIVE PRICE</span>' +
      '<p><em>클럽하와이 회원 학원</em>은 설명회 1회 <em>' + rangeText(save) + " 할인</em>된 회원 특별가로 신청하실 수 있습니다.</p>";
  }
  function renderPriceTable() {
    var dur = fv("duration"), m = memberVal();
    function cell(d, key, label) {
      return "<td" + (d.id === dur && m === label ? ' class="on"' : "") + ">" + man(d[key]) + "만원~</td>";
    }
    $("priceTable").innerHTML = "<thead><tr><th>강연 시간</th><th>회원</th><th>비회원</th></tr></thead><tbody>" +
      DURS.map(function (d) {
        return "<tr" + (d.id === dur ? ' class="on"' : "") + "><th>" + esc(d.label) + "</th>" + cell(d, "member", "회원") + cell(d, "nonmember", "비회원") + "</tr>";
      }).join("") + "</tbody>";
  }

  /* ---------- 1단계: 강연자 찾기 ---------- */
  function findCoach(name) { return S.coaches.filter(function (c) { return c.name === name; })[0]; }
  var GRADES = { edu: (C.GRADES || {}).edu || [], biz: (C.GRADES || {}).biz || [] };
  function gradeList() { return GRADES[S.ptype] || []; }
  // 「대상 학년」 칸이 빈 소장님 — 설명회 대상(초등 학부모 등)으로 학년을 짐작
  function guessGrades(topics) {
    var tg = C.TARGET_GRADES || {}, got = [];
    topics.forEach(function (t) { list(t.targets).forEach(function (x) { got = got.concat(tg[x] || []); }); });
    return GRADES.edu.filter(function (g) { return got.indexOf(g) >= 0; });
  }
  // 상품에 맞는 설명회만 2단계에 보임
  function useTopics() { S.coaches.forEach(function (c) { c.topics = S.ptype === "biz" ? c.biz : c.edu; }); }

  // 검색용 글자 다듬기 — 띄어쓰기·가운뎃점·괄호를 지우고 소문자로 (「특목·자사」 = 「특목 자사」 = 「특목자사」)
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[\s·・,.\/()「」『』"'\-~!?]/g, ""); }
  function hasAny(text, terms) { return terms.some(function (t) { return text.indexOf(t) >= 0; }); }

  // 키워드 사전(keywords.js) — 표준 키워드 + 비슷한 말을 한꺼번에 검사
  var DICT = (window.KEYWORDS || []).map(function (e) {
    return { k: e.k, c: e.c, rel: e.rel || [], terms: [e.k].concat(e.syn || []).map(norm).filter(function (t) { return t.length >= 2; }) };
  });
  function dictOf(k) { return DICT.filter(function (e) { return e.k === k; })[0]; }
  // 검색에서 빼는 흔한 말
  var STOP = ["설명회", "특강", "강의", "강연", "우리", "동네", "학원", "아이", "아이들", "학생", "학생들", "학부모", "부모님", "관련", "주제", "내용", "방법", "어떻게", "하는", "잡기", "해주세요", "주세요", "해줘", "설명해", "알려", "싶어요", "싶은", "위한", "대한", "준비"];
  // 원장님이 쓴 문장 → { hits: 사전 키워드, rel: 연결 키워드(한 단계 넓힘), words: 사전에 없는 낱말 }
  function interpret(q) {
    var nq = norm(q), hits = [], rel = [];
    if (!nq) return { hits: hits, rel: rel, words: [], empty: true };
    DICT.forEach(function (e) { if (hasAny(nq, e.terms)) hits.push(e); });
    hits.forEach(function (e) {
      e.rel.forEach(function (k) {
        var r = dictOf(k);
        if (r && hits.indexOf(r) < 0 && rel.indexOf(r) < 0) rel.push(r);
      });
    });
    var words = String(q).split(/[\s,·]+/).map(function (w) {
      return norm(w).replace(/(으로|에서|에게|하기|하는|이랑|까지|부터|처럼|을|를|이|가|은|는|에|의|도|로|와|과)$/, "");
    }).filter(function (w) {
      return w.length >= 2 && STOP.indexOf(w) < 0 && !hits.some(function (e) { return hasAny(w, e.terms) || e.terms.some(function (t) { return t.indexOf(w) >= 0; }); });
    });
    return { hits: hits, rel: rel, words: words, empty: !hits.length && !words.length };
  }

  // 강력 추천 점수 (안내서 초안) — 주력 키워드 +5 · 일반 키워드 +2 · 학교 +3 · 주력 학년 +3 · 영상 +1
  // 연결 키워드로만 맞으면 절반(주력 +3 · 일반 +1). 점수·순위는 화면에 보이지 않음
  function scoreOf(c, Q) {
    var kw = 0, hit = [];
    function add(n, k) { kw += n; if (hit.indexOf(k) < 0) hit.push(k); }
    Q.hits.forEach(function (e) {
      if (e.c === "학교") { if (hasAny(c.schoolText, e.terms) || hasAny(c.coreText, e.terms) || hasAny(c.genText, e.terms)) add(3, e.k); }
      else if (hasAny(c.coreText, e.terms)) add(5, e.k);
      else if (hasAny(c.genText, e.terms)) add(2, e.k);
    });
    Q.rel.forEach(function (e) {
      if (hasAny(c.coreText, e.terms)) add(3, e.k);
      else if (hasAny(c.genText, e.terms)) add(1, e.k);
    });
    Q.words.forEach(function (w) { if (c.coreText.indexOf(w) >= 0 || c.genText.indexOf(w) >= 0) add(2, w); });
    var bonus = (c.mainGrade && S.grades.indexOf(c.mainGrade) >= 0 ? 3 : 0) + (c.video ? 1 : 0);
    return { c: c, kw: kw, score: kw + bonus, hit: hit };
  }
  // 이 상품·학년의 강연자 (학년을 안 고르면 아무도 없음 — 학년 없이는 추천하지 않음)
  function pool() {
    if (!S.grades.length) return [];
    return S.coaches.filter(function (c) {
      if (!c.topics.length && S.ptype === "biz") return false;
      var g = S.ptype === "biz" ? c.bizTargets : c.grades;
      return S.grades.some(function (x) { return g.indexOf(x) >= 0; });
    });
  }
  function byScore(a, b) { return b.score - a.score || a.c.name.localeCompare(b.c.name, "ko"); }
  function recommend() {
    var Q = interpret(S.q), all = pool().map(function (c) { return scoreOf(c, Q); });
    if (Q.empty) return { mode: "all", items: all.sort(byScore), Q: Q };
    var hit = all.filter(function (x) { return x.kw > 0; }).sort(byScore);
    if (hit.length) return { mode: "match", items: hit, Q: Q };
    return { mode: "none", items: all.sort(byScore).slice(0, 3), Q: Q };   // 맞는 사람이 없으면 가장 가까운 3명
  }
  // 검색어와 가장 잘 맞는 설명회 — 카드 제목과, 담을 때 2단계 설명회를 미리 골라 두는 데 씀
  function bestTopic(c, Q) {
    if (!Q || Q.empty) return null;
    var terms = [];
    Q.hits.concat(Q.rel).forEach(function (e) { terms = terms.concat(e.terms); });
    terms = terms.concat(Q.words);
    var best = null, top = 0;
    c.topics.forEach(function (t) {
      var txt = norm([t.name, list(t.cats || t.cat).join("|"), t.intro, lines(t.points).join("|")].join("|"));
      var n = terms.filter(function (x) { return txt.indexOf(x) >= 0; }).length;
      if (n > top) { top = n; best = t; }
    });
    return best;
  }

  function renderFind() {
    $("ptypeSeg").innerHTML = (C.PRODUCTS || []).map(function (p) {
      var on = p.id === S.ptype;
      return '<button type="button" class="mcard' + (on ? " on" : "") + '" role="radio" aria-checked="' + on + '" data-ptype="' + esc(p.id) + '">' +
        '<span class="radio"></span><span class="mc-body"><b>' + esc(p.name) + '</b><span class="mc-desc">' + esc(p.desc || "") + "</span></span></button>";
    }).join("");
    $("gradeTitle").innerHTML = (S.ptype === "biz" ? "교육 대상을 골라 주세요" : "설명회를 들을 학년을 골라 주세요") + " <em>필수 · 여러 개 선택</em>";
    $("gradeChips").innerHTML = gradeList().map(function (g) {
      var on = S.grades.indexOf(g) >= 0;
      return '<button type="button" class="chip' + (on ? " on" : "") + '" aria-pressed="' + on + '" data-grade="' + esc(g) + '">' + esc(g) + "</button>";
    }).join("");
    $("kwChips").innerHTML = ((window.KEYWORD_CHIPS || {})[S.ptype] || []).map(function (k) {
      var on = norm(S.q) === norm(k);
      return '<button type="button" class="chip sm' + (on ? " on" : "") + '" data-kw="' + esc(k) + '"># ' + esc(k) + "</button>";
    }).join("");
    if ($("q").value !== S.q) $("q").value = S.q;
  }

  function renderHero() {
    var n = S.coaches.length;
    $("heroCrowd").innerHTML = S.coaches.slice(0, 8).map(function (c) { return avatar(c); }).join("") + (n > 8 ? '<div class="avatar more">+' + (n - 8) + "</div>" : "");
    $("heroCount").innerHTML = n ? "<b>강연자 " + n + "명</b>이 함께합니다" : "";
  }

  function recCard(x, badge, Q) {
    var c = x.c, on = S.picked.indexOf(c.name) >= 0;
    var best = bestTopic(c, Q);
    var title = c.mainTitle || (best || c.topics[0] || {}).name || c.slogan.join(" ");
    // 매칭 키워드 3개 — 검색어가 없으면 주력 키워드나 설명회 카테고리
    var kws = x.hit.length ? x.hit : c.core.length ? c.core : uniq([].concat.apply([], c.topics.map(function (t) { return list(t.cats || t.cat); })));
    var grades = S.ptype === "biz" ? c.bizTargets : c.grades;
    return '<div class="coach rec' + (on ? " on" : "") + '" role="button" tabindex="0" data-c="' + esc(c.name) + '">' +
      avatar(c) +
      '<div class="coach-info">' + (badge ? '<span class="rec-badge">강력 추천</span>' : "") +
      '<div class="coach-name">' + esc(c.name) + "</div>" +
      (title ? '<div class="rec-title">' + esc(title) + "</div>" : "") +
      (kws.length ? '<div class="tags">' + kws.slice(0, 3).map(function (k) { return '<span class="tag' + (x.hit.length ? "" : " gray") + '">' + esc(k) + "</span>"; }).join("") + "</div>" : "") +
      (grades.length ? '<div class="rec-grades">대상 ' + esc(grades.join(" · ")) + "</div>" : "") +
      '<div class="rec-act"><button type="button" class="link coach-more" data-more="' + esc(c.name) + '">자세히 보기</button>' +
      '<button type="button" class="pick-btn' + (on ? " on" : "") + '" data-pick="' + esc(c.name) + '">' + (on ? "✓ 담았어요" : "+ 담기") + "</button></div>" +
      "</div></div>";
  }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }

  var REC = { mode: "", items: [], Q: null };
  function renderCoaches() {
    if (!S.grades.length) {
      REC = { mode: "", items: [], Q: null };
      $("resultHead").innerHTML = '<p class="need-grade">' + (S.ptype === "biz" ? "교육 대상" : "학년") + "을 고르면 맞는 강연자를 추천해 드려요.</p>";
      $("coachList").innerHTML = "";
      $("pairHint").hidden = true;
      $("noMatch").hidden = true;
      return;
    }
    REC = recommend();
    S.mode = REC.mode;
    var n = REC.items.length;
    var head = "";
    if (!n) head = '<div class="rh"><h3>아직 이 ' + (S.ptype === "biz" ? "대상" : "학년") + ' 설명회를 하는 강연자가 없어요</h3><span>원하시는 내용을 <a class="inline-link" data-contact href="' + esc(C.CONTACT_URL || "#") + '" target="_blank" rel="noopener">카카오톡 클럽하와이cs 채널</a>로 알려 주시면 맞는 강연자를 찾아 드릴게요.</span></div>';
    else if (REC.mode === "match") head = '<div class="rh"><h3>입력하신 주제에 가장 강한 강연자입니다</h3><span>' + n + "명</span></div>";
    else if (REC.mode === "all") head = '<div class="rh"><h3>' + esc(S.grades.join(", ")) + " 설명회 강연자</h3><span>고민·키워드를 입력하면 그 주제에 가장 강한 강연자를 먼저 보여 드려요</span></div>";
    else head = '<div class="no-match-box"><b>딱 맞는 주제가 없나요?</b><p>강연자에게 이 주제로 가능한지 먼저 여쭙겠습니다. 가장 가까운 강연자 ' + n + "명이에요. 담으시면 <b>「우리 학원 맞춤 설명회」</b>로 담기고, 원하시는 주제는 요청사항에 함께 적어 드려요.</p></div>";
    $("resultHead").innerHTML = head;
    var top = C.TOP_BADGE || 3;
    $("coachList").innerHTML = REC.items.map(function (x, i) { return recCard(x, REC.mode === "match" && i < top, REC.Q); }).join("");
    // 한 명만 담았으면 비슷한 강연자도 함께 여쭤보도록 권함
    var more = S.picked.length === 1 ? REC.items.filter(function (x) { return S.picked.indexOf(x.c.name) < 0; }).slice(0, 2) : [];
    $("pairHint").hidden = !more.length;
    $("pairHint").innerHTML = more.length ? '<p><b>비슷한 강연자도 함께 여쭤볼까요?</b> 여러 분께 함께 여쭤보면 일정이 맞는 분을 찾기 쉬워요. (최대 ' + MAX_PICKS + "명)</p><div>" +
      more.map(function (x) { return '<button type="button" class="pick-btn" data-pick="' + esc(x.c.name) + '">+ ' + esc(x.c.name) + "</button>"; }).join("") + "</div>" : "";
    $("noMatch").hidden = false;
    $("noMatch").innerHTML = '<span class="cn-tag">맞춤</span><p>원하는 주제가 없으면 담은 강연자에게 <b>「우리 학원 맞춤 설명회」</b>도 요청할 수 있어요. (강연자 「자세히 보기」에서 선택 · 금액 별도 안내 · 진행일 3주 전까지)</p>';
  }

  function togglePick(c) {
    if (!c) return;
    var i = S.picked.indexOf(c.name);
    if (i >= 0) { S.picked.splice(i, 1); delete S.product[c.name]; }
    else if (S.picked.length >= MAX_PICKS) { toast("강연자는 최대 " + MAX_PICKS + "명까지 담을 수 있어요. 다른 분을 담으시려면 먼저 한 분을 빼 주세요."); return; }
    else {
      var auto = autoTopic(c);
      if (auto) { pickTopic(c, auto); return; }   // 설명회까지 함께 담음
      S.picked.push(c.name);   // 설명회를 준비 중인 강연자 — 요청사항으로 상의
      toast(c.name + " 강연자를 담았어요. (" + S.picked.length + "/" + MAX_PICKS + ")");
    }
    refreshPicks(c);
  }
  // 상품을 바꾸면 학년·담은 강연자를 비움 (상품마다 설명회가 다름)
  function setPtype(id) {
    if (id === S.ptype) return;
    if (S.picked.length) toast("상품을 바꿔 담은 강연자를 비웠어요.");
    S.ptype = id;
    S.grades = [];
    S.picked = [];
    S.product = {};
    S.q = "";
    useTopics();
    $("form").elements.target.value = "";
    renderTargets();
    renderFind();
    renderCoaches();
    renderSummary();
  }

  /* ---------- 소장님 상세 ---------- */
  function youtubeId(u) {
    var m = String(u || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : "";
  }
  function ul(items) { return '<ul class="dots ink">' + items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"; }
  function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : "https://" + u; }
  // 설명회 카드 — 1단계 상세에서는 「이 설명회로 담기」 버튼이 붙음 (담을 때 설명회까지 정함, 따로 고르는 단계 없음)
  function topicCard(c, t) {
    var meta = [list(t.targets).join(", "), list(t.seasons).join(", ")].filter(Boolean);
    return '<div class="tcard' + (topicOn(c, t.name) ? " on" : "") + '"><div class="tc-cat">' + esc([t.area, list(t.cats || t.cat).join(", ")].filter(Boolean).join(" · ")) + "</div>" +
      '<div class="tc-name">' + esc(t.name) + "</div>" +
      (t.intro ? '<p class="tc-intro">' + esc(t.intro) + "</p>" : "") +
      (lines(t.points).length ? ul(lines(t.points)) : "") +
      (meta.length ? '<div class="tc-meta">' + meta.map(esc).join("<i></i>") + "</div>" : "") + topicBtn(c, t.name) + "</div>";
  }
  function customTopicCard(c) {
    return '<div class="tcard custom' + (topicOn(c, CUSTOM) ? " on" : "") + '"><div class="tc-cat">맞춤 · 금액 별도 안내</div><div class="tc-name">' + esc(CUSTOM) + "</div>" +
      '<p class="tc-intro">지역·학교·학원 상황에 맞춰 이 학원만을 위해 새로 준비해요. 진행일 ' + (CUSTOM_DAYS / 7) + "주 전까지 신청 · 원하시는 내용은 요청사항에 적어 주세요.</p>" + topicBtn(c, CUSTOM) + "</div>";
  }
  function topicOn(c, name) { return S.picked.indexOf(c.name) >= 0 && S.product[c.name] === name; }
  function topicBtn(c, name) {
    if (S.step !== 1) return "";
    return topicOn(c, name)
      ? '<button type="button" class="pick-btn on tc-pick" disabled>✓ 담긴 설명회</button>'
      : '<button type="button" class="pick-btn tc-pick" data-tc="' + esc(c.name) + '" data-tt="' + esc(name) + '">' + (S.picked.indexOf(c.name) >= 0 ? "이 설명회로 바꾸기" : "+ 이 설명회로 담기") + "</button>";
  }
  function detailTopics(c) {
    return (c.topics.length ? c.topics.map(function (t) { return topicCard(c, t); }).join("") : '<p class="muted">준비 중입니다.</p>') +
      (S.step === 1 ? customTopicCard(c) : "");
  }
  // 설명회를 골라 담기 (이미 담은 강연자면 설명회만 바꿈)
  function pickTopic(c, name) {
    if (!c) return;
    if (S.picked.indexOf(c.name) < 0) {
      if (S.picked.length >= MAX_PICKS) { toast("강연자는 최대 " + MAX_PICKS + "명까지 담을 수 있어요. 다른 분을 담으시려면 먼저 한 분을 빼 주세요."); return; }
      S.picked.push(c.name);
    }
    S.product[c.name] = name;
    if (S.date && parse(S.date) < minDate()) {
      S.date = ""; S.time = "";
      toast("맞춤 설명회는 " + (CUSTOM_DAYS / 7) + "주 뒤 날짜부터 고를 수 있어 날짜를 다시 골라 주세요.");
    } else toast(c.name + " · " + name + " 담았어요. (" + S.picked.length + "/" + MAX_PICKS + ")");
    refreshPicks(c);
  }
  function refreshPicks(c) {
    renderCoaches();
    renderSummary();
    if ($("coachModal").open && $("detailCta")) {
      $("detailCta").innerHTML = detailCta(c);
      $("detailTopics").innerHTML = detailTopics(c);
    }
  }
  function openDetail(c) {
    if (!c) return;
    var intro = c.history.length ? "<h4>경력</h4>" + ul(c.history) : "";
    if (!intro) intro = '<p class="muted">준비 중입니다.</p>';
    var topics = '<div id="detailTopics">' + detailTopics(c) + "</div>";
    // 유튜브 링크는 바로 재생, 나머지 링크는 버튼으로
    var vids = c.links.filter(function (l) { return youtubeId(l.url); }).slice(0, 2);
    var others = c.links.filter(function (l) { return vids.indexOf(l) < 0; });
    var media = vids.map(function (l) {
      return '<div class="video"><iframe src="https://www.youtube.com/embed/' + youtubeId(l.url) + '" allowfullscreen title="강의 영상"></iframe></div>';
    }).join("") +
      (others.length ? '<div class="link-list">' + others.map(function (l) {
        return '<a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener"><span>' + esc(l.type || "링크") + "</span>" + esc(l.url.replace(/^https?:\/\/(www\.)?/i, "")) + "</a>";
      }).join("") + "</div>" : "") +
      (c.photos.length ? '<div class="photos">' + c.photos.map(function (p) { return '<img src="' + esc(p) + '" alt="" loading="lazy">'; }).join("") + "</div>" : "");
    if (!media) media = '<p class="muted">등록된 영상·링크가 없습니다.</p>';

    var grades = S.ptype === "biz" ? c.bizTargets : c.grades;
    $("coachDetail").innerHTML =
      '<div class="profile">' + avatar(c, "lg") + '<div class="nm">' + esc(c.name) + "</div>" +
        (c.slogan.length ? '<div class="slogan">' + c.slogan.map(esc).join("<br>") + "</div>" : "") +
        (c.mainTitle ? '<div class="main-title">주력 설명회 · <b>' + esc(c.mainTitle) + "</b></div>" : "") +
        (grades.length ? '<div class="rec-grades">대상 ' + esc(grades.join(" · ")) + "</div>" : "") + "</div>" +
      // 탭은 바로가기 — 내용은 한 페이지에 이어서 보이고, 탭을 누르면 그 부분으로 이동
      '<div class="tabs" role="tablist"><button type="button" class="on" data-tab="0">소개</button><button type="button" data-tab="1">설명회 ' + c.topics.length + '</button><button type="button" data-tab="2">영상·링크</button></div>' +
      '<section class="tab-pane" data-pane="0"><h3 class="pane-title">소개</h3>' + intro + "</section>" +
      '<section class="tab-pane" data-pane="1"><h3 class="pane-title">설명회</h3>' + topics + "</section>" +
      '<section class="tab-pane" data-pane="2"><h3 class="pane-title">영상·링크</h3>' + media + "</section>" +
      // 상세에서 고른 강연자는 그대로 담겨서 「구매하러 가기」로 넘어감 (다시 고르지 않음)
      (S.step === 1 ? '<div class="modal-cta" id="detailCta">' + detailCta(c) + "</div>" : "");
    $("coachModal").showModal();
    $("coachDetail").scrollTop = 0;
  }
  function detailCta(c) {
    var on = S.picked.indexOf(c.name) >= 0;
    if (on) return '<div class="cta-picked"><span>담긴 설명회 <b>' + esc(S.product[c.name] || "요청사항으로 상의") + '</b></span><button type="button" class="btn ghost sm" data-pick="' + esc(c.name) + '">빼기</button></div>';
    var auto = autoTopic(c);
    return '<button type="button" class="btn primary" data-pick="' + esc(c.name) + '">담기' + (auto ? " · " + esc(auto) : "") + "</button>" +
      (c.topics.length > 1 ? '<p class="cta-note">다른 설명회를 원하시면 위 설명회에서 「이 설명회로 담기」를 눌러 주세요.</p>' : "");
  }
  // 담기만 눌렀을 때 함께 담길 설명회 — 맞는 강연자가 없던 검색이면 맞춤 설명회, 아니면 검색어와 가장 맞는 것 → 첫 설명회
  function autoTopic(c) {
    if (S.mode === "none" && S.q.trim()) return CUSTOM;
    var best = bestTopic(c, interpret(S.q));
    return best ? best.name : c.topics.length ? c.topics[0].name : "";
  }

  function productsDone() {
    return S.picked.length > 0 && S.picked.every(function (n) { var c = findCoach(n); return S.product[n] || (c && !c.topics.length); });
  }

  /* ---------- 3단계: 날짜 하나 · 시작 시간 ---------- */
  function renderCal() {
    var m = S.month;
    $("monthLabel").textContent = m.getFullYear() + "년 " + (m.getMonth() + 1) + "월";
    var first = new Date(m.getFullYear(), m.getMonth(), 1);
    var last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    var t = ymd(today());
    var html = "";
    for (var i = 0; i < first.getDay(); i++) html += "<span></span>";
    for (var d = 1; d <= last; d++) {
      var dt = new Date(m.getFullYear(), m.getMonth(), d), s = ymd(dt);
      // 고른 소장님 모두가 그날 하루 전체 일정이 있으면 막음
      var full = S.picked.length > 0 && S.picked.every(function (n) { return dayOff(n, s); });
      var cls = "day" + (s === t ? " today" : "") + (s === S.date ? " pick cur" : "") + (full ? " blocked" : "");
      html += '<button type="button" class="' + cls + '" data-d="' + s + '"' + (dt < minDate() || full ? " disabled" : "") + ">" + d + "</button>";
    }
    $("calDays").innerHTML = html;
    $("prevMonth").disabled = m <= new Date(today().getFullYear(), today().getMonth(), 1);
  }

  function fillTimeSelects() {
    var r = C.START_HOURS || [8, 21], step = C.MINUTE_STEP || 10;
    var hs = ['<option value="">시</option>'], ms = ['<option value="">분</option>'];
    for (var h = r[0]; h <= r[1]; h++) hs.push('<option value="' + String(h).padStart(2, "0") + '">' + (h < 12 ? "오전 " : "오후 ") + (h % 12 || 12) + "시</option>");
    for (var m = 0; m < 60; m += step) ms.push('<option value="' + String(m).padStart(2, "0") + '">' + String(m).padStart(2, "0") + "분</option>");
    $("tH").innerHTML = hs.join("");
    $("tM").innerHTML = ms.join("");
  }

  function renderWhen() {
    renderCal();
    var p = S.time ? S.time.split(":") : ["", ""];
    $("tH").value = p[0];
    $("tM").value = p[1];
    $("tH").disabled = $("tM").disabled = !S.date;
    $("dateLabel").innerHTML = S.date ? "<b>" + esc(krDate(S.date)) + "</b> 몇 시에 시작할까요?" : "먼저 달력에서 날짜를 골라 주세요.";
    $("timeHint").textContent = S.date && !S.time ? "시와 분을 골라 주세요." : S.time ? krTime(S.time) + " 시작" : "";
    var bad = clashed();
    $("clashNotice").hidden = !bad.length;
    $("clashNotice").innerHTML = bad.map(function (n) {
      var b = clashOf(n, S.date, S.time);
      return "<p><b>" + esc(n) + " 소장님</b>은 " + (b.time ? krTime(b.time) + "에 이미 확정된 설명회가 있어 이 시간은 어려워요." : "이날 이미 일정이 있어요.") +
        ' <button type="button" class="link" data-unpick="' + esc(n) + '">이 소장님 빼기</button></p>';
    }).join("") + (bad.length ? '<p class="muted">시작 시간을 바꾸거나 소장님을 빼 주세요. (확정된 일정 앞뒤 ' + (OVERLAP / 60) + "시간은 겹치는 것으로 봅니다)</p>" : "");
    $("soonNotice").hidden = !(S.date && daysFromToday(S.date) < (C.WARN_DAYS || 21));
    var cu = hasCustom();
    $("reqTag").textContent = cu ? "맞춤 설명회 필수" : "선택";
    $("reqTag").classList.toggle("must", cu);
    $("customReq").hidden = !cu;
    renderSummary();
  }

  function pickDate(s) {
    if (parse(s) < minDate()) { $("calMsg").textContent = hasCustom() ? "맞춤 설명회는 준비 기간이 필요해 진행일 최소 " + (CUSTOM_DAYS / 7) + "주 전까지만 신청할 수 있습니다." : "진행일 최소 2주 전까지만 신청할 수 있습니다."; return; }
    S.date = s;
    var off = S.picked.filter(function (n) { return dayOff(n, s); });
    $("calMsg").textContent = off.length ? off.join(", ") + " 소장님은 이날 일정이 있어요." : "";
    renderWhen();
  }
  function setTime() {
    var h = $("tH").value, m = $("tM").value;
    if (h && !m) m = "00";   // 시만 고르면 정각으로
    S.time = h && m ? h + ":" + m : "";
    renderWhen();
  }
  function needRequest() { return hasCustom() && !$("request").value.trim(); }
  function whenDone() { return !!(S.date && S.time) && !clashed().length && S.picked.length > 0 && !needRequest(); }

  /* ---------- 신청 내역 / 하단 바 ---------- */
  function memberVal() { return ($("form").elements.member || {}).value; }

  function priceText() {
    if (!S.picked.length) return "0원";
    if (S.picked.every(function (n) { return S.product[n] === CUSTOM; })) return "맞춤 설명회 금액 별도 안내";
    if (hasCustom()) return basePrice() + " (맞춤 설명회는 별도 안내)";
    return basePrice();
  }
  // 강연 시간·회원 여부(4단계)를 고른 만큼 좁혀서 보여 줌
  function basePrice() {
    var m = memberVal(), d = durOf(fv("duration")), ds = d ? [d] : DURS;
    var mem = rangeText(ds.map(function (x) { return x.member; })), non = rangeText(ds.map(function (x) { return x.nonmember; }));
    if (mem.indexOf("~") < 0) mem += "~";   // VAT 별도 금액이라 "60만원~"처럼 물결을 붙임
    if (non.indexOf("~") < 0) non += "~";
    if (m === "회원") return mem;
    if (m === "비회원") return non;
    return "회원 " + mem + " · 비회원 " + non;
  }

  function summaryHtml() {
    var one = S.step === 1;   // 1단계는 장바구니처럼 — 담은 강연자와 빼기 버튼
    var picks = (one ? "<h4>담은 강연자 <small>" + S.picked.length + "/" + MAX_PICKS + "</small></h4>" : "<h4>강연자 · 설명회 <small>" + S.picked.length + "명</small></h4>") +
      (S.picked.length ? '<ul class="sum-picks">' + S.picked.map(function (n) {
        var c = findCoach(n), p = S.product[n] || (c && !c.topics.length ? "요청사항으로 상의" : S.step >= 2 ? "설명회 미선택" : "");
        return '<li><b>' + esc(n) + "</b>" + (p ? '<span class="' + (S.product[n] || !c || !c.topics.length ? "" : "none") + '">' + esc(p) + "</span>" : "") +
          (one ? '<button type="button" class="link sum-change" data-more="' + esc(n) + '">설명회 바꾸기</button><button type="button" class="sum-x" data-pick="' + esc(n) + '" aria-label="' + esc(n) + ' 빼기">×</button>' : "") + "</li>";
      }).join("") + "</ul>" : '<p class="sum-kind"><span class="none">마음에 드는 강연자를 담아 주세요</span></p>');
    var when = '<h4>희망 일정</h4><p class="sum-kind">' + (S.date ? esc(krDate(S.date)) + (S.time ? "<span>" + esc(krTime(S.time)) + " 시작</span>" : "") : '<span class="none">미선택</span>') + "</p>";
    return { picks: picks, when: when };
  }

  function stepState() {
    if (S.step === 1) {
      var n = S.picked.length;
      return { ok: n > 0, label: "구매하러 가기" + (n ? " (" + n + ")" : ""), txt: "<b>담은 강연자 " + n + "/" + MAX_PICKS + "</b>" + (n ? "여러 분께 함께 여쭤보면 일정 맞추기가 쉬워요" : "마음에 드는 강연자를 담아 주세요") };
    }
    if (S.step === 3) {
      return { ok: whenDone(), label: "다음", txt: "<b>" + (S.date ? esc(krDate(S.date)) : "희망 날짜") + "</b>" +
        (!S.date ? "날짜를 골라 주세요" : !S.time ? "시작 시간을 골라 주세요" : clashed().length ? "일정이 겹치는 소장님이 있어요" : needRequest() ? "맞춤 설명회 내용을 요청사항에 적어 주세요" : esc(krTime(S.time)) + " 시작") };
    }
    var left4 = formErrors().length;
    return { ok: !S.sending && !left4, soft: true, label: S.sending ? "신청 중…" : "신청하기",
      txt: left4 ? "<b>필수 항목 " + left4 + "개 남음</b>모두 입력하면 신청할 수 있어요" : "<b>예상 " + esc(priceText()) + '</b><em class="vat">VAT 별도</em>' };
  }

  function renderSummary() {
    var h = summaryHtml();
    $("sumPicks").innerHTML = h.picks;
    $("sumWhen").innerHTML = h.when;
    $("sumPrice").textContent = priceText();
    $("mSum").innerHTML = '<div class="sum-block">' + h.picks + '</div><div class="sum-block">' + h.when + "</div>";

    var st = stepState();
    // 4단계는 눌러 보면 빠진 항목을 빨갛게 알려 주도록, 막지 않고 흐리게만 둔다
    each(document.querySelectorAll("[data-next]"), function (b) {
      b.textContent = st.label;
      b.disabled = !st.ok && !st.soft;
      b.classList.toggle("is-off", !st.ok && !!st.soft);
      b.setAttribute("aria-disabled", String(!st.ok));
    });
    save();
    each(document.querySelectorAll("[data-prev]"), function (b) { b.hidden = S.step === 1; });
    $("barTxt").innerHTML = st.txt;
    $("sumNote").textContent = "강연자 일정을 확인한 뒤 담당자가 연락드려요. 신청만으로 확정되지는 않습니다.";
    if (S.step === 4) renderMember();
  }

  /* ---------- 4단계: 강연 시간 · 회원 여부 (금액은 아래 표로) ---------- */
  function renderMember() {
    var m = memberVal(), dur = fv("duration");
    $("durSeg").innerHTML = DURS.map(function (d) {
      return '<button type="button" class="mcard' + (dur === d.id ? " on" : "") + '" data-dur="' + esc(d.id) + '"><span class="radio"></span><span class="mc-body"><b>' + esc(d.label) + "</b></span></button>";
    }).join("");
    $("memberSeg").innerHTML =
      '<button type="button" class="mcard' + (m === "회원" ? " on" : "") + '" data-v="회원"><span class="radio"></span><span class="mc-body"><b>클럽하와이 회원</b><span class="mc-tag">회원가</span></span></button>' +
      '<button type="button" class="mcard' + (m === "비회원" ? " on" : "") + '" data-v="비회원"><span class="radio"></span><span class="mc-body"><b>비회원</b><span class="mc-tag gray">비회원가</span></span></button>';
    renderPriceTable();
  }

  /* ---------- 단계 이동 ---------- */
  // 단계 번호: 1 강연자 찾기 · 3 날짜·시간 · 4 신청 정보 · 5 완료 (예전 2단계 「설명회 고르기」는 1단계 담기에 합침)
  function go(step) {
    if (step === 2) step = S.step >= 3 ? 1 : 3;
    if (step >= 3 && (!S.picked.length || !productsDone())) step = 1;
    else if (step >= 4 && !whenDone()) step = 3;
    S.step = step;
    ["step1", "step3", "step4", "done"].forEach(function (id) { $(id).hidden = id !== (step === 5 ? "done" : "step" + step); });
    each($("steps").children, function (li) {
      var n = +li.dataset.step;
      li.classList.toggle("on", n === step);
      li.classList.toggle("past", n < step);
    });
    var finished = step === 5;
    $("side").hidden = finished;
    $("bar").hidden = finished;
    $("pageHead").hidden = finished;
    $("headIntro").hidden = step !== 1;   // 제목·맞춤 설명회 안내는 첫 단계에서만 (이후 단계는 단계 표시만)
    if (step === 1) renderCoaches();
    if (step === 3) {
      if (!S.month) { var md = minDate(); S.month = new Date(md.getFullYear(), md.getMonth(), 1); }
      renderWhen();
    }
    renderSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    if (S.step === 4) submit();
    else if (stepState().ok) {
      // 맞는 강연자가 없던 검색어는 요청사항에 미리 적어 둠 (강연자에게 그 주제로 가능한지 여쭘)
      if (S.step === 1 && S.mode === "none" && S.q.trim() && !$("request").value.trim()) $("request").value = "원하는 주제: " + S.q.trim();
      go(S.step + 1);
    }
  }
  function prev() { if (S.step > 1 && S.step < 5) go(S.step - 1); }

  /* ---------- 4단계: 입력 확인 ---------- */
  function fieldOf(el) { return el.closest(".field") || el.closest(".check"); }
  function setErr(el, msg) {
    var f = fieldOf(el);
    if (!f) return;
    f.classList.add("err");
    if (f.classList.contains("field")) {
      var m = f.querySelector(".msg");
      if (!m) { m = document.createElement("span"); m.className = "msg"; f.appendChild(m); }
      m.textContent = msg;
    }
  }
  function clearErr(el) {
    var f = fieldOf(el);
    if (!f) return;
    f.classList.remove("err");
    var m = f.querySelector(".msg");
    if (m) m.remove();
  }

  function fv(n) { return String($("form").elements[n].value || "").trim(); }
  // 빠진·틀린 항목 목록 (화면에 표시하지 않고 세기만 함)
  function formErrors() {
    var form = $("form"), out = [];
    function bad(name, msg) { out.push({ name: name, msg: msg }); }
    if (!fv("duration")) bad("duration", "강연 시간을 골라 주세요.");
    if (!fv("member")) bad("member", "회원 여부를 골라 주세요.");
    if (!fv("academy")) bad("academy", "학원명을 입력해 주세요.");
    if (!fv("director")) bad("director", "원장님 성함을 입력해 주세요.");
    if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(fv("phone"))) bad("phone", fv("phone") ? "휴대폰 번호를 끝까지 입력해 주세요." : "휴대폰 번호를 입력해 주세요.");
    if (fv("attendees") && !/^\d+$/.test(fv("attendees"))) bad("attendees", "숫자만 입력해 주세요.");
    if (!fv("target")) bad("target", "설명회 대상을 하나 이상 골라 주세요.");
    if (!fv("addr1")) bad("addr1", "학원 주소를 입력해 주세요.");
    else if (!fv("addr2")) bad("addr2", "상세 주소를 입력해 주세요.");
    if (!form.elements.venueSame.checked) {
      if (!fv("vaddr1")) bad("vaddr1", "설명회 진행 장소를 입력하거나 「학원 주소와 같아요」를 체크해 주세요.");
      else if (!fv("vaddr2")) bad("vaddr2", "상세 주소나 장소 이름을 입력해 주세요.");
    }
    ["agreePrivacy", "agreeThird", "agreeShoot", "agreePhoto", "agreePolicy"].forEach(function (n) { if (!form.elements[n].checked) bad(n, ""); });
    return out;
  }
  // 한 칸만 다시 검사해서 틀렸으면 빨갛게 (칸을 벗어날 때)
  function checkOne(name) {
    var el = $("form").elements[name];
    if (!el) return;
    var hit = formErrors().filter(function (e) { return e.name === name; })[0];
    if (hit) setErr(el, hit.msg); else clearErr(el);
  }

  function check() {
    var form = $("form"), first = null;
    each(form.querySelectorAll("input, select, textarea"), clearErr);
    formErrors().forEach(function (e) {
      var el = form.elements[e.name];
      setErr(el, e.msg);
      if (!first) first = el;
    });
    if (first) {
      fieldOf(first).scrollIntoView({ behavior: "smooth", block: "center" });
      if (first.type !== "hidden" && first.type !== "checkbox") setTimeout(function () { first.focus({ preventScroll: true }); }, 300);
      toast(first.type === "checkbox" ? "필수 항목에 동의해 주세요." : "입력하지 않은 항목이 있습니다.");
      return null;
    }
    var v = fv;
    var address = v("addr1") + " " + v("addr2") + (v("zip") ? " (" + v("zip") + ")" : "");
    return {
      academy: v("academy"), director: v("director"), phone: v("phone"),
      member: v("member"), target: v("target"), duration: (durOf(v("duration")) || {}).label || "",
      address: address,
      venue: form.elements.venueSame.checked ? address + " (학원)" : v("vaddr1") + " " + v("vaddr2") + (v("vzip") ? " (" + v("vzip") + ")" : ""),
      attendees: v("attendees"), request: $("request").value.trim(),
      date: S.date, time: S.time,
      picks: S.picked.map(function (n) { return { coach: n, product: S.product[n] || "" }; }),
      kind: kindOf(S.kind).name
    };
  }

  function submit() {
    if (S.sending) return;
    var body = check();
    if (!body) return;
    S.sending = true;
    renderSummary();
    var req = DEMO
      ? new Promise(function (ok) { setTimeout(function () { ok({ ok: true, id: "SEM-" + ymd(today()).replace(/-/g, "") + "-000", due: new Date(Date.now() + HOURS * 3600e3).toISOString() }); }, 700); })
      : fetch(C.APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); });
    req.then(function (res) {
      if (!res.ok) throw new Error(res.error || "");
      showDone(res, body);
    }).catch(function (e) {
      S.sending = false;
      renderSummary();
      toast(e && e.message && !/fetch|network|json/i.test(e.message) ? e.message : "신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    });
  }

  function showDone(res, b) {
    S.sending = false;
    S.finished = true;
    try { sessionStorage.removeItem(SAVE_KEY); } catch (e) {}
    $("doneSum").innerHTML =
      "<dt>신청번호</dt><dd>" + esc(res.id) + "</dd>" +
      "<dt>학원</dt><dd>" + esc(b.academy) + " · " + esc(b.director) + " 원장님</dd>" +
      "<dt>희망 일정</dt><dd>" + esc(krDate(b.date)) + " " + esc(krTime(b.time)) + " 시작 · 강연 " + esc(b.duration) + "</dd>" +
      '<dt>소장님 · 설명회</dt><dd><ul class="done-picks">' + b.picks.map(function (p) {
        return "<li><b>" + esc(p.coach) + "</b><span>" + esc(p.product || "요청사항으로 상의") + "</span></li>";
      }).join("") + "</ul></dd>" +
      (b.request ? "<dt>요청사항</dt><dd>" + esc(b.request) + '<small class="muted">담당자가 확인한 뒤 연락드립니다.</small></dd>' : "");
    go(5);
  }

  /* ---------- 주소 검색 (다음 우편번호) ---------- */
  var ADDR = { academy: ["zip", "addr1", "addr2"], venue: ["vzip", "vaddr1", "vaddr2"] };
  function openPost(which) {
    var form = $("form"), f = ADDR[which] || ADDR.academy;
    var zip = form.elements[f[0]], a1 = form.elements[f[1]], a2 = form.elements[f[2]];
    // 파일을 더블클릭해 열면(file://) 검색 결과를 눌러도 값이 넘어오지 않는다 — 미리보기.bat으로 열어야 함
    if (location.protocol === "file:") toast("파일로 열면 주소 검색이 동작하지 않습니다. 폴더의 '미리보기.bat'으로 열어 주세요.");
    if (!window.daum || !window.daum.Postcode) {
      // 검색 창을 못 불러오면 직접 입력할 수 있게 연다
      a1.readOnly = false;
      a1.placeholder = "도로명 주소를 입력해 주세요";
      a1.focus();
      toast("주소 검색을 불러오지 못해 직접 입력으로 바꿨습니다.");
      return;
    }
    $("postWrap").innerHTML = "";
    new window.daum.Postcode({
      width: "100%",
      height: "100%",
      oncomplete: function (d) {
        var extra = [d.bname && /[동로가]$/.test(d.bname) ? d.bname : "", d.apartment === "Y" ? d.buildingName : ""].filter(Boolean).join(", ");
        zip.value = d.zonecode;
        a1.value = (d.roadAddress || d.jibunAddress) + (extra ? " (" + extra + ")" : "");
        clearErr(a1);
        $("postModal").close();
        a2.focus();
        renderSummary();
      }
    }).embed($("postWrap"));
    $("postModal").showModal();
  }

  // 입력하는 대로 010-1234-5678 형태로 하이픈을 붙인다 (010이 아닌 10자리 번호는 011-123-4567)
  function phoneFmt(v) {
    var d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + "-" + d.slice(3);
    if (d.length === 10 && d.indexOf("010") !== 0) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    // 1단계
    $("ptypeSeg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-ptype]");
      if (b) setPtype(b.dataset.ptype);
    });
    $("gradeChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-grade]");
      if (!b) return;
      var g = b.dataset.grade, i = S.grades.indexOf(g);
      if (i >= 0) S.grades.splice(i, 1); else S.grades.push(g);
      S.grades = gradeList().filter(function (x) { return S.grades.indexOf(x) >= 0; });   // 칩 순서대로
      renderFind();
      renderCoaches();
      renderSummary();
    });
    $("kwChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-kw]");
      if (!b) return;
      S.q = norm(S.q) === norm(b.dataset.kw) ? "" : b.dataset.kw;   // 같은 칩을 다시 누르면 지움
      renderFind();
      renderCoaches();
      renderSummary();
      if (!S.grades.length) toast((S.ptype === "biz" ? "교육 대상" : "학년") + "을 먼저 골라 주세요.");
    });
    $("q").addEventListener("input", function (e) {
      S.q = e.target.value;
      renderFind();
      renderCoaches();
      renderSummary();
    });
    $("q").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.target.blur(); if (!S.grades.length) toast((S.ptype === "biz" ? "교육 대상" : "학년") + "을 먼저 골라 주세요."); }
    });
    // 카드를 누르면 자세히 보기 — 담기는 카드 안 버튼과 상세 창 버튼으로
    $("coachList").addEventListener("click", function (e) {
      if (e.target.closest("[data-more]") || e.target.closest("[data-pick]")) return;   // 아래 공통 처리
      var card = e.target.closest("[data-c]");
      if (card) openDetail(findCoach(card.dataset.c));
    });
    $("coachList").addEventListener("keydown", function (e) {
      var card = e.target.closest("[data-c]");
      if (card && e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDetail(findCoach(card.dataset.c)); }
    });
    $("coachDetail").addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (!t) return;
      var body = this, pane = body.querySelector('[data-pane="' + t.dataset.tab + '"]');
      setTab(t.dataset.tab);
      body.scrollTo({ top: pane.offsetTop - body.querySelector(".tabs").offsetHeight - 8, behavior: "smooth" });
    });
    // 스크롤한 위치에 맞춰 탭 표시를 바꿈
    $("coachDetail").addEventListener("scroll", function () {
      var body = this, tabs = body.querySelector(".tabs");
      if (!tabs) return;
      var y = body.scrollTop + tabs.offsetHeight + 24, cur = "0";
      each(body.querySelectorAll("[data-pane]"), function (p) { if (p.offsetTop <= y) cur = p.dataset.pane; });
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) cur = String(body.querySelectorAll("[data-pane]").length - 1);
      setTab(cur);
    });
    function setTab(k) {
      each($("coachDetail").querySelectorAll("[data-tab]"), function (b) { b.classList.toggle("on", b.dataset.tab === k); });
    }

    // 3단계
    $("calDays").addEventListener("click", function (e) {
      var d = e.target.closest("[data-d]");
      if (d && !d.disabled) pickDate(d.dataset.d);
    });
    $("prevMonth").addEventListener("click", function () { S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1); renderCal(); });
    $("nextMonth").addEventListener("click", function () { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1); renderCal(); });
    $("tH").addEventListener("change", setTime);
    $("tM").addEventListener("change", setTime);
    $("clashNotice").addEventListener("click", function (e) {
      var b = e.target.closest("[data-unpick]");
      if (!b) return;
      togglePick(findCoach(b.dataset.unpick));
      renderWhen();
    });
    $("request").addEventListener("input", function () { renderSummary(); });

    // 4단계
    $("durSeg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-dur]");
      if (!b) return;
      var input = $("form").elements.duration;
      input.value = b.dataset.dur;
      clearErr(input);
      renderSummary();
    });
    $("memberSeg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-v]");
      if (!b) return;
      var input = $("form").elements.member;
      input.value = b.dataset.v;
      clearErr(input);
      renderSummary();
    });
    $("form").addEventListener("input", function (e) {
      if (e.target.name === "phone") e.target.value = phoneFmt(e.target.value);
      if (e.target.name === "attendees") e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);   // 숫자만
      if (fieldOf(e.target) && fieldOf(e.target).classList.contains("err")) checkOne(e.target.name);
      renderSummary();
    });
    $("form").addEventListener("change", function (e) {
      if (e.target.name === "venueSame") { $("venueBox").hidden = e.target.checked; ["vaddr1", "vaddr2"].forEach(function (n) { clearErr($("form").elements[n]); }); }
      if (e.target.type === "checkbox") checkOne(e.target.name);
      renderSummary();
    });
    // 칸을 벗어날 때 틀렸으면 빨갛게
    $("form").addEventListener("focusout", function (e) {
      var n = e.target.name;
      if (!n || e.target.type === "checkbox" || e.target.type === "hidden") return;
      if (e.target.readOnly && !fv(n)) return;
      checkOne(n);
    });
    $("targetChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-target]");
      if (!b) return;
      var input = $("form").elements.target;
      var cur = list(input.value), t = b.dataset.target, i = cur.indexOf(t);
      if (i >= 0) cur.splice(i, 1); else cur.push(t);
      input.value = targetList().filter(function (x) { return cur.indexOf(x) >= 0; }).join(", ");
      renderTargets();
      checkOne("target");
      renderSummary();
    });
    $("form").addEventListener("submit", function (e) { e.preventDefault(); submit(); });
    $("form").addEventListener("click", function (e) {
      var a = e.target.closest("[data-addr]");
      if (a && !(a.tagName === "INPUT" && !a.readOnly)) openPost(a.dataset.addr);
    });

    // 공통
    document.addEventListener("click", function (e) {
      var tc = e.target.closest("[data-tc]");
      if (tc) { pickTopic(findCoach(tc.dataset.tc), tc.dataset.tt); return; }
      var pk = e.target.closest("[data-pick]");
      if (pk) { togglePick(findCoach(pk.dataset.pick)); return; }
      var more = e.target.closest("[data-more]");
      if (more) { openDetail(findCoach(more.dataset.more)); return; }
      var nb = e.target.closest("[data-next]");
      if (nb && nb.classList.contains("is-off")) { check(); return; }
      if (nb) next();
      if (e.target.closest("[data-prev]")) prev();
      var o = e.target.closest("[data-open]");
      if (o) $(o.dataset.open + "Modal").showModal();
      if (e.target.closest("[data-close]")) e.target.closest("dialog").close();
      if (e.target.tagName === "DIALOG") e.target.close();   // 바깥 클릭으로 닫기
    });
  }

  /* ---------- 설명회 대상 (여러 개) — 기업·기관 상품이면 교육 대상 ---------- */
  function targetList() { return S.ptype === "biz" ? GRADES.biz : (C.TARGETS || []); }
  function renderTargets() {
    var cur = list($("form").elements.target.value);
    $("targetChips").innerHTML = targetList().map(function (t) {
      var on = cur.indexOf(t) >= 0;
      return '<button type="button" class="chip' + (on ? " on" : "") + '" aria-pressed="' + on + '" data-target="' + esc(t) + '">' + esc(t) + "</button>";
    }).join("");
  }

  /* ---------- 입력 내용 보관 (같은 탭에서 새로고침해도 이어서) ---------- */
  var SAVE_KEY = "seminar-signup-v4";
  var KEEP = ["duration", "member", "academy", "director", "phone", "attendees", "target", "zip", "addr1", "addr2", "vzip", "vaddr1", "vaddr2"];
  function save() {
    if (S.finished) return;
    try {
      var form = $("form"), f = {};
      KEEP.forEach(function (n) { f[n] = form.elements[n].value; });
      f.venueSame = form.elements.venueSame.checked;
      sessionStorage.setItem(SAVE_KEY, JSON.stringify({
        step: S.step, ptype: S.ptype, grades: S.grades, q: S.q, mode: S.mode,
        picked: S.picked, product: S.product, date: S.date, time: S.time, request: $("request").value, form: f
      }));
    } catch (e) {}
  }
  function restore() {
    var d = null;
    try { d = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null"); } catch (e) {}
    if (!d || !Array.isArray(d.picked)) return 1;
    if ((C.PRODUCTS || []).some(function (p) { return p.id === d.ptype; })) S.ptype = d.ptype;
    S.grades = Array.isArray(d.grades) ? gradeList().filter(function (g) { return d.grades.indexOf(g) >= 0; }) : [];
    S.q = typeof d.q === "string" ? d.q : "";
    S.mode = d.mode || "";
    S.picked = d.picked.map(String);
    S.product = d.product && typeof d.product === "object" ? d.product : {};
    S.date = /^\d{4}-\d{2}-\d{2}$/.test(d.date) && parse(d.date) >= minDate() ? d.date : "";
    S.time = /^\d{2}:\d{2}$/.test(d.time) ? d.time : "";
    $("request").value = d.request || "";
    var form = $("form"), f = d.form || {};
    KEEP.forEach(function (n) { if (f[n] != null) form.elements[n].value = f[n]; });
    form.elements.venueSame.checked = !!f.venueSame;
    $("venueBox").hidden = !!f.venueSame;
    renderTargets();
    if (S.date) { var p = parse(S.date); S.month = new Date(p.getFullYear(), p.getMonth(), 1); }
    return Math.min(4, Math.max(1, +d.step || 1));
  }

  /* ---------- 시작 ---------- */
  function init() {
    $("demoBar").hidden = !DEMO;
    each(document.querySelectorAll(".retention"), function (el) { el.textContent = C.PRIVACY_RETENTION || ""; });
    each(document.querySelectorAll(".resp-h"), function (el) { el.textContent = HOURS; });
    each(document.querySelectorAll(".max-picks"), function (el) { el.textContent = MAX_PICKS; });
    $("policyModalBody").innerHTML = $("policyInline").innerHTML;
    renderTargets();
    renderPerk();
    fillTimeSelects();
    if (C.CONTACT_URL) {
      each(document.querySelectorAll("[data-contact]"), function (a) { a.href = C.CONTACT_URL; });
      $("contactTop").hidden = false;
      $("helpCard").hidden = false;
    }
    bind();
    var step = restore();   // 새로고침·화면 갱신이 있어도 입력한 내용과 단계를 이어서 보여 줌
    renderTargets();        // 상품(학부모·학생 / 기업·기관)에 맞는 대상 칩
    renderFind();
    $("coachList").innerHTML = '<p class="empty">강연자 정보를 불러오는 중…</p>';
    load().then(function (d) {
      useData(d);
      renderHero();
      go(step);
    }).catch(function () {
      $("coachList").innerHTML = '<p class="empty">강연자 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>';
    });
  }

  init();
})();
