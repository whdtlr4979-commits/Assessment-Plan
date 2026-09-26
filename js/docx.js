/* 화면의 평가계획(정리된 HTML)을 .docx 파일로 변환 — 외부 라이브러리 없이 동작
 * 한글(HWP)과 MS 워드 모두에서 열 수 있습니다. */
'use strict';

const DOCX = (() => {
  const PAGE_W = 11906, PAGE_H = 16838;               // A4 (twip)
  const MARGIN = { top: 1134, bottom: 850, left: 1134, right: 1134 }; // 20mm/15mm
  const CONTENT_W = PAGE_W - MARGIN.left - MARGIN.right;
  const FONT = '맑은 고딕';
  const NAVY = '243A73', PURPLE = '6B3FA0', HEAD = 'EEEEEE', PROC = 'EFE6F5';

  const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- 문단/글자 ---------- */
  function run(text, o = {}) {
    const rPr = [
      o.bold ? '<w:b/>' : '',
      o.italic ? '<w:i/>' : '',
      o.color ? `<w:color w:val="${o.color}"/>` : '',
      o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : '',
    ].join('');
    return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`;
  }
  const BR = '<w:r><w:br/></w:r>';
  function para(runs, o = {}) {
    const pPr = [
      o.keepNext ? '<w:keepNext/>' : '',
      o.pageBreak ? '<w:pageBreakBefore/>' : '',
      o.border ? `<w:pBdr>${o.border}</w:pBdr>` : '',
      o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>` : '',
      `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 60}" w:line="${o.line ?? 264}" w:lineRule="auto"/>`,
      o.indent ? `<w:ind w:left="${o.indent}"/>` : '',
      o.align ? `<w:jc w:val="${o.align}"/>` : '',
    ].join('');
    return `<w:p><w:pPr>${pPr}</w:pPr>${runs || ''}</w:p>`;
  }

  /* 요소 안의 인라인 내용(텍스트, 줄바꿈)을 run 들로 */
  function inlineRuns(node, o) {
    let out = '';
    node.childNodes.forEach(ch => {
      if (ch.nodeType === 3) { if (ch.textContent) out += run(ch.textContent.replace(/\s*\n\s*/g, ' '), o); }
      else if (ch.nodeName === 'BR') out += BR;
      else if (ch.nodeType === 1) {
        const bold = o.bold || ch.nodeName === 'B' || ch.nodeName === 'STRONG';
        const italic = o.italic || ch.classList.contains('subject-name');
        out += inlineRuns(ch, { ...o, bold, italic });
      }
    });
    return out;
  }
  const BLOCKS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'TABLE', 'SECTION']);
  const isBlock = n => n.nodeType === 1 && BLOCKS.has(n.nodeName);

  /* 블록 요소 → 문단 목록 (셀 안에서도 사용) */
  function blockParas(node, o) {
    const out = [];
    let buf = '';
    const flush = () => { if (buf) out.push(para(buf, o)); buf = ''; };
    node.childNodes.forEach(ch => {
      if (isBlock(ch)) {
        flush();
        out.push(...blockParas(ch, o));
      } else if (ch.nodeType === 3) {
        if (ch.textContent.trim() || buf) buf += run(ch.textContent.replace(/\s*\n\s*/g, ' '), o);
      } else if (ch.nodeName === 'BR') buf += BR;
      else if (ch.nodeType === 1) buf += inlineRuns(ch, { ...o, bold: o.bold || ch.nodeName === 'B', italic: o.italic || ch.classList.contains('subject-name') });
    });
    flush();
    return out;
  }

  /* ---------- 표 ---------- */
  function table(tbl, opt = {}) {
    const rows = [...tbl.rows];
    // 격자 계산 (rowspan/colspan)
    const grid = [];
    rows.forEach((tr, r) => {
      grid[r] = grid[r] || [];
      let c = 0;
      [...tr.cells].forEach(td => {
        while (grid[r][c]) c++;
        const cs = td.colSpan || 1, rs = td.rowSpan || 1;
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
          grid[r + i] = grid[r + i] || [];
          grid[r + i][c + j] = { td, start: i === 0 && j === 0, first: j === 0, top: i === 0, cs, rs };
        }
        c += cs;
      });
    });
    const nCols = Math.max(...grid.map(r => r.length));
    // 열 너비: colgroup 의 % 사용
    const cols = [...tbl.querySelectorAll('colgroup col')].map(c => parseFloat(c.style.width) || 0);
    let widths = cols.length === nCols && cols.every(w => w > 0)
      ? cols.map(w => Math.round(CONTENT_W * w / cols.reduce((a, b) => a + b, 0)))
      : Array(nCols).fill(Math.floor(CONTENT_W / nCols));
    const border = opt.noBorder ? 'nil' : 'single';
    const b = s => `<w:${s} w:val="${border}" w:sz="4" w:space="0" w:color="000000"/>`;
    let xml = `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_W}" w:type="dxa"/>
      <w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/>
      <w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>
      </w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    grid.forEach((row, r) => {
      const isHeadRow = opt.repeatHeader && r === 0;
      xml += `<w:tr><w:trPr>${isHeadRow ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>`;
      for (let c = 0; c < nCols; c++) {
        const cell = row[c];
        if (!cell) { xml += `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`; continue; }
        if (!cell.first) continue;
        const td = cell.td;
        const w = widths.slice(c, c + cell.cs).reduce((a, b2) => a + b2, 0);
        const isTh = td.nodeName === 'TH';
        const cls = td.classList;
        let fill = isTh ? HEAD : null, color = null;
        if (cls.contains('sec-roman')) { fill = NAVY; color = 'FFFFFF'; }
        let tcPr = `<w:tcW w:w="${w}" w:type="dxa"/>`;
        if (cell.cs > 1) tcPr += `<w:gridSpan w:val="${cell.cs}"/>`;
        if (cell.rs > 1) tcPr += cell.top ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
        if (cls.contains('sec-title')) tcPr += `<w:tcBorders><w:bottom w:val="single" w:sz="18" w:space="0" w:color="${NAVY}"/></w:tcBorders>`;
        if (fill) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
        tcPr += `<w:vAlign w:val="${cls.contains('std-cell') ? 'top' : 'center'}"/>`;
        let content;
        if (!cell.top) content = '<w:p/>';
        else {
          const center = isTh || cls.contains('center') || cls.contains('lv') || cls.contains('sec-roman');
          const o = { align: center ? 'center' : null, bold: isTh || cls.contains('lv') || opt.bold, size: opt.size || 18, color, after: 0 };
          const ps = blockParas(td, o);
          content = ps.length ? ps.join('') : para('', o);
        }
        xml += `<w:tc><w:tcPr>${tcPr}</w:tcPr>${content}</w:tc>`;
      }
      xml += '</w:tr>';
    });
    xml += '</w:tbl>';
    return xml + para('', { after: 60, line: 200 });
  }

  /* ---------- 문서 전체 ---------- */
  function convert(root) {
    let body = '';
    const pages = [...root.querySelectorAll(':scope > section')];
    pages.forEach((sec, pi) => {
      let first = true;
      const pb = () => { const v = pi > 0 && first; first = false; return v; };
      sec.childNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        const cls = n.classList;
        if (cls.contains('procedure')) {
          const bd = ['top', 'left', 'bottom', 'right'].map(s => `<w:${s} w:val="single" w:sz="12" w:space="4" w:color="000000"/>`).join('');
          body += para(inlineRuns(n, { bold: true, size: 20 }), { border: bd, shade: PROC, pageBreak: pb(), after: 200 });
        } else if (cls.contains('title-wrap')) {
          const h = n.querySelector('h1');
          const bd = `<w:top w:val="single" w:sz="36" w:space="6" w:color="${PURPLE}"/><w:bottom w:val="single" w:sz="36" w:space="6" w:color="${NAVY}"/>`;
          body += para(inlineRuns(h, { bold: true, size: 32 }), { align: 'center', border: bd, before: 200, after: 240, pageBreak: pb() });
        } else if (n.nodeName === 'TABLE') {
          if (cls.contains('sec-bar')) {
            if (pb()) body += para('', { pageBreak: true, after: 0 });
            body += table(n, { noBorder: true, bold: true, size: 26 });
          } else {
            body += table(n, { repeatHeader: cls.contains('plan') || cls.contains('std') });
          }
        } else if (n.nodeName === 'H3') {
          body += para(inlineRuns(n, { bold: true, size: 22 }), { before: 200, after: 80, keepNext: true, pageBreak: pb() });
        } else if (n.nodeName === 'H4') {
          body += para(inlineRuns(n, { bold: true, size: 20 }), { before: 80, after: 40, keepNext: true, indent: 100 });
        } else if (cls.contains('notice-box')) {
          const bd = ['top', 'left', 'bottom', 'right'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="4" w:color="000000"/>`).join('');
          body += para(inlineRuns(n, { size: 18 }), { border: bd, after: 120, indent: 100 });
        } else if (cls.contains('sub-title') || cls.contains('area-title')) {
          body += para(inlineRuns(n, { bold: true, size: 20 }), { before: 120, after: 40, keepNext: true });
        } else if (cls.contains('area') || cls.contains('rubric')) {
          n.childNodes.forEach(ch => {
            if (ch.nodeName === 'TABLE') body += table(ch, { repeatHeader: ch.classList.contains('std') });
            else if (ch.nodeType === 1) body += para(inlineRuns(ch, { bold: true, size: 20 }), { before: 120, after: 40, keepNext: true });
          });
        } else {
          blockParas(n, { size: 20, indent: cls.contains('para') ? 200 : 0, after: 60 }).forEach(p => { body += p; });
        }
      });
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body}<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="${MARGIN.top}" w:right="${MARGIN.right}" w:bottom="${MARGIN.bottom}" w:left="${MARGIN.left}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-US" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  /* ---------- 최소 ZIP(무압축) ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
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
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function build(root) {
    return zip([
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: '_rels/.rels', data: RELS },
      { name: 'word/document.xml', data: convert(root) },
      { name: 'word/styles.xml', data: STYLES },
      { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
    ]);
  }
  return { build };
})();
