// 학생·학부모 설명회 신청 — 소장님(최대 MAX_PICKS명) → 소장님별 설명회 하나 → 날짜 하나·시작 시간·요청사항 → 신청 정보 → 완료
// 신청하면 고른 소장님께 일정이 되는지 먼저 확인하고, 가능한 소장님과 조율한 뒤 본사 담당자가 원장님께 직접 연락함
(function () {
  "use strict";

  var C = window.APP_CONFIG || {};
  var DEMO = !C.APPS_SCRIPT_URL;
  var DOW = "일월화수목금토";
  var HOURS = C.RESPONSE_HOURS || 24;
  var MAX_PICKS = C.MAX_PICKS || 3;
  var OVERLAP = (C.OVERLAP_HOURS || 3) * 60;   // 분

  var S = {
    coaches: [],
    blocked: [],          // { coach, date, time } — time이 비어 있으면 그날 하루 전체
    filter: "전체",
    cat: "전체",          // 주제로 찾기
    q: "",
    picked: [],           // 고른 소장님 이름 (누른 순서)
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
  var MIN_DATE = addDays(today(), C.MIN_DAYS || 14);

  /* ---------- 가격 ---------- */
  function man(n) { return n % 10000 === 0 ? (n / 10000).toLocaleString("ko-KR") : (n / 10000).toFixed(1); }
  function priceOf(range) {
    if (!range) return "확정 필요";
    return range[0] === range[1] ? man(range[0]) + "만원" : man(range[0]) + "~" + man(range[1]) + "만원";
  }
  function kindOf(id) { return (C.KINDS || []).filter(function (k) { return k.id === id; })[0]; }

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
    S.coaches = (d.coaches || []).map(function (c) {
      var all = (c.topics || []).filter(function (t) { return t.name; });
      var topics = all.filter(function (t) { return areaPage(t.area) !== "biz"; });
      // 대상 태그는 설명회의 대상을 모아서 만듦
      var targets = (C.TARGETS || []).filter(function (x) {
        return topics.some(function (t) { return list(t.targets).indexOf(x) >= 0; });
      });
      return {
        name: c.name, photo: c.photo || "", slogan: lines(c.slogan),
        history: lines(c.title).concat(lines(c.history), lines(c.extra), lines(c.works)),   // 클럽하와이 직함은 경력 맨 위
        links: (c.links || []).filter(function (l) { return l && l.url; }), photos: list(c.photos),
        topics: topics, targets: targets, bizOnly: all.length > 0 && !topics.length
      };
    }).filter(function (c) { return !c.bizOnly; })   // 비즈니스 교육 설명회만 있는 소장님은 이 페이지에서 뺌
      .sort(function (a, b) { return a.name.localeCompare(b.name, "ko"); });
    S.blocked = (d.blocked || []).map(function (b) { return { coach: b.coach, date: b.date, time: b.time || "" }; });
    // 저장해 둔 선택 중 지금 없는 소장님·설명회는 정리
    S.picked = S.picked.filter(findCoach);
    Object.keys(S.product).forEach(function (n) {
      var c = findCoach(n);
      if (!c || S.picked.indexOf(n) < 0 || !c.topics.some(function (t) { return t.name === S.product[n]; })) delete S.product[n];
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

  /* ---------- 가격 비교 (4단계) ---------- */
  function fixed(range) { return range && range[0] === range[1] ? range[0] : 0; }
  var ICON_USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
  var ICON_GEM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6z"/></svg>';
  function renderPricing() {
    var k = kindOf(S.kind) || (C.KINDS || [])[0];
    if (!k) return;
    var mem = fixed(k.member), non = fixed(k.nonmember), save = mem && non > mem ? non - mem : 0;
    $("prHead").innerHTML =
      '<h3 class="pr-title">클럽하와이 회원이면<br><em>더 저렴하게</em></h3>' +
      '<p class="pr-sub">오직 클럽하와이 회원 학원만 받을 수 있는 특별가</p>';
    $("pricing").innerHTML =
      '<div class="pr-card">' +
        '<span class="pr-ico">' + ICON_USER + '</span><span class="pr-name">비회원</span>' +
        '<div class="pr-amount"><span class="pr-price">' + (k.nonmember ? priceOf(k.nonmember) : "별도 안내") + '</span><span class="pr-unit">VAT 별도</span></div>' +
      "</div>" +
      '<div class="pr-card best"><span class="pr-badge">회원 전용</span>' +
        '<span class="pr-ico">' + ICON_GEM + '</span><span class="pr-name">클럽하와이 회원</span>' +
        '<div class="pr-amount">' + (save ? '<s class="pr-was">' + priceOf(k.nonmember) + "</s>" : "") +
          '<span class="pr-price">' + priceOf(k.member) + '</span><span class="pr-unit">VAT 별도</span></div>' +
        (save ? '<div class="pr-strip"><b>' + man(save) + "만원</b> 할인</div>" : (k.note ? '<div class="pr-strip">' + esc(k.note) + "</div>" : "")) +
      "</div>";
    $("travelFee").textContent = man(C.TRAVEL_FEE || 0) + "만원";
  }

  /* ---------- 1단계: 소장님 ---------- */
  function findCoach(name) { return S.coaches.filter(function (c) { return c.name === name; })[0]; }

  function renderFilters() {
    $("filters").innerHTML = ["전체"].concat(C.TARGETS || []).map(function (o) {
      return '<button type="button" class="chip' + (o === S.filter ? " on" : "") + '" data-f="' + esc(o) + '">' + esc(o) + "</button>";
    }).join("");
    // 주제로 찾기 — 소장님들의 설명회에 실제로 있는 카테고리만
    var cats = [];
    (C.AREAS || []).forEach(function (a) {
      if (a.page === "biz") return;
      a.cats.forEach(function (k) {
        if (S.coaches.some(function (c) { return c.topics.some(function (t) { return hasCat(t, k); }); })) cats.push(k);
      });
    });
    $("catRow").hidden = !cats.length;
    $("catFilters").innerHTML = ["전체"].concat(cats).map(function (o) {
      return '<button type="button" class="chip' + (o === S.cat ? " on" : "") + '" data-cat="' + esc(o) + '">' + esc(o) + "</button>";
    }).join("");
  }
  function hasCat(t, k) { return list(t.cats || t.cat).indexOf(k) >= 0; }
  function coachTopicsLine(c) {
    if (!c.topics.length) return "";
    var q = S.q.trim();
    var hit = c.topics.filter(function (t) { return (S.cat !== "전체" && hasCat(t, S.cat)) || (q && t.name.indexOf(q) >= 0); });
    var rest = c.topics.filter(function (t) { return hit.indexOf(t) < 0; });
    var show = hit.concat(rest).slice(0, 3);
    return '<div class="coach-topics"><span>설명회</span>' + show.map(function (t) {
      return hit.indexOf(t) >= 0 ? "<b>" + esc(t.name) + "</b>" : "<i>" + esc(t.name) + "</i>";
    }).join("") + (c.topics.length > 3 ? "<i>외 " + (c.topics.length - 3) + "개</i>" : "") + "</div>";
  }

  var TICK = '<span class="tick"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>';
  function renderCoaches() {
    var q = S.q.trim();
    var shown = S.coaches.filter(function (c) {
      return (S.filter === "전체" || c.targets.indexOf(S.filter) >= 0) &&
        (!q || c.name.indexOf(q) >= 0 || c.topics.some(function (t) { return t.name.indexOf(q) >= 0; })) &&
        (S.cat === "전체" || c.topics.some(function (t) { return hasCat(t, S.cat); }));
    });
    $("coachEmpty").hidden = shown.length > 0;
    $("coachList").innerHTML = shown.map(function (c) {
      var on = S.picked.indexOf(c.name) >= 0;
      return '<div class="coach' + (on ? " on" : "") + '" role="button" tabindex="0" aria-pressed="' + on + '" data-c="' + esc(c.name) + '">' +
        avatar(c) +
        '<div class="coach-info"><div class="coach-name">' + esc(c.name) + "</div>" +
        '<div class="coach-sum">' + esc(c.slogan.join(" ") || c.history[0] || "") + "</div>" + coachTopicsLine(c) +
        '<div class="tags">' + c.targets.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" +
        '<button type="button" class="link coach-more" data-more="' + esc(c.name) + '">자세히 보기</button></div>' + TICK + "</div>";
    }).join("");
  }

  function togglePick(c) {
    if (!c) return;
    var i = S.picked.indexOf(c.name);
    if (i >= 0) { S.picked.splice(i, 1); delete S.product[c.name]; }
    else if (S.picked.length >= MAX_PICKS) { toast("소장님은 최대 " + MAX_PICKS + "명까지 고를 수 있어요. 다른 분을 고르시려면 먼저 한 분을 빼 주세요."); return; }
    else {
      S.picked.push(c.name);
      if (c.topics.length === 1) S.product[c.name] = c.topics[0].name;   // 설명회가 하나뿐이면 미리 골라 둠
    }
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
  function topicCard(t) {
    var meta = [list(t.targets).join(", "), list(t.seasons).join(", ")].filter(Boolean);
    return '<div class="tcard"><div class="tc-cat">' + esc([t.area, list(t.cats || t.cat).join(", ")].filter(Boolean).join(" · ")) + "</div>" +
      '<div class="tc-name">' + esc(t.name) + "</div>" +
      (t.intro ? '<p class="tc-intro">' + esc(t.intro) + "</p>" : "") +
      (lines(t.points).length ? ul(lines(t.points)) : "") +
      (meta.length ? '<div class="tc-meta">' + meta.map(esc).join("<i></i>") + "</div>" : "") + "</div>";
  }
  function openDetail(c) {
    if (!c) return;
    var intro = c.history.length ? "<h4>경력</h4>" + ul(c.history) : "";
    if (!intro) intro = '<p class="muted">준비 중입니다.</p>';
    var topics = c.topics.length ? c.topics.map(topicCard).join("") : '<p class="muted">준비 중입니다.</p>';
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

    $("coachDetail").innerHTML =
      '<div class="profile">' + avatar(c, "lg") + '<div class="nm">' + esc(c.name) + "</div>" +
        (c.slogan.length ? '<div class="slogan">' + c.slogan.map(esc).join("<br>") + "</div>" : "") + "</div>" +
      // 탭은 바로가기 — 내용은 한 페이지에 이어서 보이고, 탭을 누르면 그 부분으로 이동
      '<div class="tabs" role="tablist"><button type="button" class="on" data-tab="0">소개</button><button type="button" data-tab="1">설명회 ' + c.topics.length + '</button><button type="button" data-tab="2">영상·링크</button></div>' +
      '<section class="tab-pane" data-pane="0"><h3 class="pane-title">소개</h3>' + intro + "</section>" +
      '<section class="tab-pane" data-pane="1"><h3 class="pane-title">설명회</h3>' + topics + "</section>" +
      '<section class="tab-pane" data-pane="2"><h3 class="pane-title">영상·링크</h3>' + media + "</section>";
    $("coachModal").showModal();
    $("coachDetail").scrollTop = 0;
  }

  /* ---------- 2단계: 소장님별 설명회 ---------- */
  function productCard(c, t) {
    var on = S.product[c.name] === t.name;
    var meta = [list(t.targets).join(", "), list(t.seasons).join(", ")].filter(Boolean);
    var cats = list(t.cats || t.cat);
    return '<button type="button" class="product' + (on ? " on" : "") + '" role="radio" aria-checked="' + on + '" data-pc="' + esc(c.name) + '" data-pt="' + esc(t.name) + '">' +
      '<span class="radio"></span><span class="pd-body">' +
      (cats.length ? '<span class="tc-cat">' + esc(cats.join(" · ")) + "</span>" : "") +
      "<b>" + esc(t.name) + "</b>" + (t.intro ? '<span class="pd-intro">' + esc(t.intro) + "</span>" : "") +
      (meta.length ? '<span class="tc-meta">' + meta.map(esc).join("<i></i>") + "</span>" : "") + "</span></button>";
  }
  function renderProducts() {
    $("products").innerHTML = S.picked.map(function (n) {
      var c = findCoach(n);
      if (!c) return "";
      return '<div class="pgroup"><div class="pg-head">' + avatar(c, "sm") + "<div><b>" + esc(n) + " 소장님</b><span>" +
        (S.product[n] ? "골랐어요" : c.topics.length ? "설명회 하나를 골라 주세요" : "") + '</span></div><button type="button" class="link" data-more="' + esc(n) + '">자세히 보기</button></div>' +
        (c.topics.length ? '<div class="products" role="radiogroup">' + c.topics.map(function (t) { return productCard(c, t); }).join("") + "</div>"
          : '<p class="muted pd-none">설명회를 준비 중인 소장님입니다. 원하시는 내용을 다음 단계 요청사항에 적어 주세요.</p>') + "</div>";
    }).join("");
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
      html += '<button type="button" class="' + cls + '" data-d="' + s + '"' + (dt < MIN_DATE || full ? " disabled" : "") + ">" + d + "</button>";
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
    renderSummary();
  }

  function pickDate(s) {
    if (parse(s) < MIN_DATE) { $("calMsg").textContent = "진행일 최소 2주 전까지만 신청할 수 있습니다."; return; }
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
  function whenDone() { return !!(S.date && S.time) && !clashed().length && S.picked.length > 0; }

  /* ---------- 신청 내역 / 하단 바 ---------- */
  function memberVal() { return ($("form").elements.member || {}).value; }

  function priceText() {
    var k = kindOf(S.kind), m = memberVal();
    if (!k || !S.picked.length) return "0원";
    if (m === "비회원") return priceOf(k.nonmember);
    if (m === "회원") return priceOf(k.member);
    return "회원 " + priceOf(k.member) + " · 비회원 " + priceOf(k.nonmember);   // 회원 여부는 4단계에서 고름
  }

  function summaryHtml() {
    var picks = "<h4>소장님 · 설명회 <small>" + S.picked.length + "명</small></h4>" + (S.picked.length ? '<ul class="sum-picks">' + S.picked.map(function (n) {
      var c = findCoach(n), p = S.product[n] || (c && !c.topics.length ? "요청사항으로 상의" : S.step >= 2 ? "설명회 미선택" : "");
      return '<li><b>' + esc(n) + "</b>" + (p ? '<span class="' + (S.product[n] || !c || !c.topics.length ? "" : "none") + '">' + esc(p) + "</span>" : "") + "</li>";
    }).join("") + "</ul>" : '<p class="sum-kind"><span class="none">소장님을 골라 주세요</span></p>');
    var when = '<h4>희망 일정</h4><p class="sum-kind">' + (S.date ? esc(krDate(S.date)) + (S.time ? "<span>" + esc(krTime(S.time)) + " 시작</span>" : "") : '<span class="none">미선택</span>') + "</p>";
    return { picks: picks, when: when };
  }

  function stepState() {
    if (S.step === 1) {
      var n = S.picked.length;
      return { ok: n > 0, label: "다음", txt: "<b>소장님 " + n + "명</b>" + (n ? "여러 분을 함께 고를 수 있어요" : "소장님을 골라 주세요") };
    }
    if (S.step === 2) {
      var left = S.picked.filter(function (x) { var c = findCoach(x); return !S.product[x] && c && c.topics.length; }).length;
      return { ok: productsDone(), label: "다음", txt: "<b>설명회</b>" + (left ? left + "명의 소장님 설명회를 골라 주세요" : "모두 골랐어요") };
    }
    if (S.step === 3) {
      return { ok: whenDone(), label: "다음", txt: "<b>" + (S.date ? esc(krDate(S.date)) : "희망 날짜") + "</b>" +
        (!S.date ? "날짜를 골라 주세요" : !S.time ? "시작 시간을 골라 주세요" : clashed().length ? "일정이 겹치는 소장님이 있어요" : esc(krTime(S.time)) + " 시작") };
    }
    var left4 = formErrors().length;
    return { ok: !S.sending && !left4, soft: true, label: S.sending ? "신청 중…" : "신청하기",
      txt: left4 ? "<b>필수 항목 " + left4 + "개 남음</b>모두 입력하면 신청할 수 있어요" : "<b>예상 " + esc(priceText()) + '</b><em class="vat">VAT 별도</em> · 지방 출장비 별도' };
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
    $("sumNote").textContent = "소장님 일정을 확인한 뒤 담당자가 연락드려요. 신청만으로 확정되지는 않습니다.";
    if (S.step === 4) renderMember();
  }

  /* ---------- 4단계: 회원 여부 (가격 비교 카드) ---------- */
  function renderMember() {
    var k = kindOf(S.kind) || (C.KINDS || [])[0], m = memberVal();
    $("memberSeg").innerHTML =
      '<button type="button" class="mcard' + (m === "회원" ? " on" : "") + '" data-v="회원"><span class="radio"></span><span class="mc-body"><b>클럽하와이 회원</b><span class="mc-tag">회원가</span></span><strong>' + priceOf(k.member) + "</strong></button>" +
      '<button type="button" class="mcard' + (m === "비회원" ? " on" : "") + '" data-v="비회원"><span class="radio"></span><span class="mc-body"><b>비회원</b><span class="mc-tag gray">비회원가</span></span><strong>' + priceOf(k.nonmember) + "</strong></button>" +
      '<p class="mc-note">설명회 1회 기준 · VAT 별도<br>회원 여부는 담당자 연락 때 확인합니다.</p>';
    renderPricing();
  }

  /* ---------- 단계 이동 ---------- */
  function go(step) {
    if (step >= 2 && !S.picked.length) step = 1;
    else if (step >= 3 && !productsDone()) step = 2;
    else if (step >= 4 && !whenDone()) step = 3;
    S.step = step;
    ["step1", "step2", "step3", "step4", "done"].forEach(function (id, i) { $(id).hidden = i + 1 !== step; });
    each($("steps").children, function (li) {
      var n = +li.dataset.step;
      li.classList.toggle("on", n === step);
      li.classList.toggle("past", n < step);
    });
    var finished = step === 5;
    $("side").hidden = finished;
    $("bar").hidden = finished;
    $("pageHead").hidden = finished;
    if (step === 1) renderCoaches();
    if (step === 2) renderProducts();
    if (step === 3) {
      if (!S.month) S.month = new Date(MIN_DATE.getFullYear(), MIN_DATE.getMonth(), 1);
      renderWhen();
    }
    renderSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    if (S.step === 4) submit();
    else if (stepState().ok) go(S.step + 1);
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
    ["agreePrivacy", "agreeThird", "agreePolicy"].forEach(function (n) { if (!form.elements[n].checked) bad(n, ""); });
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
      member: v("member"), target: v("target"),
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
      "<dt>희망 일정</dt><dd>" + esc(krDate(b.date)) + " " + esc(krTime(b.time)) + " 시작</dd>" +
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
    $("q").addEventListener("input", function (e) { S.q = e.target.value; renderCoaches(); });
    $("filters").addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]");
      if (!b) return;
      S.filter = b.dataset.f;
      renderFilters();
      renderCoaches();
    });
    $("catFilters").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (!b) return;
      S.cat = b.dataset.cat;
      renderFilters();
      renderCoaches();
    });
    $("coachList").addEventListener("click", function (e) {
      if (e.target.closest("[data-more]")) return;   // 자세히 보기는 아래 공통 처리
      var card = e.target.closest("[data-c]");
      if (card) togglePick(findCoach(card.dataset.c));
    });
    $("coachList").addEventListener("keydown", function (e) {
      var card = e.target.closest("[data-c]");
      if (card && e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); togglePick(findCoach(card.dataset.c)); }
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

    // 2단계
    $("products").addEventListener("click", function (e) {
      var b = e.target.closest("[data-pc]");
      if (!b) return;
      S.product[b.dataset.pc] = b.dataset.pt;
      renderProducts();
      renderSummary();
    });

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
    $("request").addEventListener("input", save);

    // 4단계
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
      input.value = (C.TARGETS || []).filter(function (x) { return cur.indexOf(x) >= 0; }).join(", ");
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

  /* ---------- 설명회 대상 (여러 개) ---------- */
  function renderTargets() {
    var cur = list($("form").elements.target.value);
    $("targetChips").innerHTML = (C.TARGETS || []).map(function (t) {
      var on = cur.indexOf(t) >= 0;
      return '<button type="button" class="chip' + (on ? " on" : "") + '" aria-pressed="' + on + '" data-target="' + esc(t) + '">' + esc(t) + "</button>";
    }).join("");
  }

  /* ---------- 입력 내용 보관 (같은 탭에서 새로고침해도 이어서) ---------- */
  var SAVE_KEY = "seminar-signup-v3";
  var KEEP = ["member", "academy", "director", "phone", "attendees", "target", "zip", "addr1", "addr2", "vzip", "vaddr1", "vaddr2"];
  function save() {
    if (S.finished) return;
    try {
      var form = $("form"), f = {};
      KEEP.forEach(function (n) { f[n] = form.elements[n].value; });
      f.venueSame = form.elements.venueSame.checked;
      sessionStorage.setItem(SAVE_KEY, JSON.stringify({
        step: S.step, picked: S.picked, product: S.product, date: S.date, time: S.time, request: $("request").value, form: f
      }));
    } catch (e) {}
  }
  function restore() {
    var d = null;
    try { d = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null"); } catch (e) {}
    if (!d || !Array.isArray(d.picked)) return 1;
    S.picked = d.picked.map(String);
    S.product = d.product && typeof d.product === "object" ? d.product : {};
    S.date = /^\d{4}-\d{2}-\d{2}$/.test(d.date) && parse(d.date) >= MIN_DATE ? d.date : "";
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
    fillTimeSelects();
    if (C.CONTACT_URL) {
      each(document.querySelectorAll("[data-contact]"), function (a) { a.href = C.CONTACT_URL; });
      $("contactTop").hidden = false;
      $("helpCard").hidden = false;
    }
    bind();
    var step = restore();   // 새로고침·화면 갱신이 있어도 입력한 내용과 단계를 이어서 보여 줌
    $("coachList").innerHTML = '<p class="empty">소장님 정보를 불러오는 중…</p>';
    load().then(function (d) {
      useData(d);
      renderFilters();   // 주제로 찾기는 소장님 설명회가 있어야 그릴 수 있음
      go(step);
    }).catch(function () {
      $("coachList").innerHTML = '<p class="empty">소장님 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>';
    });
  }

  init();
})();
