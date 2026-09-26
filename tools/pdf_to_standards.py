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
    # 12영II → 12영Ⅱ (PDF에 따라 로마 숫자를 영문 I 로 쓴 경우)
    prefix = re.sub(r'(?<=[가-힣])(III|II|I)$', lambda r: {'III': 'Ⅲ', 'II': 'Ⅱ', 'I': 'Ⅰ'}[r.group(1)], prefix)
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
    """코드 앞부분(예: 10공국1)으로 PDF 본문에서 과목명을 찾음. candidates 는 가까운 줄부터(아래→위) 순서"""
    abbr = roman_to_digit(re.sub(r'^\d{1,2}', '', prefix))
    if not abbr:
        return None
    key = lambda t: roman_to_digit(re.sub(r'\s+', '', t))
    digit_ok = lambda k: not abbr[-1].isdigit() or k[-1:] == abbr[-1]
    loose = lambda k: bool(k) and is_subsequence(abbr, k) and digit_ok(k)          # 장 제목: 약어 글자가 순서대로만 있으면 됨
    strict = lambda k: loose(k) and k[0] == abbr[0]                                 # 그 밖의 줄: 첫 글자까지 일치
    ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ'

    def tidy(t):
        t = re.sub(r'^\s*[' + ROMAN + r']+\s*[.]?\s*', '', t)
        t = re.sub(r'^\s*고등학교\s*', '', t)
        t = re.sub(r'\s*성취수준\s*$', '', t)
        return re.sub(r'\s+', ' ', t).strip()

    def accept(name, check):
        if not name or len(name) > 20 or re.search(r'교육과정|성취기준|고등학교|선택\s*과목|공통\s*과목|성취수준', name):
            return None
        if name.endswith('과') and check(key(name[:-1])):          # '보건과' → '보건'
            return name[:-1]
        return name if check(key(name)) else None

    for i, line in enumerate(candidates):
        above = candidates[i + 1] if i + 1 < len(candidates) else ''
        found = None
        if re.match(r'^\s*[' + ROMAN + r']+\s*[.]?\s*\S', line):                 # 'ⅩⅠ세포와 물질대사'
            found = accept(tidy(line), loose)
        elif re.fullmatch(r'\s*[' + ROMAN + r']+\s*', above):                       # 'Ⅹ' / '화학 반응의 세계'
            found = accept(tidy(line), loose)
        elif re.search(r'성취수준\s*$', line):                                       # '고등학교 데이터 과학 성취수준'
            found = accept(tidy(line), strict) or accept(tidy(above + ' ' + line), strict)
        if found:
            return found
    for line in candidates:                                                        # 마지막 수단: 짧은 단어 묶음
        if AREA_TITLE_RE.match(line):
            continue
        line = re.sub(r'^[\d' + ROMAN + r']+\s*[.)]\s*', '', line.strip())
        tokens = re.sub(r'[\[\]〈〉<>「」『』《》()（）]', ' ', line).split()
        for i in range(len(tokens)):
            for j in range(min(i + 4, len(tokens)), i, -1):
                cand = ' '.join(tokens[i:j])
                if 2 <= len(key(cand)) <= 12 and strict(key(cand)) and not re.search(r'성취|기준|수준|영역|학년|학기|평가', cand):
                    return cand
    return None


def guess_group(name):
    for group, words in GROUP_WORDS:
        if any(w in name for w in words):
            return group
    return '기타'


def parse_tables(path, pages=None):
    """표 칸을 인식하는 방식 (칸마다 테두리가 모두 그려진 PDF용)"""
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



# ---------------------------------------------------------------------------
# 글자 위치로 읽는 방식 (교육과정평가원 성취수준 자료처럼 가로줄만 있는 표)
#   왼쪽 칸 = 성취기준, 가운데 칸 = A~E, 오른쪽 칸 = 성취수준 문장
# ---------------------------------------------------------------------------
# 한글 수식 글꼴(HyhwpEQ, HancomEQN)은 글자를 사용자 정의 영역(U+E000~)에 두므로 실제 글자로 바꿈
# (PDF에 들어 있는 글꼴의 글자 모양을 그려 보고 만든 대응표)
EQ_MAP = {}
for _i in range(26):
    EQ_MAP[0xE000 + _i] = chr(65 + _i)        # A-Z
    EQ_MAP[0xE0E5 + _i] = chr(97 + _i)        # a-z
for _i, _d in enumerate('1234567890'):
    EQ_MAP[0xE034 + _i] = _d
EQ_MAP.update({
    0xE03E: '!', 0xE042: '%', 0xE043: '*', 0xE044: '(', 0xE045: ')', 0xE046: '−', 0xE047: '=', 0xE048: '+',
    0xE049: '[', 0xE04A: ']', 0xE04B: '{', 0xE04C: '}', 0xE04D: '|', 0xE04F: ':', 0xE052: ',', 0xE053: '.',
    0xE054: '/', 0xE055: '<', 0xE056: '>', 0xE05B: '∫', 0xE05C: '√', 0xE063: '^', 0xE067: 'Σ', 0xE06E: '→',
    0xE088: 'Δ', 0xE099: 'Φ', 0xE09D: 'α', 0xE09E: 'β', 0xE0A1: 'ϵ', 0xE0A4: 'θ', 0xE0A6: 'κ', 0xE0A7: 'λ',
    0xE0A8: 'μ', 0xE0AC: 'π', 0xE0AD: 'ρ', 0xE0AE: 'σ', 0xE0B2: 'χ', 0xE0C8: '°', 0xE10E: 'ε',
    # 큰 괄호 조각: 위쪽 조각만 괄호로 쓰고 나머지 조각은 버림
    0xE078: '', 0xE079: '{', 0xE07A: '', 0xE07B: '', 0xE07C: '(', 0xE07D: '', 0xE07E: '', 0xE07F: '', 0xE080: '',
    0xE081: ')', 0xE100: '[', 0xE101: '', 0xE102: ']', 0xE103: '', 0xE104: '', 0xE105: '',
    0xE06D: '',                                # 가로 막대(분수선·윗줄)는 따로 처리
    0xF06C: '●', 0xF09F: '•', 0xF0FC: '✓',   # Wingdings
})
SUP = dict(zip('0123456789+−-=()abcdefghijklmnoprstuvwxyz', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ'))
SUB = dict(zip('0123456789+−-=()aehijklmnoprstuvx', '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'))


def _is_pua(c):
    t = c['text']
    return bool(t) and 0xE000 <= ord(t[0]) <= 0xF8FF


# 글자 정보가 없어 PDF에서 (cid:번호)로만 나오는 글자
CID_MAP = {59091: '·'}


def _is_cid(c):
    return (c['text'] or '').startswith('(cid:')


def _is_eq(c):
    """수식 글꼴의 글자인지 (보통 글자로 대응된 수식 글자, 글자 정보 없는 글자 포함)"""
    return _is_pua(c) or _is_cid(c) or 'HyhwpEQ' in (c.get('fontname') or '') or 'HancomEQN' in (c.get('fontname') or '')


def _eq_text(c):
    t = c['text']
    if _is_cid(c):
        m = re.match(r'\(cid:(\d+)\)', t)
        return CID_MAP.get(int(m.group(1)), '') if m else ''
    return EQ_MAP.get(ord(t[0]), '') if _is_pua(c) else t


def _script(run, table, mark):
    """위/아래 첨자 글자들을 유니코드 첨자로 (못 바꾸는 글자가 있으면 ^( ) / _( ) 표기)"""
    if all(ch in table for ch in run):
        return ''.join(table[ch] for ch in run)
    return f'{mark}{run}' if len(run) == 1 else f'{mark}({run})'


def _line_text(cs, top, bottom):
    """한 줄의 글자들 → 문자열 (수식 글꼴은 실제 글자로, 작고 올라간/내려간 글자는 첨자로)"""
    size = bottom - top
    cs = sorted(cs, key=lambda c: c['x0'])
    # 분수선·윗줄(가로 막대): 막대 위아래 글자를 '위/아래' 로
    bars = [c for c in cs if _is_pua(c) and ord(c['text'][0]) == 0xE06D and (c['x1'] - c['x0']) > 2]
    used = set()
    frac_at = {}
    for bar in bars:
        mid = (bar['top'] + bar['bottom']) / 2
        inside = [c for c in cs if c is not bar and bar['x0'] - 1 <= (c['x0'] + c['x1']) / 2 <= bar['x1'] + 1]
        num = [c for c in inside if (c['top'] + c['bottom']) / 2 < mid]
        den = [c for c in inside if (c['top'] + c['bottom']) / 2 > mid]
        if num and den:
            wrap = lambda s: s if len(s) == 1 else f'({s})'
            n = ''.join(_eq_text(c) for c in sorted(num, key=lambda c: c['x0']))
            d = ''.join(_eq_text(c) for c in sorted(den, key=lambda c: c['x0']))
            frac_at[id(bar)] = f'{wrap(n)}/{wrap(d)}'
            used.update(id(c) for c in inside)
    out, run, kind = [], '', None

    def flush():
        nonlocal run, kind
        if run:
            out.append(_script(run, SUP, '^') if kind == 'sup' else _script(run, SUB, '_'))
        run, kind = '', None

    for c in cs:
        if id(c) in frac_at:
            flush(); out.append(frac_at[id(c)]); continue
        if id(c) in used:
            continue
        t = _eq_text(c)
        k = None
        if _is_eq(c) and t and (c['bottom'] - c['top']) < size * 0.9:
            if c['bottom'] < bottom - 1.5:
                k = 'sup'
            elif c['top'] > top + 1.5:
                k = 'sub'
        if k:
            if kind and kind != k:
                flush()
            run += t; kind = k
        else:
            flush(); out.append(t)
    flush()
    return ''.join(out)


def _lines(chars, tol=2.0):
    """글자들을 줄 단위로 묶어 [(top, bottom, text)] 로 반환 (줄 끝 공백 보존)
    보통 글자로 먼저 줄을 만들고, 수식 글자는 세로 가운데가 들어가는 줄에 넣음 (첨자·큰 기호가 줄에서 빠지지 않도록)"""
    base = [c for c in chars if not _is_eq(c)]
    eqs = [c for c in chars if _is_eq(c)]
    rows = []
    for c in sorted(base, key=lambda c: (c['top'], c['x0'])):
        if rows and abs(rows[-1][0] - c['top']) <= tol:
            rows[-1][2].append(c)
            rows[-1][1] = max(rows[-1][1], c['bottom'])
        else:
            rows.append([c['top'], c['bottom'], [c]])
    for c in eqs:
        mid = (c['top'] + c['bottom']) / 2
        best = None
        for r in rows:
            if r[0] - 1 <= mid <= r[1] + 1:
                best = r
                break
        if best is None and rows:
            near = min(rows, key=lambda r: abs((r[0] + r[1]) / 2 - mid))
            if abs((near[0] + near[1]) / 2 - mid) <= 8:
                best = near
        if best is None:
            best = [c['top'], c['bottom'], []]
            rows.append(best)
        best[2].append(c)
    rows.sort(key=lambda r: r[0])
    return [(t, b, _line_text(cs, t, b)) for t, b, cs in rows]


def _text(chars):
    # PDF는 공백에서 줄이 바뀔 때 줄 끝에 공백 글자를 남기므로, 줄을 그대로 이어 붙이면 원래 띄어쓰기가 복원됨
    return ''.join(t for _, _, t in _lines(chars))


def _norm(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def parse_layout(path, pages=None):
    import logging
    import pdfplumber
    logging.getLogger('pdfminer').setLevel(logging.ERROR)
    standards, order = {}, []
    area_of = {}             # code -> 영역 이름
    context = {}             # prefix -> 과목명 후보 줄들
    all_short = []
    prev_lines = []          # 앞 쪽들의 줄 (과목명 후보)
    carried_title = None     # 앞 쪽에서 이어지는 영역 제목
    group_votes = {}         # 쪽 머리말 '고등학교 과학과 선택과목 성취수준' → 교과군
    last = None              # 쪽을 넘어 이어질 수 있는 마지막 성취기준

    with pdfplumber.open(path) as pdf:
        page_list = pdf.pages[pages[0] - 1:pages[1]] if pages else pdf.pages
        for page in page_list:
            chars = [c for c in page.chars if c['text'] is not None]
            lines = _lines(chars)
            titles = []
            for _, _, text in lines[:3] + lines[-3:]:
                g = re.search(r'고등학교\s*(.+?)\s*(?:공통\s*과목|선택\s*과목)?\s*성취수준', text)
                if g and len(g.group(1)) <= 15:
                    key = re.sub(r'과$', '', re.sub(r'\s+', ' ', g.group(1)).strip())
                    group_votes[key] = group_votes.get(key, 0) + 1
            for t, b, text in lines:
                m = AREA_TITLE_RE.match(text)
                if m:
                    titles.append((t, (m.group(1) or m.group(2)).zfill(2), _norm(m.group(3))))
                elif 2 <= len(text.strip()) <= 40:
                    all_short.append(text.strip())

            # 가운데 칸의 A~E 글자 찾기 (주변에 다른 글자가 없는 한 글자)
            solo = []
            for c in chars:
                if c['text'] in 'ABCDE' and len(c['text']) == 1:
                    near = [d for d in chars if d is not c and d['text'].strip() and abs(d['top'] - c['top']) < 3
                            and (abs(d['x0'] - c['x1']) < 6 or abs(c['x0'] - d['x1']) < 6)]
                    if not near:
                        solo.append(c)
            cols = {}
            for c in solo:
                cols.setdefault(round(c['x0'] / 4), []).append(c)
            col = max(cols.values(), key=len) if cols else []
            if len(col) < 2:
                if titles:
                    carried_title = titles[-1][1:]
                prev_lines = ([l[2].strip() for l in lines] + prev_lines)[:80]
                last = None
                continue
            lx0 = min(c['x0'] for c in col) - 2
            lx1 = max(c['x1'] for c in col) + 2
            letters = sorted([c for c in solo if lx0 <= c['x0'] and c['x1'] <= lx1], key=lambda c: c['top'])

            hedges = [e for e in page.edges if e['orientation'] == 'h']
            # 성취기준 사이 줄: 왼쪽 칸을 가로지르는 줄 (한 줄로 그려지든, 칸마다 끊어 그려지든)
            std_edges = sorted({round(e['top'], 1) for e in hedges if e['x0'] < lx0 - 20 and e['x1'] > lx0 - 30})
            row_edges = sorted({round(e['top'], 1) for e in hedges if e['x0'] <= lx0 + 2 and e['x1'] >= lx1 - 2})
            # 오른쪽(성취수준 문장) 칸을 가로지르는 줄 — A·B가 한 칸을 함께 쓰는 경우를 구분하기 위해 따로 셈
            text_edges = sorted({round(e['top'], 1) for e in hedges if e['x0'] <= lx1 + 15 and e['x1'] >= lx1 + 100})
            table_bottom = max(row_edges) if row_edges else page.height

            # 머리글('성취기준 성취기준별 성취수준') 줄 → 표 구간 시작
            headers = [(t, b) for t, b, text in lines
                       if re.fullmatch(r'(교육과정)?성취기준성취기준별성취수준', re.sub(r'\s', '', text))]
            segs, starts = [], [0.0] + [b for _, b in headers]
            ends = [t for t, _ in headers] + [table_bottom]
            for i, (a, z) in enumerate(zip(starts, ends)):
                if z > a:
                    segs.append((a, z))

            first_cell_on_page = True
            for a, z in segs:
                seg_letters = [c for c in letters if a < c['top'] < z]
                if not seg_letters:
                    continue
                cuts = [a] + [y for y in std_edges if a + 1 < y < z - 1] + [z]
                for y0, y1 in zip(cuts, cuts[1:]):
                    cell_letters = [c for c in seg_letters if y0 < (c['top'] + c['bottom']) / 2 < y1]
                    if not cell_letters:
                        continue
                    mid = lambda c: (c['top'] + c['bottom']) / 2
                    left = [c for c in chars if c['x1'] <= lx0 and y0 < mid(c) < y1 and c['x0'] > 30]
                    right = [c for c in chars if c['x0'] >= lx1 and y0 < mid(c) < y1]
                    left_text = _text(left)
                    m = CODE_RE.search(left_text)

                    # 이 칸의 A~E 행 나누기
                    # rows: [(이 문장 칸에 해당하는 수준 글자들, 문장)]
                    inner = [y for y in text_edges if y0 + 1 < y < y1 - 1]
                    bounds = [y0] + inner + [y1]
                    rows = []
                    for r0, r1 in zip(bounds, bounds[1:]):
                        lt = [c['text'] for c in cell_letters if r0 < mid(c) < r1]
                        txt = _text([c for c in right if r0 < mid(c) < r1])
                        if lt or txt.strip():
                            rows.append((lt, txt))
                    if not text_edges and len(cell_letters) > 1:   # 표에 가로줄이 아예 없으면 글자 위치의 중간값으로 나눔
                        ys = [mid(c) for c in cell_letters]
                        cut2 = [y0] + [(p + q) / 2 for p, q in zip(ys, ys[1:])] + [y1]
                        rows = [([c['text']], _text([d for d in right if r0 < mid(d) < r1]))
                                for c, r0, r1 in zip(cell_letters, cut2, cut2[1:])]

                    first_L = next((lt[0] for lt, _ in rows if lt), None)
                    if m:
                        code = norm_match(m)
                        if code in standards:          # 예시 평가 도구 등에서 다시 나온 성취기준 → 건너뜀
                            last = None
                            first_cell_on_page = False
                            continue
                        ms = list(CODE_RE.finditer(left_text))
                        body = left_text[m.end():ms[1].start()] if len(ms) > 1 else left_text[m.end():]
                        # 한 칸에 성취기준 여러 개가 묶여 성취수준을 함께 쓰는 경우 (과학과 등)
                        also = [(norm_match(a), left_text[a.end():(ms[k + 2].start() if k + 2 < len(ms) else len(left_text))])
                                for k, a in enumerate(ms[1:])]
                        std = {'code': code, 'text': body, 'levels': {}, '_last': None, '_also': also}
                        standards[code] = std
                        order.append(code)
                        prefix, area, _ = code_parts(code)
                        above = [t for t in titles if t[0] < y0]
                        title = above[-1][1:] if above else carried_title
                        if title and title[0] == area:
                            area_of[code] = title[1]
                        if prefix not in context:
                            context[prefix] = [l[2].strip() for l in reversed(lines) if l[0] < y0] + prev_lines
                        last = std
                    elif (first_cell_on_page and last is not None
                          and (first_L is None or first_L == last['_last'] or first_L not in last['levels'])):
                        # 앞 쪽에서 이어지는 칸 (이미 채운 수준이 처음부터 다시 나오면 다른 표이므로 제외)
                        std = last
                        std['text'] += left_text
                    else:
                        last = None
                        first_cell_on_page = False
                        continue
                    first_cell_on_page = False
                    for lts, txt in rows:
                        if not lts:                    # 글자 없는 행 = 앞 수준 문장의 이어짐
                            if std['_last']:
                                for L in std['_lastset']:
                                    std['levels'][L] += txt
                            continue
                        for L in lts:                  # 여러 수준이 한 문장 칸을 함께 쓰면 같은 문장을 넣음
                            std['levels'][L] = std['levels'].get(L, '') + txt
                        std['_last'], std['_lastset'] = lts[-1], lts
            if titles:
                carried_title = titles[-1][1:]
            prev_lines = ([l[2].strip() for l in lines] + prev_lines)[:80]

    strip_text = lambda t: _norm(re.split(r'<\s*탐구\s*활동\s*>', t)[0])
    final = []
    for code in order:
        s = standards[code]
        levels = {L: _norm(s['levels'][L]) for L in 'ABCDE' if s['levels'].get(L, '').strip()}
        final.append({'code': code, 'text': strip_text(s['text']), 'levels': levels})
        for c2, t2 in s.get('_also', []):
            if c2 not in standards:
                final.append({'code': c2, 'text': strip_text(t2), 'levels': dict(levels), 'sharedWith': code})
                area_of.setdefault(c2, area_of.get(code))
    group = max(group_votes, key=group_votes.get) if group_votes else None
    subjects = {}
    for s in final:
        prefix, area, _ = code_parts(s['code'])
        subj = subjects.setdefault(prefix, {'areas': {}, 'name': None, 'group': group})
        subj['areas'].setdefault(area, {'name': area_of.get(s['code']), 'standards': []})['standards'].append(s)
    for prefix in list(subjects):
        subj = subjects[prefix]
        subj['name'] = guess_name(prefix, context.get(prefix, [])) or guess_name(prefix, all_short)
        if sum(len(a['standards']) for a in subj['areas'].values()) <= 1:
            print(f'  (건너뜀: {prefix} — 성취기준이 1개뿐이라 다른 과목 자료의 인용으로 보임)')
            del subjects[prefix]
            continue
        areas = subj['areas']
        for key, a in areas.items():
            if not a['name']:
                # 영역 구분이 없는 과목은 과목명을, 아니면 '영역 01' 을 씀
                a['name'] = (subj['name'] or prefix) if len(areas) == 1 else f'영역 {key}'
        subj['areas'] = list(areas.values())
    return subjects


def parse_pdf(path, pages=None):
    """PDF → {코드앞부분: {'areas': [...], 'name': 추정 과목명}}
    글자 위치 방식으로 먼저 읽고, 결과가 없으면 표 칸 인식 방식으로 읽습니다."""
    subjects = parse_layout(path, pages)
    return subjects if subjects else parse_tables(path, pages)

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


GROUP_ALIASES = {'음악': '예술', '미술': '예술', '예술 계열': '예술 계열', '제2외국어': '제2외국어',
                 '진로와직업': '교양', '진로와 직업': '교양', '보건': '교양', '환경': '교양'}


def normalize_group(group):
    """'제2외국어과(일본어)' → '제2외국어', '예술 계열(음악)' → '예술 계열', '음악' → '예술'"""
    g = re.sub(r'\(.*?\)', '', group or '').strip()
    g = re.sub(r'과$', '', g).strip()
    return GROUP_ALIASES.get(g, g) or '기타'


def write_subject(subject, group, prefix, areas, source):
    group = normalize_group(group)
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
    count = sum(len(a['standards']) for a in areas)
    index.append({'id': subject, 'subject': subject, 'group': group, 'codePrefix': prefix, 'file': fname, 'count': count})
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
            group = args.group or folder or subj.get('group') or guess_group(subject)
            summary(subject, prefix, how, group, subj['areas'])
            if not args.dry_run:
                out = write_subject(subject, group, prefix, subj['areas'], p.name)
                print(f'  저장: {out.relative_to(ROOT)}')

    print('\n과목명이 틀렸다면 tools/subject_names.json 에 {"코드앞부분": "과목명"} 을 추가하고 다시 실행하세요.')
    if unnamed:
        print('과목명을 찾지 못한 코드: ' + ', '.join(sorted(set(unnamed))))


if __name__ == '__main__':
    main()
