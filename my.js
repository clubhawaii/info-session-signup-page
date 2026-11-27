// 원장님 「내 신청 내역」 — 휴대폰 번호 + 원장님 성함으로 시트(Code.gs myApps_)에서 내 신청만 불러옴
(function () {
  var C = window.APP_CONFIG || {};
  var DEMO = !C.SIGNUP_OPEN || !C.APPS_SCRIPT_URL;
  var STEPS = ["신청 완료", "일정 확인·조율", "일정 확정", "결제 안내", "결제 완료"];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }
  function phoneFmt(v) {
    var d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + "-" + d.slice(3);
    return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  }
  function krDate(s) {
    var p = String(s || "").split("-");
    if (p.length < 3) return s || "";
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일(" + "일월화수목금토".charAt(d.getDay()) + ")";
  }
  function krTime(t) {
    var p = String(t || "").split(":"), h = +p[0], m = +(p[1] || 0);
    if (!t || isNaN(h)) return t || "";
    return (h < 12 ? "오전 " : "오후 ") + (h % 12 || 12) + "시" + (m ? " " + m + "분" : "");
  }
  function money(v) {
    var n = Number(String(v).replace(/[^\d]/g, ""));
    return n ? n.toLocaleString("ko-KR") + "원" : String(v || "");
  }

  // 시험 모드용 예시
  function demoItems() {
    return [
      { id: "SEM-20261127-001", created: "2026-11-27 14:20", status: "소장님 일정 확인 중", step: 1, academy: "클럽하와이", date: "2026-12-19", time: "19:00", duration: "90분 ~ 120분",
        picks: "예시 강연자 A — 고입 면접 실전 특강", coach: "", product: "", cdate: "", ctime: "", price: "", payDue: "", travel: "" },
      { id: "SEM-20261020-003", created: "2026-10-20 10:05", status: "결제 완료", step: 4, academy: "클럽하와이", date: "2026-11-14", time: "10:30", duration: "120분 ~ 180분",
        picks: "예시 강연자 C — 학생부 종합전형 완전 정복", coach: "예시 강연자 C", product: "학생부 종합전형 완전 정복", cdate: "2026-11-14", ctime: "10:30", price: "900000", payDue: "", travel: "있음" }
    ];
  }

  function card(it) {
    var done = it.cancel ? -1 : it.step || 1;
    var bar = it.cancel ? "" : '<ol class="my-steps">' + STEPS.map(function (s, i) {
      return '<li class="' + (i < done ? "past" : i === done ? "on" : "") + '"><span></span>' + s + "</li>";
    }).join("") + "</ol>";
    var confirmed = it.coach && it.cdate;
    var rows = [
      ["신청번호", esc(it.id)],
      ["학원", esc(it.academy)],
      [confirmed ? "확정 일정" : "희망 일정", esc(krDate(confirmed ? it.cdate : it.date) + " " + krTime(confirmed ? it.ctime : it.time) + " 시작") + (it.duration ? " · 강연 " + esc(it.duration) : "")],
      ["강연자 · 설명회", confirmed ? "<b>" + esc(it.coach) + "</b> " + esc(it.product) : esc(it.picks).replace(/\n/g, "<br>")]
    ];
    if (it.price) rows.push(["금액", "<b>" + esc(money(it.price)) + "</b> (VAT 별도)" + (it.travel ? " · 출장비 포함" : "")]);
    else if (it.travel) rows.push(["출장비", esc(String(it.travel).split(" — ")[0] === "있음" ? "10만원" : String(it.travel).split(" — ")[0]) + " (VAT 별도)"]);
    if (it.payDue && it.step === 3) rows.push(["결제 기한", esc(it.payDue)]);
    rows.push(["신청일", esc(it.created)]);
    return '<article class="panel my-card">' +
      '<div class="my-head"><span class="my-status' + (it.cancel ? " gray" : "") + '">' + esc(it.status) + "</span><small>" + esc(it.id) + "</small></div>" + bar +
      '<dl class="my-dl">' + rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("") + "</dl></article>";
  }

  function show(items) {
    $("myList").innerHTML = items.length
      ? '<p class="my-count"><b>' + items.length + "건</b>의 신청 내역이 있어요.</p>" + items.map(card).join("")
      : '<div class="panel my-empty"><b>휴대폰 번호와 성함을 한 번 더 확인해 주세요.</b><p>신청할 때 적은 정보와 같으면 바로 보여요. 새 설명회는 아래 「새 설명회 신청하기」에서 신청할 수 있어요.</p></div>';
    $("myList").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function lookup(e) {
    e.preventDefault();
    var phone = $("myPhone").value.replace(/\D/g, ""), name = $("myName").value.trim();
    if (!/^01[016789]\d{7,8}$/.test(phone)) { toast("휴대폰 번호를 확인해 주세요."); $("myPhone").focus(); return; }
    if (!name) { toast("원장님 성함을 적어 주세요."); $("myName").focus(); return; }
    var btn = $("myBtn");
    btn.disabled = true;
    btn.textContent = "불러오는 중…";
    var req = DEMO
      ? new Promise(function (ok) { setTimeout(function () { ok({ ok: true, items: demoItems() }); }, 500); })
      : fetch(C.APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "myApps", phone: phone, director: name }) })
        .then(function (r) { return r.json(); });
    req.then(function (res) {
      if (!res.ok) throw new Error(res.error || "");
      show(res.items || []);
    }).catch(function (err) {
      toast(err && err.message && !/fetch|network|json/i.test(err.message) ? err.message : "잠시 후 다시 시도해 주세요.");
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "신청 내역 보기";
    });
  }

  $("demoBar").hidden = !DEMO;
  $("myPhone").addEventListener("input", function (e) { e.target.value = phoneFmt(e.target.value); });
  $("myForm").addEventListener("submit", lookup);
  Array.prototype.forEach.call(document.querySelectorAll("[data-contact]"), function (a) {
    if (C.CONTACT_URL) a.href = C.CONTACT_URL; else a.hidden = true;
  });
})();
