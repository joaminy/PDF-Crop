/* PDF 여백 자르기 — 핵심 로직 (화면과 무관한 순수 함수 모음) */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PdfCropCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PT_PER_CM = 72 / 2.54;
  var MIN_KEEP_PT = 72 / 25.4; // 자르고 남는 폭·높이가 1 mm보다 작으면 오류로 본다
  var LETTER = { x0: 0, y0: 0, x1: 612, y1: 792 };
  var SIDES = ['top', 'bottom', 'left', 'right'];
  var MAX_RULES = 500;       // 한 카테고리의 규칙 수 (쪽마다 따로 정해도 넉넉하게)
  var MAX_CATEGORIES = 100;
  var SIDE_LABEL = { top: '위', bottom: '아래', left: '왼쪽', right: '오른쪽' };

  var WORDS = {
    all: ['전체', '모두', '모든', '전부', 'all', '*'],
    odd: ['홀수', '홀', 'odd'],
    even: ['짝수', '짝', 'even'],
    last: ['마지막', '끝', 'last', 'end']
  };
  function isWord(kind, tok) { return WORDS[kind].indexOf(tok) !== -1; }

  var EXAMPLE = '예) 전체, 1, 2-5, 6-, 홀수, 짝수, 마지막, 1,3,7-9';

  /* ---------- 페이지 지정 ---------- */

  function normalizeSpec(spec) {
    var s = String(spec == null ? '' : spec);
    if (s.normalize) s = s.normalize('NFKC');
    s = s.toLowerCase();
    s = s.replace(/[~〜∼‐-―−～]/g, '-');
    s = s.replace(/[、;]/g, ',');
    s = s.replace(/페이지|쪽|pages|page/g, ' ');
    s = s.replace(/\bpp?\./g, ' ');
    s = s.replace(/\s*-\s*/g, '-');
    return s.trim();
  }

  function parseEnd(str, dflt) {
    if (str === '') return dflt;
    if (isWord('last', str)) return 'last';
    if (/^\d+$/.test(str)) return parseInt(str, 10);
    return undefined;
  }

  /** 페이지 지정 문자열을 해석한다. 파일의 쪽수와 무관하게 문법만 본다. */
  function parsePageSpec(spec) {
    var norm = normalizeSpec(spec);
    if (!norm) return { ok: false, error: '페이지를 입력하세요. ' + EXAMPLE };
    var tokens = norm.split(/[\s,]+/).filter(Boolean);
    var terms = [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      if (isWord('all', tok)) { terms.push({ type: 'all' }); continue; }
      if (isWord('odd', tok)) { terms.push({ type: 'odd' }); continue; }
      if (isWord('even', tok)) { terms.push({ type: 'even' }); continue; }
      if (isWord('last', tok)) { terms.push({ type: 'range', from: 'last', to: 'last' }); continue; }
      if (/^\d+$/.test(tok)) {
        var n = parseInt(tok, 10);
        if (n < 1) return { ok: false, error: '페이지 번호는 1부터 셉니다.' };
        terms.push({ type: 'range', from: n, to: n });
        continue;
      }
      var m = tok.match(/^([^-]*)-([^-]*)$/);
      if (m) {
        if (m[1] === '' && m[2] === '') return { ok: false, error: '범위의 앞뒤 숫자가 비어 있습니다. ' + EXAMPLE };
        var a = parseEnd(m[1], 1);
        var b = parseEnd(m[2], 'last');
        if (a === 0 || b === 0) return { ok: false, error: '페이지 번호는 1부터 셉니다.' };
        if (a !== undefined && b !== undefined) { terms.push({ type: 'range', from: a, to: b }); continue; }
      }
      return { ok: false, error: '“' + tok + '”: 알 수 없는 표현입니다. ' + EXAMPLE };
    }
    return { ok: true, terms: terms };
  }

  /** 해석된 지정을 실제 쪽 번호(1부터)로 펼친다. */
  function expandTerms(terms, total) {
    var seen = {};
    var beyond = false;
    function add(p) { if (p >= 1 && p <= total) seen[p] = true; }
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (t.type === 'all') { for (var p = 1; p <= total; p++) add(p); }
      else if (t.type === 'odd') { for (var q = 1; q <= total; q += 2) add(q); }
      else if (t.type === 'even') { for (var r = 2; r <= total; r += 2) add(r); }
      else {
        var a = t.from === 'last' ? total : t.from;
        var b = t.to === 'last' ? total : t.to;
        if (a > b) { var tmp = a; a = b; b = tmp; }
        if (b > total) beyond = true;
        for (var s = a; s <= Math.min(b, total); s++) add(s);
      }
    }
    var pages = Object.keys(seen).map(Number).sort(function (x, y) { return x - y; });
    return { pages: pages, beyond: beyond };
  }

  /** 규칙마다 해당 페이지를 정한다. 같은 페이지에 여러 규칙이 맞으면 아래쪽(나중) 규칙이 이긴다. */
  function assignRules(rules, total) {
    var assign = new Array(total + 1);
    for (var i = 0; i <= total; i++) assign[i] = -1;
    var perRule = rules.map(function () { return { error: null, beyond: false, matched: 0, pages: [] }; });
    rules.forEach(function (rule, idx) {
      var parsed = parsePageSpec(rule.pages);
      if (!parsed.ok) { perRule[idx].error = parsed.error; return; }
      var ex = expandTerms(parsed.terms, total);
      perRule[idx].beyond = ex.beyond;
      perRule[idx].matched = ex.pages.length;
      ex.pages.forEach(function (p) { assign[p] = idx; });
    });
    for (var p = 1; p <= total; p++) if (assign[p] >= 0) perRule[assign[p]].pages.push(p);
    return { assign: assign, perRule: perRule };
  }

  /* ---------- 여백 값 ---------- */

  function parseCm(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v >= 0 && isFinite(v) ? v : NaN;
    var s = String(v).trim().replace(',', '.');
    if (s === '') return 0;
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  function ruleMargins(rule) {
    var cm = {};
    var bad = [];
    SIDES.forEach(function (k) {
      var n = parseCm(rule[k]);
      if (!isFinite(n)) bad.push(k);
      cm[k] = n;
    });
    if (bad.length) {
      return { ok: false, bad: bad, error: bad.map(function (k) { return SIDE_LABEL[k]; }).join('·') + ' 값은 0 이상의 숫자(cm)로 입력하세요.' };
    }
    return { ok: true, cm: cm };
  }

  function isZero(cm) { return !cm.top && !cm.bottom && !cm.left && !cm.right; }

  /* ---------- 페이지 기하 ---------- */

  function num(ctx, obj) {
    var o = ctx && ctx.lookup ? ctx.lookup(obj) : obj;
    if (o && typeof o.asNumber === 'function') return o.asNumber();
    return NaN;
  }

  function normRect(nums) {
    var x0 = Math.min(nums[0], nums[2]), x1 = Math.max(nums[0], nums[2]);
    var y0 = Math.min(nums[1], nums[3]), y1 = Math.max(nums[1], nums[3]);
    if (!(x1 - x0 > 0 && y1 - y0 > 0)) return null;
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  function readRect(PDFLib, page, name, inheritable) {
    try {
      var node = page.node;
      var ctx = node.context;
      var key = PDFLib.PDFName.of(name);
      var raw = inheritable ? node.getInheritableAttribute(key) : node.get(key);
      if (!raw) return null;
      var arr = ctx.lookup(raw);
      if (!arr || typeof arr.size !== 'function' || arr.size() !== 4) return null;
      var nums = [];
      for (var i = 0; i < 4; i++) {
        var n = num(ctx, arr.get(i));
        if (!isFinite(n)) return null;
        nums.push(n);
      }
      return normRect(nums);
    } catch (e) {
      return null;
    }
  }

  function intersect(a, b) {
    var x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
    var x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
    return x1 > x0 && y1 > y0 ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null;
  }

  function normRotation(r) {
    r = Number(r) || 0;
    if (r % 90 !== 0) return 0;
    return ((r % 360) + 360) % 360;
  }

  /** 화면에 보이는 영역(CropBox∩MediaBox)과 회전을 읽는다. pdf.js와 같은 규칙을 따른다. */
  function readGeometry(PDFLib, page) {
    var media = readRect(PDFLib, page, 'MediaBox', true);
    var mediaMissing = !media;
    if (!media) media = { x0: LETTER.x0, y0: LETTER.y0, x1: LETTER.x1, y1: LETTER.y1 };
    var crop = readRect(PDFLib, page, 'CropBox', true);
    var view = media;
    if (crop) { var i = intersect(crop, media); if (i) view = i; }
    var rotation = 0;
    var userUnit = 1;
    try {
      var node = page.node;
      var ctx = node.context;
      var rot = node.getInheritableAttribute(PDFLib.PDFName.of('Rotate'));
      if (rot) rotation = normRotation(num(ctx, rot));
      var uu = node.get(PDFLib.PDFName.of('UserUnit'));
      if (uu) { var u = num(ctx, uu); if (isFinite(u) && u > 0) userUnit = u; }
    } catch (e) { /* 기본값 유지 */ }
    return { view: view, rotation: rotation, userUnit: userUnit, mediaMissing: mediaMissing };
  }

  /** 보이는 방향 기준 페이지 크기(pt) */
  function visualSizePt(geom) {
    var u = geom.userUnit || 1;
    var w = (geom.view.x1 - geom.view.x0) * u;
    var h = (geom.view.y1 - geom.view.y0) * u;
    return geom.rotation % 180 === 90 ? { w: h, h: w } : { w: w, h: h };
  }

  /**
   * 화면에서 본 위·아래·왼쪽·오른쪽 여백을 회전 전 좌표계의 여백으로 바꾼다.
   * /Rotate는 시계 방향 회전이다. 90°면 원래 왼쪽 변이 화면 위쪽에 온다.
   */
  function visualToBox(m, rotation) {
    switch (rotation) {
      case 90: return { left: m.top, top: m.right, right: m.bottom, bottom: m.left };
      case 180: return { left: m.right, right: m.left, top: m.bottom, bottom: m.top };
      case 270: return { right: m.top, top: m.left, left: m.bottom, bottom: m.right };
      default: return { left: m.left, right: m.right, top: m.top, bottom: m.bottom };
    }
  }

  function fmt(n) { return String(Math.round(n * 10) / 10); }
  function fmtSize(wPt, hPt) { return (wPt / PT_PER_CM).toFixed(1) + ' × ' + (hPt / PT_PER_CM).toFixed(1) + ' cm'; }

  /** 여백(cm)을 적용한 새 영역을 계산한다. */
  function computeCrop(geom, cm) {
    var vis = visualSizePt(geom);
    var keepW = vis.w - (cm.left + cm.right) * PT_PER_CM;
    var keepH = vis.h - (cm.top + cm.bottom) * PT_PER_CM;
    var errs = [];
    if (keepW < MIN_KEEP_PT) errs.push('남는 너비가 없습니다(왼쪽+오른쪽 ' + fmt(cm.left + cm.right) + ' cm, 페이지 너비 ' + fmt(vis.w / PT_PER_CM) + ' cm)');
    if (keepH < MIN_KEEP_PT) errs.push('남는 높이가 없습니다(위+아래 ' + fmt(cm.top + cm.bottom) + ' cm, 페이지 높이 ' + fmt(vis.h / PT_PER_CM) + ' cm)');
    if (errs.length) return { ok: false, error: errs.join(', ') };
    var u = geom.userUnit || 1;
    var m = {};
    SIDES.forEach(function (k) { m[k] = (cm[k] * PT_PER_CM) / u; });
    var b = visualToBox(m, geom.rotation);
    var v = geom.view;
    var box = { x0: v.x0 + b.left, y0: v.y0 + b.bottom, x1: v.x1 - b.right, y1: v.y1 - b.top };
    return { ok: true, box: box, kept: { w: keepW, h: keepH } };
  }

  /** 파일 전체 계획: 페이지마다 어떤 규칙이 적용되고 결과가 어떻게 되는지 */
  function planDocument(rules, geoms) {
    var total = geoms.length;
    var asg = assignRules(rules, total);
    var margins = rules.map(ruleMargins);
    var pages = [];
    var counts = { crop: 0, keep: 0, none: 0, error: 0 };
    for (var p = 1; p <= total; p++) {
      var g = geoms[p - 1];
      var ri = asg.assign[p];
      var item = { page: p, rule: ri, orig: visualSizePt(g), status: 'none' };
      if (ri >= 0) {
        var mg = margins[ri];
        if (!mg.ok) { item.status = 'error'; item.error = mg.error; }
        else {
          item.cm = mg.cm;
          if (isZero(mg.cm)) item.status = 'keep';
          else {
            var c = computeCrop(g, mg.cm);
            if (c.ok) { item.status = 'crop'; item.kept = c.kept; }
            else { item.status = 'error'; item.error = c.error; }
          }
        }
      }
      counts[item.status]++;
      pages.push(item);
    }
    return { pages: pages, perRule: asg.perRule, margins: margins, counts: counts, total: total };
  }

  /** 규칙 목록 자체의 오류(페이지 표현, 여백 값) */
  function ruleProblems(rules) {
    var out = [];
    rules.forEach(function (rule, idx) {
      var ps = parsePageSpec(rule.pages);
      if (!ps.ok) out.push({ rule: idx, field: 'pages', error: ps.error });
      var mg = ruleMargins(rule);
      if (!mg.ok) out.push({ rule: idx, field: 'margins', error: mg.error });
    });
    return out;
  }

  /* ---------- PDF 처리 (pdf-lib 사용) ---------- */

  function looksLikePdf(bytes) {
    var n = Math.min(bytes.length, 1024);
    for (var i = 0; i + 4 < n; i++) {
      if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) return true;
    }
    return false;
  }

  function friendlyLoadError(e) {
    var msg = String((e && e.message) || e || '');
    if (/encrypt/i.test(msg)) {
      return '보안(암호)이 설정된 PDF라 자를 수 없습니다. PDF 뷰어에서 “인쇄 → PDF로 저장”으로 보안 없는 사본을 만든 뒤 다시 넣어 주세요.';
    }
    return 'PDF를 읽지 못했습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.';
  }

  async function loadDoc(PDFLib, bytes) {
    return PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  }

  /** 파일을 열어 페이지마다 보이는 영역과 회전을 읽는다. */
  async function inspectPdf(PDFLib, bytes) {
    var doc = await loadDoc(PDFLib, bytes);
    return doc.getPages().map(function (page) { return readGeometry(PDFLib, page); });
  }

  function r4(n) { return Math.round(n * 10000) / 10000; }

  function setBox(PDFLib, page, name, b) {
    var ctx = page.node.context;
    page.node.set(PDFLib.PDFName.of(name), ctx.obj([r4(b.x0), r4(b.y0), r4(b.x1), r4(b.y1)]));
  }

  function applyBox(PDFLib, page, box) {
    setBox(PDFLib, page, 'MediaBox', box);
    setBox(PDFLib, page, 'CropBox', box);
    ['TrimBox', 'BleedBox', 'ArtBox'].forEach(function (name) {
      var r = readRect(PDFLib, page, name, false);
      if (r) setBox(PDFLib, page, name, intersect(r, box) || box);
    });
  }

  /**
   * 규칙대로 자른 PDF를 만든다.
   * 자를 페이지가 하나도 없으면 원본 바이트를 그대로 돌려준다.
   */
  async function cropPdf(PDFLib, bytes, rules) {
    var doc = await loadDoc(PDFLib, bytes);
    var pages = doc.getPages();
    var geoms = pages.map(function (page) { return readGeometry(PDFLib, page); });
    var plan = planDocument(rules, geoms);
    var report = { total: pages.length, cropped: [], kept: [], untouched: [], errors: [] };
    plan.pages.forEach(function (item) {
      if (item.status === 'crop') {
        var c = computeCrop(geoms[item.page - 1], item.cm);
        applyBox(PDFLib, pages[item.page - 1], c.box);
        report.cropped.push(item.page);
      } else if (item.status === 'keep') report.kept.push(item.page);
      else if (item.status === 'none') report.untouched.push(item.page);
      else report.errors.push({ page: item.page, rule: item.rule, error: item.error });
    });
    if (!report.cropped.length) return { bytes: bytes, report: report, changed: false };
    try { doc.setModificationDate(new Date()); } catch (e) { /* 무시 */ }
    var out = await doc.save();
    return { bytes: out, report: report, changed: true };
  }

  /* ---------- 표시용 도우미 ---------- */

  function compressPages(list, maxParts) {
    var parts = [];
    var i = 0;
    while (i < list.length) {
      var j = i;
      while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
      parts.push(i === j ? String(list[i]) : list[i] + '–' + list[j]);
      i = j + 1;
    }
    if (maxParts && parts.length > maxParts) return parts.slice(0, maxParts).join(', ') + ' …';
    return parts.join(', ');
  }

  function outputName(name) {
    var base = String(name || 'document').replace(/\.pdf$/i, '');
    return base + '_cropped.pdf';
  }

  function uniqueNames(names) {
    var used = {};
    return names.map(function (n) {
      var cand = n;
      var k = 1;
      while (used[cand]) { k++; cand = n.replace(/(\.[^.]+)?$/, ' (' + k + ')$1'); }
      used[cand] = true;
      return cand;
    });
  }

  function uid(prefix) {
    return (prefix || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- 설정 데이터 정리 ---------- */

  function cleanStr(v, max) { return String(v == null ? '' : v).slice(0, max); }
  function cleanMargin(v) {
    if (typeof v === 'number' && isFinite(v) && v >= 0) return String(v);
    return cleanStr(v, 12);
  }

  /** 저장되었거나 가져온 설정을 안전한 모양으로 바꾼다. 쓸 수 없으면 null. */
  function sanitizeSettings(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.categories)) return null;
    var cats = [];
    var seen = {};
    obj.categories.slice(0, MAX_CATEGORIES).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var id = typeof c.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(c.id) && !seen[c.id] ? c.id : uid('c');
      seen[id] = true;
      var rules = Array.isArray(c.rules) ? c.rules.slice(0, MAX_RULES) : [];
      var rseen = {};
      cats.push({
        id: id,
        name: cleanStr(c.name, 60) || '이름 없는 카테고리',
        rules: rules.filter(function (r) { return r && typeof r === 'object'; }).map(function (r) {
          var rid = typeof r.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.id) && !rseen[r.id] ? r.id : uid('r');
          rseen[rid] = true;
          return {
            id: rid,
            label: cleanStr(r.label, 40),
            pages: cleanStr(r.pages == null ? '전체' : r.pages, 200),
            top: cleanMargin(r.top), bottom: cleanMargin(r.bottom),
            left: cleanMargin(r.left), right: cleanMargin(r.right)
          };
        })
      });
    });
    if (!cats.length) return null;
    var selectedId = cats.some(function (c) { return c.id === obj.selectedId; }) ? obj.selectedId : cats[0].id;
    return { categories: cats, selectedId: selectedId, updatedAt: Number(obj.updatedAt) || 0 };
  }

  /** 가져온 카테고리를 기존 목록에 합친다. 같은 id는 덮어쓰고 나머지는 뒤에 붙인다. */
  function mergeCategories(current, incoming) {
    var out = current.map(function (c) { return c; });
    var added = 0, replaced = 0;
    incoming.forEach(function (c) {
      var idx = -1;
      for (var i = 0; i < out.length; i++) if (out[i].id === c.id) { idx = i; break; }
      if (idx >= 0) { out[idx] = c; replaced++; } else { out.push(c); added++; }
    });
    return { categories: out, added: added, replaced: replaced };
  }

  /* ---------- ZIP (무압축, UTF-8 파일 이름) ---------- */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xffffffff;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** files: [{ name, data: Uint8Array }] → Blob(zip) */
  function makeZip(files, date) {
    var d = date || new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    var dosDate = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var enc = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = f.data;
      var crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  return {
    PT_PER_CM: PT_PER_CM,
    MAX_RULES: MAX_RULES,
    MAX_CATEGORIES: MAX_CATEGORIES,
    SIDES: SIDES,
    SIDE_LABEL: SIDE_LABEL,
    normalizeSpec: normalizeSpec,
    parsePageSpec: parsePageSpec,
    expandTerms: expandTerms,
    assignRules: assignRules,
    parseCm: parseCm,
    ruleMargins: ruleMargins,
    isZero: isZero,
    readGeometry: readGeometry,
    visualSizePt: visualSizePt,
    visualToBox: visualToBox,
    computeCrop: computeCrop,
    planDocument: planDocument,
    ruleProblems: ruleProblems,
    looksLikePdf: looksLikePdf,
    friendlyLoadError: friendlyLoadError,
    inspectPdf: inspectPdf,
    cropPdf: cropPdf,
    compressPages: compressPages,
    outputName: outputName,
    uniqueNames: uniqueNames,
    uid: uid,
    fmt: fmt,
    fmtSize: fmtSize,
    sanitizeSettings: sanitizeSettings,
    mergeCategories: mergeCategories,
    crc32: crc32,
    makeZip: makeZip
  };
});
