// 강연자 정보 입력 — 휴대폰 번호로 들어와 지금 등록된 소개·대표 주제를 보면서 고쳐 제출
// 제출 내용은 시트 「프로필 제출」에 쌓이고, 본사가 확인 후 「강연자」·「대표 주제」에 반영합니다.
(function () {
  "use strict";

  var C = window.APP_CONFIG || {};
  var DEMO = !C.APPS_SCRIPT_URL;
  var MAX_TOPICS = C.MAX_TOPICS || 5, MAX_PHOTOS = C.MAX_PHOTOS || 5;
  var TWICE = ["가능", "협의", "어려움"];

  // 칸 정의 — 줄 단위(lines) 칸은 배열로 저장
  var FIELDS = {
    nameEn: { kind: "input", max: 40, ph: "예) Han Seungsuk" },
    slogan: { kind: "input", max: 30, ph: "예) 현장에서 완성한 입시전략", was: "지금 이미지" },
    sub: { kind: "input", max: 50, ph: "예) 18년 학원 경영의 경험으로 입시를 성장 전략으로 바꾸다", was: "지금 이미지" },
    history: { kind: "lines", rows: 6, ph: "현 ○○ 입시연구소 소장\n전 ○○학원 대표원장", was: "지금 이미지" },
    extra: { kind: "lines", rows: 3, ph: "예) 고입 컨설팅 16년\n예) ○○ 자격 보유" },
    works: { kind: "lines", rows: 3, ph: "예) 『○○○○』 저자\n예) ○○방송 출연" }
  };
  var FIELD_NAMES = { nameEn: "영문 이름", slogan: "메인 슬로건", sub: "서브 슬로건", history: "경력", extra: "주요 이력", works: "저서·방송·언론" };

  var P = {
    phone: "",
    orig: null,       // 들어올 때 받은 내용(비교 기준)
    cur: null,        // 지금 고치는 내용
    newMain: null,    // 새로 올린 프로필 사진 { data, name }
    newPhotos: [],    // 새로 올린 현장 사진 [{ data, name }]
    sending: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function arr(v) { return Array.isArray(v) ? v.filter(Boolean) : String(v || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  function post(body) {
    return fetch(C.APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  /* ---------- 들어오기 ---------- */
  function emptyTopic() { return { area: "", cat: "", name: "", intro: "", points: [], targets: [], seasons: [], time: "", formats: [], size: "", extra: "" }; }
  function normalize(c) {
    return {
      name: c.name || "", nameEn: c.nameEn || "", slogan: c.slogan || "", sub: c.sub || "",
      history: arr(c.history), extra: arr(c.extra), works: arr(c.works),
      links: (c.links || []).map(function (l) { return { type: l.type || "", title: l.title || "", url: l.url || "" }; }),
      regions: arr(c.regions), twice: c.twice || "", photo: c.photo || "", photos: arr(c.photos), branding: c.branding || "",
      topics: (c.topics || []).map(function (t, i) {
        var x = emptyTopic();
        Object.keys(x).forEach(function (k) { if (t[k] != null) x[k] = Array.isArray(x[k]) ? arr(t[k]) : String(t[k]); });
        x._k = i;   // 처음 받은 주제 표시 — 「수정함」 비교용 (서버는 이 칸을 버림)
        return x;
      })
    };
  }
  function login(phone) {
    if (DEMO) {
      var d = window.LOCAL_DATA || window.SAMPLE_DATA || { coaches: [] };
      var hit = d.coaches.filter(function (c) { return digits(c.phone) === phone; })[0] || d.coaches[0];
      return Promise.resolve(hit ? { ok: true, coach: hit } : { ok: false, error: "예시 데이터가 없습니다." });
    }
    return post({ action: "profileLogin", phone: phone });
  }
  function start(res) {
    P.orig = normalize(res.coach);
    P.cur = clone(P.orig);
    P.newMain = null;
    P.newPhotos = [];
    $("pendingNote").hidden = !res.pending;
    var draft = readDraft();
    if (draft && draft.base === JSON.stringify(P.orig)) {   // 같은 내용을 바탕으로 쓰던 임시 저장이 있으면 이어서
      P.cur = draft.cur;
      toast("임시 저장된 내용을 불러왔어요.");
    }
    $("loginView").hidden = true;
    $("doneView").hidden = true;
    $("editView").hidden = false;
    $("saveState").hidden = false;
    renderAll();
    window.scrollTo(0, 0);
  }

  /* ---------- 임시 저장 (이 컴퓨터에만) ---------- */
  var KEY = function () { return "coach-profile-draft:" + P.phone; };
  function readDraft() { try { return JSON.parse(localStorage.getItem(KEY()) || "null"); } catch (e) { return null; } }
  var saveTimer;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(KEY(), JSON.stringify({ base: JSON.stringify(P.orig), cur: P.cur }));
        var d = new Date();
        $("saveState").textContent = "임시 저장됨 " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
      } catch (e) { /* 저장 공간을 못 쓰는 환경 — 무시 */ }
    }, 400);
  }
  function clearDraft() { try { localStorage.removeItem(KEY()); } catch (e) { /* 무시 */ } }

  /* ---------- 그리기 ---------- */
  function renderAll() {
    $("whoName").textContent = P.orig.name;
    $("f_name").value = P.orig.name;
    Object.keys(FIELDS).forEach(renderField);
    renderLinks();
    renderPhotos();
    renderTopics();
    renderChecks($("regions"), "region", C.REGIONS || [], P.cur.regions, "checkbox");
    renderChecks($("twice"), "twice", TWICE, P.cur.twice ? [P.cur.twice] : [], "radio");
    $("f_memo").value = P.cur.memo || "";
    var b = $("brandImg");
    b.innerHTML = P.orig.branding ? '<img src="' + esc(P.orig.branding) + '" alt="' + esc(P.orig.name) + ' 소개 이미지">' : '<span class="muted">등록된 소개 이미지가 없습니다.</span>';
    if (P.orig.branding) b.href = P.orig.branding; else b.removeAttribute("href");
    renderProgress();
  }

  function fieldVal(k) { var v = P.cur[k]; return FIELDS[k].kind === "lines" ? v.join("\n") : v; }
  function renderField(k) {
    var f = FIELDS[k], box = document.querySelector('[data-f="' + k + '"]');
    var label = box.querySelector("span").outerHTML;
    var orig = P.orig[k], hasOrig = f.kind === "lines" ? orig.length : orig;
    var input = f.kind === "lines"
      ? '<textarea data-in="' + k + '" rows="' + Math.max(f.rows, (P.cur[k].length || 0) + 1) + '" placeholder="' + esc(f.ph) + '">' + esc(fieldVal(k)) + "</textarea>"
      : '<input data-in="' + k + '" maxlength="' + f.max + '" placeholder="' + esc(f.ph) + '" value="' + esc(fieldVal(k)) + '">';
    box.innerHTML = label +
      (f.was && hasOrig ? '<div class="was"><b>' + f.was + "</b>" + esc(f.kind === "lines" ? orig.join("\n") : orig) + "</div>" : "") +
      input + '<div class="fstate" data-st="' + k + '"></div>';
    markField(k);
  }
  function markField(k) {
    var st = document.querySelector('[data-st="' + k + '"]'), changed = !same(P.cur[k], P.orig[k]);
    st.innerHTML = changed ? '<span class="chg">수정함</span><button type="button" class="link small" data-reset="' + k + '">원래대로</button>' : "";
    st.parentNode.classList.toggle("changed", changed);
  }

  function renderLinks() {
    var types = C.LINK_TYPES || [];
    $("links").innerHTML = P.cur.links.length ? P.cur.links.map(function (l, i) {
      return '<div class="link-row" data-li="' + i + '">' +
        '<select data-l="type"><option value="">종류</option>' + types.map(function (t) { return "<option" + (t === l.type ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("") + "</select>" +
        '<input data-l="title" placeholder="이름 (예: 고교 선택 설명회 영상)" value="' + esc(l.title) + '">' +
        '<input data-l="url" type="url" placeholder="https://" value="' + esc(l.url) + '">' +
        '<button type="button" class="x" data-ldel="' + i + '" aria-label="링크 빼기">×</button></div>';
    }).join("") : '<p class="muted small">등록된 링크가 없습니다.</p>';
  }

  function photoTile(src, attr, badge) {
    return '<div class="ph"><img src="' + esc(src) + '" alt="">' + (badge ? '<span class="ph-new">' + badge + "</span>" : "") +
      '<button type="button" class="x" ' + attr + ' aria-label="사진 빼기">×</button></div>';
  }
  function renderPhotos() {
    var main = P.newMain ? P.newMain.data : P.cur.photo;
    $("photoMain").innerHTML = main
      ? photoTile(main, 'data-pdel="main"', P.newMain ? "새 사진" : "")
      : '<div class="ph empty">사진 없음</div>';
    var tiles = P.cur.photos.map(function (u, i) { return photoTile(u, 'data-pdel="old:' + i + '"', ""); })
      .concat(P.newPhotos.map(function (p, i) { return photoTile(p.data, 'data-pdel="new:' + i + '"', "새 사진"); }));
    $("photos").innerHTML = tiles.length ? tiles.join("") : '<div class="ph empty">사진 없음</div>';
    $("photosBtn").hidden = P.cur.photos.length + P.newPhotos.length >= MAX_PHOTOS;
    $("maxPhotos").textContent = MAX_PHOTOS;
  }

  function checks(name, opts, on, type) {
    return opts.map(function (o) {
      return '<label class="ck"><input type="' + type + '" name="' + name + '" value="' + esc(o) + '"' + (on.indexOf(o) >= 0 ? " checked" : "") + "><span>" + esc(o) + "</span></label>";
    }).join("");
  }
  function renderChecks(el, name, opts, on, type) { el.innerHTML = checks(name, opts, on, type); }

  function topicChanged(t, i) {
    var o = t._k == null ? null : P.orig.topics.filter(function (x) { return x._k === t._k; })[0];
    return !o ? "new" : same(o, t) ? "" : "chg";
  }
  function renderTopics() {
    var areas = C.AREAS || [];
    $("maxTopics").textContent = MAX_TOPICS;
    $("topics").innerHTML = P.cur.topics.map(function (t, i) {
      var area = areas.filter(function (a) { return a.name === t.area; })[0];
      var st = topicChanged(t, i);
      return '<div class="topic-card" data-ti="' + i + '">' +
        '<div class="tc-top"><b>주제 ' + (i + 1) + "</b>" + (st === "new" ? '<span class="chg">새 주제</span>' : st ? '<span class="chg">수정함</span>' : "") +
          (area && area.page === "biz" ? '<span class="biz">비즈니스 교육 페이지에 올라갑니다</span>' : "") +
          '<button type="button" class="link small" data-tdel="' + i + '">이 주제 빼기</button></div>' +
        '<div class="fields">' +
          '<label class="field"><span>영역 <em>필수</em></span><select data-t="area"><option value="">골라 주세요</option>' +
            areas.map(function (a) { return "<option" + (a.name === t.area ? " selected" : "") + ">" + esc(a.name) + "</option>"; }).join("") + "</select></label>" +
          '<label class="field"><span>카테고리 <em>필수</em></span><select data-t="cat"' + (area ? "" : " disabled") + '><option value="">' + (area ? "골라 주세요" : "영역을 먼저 골라 주세요") + "</option>" +
            (area ? area.cats.concat(["기타"]) : []).map(function (k) { return "<option" + (k === t.cat ? " selected" : "") + ">" + esc(k) + "</option>"; }).join("") + "</select></label>" +
          '<label class="field wide"><span>주제명 <em>필수 · 원장님이 고르는 버튼에 들어갑니다 · 20자 이내</em></span><input data-t="name" maxlength="24" placeholder="예) 고교 선택의 정석" value="' + esc(t.name) + '"></label>' +
          '<label class="field wide"><span>한 줄 소개 <em>50자 이내</em></span><input data-t="intro" maxlength="60" placeholder="예) 우리 아이 성향과 진로로 결정하는 고교 선택" value="' + esc(t.intro) + '"></label>' +
          '<label class="field wide"><span>핵심 내용 <em>한 줄에 하나씩 2~3줄</em></span><textarea data-t="points" rows="3" placeholder="예) 특목·자사·일반고 장단점 비교">' + esc(t.points.join("\n")) + "</textarea></label>" +
          '<div class="field wide"><span>대상 <em>필수 · 여러 개 선택</em></span><div class="checks">' + checks("t" + i + "targets", C.TOPIC_TARGETS || [], t.targets, "checkbox").replace(/<input /g, '<input data-t="targets" ') + "</div></div>" +
          '<div class="field wide"><span>적합 시기 <em>여러 개 선택</em></span><div class="checks">' + checks("t" + i + "seasons", C.SEASONS || [], t.seasons, "checkbox").replace(/<input /g, '<input data-t="seasons" ') + "</div></div>" +
          '<div class="field"><span>소요 시간</span><div class="checks">' + checks("t" + i + "time", C.DURATIONS || [], [t.time], "radio").replace(/<input /g, '<input data-t="time" ') + "</div></div>" +
          '<div class="field"><span>진행 방식 <em>여러 개 선택</em></span><div class="checks">' + checks("t" + i + "formats", C.FORMATS || [], t.formats, "checkbox").replace(/<input /g, '<input data-t="formats" ') + "</div></div>" +
          '<label class="field"><span>적정 인원 <em>선택</em></span><input data-t="size" placeholder="예) 20명 이내 (워크숍)" value="' + esc(t.size) + '"></label>' +
          '<label class="field"><span>준비물·추가 비용 <em>선택</em></span><input data-t="extra" placeholder="예) 워크시트 제공, 인쇄는 학원" value="' + esc(t.extra) + '"></label>' +
        "</div></div>";
    }).join("");
    $("addTopic").hidden = P.cur.topics.length >= MAX_TOPICS;
    $("topicMsg").textContent = P.cur.topics.length > MAX_TOPICS
      ? "예전 자료에서 주제 " + P.cur.topics.length + "개를 가져왔어요. 대표로 보여 줄 " + MAX_TOPICS + "개만 남기고 나머지는 「이 주제 빼기」로 빼 주세요." : "";
  }

  function topicOk(t) { return t.area && t.cat && t.name.trim() && t.targets.length; }
  function renderProgress() {
    var changed = Object.keys(FIELDS).filter(function (k) { return !same(P.cur[k], P.orig[k]); }).length;
    var okTopics = P.cur.topics.filter(topicOk).length;
    var photoN = P.cur.photos.length + P.newPhotos.length;
    var items = [
      { ok: true, t: "소개 문구", s: changed ? changed + "곳 수정" : "그대로" },
      { ok: true, t: "관련 링크", s: P.cur.links.filter(function (l) { return l.url; }).length + "개" },
      { ok: !!(P.newMain || P.cur.photo), t: "사진", s: (P.newMain || P.cur.photo ? "프로필 있음" : "프로필 없음") + " · 현장 " + photoN + "장" },
      { ok: okTopics > 0 && okTopics === P.cur.topics.length, t: "대표 주제", s: P.cur.topics.length ? okTopics + " / " + P.cur.topics.length + "개 완료" : "1개 이상 필요" },
      { ok: P.cur.regions.length > 0, t: "진행 지역", s: P.cur.regions.length ? P.cur.regions.join(", ") : "선택 필요" }
    ];
    $("progress").innerHTML = items.map(function (x) {
      return '<li class="' + (x.ok ? "ok" : "") + '"><b>' + x.t + "</b><span>" + esc(x.s) + "</span></li>";
    }).join("");
  }

  /* ---------- 사진 줄이기 (긴 변 기준) ---------- */
  function shrink(file, maxSide) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error("사진 파일만 올릴 수 있습니다.")); return; }
      if (file.size > 15 * 1024 * 1024) { reject(new Error("15MB가 넘는 사진은 올릴 수 없습니다.")); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, maxSide / Math.max(img.width, img.height));
        var cv = document.createElement("canvas");
        cv.width = Math.round(img.width * s);
        cv.height = Math.round(img.height * s);
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve({ data: cv.toDataURL("image/jpeg", 0.88), name: file.name.replace(/\.[^.]+$/, "") + ".jpg" });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("사진을 읽지 못했습니다.")); };
      img.src = url;
    });
  }

  /* ---------- 제출 ---------- */
  function validate() {
    var errs = [];
    each(document.querySelectorAll(".topic-card"), function (el) { el.classList.remove("err"); });
    $("topicMsg").textContent = "";
    if (!P.cur.topics.length) errs.push({ el: $("secTopics"), msg: "대표 주제를 1개 이상 적어 주세요." });
    if (P.cur.topics.length > MAX_TOPICS) errs.push({ el: $("secTopics"), msg: "대표 주제는 " + MAX_TOPICS + "개까지만 남겨 주세요. (지금 " + P.cur.topics.length + "개)" });
    P.cur.topics.forEach(function (t, i) {
      if (!topicOk(t)) {
        var el = document.querySelector('[data-ti="' + i + '"]');
        el.classList.add("err");
        errs.push({ el: el, msg: "주제 " + (i + 1) + "의 영역·카테고리·주제명·대상을 채워 주세요." });
      }
    });
    if (!P.cur.regions.length) errs.push({ el: $("regions"), msg: "진행 가능 지역을 골라 주세요." });
    if (errs.length) {
      if (errs[0].el.closest("#secTopics")) $("topicMsg").textContent = errs[0].msg;
      errs[0].el.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(errs[0].msg);
    }
    return !errs.length;
  }

  function payload() {
    var c = clone(P.cur);
    c.links = c.links.filter(function (l) { return l.url.trim(); });
    c.topics.forEach(function (t) { t.name = t.name.trim(); t.intro = t.intro.trim(); });
    delete c.branding;
    return c;
  }

  function submit() {
    if (P.sending || !validate()) return;
    P.sending = true;
    var btns = [$("submitBtn"), $("submitSide")];
    function label(t) { btns.forEach(function (b) { b.disabled = !!t; b.textContent = t || "제출하기"; }); }
    var data = payload(), uploads = [];
    if (P.newMain) uploads.push({ kind: "main", f: P.newMain });
    P.newPhotos.forEach(function (p) { uploads.push({ kind: "scene", f: p }); });

    var chain = Promise.resolve();
    if (!DEMO) {
      uploads.forEach(function (u, i) {
        chain = chain.then(function () {
          label("사진 올리는 중 " + (i + 1) + " / " + uploads.length);
          return post({ action: "profileUpload", phone: P.phone, kind: u.kind, name: u.f.name, data: u.f.data.split(",")[1] }).then(function (r) {
            if (!r.ok) throw new Error(r.error || "사진을 올리지 못했습니다.");
            if (u.kind === "main") data.photo = r.url; else data.photos.push(r.url);
          });
        });
      });
    }
    chain.then(function () {
      label("제출하는 중…");
      return DEMO ? new Promise(function (r) { setTimeout(function () { r({ ok: true }); }, 500); })
        : post({ action: "profileSubmit", phone: P.phone, data: data });
    }).then(function (r) {
      if (!r.ok) throw new Error(r.error || "제출하지 못했습니다.");
      clearDraft();
      $("editView").hidden = true;
      $("saveState").hidden = true;
      $("doneView").hidden = false;
      window.scrollTo(0, 0);
    }).catch(function (e) {
      toast(e.message || "제출하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }).then(function () { P.sending = false; label(""); });
  }

  /* ---------- 이벤트 ---------- */
  function bind() {
    $("phone").addEventListener("input", function (e) {   // 010-0000-0000 모양으로
      var d = digits(e.target.value).slice(0, 11);
      e.target.value = d.length > 7 ? d.slice(0, 3) + "-" + d.slice(3, d.length - 4) + "-" + d.slice(-4) : d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d;
    });
    $("loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var d = digits($("phone").value), msg = $("loginMsg"), btn = $("loginBtn");
      msg.textContent = "";
      if (d.length < 10) { msg.textContent = "휴대폰 번호를 정확히 입력해 주세요."; return; }
      btn.disabled = true;
      btn.textContent = "확인하는 중…";
      P.phone = d;
      login(d).then(function (r) {
        if (!r.ok) throw new Error(r.error);
        start(r);
      }).catch(function (err) {
        msg.textContent = (err && err.message) || "확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      }).then(function () { btn.disabled = false; btn.textContent = "들어가기"; });
    });

    var form = $("pf");
    form.addEventListener("input", function (e) {
      var t = e.target;
      if (t.dataset.in) {
        var k = t.dataset.in;
        P.cur[k] = FIELDS[k].kind === "lines" ? arr(t.value) : t.value;
        markField(k);
      } else if (t.dataset.l) {
        P.cur.links[+t.closest("[data-li]").dataset.li][t.dataset.l] = t.value;
      } else if (t.dataset.t && t.type !== "checkbox" && t.type !== "radio" && t.tagName !== "SELECT") {
        var tp = P.cur.topics[+t.closest("[data-ti]").dataset.ti];
        tp[t.dataset.t] = t.dataset.t === "points" ? arr(t.value) : t.value;
      } else if (t.id === "f_memo") {
        P.cur.memo = t.value;
      } else return;
      renderProgress();
      saveDraft();
    });
    form.addEventListener("change", function (e) {
      var t = e.target;
      if (t.dataset.t && (t.type === "checkbox" || t.type === "radio" || t.tagName === "SELECT")) {
        var card = t.closest("[data-ti]"), tp = P.cur.topics[+card.dataset.ti], k = t.dataset.t;
        if (t.type === "checkbox") tp[k] = Array.prototype.map.call(card.querySelectorAll('[data-t="' + k + '"]:checked'), function (x) { return x.value; });
        else tp[k] = t.value;
        if (k === "area") { tp.cat = ""; renderTopics(); }
        else topicBadge(card);
      } else if (t.name === "region") {
        P.cur.regions = Array.prototype.map.call(document.querySelectorAll('[name="region"]:checked'), function (x) { return x.value; });
        if (P.cur.regions.indexOf("전국") >= 0 && t.value === "전국" && t.checked) {   // 전국을 고르면 나머지는 끔
          P.cur.regions = ["전국"];
          renderChecks($("regions"), "region", C.REGIONS || [], P.cur.regions, "checkbox");
        } else if (t.value !== "전국" && t.checked && P.cur.regions.indexOf("전국") >= 0) {
          P.cur.regions = P.cur.regions.filter(function (x) { return x !== "전국"; });
          renderChecks($("regions"), "region", C.REGIONS || [], P.cur.regions, "checkbox");
        }
      } else if (t.name === "twice") {
        P.cur.twice = t.value;
      } else if (t.dataset.l === "type") {
        P.cur.links[+t.closest("[data-li]").dataset.li].type = t.value;
      } else return;
      renderProgress();
      saveDraft();
    });
    form.addEventListener("focusout", function (e) {   // 주제 칸을 다 쓰고 나가면 「수정함」 표시를 다시 계산
      var card = e.target.closest && e.target.closest("[data-ti]");
      if (card) topicBadge(card);
    });
    form.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.reset) {
        var k = b.dataset.reset;
        P.cur[k] = clone(P.orig[k]);
        renderField(k);
      } else if (b.dataset.ldel != null) {
        P.cur.links.splice(+b.dataset.ldel, 1);
        renderLinks();
      } else if (b.dataset.tdel != null) {
        var i = +b.dataset.tdel, t = P.cur.topics[i];
        if ((t.name || t.area) && !confirmDel(t)) return;
        P.cur.topics.splice(i, 1);
        renderTopics();
      } else if (b.dataset.pdel) {
        var p = b.dataset.pdel.split(":");
        if (p[0] === "main") { if (P.newMain) P.newMain = null; else P.cur.photo = ""; }
        else if (p[0] === "old") P.cur.photos.splice(+p[1], 1);
        else P.newPhotos.splice(+p[1], 1);
        renderPhotos();
      } else return;
      renderProgress();
      saveDraft();
    });
    $("addLink").addEventListener("click", function () {
      P.cur.links.push({ type: "", title: "", url: "" });
      renderLinks();
      var rows = $("links").querySelectorAll("[data-li]");
      rows[rows.length - 1].querySelector("select").focus();
    });
    $("addTopic").addEventListener("click", function () {
      if (P.cur.topics.length >= MAX_TOPICS) return;
      P.cur.topics.push(emptyTopic());
      renderTopics();
      renderProgress();
      var cards = $("topics").querySelectorAll("[data-ti]");
      cards[cards.length - 1].scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("photoMainIn").addEventListener("change", function (e) {
      var f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      shrink(f, 2400).then(function (p) { P.newMain = p; renderPhotos(); renderProgress(); }).catch(function (err) { toast(err.message); });
    });
    $("photosIn").addEventListener("change", function (e) {
      var files = Array.prototype.slice.call(e.target.files);
      e.target.value = "";
      var room = MAX_PHOTOS - P.cur.photos.length - P.newPhotos.length;
      if (files.length > room) toast("현장 사진은 " + MAX_PHOTOS + "장까지 올릴 수 있어 " + room + "장만 올렸습니다.");
      Promise.all(files.slice(0, room).map(function (f) { return shrink(f, 1600); })).then(function (ps) {
        P.newPhotos = P.newPhotos.concat(ps);
        renderPhotos();
        renderProgress();
      }).catch(function (err) { toast(err.message); });
    });
    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });
    $("submitSide").addEventListener("click", submit);
    $("again").addEventListener("click", function () {
      $("doneView").hidden = true;
      $("loginView").hidden = false;
      $("phone").focus();
    });
    window.addEventListener("beforeunload", function (e) {   // 고른 사진은 임시 저장되지 않으므로 나갈 때 한 번 묻기
      if (!$("editView").hidden && (P.newMain || P.newPhotos.length) && !P.sending) { e.preventDefault(); e.returnValue = ""; }
    });
  }
  function topicBadge(card) {
    var i = +card.dataset.ti, st = topicChanged(P.cur.topics[i], i);
    var top = card.querySelector(".tc-top"), badge = top.querySelector(".chg");
    if (badge) badge.remove();
    if (st) top.querySelector("b").insertAdjacentHTML("afterend", '<span class="chg">' + (st === "new" ? "새 주제" : "수정함") + "</span>");
  }
  function confirmDel(t) {
    return window.confirm("「" + (t.name || "이 주제") + "」를 빼시겠어요? 제출하면 소개 페이지에서도 빠집니다.");
  }

  $("demoBar").hidden = !DEMO;
  bind();
})();
