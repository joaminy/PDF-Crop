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
  var DEL_MAX = 2000;        // ‘삭제할 쪽’ 칸 글자 수 (쪽을 하나씩 눌러 넣어도 넉넉하게)
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
        // “12-”(12쪽부터 끝까지)인데 파일이 10쪽이면 해당하는 쪽이 없다
        if (t.to === 'last' && t.from !== 'last' && t.from > total) { beyond = true; continue; }
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

  /* ---------- 쪽 삭제 ---------- */

  /** ‘삭제할 쪽’ 칸을 해석한다. 비어 있으면 아무 쪽도 삭제하지 않는다. */
  function deletionPlan(spec, total) {
    var none = { ok: true, empty: true, pages: [], beyond: false, set: {} };
    if (!normalizeSpec(spec)) return none;
    var parsed = parsePageSpec(spec);
    if (!parsed.ok) return { ok: false, empty: false, error: parsed.error, pages: [], beyond: false, set: {} };
    var ex = expandTerms(parsed.terms, total);
    var set = {};
    ex.pages.forEach(function (p) { set[p] = true; });
    return { ok: true, empty: false, pages: ex.pages, beyond: ex.beyond, set: set };
  }

  /** ‘삭제할 쪽’ 칸의 오류 문구 (문제가 없거나 비어 있으면 null) */
  function deleteProblem(spec) {
    if (!normalizeSpec(spec)) return null;
    var p = parsePageSpec(spec);
    return p.ok ? null : p.error;
  }

  var WORD_TEXT = { all: '전체', odd: '홀수', even: '짝수' };

  /**
   * ‘삭제할 쪽’ 칸에 쪽 하나를 넣거나(add) 빼서(되살리기) 새 문자열을 만든다.
   * 숫자와 범위는 합쳐서 다시 쓰고(예: 3, 5에 4를 넣으면 3-5), 범위 안의 쪽을 빼면 범위를 나눈다.
   * 홀수·짝수로 지정된 쪽은 하나만 뺄 수 없으므로 이유를 돌려준다.
   */
  function editDeleteSpec(spec, page, total, add) {
    var src = String(spec == null ? '' : spec);
    var terms = [];
    if (normalizeSpec(src)) {
      var parsed = parsePageSpec(src);
      if (!parsed.ok) return { ok: false, reason: 'invalid', error: parsed.error };
      terms = parsed.terms;
    }
    var covered = expandTerms(terms, total).pages.indexOf(page) !== -1;
    if (add === covered) return { ok: true, spec: src, changed: false };
    var iv = [];   // 닫힌 범위 [처음, 끝]
    var rest = []; // { kind: 'from', n } = n쪽부터 끝까지, { kind: 'last' }, { kind: 'all'|'odd'|'even' }
    terms.forEach(function (t) {
      if (t.type !== 'range') { rest.push({ kind: t.type }); return; }
      if (t.from === 'last' && t.to === 'last') { rest.push({ kind: 'last' }); return; }
      if (t.from === 'last' || t.to === 'last') { rest.push({ kind: 'from', n: t.from === 'last' ? t.to : t.from }); return; }
      iv.push([Math.min(t.from, t.to), Math.max(t.from, t.to)]);
    });
    function covers(r, p) {
      if (r.kind === 'all') return true;
      if (r.kind === 'odd') return p % 2 === 1;
      if (r.kind === 'even') return p % 2 === 0;
      if (r.kind === 'last') return p === total;
      return r.n <= p && p <= total;
    }
    if (add) iv.push([page, page]);
    else {
      for (var i = 0; i < rest.length; i++) {
        if ((rest[i].kind === 'odd' || rest[i].kind === 'even') && covers(rest[i], page)) {
          return { ok: false, reason: 'pattern', word: WORD_TEXT[rest[i].kind] };
        }
      }
      var keepRest = [];
      rest.forEach(function (r) {
        if (!covers(r, page)) { keepRest.push(r); return; }
        if (r.kind === 'last') return;
        // n쪽부터 끝까지(또는 전체) → n ~ (page-1)쪽 + (page+1)쪽부터 끝까지. 마지막 쪽을 되살리면 뒤쪽은 남기지 않는다
        var n = r.kind === 'all' ? 1 : r.n;
        if (n <= page - 1) iv.push([n, page - 1]);
        if (page < total) keepRest.push({ kind: 'from', n: page + 1 });
      });
      rest = keepRest;
      var cut = [];
      iv.forEach(function (r) {
        if (page < r[0] || page > r[1]) { cut.push(r); return; }
        if (r[0] <= page - 1) cut.push([r[0], page - 1]);
        if (page + 1 <= r[1]) cut.push([page + 1, r[1]]);
      });
      iv = cut;
    }
    iv.sort(function (x, y) { return x[0] - y[0]; });
    var merged = [];
    iv.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    });
    var parts = merged.map(function (r) { return r[0] === r[1] ? String(r[0]) : r[0] + '-' + r[1]; });
    rest.forEach(function (r) {
      if (r.kind === 'from') parts.push(r.n + '-');
      else if (r.kind === 'last') parts.push('마지막');
      else parts.push(WORD_TEXT[r.kind]);
    });
    return { ok: true, spec: parts.join(', '), changed: true };
  }

  /** 파일 전체 계획: 페이지마다 어떤 규칙이 적용되고 결과가 어떻게 되는지 (삭제할 쪽은 규칙보다 앞선다) */
  function planDocument(rules, geoms, delSpec) {
    var total = geoms.length;
    var asg = assignRules(rules, total);
    var margins = rules.map(ruleMargins);
    var del = deletionPlan(delSpec, total);
    var pages = [];
    var counts = { crop: 0, keep: 0, none: 0, error: 0, 'delete': 0 };
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
      if (del.set[p]) { item.deleted = true; item.status = 'delete'; }
      counts[item.status]++;
      pages.push(item);
    }
    // 규칙별 쪽 목록에서는 삭제할 쪽을 빼고 따로 적어 둔다
    asg.perRule.forEach(function (pr) {
      pr.deleted = pr.pages.filter(function (p) { return del.set[p]; });
      if (pr.deleted.length) pr.pages = pr.pages.filter(function (p) { return !del.set[p]; });
    });
    return { pages: pages, perRule: asg.perRule, margins: margins, counts: counts, total: total, del: del, remain: total - del.pages.length };
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

  /** 쪽에 붙은 주석(링크·입력 칸 등)의 참조 목록 */
  function annotRefs(PDFLib, page) {
    var a = page.node.context.lookup(page.node.get(PDFLib.PDFName.of('Annots')));
    return a instanceof PDFLib.PDFArray ? a.asArray().filter(function (r) { return r instanceof PDFLib.PDFRef; }) : [];
  }

  /**
   * 쪽 하나를 그림 한 장(보이는 부분만 담은 JPEG)으로 바꾼다.
   * 쪽 사전을 비워(종류·부모만 남김) 원래 내용·자원·주석·미리보기 그림 등을 모두 떼어 낸다.
   * 떼어 낸 객체는 cleanupPages가 파일에서 뺀다.
   */
  function replaceWithImage(PDFLib, page, imgRef, wPt, hPt) {
    var L = PDFLib;
    var node = page.node;
    var ctx = node.context;
    var N = function (s) { return L.PDFName.of(s); };
    node.keys().forEach(function (k) { if (k !== N('Type') && k !== N('Parent')) node.delete(k); });
    var uu = Math.max(1, Math.ceil(Math.max(wPt, hPt) / 14400)); // PDF 쪽 크기 한도(200인치)를 넘으면 단위를 키운다
    var w = r4(wPt / uu), h = r4(hPt / uu);
    node.set(N('MediaBox'), ctx.obj([0, 0, w, h]));
    node.set(N('CropBox'), ctx.obj([0, 0, w, h]));
    node.set(N('Rotate'), ctx.obj(0));
    if (uu > 1) node.set(N('UserUnit'), ctx.obj(uu));
    var xo = ctx.obj({});
    xo.set(N('Im0'), imgRef);
    var res = ctx.obj({});
    res.set(N('XObject'), xo);
    node.set(N('Resources'), res);
    node.set(N('Contents'), ctx.register(ctx.stream('q ' + w + ' 0 0 ' + h + ' 0 0 cm /Im0 Do Q')));
  }

  /**
   * 쪽 삭제·완전히 지우기 뒤의 정리.
   * 지운 쪽은 쪽 목록에서 빼고, 그 쪽을 가리키던 책갈피·링크·이름 붙은 위치를 정리한다.
   * 지운 쪽과 그림으로 바꾼 쪽에 있던 주석·입력 칸은 뺀다(그림으로 바꾼 쪽의 것은 그림에 이미 합쳐져 있다).
   * 끝으로 어디에서도 쓰이지 않는 객체(원래 내용·그림·주석)를 파일에서 뺀다. 다른 쪽과 함께 쓰는 글꼴·그림은 남는다.
   * pages: 바꾸기 전의 쪽 목록, delIdx: 지울 쪽 번호(0부터, 오름차순), erasedIdx: 그림으로 바꾼 쪽 번호(0부터),
   * erasedAnnots: 그림으로 바꾸기 전에 그 쪽들에 붙어 있던 주석 참조
   */
  function cleanupPages(PDFLib, doc, pages, delIdx, erasedIdx, erasedAnnots) {
    var L = PDFLib;
    var ctx = doc.context;
    var cat = doc.catalog;
    var N = function (s) { return L.PDFName.of(s); };
    var lk = function (o) { return o instanceof L.PDFRef ? ctx.lookup(o) : o; };
    var isDict = function (o) { return o instanceof L.PDFDict; };
    var isArr = function (o) { return o instanceof L.PDFArray; };
    var delSet = {};
    delIdx.forEach(function (i) { delSet[i] = true; });
    var erasedSet = new Set();
    (erasedIdx || []).forEach(function (i) { erasedSet.add(pages[i].ref); });

    // 지울 쪽 객체 (같은 객체가 남는 쪽에도 쓰이면 지우지 않는다)
    var keptRefs = new Set();
    pages.forEach(function (pg, i) { if (!delSet[i]) keptRefs.add(pg.ref); });
    var gone = new Set();
    pages.forEach(function (pg, i) { if (delSet[i] && !keptRefs.has(pg.ref)) gone.add(pg.ref); });
    function annotsOf(pg) { var a = lk(pg.node.get(N('Annots'))); return isArr(a) ? a : null; }
    var goneAnnots = new Set(erasedAnnots || []);
    pages.forEach(function (pg) {
      if (!gone.has(pg.ref)) return;
      var a = annotsOf(pg);
      if (a) a.asArray().forEach(function (r) { if (r instanceof L.PDFRef) goneAnnots.add(r); });
    });
    pages.forEach(function (pg) {
      if (gone.has(pg.ref)) return;
      var a = annotsOf(pg);
      if (a) a.asArray().forEach(function (r) { goneAnnots.delete(r); });
    });

    // 쪽 목록에서 빼기 (뒤에서부터)
    for (var k = delIdx.length - 1; k >= 0; k--) doc.removePage(delIdx[k]);

    // 이름 붙은 위치(named destination) 모으기
    function flatten(node, key, out, depth) {
      node = lk(node);
      if (!isDict(node) || depth > 40) return out;
      var arr = lk(node.get(N(key)));
      if (isArr(arr)) for (var i = 0; i + 1 < arr.size(); i += 2) out.push([arr.get(i), arr.get(i + 1)]);
      var kids = lk(node.get(N('Kids')));
      if (isArr(kids)) kids.asArray().forEach(function (kid) { flatten(kid, key, out, depth + 1); });
      return out;
    }
    function keyOf(o) {
      o = lk(o);
      try {
        if (o instanceof L.PDFName) return o.decodeText();
        if (o instanceof L.PDFString || o instanceof L.PDFHexString) return o.decodeText();
      } catch (e) { /* 읽을 수 없는 이름 */ }
      return null;
    }
    var names = lk(cat.get(N('Names')));
    var destTree = isDict(names) ? lk(names.get(N('Dests'))) : null;
    var treeDests = isDict(destTree) ? flatten(destTree, 'Names', [], 0) : [];
    var oldDests = lk(cat.get(N('Dests')));
    var named = new Map();
    treeDests.forEach(function (e) { var kk = keyOf(e[0]); if (kk !== null && !named.has(kk)) named.set(kk, e[1]); });
    if (isDict(oldDests)) oldDests.entries().forEach(function (e) { var kk = keyOf(e[0]); if (kk !== null && !named.has(kk)) named.set(kk, e[1]); });

    function destPage(d, depth) {
      d = lk(d);
      if (depth > 8 || !d) return null;
      if (isArr(d)) { var first = d.size() ? d.get(0) : null; return first instanceof L.PDFRef ? first : null; }
      if (isDict(d)) return destPage(d.get(N('D')), depth + 1);
      var kk = keyOf(d);
      return kk !== null && named.has(kk) ? destPage(named.get(kk), depth + 1) : null;
    }
    function actionPage(a) {
      a = lk(a);
      if (!isDict(a) || lk(a.get(N('S'))) !== N('GoTo')) return null;
      return destPage(a.get(N('D')), 0);
    }
    function pointsToGone(dict) {
      var d = dict.get(N('Dest'));
      var t = d ? destPage(d, 0) : actionPage(dict.get(N('A')));
      return !!(t && gone.has(t));
    }

    // 문서를 열 때 지운 쪽으로 가라는 설정
    var oa = cat.get(N('OpenAction'));
    if (oa) {
      var oaPage = isArr(lk(oa)) ? destPage(oa, 0) : actionPage(oa);
      if (oaPage && gone.has(oaPage)) cat.delete(N('OpenAction'));
    }

    // 책갈피: 지운 쪽을 가리키는 항목은 뺀다 (아래 항목이 남아 있으면 이동 없는 묶음으로 남긴다)
    function pruneOutline(node, depth) {
      var kids = [];
      var seen = new Set();
      var cur = node.get(N('First'));
      while (cur instanceof L.PDFRef && !seen.has(cur) && kids.length < 100000) {
        seen.add(cur);
        var it = ctx.lookup(cur);
        if (!isDict(it)) break;
        kids.push({ ref: cur, item: it, sub: 0 });
        cur = it.get(N('Next'));
      }
      var kept = [];
      kids.forEach(function (kd) {
        kd.sub = depth < 40 ? pruneOutline(kd.item, depth + 1) : 0;
        var hasKids = kd.item.get(N('First')) instanceof L.PDFRef;
        if (pointsToGone(kd.item)) {
          if (!hasKids) return;
          kd.item.delete(N('Dest'));
          kd.item.delete(N('A'));
        }
        var c = lk(kd.item.get(N('Count')));
        if (!hasKids) kd.item.delete(N('Count'));
        else if (c instanceof L.PDFNumber && c.asNumber() !== 0) kd.item.set(N('Count'), ctx.obj(c.asNumber() > 0 ? kd.sub : -kd.sub));
        kept.push(kd);
      });
      kept.forEach(function (kd, i) {
        if (i > 0) kd.item.set(N('Prev'), kept[i - 1].ref); else kd.item.delete(N('Prev'));
        if (i < kept.length - 1) kd.item.set(N('Next'), kept[i + 1].ref); else kd.item.delete(N('Next'));
      });
      if (kept.length) { node.set(N('First'), kept[0].ref); node.set(N('Last'), kept[kept.length - 1].ref); }
      else { node.delete(N('First')); node.delete(N('Last')); }
      var vis = 0;
      kept.forEach(function (kd) {
        var c = lk(kd.item.get(N('Count')));
        vis += 1 + (c instanceof L.PDFNumber && c.asNumber() > 0 ? kd.sub : 0);
      });
      return vis;
    }
    var outlines = lk(cat.get(N('Outlines')));
    if (isDict(outlines)) {
      var vis = pruneOutline(outlines, 0);
      if (outlines.get(N('First'))) outlines.set(N('Count'), ctx.obj(vis));
      else cat.delete(N('Outlines'));
    }

    // 이름 붙은 위치: 지운 쪽을 가리키는 것은 뺀다
    if (isDict(destTree)) {
      var keepPairs = [];
      treeDests.forEach(function (e) {
        var t = destPage(e[1], 0);
        if (!(t && gone.has(t))) keepPairs.push(e[0], e[1]);
      });
      if (keepPairs.length) {
        var flat = ctx.obj({});
        flat.set(N('Names'), ctx.obj(keepPairs));
        names.set(N('Dests'), ctx.register(flat));
      } else names.delete(N('Dests'));
    }
    if (isDict(oldDests)) {
      oldDests.entries().forEach(function (e) {
        var t = destPage(e[1], 0);
        if (t && gone.has(t)) oldDests.delete(e[0]);
      });
    }

    // 남는 쪽의 링크 중 지운 쪽으로 가는 것은 뺀다
    pages.forEach(function (pg, i) {
      if (delSet[i]) return;
      var a = annotsOf(pg);
      if (!a) return;
      for (var j = a.size() - 1; j >= 0; j--) {
        var ar = a.get(j);
        var an = lk(ar);
        if (goneAnnots.has(ar)) { a.remove(j); continue; }
        if (isDict(an) && lk(an.get(N('Subtype'))) === N('Link') && pointsToGone(an)) a.remove(j);
      }
    });

    // 양식: 지운 쪽에만 있던 칸은 뺀다 (값이 남지 않게)
    var acro = lk(cat.get(N('AcroForm')));
    if (isDict(acro)) {
      var removedFields = new Set();
      var keepField = function (ref, depth) {
        var f = lk(ref);
        if (!isDict(f) || depth > 40) return true;
        var kids = lk(f.get(N('Kids')));
        if (isArr(kids) && kids.size()) {
          for (var j = kids.size() - 1; j >= 0; j--) {
            var kr = kids.get(j);
            if (!keepField(kr, depth + 1)) { kids.remove(j); removedFields.add(kr); }
          }
          return kids.size() > 0;
        }
        if (ref instanceof L.PDFRef && goneAnnots.has(ref)) return false;
        var p = f.get(N('P'));
        return !(lk(f.get(N('Subtype'))) === N('Widget') && p instanceof L.PDFRef && (gone.has(p) || erasedSet.has(p)));
      };
      var fields = lk(acro.get(N('Fields')));
      if (isArr(fields)) {
        for (var fi = fields.size() - 1; fi >= 0; fi--) {
          var fr = fields.get(fi);
          if (!keepField(fr, 0)) { fields.remove(fi); removedFields.add(fr); }
        }
      }
      acro.delete(N('XFA'));
      var co = lk(acro.get(N('CO')));
      if (isArr(co)) for (var ci = co.size() - 1; ci >= 0; ci--) if (removedFields.has(co.get(ci)) || goneAnnots.has(co.get(ci))) co.remove(ci);
    }

    // 태그(접근성 구조)·기사 흐름은 쪽마다 얽혀 있어 정리하지 않고 뺀다 (보이는 내용에는 영향 없음)
    if (cat.get(N('StructTreeRoot'))) { cat.delete(N('StructTreeRoot')); cat.delete(N('MarkInfo')); }
    if (cat.get(N('Threads'))) {
      cat.delete(N('Threads'));
      pages.forEach(function (pg, i) { if (!delSet[i]) pg.node.delete(N('B')); });
    }

    // 쪽 번호 표시(PageLabels): 남는 쪽이 원래 번호를 그대로 보이도록 다시 만든다
    var pl = delIdx.length ? lk(cat.get(N('PageLabels'))) : null;
    if (isDict(pl)) {
      try {
        var nums = flatten(pl, 'Nums', [], 0).map(function (e) { return [lk(e[0]), lk(e[1])]; })
          .filter(function (e) { return e[0] instanceof L.PDFNumber && isDict(e[1]); })
          .map(function (e) { return [e[0].asNumber(), e[1]]; })
          .sort(function (x, y) { return x[0] - y[0]; });
        if (!nums.length || nums[0][0] !== 0) throw new Error('labels');
        var outNums = [];
        var prev = null;
        var ni = 0;
        pages.forEach(function (pg, orig) {
          if (delSet[orig]) return;
          var r = null;
          for (var q = nums.length - 1; q >= 0; q--) if (nums[q][0] <= orig) { r = nums[q]; break; }
          var d = r[1];
          var st = lk(d.get(N('St')));
          var number = (st instanceof L.PDFNumber ? st.asNumber() : 1) + (orig - r[0]);
          var styled = !!d.get(N('S'));
          if (!(prev && prev.r === r && (!styled || number === prev.number + 1))) {
            var nd = ctx.obj({});
            if (d.get(N('S'))) nd.set(N('S'), d.get(N('S')));
            if (d.get(N('P'))) nd.set(N('P'), d.get(N('P')));
            if (styled && number !== 1) nd.set(N('St'), ctx.obj(number));
            outNums.push(ctx.obj(ni), nd);
          }
          prev = { r: r, number: number };
          ni++;
        });
        var npl = ctx.obj({});
        npl.set(N('Nums'), ctx.obj(outNums));
        cat.set(N('PageLabels'), ctx.register(npl));
      } catch (e) {
        cat.delete(N('PageLabels'));
      }
    }

    // 남은 연결 중 지운 쪽·지운 주석을 가리키는 것은 끊고, 어디에서도 쓰이지 않는 객체는 파일에서 뺀다
    var isGone = function (v) { return v instanceof L.PDFRef && (gone.has(v) || goneAnnots.has(v)); };
    var reach = new Set();
    var work = [];
    var mark = function (v) {
      if (v instanceof L.PDFRef) {
        if (reach.has(v)) return;
        reach.add(v);
        var o = ctx.lookup(v);
        if (o) work.push(o);
      } else if (v instanceof L.PDFDict || v instanceof L.PDFArray || v instanceof L.PDFStream) work.push(v);
    };
    var tr = ctx.trailerInfo || {};
    [tr.Root, tr.Info, tr.Encrypt].forEach(function (v) { if (v) mark(v); });
    while (work.length) {
      var o = work.pop();
      if (o instanceof L.PDFStream) o = o.dict;
      if (isDict(o)) {
        o.entries().forEach(function (e) {
          if (isGone(e[1])) o.delete(e[0]);
          else mark(e[1]);
        });
      } else if (isArr(o)) {
        for (var j = o.size() - 1; j >= 0; j--) {
          var v = o.get(j);
          if (isGone(v)) { if (goneAnnots.has(v)) o.remove(j); else o.set(j, L.PDFNull); }
          else mark(v);
        }
      }
    }
    ctx.enumerateIndirectObjects().forEach(function (pair) { if (!reach.has(pair[0])) ctx.delete(pair[0]); });
  }

  /** 그림으로 바꿀 쪽에 대해, 보이는 방향 기준으로 어디를 남길지(pt) */
  function rasterRequest(geom, item) {
    var vis = visualSizePt(geom);
    var cm = item.cm;
    return {
      page: item.page,
      vis: vis,
      crop: { left: cm.left * PT_PER_CM, top: cm.top * PT_PER_CM, right: cm.right * PT_PER_CM, bottom: cm.bottom * PT_PER_CM },
      kept: { w: item.kept.w, h: item.kept.h }
    };
  }

  function userError(code, msg) { var e = new Error(code); e.user = msg; return e; }

  /**
   * 그린 그림을 PDF 그림 객체로 넣는다.
   * shot.gray = { width, height, data }: 회색조 8비트를 zlib으로 압축한 것(무손실, 흑백 문서에 작음)
   * shot.jpg: JPEG 바이트(색이 있는 쪽)
   */
  async function embedShot(PDFLib, doc, shot) {
    if (shot && shot.gray) {
      var g = shot.gray;
      if (!(g.width > 0 && g.height > 0 && g.data && g.data.length)) return null;
      var ctx = doc.context;
      return ctx.register(ctx.stream(g.data, {
        Type: 'XObject', Subtype: 'Image', Width: Math.round(g.width), Height: Math.round(g.height),
        ColorSpace: 'DeviceGray', BitsPerComponent: 8, Filter: 'FlateDecode'
      }));
    }
    if (shot && shot.jpg && shot.jpg.length) {
      var img = await doc.embedJpg(shot.jpg);
      await img.embed();
      return img.ref;
    }
    return null;
  }

  /** 남길 영역(box, 회전 전 좌표)과 전혀 겹치지 않는 주석 참조 목록 — 잘라낸 곳에만 있는 메모·입력 칸 등 */
  function annotsOutside(PDFLib, page, box) {
    var ctx = page.node.context;
    return annotRefs(PDFLib, page).filter(function (ref) {
      var a = ctx.lookup(ref);
      if (!(a instanceof PDFLib.PDFDict)) return false;
      var r = ctx.lookup(a.get(PDFLib.PDFName.of('Rect')));
      if (!(r instanceof PDFLib.PDFArray) || r.size() !== 4) return false;
      var nums = [];
      for (var i = 0; i < 4; i++) { var n = num(ctx, r.get(i)); if (!isFinite(n)) return false; nums.push(n); }
      var x0 = Math.min(nums[0], nums[2]), x1 = Math.max(nums[0], nums[2]);
      var y0 = Math.min(nums[1], nums[3]), y1 = Math.max(nums[1], nums[3]);
      return x1 <= box.x0 || x0 >= box.x1 || y1 <= box.y0 || y0 >= box.y1;
    });
  }

  /**
   * 규칙대로 자르고 ‘삭제할 쪽’을 뺀 PDF를 만든다.
   * 자르거나 삭제할 쪽이 하나도 없으면 원본 바이트를 그대로 돌려준다.
   * opts.erase가 켜져 있으면 잘라낸 부분을 복구할 수 없게 한다. 방식은 두 가지다.
   *  - opts.redact(바이트, 요청들, 진행) 가 있으면: 잘라낸 부분의 글자·그림·도형을 PDF 안에서 지우고(MuPDF),
   *    남는 부분은 원래 그대로 둔 채 자른다. 잘라낸 곳에만 있는 주석·입력 칸도 뺀다.
   *  - opts.rasterize(요청) 가 있으면: 자른 쪽마다 보이는 부분만 그린 그림을 받아 그 쪽을 그림 한 장으로 바꾼다.
   * opts.onProgress(끝난 쪽 수, 전체 쪽 수)로 진행 상황을 알린다.
   */
  async function cropPdf(PDFLib, bytes, rules, delSpec, opts) {
    opts = opts || {};
    var doc = await loadDoc(PDFLib, bytes);
    var pages = doc.getPages();
    var geoms = pages.map(function (page) { return readGeometry(PDFLib, page); });
    var plan = planDocument(rules, geoms, delSpec);
    var report = { total: pages.length, cropped: [], kept: [], untouched: [], errors: [], deleted: [], erased: [] };
    var cropItems = [];
    plan.pages.forEach(function (item) {
      if (item.status === 'delete') report.deleted.push(item.page);
      else if (item.status === 'crop') {
        cropItems.push(item);
        report.cropped.push(item.page);
      } else if (item.status === 'keep') report.kept.push(item.page);
      else if (item.status === 'none') report.untouched.push(item.page);
      else report.errors.push({ page: item.page, rule: item.rule, error: item.error });
    });
    if (plan.del && !plan.del.ok) {
      var bad = new Error('delete spec'); bad.user = '‘삭제할 쪽’ 칸을 고쳐 주세요: ' + plan.del.error; throw bad;
    }
    if (report.deleted.length >= pages.length) {
      var all = new Error('all pages deleted'); all.user = '모든 쪽이 삭제되도록 지정되어 있어 결과 파일을 만들 수 없습니다. 적어도 한 쪽은 남겨 주세요.'; throw all;
    }
    if (!report.cropped.length && !report.deleted.length) return { bytes: bytes, report: report, changed: false };
    var erase = !!opts.erase && cropItems.length > 0;
    var redact = erase && typeof opts.redact === 'function';
    if (erase && !redact && typeof opts.rasterize !== 'function') throw userError('no rasterizer', '잘라낸 부분을 완전히 지우는 기능을 쓸 수 없는 환경입니다.');
    var erasedIdx = [];
    var erasedAnnots = [];
    if (redact) {
      // 1) 잘라낸 부분의 내용을 지운 PDF를 받아 다시 연다 (쪽 크기·회전은 그대로)
      var reqs = cropItems.map(function (item) { return rasterRequest(geoms[item.page - 1], item); });
      var cleaned = await opts.redact(bytes, reqs, opts.onProgress);
      if (!cleaned || !cleaned.length) throw userError('redact failed', '잘라낸 부분을 지우지 못했습니다.');
      doc = await loadDoc(PDFLib, cleaned);
      pages = doc.getPages();
      if (pages.length !== geoms.length) throw userError('redact pages', '잘라낸 부분을 지우는 중에 쪽 수가 달라져 멈췄습니다.');
      // 2) 평소처럼 자르고, 잘라낸 곳에만 있는 주석·입력 칸은 뺀다
      cropItems.forEach(function (item) {
        var pg = pages[item.page - 1];
        var c = computeCrop(readGeometry(PDFLib, pg), item.cm);
        applyBox(PDFLib, pg, c.box);
        var out = annotsOutside(PDFLib, pg, c.box);
        if (out.length) {
          var arr = pg.node.context.lookup(pg.node.get(PDFLib.PDFName.of('Annots')));
          for (var j = arr.size() - 1; j >= 0; j--) if (out.indexOf(arr.get(j)) !== -1) arr.remove(j);
          erasedAnnots = erasedAnnots.concat(out);
        }
        report.erased.push(item.page);
      });
      report.method = 'redact';
    } else if (erase) {
      var done = 0;
      for (var k = 0; k < cropItems.length; k++) {
        var item = cropItems[k];
        var idx = item.page - 1;
        var req = rasterRequest(geoms[idx], item);
        var shot = await opts.rasterize(req);
        var imgRef = await embedShot(PDFLib, doc, shot);
        if (!imgRef) throw userError('raster failed', item.page + '쪽을 그림으로 바꾸지 못해 잘라낸 부분을 지우지 못했습니다.');
        erasedAnnots = erasedAnnots.concat(annotRefs(PDFLib, pages[idx]));
        replaceWithImage(PDFLib, pages[idx], imgRef, req.kept.w, req.kept.h);
        erasedIdx.push(idx);
        report.erased.push(item.page);
        done++;
        if (opts.onProgress) await opts.onProgress(done, cropItems.length);
      }
      report.method = 'image';
    } else {
      cropItems.forEach(function (item) {
        var c = computeCrop(geoms[item.page - 1], item.cm);
        applyBox(PDFLib, pages[item.page - 1], c.box);
      });
    }
    if (report.deleted.length || erase) {
      cleanupPages(PDFLib, doc, pages, report.deleted.map(function (p) { return p - 1; }), erasedIdx, erasedAnnots);
    }
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
        deletePages: cleanStr(c.deletePages, DEL_MAX),
        erase: c.erase === true,
        eraseMode: c.eraseMode === 'image' ? 'image' : 'redact',
        eraseDpi: Number(c.eraseDpi) === 300 ? 300 : 200,
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
    DEL_MAX: DEL_MAX,
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
    deletionPlan: deletionPlan,
    deleteProblem: deleteProblem,
    editDeleteSpec: editDeleteSpec,
    cleanupPages: cleanupPages,
    replaceWithImage: replaceWithImage,
    annotsOutside: annotsOutside,
    rasterRequest: rasterRequest,
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
