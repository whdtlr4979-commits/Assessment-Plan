#!/usr/bin/env python3
"""
성취수준 PDF → 사이트용 성취기준 데이터(data/standards/*.js) 변환 도구

사용법
  pip install pdfplumber
  python tools/pdf_to_standards.py pdfs/공통국어1.pdf --subject 공통국어1 --group 국어
  python tools/pdf_to_standards.py pdfs/*.pdf            # 파일 이름을 과목명으로 사용
  python tools/pdf_to_standards.py pdfs/*/*.pdf          # pdfs/국어/공통국어1.pdf → 교과군 '국어'

  옵션
    --subject 과목명   (파일 하나일 때만. 생략하면 파일 이름 사용)
    --group   교과군   (예: 국어, 수학, 사회, 과학 ... 선택 목록에서 묶음 제목으로 쓰임)
    --pages   5-30     (성취수준 표가 있는 쪽 범위만 읽기)
    --dry-run          (파일을 쓰지 않고 결과만 출력)

동작 방식
  PDF 표에서 [성취기준 코드] 가 있는 칸을 찾고, 같은 행/다음 행의 A~E 성취수준 문장을 모읍니다.
  영역 이름은 코드의 가운데 번호(예: 10공국1-'02'-01)로 묶고, 본문에서 '(2) 읽기' 같은
  제목을 찾으면 그 이름을 붙입니다. 못 찾으면 '영역 02'처럼 표시되며 사이트에서 고칠 수 있습니다.

  PDF마다 표 모양이 조금씩 달라 100% 정확하지 않을 수 있습니다.
  변환 후에는 반드시 사이트에서 불러와 확인하세요. (요약이 콘솔에 출력됩니다)
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'data' / 'standards'
INDEX = OUT_DIR / 'index.js'

CODE_RE = re.compile(r'\[\s*(\d{1,2}\s*[가-힣A-Za-z0-9·ㆍ]+?\s*\d?\s*[-–—]\s*\d{2}\s*[-–—]\s*\d{2}(?:\s*[-–—]\s*\d{2})?)\s*\]')
LEVEL_RE = re.compile(r'^\s*([A-E])\s*$')
LEVEL_PREFIX_RE = re.compile(r'^\s*([A-E])\s+(.+)$', re.S)
AREA_TITLE_RE = re.compile(r'^\s*(?:\((\d{1,2})\)|(\d{1,2})[.)])\s*([가-힣][가-힣A-Za-z·ㆍ\s,]{0,24}?)\s*$')


def norm_code(c):
    c = re.sub(r'\s+', '', c)
    return re.sub(r'[–—]', '-', c)


def clean(s):
    s = (s or '').replace(' ', ' ')
    s = re.sub(r'[ \t]*\n[ \t]*', ' ', s)          # PDF 줄바꿈은 문장 중간이므로 이어 붙임
    s = re.sub(r'\s{2,}', ' ', s)
    return s.strip()


def area_key(code):
    parts = code.split('-')
    return parts[1] if len(parts) >= 3 else '00'


def parse_pdf(path, pages=None):
    import logging
    import pdfplumber
    logging.getLogger('pdfminer').setLevel(logging.ERROR)
    standards = {}           # code -> {'code','text','levels':{}}
    order = []
    area_titles = []         # (번호, 이름) 본문 순서대로
    cur = None
    last_level = None

    with pdfplumber.open(path) as pdf:
        page_list = pdf.pages
        if pages:
            a, b = pages
            page_list = page_list[a - 1:b]
        for page in page_list:
            text = page.extract_text() or ''
            for line in text.splitlines():
                m = AREA_TITLE_RE.match(line)
                if m:
                    area_titles.append((m.group(1) or m.group(2), clean(m.group(3))))

            for table in page.extract_tables():
                for row in table:
                    cells = [c if c is not None else '' for c in row]
                    joined = ' '.join(cells)
                    code_cell = next((c for c in cells if CODE_RE.search(c or '')), None)
                    if code_cell:
                        m = CODE_RE.search(code_cell)
                        code = norm_code(m.group(1))
                        body = clean(code_cell[m.end():])
                        if code not in standards:
                            standards[code] = {'code': code, 'text': body, 'levels': {}}
                            order.append(code)
                        elif body and not standards[code]['text']:
                            standards[code]['text'] = body
                        cur = standards[code]
                        last_level = None
                    if cur is None:
                        continue
                    rest = [c for c in cells if c and c is not code_cell]
                    level = next((LEVEL_RE.match(c).group(1) for c in rest if LEVEL_RE.match(c)), None)
                    texts = [clean(c) for c in rest if not LEVEL_RE.match(c) and clean(c)]
                    # 'A 문장' 처럼 한 칸에 붙어있는 경우
                    if not level and texts:
                        m2 = LEVEL_PREFIX_RE.match(texts[0])
                        if m2 and len(texts[0]) > 10:
                            level, texts[0] = m2.group(1), m2.group(2)
                    body = max(texts, key=len) if texts else ''
                    if level:
                        prev = cur['levels'].get(level, '')
                        cur['levels'][level] = (prev + ' ' + body).strip() if prev else body
                        last_level = level
                    elif (body and last_level and not code_cell and '성취' not in joined[:8]
                          and not AREA_TITLE_RE.match(body)):
                        # 쪽이 넘어가며 잘린 칸 → 앞 수준에 이어 붙임
                        cur['levels'][last_level] = (cur['levels'][last_level] + ' ' + body).strip()

    # 표가 없는 PDF → 본문 텍스트에서 추출 (대체 방식)
    if not order:
        order, standards = parse_text_fallback(path, pages)

    # 영역 묶기
    titles = {}
    for num, name in area_titles:
        titles.setdefault(num.zfill(2), name)
    areas = {}
    for code in order:
        k = area_key(code)
        if k not in areas:
            areas[k] = {'name': titles.get(k, f'영역 {k}'), 'standards': []}
        s = standards[code]
        s['levels'] = {L: s['levels'][L] for L in 'ABCDE' if L in s['levels']}
        areas[k]['standards'].append(s)
    return list(areas.values())


def parse_text_fallback(path, pages):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        page_list = pdf.pages[pages[0] - 1:pages[1]] if pages else pdf.pages
        text = '\n'.join(p.extract_text() or '' for p in page_list)
    standards, order = {}, []
    matches = list(CODE_RE.finditer(text))
    for i, m in enumerate(matches):
        code = norm_code(m.group(1))
        seg = text[m.end(): matches[i + 1].start() if i + 1 < len(matches) else len(text)]
        parts = re.split(r'\n\s*([A-E])\s+', '\n' + seg)
        head = clean(parts[0])
        levels = {parts[j]: clean(parts[j + 1]) for j in range(1, len(parts) - 1, 2)}
        if code in standards:
            standards[code]['levels'].update({k: v for k, v in levels.items() if k not in standards[code]['levels']})
            continue
        standards[code] = {'code': code, 'text': head, 'levels': levels}
        order.append(code)
    return order, standards


def write_subject(subject, group, areas, source):
    data = {'id': subject, 'subject': subject, 'group': group, 'curriculum': '2022 개정',
            'source': source, 'areas': areas}
    fname = f'{subject}.js'
    (OUT_DIR / fname).write_text('registerStandards(' + json.dumps(data, ensure_ascii=False, indent=1) + ');\n', encoding='utf-8')

    index = []
    if INDEX.exists():
        m = re.search(r'=\s*(\[.*\])\s*;', INDEX.read_text(encoding='utf-8'), re.S)
        if m:
            index = json.loads(m.group(1))
    index = [e for e in index if e['id'] != subject]
    index.append({'id': subject, 'subject': subject, 'group': group, 'file': fname})
    index.sort(key=lambda e: (e.get('group', ''), e['subject']))
    INDEX.write_text('// 성취기준 데이터 목록 (tools/pdf_to_standards.py 가 자동으로 갱신합니다)\nwindow.STANDARDS_INDEX = '
                     + json.dumps(index, ensure_ascii=False, indent=1) + ';\n', encoding='utf-8')
    return OUT_DIR / fname


def summary(subject, areas):
    n = sum(len(a['standards']) for a in areas)
    print(f'\n■ {subject}: 영역 {len(areas)}개, 성취기준 {n}개')
    problems = 0
    for a in areas:
        print(f'  - {a["name"]}: ' + ', '.join(s['code'] for s in a['standards']))
        for s in a['standards']:
            missing = [L for L in 'ABCDE' if L not in s['levels']]
            if not s['text'] or (missing and len(missing) < 5 and missing != ['D', 'E']):
                problems += 1
                print(f'    ⚠ {s["code"]}: ' + ('성취기준 문장 없음 ' if not s['text'] else '') + (f'수준 누락 {missing}' if missing else ''))
    if problems:
        print(f'  → 확인이 필요한 항목 {problems}개. 사이트에서 불러와 직접 고칠 수 있습니다.')


def main():
    ap = argparse.ArgumentParser(description='성취수준 PDF → 성취기준 데이터 변환')
    ap.add_argument('pdfs', nargs='+')
    ap.add_argument('--subject')
    ap.add_argument('--group', default='')
    ap.add_argument('--pages')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    try:
        import pdfplumber  # noqa: F401
    except ImportError:
        sys.exit('pdfplumber 가 필요합니다:  pip install pdfplumber')
    if args.subject and len(args.pdfs) > 1:
        sys.exit('--subject 는 PDF 파일이 하나일 때만 쓸 수 있습니다.')
    pages = tuple(int(x) for x in args.pages.split('-')) if args.pages else None

    for pdf in args.pdfs:
        p = Path(pdf)
        subject = args.subject or p.stem
        # pdfs/국어/공통국어1.pdf 처럼 폴더에 넣으면 폴더 이름을 교과군으로 사용
        group = args.group or (p.parent.name if p.parent.name not in ('pdfs', '', '.') else '')
        areas = parse_pdf(p, pages)
        if not areas:
            print(f'\n✗ {p.name}: 성취기준 코드를 찾지 못했습니다 (스캔 이미지 PDF이거나 표 형식이 다를 수 있습니다).')
            continue
        summary(subject, areas)
        if not args.dry_run:
            out = write_subject(subject, group, areas, p.name)
            print(f'  저장: {out.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
