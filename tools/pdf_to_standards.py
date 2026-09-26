#!/usr/bin/env python3
"""
성취수준 PDF → 사이트용 성취기준 데이터(data/standards/*.js) 변환 도구

  ■ PDF 파일 이름이 제각각이어도, 한 파일에 여러 과목이 들어 있어도 됩니다.
    성취기준 코드의 앞부분(예: [10공국1-01-01] → '10공국1', [12대수01-01] → '12대수')으로
    과목을 나누고, PDF 본문의 과목명(예: '공통국어1')을 찾아 이름을 붙입니다.
  ■ 과목명을 잘못 찾았으면 tools/subject_names.json 에 "코드앞부분": "과목명" 을 적고 다시 실행하세요.

사용법
  pip install pdfplumber
  python tools/pdf_to_standards.py pdfs/*.pdf              # 여러 파일 한꺼번에
  python tools/pdf_to_standards.py pdfs/**/*.pdf --dry-run # 저장하지 않고 결과만 확인

  옵션
    --group   교과군   (생략하면 폴더 이름 → 과목명으로 추정)
    --pages   5-30     (성취수준 표가 있는 쪽 범위만 읽기)
    --dry-run          (파일을 쓰지 않고 결과만 출력)

  PDF마다 표 모양이 달라 100% 정확하지 않을 수 있습니다. 변환 후 사이트에서 불러와 확인하세요.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'data' / 'standards'
INDEX = OUT_DIR / 'index.js'
NAMES_FILE = Path(__file__).resolve().parent / 'subject_names.json'

DASH = r'[-–—‐]'
# [10공국1-01-01] / [12대수01-01] / [9국01-01] / [12물리Ⅰ01-01] 모두 인식
CODE_RE = re.compile(
    r'\[\s*(\d{1,2}\s*[가-힣A-Za-zⅠ-Ⅻ·ㆍ]+(?:\s*\d(?=\s*' + DASH + r'))?)\s*' + DASH + r'?\s*(\d{2})\s*' + DASH + r'\s*(\d{2})\s*\]')
LEVEL_RE = re.compile(r'^\s*([A-E])\s*$')
LEVEL_PREFIX_RE = re.compile(r'^\s*([A-E])\s+(.+)$', re.S)
AREA_TITLE_RE = re.compile(r'^\s*(?:\((\d{1,2})\)|(\d{1,2})[.)])\s*([가-힣][가-힣A-Za-z·ㆍ\s,]{0,24}?)\s*$')

GROUP_WORDS = [
    ('국어', ['국어', '문학', '화법', '독서', '작문', '매체', '언어']),
    ('수학', ['수학', '대수', '미적분', '확률', '통계', '기하']),
    ('영어', ['영어']),
    ('사회', ['사회', '지리', '역사', '한국사', '윤리', '경제', '정치', '법', '세계시민', '문화']),
    ('과학', ['과학', '물리', '화학', '생명', '지구', '천문', '융합']),
    ('체육', ['체육', '운동', '스포츠']),
    ('예술', ['음악', '미술', '연극', '영화', '예술']),
    ('기술·가정/정보', ['기술', '가정', '정보', '인공지능', '로봇', '생활과학']),
    ('제2외국어/한문', ['일본어', '중국어', '독일어', '프랑스어', '스페인어', '러시아어', '아랍어', '베트남어', '한문']),
    ('교양', ['진로', '논리', '철학', '심리', '교육', '종교', '보건', '환경']),
]


def code_parts(code):
    m = CODE_RE.search('[' + code + ']')
    return (re.sub(r'\s+', '', m.group(1)), m.group(2), m.group(3)) if m else (code, '00', '00')


def norm_match(m):
    prefix = re.sub(r'\s+', '', m.group(1))
    sep = '-' if re.search(r'\d$', prefix) else ''       # 10공국1-01-01 / 12대수01-01
    return f'{prefix}{sep}{m.group(2)}-{m.group(3)}'


def clean(s):
    s = (s or '').replace(' ', ' ')
    s = re.sub(r'[ \t]*\n[ \t]*', ' ', s)          # PDF 줄바꿈은 문장 중간이므로 이어 붙임
    s = re.sub(r'\s{2,}', ' ', s)
    return s.strip()


def is_subsequence(small, big):
    it = iter(big)
    return all(ch in it for ch in small)


def roman_to_digit(s):
    return s.translate(str.maketrans({'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5'}))


def guess_name(prefix, candidates):
    """코드 앞부분(예: 10공국1)의 글자가 순서대로 들어 있는 짧은 줄을 과목명으로 추정"""
    abbr = roman_to_digit(re.sub(r'^\d{1,2}', '', prefix))
    if not abbr:
        return None
    for line in candidates:
        line = re.sub(r'^[\dⅠ-Ⅻ]+\s*[.)]\s*', '', line.strip())
        line = re.sub(r'[\[\]〈〉<>「」『』《》()（）]', ' ', line)
        tokens = line.split()
        for i in range(len(tokens)):
            for j in range(i + 1, min(i + 4, len(tokens)) + 1):
                cand = ' '.join(tokens[i:j])
                key = roman_to_digit(cand.replace(' ', ''))
                if (2 <= len(key) <= 12 and key[0] == abbr[0] and is_subsequence(abbr, key)
                        and not re.search(r'성취|기준|수준|영역|학년|학기|평가', cand)
                        and (not abbr[-1].isdigit() or key[-1] == abbr[-1])):
                    return cand
    return None


def guess_group(name):
    for group, words in GROUP_WORDS:
        if any(w in name for w in words):
            return group
    return '기타'


def parse_pdf(path, pages=None):
    """PDF → {코드앞부분: {'areas': [...], 'name': 추정 과목명}}"""
    import logging
    import pdfplumber
    logging.getLogger('pdfminer').setLevel(logging.ERROR)
    standards, order = {}, []
    area_names = {}          # (prefix, 영역번호) -> 영역 이름
    context = {}             # prefix -> 첫 코드 직전의 짧은 줄들 (과목명 후보)
    all_short = []
    recent = []
    text_codes = []          # 본문에 나온 코드 순서 (표에서 코드 칸이 비어 나올 때 보충용)
    last_title = None
    cur, last_level = None, None

    with pdfplumber.open(path) as pdf:
        page_list = pdf.pages[pages[0] - 1:pages[1]] if pages else pdf.pages
        for page in page_list:
            # 1) 본문 줄: 과목명·영역명 찾기
            for line in (page.extract_text() or '').splitlines():
                ms = list(CODE_RE.finditer(line))
                if ms:
                    for m in ms:
                        code = norm_match(m)
                        if code not in text_codes:
                            text_codes.append(code)
                        prefix, area, _ = code_parts(code)
                        context.setdefault(prefix, list(reversed(recent[-25:])))
                        if last_title and last_title[0] == area:
                            area_names.setdefault((prefix, area), last_title[1])
                    continue
                t = AREA_TITLE_RE.match(line)
                if t:
                    last_title = ((t.group(1) or t.group(2)).zfill(2), clean(t.group(3)))
                elif 2 <= len(line.strip()) <= 40:
                    recent.append(line)
                    all_short.append(line)

            # 2) 표: 성취기준과 A~E 성취수준
            for table in page.extract_tables():
                for row in table:
                    cells = [c if c is not None else '' for c in row]
                    joined = ' '.join(cells)
                    code_cell = next((c for c in cells if CODE_RE.search(c or '')), None)
                    if code_cell:
                        m = CODE_RE.search(code_cell)
                        code = norm_match(m)
                        body = clean(code_cell[m.end():])
                        if code not in standards:
                            standards[code] = {'code': code, 'text': body, 'levels': {}}
                            order.append(code)
                        elif body and not standards[code]['text']:
                            standards[code]['text'] = body
                        cur, last_level = standards[code], None
                    rest = [c for c in cells if c and c is not code_cell]
                    level = next((LEVEL_RE.match(c).group(1) for c in rest if LEVEL_RE.match(c)), None)
                    texts = [clean(c) for c in rest if not LEVEL_RE.match(c) and clean(c)]
                    if not level and texts:                      # 'A 문장' 처럼 한 칸에 붙은 경우
                        m2 = LEVEL_PREFIX_RE.match(texts[0])
                        if m2 and len(texts[0]) > 10:
                            level, texts[0] = m2.group(1), m2.group(2)
                    body = max(texts, key=len) if texts else ''
                    # 코드 칸이 비어 있는데 새 성취기준이 시작된 경우(쪽 넘김의 병합 칸 등):
                    # 이미 채운 수준 글자가 다시 나오면 본문 순서상 다음 코드로 보충
                    if level and not code_cell and (cur is None or (level in cur['levels'] and level != last_level)):
                        nxt = next((c for c in text_codes if c not in standards), None)
                        if nxt is None:
                            nxt = f'확인필요-{len(order) + 1}'
                        standards[nxt] = {'code': nxt, 'text': '', 'levels': {}}
                        order.append(nxt)
                        cur, last_level = standards[nxt], None
                    if cur is None:
                        continue
                    if level:
                        prev = cur['levels'].get(level, '')
                        cur['levels'][level] = (prev + ' ' + body).strip() if prev else body
                        last_level = level
                    elif (body and last_level and not code_cell and '성취' not in joined[:8]
                          and not AREA_TITLE_RE.match(body)):
                        # 쪽이 넘어가며 잘린 칸 → 앞 수준에 이어 붙임
                        cur['levels'][last_level] = (cur['levels'][last_level] + ' ' + body).strip()

    if not order:                                               # 표가 없는 PDF → 본문에서 추출
        order, standards = parse_text_fallback(path, pages)

    subjects = {}
    for code in order:
        prefix, area, _ = code_parts(code)
        subj = subjects.setdefault(prefix, {'areas': {}, 'name': None})
        a = subj['areas'].setdefault(area, {'name': area_names.get((prefix, area), f'영역 {area}'), 'standards': []})
        s = standards[code]
        s['levels'] = {L: s['levels'][L] for L in 'ABCDE' if L in s['levels']}
        a['standards'].append(s)
    for prefix, subj in subjects.items():
        subj['areas'] = list(subj['areas'].values())
        subj['name'] = guess_name(prefix, context.get(prefix, [])) or guess_name(prefix, all_short)
    return subjects


def parse_text_fallback(path, pages):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        page_list = pdf.pages[pages[0] - 1:pages[1]] if pages else pdf.pages
        text = '\n'.join(p.extract_text() or '' for p in page_list)
    standards, order = {}, []
    matches = list(CODE_RE.finditer(text))
    for i, m in enumerate(matches):
        code = norm_match(m)
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


def load_names():
    if NAMES_FILE.exists():
        data = json.loads(NAMES_FILE.read_text(encoding='utf-8'))
        return {k: v for k, v in data.items() if not k.startswith('_')}
    return {}


def safe_filename(name):
    return re.sub(r'[\\/:*?"<>|\s]+', '_', name).strip('_') or 'subject'


def write_subject(subject, group, prefix, areas, source):
    data = {'id': subject, 'subject': subject, 'group': group, 'codePrefix': prefix,
            'curriculum': '2022 개정', 'source': source, 'areas': areas}
    fname = safe_filename(subject) + '.js'
    index = []
    if INDEX.exists():
        m = re.search(r'=\s*(\[.*\])\s*;', INDEX.read_text(encoding='utf-8'), re.S)
        if m:
            index = json.loads(m.group(1))
    # 같은 과목(코드)이 예전에 다른 이름으로 저장돼 있었다면 지움
    for e in index:
        if e.get('codePrefix') == prefix and e['id'] != subject:
            old = OUT_DIR / e['file']
            if old.exists() and e['file'] != fname:
                old.unlink()
    index = [e for e in index if e['id'] != subject and e.get('codePrefix') != prefix]
    (OUT_DIR / fname).write_text('registerStandards(' + json.dumps(data, ensure_ascii=False, indent=1) + ');\n', encoding='utf-8')
    index.append({'id': subject, 'subject': subject, 'group': group, 'codePrefix': prefix, 'file': fname})
    index.sort(key=lambda e: (e.get('group', ''), e['subject']))
    INDEX.write_text('// 성취기준 데이터 목록 (tools/pdf_to_standards.py 가 자동으로 갱신합니다)\nwindow.STANDARDS_INDEX = '
                     + json.dumps(index, ensure_ascii=False, indent=1) + ';\n', encoding='utf-8')
    return OUT_DIR / fname


def summary(subject, prefix, how, group, areas):
    n = sum(len(a['standards']) for a in areas)
    print(f'\n■ {subject}  (코드 {prefix}, 과목명 {how}, 교과군 {group}) — 영역 {len(areas)}개, 성취기준 {n}개')
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
    ap.add_argument('--group', default='')
    ap.add_argument('--pages')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    try:
        import pdfplumber  # noqa: F401
    except ImportError:
        sys.exit('pdfplumber 가 필요합니다:  pip install pdfplumber')
    pages = tuple(int(x) for x in args.pages.split('-')) if args.pages else None
    names = load_names()
    unnamed = []

    for pdf in args.pdfs:
        p = Path(pdf)
        print(f'\n===== {p.name}')
        subjects = parse_pdf(p, pages)
        if not subjects:
            print('✗ 성취기준 코드를 찾지 못했습니다 (스캔 이미지 PDF이거나 표 형식이 다를 수 있습니다).')
            continue
        folder = p.parent.name if p.parent.name not in ('pdfs', '', '.') else ''
        for prefix, subj in subjects.items():
            if prefix in names:
                subject, how = names[prefix], 'subject_names.json'
            elif subj['name']:
                subject, how = subj['name'], 'PDF에서 찾음'
            elif len(subjects) == 1:
                subject, how = p.stem, '파일 이름'
            else:
                subject, how = prefix, '못 찾음 → 코드 사용'
                unnamed.append(prefix)
            group = args.group or folder or guess_group(subject)
            summary(subject, prefix, how, group, subj['areas'])
            if not args.dry_run:
                out = write_subject(subject, group, prefix, subj['areas'], p.name)
                print(f'  저장: {out.relative_to(ROOT)}')

    print('\n과목명이 틀렸다면 tools/subject_names.json 에 {"코드앞부분": "과목명"} 을 추가하고 다시 실행하세요.')
    if unnamed:
        print('과목명을 찾지 못한 코드: ' + ', '.join(sorted(set(unnamed))))


if __name__ == '__main__':
    main()
