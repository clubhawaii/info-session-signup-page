// 강연자 정보 입력 — 휴대폰 번호로 들어와 지금 등록된 소개·대표 주제를 보면서 고쳐 제출
// 제출 내용은 시트 「프로필 제출」에 쌓이고, 본사가 확인 후 「강연자」·「대표 주제」에 반영합니다.
(function () {
  "use strict";

  var C = window.APP_CONFIG || {};
  var DEMO = !C.APPS_SCRIPT_URL;
  var MAX_TOPICS = C.MAX_TOPICS || 5, MAX_PHOTOS = C.MAX_PHOTOS || 5, SLOGAN_MAX = C.SLOGAN_MAX || 50;
  var AGREES = ["agreePrivacy", "agreePublish", "agreePriority"];
  var ETC = "기타";

  // 칸 정의 — 슬로건은 한 줄 글, 경력은 한 줄에 하나씩(배열)
  var FIELDS = {
    slogan: { kind: "line", ph: "예) 분석과 전략, 데이터로 승부한다" },
    history: { kind: "lines", rows: 7, ph: "현 ○○ 입시연구소 소장\n전 ○○학원 대표원장\n저서 『○○○○』\n○○방송 출연" }
  };

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
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : String(v || "").split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function areaOf(name) { return (C.AREAS || []).filter(function (a) { return a.name === name; })[0]; }

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
  function emptyTopic() { return { area: "", cats: [], catEtc: "", name: "", intro: "", points: [], targets: [], seasons: [] }; }
  // 카테고리: 영역 목록에 있는 것은 체크로, 없는 것은 「기타」 + 직접 입력으로
  function readTopic(t, i) {
    var x = emptyTopic(), area = areaOf(t.area), known = area ? area.cats : [];
    x.area = String(t.area || "");
    x.name = String(t.name || "");
    x.intro = String(t.intro || "");
    x.points = arr(t.points);
    x.targets = list(t.targets);
    x.seasons = list(t.seasons);
    list(t.cats || t.cat).forEach(function (k) {
      if (known.indexOf(k) >= 0) x.cats.push(k);
      else if (k !== ETC) { if (x.cats.indexOf(ETC) < 0) x.cats.push(ETC); x.catEtc = x.catEtc ? x.catEtc + ", " + k : k; }
    });
    x._k = i;   // 처음 받은 주제 표시 — 「수정함」 비교용 (서버는 이 칸을 버림)
    return x;
  }
  function normalize(c) {
    return {
      name: c.name || "", title: c.title || "",
      slogan: arr(c.slogan).concat(c.sub ? [c.sub] : []).join(" "),
      history: arr(c.history).concat(arr(c.extra), arr(c.works)),   // 예전 「주요 이력·저서」 칸은 경력 아래로 합침
      links: (c.links || []).map(function (l) { return { type: l.type || "", url: l.url || "" }; }),
      photo: c.photo || "", photos: arr(c.photos),
      agreePrivacy: false, agreePublish: false, agreePriority: false,   // 동의는 제출할 때마다 다시 받음
      topics: (c.topics || []).map(readTopic)
    };
  }
  function login(phone) {
    if (DEMO) {
      var d = window.LOCAL_DATA || window.SAMPLE_DATA || { coaches: [] };
      var hit = d.coaches.filter(function (c) {   // 번호가 여러 개면 쉼표로 구분
        return String(c.phone || "").split(",").some(function (p) { return digits(p) === phone; });
      })[0] || d.coaches[0];
      return Promise.resolve(hit ? { ok: true, coach: hit } : { ok: false, error: "예시 데이터가 없어요." });
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
    AGREES.forEach(function (id) { $(id).checked = P.cur[id]; });
    $("titleLine").hidden = !P.orig.title;
    $("titleText").textContent = P.orig.title;
    renderProgress();
  }

  function renderField(k) {
    var f = FIELDS[k], box = document.querySelector('[data-f="' + k + '"]');
    if (!box.dataset.head) box.dataset.head = box.innerHTML;   // 제목·안내 문구는 처음 것 그대로
    box.innerHTML = box.dataset.head +
      (f.kind === "line"
        ? '<input data-in="' + k + '" maxlength="' + (SLOGAN_MAX - 1) + '" placeholder="' + esc(f.ph) + '" value="' + esc(P.cur[k]) + '">'
        : '<textarea data-in="' + k + '" rows="' + Math.max(f.rows, P.cur[k].length) + '" placeholder="' + esc(f.ph) + '">' + esc(P.cur[k].join("\n")) + "</textarea>") +
      '<div class="fstate" data-st="' + k + '"></div>';
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
        '<select data-l="type"><option value="">구분</option>' + types.map(function (t) { return "<option" + (t === l.type ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("") + "</select>" +
        '<input data-l="url" type="url" placeholder="주소를 붙여 넣어 주세요 (예: https://youtu.be/…)" value="' + esc(l.url) + '">' +
        '<button type="button" class="x" data-ldel="' + i + '" aria-label="링크 빼기">×</button></div>';
    }).join("") : '<p class="muted small">아직 등록된 링크가 없어요. 「+ 링크 추가」를 눌러 넣어 주세요.</p>';
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

  function checks(attr, opts, on, type) {
    return opts.map(function (o) {
      return '<label class="ck"><input type="' + type + '" ' + attr + ' value="' + esc(o) + '"' + (on.indexOf(o) >= 0 ? " checked" : "") + "><span>" + esc(o) + "</span></label>";
    }).join("");
  }

  function topicChanged(t) {
    var o = t._k == null ? null : P.orig.topics.filter(function (x) { return x._k === t._k; })[0];
    return !o ? "new" : same(o, t) ? "" : "chg";
  }
  function renderTopics() {
    var areas = C.AREAS || [];
    $("maxTopics").textContent = MAX_TOPICS;
    $("topics").innerHTML = P.cur.topics.map(function (t, i) {
      var area = areaOf(t.area), st = topicChanged(t);
      return '<div class="topic-card" data-ti="' + i + '">' +
        '<div class="tc-top"><b>설명회 ' + (i + 1) + "</b>" + (st === "new" ? '<span class="chg">새 설명회</span>' : st ? '<span class="chg">수정함</span>' : "") +
          (area && area.page === "biz" ? '<span class="biz">비즈니스 교육 페이지에 올라가요</span>' : "") +
          '<button type="button" class="link small" data-tdel="' + i + '">이 설명회 빼기</button></div>' +
        '<div class="fields">' +
          '<label class="field wide"><span>영역 <em>필수</em></span><select data-t="area"><option value="">골라 주세요</option>' +
            areas.map(function (a) { return "<option" + (a.name === t.area ? " selected" : "") + ">" + esc(a.name) + "</option>"; }).join("") + "</select></label>" +
          '<div class="field wide"><span>카테고리 <em>필수 · 여러 개 골라도 돼요 · 「주제로 찾기」에 쓰여요</em></span>' +
            (area ? '<div class="checks">' + checks('data-t="cats"', area.cats.concat([ETC]), t.cats, "checkbox") + "</div>" +
              '<input class="cat-etc" data-t="catEtc" maxlength="30" placeholder="어떤 카테고리인지 적어 주세요 (예: 신입 강사 온보딩)" value="' + esc(t.catEtc) + '"' + (t.cats.indexOf(ETC) >= 0 ? "" : " hidden") + ">"
              : '<p class="muted small">영역을 먼저 골라 주시면 카테고리가 나와요.</p>') + "</div>" +
          '<label class="field wide"><span>설명회 이름 <em>필수 · 대상·지역·전문 분야가 드러나게 · 30자 이내</em></span><input data-t="name" maxlength="32" placeholder="예) 경기지역 특성화고 고입설명회" value="' + esc(t.name) + '"></label>' +
          '<label class="field wide"><span>한 줄 소개 <em>설명회 이름 아래로 보여요 · 50자 이내</em></span><input data-t="intro" maxlength="60" placeholder="예) 우리 아이 성향과 진로로 결정하는 고교 선택" value="' + esc(t.intro) + '"></label>' +
          '<label class="field wide"><span>핵심 내용 <em>한 줄에 하나씩 2~3줄 작성해 주세요.</em></span><textarea data-t="points" rows="3" placeholder="예) 특목·자사·일반고 장단점 비교">' + esc(t.points.join("\n")) + "</textarea></label>" +
          '<div class="field wide"><span>대상 <em>필수 · 여러 개 골라도 돼요 · 원장님의 대상 필터에 쓰여요</em></span><div class="checks">' + checks('data-t="targets"', C.TOPIC_TARGETS || [], t.targets, "checkbox") + "</div></div>" +
          '<div class="field wide"><span>적합 시기 <em>여러 개 골라도 돼요</em></span><div class="checks">' + checks('data-t="seasons"', C.SEASONS || [], t.seasons, "checkbox") + "</div></div>" +
        "</div></div>";
    }).join("");
    $("addTopic").hidden = P.cur.topics.length >= MAX_TOPICS;
    $("topicMsg").textContent = P.cur.topics.length > MAX_TOPICS
      ? "예전 자료에서 설명회 " + P.cur.topics.length + "개를 가져왔어요. 대표로 보여 드릴 " + MAX_TOPICS + "개만 남기고, 나머지는 「이 설명회 빼기」로 빼 주세요." : "";
  }

  function topicOk(t) {
    var cats = t.cats.filter(function (k) { return k !== ETC; }).length || (t.cats.indexOf(ETC) >= 0 && t.catEtc.trim());
    return t.area && cats && t.name.trim() && t.targets.length;
  }
  function hasPhoto() { return !!(P.newMain || P.cur.photo); }
  function agreedAll() { return AGREES.every(function (id) { return P.cur[id]; }); }
  function renderProgress() {
    var changed = Object.keys(FIELDS).filter(function (k) { return !same(P.cur[k], P.orig[k]); }).length;
    var okTopics = P.cur.topics.filter(topicOk).length;
    var photoN = P.cur.photos.length + P.newPhotos.length;
    var items = [
      { ok: true, t: "소개 내용", s: changed ? changed + "곳 수정" : "그대로" },
      { ok: true, t: "관련 링크", s: P.cur.links.filter(function (l) { return l.url; }).length + "개" },
      { ok: hasPhoto(), t: "사진", s: (hasPhoto() ? "프로필 있음" : "프로필 사진 필요") + " · 현장 " + photoN + "장" },
      { ok: okTopics > 0 && okTopics === P.cur.topics.length && P.cur.topics.length <= MAX_TOPICS, t: "내 설명회", s: P.cur.topics.length ? okTopics + " / " + P.cur.topics.length + "개 완료" : "1개 이상 필요" },
      { ok: agreedAll(), t: "확인 및 동의", s: AGREES.filter(function (id) { return P.cur[id]; }).length + " / 3개 동의" }
    ];
    $("progress").innerHTML = items.map(function (x) {
      return '<li class="' + (x.ok ? "ok" : "") + '"><b>' + x.t + "</b><span>" + esc(x.s) + "</span></li>";
    }).join("");
  }

  /* ---------- 사진 줄이기 (긴 변 기준) ---------- */
  function shrink(file, maxSide) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) { reject(new Error("사진 파일만 올릴 수 있어요.")); return; }
      if (file.size > 15 * 1024 * 1024) { reject(new Error("15MB가 넘는 사진은 올릴 수 없어요. 조금 작은 사진으로 올려 주세요.")); return; }
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
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("사진을 읽지 못했어요. 다른 사진으로 다시 올려 주세요.")); };
      img.src = url;
    });
  }

  /* ---------- 제출 ---------- */
  function validate() {
    var errs = [];
    each(document.querySelectorAll(".topic-card, #secPhoto, #secAgree"), function (el) { el.classList.remove("err"); });
    $("topicMsg").textContent = "";
    $("agreeMsg").textContent = "";
    if (P.cur.slogan.trim().length >= SLOGAN_MAX) errs.push({ el: document.querySelector('[data-in="slogan"]'), msg: "슬로건을 " + SLOGAN_MAX + "자보다 짧게 줄여 주세요. (지금 " + P.cur.slogan.trim().length + "자예요)" });
    if (!hasPhoto()) { $("secPhoto").classList.add("err"); errs.push({ el: $("secPhoto"), msg: "프로필 사진을 올려 주세요." }); }
    if (!P.cur.topics.length) errs.push({ el: $("secTopics"), msg: "설명회를 1개 이상 적어 주세요." });
    if (P.cur.topics.length > MAX_TOPICS) errs.push({ el: $("secTopics"), msg: "설명회는 " + MAX_TOPICS + "개까지만 남겨 주세요. (지금 " + P.cur.topics.length + "개예요)" });
    P.cur.topics.forEach(function (t, i) {
      if (!topicOk(t)) {
        var el = document.querySelector('[data-ti="' + i + '"]');
        el.classList.add("err");
        errs.push({ el: el, msg: "설명회 " + (i + 1) + "의 영역·카테고리·설명회 이름·대상을 채워 주세요." });
      }
    });
    if (!agreedAll()) {
      $("secAgree").classList.add("err");
      $("agreeMsg").textContent = "세 항목 모두 동의하셔야 제출할 수 있어요.";
      errs.push({ el: $("secAgree"), msg: "확인 및 동의 세 항목에 모두 체크해 주세요." });
    }
    if (errs.length) {
      if (errs[0].el.closest("#secTopics")) $("topicMsg").textContent = errs[0].msg;
      errs[0].el.scrollIntoView({ behavior: "smooth", block: "center" });
      toast(errs[0].msg);
    }
    return !errs.length;
  }

  function payload() {
    var c = clone(P.cur);
    c.slogan = c.slogan.trim() ? [c.slogan.trim()] : [];   // 시트에는 한 줄로
    c.links = c.links.filter(function (l) { return l.url.trim(); });
    // 카테고리: 「기타」는 직접 적은 이름으로 바꿔서 보냄
    c.topics = c.topics.map(function (t) {
      var cats = t.cats.filter(function (k) { return k !== ETC; });
      if (t.cats.indexOf(ETC) >= 0 && t.catEtc.trim()) cats = cats.concat(t.catEtc.split(",").map(function (s) { return s.trim(); }).filter(Boolean));
      return { area: t.area, cats: cats, name: t.name.trim(), intro: t.intro.trim(), points: t.points, targets: t.targets, seasons: t.seasons };
    });
    delete c.title;   // 직함은 본사가 정함 — 보내지 않음
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
            if (!r.ok) throw new Error(r.error || "사진을 올리지 못했어요. 잠시 후 다시 눌러 주세요.");
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
      if (!r.ok) throw new Error(r.error || "제출하지 못했어요. 잠시 후 다시 눌러 주세요.");
      clearDraft();
      $("editView").hidden = true;
      $("doneView").hidden = false;
      window.scrollTo(0, 0);
    }).catch(function (e) {
      toast(e.message || "제출하지 못했어요. 잠시 후 다시 눌러 주세요.");
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
        msg.textContent = (err && err.message) || "확인하지 못했어요. 잠시 후 다시 시도해 주세요.";
      }).then(function () { btn.disabled = false; btn.textContent = "들어가기"; });
    });

    var form = $("pf");
    form.addEventListener("input", function (e) {
      var t = e.target;
      if (t.dataset.in) {
        P.cur[t.dataset.in] = FIELDS[t.dataset.in].kind === "line" ? t.value : arr(t.value);
        markField(t.dataset.in);
      } else if (t.dataset.l === "url") {
        P.cur.links[+t.closest("[data-li]").dataset.li].url = t.value;
      } else if (t.dataset.t && t.type !== "checkbox" && t.tagName !== "SELECT") {
        var tp = P.cur.topics[+t.closest("[data-ti]").dataset.ti];
        tp[t.dataset.t] = t.dataset.t === "points" ? arr(t.value) : t.value;
      } else return;
      renderProgress();
      saveDraft();
    });
    form.addEventListener("change", function (e) {
      var t = e.target;
      if (t.dataset.t && (t.type === "checkbox" || t.tagName === "SELECT")) {
        var card = t.closest("[data-ti]"), tp = P.cur.topics[+card.dataset.ti], k = t.dataset.t;
        if (t.type === "checkbox") tp[k] = Array.prototype.map.call(card.querySelectorAll('[data-t="' + k + '"]:checked'), function (x) { return x.value; });
        else tp[k] = t.value;
        if (k === "area") {   // 영역을 바꾸면 그 영역에 없는 카테고리는 뺌
          var area = areaOf(tp.area);
          tp.cats = tp.cats.filter(function (c) { return c === ETC || (area && area.cats.indexOf(c) >= 0); });
          renderTopics();
        } else if (k === "cats") {
          var etc = card.querySelector('[data-t="catEtc"]');
          etc.hidden = tp.cats.indexOf(ETC) < 0;
          if (!etc.hidden && t.value === ETC) etc.focus();
          topicBadge(card);
        } else topicBadge(card);
      } else if (AGREES.indexOf(t.id) >= 0) {
        P.cur[t.id] = t.checked;
        if (agreedAll()) { $("secAgree").classList.remove("err"); $("agreeMsg").textContent = ""; }
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
      P.cur.links.push({ type: "", url: "" });
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
      shrink(f, 2400).then(function (p) {
        P.newMain = p;
        $("secPhoto").classList.remove("err");
        renderPhotos();
        renderProgress();
      }).catch(function (err) { toast(err.message); });
    });
    $("photosIn").addEventListener("change", function (e) {
      var files = Array.prototype.slice.call(e.target.files);
      e.target.value = "";
      var room = MAX_PHOTOS - P.cur.photos.length - P.newPhotos.length;
      if (files.length > room) toast("현장 사진은 " + MAX_PHOTOS + "장까지라 " + room + "장만 올렸어요.");
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
    var st = topicChanged(P.cur.topics[+card.dataset.ti]);
    var top = card.querySelector(".tc-top"), badge = top.querySelector(".chg");
    if (badge) badge.remove();
    if (st) top.querySelector("b").insertAdjacentHTML("afterend", '<span class="chg">' + (st === "new" ? "새 주제" : "수정함") + "</span>");
  }
  function confirmDel(t) {
    return window.confirm("「" + (t.name || "이 주제") + "」를 빼시겠어요? 제출하시면 소개 페이지에서도 빠져요.");
  }

  $("demoBar").hidden = !DEMO;
  each(document.querySelectorAll(".slogan-max"), function (el) { el.textContent = SLOGAN_MAX; });
  each(document.querySelectorAll(".retention-pf"), function (el) { el.textContent = C.COACH_RETENTION || ""; });
  bind();
})();
