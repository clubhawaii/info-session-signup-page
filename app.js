(function () {
  "use strict";

  var C = window.APP_CONFIG;
  var STEPS = ["select", "schedule", "info", "confirm", "done"];
  var PRI = ["1순위", "2순위", "3순위"];
  var WHEN = ["1개월 이내", "1~3개월", "아직 모르겠어요"];

  var S = {
    coaches: [],
    blocked: {},          // 소장님 이름 → { "YYYY-MM-DD": true }
    monthly: [],
    step: "select",
    selected: [],         // 선택 순서대로 소장님 이름
    sched: {},            // 이름 → [{date, time} × 3]
    sameAll: false,
    filter: "전체",
    query: "",
    quiz: { target: "", purpose: "", when: "" },
    demo: !C.APPS_SCRIPT_URL
  };

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function won(n) { return n.toLocaleString("ko-KR") + "원"; }

  /* ---------- 날짜 ---------- */
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysFromToday(s) { return Math.round((parse(s) - today()) / 86400000); }
  function fmtDate(s) {
    var d = parse(s);
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일(" + "일월화수목금토"[d.getDay()] + ")";
  }
  function minDate() { var d = today(); d.setDate(d.getDate() + C.MIN_DAYS); return d; }

  /* ---------- 데이터 ---------- */
  function splitList(v, sep) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return String(v || "").split(sep || ",").map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function normalize(data) {
    S.coaches = (data.coaches || []).map(function (c) {
      return {
        name: String(c.name || "").trim(),
        photo: c.photo || "",
        summary: c.summary || "",
        career: c.career || "",
        topics: splitList(c.topics, /\n/),
        targets: splitList(c.targets),
        purposes: splitList(c.purposes),
        video: c.video || "",
        photos: splitList(c.photos)
      };
    }).filter(function (c) { return c.name; });
    S.blocked = {};
    (data.blocked || []).forEach(function (b) {
      if (!b.coach || !b.date) return;
      (S.blocked[b.coach] = S.blocked[b.coach] || {})[String(b.date).slice(0, 10)] = true;
    });
    S.monthly = (data.monthly || []).map(function (m) {
      return { month: +m.month, theme: m.theme || "", desc: m.desc || "", target: m.target || "", coaches: splitList(m.coaches) };
    }).filter(function (m) { return m.month >= 1 && m.month <= 12; });
  }
  function load() {
    if (S.demo) { normalize(window.SAMPLE_DATA); return Promise.resolve(); }
    return fetch(C.APPS_SCRIPT_URL, { method: "GET" })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || "load"); normalize(d); });
  }
  function coach(name) { return S.coaches.find(function (c) { return c.name === name; }); }

  /* ---------- 공통 UI ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function openModal(html) {
    $("#modalBody").innerHTML = html;
    $("#modal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("#modal").hidden = true;
    $("#modalBody").innerHTML = "";
    document.body.style.overflow = "";
  }
  function avatar(c, big) {
    var cls = "avatar" + (big ? " avatar-lg" : "");
    if (c.photo) return '<img class="' + cls + '" src="' + esc(c.photo) + '" alt="' + esc(c.name) + ' 소장님" loading="lazy">';
    return '<div class="' + cls + '" aria-hidden="true">' + esc(c.name.replace(/^예시 소장님 /, "").charAt(0)) + "</div>";
  }
  function tagsHtml(c, highlight) {
    return '<div class="tags">' + c.targets.map(function (t) {
      return '<span class="tag' + (t === highlight ? " tag-match" : "") + '">' + esc(t) + "</span>";
    }).join("") + "</div>";
  }

  /* ---------- 단계 ---------- */
  function go(step, noScroll) {
    S.step = step;
    $$(".step").forEach(function (el) { el.hidden = el.dataset.step !== step; });
    var idx = STEPS.indexOf(step);
    $$("#steps li").forEach(function (li) {
      var i = STEPS.indexOf(li.dataset.step);
      li.classList.toggle("is-on", i === idx);
      li.classList.toggle("is-done", i < idx);
    });
    $("#steps").classList.toggle("is-hidden", step === "done");
    if (step === "schedule") renderSched();
    if (step === "confirm") renderSummary();
    updateBar();
    if (!noScroll) $(step === "done" ? "#app" : "#steps").scrollIntoView({ behavior: "smooth" });
  }

  function memberValue() { var r = $('input[name=member]:checked'); return r ? r.value : ""; }

  function updateBar() {
    var n = S.selected.length, m = memberValue();
    $("#barCount").textContent = "선택한 소장님 " + n + "명";
    var price;
    if (!n) price = "소장님을 선택해 주세요";
    else if (m) price = "예상 <strong>" + won(n * (m === "회원" ? C.PRICE_MEMBER : C.PRICE_NONMEMBER)) + "</strong> (VAT·출장비 별도)";
    else price = "회원 <strong>" + won(n * C.PRICE_MEMBER) + "</strong> / 비회원 " + won(n * C.PRICE_NONMEMBER) + " (VAT·출장비 별도)";
    $("#barPrice").innerHTML = price;
    $("#bar").hidden = S.step === "done";
    $("#barPrev").hidden = S.step === "select";
    $("#barNext").hidden = S.step === "confirm";
  }

  function next() {
    if (S.step === "select") {
      if (!S.selected.length) { toast("소장님을 1명 이상 선택해 주세요"); $("#coaches").scrollIntoView(); return; }
      go("schedule");
    } else if (S.step === "schedule") {
      if (validateSched()) go("info");
    } else if (S.step === "info") {
      if (validateInfo()) go("confirm");
    }
  }
  function prev() {
    var i = STEPS.indexOf(S.step);
    if (i > 0) go(STEPS[i - 1]);
  }

  /* ---------- 선택 ---------- */
  function toggleCoach(name, force) {
    var i = S.selected.indexOf(name);
    var on = force === undefined ? i < 0 : force;
    if (on && i < 0) {
      S.selected.push(name);
      S.sched[name] = S.sched[name] || [{ date: "", time: "" }, { date: "", time: "" }, { date: "", time: "" }];
      if (S.sameAll && S.selected.length > 1) copyFromFirst(name);
    } else if (!on && i >= 0) {
      S.selected.splice(i, 1);
    }
    renderCoaches();
    renderQuizResult();
    updateBar();
  }
  function startWith(name) {
    toggleCoach(name, true);
    closeModal();
    go("schedule");
  }

  function renderFilters() {
    $("#filters").innerHTML = ["전체"].concat(C.TARGETS).map(function (t) {
      return '<button type="button" class="chip' + (S.filter === t ? " is-on" : "") + '" data-filter="' + esc(t) + '">' + esc(t === "전체" ? "전체보기" : t) + "</button>";
    }).join("");
  }

  function coachCard(c, opts) {
    opts = opts || {};
    var sel = S.selected.indexOf(c.name) >= 0;
    var btn = opts.apply
      ? '<button type="button" class="btn btn-pink btn-sm" data-start="' + esc(c.name) + '">이 소장님으로 신청하기</button>'
      : '<button type="button" class="btn btn-line btn-sm btn-sel' + (sel ? " is-sel" : "") + '" data-toggle="' + esc(c.name) + '">' + (sel ? "선택됨 ✓" : "선택") + "</button>";
    return '<article class="coach' + (sel && !opts.apply ? " is-sel" : "") + '">' + avatar(c) +
      '<div><p class="coach-name">' + esc(c.name) + '</p><p class="coach-sum">' + esc(c.summary) + "</p>" +
      tagsHtml(c, opts.highlight) +
      '<div class="coach-btns"><button type="button" class="btn btn-line btn-sm" data-detail="' + esc(c.name) + '">상세보기</button>' + btn + "</div></div></article>";
  }

  function renderCoaches() {
    var q = S.query.trim();
    var list = S.coaches.filter(function (c) {
      return (S.filter === "전체" || c.targets.indexOf(S.filter) >= 0) && (!q || c.name.indexOf(q) >= 0);
    }).sort(function (a, b) { return a.name.localeCompare(b.name, "ko"); });
    $("#coachList").innerHTML = list.length
      ? '<div class="coach-list">' + list.map(function (c) { return coachCard(c, { highlight: S.filter }); }).join("") + "</div>"
      : '<p class="empty">조건에 맞는 소장님이 없습니다.</p>';
  }

  function youtubeEmbed(url) {
    var m = String(url).match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
    return m ? "https://www.youtube-nocookie.com/embed/" + m[1] : "";
  }

  function showDetail(name) {
    var c = coach(name); if (!c) return;
    var sel = S.selected.indexOf(name) >= 0;
    var emb = youtubeEmbed(c.video);
    var h = '<div class="detail-top">' + avatar(c, true) + "<div><h3>" + esc(c.name) + "</h3>" + tagsHtml(c) + "</div></div>";
    if (c.career) h += '<div class="detail-sec"><h4>대표 경력</h4><p>' + esc(c.career) + "</p></div>";
    if (c.topics.length) h += '<div class="detail-sec"><h4>설명회 주제</h4><ul>' + c.topics.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
    if (c.targets.length) h += '<div class="detail-sec"><h4>대상</h4><p>' + esc(c.targets.join(", ")) + "</p></div>";
    if (emb) h += '<div class="detail-sec"><h4>강의 영상 샘플</h4><div class="video"><iframe src="' + esc(emb) + '" title="' + esc(c.name) + ' 강의 영상" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div></div>';
    if (c.photos.length) h += '<div class="detail-sec"><h4>현장 사진</h4><div class="photos">' + c.photos.map(function (p) { return '<img src="' + esc(p) + '" alt="" loading="lazy">'; }).join("") + "</div></div>";
    h += '<button type="button" class="btn ' + (sel ? "btn-line" : "btn-pink") + ' btn-block" data-modal-toggle="' + esc(name) + '">' + (sel ? "선택 해제" : "이 소장님 선택") + "</button>";
    openModal(h);
  }

  /* ---------- 추천 ---------- */
  function allPurposes() {
    var set = [];
    S.coaches.forEach(function (c) { c.purposes.forEach(function (p) { if (set.indexOf(p) < 0) set.push(p); }); });
    return set;
  }
  function chipGroup(id, items, key) {
    $(id).innerHTML = items.map(function (t) {
      return '<button type="button" class="chip' + (S.quiz[key] === t ? " is-on" : "") + '" data-q="' + key + '" data-v="' + esc(t) + '">' + esc(t) + "</button>";
    }).join("");
  }
  function renderQuiz() {
    chipGroup("#qTarget", C.TARGETS, "target");
    var ps = allPurposes();
    if (ps.length) chipGroup("#qPurpose", ps, "purpose");
    else $("#qPurpose").innerHTML = '<p class="help">목적 선택지를 준비 중입니다.</p>';
    chipGroup("#qWhen", WHEN, "when");
    $("#quizGo").disabled = !(S.quiz.target && S.quiz.when && (S.quiz.purpose || !ps.length));
  }
  var quizShown = false;
  function monthsFor(when) {
    var cur = new Date().getMonth() + 1, list = [];
    var range = when === "1개월 이내" ? [0, 1] : when === "1~3개월" ? [1, 2, 3] : [0, 1, 2];
    range.forEach(function (k) { list.push(((cur - 1 + k) % 12) + 1); });
    return list;
  }
  function monthCard(m, isNow) {
    return '<div class="month"><p class="month-n">' + m.month + "월" + (isNow ? "<small>이번 달</small>" : "") + "</p>" +
      '<p class="month-theme">' + esc(m.theme) + "</p>" +
      (m.desc ? '<p class="month-desc">' + esc(m.desc) + "</p>" : "") +
      (m.target ? '<p class="month-target">추천 대상 · ' + esc(m.target) + "</p>" : "") +
      (m.coaches.length ? '<div class="month-coaches">' + m.coaches.map(function (n) {
        return coach(n) ? '<button type="button" class="btn btn-line btn-sm" data-start="' + esc(n) + '">' + esc(n) + " →</button>" : "";
      }).join("") + "</div>" : "") + "</div>";
  }
  function renderQuizResult() {
    if (!quizShown) return;
    var q = S.quiz;
    var scored = S.coaches.map(function (c) {
      var s = (c.targets.indexOf(q.target) >= 0 ? 2 : 0) + (q.purpose && c.purposes.indexOf(q.purpose) >= 0 ? 1 : 0);
      return { c: c, s: s };
    }).filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s || a.c.name.localeCompare(b.c.name, "ko"); });
    var h = '<p class="result-head">추천 소장님</p>';
    if (scored.length) {
      h += '<div class="coach-list">' + scored.map(function (x) { return coachCard(x.c, { apply: true, highlight: q.target }); }).join("") + "</div>";
    } else {
      h += '<div class="empty">조건에 꼭 맞는 소장님이 아직 없어요. 전체 소장님 중에서 골라 보세요.<br><button type="button" class="btn btn-dark btn-sm" data-goto-list>전체 소장님 보기</button></div>';
    }
    var ms = monthsFor(q.when).map(function (n) { return S.monthly.find(function (m) { return m.month === n; }); }).filter(Boolean);
    if (ms.length) {
      var cur = new Date().getMonth() + 1;
      h += '<p class="result-head">이 시기 추천 설명회</p><div class="month-list">' + ms.map(function (m) { return monthCard(m, m.month === cur); }).join("") + "</div>";
    }
    $("#quizResult").innerHTML = h;
  }
  function renderMonthly() {
    var cur = new Date().getMonth() + 1;
    var list = [];
    for (var k = 0; k < 12; k++) {
      var n = ((cur - 1 + k) % 12) + 1;
      var m = S.monthly.find(function (x) { return x.month === n; });
      if (m) list.push(monthCard(m, k === 0));
    }
    $("#months").innerHTML = list.length ? list.join("") : '<p class="empty">월별 추천을 준비 중입니다.</p>';
  }

  /* ---------- 일정 ---------- */
  function dateState(name, idx, s) {
    // 고를 수 없는 이유를 돌려줌 (없으면 "")
    if (parse(s) < minDate()) return "soon";
    if (S.blocked[name] && S.blocked[name][s]) return "blocked";
    var dup = S.sched[name].some(function (p, i) { return i !== idx && p.date === s; });
    return dup ? "dup" : "";
  }

  function copyFromFirst(target) {
    var first = S.selected[0];
    var src = S.sched[first];
    var names = target ? [target] : S.selected.slice(1);
    var dropped = {};
    names.forEach(function (n) {
      if (n === first) return;
      S.sched[n] = src.map(function (p) { return { date: p.date, time: p.time }; });
      S.sched[n].forEach(function (p, i) {
        if (p.date && S.blocked[n] && S.blocked[n][p.date]) { dropped[n] = (dropped[n] || []).concat(PRI[i]); p.date = ""; }
      });
    });
    S.copyDropped = dropped;
  }

  function renderSched() {
    $("#sameAllWrap").hidden = S.selected.length < 2;
    $("#sameAll").checked = S.sameAll;
    var dropped = S.copyDropped || {};
    $("#schedList").innerHTML = S.selected.map(function (name) {
      var rows = S.sched[name].map(function (p, i) {
        var req = i < 2;
        var warn = p.date && daysFromToday(p.date) < C.WARN_DAYS
          ? '<div class="warn">선택하신 날짜는 일정 확정·결제 시점에 진행일까지 2주가 남지 않을 수 있습니다. 이 경우 결제 후 취소 시 환불 비율이 낮아집니다. <a href="#policy" class="link">취소·환불 규정 보기</a></div>' : "";
        var times = '<option value="">시작 시간</option>' + C.TIMES.map(function (t) {
          return '<option' + (p.time === t ? " selected" : "") + ">" + t + "</option>";
        }).join("");
        return '<div class="pri"><p class="pri-label">희망일 ' + PRI[i] + (req ? " <em>*</em>" : " (선택)") + "</p>" +
          '<div class="pri-row"><button type="button" class="date-btn' + (p.date ? "" : " is-empty") + '" data-cal="' + esc(name) + '" data-idx="' + i + '">' +
          (p.date ? fmtDate(p.date) : "날짜 선택") + "</button>" +
          '<select data-time="' + esc(name) + '" data-idx="' + i + '" aria-label="' + PRI[i] + ' 시작 시간">' + times + "</select></div>" +
          (!req && (p.date || p.time) ? '<button type="button" class="pri-clear" data-clear="' + esc(name) + '" data-idx="' + i + '">3순위 지우기</button>' : "") +
          warn + "</div>";
      }).join("");
      var note = dropped[name] ? '<p class="copy-note">' + dropped[name].join("·") + " 날짜는 이 소장님이 진행할 수 없는 날이라 비워 두었어요. 다시 골라 주세요.</p>" : "";
      return '<div class="sched" data-sched="' + esc(name) + '"><div class="sched-head"><span class="sched-name">' + esc(name) + "</span>" +
        '<button type="button" class="pri-clear" data-remove="' + esc(name) + '">선택 해제</button></div>' + rows + note + '<p class="sched-msg" hidden></p></div>';
    }).join("") || '<p class="empty">선택한 소장님이 없습니다. <button type="button" class="btn btn-dark btn-sm" data-go="select">소장님 선택하러 가기</button></p>';
  }

  function afterSchedEdit(name) {
    if (S.sameAll && name === S.selected[0]) copyFromFirst();
    else if (S.copyDropped) delete S.copyDropped[name];
    renderSched();
  }

  function validateSched() {
    var firstBad = null;
    S.selected.forEach(function (name) {
      var p = S.sched[name], msg = "";
      if (!p[0].date || !p[0].time) msg = "희망일 1순위 날짜와 시작 시간을 선택해 주세요.";
      else if (!p[1].date || !p[1].time) msg = "희망일 2순위 날짜와 시작 시간을 선택해 주세요.";
      else if ((p[2].date && !p[2].time) || (!p[2].date && p[2].time)) msg = "3순위는 날짜와 시간을 함께 선택하거나 비워 주세요.";
      else if (p.some(function (x, i) { return x.date && dateState(name, i, x.date); })) msg = "선택할 수 없는 날짜가 있습니다. 다시 선택해 주세요.";
      var box = $('[data-sched="' + CSS.escape(name) + '"]');
      box.classList.toggle("has-error", !!msg);
      var m = $(".sched-msg", box); m.textContent = msg; m.hidden = !msg;
      if (msg && !firstBad) firstBad = box;
    });
    if (firstBad) { firstBad.scrollIntoView({ behavior: "smooth", block: "center" }); return false; }
    return true;
  }

  /* ---------- 달력 ---------- */
  var cal = null;
  function openCal(name, idx) {
    var cur = S.sched[name][idx].date;
    var base = cur ? parse(cur) : minDate();
    cal = { name: name, idx: idx, y: base.getFullYear(), m: base.getMonth() };
    renderCal();
  }
  function renderCal() {
    var name = cal.name, idx = cal.idx, picked = S.sched[name][idx].date;
    var first = new Date(cal.y, cal.m, 1), min = minDate();
    var lim = new Date(min.getFullYear(), min.getMonth() + 8, 1);
    var canPrev = first > new Date(min.getFullYear(), min.getMonth(), 1);
    var canNext = new Date(cal.y, cal.m + 1, 1) < lim;
    var h = "<h3 style=\"margin-top:0;padding-right:30px\">" + esc(name) + " · 희망일 " + PRI[idx] + "</h3>" +
      '<p class="help" style="margin-bottom:8px">진행일 최소 2주 전까지 신청 가능 · 3~4주 전 신청 권장</p>' +
      '<div class="cal-head"><button type="button" class="cal-nav" data-cal-move="-1"' + (canPrev ? "" : " disabled") + ' aria-label="이전 달">‹</button>' +
      "<strong>" + cal.y + "년 " + (cal.m + 1) + "월</strong>" +
      '<button type="button" class="cal-nav" data-cal-move="1"' + (canNext ? "" : " disabled") + ' aria-label="다음 달">›</button></div><div class="cal-grid">' +
      "일월화수목금토".split("").map(function (d) { return '<div class="cal-dow">' + d + "</div>"; }).join("");
    for (var i = 0; i < first.getDay(); i++) h += "<div></div>";
    var last = new Date(cal.y, cal.m + 1, 0).getDate();
    for (var d = 1; d <= last; d++) {
      var s = ymd(new Date(cal.y, cal.m, d));
      var st = dateState(name, idx, s);
      var cls = "cal-day" + (st ? " is-off" : "") + (st === "blocked" ? " is-blocked" : "") + (s === picked ? " is-pick" : "") +
        (!st && daysFromToday(s) < C.WARN_DAYS ? " is-soon" : "");
      h += '<button type="button" class="' + cls + '" data-day="' + s + '"' + (st ? ' data-off="' + st + '" aria-disabled="true"' : "") + ">" + d + "</button>";
    }
    h += '</div><div class="cal-legend"><span><i style="background:#F6F6F6"></i>선택 불가</span><span><i style="background:#FBF2A3"></i>3주 이내 (환불 비율 안내)</span><span><i style="background:#FF5F9F"></i>선택한 날짜</span></div>';
    openModal(h);
  }
  function pickDay(s, off) {
    if (off) {
      toast(off === "dup" ? "다른 순위에서 이미 고른 날짜입니다" : "선택할 수 없는 날짜입니다");
      return;
    }
    S.sched[cal.name][cal.idx].date = s;
    var name = cal.name;
    cal = null;
    closeModal();
    afterSchedEdit(name);
  }

  /* ---------- 신청자 정보 ---------- */
  function setFieldError(field, msg) {
    field.classList.toggle("has-error", !!msg);
    var e = $(".field-err", field);
    if (msg) {
      if (!e) { e = document.createElement("p"); e.className = "field-err"; field.appendChild(e); }
      e.textContent = msg;
    } else if (e) e.remove();
  }
  function readInfo() {
    var f = $("#infoForm");
    return {
      academy: f.academy.value.trim(),
      director: f.director.value.trim(),
      phone: f.phone.value.trim(),
      email: f.email.value.trim(),
      address: f.address.value.trim(),
      member: memberValue(),
      attendees: f.attendees.value.trim(),
      request: f.request.value.trim(),
      privacy: f.privacy.checked
    };
  }
  function validateInfo() {
    var v = readInfo(), f = $("#infoForm"), first = null;
    function chk(el, msg) {
      var field = el.closest(".field");
      setFieldError(field, msg);
      if (msg && !first) first = field;
    }
    chk(f.academy, v.academy ? "" : "학원명을 입력해 주세요.");
    chk(f.director, v.director ? "" : "원장님 성함을 입력해 주세요.");
    chk(f.phone, !v.phone ? "연락처를 입력해 주세요." : /^01[016789]-?\d{3,4}-?\d{4}$/.test(v.phone) ? "" : "휴대폰 번호 형식을 확인해 주세요. (예: 010-1234-5678)");
    chk(f.email, !v.email ? "이메일을 입력해 주세요." : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email) ? "" : "이메일 형식을 확인해 주세요.");
    chk(f.address, v.address ? "" : "학원 주소를 입력해 주세요.");
    chk($("#memberField input"), v.member ? "" : "회원 여부를 선택해 주세요.");
    chk(f.privacy, v.privacy ? "" : "개인정보 수집·이용에 동의해 주세요.");
    if (first) { first.scrollIntoView({ behavior: "smooth", block: "center" }); var inp = $("input, textarea", first); if (inp && inp.type !== "radio" && inp.type !== "checkbox") inp.focus({ preventScroll: true }); return false; }
    return true;
  }
  function formatPhone(v) {
    var d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + "-" + d.slice(3);
    return d.slice(0, 3) + "-" + d.slice(3, d.length - 4) + "-" + d.slice(-4);
  }

  /* ---------- 확인 · 신청 ---------- */
  function schedListHtml(name) {
    return "<ol>" + S.sched[name].filter(function (p) { return p.date; }).map(function (p, i) {
      return "<li>" + PRI[i] + " · " + fmtDate(p.date) + " " + esc(p.time) + "</li>";
    }).join("") + "</ol>";
  }
  function estimate() {
    var v = readInfo();
    return S.selected.length * (v.member === "회원" ? C.PRICE_MEMBER : C.PRICE_NONMEMBER);
  }
  function renderSummary() {
    var v = readInfo();
    var h = '<div class="sum-sec"><div class="sum-sec-head"><h3>소장님 · 희망일</h3><button type="button" class="sum-edit" data-go="schedule">수정</button></div>' +
      S.selected.map(function (n) { return '<div class="sum-coach"><b>' + esc(n) + "</b>" + schedListHtml(n) + "</div>"; }).join("") + "</div>";
    h += '<div class="sum-sec"><div class="sum-sec-head"><h3>학원 정보</h3><button type="button" class="sum-edit" data-go="info">수정</button></div><dl class="kv">' +
      [["학원명", v.academy], ["원장님", v.director], ["연락처", v.phone], ["이메일", v.email], ["학원 주소", v.address], ["회원 여부", v.member],
       ["예상 참석 인원", v.attendees ? v.attendees + "명" : "-"], ["요청사항", v.request || "-"]]
        .map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl></div>";
    h += '<div class="sum-sec"><div class="total"><span>예상 금액 (' + S.selected.length + "명 · " + esc(v.member) + ')</span><strong>' + won(estimate()) + '</strong></div><p class="help">VAT 별도 · 출장비는 결제 안내 시 확정됩니다.</p></div>';
    $("#summary").innerHTML = h;
    $("#submitError").hidden = true;
  }

  function payload() {
    var v = readInfo();
    return {
      academy: v.academy, director: v.director, phone: v.phone, email: v.email, address: v.address,
      member: v.member, attendees: v.attendees, request: v.request,
      items: S.selected.map(function (n) {
        var p = S.sched[n];
        return { coach: n, d1: p[0].date, t1: p[0].time, d2: p[1].date, t2: p[1].time, d3: p[2].date, t3: p[2].time };
      })
    };
  }

  function submit() {
    var btn = $("#submitBtn"), err = $("#submitError");
    err.hidden = true;
    if (!$("#refundAgree").checked) {
      $("#refundField").classList.add("has-error");
      toast("취소·환불 규정 확인에 체크해 주세요");
      $("#refundField").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = "신청 처리 중…";
    var body = payload();
    var req = S.demo
      ? new Promise(function (res) { setTimeout(function () { res({ ok: true, id: "SEM-" + ymd(new Date()).replace(/-/g, "") + "-000 (시험)" }); }, 600); })
      : fetch(C.APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
          .then(function (r) { return r.json(); });
    req.then(function (res) {
      if (!res.ok) {
        if (res.conflicts && res.conflicts.length) {
          res.conflicts.forEach(function (c) { (S.blocked[c.coach] = S.blocked[c.coach] || {})[c.date] = true; });
        }
        throw new Error(res.error || "신청을 저장하지 못했습니다.");
      }
      showDone(res.id);
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = "신청하기";
      var msg = e && e.message && !/fetch|network|json/i.test(e.message) ? e.message : "신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      err.textContent = msg;
      err.hidden = false;
    });
  }

  function showDone(id) {
    var v = readInfo();
    $("#doneId").textContent = id;
    $("#doneSummary").innerHTML = '<dl class="kv"><dt>학원명</dt><dd>' + esc(v.academy) + "</dd>" +
      S.selected.map(function (n) { return "<dt>" + esc(n) + "</dt><dd>" + S.sched[n].filter(function (p) { return p.date; }).map(function (p, i) { return PRI[i] + " " + fmtDate(p.date) + " " + esc(p.time); }).join("<br>") + "</dd>"; }).join("") + "</dl>";
    go("done");
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    document.addEventListener("click", function (e) {
      var t = e.target.closest("button, a, [data-close]");
      if (!t) return;
      var d = t.dataset;
      if (d.close !== undefined) { closeModal(); cal = null; return; }
      if (d.toggle) return toggleCoach(d.toggle);
      if (d.modalToggle) { toggleCoach(d.modalToggle); closeModal(); return; }
      if (d.detail) return showDetail(d.detail);
      if (d.start) return startWith(d.start);
      if (d.filter) { S.filter = d.filter; renderFilters(); renderCoaches(); return; }
      if (d.tab) {
        $$(".tab").forEach(function (b) { b.classList.toggle("is-on", b === t); });
        $$(".tab-panel").forEach(function (p) { p.hidden = p.dataset.panel !== d.tab; });
        return;
      }
      if (d.q) { S.quiz[d.q] = S.quiz[d.q] === d.v ? "" : d.v; renderQuiz(); return; }
      if (d.gotoList !== undefined) { S.filter = "전체"; renderFilters(); renderCoaches(); $("#coaches").scrollIntoView({ behavior: "smooth" }); return; }
      if (d.go) { go(d.go); return; }
      if (d.cal) return openCal(d.cal, +d.idx);
      if (d.calMove) { cal.m += +d.calMove; if (cal.m < 0) { cal.m = 11; cal.y--; } if (cal.m > 11) { cal.m = 0; cal.y++; } renderCal(); return; }
      if (d.day) return pickDay(d.day, d.off);
      if (d.clear) { S.sched[d.clear][+d.idx] = { date: "", time: "" }; afterSchedEdit(d.clear); return; }
      if (d.remove) { toggleCoach(d.remove, false); renderSched(); if (!S.selected.length) go("select"); return; }
      if (t.getAttribute("href") === "#policy" && !$("#modal").hidden) { closeModal(); }
    });

    $("#quizGo").addEventListener("click", function () {
      quizShown = true; renderQuizResult();
      $("#quizResult").scrollIntoView({ behavior: "smooth" });
    });
    $("#search").addEventListener("input", function (e) { S.query = e.target.value; renderCoaches(); });
    $("#sameAll").addEventListener("change", function (e) {
      S.sameAll = e.target.checked;
      if (S.sameAll) copyFromFirst(); else S.copyDropped = null;
      renderSched();
    });
    $("#schedList").addEventListener("change", function (e) {
      var el = e.target;
      if (el.dataset.time) { S.sched[el.dataset.time][+el.dataset.idx].time = el.value; afterSchedEdit(el.dataset.time); }
    });
    var form = $("#infoForm");
    form.addEventListener("submit", function (e) { e.preventDefault(); });
    form.addEventListener("input", function (e) {
      if (e.target.name === "phone") e.target.value = formatPhone(e.target.value);
      var field = e.target.closest(".field");
      if (field && field.classList.contains("has-error")) setFieldError(field, "");
    });
    form.addEventListener("change", function (e) { if (e.target.name === "member") updateBar(); });
    $("#refundAgree").addEventListener("change", function () { $("#refundField").classList.remove("has-error"); });
    $("#submitBtn").addEventListener("click", submit);
    $("#barNext").addEventListener("click", next);
    $("#barPrev").addEventListener("click", prev);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#modal").hidden) { closeModal(); cal = null; } });
  }

  /* ---------- 시작 ---------- */
  function init() {
    $("#priceMember").textContent = won(C.PRICE_MEMBER);
    $("#priceNonmember").textContent = won(C.PRICE_NONMEMBER);
    $("#privacyRetention").textContent = C.PRIVACY_RETENTION;
    if (C.CONTACT_URL) { var cb = $("#contactBtn"); cb.href = C.CONTACT_URL; cb.hidden = false; }
    $("#demoBanner").hidden = !S.demo;
    bind();
    $("#coachList").innerHTML = '<p class="loading">소장님 정보를 불러오는 중…</p>';
    load().then(function () {
      renderFilters(); renderCoaches(); renderQuiz(); renderMonthly(); go("select", true);
    }).catch(function () {
      $("#coachList").innerHTML = '<p class="empty">소장님 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>';
    });
    updateBar();
  }
  init();
})();
