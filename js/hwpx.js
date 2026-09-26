/* 화면의 평가계획(정리된 HTML)을 한글 문서(.hwpx)로 변환 — 외부 라이브러리 없이 동작
 * 글꼴·문단·테두리 스타일은 양식 한글 파일의 것을 그대로 씁니다 (js/hwpx-template.js). */
'use strict';

const HWPX = (() => {
  const W = 47600;                    // 표 너비 (HWPUNIT, 본문 폭 48190)
  // 양식 header.xml 안의 스타일 번호 (검은 글씨 판)
  const CP = { body: 29, bold: 36, cell: 208, cellBold: 24, title: 19, roman: 46, secTitle: 23, notice: 85 };
  const PP = { body: 145, heading: 84, center: 27, left: 11, proc: 47, notice: 122, plain: 0 };
  const BF = { table: 4, th: 83, td: 4, proc: 39, notice: 57, barTable: 5, roman: 10, barTitle: 16, titleTable: 51,
               stdHeadL: 71, stdHeadR: 72, stdCode: 41, stdLevel: 73, stdText: 42 };

  const x = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let T, tblId, zOrder, first;

  /* ---------- 문단 ---------- */
  function run(text, cp) {
    return text ? `<hp:run charPrIDRef="${cp}"><hp:t>${x(text)}</hp:t></hp:run>` : `<hp:run charPrIDRef="${cp}"/>`;
  }
  function para(runs, pp, pageBreak = false) {
    let head = '';
    if (first) {                      // 문서 첫 문단에 쪽 설정(용지, 여백)을 넣음
      head = `<hp:run charPrIDRef="${CP.body}">${T.secPr}${T.colPr}</hp:run>`;
      first = false;
    }
    return `<hp:p id="0" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="${pageBreak ? 1 : 0}" columnBreak="0" merged="0">${head}${runs || run('', CP.body)}</hp:p>`;
  }
  const textPara = (text, pp, cp, pb) => para(run(text, cp), pp, pb);

  /* 요소 안의 글을 줄 단위로 (블록 요소와 <br> 에서 줄바꿈) */
  const BLOCKS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'TABLE', 'SECTION', 'TR']);
  function lines(node) {
    const out = [''];
    (function walk(n) {
      n.childNodes.forEach(ch => {
        if (ch.nodeType === 3) out[out.length - 1] += ch.textContent.replace(/\s*\n\s*/g, ' ');
        else if (ch.nodeName === 'BR') out.push('');
        else if (ch.nodeType === 1) {
          const block = BLOCKS.has(ch.nodeName);
          if (block && out[out.length - 1].trim()) out.push('');
          walk(ch);
          if (block && out[out.length - 1].trim()) out.push('');
        }
      });
    })(node);
    const res = out.map(s => s.replace(/\s+/g, ' ').trim());
    while (res.length > 1 && !res[res.length - 1]) res.pop();
    while (res.length > 1 && !res[0]) res.shift();
    return res;
  }

  /* ---------- 표 ----------
   * rows: [[{ paras, cs, rs, bf, va }]] (병합으로 가려진 칸은 넣지 않음), widths: 열 너비 */
  function table(rows, widths, opt = {}) {
    const occ = [];
    rows.forEach((row, r) => {
      occ[r] = occ[r] || [];
      let c = 0;
      row.forEach(cell => {
        while (occ[r][c]) c++;
        cell.cs = cell.cs || 1; cell.rs = cell.rs || 1;
        for (let i = 0; i < cell.rs; i++) for (let j = 0; j < cell.cs; j++) {
          occ[r + i] = occ[r + i] || [];
          occ[r + i][c + j] = true;
        }
        cell.r = r; cell.c = c;
        c += cell.cs;
      });
    });
    const heights = rows.map((_, r) => (opt.rowHeights && opt.rowHeights[r]) || opt.rowH || 1200);
    const total = widths.reduce((a, b) => a + b, 0);
    const m = opt.margin || [141, 141];
    let xml = `<hp:tbl id="${++tblId}" zOrder="${zOrder++}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${widths.length}" cellSpacing="0" borderFillIDRef="${opt.bf || BF.table}" noAdjust="0">`
      + `<hp:sz width="${total}" widthRelTo="ABSOLUTE" height="${heights.reduce((a, b) => a + b, 0)}" heightRelTo="ABSOLUTE" protect="0"/>`
      + `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>`
      + `<hp:outMargin left="283" right="283" top="283" bottom="283"/><hp:inMargin left="${m[0]}" right="${m[0]}" top="${m[1]}" bottom="${m[1]}"/>`;
    rows.forEach((row, r) => {
      xml += '<hp:tr>';
      row.forEach(cell => {
        const w = widths.slice(cell.c, cell.c + cell.cs).reduce((a, b) => a + b, 0);
        const h = heights.slice(r, r + cell.rs).reduce((a, b) => a + b, 0);
        xml += `<hp:tc name="" header="${cell.header ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${cell.bf || BF.td}">`
          + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${cell.va || 'CENTER'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">`
          + (cell.paras || `<hp:p id="0" paraPrIDRef="${PP.center}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${run('', CP.cell)}</hp:p>`)
          + `</hp:subList><hp:cellAddr colAddr="${cell.c}" rowAddr="${r}"/><hp:cellSpan colSpan="${cell.cs}" rowSpan="${cell.rs}"/>`
          + `<hp:cellSz width="${w}" height="${h}"/><hp:cellMargin left="${m[0]}" right="${m[0]}" top="${m[1]}" bottom="${m[1]}"/></hp:tc>`;
      });
      xml += '</hp:tr>';
    });
    xml += '</hp:tbl>';
    return para(`<hp:run charPrIDRef="${CP.body}">${xml}<hp:t/></hp:run>`, PP.plain, opt.pageBreak);
  }
  // 칸 안의 문단들 (cell 문단은 앞 문단에 쪽 설정이 붙지 않도록 first 를 건드리지 않음)
  function cellParas(textLines, pp, cp) {
    return textLines.map(t => `<hp:p id="0" paraPrIDRef="${pp}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${run(t, cp)}</hp:p>`).join('');
  }

  /* 화면의 표(.grid) → 한글 표 */
  function gridTable(tbl, pageBreak) {
    const cols = [...tbl.querySelectorAll('colgroup col')].map(c => parseFloat(c.style.width) || 0);
    // 실제 열 수
    let nCols = 0;
    [...tbl.rows].forEach(tr => { nCols = Math.max(nCols, [...tr.cells].reduce((s, td) => s + (td.colSpan || 1), 0)); });
    const widths = cols.length === nCols && cols.every(w => w > 0)
      ? cols.map(w => Math.round(W * w / cols.reduce((a, b) => a + b, 0)))
      : Array(nCols).fill(Math.floor(W / nCols));
    const isStd = tbl.classList.contains('std');
    const rows = [...tbl.rows].map((tr, ri) => [...tr.cells].map((td, ci) => {
      const th = td.nodeName === 'TH';
      const center = th || td.classList.contains('center') || td.classList.contains('lv');
      const bold = th || td.classList.contains('lv');
      let bf = th ? BF.th : BF.td;
      if (isStd) {
        if (th) bf = ci === 0 ? BF.stdHeadL : BF.stdHeadR;
        else if (td.classList.contains('std-cell')) bf = BF.stdCode;
        else if (td.classList.contains('lv')) bf = BF.stdLevel;
        else bf = BF.stdText;
      }
      return {
        cs: td.colSpan || 1, rs: td.rowSpan || 1, bf, header: th && ri === 0,
        va: td.classList.contains('std-cell') ? 'TOP' : 'CENTER',
        paras: cellParas(lines(td), center ? PP.center : PP.left, bold ? CP.cellBold : CP.cell),
      };
    }));
    return table(rows, widths, { pageBreak });
  }

  /* ---------- 문서 전체 ---------- */
  function section(root) {
    let body = '';
    [...root.querySelectorAll(':scope > section')].forEach((sec, pi) => {
      let pb = pi > 0;                          // 화면의 쪽 구분 → 쪽 나누기
      const takePb = () => { const v = pb; pb = false; return v; };
      const walk = parent => parent.childNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        const cls = n.classList;
        if (cls.contains('procedure')) {
          body += table([[{ bf: BF.proc, paras: cellParas(lines(n), PP.proc, CP.bold) }]], [W],
            { margin: [510, 141], rowH: 3000, pageBreak: takePb() });
        } else if (cls.contains('title-wrap')) {
          const title = lines(n.querySelector('h1')).join(' ');
          body += table([
            [{ bf: 54 }, { bf: 53, cs: 2 }],
            [{ bf: 52, cs: 3, paras: cellParas([title], PP.center, CP.title) }],
            [{ bf: 55, cs: 2 }, { bf: 56 }],
          ], [5845, 36604, 5175], { bf: BF.titleTable, rowHeights: [582, 4270, 332], pageBreak: takePb() });
        } else if (n.nodeName === 'TABLE' && cls.contains('sec-bar')) {
          const roman = lines(n.querySelector('.sec-roman')).join('');
          const title = lines(n.querySelector('.sec-title')).join(' ');
          body += table([[
            { bf: BF.roman, paras: cellParas([roman], PP.center, CP.roman) },
            { bf: BF.barTitle, paras: cellParas([' ' + title], PP.plain, CP.secTitle) },
          ]], [3900, 43700], { bf: BF.barTable, rowH: 2248, pageBreak: takePb() });
        } else if (n.nodeName === 'TABLE') {
          body += gridTable(n, takePb());
        } else if (cls.contains('notice-box')) {
          body += table([[{ bf: BF.notice, paras: cellParas(lines(n), PP.notice, CP.notice) }]], [W],
            { margin: [510, 141], pageBreak: takePb() });
        } else if (cls.contains('area') || cls.contains('rubric')) {
          walk(n);
        } else if (['H1', 'H2', 'H3', 'H4'].includes(n.nodeName) || cls.contains('sub-title') || cls.contains('area-title')) {
          body += textPara(lines(n).join(' '), PP.heading, CP.bold, takePb());
        } else {
          lines(n).forEach(t => { body += textPara(t, PP.body, CP.body, takePb()); });
        }
      });
      walk(sec);
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>${T.secOpen}${body}</hs:sec>`;
  }

  /* ---------- 꾸러미(zip) 파일들 ---------- */
  const NS_OPF = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/"';
  function contentHpf(title) {
    const imgs = Object.keys(T.images).map(p => {
      const id = p.replace(/^BinData\//, '').replace(/\.\w+$/, '');
      const ext = p.split('.').pop();
      return `<opf:item id="${id}" href="${p}" media-type="image/${ext}" isEmbeded="1"/>`;
    }).join('');
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><opf:package ${NS_OPF} version="" unique-identifier="" id="">`
      + `<opf:metadata><opf:title>${x(title)}</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">교수학습·평가 계획 작성기</opf:meta>`
      + `<opf:meta name="CreatedDate" content="text">${now}</opf:meta><opf:meta name="ModifiedDate" content="text">${now}</opf:meta></opf:metadata>`
      + `<opf:manifest>${imgs}<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>`
      + `<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>`
      + `<opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>`
      + `<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
  }
  const CONTAINER = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>';
  const PKG = 'http://www.hancom.co.kr/hwpml/2016/meta/pkg#';
  const RDF = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + `<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="${PKG}" rdf:resource="Contents/header.xml"/></rdf:Description>`
    + `<rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="${PKG}HeaderFile"/></rdf:Description>`
    + `<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="${PKG}" rdf:resource="Contents/section0.xml"/></rdf:Description>`
    + `<rdf:Description rdf:about="Contents/section0.xml"><rdf:type rdf:resource="${PKG}SectionFile"/></rdf:Description>`
    + `<rdf:Description rdf:about=""><rdf:type rdf:resource="${PKG}Document"/></rdf:Description></rdf:RDF>`;
  const MANIFEST = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>';
  const SETTINGS = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>';

  /* ---------- 최소 ZIP(무압축) ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files, type) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    files.forEach(({ name, data }) => {
      const nameB = enc.encode(name), dataB = typeof data === 'string' ? enc.encode(data) : data;
      const crc = crc32(dataB);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, dataB.length, true); lh.setUint32(22, dataB.length, true);
      lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nameB, dataB);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, dataB.length, true); ch.setUint32(24, dataB.length, true);
      ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      offset += 30 + nameB.length + dataB.length;
    });
    const cSize = central.reduce((s, a) => s + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type });
  }
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function build(root, title) {
    T = window.HWPX_TEMPLATE;
    tblId = 1000; zOrder = 1; first = true;
    const sectionXml = section(root);
    const preview = lines(root).filter(Boolean).join('\r\n').slice(0, 1000);
    return zip([
      { name: 'mimetype', data: 'application/hwp+zip' },     // 반드시 맨 처음, 무압축
      { name: 'version.xml', data: T.version },
      { name: 'Contents/header.xml', data: T.header },
      { name: 'Contents/section0.xml', data: sectionXml },
      ...Object.entries(T.images).map(([name, d]) => ({ name, data: b64(d) })),
      { name: 'settings.xml', data: SETTINGS },
      { name: 'Preview/PrvText.txt', data: preview },
      { name: 'META-INF/container.rdf', data: RDF },
      { name: 'Contents/content.hpf', data: contentHpf(title) },
      { name: 'META-INF/container.xml', data: CONTAINER },
      { name: 'META-INF/manifest.xml', data: MANIFEST },
    ], 'application/hwp+zip');
  }

  /* 양식 스타일 파일(약 0.5MB)은 처음 내려받을 때만 불러옴 */
  function ensureTemplate() {
    if (window.HWPX_TEMPLATE) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'js/hwpx-template.js';
      sc.onload = () => resolve();
      sc.onerror = () => reject(new Error('js/hwpx-template.js 를 불러오지 못했습니다'));
      document.head.appendChild(sc);
    });
  }
  return { build, ensureTemplate };
})();
