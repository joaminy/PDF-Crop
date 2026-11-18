/*
 * 잘라낸 부분을 PDF 내용에서 실제로 지운다 (MuPDF 사용, 기기 안에서만 처리).
 * - 잘릴 띠(위·아래·왼쪽·오른쪽 여백과 그 바깥)에 있는 글자는 글자 단위로, 그림은 화소 단위로, 도형은 띠에 완전히 들어간 것을 지운다.
 * - 남는 부분의 글자·도형·그림은 원래 그대로 둔다(글자는 계속 선택·검색됨).
 * - 띠에 걸쳐 화소가 바뀐 그림은, 원래 JPEG(손실 압축)였으면 비슷한 품질의 JPEG로 다시 저장해 파일이 불어나지 않게 한다.
 * 이 파일은 브라우저의 작업 스레드(module worker)로 실행되고, Node 시험에서는 require로 불러 쓴다.
 * MuPDF: AGPL-3.0 (vendor/mupdf/LICENSE.txt)
 */
(function (root) {
  'use strict';

  var STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];

  /** JPEG 양자화표로 원래 품질(1~100)을 어림한다 (IJG 기준). 못 찾으면 0 */
  function estimateJpegQuality(u8) {
    for (var i = 2; i + 4 < u8.length;) {
      if (u8[i] !== 0xff) { i++; continue; }
      var m = u8[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xda || m === 0xd9) break;
      var len = (u8[i + 2] << 8) | u8[i + 3];
      if (m === 0xdb) {
        var p = i + 4, end = i + 2 + len;
        while (p < end) {
          var pq = u8[p] >> 4, tq = u8[p] & 15;
          p++;
          var sum = 0;
          for (var k = 0; k < 64; k++) { sum += pq ? ((u8[p + 2 * k] << 8) | u8[p + 2 * k + 1]) : u8[p + k]; }
          p += pq ? 128 : 64;
          if (tq === 0) {
            var stdSum = 0;
            for (var s = 0; s < 64; s++) stdSum += STD_LUMA[s];
            var scale = (sum / stdSum) * 100;
            var q = scale <= 100 ? (200 - scale) / 2 : 5000 / scale;
            return Math.max(1, Math.min(100, Math.round(q)));
          }
        }
      }
      i += 2 + len;
    }
    return 0;
  }

  function nameOf(v) { try { return v && v.isName && v.isName() ? v.asName() : null; } catch (e) { return null; } }
  function filters(obj) {
    var f = obj.get('Filter');
    if (!f || f.isNull()) return [];
    if (f.isArray()) { var out = []; f.forEach(function (v) { out.push(nameOf(v)); }); return out; }
    return [nameOf(f)];
  }
  function resourcesOf(pageObj) {
    var r = pageObj.getInheritable('Resources');
    return r && !r.isNull() ? r : null;
  }

  /** 쪽(과 그 안의 묶음)이 쓰는 그림 목록: [{ dict(XObject 사전), key, obj, num }] */
  function collectImages(pageObj) {
    var out = [];
    var seen = {};
    function walk(res, depth) {
      if (!res || depth > 12) return;
      var xo = res.get('XObject');
      if (!xo || !xo.isDictionary()) return;
      xo.forEach(function (val, key) {
        // 스트림 여부·내용은 참조(간접 객체)로 물어야 한다
        if (!val || !val.isStream()) return;
        var st = nameOf(val.get('Subtype'));
        var num = val.isIndirect() ? val.asIndirect() : -1;
        if (st === 'Image') out.push({ dict: xo, key: key, obj: val, num: num });
        else if (st === 'Form') {
          if (num >= 0) { if (seen[num]) return; seen[num] = true; }
          walk(val.get('Resources'), depth + 1);
        }
      });
    }
    walk(resourcesOf(pageObj), 0);
    return out;
  }

  function imageInfo(o) {
    var n = function (k) { var v = o.get(k); return v && v.isNumber && v.isNumber() ? v.asNumber() : 0; };
    var sm = o.get('SMask'), mk = o.get('Mask'), im = o.get('ImageMask');
    return {
      w: n('Width'), h: n('Height'), bpc: n('BitsPerComponent'), filters: filters(o),
      masked: !!((sm && !sm.isNull()) || (mk && !mk.isNull()) || (im && im.isBoolean && im.isBoolean() && im.asBoolean()))
    };
  }

  /**
   * bytes: PDF, requests: [{ page(1부터), vis:{w,h}, crop:{left,top,right,bottom} (보이는 방향, pt) }]
   * 돌려줌: { bytes, reencoded: 다시 JPEG로 저장한 그림 수 }
   */
  async function redactPdf(mupdf, bytes, requests, onProgress) {
    var doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    var pdf = doc.asPDF ? doc.asPDF() : doc;
    if (!pdf || typeof pdf.loadPage !== 'function') throw new Error('not a PDF');
    var BIG = 1e6;
    var reencoded = 0;
    for (var i = 0; i < requests.length; i++) {
      var req = requests[i];
      var page = pdf.loadPage(req.page - 1);
      var pageObj = page.getObject();
      // 바꾸기 전 그림들: 객체 번호 → 정보
      var before = {};
      var beforeList = collectImages(pageObj).map(function (e) { var inf = imageInfo(e.obj); inf.num = e.num; inf.obj = e.obj; if (e.num >= 0) before[e.num] = inf; return inf; });
      var b = page.getBounds();
      var sx = (b[2] - b[0]) / req.vis.w, sy = (b[3] - b[1]) / req.vis.h;
      var T = b[1] + req.crop.top * sy, B = b[3] - req.crop.bottom * sy;
      var L = b[0] + req.crop.left * sx, R = b[2] - req.crop.right * sx;
      var bands = [[-BIG, -BIG, BIG, T], [-BIG, B, BIG, BIG], [-BIG, -BIG, L, BIG], [R, -BIG, BIG, BIG]];
      bands.forEach(function (r) {
        if (r[2] - r[0] <= 0 || r[3] - r[1] <= 0) return;
        var a = page.createAnnotation('Redact');
        a.setRect(r);
      });
      page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_PIXELS, mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED, mupdf.PDFPage.REDACT_TEXT_REMOVE);
      // 화소가 바뀌어 새로 만들어진 그림: 원래 JPEG·JPEG2000이었으면 JPEG로 다시 저장
      collectImages(page.getObject()).forEach(function (e) {
        if (e.num >= 0 && before[e.num]) return;
        var now = imageInfo(e.obj);
        if (now.masked || now.bpc !== 8) return;
        var src = null;
        for (var k = 0; k < beforeList.length; k++) {
          var c = beforeList[k];
          var lossy = c.filters.indexOf('DCTDecode') !== -1 || c.filters.indexOf('JPXDecode') !== -1;
          // JPEG2000은 사전에 BitsPerComponent가 없을 수 있다
          if (lossy && c.w === now.w && c.h === now.h && (c.bpc === now.bpc || c.bpc === 0)) { src = c; break; }
        }
        if (!src) return;
        var q = 90;
        if (src.filters.length === 1 && src.filters[0] === 'DCTDecode') {
          try { var est = estimateJpegQuality(src.obj.readRawStream().asUint8Array()); if (est) q = Math.max(70, Math.min(95, est + 2)); } catch (err) { /* 기본값 */ }
        }
        try {
          var pix = pdf.loadImage(e.obj).toPixmap();
          if (pix.getAlpha && pix.getAlpha()) return;
          var jpg = pix.asJPEG(q);
          var ref = pdf.addImage(new mupdf.Image(jpg));
          e.dict.put(e.key, ref);
          reencoded++;
        } catch (err) { /* 다시 저장하지 못하면 무손실 그대로 둔다 */ }
      });
      if (onProgress) await onProgress(i + 1, requests.length);
    }
    var out = pdf.saveToBuffer('garbage=compact,compress').asUint8Array();
    return { bytes: new Uint8Array(out), reencoded: reencoded };
  }

  var api = { redactPdf: redactPdf, estimateJpegQuality: estimateJpegQuality };
  root.PdfRedact = api;
  if (typeof module === 'object' && module.exports) module.exports = api;

  /* ---------- 브라우저 작업 스레드 ---------- */
  var isWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
  if (!isWorker) return;
  var mupdfP = null;
  function b64ToBytes(s) {
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function loadMupdf(cfg) {
    if (!mupdfP) {
      mupdfP = (async function () {
        if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 풀기 기능이 없어 이 방식을 쓸 수 없습니다.');
        var res = await fetch(cfg.wasmUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var gz = /\.json$/.test(cfg.wasmUrl) ? b64ToBytes(await res.json()) : new Uint8Array(await res.arrayBuffer());
        var s = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
        var wasm = new Uint8Array(await new Response(s).arrayBuffer());
        root.$libmupdf_wasm_Module = { wasmBinary: wasm };
        return import(cfg.mupdfUrl);
      })();
      mupdfP.catch(function () { mupdfP = null; });
    }
    return mupdfP;
  }
  self.onmessage = async function (ev) {
    var m = ev.data || {};
    try {
      var mupdf = await loadMupdf(m.cfg);
      var r = await redactPdf(mupdf, m.bytes, m.requests, function (done, total) { self.postMessage({ id: m.id, progress: [done, total] }); });
      self.postMessage({ id: m.id, ok: true, bytes: r.bytes, reencoded: r.reencoded }, [r.bytes.buffer]);
    } catch (e) {
      self.postMessage({ id: m.id, ok: false, error: String((e && e.message) || e) });
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
