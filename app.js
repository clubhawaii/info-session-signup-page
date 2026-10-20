// 소장님 설명회 신청 — 소장님 1명 선택 → 희망 날짜 1~3순위 → 신청 정보 → 완료
(function () {
  "use strict";

  var C = window.APP_CONFIG || {};
  var DEMO = !C.APPS_SCRIPT_URL;
  var RANKS = ["1순위", "2순위", "3순위"];
  var DOW = "일월화수목금토";

  var S = {
    coaches: [],
    blocked: {},          // "소장님|YYYY-MM-DD" → true
    filter: "전체",
    q: "",
    coach: null,
    slots: [{ d: "", t: "" }, { d: "", t: "" }, { d: "", t: "" }],
    active: 0,
    part: "pm",
    month: null,
    step: 1,
    sending: false
  };

  var $ = function (id) { return document.getElementById(id); };
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
  function krDate(s) { var d = parse(s); return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + DOW[d.getDay()] + ")"; }
  function krTime(t) {
    if (!t) return "";
    var p = t.split(":"), h = +p[0], m = +p[1];
    return (h < 12 ? "오전 " : "오후 ") + (h % 12 || 12) + "시" + (m ? " " + m + "분" : "");
  }
  function daysFromToday(s) { return Math.round((parse(s) - today()) / 864e5); }
  var MIN_DATE = addDays(today(), C.MIN_DAYS || 15);

  function won(n) { return n >= 10000 && n % 10000 === 0 ? (n / 10000).toLocaleString("ko-KR") + "만원" : n.toLocaleString("ko-KR") + "원"; }

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

  /* ---------- 1단계: 소장님 ---------- */
  function renderFilters() {
    var opts = ["전체"].concat(C.TARGETS || []);
    $("filters").innerHTML = opts.map(function (o) {
      return '<button type="button" class="chip' + (o === S.filter ? " on" : "") + '" data-f="' + esc(o) + '">' + esc(o) + "</button>";
    }).join("");
  }

  function renderCoaches() {
    var q = S.q.trim();
    var shown = S.coaches.filter(function (c) {
      return (S.filter === "전체" || c.targets.indexOf(S.filter) >= 0) && (!q || c.name.indexOf(q) >= 0);
    });
    $("coachEmpty").hidden = shown.length > 0;
    $("coachList").innerHTML = shown.map(function (c) {
      var on = S.coach && S.coach.name === c.name;
      return '<div class="coach' + (on ? " on" : "") + '" role="button" tabindex="0" aria-pressed="' + on + '" data-c="' + esc(c.name) + '">' +
        avatar(c) +
        '<div class="coach-info"><div class="coach-name">' + esc(c.name) + "</div>" +
        '<div class="coach-sum">' + esc(c.summary) + "</div>" +
        '<div class="tags">' + c.targets.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div>" +
        '<button type="button" class="link coach-more" data-more="' + esc(c.name) + '">자세히 보기</button></div>' +
        '<span class="tick"><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg></span></div>';
    }).join("");
  }

  function findCoach(name) { return S.coaches.filter(function (c) { return c.name === name; })[0]; }

  function pickCoach(c) {
    if (S.coach && S.coach.name !== c.name) {
      // 소장님이 바뀌면 그 소장님이 안 되는 날짜는 비운다
      var cleared = false;
      S.slots.forEach(function (s) {
        if (s.d && S.blocked[c.name + "|" + s.d]) { s.d = ""; s.t = ""; cleared = true; }
      });
      if (cleared) toast("새로 고른 강연자가 안 되는 날짜는 비웠습니다.");
    }
    S.coach = c;
    renderCoaches();
    renderSummary();
  }

  /* ---------- 소장님 상세 ---------- */
  var detailFor = null;
  function openDetail(c) {
    detailFor = c;
    var topics = c.topics.length ? '<ul class="dots" style="color:inherit;font-size:14px">' + c.topics.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : '<p class="muted">준비 중입니다.</p>';
    var vid = youtubeId(c.video);
    var media = (vid ? '<div class="video"><iframe src="https://www.youtube.com/embed/' + vid + '" allowfullscreen title="강의 영상"></iframe></div>' : "") +
      (c.photos.length ? '<div class="photos" style="margin-top:10px">' + c.photos.map(function (p) { return '<img src="' + esc(p) + '" alt="" loading="lazy">'; }).join("") + "</div>" : "");
    if (!media) media = '<p class="muted">등록된 영상·사진이 없습니다.</p>';

    $("coachDetail").innerHTML =
      '<div class="profile">' + avatar(c, "lg") + '<div class="nm">' + esc(c.name) + '</div><div class="sm">' + esc(c.summary) + "</div></div>" +
      '<div class="stats"><div><b>' + c.topics.length + "개</b><span>설명회 주제</span></div>" +
      "<div><b>" + esc(c.targets[0] || "-") + (c.targets.length > 1 ? " 외" : "") + "</b><span>대상</span></div>" +
      "<div><b>" + esc(c.region || "협의") + "</b><span>진행 지역</span></div></div>" +
      '<div class="tabs" role="tablist"><button type="button" class="on" data-tab="0">소개</button><button type="button" data-tab="1">설명회 주제</button><button type="button" data-tab="2">영상·사진</button></div>' +
      '<div class="tab-pane" data-pane="0"><h4>대표 경력</h4><div class="box">' + esc(c.career || c.summary) + "</div>" +
      '<h4>대상</h4><div class="tags">' + c.targets.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + "</div></div>" +
      '<div class="tab-pane" data-pane="1" hidden>' + topics + "</div>" +
      '<div class="tab-pane" data-pane="2" hidden>' + media + "</div>";
    var picked = S.coach && S.coach.name === c.name;
    $("pickCoach").textContent = picked ? "선택됨 · 날짜 고르러 가기" : "이 강연자로 신청";
    $("coachModal").showModal();
    $("coachDetail").scrollTop = 0;
  }
  function youtubeId(u) {
    var m = String(u || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    return m ? m[1] : "";
  }

  /* ---------- 2단계: 날짜 ---------- */
  function slotBlocked(dstr) {
    return !S.coach || S.blocked[S.coach.name + "|" + dstr];
  }

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
      var early = dt < MIN_DATE, blocked = slotBlocked(s);
      var idx = -1;
      S.slots.forEach(function (x, k) { if (x.d === s) idx = k; });
      var cls = "day" + (s === t ? " today" : "") + (blocked && !early ? " blocked" : "") + (idx >= 0 ? " pick" : "") + (idx === S.active ? " cur" : "");
      html += '<button type="button" class="' + cls + '" data-d="' + s + '"' + (early || blocked ? ' aria-disabled="true"' : "") +
        (early ? " disabled" : "") + ">" + d + (idx >= 0 ? '<span class="no">' + (idx + 1) + "</span>" : "") + "</button>";
    }
    $("calDays").innerHTML = html;
    var now = new Date(today().getFullYear(), today().getMonth(), 1);
    $("prevMonth").disabled = m <= now;
  }

  function partOf(t) { var h = +t.split(":")[0]; return h < 12 ? "am" : h < 18 ? "pm" : "ev"; }

  function renderTimes() {
    var s = S.slots[S.active];
    $("timeTitle").textContent = RANKS[S.active] + " 시작 시간";
    Array.prototype.forEach.call($("timeSeg").children, function (b) { b.classList.toggle("on", b.dataset.part === S.part); });
    var times = (C.TIMES || []).filter(function (t) { return partOf(t) === S.part; });
    $("timeGrid").innerHTML = times.map(function (t) {
      return '<button type="button" class="tbtn' + (s.t === t ? " on" : "") + '" data-t="' + t + '"' + (s.d ? "" : " disabled") + ">" + t + "</button>";
    }).join("");
    $("timeHint").textContent = s.d ? krDate(s.d) + " 몇 시에 시작할까요?" : "먼저 달력에서 날짜를 골라 주세요.";
  }

  function renderDates() {
    renderSlots();
    renderCal();
    renderTimes();
    var soon = S.slots.some(function (s) { return s.d && daysFromToday(s.d) < (C.WARN_DAYS || 21); });
    $("soonNotice").hidden = !soon;
    renderSummary();
  }

  function setActive(i) {
    S.active = i;
    var s = S.slots[i];
    if (s.t) S.part = partOf(s.t);
    if (s.d) { var d = parse(s.d); S.month = new Date(d.getFullYear(), d.getMonth(), 1); }
    $("calMsg").textContent = "";
    renderDates();
  }

  function pickDate(s) {
    if (parse(s) < MIN_DATE) { $("calMsg").textContent = "진행일 최소 2주 전까지만 신청할 수 있습니다."; return; }
    if (slotBlocked(s)) { $("calMsg").textContent = "강연자 일정이 있어 선택할 수 없는 날짜입니다."; return; }
    var dup = -1;
    S.slots.forEach(function (x, k) { if (x.d === s && k !== S.active) dup = k; });
    if (dup >= 0) { $("calMsg").textContent = "이미 " + RANKS[dup] + "로 고른 날짜입니다."; return; }
    $("calMsg").textContent = "";
    var slot = S.slots[S.active];
    slot.d = s;
    // 시간을 아직 안 골랐으면 앞 순위 시간을 기본값으로
    if (!slot.t) {
      var prev = S.slots.filter(function (x) { return x.t; })[0];
      if (prev) { slot.t = prev.t; S.part = partOf(prev.t); }
    }
    renderDates();
    if (slot.t) advance();
  }

  function pickTime(t) {
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

  /* ---------- 신청 내역 / 하단 바 ---------- */
  function summaryHtml() {
    var c = S.coach;
    var coach = c ? avatar(c, "sm") + '<div><div class="name">' + esc(c.name) + '</div><div class="small">' + esc(c.targets.join(", ")) + "</div></div>"
      : '<span class="muted">강연자를 골라 주세요</span>';
    var dates = S.slots.map(function (s, i) {
      return '<li><span class="rk">' + RANKS[i] + "</span>" + (s.d ? '<span class="v">' + esc(krDate(s.d)) + (s.t ? " · " + esc(krTime(s.t)) : "") + "</span>" : '<span class="v none">미선택</span>') + "</li>";
    }).join("");
    return { coach: coach, dates: dates };
  }

  function priceText() {
    var m = (document.querySelector("[name=member]") || {}).value;
    if (m === "회원") return won(C.PRICE_MEMBER);
    if (m === "비회원") return won(C.PRICE_NONMEMBER);
    return "회원 " + won(C.PRICE_MEMBER) + " · 비회원 " + won(C.PRICE_NONMEMBER);
  }

  function renderSummary() {
    var h = summaryHtml();
    $("sumCoach").innerHTML = h.coach;
    $("sumDates").innerHTML = h.dates;
    $("sumPrice").textContent = priceText();
    $("mSum").innerHTML = '<div class="sum-coach">' + h.coach + '</div><ul class="sum-dates">' + h.dates + "</ul>";

    var label, ok, txt;
    if (S.step === 1) {
      ok = !!S.coach; label = "날짜 고르기";
      txt = S.coach ? "<b>" + esc(S.coach.name) + "</b>선택했어요" : "<b>강연자를 골라 주세요</b>1명을 고르면 다음으로 넘어가요";
    } else if (S.step === 2) {
      var n = S.slots.filter(function (s) { return s.d && s.t; }).length;
      ok = datesDone(); label = "다음";
      txt = "<b>희망 날짜 " + n + " / 3</b>" + (ok ? "모두 골랐어요" : RANKS[S.active] + "을 골라 주세요");
    } else {
      ok = !S.sending; label = S.sending ? "신청 처리 중…" : "신청하기";
      txt = "<b>" + esc(S.coach ? S.coach.name : "") + "</b>희망 날짜 3개 · 신청 정보 입력";
    }
    [$("nextBtn"), $("barBtn")].forEach(function (b) { b.textContent = label; b.disabled = !ok; });
    $("barTxt").innerHTML = txt;
    $("sumNote").textContent = S.step === 3 ? "신청 후 강연자가 3일 안에 날짜를 확정합니다. 신청만으로 확정되지는 않습니다." : "신청만으로 일정이 확정되지는 않습니다.";
  }

  /* ---------- 단계 이동 ---------- */
  function go(step) {
    if (step >= 2 && !S.coach) step = 1;
    if (step >= 3 && !datesDone()) step = 2;
    S.step = step;
    ["step1", "step2", "step3", "done"].forEach(function (id, i) { $(id).hidden = i + 1 !== step; });
    Array.prototype.forEach.call($("steps").children, function (li) {
      var n = +li.dataset.step;
      li.classList.toggle("on", n === step);
      li.classList.toggle("past", n < step);
    });
    var finished = step === 4;
    $("side").hidden = finished;
    $("bar").hidden = finished;
    $("pageHead").hidden = finished;
    if (step === 2) {
      if (!S.month) S.month = new Date(MIN_DATE.getFullYear(), MIN_DATE.getMonth(), 1);
      var firstEmpty = S.slots.findIndex(function (s) { return !s.d || !s.t; });
      setActive(firstEmpty < 0 ? 0 : firstEmpty);
    }
    renderSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    if (S.step === 1 && S.coach) go(2);
    else if (S.step === 2 && datesDone()) go(3);
    else if (S.step === 3) submit();
  }

  /* ---------- 3단계: 입력 확인 ---------- */
  function fieldOf(el) { return el.closest(".field") || el.closest(".check"); }
  function setErr(el, msg) {
    var f = fieldOf(el);
    if (!f) return;
    f.classList.add("err");
    var m = f.querySelector(".msg");
    if (f.classList.contains("field")) {
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

  function check() {
    var form = $("form"), first = null;
    Array.prototype.forEach.call(form.querySelectorAll("input, select, textarea"), clearErr);
    function bad(name, msg) {
      var el = form.elements[name];
      setErr(el, msg);
      if (!first) first = el;
    }
    var v = function (n) { return String(form.elements[n].value || "").trim(); };
    if (!v("academy")) bad("academy", "학원명을 입력해 주세요.");
    if (!v("director")) bad("director", "원장님 성함을 입력해 주세요.");
    if (!/^01[016789]-?\d{3,4}-?\d{4}$/.test(v("phone").replace(/\s/g, ""))) bad("phone", "휴대폰 번호를 확인해 주세요.");
    if (!v("member")) bad("member", "회원 여부를 골라 주세요.");
    if (!v("addr1")) bad("addr1", "주소 검색으로 학원 주소를 찾아 주세요.");
    else if (!v("addr2")) bad("addr2", "상세 주소를 입력해 주세요.");
    if (!v("target")) bad("target", "설명회 대상을 골라 주세요.");
    if (!form.elements.agreePrivacy.checked) bad("agreePrivacy", "");
    if (!form.elements.agreePolicy.checked) bad("agreePolicy", "");
    if (first) {
      var box = fieldOf(first);
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      if (first.type !== "hidden" && first.type !== "checkbox") setTimeout(function () { first.focus({ preventScroll: true }); }, 300);
      toast(first.type === "checkbox" ? "필수 항목에 동의해 주세요." : "입력하지 않은 항목이 있습니다.");
      return null;
    }
    var phone = v("phone").replace(/\D/g, "");
    return {
      academy: v("academy"), director: v("director"),
      phone: phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3"),
      member: v("member"), target: v("target"),
      address: v("addr1") + " " + v("addr2") + (v("zip") ? " (" + v("zip") + ")" : ""),
      attendees: v("attendees"), request: v("request"),
      coach: S.coach.name,
      options: S.slots.map(function (s) { return { date: s.d, time: s.t }; })
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
      if (!res.ok) {
        // 그사이 막힌 날짜가 있으면 비우고 날짜 단계로 돌려보낸다
        if (res.conflicts && res.conflicts.length) {
          res.conflicts.forEach(function (c) {
            S.blocked[c.coach + "|" + c.date] = true;
            S.slots.forEach(function (s) { if (s.d === c.date) { s.d = ""; s.t = ""; } });
          });
          S.sending = false;
          go(2);
        }
        throw new Error(res.error || "");
      }
      showDone(res.id, body);
    }).catch(function (e) {
      S.sending = false;
      renderSummary();
      var msg = e && e.message && !/fetch|network|json/i.test(e.message) ? e.message : "신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      toast(msg);
    });
  }

  function showDone(id, b) {
    S.sending = false;
    $("doneSum").innerHTML =
      "<dt>신청번호</dt><dd>" + esc(id) + "</dd>" +
      "<dt>학원</dt><dd>" + esc(b.academy) + " · " + esc(b.director) + " 원장님</dd>" +
      "<dt>강연자</dt><dd>" + esc(b.coach) + "</dd>" +
      b.options.map(function (o, i) { return "<dt>" + RANKS[i] + "</dt><dd>" + esc(krDate(o.date)) + " " + esc(krTime(o.time)) + "</dd>"; }).join("");
    go(4);
  }

  function reset() {
    S.coach = null;
    S.slots = [{ d: "", t: "" }, { d: "", t: "" }, { d: "", t: "" }];
    S.active = 0;
    $("form").reset();
    $("form").elements.member.value = "";
    Array.prototype.forEach.call($("memberSeg").children, function (b) { b.classList.remove("on"); });
    renderCoaches();
    go(1);
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
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
      if (card) pickCoach(findCoach(card.dataset.c));
    });
    $("coachList").addEventListener("keydown", function (e) {
      var card = e.target.closest("[data-c]");
      if (card && e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickCoach(findCoach(card.dataset.c)); }
    });
    $("coachDetail").addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (!t) return;
      Array.prototype.forEach.call(this.querySelectorAll("[data-tab]"), function (b) { b.classList.toggle("on", b === t); });
      Array.prototype.forEach.call(this.querySelectorAll("[data-pane]"), function (p) { p.hidden = p.dataset.pane !== t.dataset.tab; });
    });
    $("pickCoach").addEventListener("click", function () {
      pickCoach(detailFor);
      $("coachModal").close();
      go(2);
    });

    $("slots").addEventListener("click", function (e) {
      var x = e.target.closest("[data-clear]");
      if (x) {
        var i = +x.dataset.clear;
        S.slots[i] = { d: "", t: "" };
        setActive(i);
        return;
      }
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

    $("memberSeg").addEventListener("click", function (e) {
      var b = e.target.closest("[data-v]");
      if (!b) return;
      Array.prototype.forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); });
      var input = $("form").elements.member;
      input.value = b.dataset.v;
      clearErr(input);
      renderSummary();
    });
    $("form").addEventListener("input", function (e) {
      if (e.target.name === "phone") e.target.value = phoneFmt(e.target.value);
      clearErr(e.target);
    });
    $("form").addEventListener("change", function (e) { clearErr(e.target); });
    $("form").addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    $("nextBtn").addEventListener("click", next);
    $("barBtn").addEventListener("click", next);
    document.addEventListener("click", function (e) {
      var g = e.target.closest("[data-go]");
      if (g) go(+g.dataset.go);
      var o = e.target.closest("[data-open]");
      if (o) $(o.dataset.open + "Modal").showModal();
      if (e.target.closest("[data-close]")) e.target.closest("dialog").close();
      if (e.target.tagName === "DIALOG") e.target.close();   // 바깥 클릭으로 닫기
    });
    $("again").addEventListener("click", reset);
    $("form").addEventListener("click", function (e) {
      if (e.target.closest("[data-addr]")) openPost();
    });
  }

  // 입력하는 대로 010-1234-5678 형태로 하이픈을 붙인다 (10자리 번호는 011-123-4567)
  function phoneFmt(v) {
    var d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + "-" + d.slice(3);
    if (d.length === 10 && d.indexOf("010") !== 0) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  }

  /* ---------- 주소 검색 (다음 우편번호) ---------- */
  function openPost() {
    var form = $("form");
    // 파일을 더블클릭해 열면(file://) 검색 결과를 눌러도 값이 넘어오지 않는다 — 미리보기.bat으로 열어야 함
    if (location.protocol === "file:") {
      toast("파일로 열면 주소 검색이 동작하지 않습니다. 폴더의 '미리보기.bat'으로 열어 주세요.");
    }
    if (!window.daum || !window.daum.Postcode) {
      // 검색 창을 못 불러오면 직접 입력할 수 있게 연다
      form.elements.addr1.readOnly = false;
      form.elements.addr1.placeholder = "도로명 주소를 입력해 주세요";
      form.elements.addr1.focus();
      toast("주소 검색을 불러오지 못해 직접 입력으로 바꿨습니다.");
      return;
    }
    $("postWrap").innerHTML = "";
    new window.daum.Postcode({
      width: "100%",
      height: "100%",
      oncomplete: function (d) {
        var extra = [d.bname && /[동로가]$/.test(d.bname) ? d.bname : "", d.apartment === "Y" ? d.buildingName : ""].filter(Boolean).join(", ");
        form.elements.zip.value = d.zonecode;
        form.elements.addr1.value = (d.roadAddress || d.jibunAddress) + (extra ? " (" + extra + ")" : "");
        clearErr(form.elements.addr1);
        $("postModal").close();
        form.elements.addr2.focus();
      }
    }).embed($("postWrap"));
    $("postModal").showModal();
  }

  /* ---------- 시작 ---------- */
  function init() {
    $("demoBar").hidden = !DEMO;
    $("retention").textContent = C.PRIVACY_RETENTION || "";
    $("policyModalBody").innerHTML = $("policyInline").innerHTML;
    var sel = $("form").elements.target;
    (C.TARGETS || []).forEach(function (t) { sel.add(new Option(t, t)); });
    if (C.CONTACT_URL) {
      $("contactTop").href = $("contactSide").href = $("contactFoot").href = C.CONTACT_URL;
      $("contactTop").hidden = false;
      $("helpCard").hidden = false;
    }
    bind();
    renderFilters();
    go(1);
    $("coachList").innerHTML = '<p class="empty">강연자 정보를 불러오는 중…</p>';
    load().then(function (d) {
      useData(d);
      renderCoaches();
    }).catch(function () {
      $("coachList").innerHTML = '<p class="empty">강연자 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>';
    });
  }

  init();
})();
