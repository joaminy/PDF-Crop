/* PDF 여백 자르기 — 오프라인용 서비스 워커.
   앱 파일을 기기에 보관해 인터넷 없이도 열리게 한다. 다른 주소로는 어떤 요청도 보내지 않는다. */
'use strict';
const VERSION = 'e66e644397ae';
const CACHE = 'pdfcrop-app-' + VERSION;
const SHARE_CACHE = 'pdfcrop-share';
const FILES = [
"./",
"./app.css",
"./app.js",
"./core.js",
"./icons/apple-touch-icon.png",
"./icons/favicon-32.png",
"./icons/icon-192.png",
"./icons/icon-512.png",
"./icons/icon-maskable-512.png",
"./index.html",
"./manifest.webmanifest",
"./vendor/pdf-lib.min.js",
"./vendor/pdfjs/cmaps/78-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/78-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/78-H.bcmap.json",
"./vendor/pdfjs/cmaps/78-RKSJ-H.bcmap.json",
"./vendor/pdfjs/cmaps/78-RKSJ-V.bcmap.json",
"./vendor/pdfjs/cmaps/78-V.bcmap.json",
"./vendor/pdfjs/cmaps/78ms-RKSJ-H.bcmap.json",
"./vendor/pdfjs/cmaps/78ms-RKSJ-V.bcmap.json",
"./vendor/pdfjs/cmaps/83pv-RKSJ-H.bcmap.json",
"./vendor/pdfjs/cmaps/90ms-RKSJ-H.bcmap.json",
"./vendor/pdfjs/cmaps/90ms-RKSJ-V.bcmap.json",
"./vendor/pdfjs/cmaps/90msp-RKSJ-H.bcmap.json",
"./vendor/pdfjs/cmaps/90msp-RKSJ-V.bcmap.json",
"./vendor/pdfjs/cmaps/90pv-RKSJ-H.bcmap.json",
"./vendor/pdfjs/cmaps/90pv-RKSJ-V.bcmap.json",
"./vendor/pdfjs/cmaps/Add-H.bcmap.json",
"./vendor/pdfjs/cmaps/Add-RKSJ-H.bcmap.json",
"./vendor/pdfjs/cmaps/Add-RKSJ-V.bcmap.json",
"./vendor/pdfjs/cmaps/Add-V.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-CNS1-0.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-CNS1-1.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-CNS1-2.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-CNS1-3.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-CNS1-4.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-CNS1-5.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-CNS1-6.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-GB1-0.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-GB1-1.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-GB1-2.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-GB1-3.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-GB1-4.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-GB1-5.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Japan1-0.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Japan1-1.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Japan1-2.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Japan1-3.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Japan1-4.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Japan1-5.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Japan1-6.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Korea1-0.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Korea1-1.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Korea1-2.bcmap.json",
"./vendor/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap.json",
"./vendor/pdfjs/cmaps/B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/B5pc-H.bcmap.json",
"./vendor/pdfjs/cmaps/B5pc-V.bcmap.json",
"./vendor/pdfjs/cmaps/CNS-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/CNS-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/CNS1-H.bcmap.json",
"./vendor/pdfjs/cmaps/CNS1-V.bcmap.json",
"./vendor/pdfjs/cmaps/CNS2-H.bcmap.json",
"./vendor/pdfjs/cmaps/CNS2-V.bcmap.json",
"./vendor/pdfjs/cmaps/ETHK-B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/ETHK-B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/ETen-B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/ETen-B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/ETenms-B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/ETenms-B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/Ext-H.bcmap.json",
"./vendor/pdfjs/cmaps/Ext-RKSJ-H.bcmap.json",
"./vendor/pdfjs/cmaps/Ext-RKSJ-V.bcmap.json",
"./vendor/pdfjs/cmaps/Ext-V.bcmap.json",
"./vendor/pdfjs/cmaps/GB-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/GB-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/GB-H.bcmap.json",
"./vendor/pdfjs/cmaps/GB-V.bcmap.json",
"./vendor/pdfjs/cmaps/GBK-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/GBK-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/GBK2K-H.bcmap.json",
"./vendor/pdfjs/cmaps/GBK2K-V.bcmap.json",
"./vendor/pdfjs/cmaps/GBKp-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/GBKp-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/GBT-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/GBT-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/GBT-H.bcmap.json",
"./vendor/pdfjs/cmaps/GBT-V.bcmap.json",
"./vendor/pdfjs/cmaps/GBTpc-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/GBTpc-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/GBpc-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/GBpc-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/H.bcmap.json",
"./vendor/pdfjs/cmaps/HKdla-B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/HKdla-B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/HKdlb-B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/HKdlb-B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/HKgccs-B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/HKgccs-B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/HKm314-B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/HKm314-B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/HKm471-B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/HKm471-B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/HKscs-B5-H.bcmap.json",
"./vendor/pdfjs/cmaps/HKscs-B5-V.bcmap.json",
"./vendor/pdfjs/cmaps/Hankaku.bcmap.json",
"./vendor/pdfjs/cmaps/Hiragana.bcmap.json",
"./vendor/pdfjs/cmaps/KSC-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/KSC-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/KSC-H.bcmap.json",
"./vendor/pdfjs/cmaps/KSC-Johab-H.bcmap.json",
"./vendor/pdfjs/cmaps/KSC-Johab-V.bcmap.json",
"./vendor/pdfjs/cmaps/KSC-V.bcmap.json",
"./vendor/pdfjs/cmaps/KSCms-UHC-H.bcmap.json",
"./vendor/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap.json",
"./vendor/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap.json",
"./vendor/pdfjs/cmaps/KSCms-UHC-V.bcmap.json",
"./vendor/pdfjs/cmaps/KSCpc-EUC-H.bcmap.json",
"./vendor/pdfjs/cmaps/KSCpc-EUC-V.bcmap.json",
"./vendor/pdfjs/cmaps/Katakana.bcmap.json",
"./vendor/pdfjs/cmaps/NWP-H.bcmap.json",
"./vendor/pdfjs/cmaps/NWP-V.bcmap.json",
"./vendor/pdfjs/cmaps/RKSJ-H.bcmap.json",
"./vendor/pdfjs/cmaps/RKSJ-V.bcmap.json",
"./vendor/pdfjs/cmaps/Roman.bcmap.json",
"./vendor/pdfjs/cmaps/UniCNS-UCS2-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniCNS-UCS2-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniCNS-UTF16-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniCNS-UTF16-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniCNS-UTF32-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniCNS-UTF32-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniCNS-UTF8-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniCNS-UTF8-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniGB-UCS2-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniGB-UCS2-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniGB-UTF16-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniGB-UTF16-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniGB-UTF32-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniGB-UTF32-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniGB-UTF8-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniGB-UTF8-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UCS2-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UCS2-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UTF16-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UTF32-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UTF32-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UTF8-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS-UTF8-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJISPro-UCS2-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJISPro-UTF8-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniKS-UCS2-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniKS-UCS2-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniKS-UTF16-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniKS-UTF16-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniKS-UTF32-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniKS-UTF32-V.bcmap.json",
"./vendor/pdfjs/cmaps/UniKS-UTF8-H.bcmap.json",
"./vendor/pdfjs/cmaps/UniKS-UTF8-V.bcmap.json",
"./vendor/pdfjs/cmaps/V.bcmap.json",
"./vendor/pdfjs/cmaps/WP-Symbol.bcmap.json",
"./vendor/pdfjs/pdf.min.js",
"./vendor/pdfjs/pdf.worker.min.js",
"./vendor/pdfjs/standard_fonts/FoxitDingbats.pfb.json",
"./vendor/pdfjs/standard_fonts/FoxitFixed.pfb.json",
"./vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb.json",
"./vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb.json",
"./vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb.json",
"./vendor/pdfjs/standard_fonts/FoxitSerif.pfb.json",
"./vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb.json",
"./vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb.json",
"./vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb.json",
"./vendor/pdfjs/standard_fonts/FoxitSymbol.pfb.json",
"./vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf.json",
"./vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf.json",
"./vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf.json",
"./vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf.json",
"./vendor/pdfjs/wasm/jbig2.wasm.json",
"./vendor/pdfjs/wasm/jbig2_nowasm_fallback.js",
"./vendor/pdfjs/wasm/openjpeg.wasm.json",
"./vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('pdfcrop-app-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = await cache.match('./index.html');
      if (page) return page;
    }
    try {
      return await fetch(req);
    } catch (e) {
      return new Response('오프라인 상태입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});

// 다른 앱에서 ‘공유 → PDF 자르기’로 보낸 PDF를 기기 안 임시 보관함에 넣고 앱을 연다 (Android)
async function receiveShare(req) {
  try {
    const form = await req.formData();
    const files = form.getAll('pdf').filter((f) => f && typeof f === 'object' && f.size > 0);
    const cache = await caches.open(SHARE_CACHE);
    let i = 0;
    for (const f of files) {
      await cache.put(
        new Request('./__shared__/' + Date.now() + '-' + (i++)),
        new Response(f, { headers: { 'Content-Type': 'application/pdf', 'X-Name': encodeURIComponent(f.name || 'shared.pdf') } })
      );
    }
  } catch (e) { /* 받지 못하면 그냥 앱을 연다 */ }
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
}
