// 학생·학부모 설명회 신청 — 희망 날짜 1~3순위 → 강연자 1~3순위 → 설명회 종류·주제 → 신청 정보 → 완료
(function () {
  "use strict";

  var C = window.APP_CONFIG || {};
  var DEMO = !C.APPS_SCRIPT_URL;
  var RANKS = ["1순위", "2순위", "3순위"];
  var DOW = "일월화수목금토";
  var LEAVE_IT = "강연자 추천에 맡길게요";

  var S = {
    coaches: [],
    blocked: {},          // "강연자|YYYY-MM-DD" → true
    filter: "전체",
    q: "",
    ranks: [],            // 고른 강연자 이름 (순위 순서)
    slots: [{ d: "", t: "" }, { d: "", t: "" }, { d: "", t: "" }],
    active: 0,
    part: "am",
    month: null,
    kind: "",
    topics: [],
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
  function daysFromToday(s) { return Math.round((parse(s) - today()) / 864e5); }
  var MIN_DATE = addDays(today(), C.MIN_DAYS || 15);

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
    if (DEMO) return Promise.resolve(window.SAMPLE_DATA);
    return fetch(C.APPS_SCRIPT_URL).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) throw new Error(d.error);
      return d;
    });
  }
  function useData(d) {
    S.coaches = (d.coaches || []).map(function (c) {
      return {
        name: c.name, photo: c.photo || "", summary: c.summary || "", career: c.career || "",
        topics: list(c.topics), targets: list(c.targets), region: c.region || "",
        video: c.video || "", photos: list(c.photos)
      };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, "ko"); });
    S.blocked = {};
    (d.blocked || []).forEach(function (b) { S.blocked[b.coach + "|" + b.date] = true; });
  }
  function needCoaches() { return Math.min(3, S.coaches.length || 3); }

  /* ---------- 가격 비교 (3단계, 고른 종류 기준) ---------- */
  function fixed(range) { return range && range[0] === range[1] ? range[0] : 0; }
  var ICON_USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
  var ICON_GEM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21 8 9l4-6 4 6z"/></svg>';
  function renderPricing() {
    var k = kindOf(S.kind) || (C.KINDS || [])[0];
    if (!k) return;
    var mem = fixed(k.member), non = fixed(k.nonmember), save = mem && non > mem ? non - mem : 0;
    $("prKind").textContent = k.name;
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

  /* ---------- 1단계: 희망 날짜 ---------- */
  function renderSlots() {
    $("slots").innerHTML = S.slots.map(function (s, i) {
      return '<div class="slot' + (i === S.active ? " on" : "") + '" role="button" tabindex="0" data-slot="' + i + '">' +
        '<div class="rk">' + RANKS[i] + "</div>" +
        (s.d ? '<div class="v">' + esc(krDate(s.d)) + '</div><div class="t">' + (s.t ? esc(krTime(s.t)) : "시간 선택") + "</div>" +
          '<button type="button" class="x" data-clear="' + i + '" aria-label="' + RANKS[i] + ' 지우기">×</button>'
          : '<div class="v none">날짜 선택</div><div class="t">&nbsp;</div>') +
        "</div>";
    }).join("");
  }

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
      var early = dt < MIN_DATE;
      var nos = [];   // 같은 날짜를 여러 순위로 고를 수 있음
      S.slots.forEach(function (x, k) { if (x.d === s) nos.push(k); });
      var cls = "day" + (s === t ? " today" : "") + (nos.length ? " pick" : "") + (nos.indexOf(S.active) >= 0 ? " cur" : "");
      html += '<button type="button" class="' + cls + '" data-d="' + s + '"' + (early ? " disabled" : "") + ">" + d +
        (nos.length ? '<span class="no">' + nos.map(function (k) { return k + 1; }).join("·") + "</span>" : "") + "</button>";
    }
    $("calDays").innerHTML = html;
    $("prevMonth").disabled = m <= new Date(today().getFullYear(), today().getMonth(), 1);
  }

  function partOf(t) { var h = +t.split(":")[0]; return h < 12 ? "am" : h < 18 ? "pm" : "ev"; }

  function renderTimes() {
    var s = S.slots[S.active];
    $("timeTitle").textContent = RANKS[S.active] + " 시작 시간";
    each($("timeSeg").children, function (b) { b.classList.toggle("on", b.dataset.part === S.part); });
    $("timeGrid").innerHTML = (C.TIMES || []).filter(function (t) { return partOf(t) === S.part; }).map(function (t) {
      return '<button type="button" class="tbtn' + (s.t === t ? " on" : "") + '" data-t="' + t + '"' + (s.d ? "" : " disabled") + ">" + t + "</button>";
    }).join("");
    $("timeHint").textContent = s.d ? krDate(s.d) + " 몇 시에 시작할까요?" : "먼저 달력에서 날짜를 골라 주세요.";
  }

  function renderDates() {
    renderSlots();
    renderCal();
    renderTimes();
    $("soonNotice").hidden = !S.slots.some(function (s) { return s.d && daysFromToday(s.d) < (C.WARN_DAYS || 21); });
    renderSummary();
  }

  function setActive(i) {
    S.active = i;
    var s = S.slots[i];
    S.part = s.t ? partOf(s.t) : "am";   // 시간을 아직 안 고른 순위는 오전부터
    if (s.d) { var d = parse(s.d); S.month = new Date(d.getFullYear(), d.getMonth(), 1); }
    $("calMsg").textContent = "";
    renderDates();
  }

  function pickDate(s) {
    if (parse(s) < MIN_DATE) { $("calMsg").textContent = "진행일 최소 2주 전까지만 신청할 수 있습니다."; return; }
    $("calMsg").textContent = "";
    var slot = S.slots[S.active];
    slot.d = s;
    slot.t = "";   // 날짜를 고르면 시간도 직접 다시 눌러야 다음 순위로 넘어감
    renderDates();
  }

  function pickTime(t) {
    $("calMsg").textContent = "";
    S.slots[S.active].t = t;
    renderDates();
    advance();
  }

  // 지금 칸이 채워지면 다음 빈 칸으로
  function advance() {
    var s = S.slots[S.active];
    if (!s.d || !s.t) return;
    for (var k = 1; k <= 3; k++) {
      var n = (S.active + k) % 3;
      if (!S.slots[n].d || !S.slots[n].t) { setTimeout(function () { setActive(n); }, 180); return; }
    }
  }

  function datesDone() { return S.slots.every(function (s) { return s.d && s.t; }); }

  /* ---------- 2단계: 강연자 ---------- */
  function findCoach(name) { return S.coaches.filter(function (c) { return c.name === name; })[0]; }
  function busyCount(c) { return S.slots.filter(function (s) { return s.d && S.blocked[c.name + "|" + s.d]; }).length; }

  function renderFilters() {
    $("filters").innerHTML = ["전체"].concat(C.TARGETS || []).map(function (o) {
      return '<button type="button" class="chip' + (o === S.filter ? " on" : "") + '" data-f="' + esc(o) + '">' + esc(o) + "</button>";
    }).join("");
  }

  function renderCoachSlots() {
    $("coachSlots").innerHTML = [0, 1, 2].map(function (i) {
      var n = S.ranks[i], next = i === S.ranks.length;
      return '<div class="slot' + (next ? " on" : "") + '">' + '<div class="rk">' + RANKS[i] + " 강연자</div>" +
        (n ? '<div class="v">' + esc(n) + '</div><button type="button" class="x" data-unrank="' + esc(n) + '" aria-label="' + RANKS[i] + ' 빼기">×</button>'
          : '<div class="v none">' + (next ? "골라 주세요" : "미선택") + "</div>") + "</div>";
    }).join("");
  }

  function renderCoaches() {
    var q = S.q.trim();
    var shown = S.coaches.filter(function (c) {
      return (S.filter === "전체" || c.targets.indexOf(S.filter) >= 0) && (!q || c.name.indexOf(q) >= 0);
    });
    $("coachEmpty").hidden = shown.length > 0;
    $("coachList").innerHTML = shown.map(function (c) {
      var r = S.ranks.indexOf(c.name), busy = busyCount(c);
      return '<div class="coach' + (r >= 0 ? " on" : "") + '" role="button" tabindex="0" aria-pressed="' + (r >= 0) + '" data-c="' + esc(c.name) + '">' +
        avatar(c) +
        '<div class="coach-info"><div class="coach-name">' + esc(c.name) + "</div>" +
        '<div class="coach-sum">' + esc(c.summary) + "</div>" +
        '<div class="tags">' + c.targets.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" +
        (busy ? '<div class="busy">희망 날짜 중 ' + busy + "일은 이미 일정이 있어요</div>" : "") +
        '<button type="button" class="link coach-more" data-more="' + esc(c.name) + '">자세히 보기</button></div>' +
        '<span class="rank-badge">' + (r >= 0 ? RANKS[r] : "") + "</span></div>";
    }).join("");
    renderCoachSlots();
  }

  // 「1순위 강연자를 꼭 희망」 체크 중이면 2·3순위도 1순위와 같은 강연자로 채움
  function syncFlexible() {
    if ($("flexible").checked) S.ranks = S.ranks.length ? [S.ranks[0], S.ranks[0], S.ranks[0]] : [];
    else S.ranks = S.ranks.slice(0, 1);
  }

  function toggleRank(c) {
    var i = S.ranks.indexOf(c.name);
    if ($("flexible").checked) S.ranks = i >= 0 ? [] : [c.name, c.name, c.name];   // 같은 강연자를 누르면 빼고, 다른 강연자면 1순위를 바꿈
    else if (i >= 0) S.ranks.splice(i, 1);
    else if (S.ranks.length >= 3) { toast("3명을 모두 골랐습니다. 바꾸려면 위에서 한 명을 빼 주세요."); return; }
    else S.ranks.push(c.name);
    // 대표 주제는 고른 강연자의 주제에서 고르므로, 빠진 강연자의 주제는 지운다
    var allowed = topicChoices();
    S.topics = S.topics.filter(function (t) { return allowed.indexOf(t) >= 0; });
    renderCoaches();
    renderSummary();
  }

  /* ---------- 강연자 상세 ---------- */
  var detailFor = null;
  function youtubeId(u) {
    var m = String(u || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : "";
  }
  function setPickBtn() {
    var r = S.ranks.indexOf(detailFor.name), b = $("pickCoach");
    if ($("flexible").checked) {   // 1순위만 고르는 상태 — 다른 강연자를 누르면 1순위가 바뀜
      b.disabled = false;
      b.textContent = r >= 0 ? "1순위에서 빼기" : "1순위로 정하기";
      b.className = "btn " + (r >= 0 ? "ghost" : "primary");
      return;
    }
    b.disabled = r < 0 && S.ranks.length >= 3;
    b.textContent = r >= 0 ? RANKS[r] + "에서 빼기" : S.ranks.length >= 3 ? "3명을 모두 골랐습니다" : RANKS[S.ranks.length] + "로 추가";
    b.className = "btn " + (r >= 0 ? "ghost" : "primary");
  }
  function openDetail(c) {
    detailFor = c;
    var topics = c.topics.length ? '<ul class="dots ink">' + c.topics.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : '<p class="muted">준비 중입니다.</p>';
    var vid = youtubeId(c.video);
    var media = (vid ? '<div class="video"><iframe src="https://www.youtube.com/embed/' + vid + '" allowfullscreen title="강의 영상"></iframe></div>' : "") +
      (c.photos.length ? '<div class="photos">' + c.photos.map(function (p) { return '<img src="' + esc(p) + '" alt="" loading="lazy">'; }).join("") + "</div>" : "");
    if (!media) media = '<p class="muted">등록된 영상·사진이 없습니다.</p>';

    $("coachDetail").innerHTML =
      '<div class="profile">' + avatar(c, "lg") + '<div class="nm">' + esc(c.name) + '</div><div class="sm">' + esc(c.summary) + "</div></div>" +
      '<div class="tabs" role="tablist"><button type="button" class="on" data-tab="0">소개</button><button type="button" data-tab="1">설명회 주제</button><button type="button" data-tab="2">영상·사진</button></div>' +
      '<div class="tab-pane" data-pane="0"><h4>대표 경력</h4><div class="box">' + esc(c.career || c.summary) + "</div></div>" +
      '<div class="tab-pane" data-pane="1" hidden>' + topics + "</div>" +
      '<div class="tab-pane" data-pane="2" hidden>' + media + "</div>";
    setPickBtn();
    $("coachModal").showModal();
    $("coachDetail").scrollTop = 0;
  }

  /* ---------- 3단계: 설명회 종류·주제 ---------- */
  function topicChoices() {
    if (S.kind === "custom") return C.CUSTOM_TOPICS || [];
    var out = [];
    S.ranks.forEach(function (n) {
      var c = findCoach(n);
      (c ? c.topics : []).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
    });
    return out.concat([LEAVE_IT]);
  }

  function renderKinds() {
    if (!S.kind && (C.KINDS || []).length) S.kind = C.KINDS[0].id;   // 처음엔 대표 주제 설명회가 골라진 상태
    $("kinds").innerHTML = (C.KINDS || []).map(function (k) {
      var on = S.kind === k.id;
      return '<button type="button" role="radio" aria-checked="' + on + '" class="kind' + (on ? " on" : "") + '" data-kind="' + k.id + '">' +
        '<span class="radio"></span><span class="kind-body"><b>' + esc(k.name) + "</b><span>" + esc(k.desc) + "</span>" +
        '<span class="kind-meta">' + esc(k.time) + "</span></span>" +
        (on ? '<span class="kind-picked">선택됨</span>' : "") + "</button>";
    }).join("");
    renderPricing();
    var k = kindOf(S.kind);
    $("topicBox").hidden = !k;
    if (!k) return;
    var custom = S.kind === "custom";
    $("topicTitle").textContent = custom ? "어떤 내용이 필요하세요?" : "원하시는 주제를 골라 주세요";
    $("topicSub").textContent = custom ? "여러 개 고를 수 있습니다. 주제 확인 후 비용을 협의해서 안내드립니다." : "고르신 강연자들의 대표 주제입니다. 여러 개 고를 수 있습니다.";
    $("topicMemoLabel").innerHTML = custom ? "원하시는 내용 <em>필수</em>" : "더 알려 주실 내용 <em>선택</em>";
    $("topics").innerHTML = topicChoices().map(function (t) {
      return '<button type="button" class="chip' + (S.topics.indexOf(t) >= 0 ? " on" : "") + '" data-topic="' + esc(t) + '">' + esc(t) + "</button>";
    }).join("");
  }

  function topicDone() {
    if (!S.kind || !S.topics.length) return false;
    return S.kind !== "custom" || !!$("topicMemo").value.trim();
  }

  /* ---------- 신청 내역 / 하단 바 ---------- */
  function memberVal() { return ($("form").elements.member || {}).value; }

  function priceText() {
    var k = kindOf(S.kind), m = memberVal();
    if (!k || !S.topics.length) return "0원";   // 설명회 주제를 고르기 전에는 0원
    if (m === "비회원") return priceOf(k.nonmember);
    if (m === "회원") return priceOf(k.member);
    return "회원 " + priceOf(k.member) + " · 비회원 " + priceOf(k.nonmember);   // 회원 여부는 4단계에서 고름
  }

  function summaryHtml() {
    var dates = '<h4>희망 날짜</h4><ul class="sum-list">' + S.slots.map(function (s, i) {
      return '<li><span class="rk">' + RANKS[i] + "</span>" + (s.d ? '<span class="v">' + esc(krDate(s.d)) + (s.t ? " · " + esc(krTime(s.t)) : "") + "</span>" : '<span class="v none">미선택</span>') + "</li>";
    }).join("") + "</ul>";
    var coaches = '<h4>강연자</h4><ul class="sum-list">' + [0, 1, 2].map(function (i) {
      return '<li><span class="rk">' + RANKS[i] + "</span>" + (S.ranks[i] ? '<span class="v">' + esc(S.ranks[i]) + "</span>" : '<span class="v none">미선택</span>') + "</li>";
    }).join("") + "</ul>" + ($("flexible").checked ? '<p class="sum-flag">1순위 강연자 일정에 맞춰 날짜 조정 가능</p>' : "");
    var k = kindOf(S.kind);
    var kind = '<h4>설명회</h4><p class="sum-kind">' + (k ? esc(k.name) + (S.topics.length ? '<span>' + esc(S.topics.join(", ")) + "</span>" : "") : '<span class="none">미선택</span>') + "</p>";
    return { dates: dates, coaches: coaches, kind: kind };
  }

  function stepState() {
    if (S.step === 1) {
      var n = S.slots.filter(function (s) { return s.d && s.t; }).length;
      return { ok: datesDone(), label: "다음", txt: "<b>희망 날짜 " + n + " / 3</b>" + (datesDone() ? "모두 골랐어요" : RANKS[S.active] + "을 골라 주세요") };
    }
    if (S.step === 2) {
      var need = needCoaches();
      return { ok: S.ranks.length >= need, label: "다음", txt: "<b>강연자 " + S.ranks.length + " / " + need + "</b>" + (S.ranks.length >= need ? "모두 골랐어요" : RANKS[S.ranks.length] + "을 골라 주세요") };
    }
    if (S.step === 3) {
      var k = kindOf(S.kind);
      return { ok: topicDone(), label: "다음", txt: "<b>" + (k ? esc(k.name) : "설명회 종류") + "</b>" + (topicDone() ? "주제를 골랐어요" : k ? "주제를 골라 주세요" : "종류를 골라 주세요") };
    }
    var left = formErrors().length;
    return { ok: !S.sending && !left, soft: true, label: S.sending ? "신청 중…" : "신청하기",
      txt: left ? "<b>필수 항목 " + left + "개 남음</b>모두 입력하면 신청할 수 있어요" : "<b>예상 " + esc(priceText()) + '</b><em class="vat">VAT 별도</em> · 지방 출장비 별도' };
  }

  function renderSummary() {
    var h = summaryHtml();
    $("sumDates").innerHTML = h.dates;
    $("sumCoaches").innerHTML = h.coaches;
    $("sumKind").innerHTML = h.kind;
    $("sumPrice").textContent = priceText();
    $("mSum").innerHTML = '<div class="sum-block">' + h.dates + '</div><div class="sum-block">' + h.coaches + '</div><div class="sum-block">' + h.kind + "</div>";

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
    $("sumNote").textContent = S.step === 4 ? "신청 후 담당자가 3일 안에 연락드립니다. 신청만으로 확정되지는 않습니다." : "신청만으로 일정이 확정되지는 않습니다.";
    if (S.step === 4) renderMember();
  }

  /* ---------- 4단계: 회원 여부 (가격 비교 카드) ---------- */
  function renderMember() {
    var k = kindOf(S.kind) || (C.KINDS || [])[0], m = memberVal();
    $("memberSeg").innerHTML =
      '<button type="button" class="mcard' + (m === "회원" ? " on" : "") + '" data-v="회원"><span class="radio"></span><span class="mc-body"><b>클럽하와이 회원</b><span class="mc-tag">회원가</span></span><strong>' + priceOf(k.member) + "</strong></button>" +
      '<button type="button" class="mcard' + (m === "비회원" ? " on" : "") + '" data-v="비회원"><span class="radio"></span><span class="mc-body"><b>비회원</b><span class="mc-tag gray">비회원가</span></span><strong>' + priceOf(k.nonmember) + "</strong></button>" +
      '<p class="mc-note">' + esc(k.name) + " 기준 · VAT 별도" + (k.note ? " · " + esc(k.note) : "") + "<br>회원 여부는 담당자 연락 때 확인합니다.</p>";
  }

  /* ---------- 단계 이동 ---------- */
  function go(step) {
    if (step >= 2 && !datesDone()) step = 1;
    else if (step >= 3 && S.ranks.length < needCoaches()) step = 2;
    else if (step >= 4 && !topicDone()) step = 3;
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
    if (step === 1) {
      if (!S.month) S.month = new Date(MIN_DATE.getFullYear(), MIN_DATE.getMonth(), 1);
      var firstEmpty = S.slots.findIndex(function (s) { return !s.d || !s.t; });
      setActive(firstEmpty < 0 ? 0 : firstEmpty);
    }
    if (step === 2) renderCoaches();
    if (step === 3) renderKinds();
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
      attendees: v("attendees"), request: v("request"),
      options: S.slots.map(function (s) { return { date: s.d, time: s.t }; }),
      coaches: S.ranks.slice(),
      flexible: $("flexible").checked,
      kind: kindOf(S.kind).name,
      topics: S.topics.slice(),
      topicMemo: $("topicMemo").value.trim()
    };
  }

  function submit() {
    if (S.sending) return;
    var body = check();
    if (!body) return;
    S.sending = true;
    renderSummary();
    var req = DEMO
      ? new Promise(function (ok) { setTimeout(function () { ok({ ok: true, id: "SEM-" + ymd(today()).replace(/-/g, "") + "-000" }); }, 700); })
      : fetch(C.APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); });
    req.then(function (res) {
      if (!res.ok) throw new Error(res.error || "");
      showDone(res.id, body);
    }).catch(function (e) {
      S.sending = false;
      renderSummary();
      toast(e && e.message && !/fetch|network|json/i.test(e.message) ? e.message : "신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    });
  }

  // 순위 글자와 내용을 칸으로 나눠 보여 줌
  function rankList(items) {
    return '<ul class="done-rk">' + items.map(function (t, i) {
      return '<li><span class="rk">' + RANKS[i] + '</span><span>' + esc(t) + "</span></li>";
    }).join("") + "</ul>";
  }

  function showDone(id, b) {
    S.sending = false;
    S.finished = true;
    try { sessionStorage.removeItem(SAVE_KEY); } catch (e) {}
    $("doneSum").innerHTML =
      "<dt>신청번호</dt><dd>" + esc(id) + "</dd>" +
      "<dt>학원</dt><dd>" + esc(b.academy) + " · " + esc(b.director) + " 원장님</dd>" +
      "<dt>희망 날짜</dt><dd>" + rankList(b.options.map(function (o) { return krDate(o.date) + " " + krTime(o.time); })) + "</dd>" +
      "<dt>강연자</dt><dd>" + rankList(b.coaches) + "</dd>" +
      "<dt>설명회</dt><dd>" + esc(b.kind) + (b.topics.length ? "<br>" + esc(b.topics.join(", ")) : "") + "</dd>";
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
    $("slots").addEventListener("click", function (e) {
      var x = e.target.closest("[data-clear]");
      if (x) { S.slots[+x.dataset.clear] = { d: "", t: "" }; setActive(+x.dataset.clear); return; }
      var s = e.target.closest("[data-slot]");
      if (s) setActive(+s.dataset.slot);
    });
    $("calDays").addEventListener("click", function (e) {
      var d = e.target.closest("[data-d]");
      if (d) pickDate(d.dataset.d);
    });
    $("prevMonth").addEventListener("click", function () { S.month = new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1); renderCal(); });
    $("nextMonth").addEventListener("click", function () { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1); renderCal(); });
    $("timeSeg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-part]");
      if (b) { S.part = b.dataset.part; renderTimes(); }
    });
    $("timeGrid").addEventListener("click", function (e) {
      var b = e.target.closest("[data-t]");
      if (b && !b.disabled) pickTime(b.dataset.t);
    });

    // 2단계
    $("q").addEventListener("input", function (e) { S.q = e.target.value; renderCoaches(); });
    $("filters").addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]");
      if (!b) return;
      S.filter = b.dataset.f;
      renderFilters();
      renderCoaches();
    });
    $("coachList").addEventListener("click", function (e) {
      var more = e.target.closest("[data-more]");
      if (more) { openDetail(findCoach(more.dataset.more)); return; }
      var card = e.target.closest("[data-c]");
      if (card) toggleRank(findCoach(card.dataset.c));
    });
    $("coachList").addEventListener("keydown", function (e) {
      var card = e.target.closest("[data-c]");
      if (card && e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleRank(findCoach(card.dataset.c)); }
    });
    $("coachSlots").addEventListener("click", function (e) {
      var x = e.target.closest("[data-unrank]");
      if (x) toggleRank(findCoach(x.dataset.unrank));
    });
    $("flexible").addEventListener("change", function () {
      syncFlexible();
      var allowed = topicChoices();
      S.topics = S.topics.filter(function (t) { return allowed.indexOf(t) >= 0; });
      renderCoaches();
      renderSummary();
    });
    $("coachDetail").addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (!t) return;
      each(this.querySelectorAll("[data-tab]"), function (b) { b.classList.toggle("on", b === t); });
      each(this.querySelectorAll("[data-pane]"), function (p) { p.hidden = p.dataset.pane !== t.dataset.tab; });
    });
    $("pickCoach").addEventListener("click", function () {
      toggleRank(detailFor);
      $("coachModal").close();
    });

    // 3단계
    $("kinds").addEventListener("click", function (e) {
      var b = e.target.closest("[data-kind]");
      if (!b || S.kind === b.dataset.kind) return;
      S.kind = b.dataset.kind;
      S.topics = [];
      renderKinds();
      renderSummary();
    });
    $("topics").addEventListener("click", function (e) {
      var b = e.target.closest("[data-topic]");
      if (!b) return;
      var t = b.dataset.topic, i = S.topics.indexOf(t);
      if (i >= 0) S.topics.splice(i, 1);
      else if (t === LEAVE_IT) S.topics = [t];        // '맡길게요'는 다른 주제와 함께 고르지 않음
      else { S.topics = S.topics.filter(function (x) { return x !== LEAVE_IT; }); S.topics.push(t); }
      renderKinds();
      renderSummary();
    });
    $("topicMemo").addEventListener("input", renderSummary);

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
  var SAVE_KEY = "seminar-signup-v1";
  var KEEP = ["member", "academy", "director", "phone", "attendees", "target", "zip", "addr1", "addr2", "vzip", "vaddr1", "vaddr2", "request"];
  function save() {
    if (S.finished) return;
    try {
      var form = $("form"), f = {};
      KEEP.forEach(function (n) { f[n] = form.elements[n].value; });
      f.venueSame = form.elements.venueSame.checked;
      sessionStorage.setItem(SAVE_KEY, JSON.stringify({
        step: S.step, slots: S.slots, ranks: S.ranks, kind: S.kind, topics: S.topics,
        flexible: $("flexible").checked, topicMemo: $("topicMemo").value, form: f
      }));
    } catch (e) {}
  }
  function restore() {
    var d = null;
    try { d = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null"); } catch (e) {}
    if (!d || !Array.isArray(d.slots) || d.slots.length !== 3) return 1;
    S.slots = d.slots.map(function (s) { return { d: String(s.d || ""), t: String(s.t || "") }; });
    S.ranks = Array.isArray(d.ranks) ? d.ranks.slice(0, 3) : [];
    S.kind = d.kind || "";
    S.topics = Array.isArray(d.topics) ? d.topics : [];
    $("flexible").checked = !!d.flexible;
    $("topicMemo").value = d.topicMemo || "";
    var form = $("form"), f = d.form || {};
    KEEP.forEach(function (n) { if (f[n] != null) form.elements[n].value = f[n]; });
    form.elements.venueSame.checked = !!f.venueSame;
    $("venueBox").hidden = !!f.venueSame;
    renderTargets();
    var first = S.slots.filter(function (s) { return s.d; })[0];
    if (first) { var p = parse(first.d); S.month = new Date(p.getFullYear(), p.getMonth(), 1); }
    return Math.min(4, Math.max(1, +d.step || 1));
  }

  /* ---------- 시작 ---------- */
  function init() {
    $("demoBar").hidden = !DEMO;
    each(document.querySelectorAll(".retention"), function (el) { el.textContent = C.PRIVACY_RETENTION || ""; });
    $("policyModalBody").innerHTML = $("policyInline").innerHTML;
    renderTargets();
    if (C.CONTACT_URL) {
      $("contactTop").href = $("contactSide").href = $("contactFoot").href = C.CONTACT_URL;
      $("contactTop").hidden = false;
      $("helpCard").hidden = false;
    }
    bind();
    renderFilters();
    go(restore());   // 새로고침·화면 갱신이 있어도 입력한 내용과 단계를 이어서 보여 줌
    $("coachList").innerHTML = '<p class="empty">강연자 정보를 불러오는 중…</p>';
    load().then(function (d) {
      useData(d);
      renderCoaches();
      if (S.step === 3) renderKinds();
      renderSummary();
    }).catch(function () {
      $("coachList").innerHTML = '<p class="empty">강연자 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>';
    });
  }

  init();
})();
