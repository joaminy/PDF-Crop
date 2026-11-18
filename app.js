/* PDF 여백 자르기 — 화면 */
(function () {
  'use strict';
  var C = window.PdfCropCore;
  // 'artifact' = Claude 안에서 여는 버전, 'pwa' = 휴대폰에 설치하는 앱 버전
  var PLATFORM = document.documentElement.getAttribute('data-platform') || 'artifact';
  var IS_PWA = PLATFORM === 'pwa';
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var VENDOR = 'vendor/';
  var LOCAL_KEY = 'pdfcrop.settings.v1';
  var A4G = { view: { x0: 0, y0: 0, x1: 595.2756, y1: 841.8898 }, rotation: 0, userUnit: 1 };
  var SAMPLE_GEOMS = [A4G, A4G, A4G, A4G];
  var RULE_COLORS = 6;

  var ICON = {
    caret: '<svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V6a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  var $ = function (s, el) { return (el || document).querySelector(s); };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  /** 숫자 뒤 목적격 조사(을/를) */
  function eulReul(n) {
    var d = n % 10;
    if (d === 0) return '을';
    return [2, 4, 5, 9].indexOf(d) !== -1 ? '를' : '을';
  }
  function ruleColor(idx) { return 'var(--r' + ((idx % RULE_COLORS) + 1) + ')'; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtBytes(n) { return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB'; }
  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 0); }); }); }
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej({ code: 'timeout' }); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  /* ---------- 상태 ---------- */

  var state = {
    settings: null,
    isDefault: true,
    files: [],
    currentFileId: null,
    page: 1,
    expanded: {},
    previewMode: 'plan',
    results: null,
    running: false,
    plan: null
  };

  function newRule(pages) {
    return { id: C.uid('r'), label: '', pages: pages == null ? '' : pages, top: '0', bottom: '0', left: '0', right: '0' };
  }
  function defaultSettings() {
    var c1 = {
      id: C.uid('c'), name: '예시: 시험지',
      rules: [
        { id: C.uid('r'), label: '본문', pages: '전체', top: '4', bottom: '2', left: '3', right: '3' },
        { id: C.uid('r'), label: '표지', pages: '1', top: '0', bottom: '0', left: '0', right: '0' }
      ]
    };
    var c2 = {
      id: C.uid('c'), name: '예시: 스캔한 책',
      rules: [
        { id: C.uid('r'), label: '오른쪽 면', pages: '홀수', top: '1.5', bottom: '2', left: '1', right: '2' },
        { id: C.uid('r'), label: '왼쪽 면', pages: '짝수', top: '1.5', bottom: '2', left: '2', right: '1' }
      ]
    };
    return { categories: [c1, c2], selectedId: c1.id, updatedAt: 0 };
  }
  function currentCat() {
    var cats = state.settings.categories;
    for (var i = 0; i < cats.length; i++) if (cats[i].id === state.settings.selectedId) return cats[i];
    state.settings.selectedId = cats[0].id;
    return cats[0];
  }
  function fileById(id) {
    for (var i = 0; i < state.files.length; i++) if (state.files[i].id === id) return state.files[i];
    return null;
  }
  function currentFile() { return fileById(state.currentFileId); }
  function previewSource() {
    var f = currentFile();
    if (!f) return { kind: 'sample', geoms: SAMPLE_GEOMS };
    if (f.status === 'loading') return { kind: 'loading', file: f, geoms: [] };
    if (f.status === 'error') return { kind: 'error', file: f, geoms: [] };
    return { kind: 'file', file: f, geoms: f.geoms };
  }
  function rulesSig() {
    var cat = currentCat();
    return cat.id + '|' + JSON.stringify(cat.rules.map(function (r) { return [r.pages, r.top, r.bottom, r.left, r.right]; }));
  }

  /* ---------- 플랫폼 기능 (저장·다운로드) ---------- */

  var capCache = {};
  function cap(name) {
    if (IS_PWA) return Promise.resolve(null);
    if (!capCache[name]) {
      capCache[name] = (async function () {
        try {
          if (window.claude && typeof window.claude.use === 'function') return await window.claude.use(name);
        } catch (e) { /* 없음 */ }
        return null;
      })();
    }
    return capCache[name];
  }

  async function saveFile(filename, blob) {
    var dl = await cap('downloads');
    if (dl) {
      try {
        await dl.save({ filename: filename, data: blob });
        return { ok: true };
      } catch (e) {
        var code = e && e.code;
        if (code === 'declined') return { ok: false, msg: '저장을 취소했습니다.' };
        if (code === 'rate_limited') return { ok: false, msg: '다른 저장 창이 아직 열려 있습니다. 그 창을 닫은 뒤 다시 눌러 주세요.' };
        if (code === 'too_large') return { ok: false, msg: '파일이 너무 커서 이 화면에서는 저장할 수 없습니다.' };
        return { ok: false, msg: '이 화면에서는 파일을 저장할 수 없습니다. 브라우저에서 이 페이지를 열어 다시 시도해 주세요.' };
      }
    }
    var topLevel = false;
    try { topLevel = window.top === window.self; } catch (e) { topLevel = false; }
    if (topLevel) {
      var url = URL.createObjectURL(blob);
      var a = h('a', { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return { ok: true };
    }
    return { ok: false, msg: '이 화면에서는 파일을 저장할 수 없습니다. 브라우저에서 이 페이지를 열어 다시 시도해 주세요.' };
  }

  function canShareFiles(files) {
    try { return !!(IS_PWA && navigator.share && navigator.canShare && navigator.canShare({ files: files })); } catch (e) { return false; }
  }
  var SHARE_PDF = canShareFiles([new File([new Uint8Array([37])], 'x.pdf', { type: 'application/pdf' })]);
  /** 공유 시트를 연다. 반드시 클릭 처리 안에서 기다림 없이 바로 불러야 한다. */
  async function shareFiles(files) {
    try {
      await navigator.share({ files: files });
      return { ok: true };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false };
      return { ok: false, msg: '공유하지 못했습니다. 잠시 뒤 다시 눌러 주세요.' };
    }
  }
  /** iPhone 앱에서는 공유 시트(‘파일에 저장’ 포함)로, 그 밖에는 내려받기로 파일을 건넨다. */
  function deliverFile(filename, blob) {
    if (IS_PWA && IS_IOS) {
      var f = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      if (canShareFiles([f])) return shareFiles([f]);
    }
    return saveFile(filename, blob);
  }
  function pdfFile(it) { return new File([it.bytes], it.name, { type: 'application/pdf' }); }

  /* ---------- 설정 보관 ---------- */

  var store = { mode: 'memory', ref: null, saving: false, again: false, timer: null, error: null, edited: false, savedAt: 0, retried: false, pending: false };

  function localOk() {
    try { localStorage.setItem('__pdfcrop', '1'); localStorage.removeItem('__pdfcrop'); return true; } catch (e) { return false; }
  }
  function readLocal() {
    try { var raw = localStorage.getItem(LOCAL_KEY); return raw ? C.sanitizeSettings(JSON.parse(raw)) : null; } catch (e) { return null; }
  }
  function writeLocal(data) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function snapshot() {
    return clone({ v: 1, categories: state.settings.categories, selectedId: state.settings.selectedId, updatedAt: Date.now() });
  }

  async function initStorage() {
    var local = readLocal();
    store.mode = localOk() ? 'local' : 'memory';
    renderStoreStatus();
    if (IS_PWA) {
      // 브라우저가 저장 공간을 임의로 비우지 않도록 요청 (거절되어도 동작에는 지장 없음)
      try {
        if (navigator.storage && navigator.storage.persist) {
          var already = await navigator.storage.persisted();
          if (!already) await navigator.storage.persist();
        }
      } catch (e) { /* 무시 */ }
      return;
    }
    var db = await cap('db');
    var user = await cap('user');
    if (!db || !user) { renderStoreStatus(); return; }
    var id = null;
    try { id = await user.id(); } catch (e) { id = null; }
    if (!id) { renderStoreStatus(); return; }
    var ref;
    try { ref = db.doc('data/users/' + id + '/settings'); } catch (e) { renderStoreStatus(); return; }
    store.mode = 'account-loading';
    renderStoreStatus();
    try {
      var snap = await withTimeout(ref.get(), 10000);
      store.ref = ref;
      store.mode = 'account';
      var remote = snap && snap.exists ? C.sanitizeSettings(snap.data()) : null;
      if (store.edited) {
        await saveNow();
      } else if (remote && (!local || remote.updatedAt >= local.updatedAt)) {
        state.settings = remote;
        state.isDefault = false;
        writeLocal(remote);
        var r0 = currentCat().rules[0];
        if (r0 && window.innerWidth >= 700 && state.expanded[r0.id] === undefined) state.expanded[r0.id] = true;
        renderAll();
      } else if (local) {
        await saveNow();
      }
    } catch (e) {
      store.mode = localOk() ? 'local' : 'memory';
      store.error = e && e.code === 'timeout' ? '계정 저장소에 연결하지 못했습니다.' : null;
    }
    renderStoreStatus();
  }

  function scheduleSave() {
    store.edited = true;
    state.isDefault = false;
    writeLocal(snapshot());
    clearTimeout(store.timer);
    if (store.mode === 'account' && store.ref) {
      store.timer = setTimeout(saveNow, 700);
      store.pending = true;
      renderStoreStatus('저장 중…');
    } else renderStoreStatus();
  }
  function flushSave() {
    if (store.pending) saveNow();
  }

  async function saveNow() {
    clearTimeout(store.timer);
    store.pending = false;
    var data = snapshot();
    writeLocal(data);
    if (store.mode === 'account' && store.ref) {
      if (store.saving) { store.again = true; return; }
      store.saving = true;
      try {
        await store.ref.set(data);
        store.error = null;
        store.retried = false;
      } catch (e) {
        var code = e && e.code;
        if (code === 'unavailable' && !store.retried) {
          store.retried = true;
          setTimeout(saveNow, 1500 + Math.random() * 1500);
        } else if (code === 'quota_exceeded') {
          store.error = '계정 저장 공간이 가득 찼습니다.';
        } else {
          store.mode = localOk() ? 'local' : 'memory';
          store.error = '계정에 저장하지 못했습니다.';
        }
      }
      store.saving = false;
      if (store.again) { store.again = false; return saveNow(); }
    }
    store.savedAt = Date.now();
    renderStoreStatus();
  }

  function renderStoreStatus(busy) {
    var el = $('#storeStatus');
    if (!el) return;
    var text;
    if (store.mode === 'account') text = '카테고리 설정은 내 계정에 자동으로 저장됩니다. 같은 계정으로 이 페이지를 열면 다른 기기에서도 그대로 보입니다.';
    else if (store.mode === 'account-loading') text = '계정에 저장된 설정을 불러오는 중입니다…';
    else if (store.mode === 'local' && IS_PWA) text = '카테고리 설정은 이 기기 안에만 저장되고 밖으로 보내지 않습니다. 기기를 바꾸거나 앱을 지우기 전에는 “설정 내보내기”로 백업해 두세요.';
    else if (store.mode === 'local') text = '카테고리 설정은 이 브라우저에만 저장됩니다. 다른 기기에서 쓰려면 내보낸 파일을 그 기기에서 가져오세요.';
    else text = '이 화면에서는 설정을 저장할 수 없습니다. 닫기 전에 “설정 내보내기”로 백업해 두세요.';
    if (store.error) text = store.error + ' ' + text;
    if (state.isDefault) text += ' 지금 보이는 카테고리는 예시입니다. 고치거나 새로 만들면 내 설정으로 저장됩니다.';
    if (busy) text += ' (' + busy + ')';
    el.textContent = text;
  }

  /* ---------- 라이브러리 ---------- */

  var pdfLibP = null;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!pdfLibP) {
      pdfLibP = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = VENDOR + 'pdf-lib.min.js';
        s.async = true;
        s.onload = function () { if (window.PDFLib) res(window.PDFLib); else rej(new Error('pdf-lib')); };
        s.onerror = function () { rej(new Error('pdf-lib load failed')); };
        document.head.appendChild(s);
      }).catch(function (e) { pdfLibP = null; throw e; });
    }
    return pdfLibP;
  }

  var pdfjsP = null;
  function loadPdfjs() {
    if (!pdfjsP) {
      pdfjsP = import('./' + VENDOR + 'pdfjs/pdf.min.js').then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = new URL(VENDOR + 'pdfjs/pdf.worker.min.js', document.baseURI).href;
        return lib;
      }).catch(function (e) { pdfjsP = null; throw e; });
    }
    return pdfjsP;
  }

  /*
   * pdf.js가 필요할 때 요청하는 CMap·표준 글꼴·이미지 해독기(wasm)를 넘겨준다.
   * 호스팅에서 .bcmap·.pfb·.wasm 확장자를 그대로 둘 수 없어, 각 파일을 base64로 담은 .json으로 둔다.
   */
  function b64ToBytes(s) {
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function JsonBinaryDataFactory(opts) {
    this.base = { cMapUrl: opts.cMapUrl, standardFontDataUrl: opts.standardFontDataUrl, wasmUrl: opts.wasmUrl };
  }
  JsonBinaryDataFactory.prototype.fetch = async function (req) {
    var base = this.base[req.kind];
    if (!base) throw new Error('No base URL for ' + req.kind);
    var res = await fetch(base + req.filename + '.json');
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + req.filename);
    return b64ToBytes(await res.json());
  };

  async function openPdfjs(bytes) {
    var lib = await loadPdfjs();
    var base = new URL(VENDOR + 'pdfjs/', document.baseURI).href;
    var task = lib.getDocument({
      data: bytes.slice(),
      cMapUrl: base + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: base + 'standard_fonts/',
      wasmUrl: base + 'wasm/',
      BinaryDataFactory: JsonBinaryDataFactory,
      useWorkerFetch: false,
      enableXfa: false
    });
    return task.promise;
  }
  function docFor(holder) {
    if (!holder.docP) {
      holder.docP = openPdfjs(holder.bytes);
      holder.docP.catch(function () { holder.docP = null; });
    }
    return holder.docP;
  }
  function destroyDoc(holder) {
    if (holder && holder.docP) {
      holder.docP.then(function (d) { try { d.destroy(); } catch (e) { /* 무시 */ } }, function () {});
      holder.docP = null;
    }
  }

  /* ---------- 카테고리 ---------- */

  function renderChips() {
    var box = $('#catChips');
    box.textContent = '';
    state.settings.categories.forEach(function (c) {
      box.appendChild(h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(c.id === state.settings.selectedId), 'data-id': c.id,
        text: c.name || '이름 없는 카테고리'
      }));
    });
    box.appendChild(h('button', { class: 'chip add', type: 'button', 'data-act': 'add', text: '+ 새 카테고리' }));
  }
  function renderCatHead() {
    var cat = currentCat();
    var inp = $('#catName');
    if (document.activeElement !== inp) inp.value = cat.name;
  }

  function selectCat(id) {
    if (id === state.settings.selectedId) return;
    state.settings.selectedId = id;
    var cat = currentCat();
    if (cat.rules.length && window.innerWidth >= 700) state.expanded[cat.rules[0].id] = state.expanded[cat.rules[0].id] !== false;
    renderChips();
    renderCatHead();
    renderRules();
    refresh();
    if (!state.isDefault) scheduleSave();
  }
  function addCat() {
    if (state.settings.categories.length >= C.MAX_CATEGORIES) { toast('카테고리는 ' + C.MAX_CATEGORIES + '개까지 만들 수 있습니다.'); return; }
    var n = state.settings.categories.length + 1;
    var r = newRule('전체');
    var cat = { id: C.uid('c'), name: '새 카테고리 ' + n, rules: [r] };
    state.settings.categories.push(cat);
    state.expanded[r.id] = true;
    state.settings.selectedId = cat.id;
    renderChips(); renderCatHead(); renderRules(); refresh(); scheduleSave();
    var inp = $('#catName');
    inp.focus();
    inp.select();
  }
  function dupCat() {
    if (state.settings.categories.length >= C.MAX_CATEGORIES) { toast('카테고리는 ' + C.MAX_CATEGORIES + '개까지 만들 수 있습니다.'); return; }
    var src = currentCat();
    var cat = clone(src);
    cat.id = C.uid('c');
    cat.name = (src.name + ' 사본').slice(0, 60);
    cat.rules.forEach(function (r) { r.id = C.uid('r'); });
    var cats = state.settings.categories;
    cats.splice(cats.indexOf(src) + 1, 0, cat);
    state.settings.selectedId = cat.id;
    renderChips(); renderCatHead(); renderRules(); refresh(); scheduleSave();
    toast('“' + src.name + '”의 사본을 만들었습니다.');
  }
  function delCat() {
    var cats = state.settings.categories;
    var cat = currentCat();
    var idx = cats.indexOf(cat);
    cats.splice(idx, 1);
    var filler = null;
    if (!cats.length) {
      filler = { id: C.uid('c'), name: '새 카테고리 1', rules: [newRule('전체')] };
      cats.push(filler);
    }
    var fillerSig = filler ? JSON.stringify(filler) : null;
    state.settings.selectedId = cats[Math.min(idx, cats.length - 1)].id;
    renderChips(); renderCatHead(); renderRules(); refresh(); scheduleSave();
    toast('“' + cat.name + '” 카테고리를 삭제했습니다.', {
      label: '되돌리기',
      run: function () {
        var list = state.settings.categories;
        if (filler && list.length === 1 && JSON.stringify(list[0]) === fillerSig) list.splice(0, 1);
        list.splice(Math.min(idx, list.length), 0, cat);
        state.settings.selectedId = cat.id;
        renderAll();
        scheduleSave();
      }
    });
  }

  /* ---------- 규칙 ---------- */

  var SIDE_ORDER = [['top', 'c-top'], ['left', 'c-left'], ['right', 'c-right'], ['bottom', 'c-bottom']];

  function buildRule(rule, idx, count) {
    var open = !!state.expanded[rule.id];
    var pid = 'rule-' + rule.id;
    var li = h('li', { class: 'rule', 'data-id': rule.id });
    li.style.setProperty('--rc', ruleColor(idx));

    var toggle = h('button', { class: 'rule-toggle', type: 'button', 'data-act': 'toggle', 'aria-expanded': String(open), 'aria-controls': pid + '-body' });
    toggle.innerHTML = ICON.caret;
    toggle.appendChild(h('span', { class: 'rule-title' }));
    toggle.appendChild(h('span', { class: 'rule-sum' }));
    var tools = h('div', { class: 'rule-tools' }, [
      h('button', { class: 'icon-btn', type: 'button', 'data-act': 'up', 'aria-label': '규칙 ' + (idx + 1) + ' 위로', title: '위로', disabled: idx === 0, html: ICON.up }),
      h('button', { class: 'icon-btn', type: 'button', 'data-act': 'down', 'aria-label': '규칙 ' + (idx + 1) + ' 아래로', title: '아래로', disabled: idx === count - 1, html: ICON.down }),
      h('button', { class: 'icon-btn', type: 'button', 'data-act': 'dup', 'aria-label': '규칙 ' + (idx + 1) + ' 복제', title: '복제', html: ICON.copy }),
      h('button', { class: 'icon-btn del', type: 'button', 'data-act': 'del', 'aria-label': '규칙 ' + (idx + 1) + ' 삭제', title: '삭제', html: ICON.trash })
    ]);
    li.appendChild(h('div', { class: 'rule-row' }, [toggle, tools]));

    var body = h('div', { class: 'rule-body', id: pid + '-body', hidden: !open });
    var label = h('input', { type: 'text', id: pid + '-label', 'data-k': 'label', maxlength: '40', placeholder: '예: 본문, 표지', autocomplete: 'off' });
    label.value = rule.label;
    var pages = h('input', { type: 'text', id: pid + '-pages', 'data-k': 'pages', maxlength: '200', placeholder: '예: 전체, 1, 2-5, 6-, 홀수', autocomplete: 'off', 'aria-describedby': pid + '-pmsg' });
    pages.value = rule.pages;
    body.appendChild(h('div', { class: 'field' }, [h('label', { for: pid + '-label', text: '이름 (선택)' }), label]));
    body.appendChild(h('div', { class: 'field' }, [h('label', { for: pid + '-pages', text: '적용할 페이지' }), pages, h('p', { class: 'msg', id: pid + '-pmsg' })]));

    var cross = h('div', { class: 'cross' });
    SIDE_ORDER.forEach(function (pair) {
      var k = pair[0];
      var inp = h('input', { type: 'text', inputmode: 'decimal', id: pid + '-' + k, 'data-k': k, autocomplete: 'off', 'aria-describedby': pid + '-mmsg' });
      inp.value = rule[k];
      cross.appendChild(h('div', { class: 'numf ' + pair[1] }, [
        h('label', { for: pid + '-' + k, text: C.SIDE_LABEL[k] }),
        h('div', { class: 'num' }, [inp, h('span', { text: 'cm' })])
      ]));
    });
    cross.appendChild(h('div', { class: 'c-mid' }, [h('div', { class: 'mini', 'aria-hidden': 'true' }, [h('div', { class: 'mini-keep' })])]));
    body.appendChild(h('div', { class: 'field' }, [h('span', { class: 'lbl', text: '잘라낼 여백' }), cross, h('p', { class: 'msg', id: pid + '-mmsg' })]));
    li.appendChild(body);
    return li;
  }

  function renderRules() {
    var cat = currentCat();
    var list = $('#ruleList');
    list.textContent = '';
    cat.rules.forEach(function (rule, idx) { list.appendChild(buildRule(rule, idx, cat.rules.length)); });
  }

  function marginText(rule, mg) {
    if (!mg.ok) return '여백 값 오류';
    var cm = mg.cm;
    if (C.isZero(cm)) return '자르지 않음';
    return '위 ' + C.fmt(cm.top) + ' · 아래 ' + C.fmt(cm.bottom) + ' · 왼쪽 ' + C.fmt(cm.left) + ' · 오른쪽 ' + C.fmt(cm.right) + ' cm';
  }

  function updateRuleStatus() {
    var cat = currentCat();
    var plan = state.plan;
    var src = previewSource();
    var hasFile = src.kind === 'file';
    cat.rules.forEach(function (rule, idx) {
      var li = document.querySelector('.rule[data-id="' + rule.id + '"]');
      if (!li) return;
      var pid = 'rule-' + rule.id;
      var parsed = C.parsePageSpec(rule.pages);
      var mg = C.ruleMargins(rule);
      var pr = plan ? plan.perRule[idx] : null;

      var title = '규칙 ' + (idx + 1) + (rule.label ? ' · ' + rule.label : '');
      var t = li.querySelector('.rule-title');
      t.textContent = title;
      if (!parsed.ok || !mg.ok) t.appendChild(h('span', { class: 'dot', title: '고칠 곳이 있습니다', 'aria-label': '오류' }));
      li.querySelector('.rule-sum').textContent = (rule.pages.trim() || '(페이지 미지정)') + ' · ' + marginText(rule, mg);

      var pIn = $('#' + pid + '-pages', li);
      var pMsg = $('#' + pid + '-pmsg', li);
      pIn.classList.toggle('invalid', !parsed.ok);
      pMsg.className = 'msg';
      if (!parsed.ok) { pMsg.textContent = parsed.error; pMsg.classList.add('err'); }
      else if (pr) {
        var where = hasFile ? '이 파일' : '예시';
        if (pr.pages.length) {
          pMsg.textContent = where + '에서 ' + C.compressPages(pr.pages, 8) + '쪽 (' + pr.pages.length + '쪽)' + (pr.beyond ? ' · 파일이 ' + plan.total + '쪽까지라 나머지는 건너뜀' : '');
          if (pr.beyond) pMsg.classList.add('warn');
        } else if (pr.matched) {
          pMsg.textContent = '아래 규칙이 같은 쪽을 모두 덮어서, 이 규칙이 적용되는 쪽이 없습니다.';
          pMsg.classList.add('warn');
        } else {
          pMsg.textContent = where + '에는 해당하는 쪽이 없습니다' + (pr.beyond ? ' (파일이 ' + plan.total + '쪽까지입니다).' : '.');
          pMsg.classList.add('warn');
        }
      } else pMsg.textContent = '';

      var mMsg = $('#' + pid + '-mmsg', li);
      mMsg.className = 'msg';
      C.SIDES.forEach(function (k) {
        var inp = $('#' + pid + '-' + k, li);
        inp.parentNode.classList.toggle('invalid', !mg.ok && mg.bad.indexOf(k) !== -1);
      });
      var refItem = null;
      if (plan && pr && pr.pages.length) refItem = plan.pages[pr.pages[0] - 1];
      var errPages = plan && pr ? pr.pages.filter(function (p) { return plan.pages[p - 1].status === 'error'; }) : [];
      var okItem = null;
      if (plan && pr) for (var j = 0; j < pr.pages.length; j++) { var it = plan.pages[pr.pages[j] - 1]; if (it.status === 'crop') { okItem = it; break; } }
      if (!mg.ok) { mMsg.textContent = mg.error; mMsg.classList.add('err'); }
      else {
        var lines = [];
        if (okItem) lines.push('남는 크기 ' + C.fmtSize(okItem.kept.w, okItem.kept.h) + ' (' + okItem.page + '쪽 기준, 원래 ' + C.fmtSize(okItem.orig.w, okItem.orig.h) + ')');
        else if (C.isZero(mg.cm)) lines.push('모두 0이면 해당 페이지를 자르지 않고 그대로 둡니다.');
        if (errPages.length) {
          var e0 = plan.pages[errPages[0] - 1];
          lines.push(C.compressPages(errPages, 5) + '쪽은 자르지 않습니다: ' + e0.error);
          mMsg.classList.add('err');
        }
        mMsg.textContent = lines.join(' / ');
      }

      // 작은 쪽 그림: 기준 페이지 비율에 여백을 비례해서 표시
      var ref = refItem ? refItem.orig : (plan && plan.pages[0] ? plan.pages[0].orig : C.visualSizePt(A4G));
      var mini = li.querySelector('.mini');
      var keep = li.querySelector('.mini-keep');
      mini.style.aspectRatio = ref.w.toFixed(2) + ' / ' + ref.h.toFixed(2);
      var cm = mg.ok ? mg.cm : { top: 0, bottom: 0, left: 0, right: 0 };
      var P = C.PT_PER_CM;
      var pct = function (v, d) { return Math.max(0, Math.min(100, (v * P / d) * 100)); };
      var top = pct(cm.top, ref.h), bottom = pct(cm.bottom, ref.h), left = pct(cm.left, ref.w), right = pct(cm.right, ref.w);
      var ok = top + bottom < 100 && left + right < 100;
      keep.style.display = ok ? '' : 'none';
      keep.style.top = top + '%'; keep.style.bottom = bottom + '%';
      keep.style.left = left + '%'; keep.style.right = right + '%';
    });
  }

  function onRuleListClick(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var li = btn.closest('.rule');
    var cat = currentCat();
    var idx = -1;
    for (var i = 0; i < cat.rules.length; i++) if (cat.rules[i].id === li.getAttribute('data-id')) idx = i;
    if (idx < 0) return;
    var rule = cat.rules[idx];
    var act = btn.getAttribute('data-act');
    if (act === 'toggle') {
      var open = !state.expanded[rule.id];
      state.expanded[rule.id] = open;
      btn.setAttribute('aria-expanded', String(open));
      li.querySelector('.rule-body').hidden = !open;
      if (open) updateRuleStatus();
      return;
    }
    if (act === 'up' && idx > 0) { cat.rules.splice(idx - 1, 0, cat.rules.splice(idx, 1)[0]); }
    else if (act === 'down' && idx < cat.rules.length - 1) { cat.rules.splice(idx + 1, 0, cat.rules.splice(idx, 1)[0]); }
    else if (act === 'dup') {
      if (cat.rules.length >= C.MAX_RULES) { toast('한 카테고리에는 규칙을 ' + C.MAX_RULES + '개까지 만들 수 있습니다.'); return; }
      var copy = clone(rule);
      copy.id = C.uid('r');
      cat.rules.splice(idx + 1, 0, copy);
      state.expanded[copy.id] = true;
    } else if (act === 'del') {
      var removed = cat.rules.splice(idx, 1)[0];
      var catId = cat.id;
      toast('규칙 ' + (idx + 1) + eulReul(idx + 1) + ' 삭제했습니다.', {
        label: '되돌리기',
        run: function () {
          var c = null;
          state.settings.categories.forEach(function (x) { if (x.id === catId) c = x; });
          if (!c) return;
          c.rules.splice(Math.min(idx, c.rules.length), 0, removed);
          renderRules(); refresh(); scheduleSave();
        }
      });
    } else return;
    renderRules();
    refresh();
    scheduleSave();
    var again = document.querySelector('.rule[data-id="' + (act === 'dup' ? cat.rules[idx + 1].id : rule.id) + '"] [data-act="' + act + '"]');
    if (again && !again.disabled) again.focus();
  }

  function onRuleInput(e) {
    var k = e.target.getAttribute('data-k');
    if (!k) return;
    var li = e.target.closest('.rule');
    var cat = currentCat();
    var rule = null;
    cat.rules.forEach(function (r) { if (r.id === li.getAttribute('data-id')) rule = r; });
    if (!rule) return;
    rule[k] = e.target.value;
    refresh();
    scheduleSave();
  }

  /* ---------- 파일 ---------- */

  async function addFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    var firstNew = null;
    var recs = files.map(function (file) {
      var rec = { id: C.uid('f'), name: file.name || 'document.pdf', size: file.size, status: 'loading', file: file };
      state.files.push(rec);
      if (!firstNew) firstNew = rec;
      return rec;
    });
    if (firstNew) { state.currentFileId = firstNew.id; state.page = 1; state.previewMode = 'plan'; }
    renderFiles();
    refresh();
    renderPreview();
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      try {
        var buf = new Uint8Array(await rec.file.arrayBuffer());
        if (!C.looksLikePdf(buf)) throw { user: 'PDF 파일이 아닙니다.' };
        var lib = await loadPdfLib().catch(function () { throw { user: 'PDF 처리 도구를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 넣어 주세요.' }; });
        try { rec.geoms = await C.inspectPdf(lib, buf); }
        catch (e) { throw { user: C.friendlyLoadError(e) }; }
        if (!rec.geoms.length) throw { user: '페이지가 없는 PDF입니다.' };
        rec.bytes = buf;
        rec.status = 'ready';
      } catch (e) {
        rec.status = 'error';
        rec.error = (e && e.user) || 'PDF를 읽지 못했습니다.';
      }
      delete rec.file;
      if (!fileById(rec.id)) continue;
      renderFiles();
      if (rec.id === state.currentFileId) { refresh(); renderPreview(); }
      else { renderRunState(); renderResults(); }
    }
  }

  function removeFile(id) {
    var f = fileById(id);
    if (!f) return;
    destroyDoc(f);
    state.files = state.files.filter(function (x) { return x.id !== id; });
    if (state.results) {
      state.results.items = state.results.items.filter(function (it) {
        if (it.fileId === id) { destroyDoc(it); return false; }
        return true;
      });
      if (!state.results.items.length) state.results = null;
    }
    if (state.currentFileId === id) {
      state.currentFileId = state.files.length ? state.files[0].id : null;
      state.page = 1;
      state.previewMode = 'plan';
    }
    renderFiles(); refresh(); renderPreview();
  }

  function selectFile(id) {
    if (state.currentFileId === id) return;
    state.currentFileId = id;
    state.page = 1;
    renderFiles(); refresh(); renderPreview();
  }

  function renderFiles() {
    var ul = $('#fileList');
    ul.textContent = '';
    state.files.forEach(function (f) {
      var meta;
      if (f.status === 'loading') meta = h('span', { class: 'fmeta', text: '여는 중…' });
      else if (f.status === 'error') meta = h('span', { class: 'fmeta err', text: f.error });
      else {
        var first = C.visualSizePt(f.geoms[0]);
        meta = h('span', { class: 'fmeta', text: f.geoms.length + '쪽 · ' + fmtBytes(f.size) + ' · 1쪽 ' + C.fmtSize(first.w, first.h) + (f.size > 150 * 1024 * 1024 ? ' · 큰 파일이라 휴대폰에서는 느리거나 멈출 수 있습니다' : '') });
      }
      ul.appendChild(h('li', { 'aria-current': f.id === state.currentFileId ? 'true' : 'false' }, [
        h('button', { class: 'file-sel', type: 'button', 'data-id': f.id, 'aria-label': f.name + ' 미리보기' }, [h('span', { class: 'fname', text: f.name }), meta]),
        h('button', { class: 'icon-btn del', type: 'button', 'data-remove': f.id, 'aria-label': f.name + ' 빼기', title: '목록에서 빼기', html: ICON.x })
      ]));
    });
  }

  /* ---------- 미리보기 ---------- */

  var previewSeq = 0;
  var renderTask = null;

  function stageAvail() {
    var stage = $('#stage');
    var cs = getComputedStyle(stage);
    var w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var hgt = Math.max(260, Math.min(window.innerHeight * 0.72, 860));
    return { w: Math.max(80, w), h: hgt };
  }
  function fitSize(w, hh) {
    var a = stageAvail();
    var s = Math.min(a.w / w, a.h / hh);
    return { w: Math.max(40, Math.floor(w * s)), h: Math.max(40, Math.floor(hh * s)) };
  }
  function showStageMessage(text, err) {
    $('#sheet').hidden = true;
    var m = $('#stageMsg');
    m.hidden = false;
    m.textContent = text;
    m.className = 'stage-msg' + (err ? ' err' : '');
  }
  function placeSheet(size, canvas) {
    var sheet = $('#sheet');
    $('#stageMsg').hidden = true;
    sheet.hidden = false;
    sheet.style.width = size.w + 'px';
    sheet.style.height = size.h + 'px';
    if (canvas) {
      canvas.id = 'pageCanvas';
      var old = $('#pageCanvas');
      old.parentNode.replaceChild(canvas, old);
    }
  }

  function drawSample(canvas, pageNum, size) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 595.2756, H = 841.8898;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    var c = canvas.getContext('2d');
    var s = (size.w * dpr) / W;
    c.setTransform(s, 0, 0, s, 0, 0);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    // 스캔할 때 생긴 가장자리 그림자
    var gl = c.createLinearGradient(0, 0, 60, 0);
    gl.addColorStop(0, 'rgba(90,96,100,0.55)'); gl.addColorStop(1, 'rgba(90,96,100,0)');
    c.fillStyle = gl; c.fillRect(0, 0, 60, H);
    var gr = c.createLinearGradient(W, 0, W - 60, 0);
    gr.addColorStop(0, 'rgba(90,96,100,0.55)'); gr.addColorStop(1, 'rgba(90,96,100,0)');
    c.fillStyle = gr; c.fillRect(W - 60, 0, 60, H);
    // 펀치 구멍
    c.fillStyle = '#c9cdd1';
    [250, 420, 590].forEach(function (y) { c.beginPath(); c.arc(30, y, 9, 0, Math.PI * 2); c.fill(); });
    // 머리말 (위 4cm 안쪽)
    c.fillStyle = '#eef0f2'; c.fillRect(90, 34, W - 180, 62);
    c.strokeStyle = '#adb5bd'; c.lineWidth = 1; c.strokeRect(90, 34, W - 180, 62);
    c.fillStyle = '#495057';
    c.font = '600 16px ' + getComputedStyle(document.body).fontFamily;
    c.fillText('○○고등학교 2학년 · 국어 · 중간고사', 108, 62);
    c.font = '12px ' + getComputedStyle(document.body).fontFamily;
    c.fillText('반 ____  번호 ____  이름 ________', 108, 84);
    // 본문
    var y = 140;
    for (var q = 1; y < H - 110; q++) {
      c.fillStyle = '#343a40';
      c.font = '600 13px ' + getComputedStyle(document.body).fontFamily;
      c.fillText((q + (pageNum - 1) * 4) + '.', 96, y + 9);
      c.fillStyle = '#ced4da';
      for (var l = 0; l < 4 && y < H - 110; l++) {
        var w = W - 220 - ((q * 53 + l * 37) % 90);
        c.fillRect(118, y, w, 8);
        y += 20;
      }
      y += 26;
    }
    // 꼬리말 (아래 2cm 안쪽)
    c.fillStyle = '#868e96';
    c.font = '12px ' + getComputedStyle(document.body).fontFamily;
    c.textAlign = 'center';
    c.fillText('- ' + pageNum + ' -', W / 2, H - 28);
    c.textAlign = 'left';
    c.fillStyle = 'rgba(25,102,79,0.75)';
    c.font = '600 12px ' + getComputedStyle(document.body).fontFamily;
    c.fillText('예시 페이지', 96, 124);
  }

  async function renderPreview() {
    var seq = ++previewSeq;
    var src = previewSource();
    var total = src.geoms.length;
    if (state.page > total) state.page = Math.max(1, total);
    updatePager();
    if (renderTask) { try { renderTask.cancel(); } catch (e) { /* 무시 */ } renderTask = null; }
    if (src.kind === 'loading') { showStageMessage('PDF를 여는 중…'); return; }
    if (src.kind === 'error') { showStageMessage(src.file.name + ': ' + src.file.error, true); return; }
    if (src.kind === 'sample') {
      var size = fitSize(C.visualSizePt(A4G).w, C.visualSizePt(A4G).h);
      var cv = document.createElement('canvas');
      drawSample(cv, state.page, size);
      state.sheetKey = 'sample';
      placeSheet(size, cv);
      applyOverlay();
      return;
    }
    var res = viewableResult(src.file);
    var useResult = state.previewMode === 'result' && !!res;
    var holder = useResult ? res : src.file;
    var geom = src.geoms[state.page - 1];
    var vis = C.visualSizePt(geom);
    var key = (useResult ? 'res:' : 'src:') + src.file.id;
    if (state.sheetKey !== key) {
      state.sheetKey = key;
      var ph = document.createElement('canvas');
      ph.width = 10; ph.height = 10;
      placeSheet(fitSize(vis.w, vis.h), ph);
      $('#ov').hidden = true;
      $('#badge').className = 'badge';
      $('#badge').textContent = '불러오는 중…';
    }
    try {
      var doc = await docFor(holder);
      if (seq !== previewSeq) return;
      var page = await doc.getPage(state.page);
      if (seq !== previewSeq) return;
      var vp1 = page.getViewport({ scale: 1 });
      var sz = fitSize(vp1.width, vp1.height);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var vp = page.getViewport({ scale: (sz.w / vp1.width) * dpr });
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      var task = page.render({ canvas: canvas, viewport: vp });
      renderTask = task;
      await task.promise;
      if (renderTask === task) renderTask = null;
      if (seq !== previewSeq) return;
      state.shownResultSize = useResult ? { w: vp1.width, h: vp1.height } : null;
      placeSheet(sz, canvas);
      applyOverlay();
      renderPageInfo();
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      if (seq !== previewSeq) return;
      var fsz = fitSize(vis.w, vis.h);
      var blank = document.createElement('canvas');
      blank.width = 10; blank.height = 10;
      placeSheet(fsz, blank);
      applyOverlay('미리보기 그림을 만들지 못했습니다. 잘릴 영역 표시와 자르기는 그대로 쓸 수 있습니다.');
    }
  }

  function resultFor(file) {
    if (!file || !state.results) return null;
    for (var i = 0; i < state.results.items.length; i++) if (state.results.items[i].fileId === file.id) return state.results.items[i];
    return null;
  }
  function viewableResult(file) {
    var r = resultFor(file);
    return r && r.bytes ? r : null;
  }
  function showingResult() {
    var src = previewSource();
    return src.kind === 'file' && state.previewMode === 'result' && !!viewableResult(src.file);
  }

  function applyOverlay(extraNote) {
    var ov = $('#ov');
    var badge = $('#badge');
    badge.className = 'badge';
    var plan = state.plan;
    var item = plan && plan.pages[state.page - 1];
    var cat = currentCat();
    if (showingResult()) {
      ov.hidden = true;
      badge.textContent = extraNote || '자른 결과';
      return;
    }
    if (!item) { ov.hidden = true; badge.textContent = extraNote || ''; return; }
    var rule = item.rule >= 0 ? cat.rules[item.rule] : null;
    var rname = rule ? '규칙 ' + (item.rule + 1) + (rule.label ? ' · ' + rule.label : '') : '';
    if (item.status !== 'crop') {
      ov.hidden = true;
      if (item.status === 'none') badge.textContent = '해당 규칙 없음 · 자르지 않음';
      else if (item.status === 'keep') badge.textContent = rname + ' · 자르지 않음';
      else { badge.textContent = rname + ' · ' + item.error; badge.className = 'badge err'; }
      if (extraNote) badge.textContent += ' · ' + extraNote;
      return;
    }
    badge.textContent = extraNote || '';
    ov.hidden = false;
    ov.style.setProperty('--rc', ruleColor(item.rule));
    var P = C.PT_PER_CM;
    var W = item.orig.w, Hh = item.orig.h;
    var t = item.cm.top * P / Hh * 100, b = item.cm.bottom * P / Hh * 100;
    var l = item.cm.left * P / W * 100, r = item.cm.right * P / W * 100;
    var sheet = $('#sheet');
    var sw = sheet.clientWidth, sh = sheet.clientHeight;
    function band(sel, styles, cmVal, sizePx, horizontal) {
      var el = ov.querySelector(sel);
      Object.keys(styles).forEach(function (k) { el.style[k] = styles[k]; });
      var span = el.querySelector('span');
      span.textContent = C.fmt(cmVal) + ' cm';
      span.style.display = cmVal > 0 && sizePx >= (horizontal ? 18 : 44) ? '' : 'none';
      el.style.display = cmVal > 0 ? '' : 'none';
    }
    band('.b-top', { height: t + '%' }, item.cm.top, sh * t / 100, true);
    band('.b-bottom', { height: b + '%' }, item.cm.bottom, sh * b / 100, true);
    band('.b-left', { top: t + '%', bottom: b + '%', width: l + '%' }, item.cm.left, sw * l / 100, false);
    band('.b-right', { top: t + '%', bottom: b + '%', width: r + '%' }, item.cm.right, sw * r / 100, false);
    var keep = ov.querySelector('.keep');
    keep.style.top = t + '%'; keep.style.bottom = b + '%'; keep.style.left = l + '%'; keep.style.right = r + '%';
    // 빗금은 한 장으로 그리고 남길 영역만 뚫는다 (띠마다 무늬가 어긋나지 않게)
    var R = 100 - r, B = 100 - b;
    var poly = 'polygon(0% 0%, 0% 100%, ' + l + '% 100%, ' + l + '% ' + t + '%, ' + R + '% ' + t + '%, ' + R + '% ' + B + '%, ' + l + '% ' + B + '%, ' + l + '% 100%, 100% 100%, 100% 0%)';
    var shade = ov.querySelector('.shade');
    shade.style.webkitClipPath = poly;
    shade.style.clipPath = poly;
  }

  function updatePager() {
    var src = previewSource();
    var total = src.geoms.length;
    var inp = $('#pageNum');
    if (document.activeElement !== inp) inp.value = total ? state.page : '';
    inp.disabled = !total;
    $('#pageTotal').textContent = total || 0;
    $('#prevPage').disabled = !total || state.page <= 1;
    $('#nextPage').disabled = !total || state.page >= total;
    var seg = $('#viewSeg');
    var has = src.kind === 'file' && !!viewableResult(src.file);
    seg.hidden = !has;
    if (!has && state.previewMode === 'result') state.previewMode = 'plan';
    seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.previewMode)); });
  }

  function goPage(p) {
    var total = previewSource().geoms.length;
    if (!total) return;
    p = Math.max(1, Math.min(total, p | 0));
    if (p === state.page) { updatePager(); return; }
    state.page = p;
    updatePager();
    renderPageInfo();
    renderStrip();
    renderPreview();
  }

  function renderPageInfo() {
    var el = $('#pageInfo');
    el.className = 'page-info';
    var src = previewSource();
    var plan = state.plan;
    if (src.kind === 'loading' || src.kind === 'error' || !plan || !plan.pages.length) { el.textContent = ''; return; }
    var item = plan.pages[state.page - 1];
    if (!item) { el.textContent = ''; return; }
    var cat = currentCat();
    var rule = item.rule >= 0 ? cat.rules[item.rule] : null;
    var rname = rule ? '규칙 ' + (item.rule + 1) + (rule.label ? '(' + rule.label + ')' : '') : '';
    var pre = (src.kind === 'sample' ? '예시 ' : '') + state.page + '쪽 · ';
    if (showingResult()) {
      var rs = state.shownResultSize;
      el.textContent = pre + '자른 결과' + (rs ? ' · ' + C.fmtSize(rs.w, rs.h) : '');
      return;
    }
    if (item.status === 'crop') el.textContent = pre + rname + ' 적용 · ' + C.fmtSize(item.orig.w, item.orig.h) + ' → ' + C.fmtSize(item.kept.w, item.kept.h);
    else if (item.status === 'keep') el.textContent = pre + rname + ' 적용 · 자르지 않음 (' + C.fmtSize(item.orig.w, item.orig.h) + ')';
    else if (item.status === 'none') el.textContent = pre + '해당 규칙 없음 · 자르지 않음 (' + C.fmtSize(item.orig.w, item.orig.h) + ')';
    else { el.textContent = pre + rname + ': ' + item.error; el.className = 'page-info err'; }
  }

  function themeColors() {
    var cs = getComputedStyle(document.documentElement);
    var get = function (n) { return cs.getPropertyValue(n).trim(); };
    var rules = [];
    for (var i = 1; i <= RULE_COLORS; i++) rules.push(get('--r' + i));
    return { rules: rules, none: get('--none'), bad: get('--bad'), ink: get('--ink') };
  }

  function renderStrip() {
    var cv = $('#strip');
    var plan = state.plan;
    var W = cv.clientWidth;
    if (!W) return;
    var H = 28;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (!plan || !plan.pages.length) { cv.style.visibility = 'hidden'; return; }
    cv.style.visibility = '';
    var col = themeColors();
    var n = plan.pages.length;
    var cw = W / n;
    var gap = cw >= 8 ? 2 : cw >= 3 ? 1 : 0;
    plan.pages.forEach(function (it, i) {
      c.globalAlpha = it.status === 'keep' ? 0.45 : 1;
      c.fillStyle = it.status === 'error' ? col.bad : it.status === 'none' ? col.none : col.rules[it.rule % RULE_COLORS];
      c.fillRect(i * cw + gap / 2, 7, Math.max(cw - gap, 0.75), H - 14);
    });
    c.globalAlpha = 1;
    var x = (state.page - 1) * cw;
    c.strokeStyle = col.ink;
    c.lineWidth = 2;
    c.strokeRect(Math.max(1, x), 2, Math.max(cw, 3) - (x <= 0 ? 1 : 0), H - 4);
    var cat = currentCat();
    cv.setAttribute('aria-label', '쪽별 적용 규칙: 전체 ' + n + '쪽 중 자를 쪽 ' + plan.counts.crop + ', 그대로 둘 쪽 ' + (plan.counts.keep + plan.counts.none) + (plan.counts.error ? ', 오류 ' + plan.counts.error : '') + '. 현재 ' + state.page + '쪽' + (cat ? '' : ''));
  }

  function renderLegend() {
    var ul = $('#legend');
    ul.textContent = '';
    var plan = state.plan;
    if (!plan || !plan.pages.length) return;
    var cat = currentCat();
    function item(colorVar, light, title, pages, extra) {
      var sw = h('span', { class: 'sw' + (light ? ' light' : '') });
      sw.style.setProperty('--sc', colorVar);
      ul.appendChild(h('li', {}, [h('button', { type: 'button', 'data-page': pages[0] }, [
        sw,
        h('span', {}, [h('b', { text: title }), ' ', h('span', { class: 'lpages', text: C.compressPages(pages, 6) + '쪽 (' + pages.length + '쪽)' + (extra || '') })])
      ])]));
    }
    cat.rules.forEach(function (rule, idx) {
      var pages = plan.pages.filter(function (p) { return p.rule === idx && p.status !== 'error'; });
      if (!pages.length) return;
      var allKeep = pages.every(function (p) { return p.status === 'keep'; });
      item(ruleColor(idx), allKeep, '규칙 ' + (idx + 1) + (rule.label ? ' · ' + rule.label : ''), pages.map(function (p) { return p.page; }), allKeep ? ' · 자르지 않음' : '');
    });
    var none = plan.pages.filter(function (p) { return p.status === 'none'; }).map(function (p) { return p.page; });
    if (none.length) item('var(--none)', false, '규칙 없음', none, ' · 자르지 않음');
    var errs = plan.pages.filter(function (p) { return p.status === 'error'; });
    if (errs.length) item('var(--bad)', false, '오류', errs.map(function (p) { return p.page; }), ' · 자르지 않음');
  }

  /* ---------- 실행 ---------- */

  function runState() {
    var ready = state.files.filter(function (f) { return f.status === 'ready'; });
    var loading = state.files.some(function (f) { return f.status === 'loading'; });
    if (!state.files.length) return { ok: false, hint: '자를 PDF를 먼저 넣어 주세요. 지금은 예시 페이지로 규칙을 미리 볼 수 있습니다.' };
    if (loading) return { ok: false, hint: 'PDF를 여는 중입니다…' };
    if (!ready.length) return { ok: false, hint: '자를 수 있는 PDF가 없습니다.', err: true };
    var cat = currentCat();
    if (!cat.rules.length) return { ok: false, hint: '규칙을 하나 이상 추가해 주세요.', err: true };
    var probs = C.ruleProblems(cat.rules);
    if (probs.length) return { ok: false, hint: '규칙 ' + (probs[0].rule + 1) + ': ' + probs[0].error, err: true };
    var crop = 0, errPages = 0;
    ready.forEach(function (f) {
      var p = C.planDocument(cat.rules, f.geoms);
      crop += p.counts.crop;
      errPages += p.counts.error;
    });
    if (!crop) return { ok: false, hint: '이 규칙으로는 자를 페이지가 없습니다. 페이지 지정과 여백 값을 확인해 주세요.', err: true };
    var hint = '“' + cat.name + '” 규칙으로 파일 ' + ready.length + '개, 모두 ' + crop + '쪽을 자릅니다.';
    if (errPages) hint += ' 여백이 페이지보다 큰 ' + errPages + '쪽은 자르지 않습니다.';
    return { ok: true, hint: hint };
  }

  function renderRunState() {
    var btn = $('#runBtn');
    var hint = $('#runHint');
    if (state.running) { btn.disabled = true; return; }
    var rs = runState();
    btn.disabled = !rs.ok;
    hint.textContent = rs.hint;
    hint.className = 'hint' + (rs.err ? ' err' : '');
  }

  async function runCrop() {
    var rs = runState();
    if (!rs.ok || state.running) return;
    state.running = true;
    var btn = $('#runBtn');
    btn.disabled = true;
    btn.textContent = '자르는 중…';
    var cat = currentCat();
    var rules = clone(cat.rules);
    var sig = rulesSig();
    var ready = state.files.filter(function (f) { return f.status === 'ready'; });
    var items = [];
    var hint = $('#runHint');
    hint.className = 'hint';
    try {
      var lib = await loadPdfLib();
      for (var i = 0; i < ready.length; i++) {
        var f = ready[i];
        hint.textContent = '자르는 중… (' + (i + 1) + '/' + ready.length + ') ' + f.name;
        await nextFrame();
        try {
          var r = await C.cropPdf(lib, f.bytes, rules);
          items.push({ fileId: f.id, srcName: f.name, name: C.outputName(f.name), bytes: r.bytes, report: r.report, changed: r.changed });
        } catch (e) {
          items.push({ fileId: f.id, srcName: f.name, name: C.outputName(f.name), error: '이 파일은 처리하지 못했습니다. (' + ((e && e.message) || e) + ')' });
        }
      }
    } catch (e) {
      toast('PDF 처리 도구를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
    }
    var names = C.uniqueNames(items.map(function (it) { return it.name; }));
    items.forEach(function (it, i) { it.name = names[i]; });
    if (state.results) state.results.items.forEach(destroyDoc);
    state.results = items.length ? { sig: sig, catName: cat.name, items: items } : null;
    state.running = false;
    btn.textContent = '자르기 실행';
    var cur = currentFile();
    if (cur && viewableResult(cur)) state.previewMode = 'result';
    renderResults();
    renderRunState();
    renderPreview();
    renderPageInfo();
    if (items.length && !items.some(function (it) { return it.error; })) {
      var saveLabel = IS_PWA && IS_IOS && SHARE_PDF ? '저장·공유' : '저장';
      toast(items.length === 1 ? '다 잘랐습니다. “' + saveLabel + '”을 눌러 파일을 받으세요.' : items.length + '개 파일을 다 잘랐습니다. 하나씩 받거나 한 번에 받으세요.');
    }
  }

  function renderResults() {
    var box = $('#results');
    box.textContent = '';
    var R = state.results;
    if (!R) return;
    if (R.sig !== rulesSig()) {
      box.appendChild(h('p', { class: 'note warn', text: '실행한 뒤 규칙이나 카테고리가 바뀌었습니다. 아래 결과는 “' + R.catName + '”의 이전 규칙으로 만든 것입니다. 지금 규칙을 쓰려면 다시 실행하세요.' }));
    }
    var fresh = state.files.filter(function (f) { return f.status === 'ready' && !resultFor(f); });
    if (fresh.length && R.sig === rulesSig()) {
      box.appendChild(h('p', { class: 'note warn', text: '새로 넣은 파일 ' + fresh.length + '개는 아직 자르지 않았습니다. 그 파일도 자르려면 다시 실행하세요.' }));
    }
    R.items.forEach(function (it, idx) {
      var sum;
      if (it.error) sum = h('span', { class: 'res-sum err', text: it.error });
      else {
        var rp = it.report;
        var parts = [rp.total + '쪽 중 ' + rp.cropped.length + '쪽 자름'];
        var same = rp.kept.length + rp.untouched.length;
        if (same) parts.push(same + '쪽 그대로');
        if (rp.errors.length) parts.push(rp.errors.length + '쪽은 여백이 커서 자르지 않음(' + C.compressPages(rp.errors.map(function (e) { return e.page; }), 5) + '쪽)');
        if (!it.changed) parts = ['자른 쪽이 없어 원본과 같습니다'];
        sum = h('span', { class: 'res-sum' + (rp.errors.length ? ' err' : ''), text: parts.join(' · ') + ' · ' + fmtBytes(it.bytes.length) });
      }
      var btns = null;
      if (!it.error) {
        if (IS_PWA && IS_IOS && SHARE_PDF) btns = [h('button', { class: 'btn primary', type: 'button', 'data-share': String(idx), text: '저장·공유' })];
        else btns = [
          h('button', { class: 'btn primary', type: 'button', 'data-save': String(idx), text: '저장' }),
          SHARE_PDF ? h('button', { class: 'btn', type: 'button', 'data-share': String(idx), text: '공유' }) : null
        ];
      }
      box.appendChild(h('div', { class: 'res' }, [
        h('div', { class: 'res-main' }, [h('span', { class: 'res-name', text: it.name }), sum]),
        btns ? h('div', { class: 'btn-row' }, btns) : null
      ]));
    });
    var ok = R.items.filter(function (it) { return !it.error; });
    if (ok.length > 1) {
      var bulk = [];
      if (!(IS_PWA && IS_IOS && SHARE_PDF)) bulk.push(h('button', { class: 'btn', type: 'button', 'data-zip': '1', text: 'ZIP으로 모두 저장 (' + ok.length + '개)' }));
      if (SHARE_PDF) bulk.push(h('button', { class: 'btn', type: 'button', 'data-share-all': '1', text: (IS_IOS ? '모두 저장·공유' : '모두 공유') + ' (' + ok.length + '개)' }));
      box.appendChild(h('div', { class: 'btn-row' }, bulk));
    }
  }

  async function onResultsClick(e) {
    var R = state.results;
    if (!R) return;
    var sh = e.target.closest('[data-share]');
    var sa = e.target.closest('[data-share-all]');
    if (sh || sa) {
      // 공유 시트는 누른 직후에 열어야 하므로 기다리는 작업 없이 바로 부른다
      var files = sh ? [pdfFile(R.items[Number(sh.getAttribute('data-share'))])]
        : R.items.filter(function (x) { return !x.error; }).map(pdfFile);
      var sres = await shareFiles(files);
      if (!sres.ok && sres.msg) toast(sres.msg);
      return;
    }
    var s = e.target.closest('[data-save]');
    var z = e.target.closest('[data-zip]');
    if (!s && !z) return;
    var btn = s || z;
    btn.disabled = true;
    var res;
    try {
      if (s) {
        var it = R.items[Number(s.getAttribute('data-save'))];
        res = await saveFile(it.name, new Blob([it.bytes], { type: 'application/pdf' }));
      } else {
        var ok = R.items.filter(function (x) { return !x.error; });
        var zip = C.makeZip(ok.map(function (x) { return { name: x.name, data: x.bytes }; }));
        res = await saveFile('PDF자르기_결과.zip', zip);
      }
    } finally { btn.disabled = false; }
    if (res && !res.ok && res.msg) toast(res.msg);
  }

  /* ---------- 내보내기·가져오기 ---------- */

  async function exportSettings() {
    var data = { app: 'pdf-margin-crop', v: 1, exportedAt: new Date().toISOString(), categories: state.settings.categories, selectedId: state.settings.selectedId };
    var res = await deliverFile('PDF자르기_카테고리설정.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    if (res.ok) toast('카테고리 설정 파일을 저장했습니다.');
    else if (res.msg) toast(res.msg);
  }
  async function importSettings(file) {
    try {
      var text = await file.text();
      var parsed = C.sanitizeSettings(JSON.parse(text));
      if (!parsed) throw new Error('shape');
      var msg;
      if (state.isDefault) {
        state.settings = { categories: parsed.categories, selectedId: parsed.categories[0].id };
        msg = '카테고리 ' + parsed.categories.length + '개를 가져왔습니다.';
      } else {
        var m = C.mergeCategories(state.settings.categories, parsed.categories);
        if (m.categories.length > C.MAX_CATEGORIES) {
          m.categories = m.categories.slice(0, C.MAX_CATEGORIES);
          toast('카테고리는 ' + C.MAX_CATEGORIES + '개까지라 일부는 가져오지 못했습니다.');
        }
        state.settings.categories = m.categories;
        state.settings.selectedId = parsed.categories[0].id;
        msg = '카테고리 ' + parsed.categories.length + '개를 가져왔습니다 (새로 추가 ' + m.added + '개, 같은 카테고리 덮어쓰기 ' + m.replaced + '개).';
      }
      renderAll();
      scheduleSave();
      toast(msg);
    } catch (e) {
      toast('가져오지 못했습니다. 이 도구에서 내보낸 .json 파일인지 확인해 주세요.');
    }
  }

  /* ---------- 알림 ---------- */

  var toastTimer = null;
  function toast(msg, action) {
    var t = $('#toast');
    $('#toastMsg').textContent = msg;
    var b = $('#toastAct');
    if (action) {
      b.hidden = false;
      b.textContent = action.label;
      b.onclick = function () { hideToast(); action.run(); };
    } else { b.hidden = true; b.onclick = null; }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 8000 : 4500);
  }
  function hideToast() { $('#toast').hidden = true; }

  /* ---------- 전체 갱신 ---------- */

  function refresh() {
    var src = previewSource();
    state.plan = src.geoms.length ? C.planDocument(currentCat().rules, src.geoms) : null;
    updateRuleStatus();
    renderStrip();
    renderLegend();
    renderPageInfo();
    applyOverlay();
    renderRunState();
    renderResults();
    updatePager();
  }

  function renderAll() {
    renderChips();
    renderCatHead();
    renderRules();
    renderFiles();
    refresh();
    renderPreview();
    renderStoreStatus();
  }

  /* ---------- 이벤트 ---------- */

  function bind() {
    $('#catChips').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.getAttribute('data-act') === 'add') addCat();
      else selectCat(b.getAttribute('data-id'));
    });
    $('#catName').addEventListener('input', function (e) {
      currentCat().name = e.target.value;
      var chip = document.querySelector('.chip[data-id="' + currentCat().id + '"]');
      if (chip) chip.textContent = e.target.value || '이름 없는 카테고리';
      renderRunState();
      scheduleSave();
    });
    $('#catName').addEventListener('blur', function (e) {
      if (!e.target.value.trim()) { currentCat().name = '이름 없는 카테고리'; renderChips(); renderCatHead(); scheduleSave(); }
    });
    $('#catDup').addEventListener('click', dupCat);
    $('#catDel').addEventListener('click', delCat);
    $('#addRule').addEventListener('click', function () {
      var cat = currentCat();
      if (cat.rules.length >= C.MAX_RULES) { toast('한 카테고리에는 규칙을 ' + C.MAX_RULES + '개까지 만들 수 있습니다.'); return; }
      var r = newRule(cat.rules.length ? '' : '전체');
      cat.rules.push(r);
      state.expanded[r.id] = true;
      renderRules(); refresh(); scheduleSave();
      var inp = $('#rule-' + r.id + '-pages');
      if (inp) inp.focus();
    });
    var list = $('#ruleList');
    list.addEventListener('click', onRuleListClick);
    list.addEventListener('input', onRuleInput);

    var fi = $('#fileInput');
    fi.addEventListener('change', function () { addFiles(fi.files); fi.value = ''; });
    var dz = $('#dropZone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); });
    });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length && !dz.contains(e.target)) addFiles(e.dataTransfer.files);
    });
    $('#fileList').addEventListener('click', function (e) {
      var rm = e.target.closest('[data-remove]');
      if (rm) { removeFile(rm.getAttribute('data-remove')); return; }
      var sel = e.target.closest('.file-sel');
      if (sel) selectFile(sel.getAttribute('data-id'));
    });

    $('#prevPage').addEventListener('click', function () { goPage(state.page - 1); });
    $('#nextPage').addEventListener('click', function () { goPage(state.page + 1); });
    var pn = $('#pageNum');
    pn.addEventListener('change', function () { var v = parseInt(pn.value, 10); if (v) goPage(v); else updatePager(); });
    pn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); pn.blur(); } });
    pn.addEventListener('blur', function () { updatePager(); });
    $('#stage').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPage(state.page - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goPage(state.page + 1); }
    });
    $('#viewSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      state.previewMode = b.getAttribute('data-mode');
      updatePager(); applyOverlay(); renderPageInfo(); renderPreview();
    });
    var strip = $('#strip');
    var scrub = false;
    function stripPage(e) {
      var rect = strip.getBoundingClientRect();
      var n = state.plan ? state.plan.pages.length : 0;
      if (!n || !rect.width) return;
      goPage(Math.floor(((e.clientX - rect.left) / rect.width) * n) + 1);
    }
    strip.addEventListener('pointerdown', function (e) { scrub = true; try { strip.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } stripPage(e); });
    strip.addEventListener('pointermove', function (e) { if (scrub) stripPage(e); });
    strip.addEventListener('pointerup', function () { scrub = false; });
    strip.addEventListener('pointercancel', function () { scrub = false; });
    $('#legend').addEventListener('click', function (e) {
      var b = e.target.closest('[data-page]');
      if (b) goPage(Number(b.getAttribute('data-page')));
    });

    $('#runBtn').addEventListener('click', runCrop);
    $('#results').addEventListener('click', onResultsClick);
    $('#exportBtn').addEventListener('click', exportSettings);
    var ii = $('#importInput');
    ii.addEventListener('change', function () { if (ii.files[0]) importSettings(ii.files[0]); ii.value = ''; });

    var rt = null;
    var lastW = 0;
    var onResize = function () {
      var w = $('#stage').clientWidth;
      renderStrip();
      if (Math.abs(w - lastW) < 2) return;
      lastW = w;
      clearTimeout(rt);
      rt = setTimeout(function () { renderPreview(); }, 150);
    };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe($('#stage'));
    else window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSave(); });
    window.addEventListener('pagehide', flushSave);
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', renderStrip);
    if (window.MutationObserver) new MutationObserver(renderStrip).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ---------- 휴대폰 앱(PWA) ---------- */

  function setAppStatus(text) {
    var el = $('#appStatus');
    if (el) el.textContent = text;
  }

  async function intakeShared() {
    // 다른 앱에서 ‘공유 → PDF 자르기’로 보낸 파일을 받아 온다 (기기 안의 임시 보관함에서 꺼냄)
    if (!('caches' in window)) return;
    try {
      var c = await caches.open('pdfcrop-share');
      var keys = await c.keys();
      if (location.search) history.replaceState(null, '', location.pathname);
      if (!keys.length) return;
      var files = [];
      for (var i = 0; i < keys.length; i++) {
        var res = await c.match(keys[i]);
        if (res) {
          var blob = await res.blob();
          var name = decodeURIComponent(res.headers.get('x-name') || 'shared.pdf');
          files.push(new File([blob], name, { type: 'application/pdf' }));
        }
        await c.delete(keys[i]);
      }
      if (files.length) {
        await addFiles(files);
        toast('공유받은 PDF ' + files.length + '개를 넣었습니다.');
      }
    } catch (e) { /* 공유받은 파일이 없으면 그냥 넘어간다 */ }
  }

  function setupPwa() {
    if (!IS_PWA) return;
    if ('serviceWorker' in navigator) {
      setAppStatus('오프라인용 파일을 받는 중…');
      navigator.serviceWorker.register('sw.js').then(function () {
        return navigator.serviceWorker.ready;
      }).then(function () {
        setAppStatus('인터넷 없이도 작동합니다');
      }).catch(function () {
        setAppStatus('이 주소에서는 오프라인 사용을 준비할 수 없습니다');
      });
    } else setAppStatus('이 브라우저는 오프라인 사용을 지원하지 않습니다');

    var bar = $('#installBar');
    if (!bar) return;
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    var dismissed = false;
    try { dismissed = localStorage.getItem('pdfcrop.installDismissed') === '1'; } catch (e) { dismissed = false; }
    var hint = $('#installHint');
    var btn = $('#installBtn');
    var deferred = null;
    if (!standalone && !dismissed) {
      var mobile = IS_IOS || /Android/i.test(navigator.userAgent);
      if (IS_IOS) hint.textContent = '아래쪽(또는 주소창 옆) 공유 버튼 □↑을 누르고 “홈 화면에 추가”를 고르세요.';
      else if (mobile) hint.textContent = '브라우저 메뉴(⋮ 또는 ≡)에서 “홈 화면에 추가” 또는 “앱 설치”를 고르세요.';
      else hint.textContent = '휴대폰 브라우저로 이 주소를 열면 홈 화면에 앱으로 설치할 수 있습니다.';
      bar.hidden = false;
    }
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      if (standalone) return;
      btn.hidden = false;
      hint.textContent = '“앱 설치”를 누르면 홈 화면에 아이콘이 생깁니다.';
      bar.hidden = false;
    });
    btn.addEventListener('click', async function () {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* 무시 */ }
      deferred = null;
      btn.hidden = true;
    });
    window.addEventListener('appinstalled', function () {
      bar.hidden = true;
      toast('홈 화면에 설치했습니다. 이제 아이콘으로 여세요.');
    });
    $('#installClose').addEventListener('click', function () {
      bar.hidden = true;
      try { localStorage.setItem('pdfcrop.installDismissed', '1'); } catch (e) { /* 무시 */ }
    });
    intakeShared();
  }

  /* ---------- 시작 ---------- */

  function start() {
    var local = readLocal();
    state.settings = local || defaultSettings();
    state.isDefault = !local;
    var first = currentCat().rules[0];
    if (first && window.innerWidth >= 700) state.expanded[first.id] = true;
    if (!state.files.length) state.page = 2;
    bind();
    renderAll();
    initStorage();
    setupPwa();
    cap('downloads');
    setTimeout(function () {
      loadPdfLib().catch(function () { /* 파일을 넣을 때 다시 시도 */ });
      loadPdfjs().catch(function () { /* 미리보기 때 다시 시도 */ });
    }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
