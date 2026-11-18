/* PDF 여백 자르기 — 오프라인용 서비스 워커.
   앱 파일을 기기에 보관해 인터넷 없이도 열리게 한다. 다른 주소로는 어떤 요청도 보내지 않는다. */
'use strict';
const VERSION = '36e04262b63c';
const CACHE = 'pdfcrop-app-' + VERSION;
const SHARE_CACHE = 'pdfcrop-share';
const FILES = [
[
"./",
"ed62b3290acc6024"
],
[
"./app.css",
"6c2d61a70dc79f7f"
],
[
"./app.js",
"86b17d320b9f7cfd"
],
[
"./core.js",
"84d5e9629e5558a1"
],
[
"./icons/apple-touch-icon.png",
"05833fb16f8c05af"
],
[
"./icons/favicon-32.png",
"50aa525c453cbe2f"
],
[
"./icons/icon-192.png",
"941392dfd688670d"
],
[
"./icons/icon-512.png",
"9452e421c4c778dc"
],
[
"./icons/icon-maskable-512.png",
"52c7b8119ae0af95"
],
[
"./index.html",
"ed62b3290acc6024"
],
[
"./manifest.webmanifest",
"c1be3b5aac2fa3c8"
],
[
"./redact-worker.js",
"edcacc79e76fc620"
],
[
"./vendor/mupdf/mupdf-wasm.js",
"44048fd1374dc176"
],
[
"./vendor/mupdf/mupdf-wasm.wasm.gz",
"e0e2a99237f9b724"
],
[
"./vendor/mupdf/mupdf.js",
"5d237eadcb964058"
],
[
"./vendor/pdf-lib.min.js",
"278627f3a5e3efa9"
],
[
"./vendor/pdfjs/cmaps/78-EUC-H.bcmap.json",
"b7c56d4d934d3983"
],
[
"./vendor/pdfjs/cmaps/78-EUC-V.bcmap.json",
"0cb294ce592912e8"
],
[
"./vendor/pdfjs/cmaps/78-H.bcmap.json",
"9431db8c083ef00b"
],
[
"./vendor/pdfjs/cmaps/78-RKSJ-H.bcmap.json",
"9f2de5aea72e084e"
],
[
"./vendor/pdfjs/cmaps/78-RKSJ-V.bcmap.json",
"2ccacd7bbca6cc69"
],
[
"./vendor/pdfjs/cmaps/78-V.bcmap.json",
"70c4e4d58e6a670d"
],
[
"./vendor/pdfjs/cmaps/78ms-RKSJ-H.bcmap.json",
"6ce0eaf94fb89fdc"
],
[
"./vendor/pdfjs/cmaps/78ms-RKSJ-V.bcmap.json",
"6619fd48ed3942a9"
],
[
"./vendor/pdfjs/cmaps/83pv-RKSJ-H.bcmap.json",
"9e5e80c3450669d3"
],
[
"./vendor/pdfjs/cmaps/90ms-RKSJ-H.bcmap.json",
"065e366e4fff228b"
],
[
"./vendor/pdfjs/cmaps/90ms-RKSJ-V.bcmap.json",
"b2d3bd0478ac6553"
],
[
"./vendor/pdfjs/cmaps/90msp-RKSJ-H.bcmap.json",
"56cdacfa34b4d1b9"
],
[
"./vendor/pdfjs/cmaps/90msp-RKSJ-V.bcmap.json",
"4fd23112505cc17d"
],
[
"./vendor/pdfjs/cmaps/90pv-RKSJ-H.bcmap.json",
"15527a61669aff4d"
],
[
"./vendor/pdfjs/cmaps/90pv-RKSJ-V.bcmap.json",
"6635288b92efc3ac"
],
[
"./vendor/pdfjs/cmaps/Add-H.bcmap.json",
"8f839aa020fe335f"
],
[
"./vendor/pdfjs/cmaps/Add-RKSJ-H.bcmap.json",
"18b809bdbc76c849"
],
[
"./vendor/pdfjs/cmaps/Add-RKSJ-V.bcmap.json",
"9a171162adf6c76d"
],
[
"./vendor/pdfjs/cmaps/Add-V.bcmap.json",
"bdb898b83ae762ee"
],
[
"./vendor/pdfjs/cmaps/Adobe-CNS1-0.bcmap.json",
"e306a5e228cfa74e"
],
[
"./vendor/pdfjs/cmaps/Adobe-CNS1-1.bcmap.json",
"d480d9d3116834d2"
],
[
"./vendor/pdfjs/cmaps/Adobe-CNS1-2.bcmap.json",
"8ca21458a0d841ed"
],
[
"./vendor/pdfjs/cmaps/Adobe-CNS1-3.bcmap.json",
"c6ba36aa32f46b72"
],
[
"./vendor/pdfjs/cmaps/Adobe-CNS1-4.bcmap.json",
"dfb2b78baade4123"
],
[
"./vendor/pdfjs/cmaps/Adobe-CNS1-5.bcmap.json",
"3739cefb8902e480"
],
[
"./vendor/pdfjs/cmaps/Adobe-CNS1-6.bcmap.json",
"e9eafe199829c96c"
],
[
"./vendor/pdfjs/cmaps/Adobe-CNS1-UCS2.bcmap.json",
"ed79f1cf4fe67788"
],
[
"./vendor/pdfjs/cmaps/Adobe-GB1-0.bcmap.json",
"f7de89fdddb8ed72"
],
[
"./vendor/pdfjs/cmaps/Adobe-GB1-1.bcmap.json",
"4886db9bc11c83d3"
],
[
"./vendor/pdfjs/cmaps/Adobe-GB1-2.bcmap.json",
"d6cd16e5ac99691a"
],
[
"./vendor/pdfjs/cmaps/Adobe-GB1-3.bcmap.json",
"422d153f5ee23ea2"
],
[
"./vendor/pdfjs/cmaps/Adobe-GB1-4.bcmap.json",
"ef1777845acee512"
],
[
"./vendor/pdfjs/cmaps/Adobe-GB1-5.bcmap.json",
"502d17c3353e91c0"
],
[
"./vendor/pdfjs/cmaps/Adobe-GB1-UCS2.bcmap.json",
"860024afb667cdd1"
],
[
"./vendor/pdfjs/cmaps/Adobe-Japan1-0.bcmap.json",
"a22875486d2c7ad5"
],
[
"./vendor/pdfjs/cmaps/Adobe-Japan1-1.bcmap.json",
"f42f3db334bcb2f1"
],
[
"./vendor/pdfjs/cmaps/Adobe-Japan1-2.bcmap.json",
"3347b44d24783abb"
],
[
"./vendor/pdfjs/cmaps/Adobe-Japan1-3.bcmap.json",
"92e3ec5f3c20b023"
],
[
"./vendor/pdfjs/cmaps/Adobe-Japan1-4.bcmap.json",
"0fce28f986e2c265"
],
[
"./vendor/pdfjs/cmaps/Adobe-Japan1-5.bcmap.json",
"2646ff8ff664d423"
],
[
"./vendor/pdfjs/cmaps/Adobe-Japan1-6.bcmap.json",
"9b46ed778edca843"
],
[
"./vendor/pdfjs/cmaps/Adobe-Japan1-UCS2.bcmap.json",
"d4dc41bb9bfe6d15"
],
[
"./vendor/pdfjs/cmaps/Adobe-Korea1-0.bcmap.json",
"2530a3bcb5cc301b"
],
[
"./vendor/pdfjs/cmaps/Adobe-Korea1-1.bcmap.json",
"734746d874707bbe"
],
[
"./vendor/pdfjs/cmaps/Adobe-Korea1-2.bcmap.json",
"0b4f3dcc319dcfb3"
],
[
"./vendor/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap.json",
"236d2e6f2f4319e9"
],
[
"./vendor/pdfjs/cmaps/B5-H.bcmap.json",
"2750d7603ec08b40"
],
[
"./vendor/pdfjs/cmaps/B5-V.bcmap.json",
"fd2a5e307f0a70a6"
],
[
"./vendor/pdfjs/cmaps/B5pc-H.bcmap.json",
"603dcc21ceee6ee8"
],
[
"./vendor/pdfjs/cmaps/B5pc-V.bcmap.json",
"942600254654161e"
],
[
"./vendor/pdfjs/cmaps/CNS-EUC-H.bcmap.json",
"295f13b4687b4daa"
],
[
"./vendor/pdfjs/cmaps/CNS-EUC-V.bcmap.json",
"4428f8c316379e4e"
],
[
"./vendor/pdfjs/cmaps/CNS1-H.bcmap.json",
"4bdc435d733ecb54"
],
[
"./vendor/pdfjs/cmaps/CNS1-V.bcmap.json",
"843e95e1a1cf6c49"
],
[
"./vendor/pdfjs/cmaps/CNS2-H.bcmap.json",
"20c683ffbfed7b85"
],
[
"./vendor/pdfjs/cmaps/CNS2-V.bcmap.json",
"12cd2132f3718bd8"
],
[
"./vendor/pdfjs/cmaps/ETHK-B5-H.bcmap.json",
"6b84ac6acc37e49f"
],
[
"./vendor/pdfjs/cmaps/ETHK-B5-V.bcmap.json",
"a9395645744c36e8"
],
[
"./vendor/pdfjs/cmaps/ETen-B5-H.bcmap.json",
"d4c7f4ca1e0492c2"
],
[
"./vendor/pdfjs/cmaps/ETen-B5-V.bcmap.json",
"158661e1d4926b9d"
],
[
"./vendor/pdfjs/cmaps/ETenms-B5-H.bcmap.json",
"57fd02f7129dc858"
],
[
"./vendor/pdfjs/cmaps/ETenms-B5-V.bcmap.json",
"94a62c9950151205"
],
[
"./vendor/pdfjs/cmaps/EUC-H.bcmap.json",
"79888a223eb08fd9"
],
[
"./vendor/pdfjs/cmaps/EUC-V.bcmap.json",
"e92029429fc35595"
],
[
"./vendor/pdfjs/cmaps/Ext-H.bcmap.json",
"02cf65cdfce014a6"
],
[
"./vendor/pdfjs/cmaps/Ext-RKSJ-H.bcmap.json",
"b2317f1a681686ab"
],
[
"./vendor/pdfjs/cmaps/Ext-RKSJ-V.bcmap.json",
"fed15c912805898e"
],
[
"./vendor/pdfjs/cmaps/Ext-V.bcmap.json",
"1ddd3ccf55d4c9cb"
],
[
"./vendor/pdfjs/cmaps/GB-EUC-H.bcmap.json",
"55328f2d0c1e8dc3"
],
[
"./vendor/pdfjs/cmaps/GB-EUC-V.bcmap.json",
"acd21113657689f6"
],
[
"./vendor/pdfjs/cmaps/GB-H.bcmap.json",
"2f6fb82582f15b76"
],
[
"./vendor/pdfjs/cmaps/GB-V.bcmap.json",
"7f8cfc14adf51074"
],
[
"./vendor/pdfjs/cmaps/GBK-EUC-H.bcmap.json",
"2ffcc6d3d3094ccf"
],
[
"./vendor/pdfjs/cmaps/GBK-EUC-V.bcmap.json",
"b5c414c2ed26e780"
],
[
"./vendor/pdfjs/cmaps/GBK2K-H.bcmap.json",
"0a334728177e954d"
],
[
"./vendor/pdfjs/cmaps/GBK2K-V.bcmap.json",
"2d36beb909b02aee"
],
[
"./vendor/pdfjs/cmaps/GBKp-EUC-H.bcmap.json",
"ed74241c6d9ddb54"
],
[
"./vendor/pdfjs/cmaps/GBKp-EUC-V.bcmap.json",
"a54ccc44141f8566"
],
[
"./vendor/pdfjs/cmaps/GBT-EUC-H.bcmap.json",
"634be5946023addb"
],
[
"./vendor/pdfjs/cmaps/GBT-EUC-V.bcmap.json",
"a22b289cb710ee83"
],
[
"./vendor/pdfjs/cmaps/GBT-H.bcmap.json",
"8bf1b0bc49ec55b1"
],
[
"./vendor/pdfjs/cmaps/GBT-V.bcmap.json",
"0592fd82449d0782"
],
[
"./vendor/pdfjs/cmaps/GBTpc-EUC-H.bcmap.json",
"317c05397ed0d7fb"
],
[
"./vendor/pdfjs/cmaps/GBTpc-EUC-V.bcmap.json",
"eb46863a2e8d33f7"
],
[
"./vendor/pdfjs/cmaps/GBpc-EUC-H.bcmap.json",
"c7dfa80fdecd7a65"
],
[
"./vendor/pdfjs/cmaps/GBpc-EUC-V.bcmap.json",
"95c6215a4d5d85f3"
],
[
"./vendor/pdfjs/cmaps/H.bcmap.json",
"9169ae2dc48420d1"
],
[
"./vendor/pdfjs/cmaps/HKdla-B5-H.bcmap.json",
"ed90d5d09c751bba"
],
[
"./vendor/pdfjs/cmaps/HKdla-B5-V.bcmap.json",
"c9dab78fb46de215"
],
[
"./vendor/pdfjs/cmaps/HKdlb-B5-H.bcmap.json",
"fcd81edeb30e9542"
],
[
"./vendor/pdfjs/cmaps/HKdlb-B5-V.bcmap.json",
"87c3b85cf2f6ce83"
],
[
"./vendor/pdfjs/cmaps/HKgccs-B5-H.bcmap.json",
"db8647f03f195e31"
],
[
"./vendor/pdfjs/cmaps/HKgccs-B5-V.bcmap.json",
"66aa183b77c3b67b"
],
[
"./vendor/pdfjs/cmaps/HKm314-B5-H.bcmap.json",
"4562ba8d2d6dfc02"
],
[
"./vendor/pdfjs/cmaps/HKm314-B5-V.bcmap.json",
"da90efaf687badc7"
],
[
"./vendor/pdfjs/cmaps/HKm471-B5-H.bcmap.json",
"5a09344ba427e17d"
],
[
"./vendor/pdfjs/cmaps/HKm471-B5-V.bcmap.json",
"30d73be57fece629"
],
[
"./vendor/pdfjs/cmaps/HKscs-B5-H.bcmap.json",
"79b7a53b6cef91ff"
],
[
"./vendor/pdfjs/cmaps/HKscs-B5-V.bcmap.json",
"88270093722946de"
],
[
"./vendor/pdfjs/cmaps/Hankaku.bcmap.json",
"b9eed2874a24a8fa"
],
[
"./vendor/pdfjs/cmaps/Hiragana.bcmap.json",
"c7f7067c53862fc5"
],
[
"./vendor/pdfjs/cmaps/KSC-EUC-H.bcmap.json",
"2ddfbc493a721dc5"
],
[
"./vendor/pdfjs/cmaps/KSC-EUC-V.bcmap.json",
"b6ffb66c20ab2ead"
],
[
"./vendor/pdfjs/cmaps/KSC-H.bcmap.json",
"b968dbbae1c573bf"
],
[
"./vendor/pdfjs/cmaps/KSC-Johab-H.bcmap.json",
"f4272cafcd978d0f"
],
[
"./vendor/pdfjs/cmaps/KSC-Johab-V.bcmap.json",
"28a794048d9b52d3"
],
[
"./vendor/pdfjs/cmaps/KSC-V.bcmap.json",
"9e23c253283335de"
],
[
"./vendor/pdfjs/cmaps/KSCms-UHC-H.bcmap.json",
"2547982a46e28884"
],
[
"./vendor/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap.json",
"a12abf0e541c2eb5"
],
[
"./vendor/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap.json",
"7b5870361c8e9ff9"
],
[
"./vendor/pdfjs/cmaps/KSCms-UHC-V.bcmap.json",
"fb9ed88fa16e1935"
],
[
"./vendor/pdfjs/cmaps/KSCpc-EUC-H.bcmap.json",
"8855119e5a4183f8"
],
[
"./vendor/pdfjs/cmaps/KSCpc-EUC-V.bcmap.json",
"3077d89667cc18e4"
],
[
"./vendor/pdfjs/cmaps/Katakana.bcmap.json",
"4dcb147cd4d0ad7e"
],
[
"./vendor/pdfjs/cmaps/NWP-H.bcmap.json",
"dc14cfebb7e5a454"
],
[
"./vendor/pdfjs/cmaps/NWP-V.bcmap.json",
"df58c71f6ce5200c"
],
[
"./vendor/pdfjs/cmaps/RKSJ-H.bcmap.json",
"37e85c3d637f14e7"
],
[
"./vendor/pdfjs/cmaps/RKSJ-V.bcmap.json",
"195db20bc5d44161"
],
[
"./vendor/pdfjs/cmaps/Roman.bcmap.json",
"3dbde0c40098178f"
],
[
"./vendor/pdfjs/cmaps/UniCNS-UCS2-H.bcmap.json",
"ec10ea12b9867af3"
],
[
"./vendor/pdfjs/cmaps/UniCNS-UCS2-V.bcmap.json",
"c8245750dcb78c69"
],
[
"./vendor/pdfjs/cmaps/UniCNS-UTF16-H.bcmap.json",
"045d6bb1becd9d07"
],
[
"./vendor/pdfjs/cmaps/UniCNS-UTF16-V.bcmap.json",
"81f47439e9d2e060"
],
[
"./vendor/pdfjs/cmaps/UniCNS-UTF32-H.bcmap.json",
"d5d3882a4f0879cb"
],
[
"./vendor/pdfjs/cmaps/UniCNS-UTF32-V.bcmap.json",
"8e79745e498fddec"
],
[
"./vendor/pdfjs/cmaps/UniCNS-UTF8-H.bcmap.json",
"c59c7d980aca1190"
],
[
"./vendor/pdfjs/cmaps/UniCNS-UTF8-V.bcmap.json",
"d7f42bea2cdde174"
],
[
"./vendor/pdfjs/cmaps/UniGB-UCS2-H.bcmap.json",
"95fc3fc03e1614c1"
],
[
"./vendor/pdfjs/cmaps/UniGB-UCS2-V.bcmap.json",
"2d0ed10d98a21f11"
],
[
"./vendor/pdfjs/cmaps/UniGB-UTF16-H.bcmap.json",
"4ebc1a06e5b84cb2"
],
[
"./vendor/pdfjs/cmaps/UniGB-UTF16-V.bcmap.json",
"60d135647b830d6a"
],
[
"./vendor/pdfjs/cmaps/UniGB-UTF32-H.bcmap.json",
"4edc44c762dc0f39"
],
[
"./vendor/pdfjs/cmaps/UniGB-UTF32-V.bcmap.json",
"6b8a4366da23f54e"
],
[
"./vendor/pdfjs/cmaps/UniGB-UTF8-H.bcmap.json",
"2ad70272ffffd864"
],
[
"./vendor/pdfjs/cmaps/UniGB-UTF8-V.bcmap.json",
"03f56d1a54aecb9b"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UCS2-H.bcmap.json",
"cf4da4870fbfe7ec"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-H.bcmap.json",
"4abd036e2cf22ac0"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UCS2-HW-V.bcmap.json",
"e6e3570eee546548"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UCS2-V.bcmap.json",
"51362d7bb6d9230d"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UTF16-H.bcmap.json",
"a417b39a100dfc2f"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UTF16-V.bcmap.json",
"7d6933dc36ab5a68"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UTF32-H.bcmap.json",
"6eac58aeb1c2e9b9"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UTF32-V.bcmap.json",
"8948b5cff2998398"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UTF8-H.bcmap.json",
"646140abdaf5f4eb"
],
[
"./vendor/pdfjs/cmaps/UniJIS-UTF8-V.bcmap.json",
"09b5356b07412fac"
],
[
"./vendor/pdfjs/cmaps/UniJIS2004-UTF16-H.bcmap.json",
"875af94845305d07"
],
[
"./vendor/pdfjs/cmaps/UniJIS2004-UTF16-V.bcmap.json",
"c85c3b5c52f39479"
],
[
"./vendor/pdfjs/cmaps/UniJIS2004-UTF32-H.bcmap.json",
"b07d0587dd077f35"
],
[
"./vendor/pdfjs/cmaps/UniJIS2004-UTF32-V.bcmap.json",
"54188c44f46eb87d"
],
[
"./vendor/pdfjs/cmaps/UniJIS2004-UTF8-H.bcmap.json",
"7f54089935aeff89"
],
[
"./vendor/pdfjs/cmaps/UniJIS2004-UTF8-V.bcmap.json",
"df0e1f95ba911923"
],
[
"./vendor/pdfjs/cmaps/UniJISPro-UCS2-HW-V.bcmap.json",
"53445008c9a9fa11"
],
[
"./vendor/pdfjs/cmaps/UniJISPro-UCS2-V.bcmap.json",
"dc0fdf77859c051f"
],
[
"./vendor/pdfjs/cmaps/UniJISPro-UTF8-V.bcmap.json",
"80ce38225bb7342b"
],
[
"./vendor/pdfjs/cmaps/UniJISX0213-UTF32-H.bcmap.json",
"c6fb4f1b1dbffc89"
],
[
"./vendor/pdfjs/cmaps/UniJISX0213-UTF32-V.bcmap.json",
"77108b8b643e17a2"
],
[
"./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-H.bcmap.json",
"58b899c075e78ad5"
],
[
"./vendor/pdfjs/cmaps/UniJISX02132004-UTF32-V.bcmap.json",
"fa64c63841bddb39"
],
[
"./vendor/pdfjs/cmaps/UniKS-UCS2-H.bcmap.json",
"cd780f7f712cadc2"
],
[
"./vendor/pdfjs/cmaps/UniKS-UCS2-V.bcmap.json",
"02e4c100c4d8778c"
],
[
"./vendor/pdfjs/cmaps/UniKS-UTF16-H.bcmap.json",
"ecc68728754393d8"
],
[
"./vendor/pdfjs/cmaps/UniKS-UTF16-V.bcmap.json",
"0b484d920500d47b"
],
[
"./vendor/pdfjs/cmaps/UniKS-UTF32-H.bcmap.json",
"c49cc554c2b2e673"
],
[
"./vendor/pdfjs/cmaps/UniKS-UTF32-V.bcmap.json",
"cebed0d0ba2b4d83"
],
[
"./vendor/pdfjs/cmaps/UniKS-UTF8-H.bcmap.json",
"93c5961fc3e8a2f8"
],
[
"./vendor/pdfjs/cmaps/UniKS-UTF8-V.bcmap.json",
"5c7f91036a6326c7"
],
[
"./vendor/pdfjs/cmaps/V.bcmap.json",
"be55f3264b0c9d18"
],
[
"./vendor/pdfjs/cmaps/WP-Symbol.bcmap.json",
"54e2bb32c6a41b34"
],
[
"./vendor/pdfjs/pdf.min.js",
"9fab0c910bf14848"
],
[
"./vendor/pdfjs/pdf.worker.min.js",
"bc0d1b88ea0b6619"
],
[
"./vendor/pdfjs/standard_fonts/FoxitDingbats.pfb.json",
"ec2cfda9a3ea2362"
],
[
"./vendor/pdfjs/standard_fonts/FoxitFixed.pfb.json",
"dc65a98de07ce16e"
],
[
"./vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb.json",
"027b993476cce465"
],
[
"./vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb.json",
"768c5c7814100014"
],
[
"./vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb.json",
"28dc97b178ea94c6"
],
[
"./vendor/pdfjs/standard_fonts/FoxitSerif.pfb.json",
"53ef35dc871d7fa4"
],
[
"./vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb.json",
"d509d5693afa1c2f"
],
[
"./vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb.json",
"ee13325c73603eec"
],
[
"./vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb.json",
"823b876e4dfff482"
],
[
"./vendor/pdfjs/standard_fonts/FoxitSymbol.pfb.json",
"92fa058ce87fcb58"
],
[
"./vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf.json",
"db13816c6ef31ee6"
],
[
"./vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf.json",
"074742d0e1135863"
],
[
"./vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf.json",
"ced585753ebabefe"
],
[
"./vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf.json",
"36783187b9b2a345"
],
[
"./vendor/pdfjs/wasm/jbig2.wasm.json",
"a4dd0dbef8876d5d"
],
[
"./vendor/pdfjs/wasm/jbig2_nowasm_fallback.js",
"04c795a6657a4553"
],
[
"./vendor/pdfjs/wasm/openjpeg.wasm.json",
"06893cbce9089490"
],
[
"./vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js",
"0f998419819da449"
]
];
const HASH = new Map(FILES.map(([p, h]) => [new URL(p, self.location.href).pathname, h]));

async function sha16(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (let i = 0; i < 8; i++) s += d[i].toString(16).padStart(2, '0');
  return s;
}

// 새 버전 설치: 내용이 같은 파일은 기기에 있던 것을 그대로 옮기고, 바뀐 파일만 내려받는다.
// 내려받은 파일도 내용(해시)을 확인해, 서버 쪽에 아직 옛 파일이 남아 있으면 설치를 미루고 다음에 다시 시도한다.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const oldNames = (await caches.keys()).filter((k) => k.startsWith('pdfcrop-app-') && k !== CACHE);
    const olds = await Promise.all(oldNames.map((k) => caches.open(k)));
    let next = 0;
    async function worker() {
      while (next < FILES.length) {
        const [path, hash] = FILES[next++];
        // 이미 이 버전 보관함에 맞는 내용이 있으면 건너뛴다 (지난번에 받다 끊긴 경우 이어 받기)
        const have = await cache.match(path);
        if (have && await sha16(await have.arrayBuffer()) === hash) continue;
        let reused = false;
        for (const oc of olds) {
          const r = await oc.match(path);
          if (!r) continue;
          const buf = await r.arrayBuffer();
          if (await sha16(buf) === hash) {
            await cache.put(path, new Response(buf, { headers: r.headers }));
            reused = true;
            break;
          }
        }
        if (reused) continue;
        const res = await fetch(new Request(path, { cache: 'reload' }));
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + path);
        const buf = await res.clone().arrayBuffer();
        if (await sha16(buf) !== hash) throw new Error('아직 옛 파일: ' + path);
        await cache.put(path, res);
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    await self.skipWaiting();
  })());
});

// 보관함이 비었을 때(같은 주소 joaminy.github.io의 다른 앱이 지웠거나 기기가 정리한 경우),
// 인터넷이 되면 이 버전의 파일로 다시 채운다. 내용(해시)이 맞는 파일만 넣는다.
let healing = null;
function heal() {
  if (!healing) {
    healing = (async () => {
      const cache = await caches.open(CACHE);
      for (const [path, hash] of FILES) {
        if (await cache.match(path)) continue;
        let res;
        try { res = await fetch(new Request(path, { cache: 'reload' })); } catch (e) { return; } // 인터넷이 끊기면 다음에
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        if (await sha16(buf) === hash) await cache.put(path, new Response(buf, { headers: res.headers }));
      }
    })().catch(() => {}).finally(() => { healing = null; });
  }
  return healing;
}

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
      const res = await fetch(req);
      if (res.ok && HASH.has(url.pathname)) {
        try { event.waitUntil(heal()); } catch (e) { heal(); }
      }
      return res;
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
