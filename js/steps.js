/* 단계별 작성 화면
 * 양식의 순서가 아니라 작성하기 편한 순서로 나누고, 마지막 단계에서 양식 모양으로 미리보기·내려받기 합니다. */
'use strict';

const SUBJECT_TYPES = ['공통과목', '선택과목', '과학탐구실험', '체육·예술'];
const TYPE_RATE = { '공통과목': 'common', '선택과목': 'elective', '과학탐구실험': 'sciLab', '체육·예술': 'artsPe' };
const METHOD_SUGGEST = ['선택형', '서답형', '서술', '논술', '프로젝트', '토의·토론', '구술·발표', '실험·실습', '포트폴리오', '실기', '보고서'];
const GROUP_ORDER = ['국어', '수학', '영어', '사회', '역사', '도덕', '과학', '정보', '기술ㆍ가정', '제2외국어', '한문',
  '체육', '예술', '교양', '과학 계열', '체육 계열', '예술 계열'];

/* 화면 상태 (저장하지 않음) */
const ui = { group: null, query: '', areaTab: 'all', editing: new Set(), perf: 0 };

/* ---------- 아이콘 (선 아이콘) ---------- */
const ICONS = {
  check: 'M5 12.5l4.2 4.2L19 7',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4.8h6V7M6.5 7l1 12.2h9L17.5 7',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  x: 'M6 6l12 12M18 6L6 18',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20',
  chevron: 'M6 9l6 6 6-6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  alert: 'M12 8v5M12 16.5v.5M12 3l9.5 17h-19z',
};
function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
}

/* ---------- 작은 부품 ---------- */
const attr = (k, v) => (v === undefined || v === null || v === false ? '' : ` ${k}="${esc(v === true ? k : v)}"`);
function input(path, { ph = '', type = 'text', list, rerender, cls = '', min } = {}) {
  return `<input class="input ${cls}" type="${type}" data-bind="${path}" value="${esc(getPath(path) ?? '')}"${attr('placeholder', ph)}${attr('list', list)}${attr('min', min)}${rerender ? ' data-rerender="1"' : ''}>`;
}
function area(path, { ph = '', rows = 2, cls = '' } = {}) {
  return `<textarea class="input ${cls}" rows="${rows}" data-bind="${path}"${attr('placeholder', ph)}>${esc(getPath(path) ?? '')}</textarea>`;
}
function field(label, control, { hint: h, span = 1 } = {}) {
  return `<label class="field span-${span}"><span class="label">${label}</span>${control}${h ? `<span class="help">${h}</span>` : ''}</label>`;
}
function seg(path, options, { rerender = true, labels } = {}) {
  const cur = String(getPath(path) ?? '');
  return `<div class="segmented" role="radiogroup">${options.map((o, i) => `<label><input type="radio" name="${path}" data-bind="${path}" value="${esc(o)}"${cur === String(o) ? ' checked' : ''}${rerender ? ' data-rerender="1"' : ''}><span>${esc(labels ? labels[i] : o)}</span></label>`).join('')}</div>`;
}
function toggle(path, label) {
  return `<label class="toggle-row"><span>${label}</span><input type="checkbox" class="switch" data-bind="${path}"${getPath(path) ? ' checked' : ''}></label>`;
}
function checkChips(path, options) {
  const arr = getPath(path) || [];
  return `<div class="chips">${options.map(o => `<label class="chip"><input type="checkbox" data-arr="${path}" value="${esc(o)}"${arr.includes(o) ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
}
function section(title, body, { sub = '', actions = '', cls = '' } = {}) {
  return `<section class="group ${cls}">${title || actions ? `<div class="group-head"><div>${title ? `<h3>${title}</h3>` : ''}${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="group-actions">${actions}</div>` : ''}</div>` : ''}<div class="group-body">${body}</div></section>`;
}
function b(act, label, data = {}, cls = 'btn-secondary') {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button type="button" class="btn ${cls}" data-act="${act}" ${attrs}>${label}</button>`;
}
function ib(act, name, title, data = {}, cls = '') {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button type="button" class="icon-btn ${cls}" data-act="${act}" title="${esc(title)}" aria-label="${esc(title)}" ${attrs}>${icon(name)}</button>`;
}
function note(text) { return `<p class="note">${text}</p>`; }
function empty(text, action = '') { return `<div class="empty"><p>${text}</p>${action}</div>`; }
const codeList = t => extractCodes(t).map(c => `<span class="code">${esc(c)}</span>`).join('') || '<span class="muted">선택 안 함</span>';

/* ---------- 단계 정의 ---------- */
const STEPS = [
  { id: 'basic', title: '기본 정보', desc: '과목과 학교 정보를 입력합니다.', render: stepBasic, done: () => !!state.meta.subject.trim() && !!state.meta.school.trim() },
  { id: 'standards', title: '성취기준', desc: '과목의 성취기준과 성취수준을 확인합니다. 문서의 Ⅱ가 됩니다.', render: stepStandards, done: () => allStandards().length > 0 },
  { id: 'design', title: '평가 설계', desc: '정기시험과 수행평가의 비율과 방법을 정합니다. 문서의 평가 개요표가 됩니다.', render: stepDesign, done: () => ratioTotal() === 100 },
  { id: 'rubric', title: '수행평가 채점기준', desc: '수행평가 영역마다 채점기준표를 만듭니다.', render: stepRubric, done: () => state.perfs.length > 0 && state.perfs.every(rubricOk) },
  { id: 'plan', title: '주차별 수업 계획', desc: '주차별 단원, 성취기준, 수업·평가 방법을 적습니다. 문서의 Ⅰ이 됩니다.', render: stepPlan, done: () => state.plan.some(r => String(r.hours).trim() && (r.unit || r.std).trim()) },
  { id: 'rules', title: '평가 운영 규정', desc: '평가 목적, 방침, 결시자 처리 등을 확인합니다. 양식의 기본 문구가 들어 있습니다.', render: stepRules, done: () => /[가-힣]{4,}/.test(state.text.purpose) },
  { id: 'levels', title: '학기 성취수준', desc: '학기 단위 성취수준과 최소 성취수준을 적습니다.', render: stepLevels, done: () => LEVELS.every(L => String(state.semesterLevels[L]).trim()) },
  { id: 'finish', title: '확인 및 내려받기', desc: '빠진 곳을 점검하고 한글 파일로 내려받습니다.', render: stepFinish, done: () => false },
];

function ratioTotal() {
  const sum = arr => arr.reduce((s, x) => s + (isNaN(x) ? 0 : x), 0);
  return sum(state.exams.map(e => num(e.ratio))) + sum(state.perfs.map(p => num(p.ratio)));
}
function rubricOk(p) {
  const total = p.rubric.elements.reduce((s, el) => s + elMax(el), 0);
  return !isNaN(num(p.max)) && total === num(p.max);
}

/* ---------- 1. 기본 정보 ---------- */
function subjectGroups() {
  const idx = window.STANDARDS_INDEX || [];
  const groups = {};
  idx.forEach(s => { (groups[s.group || '기타'] = groups[s.group || '기타'] || []).push(s); });
  const names = Object.keys(groups).sort((a, b2) => {
    const ia = GROUP_ORDER.indexOf(a), ib2 = GROUP_ORDER.indexOf(b2);
    return (ia < 0 ? 99 : ia) - (ib2 < 0 ? 99 : ib2) || a.localeCompare(b2, 'ko');
  });
  return { groups, names };
}
function subjectTile(s) {
  const on = state.standardsSource === s.id;
  return `<button type="button" class="tile${on ? ' on' : ''}" data-act="pickSubjectId" data-id="${esc(s.id)}">
    <span class="tile-name">${esc(s.subject)}</span><span class="tile-meta">${s.count ? `성취기준 ${s.count}개` : ''}</span>${on ? icon('check', 'tile-check') : ''}</button>`;
}
function subjectResults() {
  const { groups, names } = subjectGroups();
  const q = ui.query.replace(/\s/g, '');
  if (q) {
    const hits = names.map(g => [g, groups[g].filter(s => s.subject.replace(/\s/g, '').includes(q))]).filter(([, l]) => l.length);
    if (!hits.length) return `<p class="muted pad">‘${esc(ui.query)}’와(과) 맞는 과목이 없습니다.</p>`;
    return hits.map(([g, l]) => `<div class="tile-group"><h4>${esc(g)}</h4><div class="tiles">${l.map(subjectTile).join('')}</div></div>`).join('');
  }
  const list = groups[ui.group] || [];
  const common = list.filter(s => /^10/.test(s.codePrefix || ''));
  const elective = list.filter(s => !/^10/.test(s.codePrefix || ''));
  const block = (title, l) => l.length ? `<div class="tile-group"><h4>${title}</h4><div class="tiles">${l.sort((a, b2) => a.subject.localeCompare(b2.subject, 'ko')).map(subjectTile).join('')}</div></div>` : '';
  return block('공통과목', common) + block('선택과목', elective);
}
function stepBasic() {
  const { groups, names } = subjectGroups();
  if (!ui.group || !groups[ui.group]) {
    const cur = (window.STANDARDS_INDEX || []).find(s => s.id === state.standardsSource);
    ui.group = cur ? cur.group : names[0];
  }
  const cur = state.standardsSource;
  const browser = `
    <div class="picker-bar">
      <div class="search">${icon('search')}<input id="subjectQuery" class="input" placeholder="과목 검색" value="${esc(ui.query)}" autocomplete="off"></div>
      <div class="current">${cur ? `선택한 과목 <b>${esc(cur)}</b> · 성취기준 ${allStandards().length}개` : '<span class="muted">과목을 고르면 성취기준이 자동으로 들어옵니다.</span>'}</div>
    </div>
    <div class="browser">
      <nav class="group-list${ui.query ? ' dim' : ''}">${names.map(g => `<button type="button" class="${g === ui.group && !ui.query ? 'on' : ''}" data-act="setGroup" data-group="${esc(g)}"><span>${esc(g)}</span><span class="count">${groups[g].length}</span></button>`).join('')}</nav>
      <div class="results" id="subjectResults">${subjectResults()}</div>
    </div>`;
  return section('과목', browser, { cls: 'flush' })
    + section('문서 정보', `
      <div class="grid g4">
        ${field('문서에 쓸 과목명', input('meta.subject', { ph: '과목명' }), { span: 2 })}
        ${field('학년도', input('meta.year', { type: 'number', ph: '2026' }))}
        ${field('학기', seg('meta.semester', ['1', '2'], { labels: ['1학기', '2학기'] }))}
      </div>
      ${field('과목 유형', seg('subjectType', SUBJECT_TYPES), { hint: '성취도 기준표와 최소 성취수준 작성 여부가 정해집니다. 과목을 고르면 자동으로 선택됩니다.' })}`)
    + section('학교 및 학급', `
      <div class="grid g4">
        ${field('학교명', input('meta.school', { ph: 'OO고등학교' }))}
        ${field('학년', input('meta.grade', { ph: '1학년' }))}
        ${field('학급', input('meta.classes', { ph: '1~8반' }))}
        ${field('학점', input('meta.credit', { ph: '4' }))}
        ${field('지도교사', input('meta.teachers', { ph: '홍길동, 김철수' }), { span: 2, hint: '여러 명이면 쉼표로 구분합니다.' })}
        ${field('분할점수 산출 유형', seg('meta.cutType', ['고정', '추정'], { rerender: false }), { span: 2 })}
      </div>
      <details class="disclosure"><summary>5명 이하 과목 ‘석차등급’란 표기</summary>
        <div class="grid g4">${field('석차등급', input('meta.rank5'))}${field('가운뎃 점', input('meta.midpoint'))}</div>
      </details>`)
    + section('', toggle('showProcedure', '문서 맨 위에 ‘수립 및 시행 절차’ 안내 상자 넣기'), { cls: 'list' });
}

/* ---------- 2. 성취기준 ---------- */
function stdBlock(s, ai, si) {
  const key = `${ai}:${si}`;
  const editing = ui.editing.has(key);
  const levels = LEVELS.filter(L => editing || String((s.levels || {})[L] || '').trim());
  const shown = levels.length ? levels : ['A'];
  return shown.map((L, li) => `
    <tr class="${li === 0 ? 'first' : ''}">
      ${li === 0 ? `<td rowspan="${shown.length}" class="std-cell">
        ${editing
          ? `${input(`areas.${ai}.standards.${si}.code`, { ph: '코드', cls: 'mono' })}${area(`areas.${ai}.standards.${si}.text`, { rows: 3, ph: '성취기준 문장' })}`
          : `<div class="code">${esc(s.code)}</div><div class="std-text">${esc(s.text)}</div>`}
        <div class="row-tools">${editing
          ? b('editStd', '완료', { key }, 'btn-plain')
          : `${ib('editStd', 'pencil', '수정', { key })}${ib('delStd', 'trash', '삭제', { ai, si }, 'danger')}`}</div>
      </td>` : ''}
      <td class="lv">${L}</td>
      <td class="lv-text">${editing ? area(`areas.${ai}.standards.${si}.levels.${L}`, { rows: 2 }) : esc((s.levels || {})[L] || '')}</td>
    </tr>`).join('');
}
function stepStandards() {
  const n = allStandards().length;
  const tools = `<label class="btn btn-secondary">JSON 파일에서 불러오기<input type="file" id="stdFile" accept=".json,.js" hidden></label>${b('addArea', `${icon('plus')}영역 추가`)}`;
  if (!state.areas.length) {
    return section('', empty('아직 불러온 성취기준이 없습니다.', b('goStep', '기본 정보에서 과목 고르기', { step: 0 }, 'btn-primary')), { actions: tools });
  }
  if (ui.areaTab !== 'all' && !state.areas[+ui.areaTab]) ui.areaTab = 'all';
  const tabs = `<div class="tabs" role="tablist">
      <button type="button" class="${ui.areaTab === 'all' ? 'on' : ''}" data-act="areaTab" data-tab="all">전체 <span>${n}</span></button>
      ${state.areas.map((a, ai) => `<button type="button" class="${String(ai) === String(ui.areaTab) ? 'on' : ''}" data-act="areaTab" data-tab="${ai}">${esc(a.name || `영역 ${ai + 1}`)} <span>${a.standards.length}</span></button>`).join('')}
    </div>`;
  const areas = state.areas.map((a, ai) => {
    if (ui.areaTab !== 'all' && String(ai) !== String(ui.areaTab)) return '';
    const editArea = ui.editing.has(`area:${ai}`);
    return `
      <div class="std-area">
        <div class="std-area-head">
          <span class="num">(${ai + 1})</span>
          ${editArea ? input(`areas.${ai}.name`, { ph: '영역명', cls: 'area-input' }) + b('editStd', '완료', { key: `area:${ai}` }, 'btn-plain')
            : `<h4>${esc(a.name || '영역명 없음')}</h4>${ib('editStd', 'pencil', '영역명 수정', { key: `area:${ai}` })}${ib('delArea', 'trash', '영역 삭제', { ai }, 'danger')}`}
        </div>
        <table class="sheet std-sheet">
          <colgroup><col style="width:32%"><col style="width:44px"><col></colgroup>
          <thead><tr><th>성취기준</th><th colspan="2">성취기준별 성취수준</th></tr></thead>
          <tbody>${a.standards.map((s, si) => stdBlock(s, ai, si)).join('')}</tbody>
        </table>
        ${b('addStd', `${icon('plus')}성취기준 추가`, { ai }, 'btn-plain')}
      </div>`;
  }).join('');
  return section('', tabs + areas, {
    sub: `${esc(state.standardsSource || '직접 입력')} · ${state.areas.length}개 영역 · 성취기준 ${n}개. 수정하려면 연필 버튼을 누르세요.`,
    actions: tools, cls: 'plain-head',
  });
}

/* ---------- 3. 평가 설계 (평가 개요표) ---------- */
/* 숫자 칸 + 단위(점·%)가 미리 붙어 있는 입력 */
function unitInput(path, unit, ph) {
  return `<div class="inline unit">${input(path, { type: 'number', cls: 'num', ph, min: 0 })}<span>${unit}</span></div>`;
}
/* 수행평가 평가방법: 칸에는 고른 방법만 보이고, [선택]을 누르면 창에서 고르거나 직접 추가 */
function perfMethodPicker(p, i) {
  const cur = splitMethods(p.method);
  return `<div class="method-tags">${cur.length ? cur.map(m => `<span class="tag">${esc(m)}</span>`).join('') : '<span class="muted">선택 안 함</span>'}</div>${b('pickMethod', '선택', { i }, 'btn-plain small')}`;
}
function stepDesign() {
  const E = state.exams, P = state.perfs, nE = E.length * 2, nP = P.length;
  const t = ratioTotal();
  const status = `<span class="status-text ${t === 100 ? 'ok' : 'warn'}" data-calc="ratioText"></span>`;
  const examCells = fn => E.map((e, i) => `<td colspan="2">${fn(e, i)}</td>`).join('');
  const subCells = fn => E.map((e, i) => e.subs.map((s, j) => `<td>${fn(s, i, j)}</td>`).join('')).join('');
  const perfCells = fn => P.map((p, i) => `<td>${fn(p, i)}</td>`).join('');
  const colTools = (kind, i) => kind === 'exam'
    ? `<div class="col-tools">${ib('delExam', 'x', '이 정기시험 삭제', { i }, 'danger')}</div>`
    : `<div class="col-tools">${ib('perfLeft', 'left', '왼쪽으로', { i })}${ib('perfRight', 'right', '오른쪽으로', { i })}${ib('delPerf', 'x', '이 수행평가 삭제', { i }, 'danger')}</div>`;
  const table = `
    <div class="sheet-scroll"><table class="sheet overview-sheet" style="min-width:${96 + (nE + nP) * 92}px">
      <colgroup><col style="width:96px">${'<col>'.repeat(nE + nP)}</colgroup>
      <tbody>
        <tr><th>과목명</th><td colspan="${nE + nP}" class="center strong">${esc(state.meta.subject || '(기본 정보에서 과목명 입력)')}</td></tr>
        <tr><th>평가종류</th>${nE ? `<th colspan="${nE}" class="kind">정기시험</th>` : ''}${nP ? `<th colspan="${nP}" class="kind">수행평가</th>` : ''}</tr>
        <tr><th>반영비율</th>${nE ? `<td colspan="${nE}" class="center strong"><span data-calc="examTotal"></span>%</td>` : ''}${nP ? `<td colspan="${nP}" class="center strong"><span data-calc="perfTotal"></span>%</td>` : ''}</tr>
        <tr class="names"><th>횟수/영역</th>
          ${examCells((e, i) => `${colTools('exam', i)}<div class="inline">${input(`exams.${i}.name`, { ph: '1차시험' })}<span>(</span>${input(`exams.${i}.ratio`, { type: 'number', cls: 'num', ph: '30' })}<span>%)</span></div>`)}
          ${perfCells((p, i) => `${colTools('perf', i)}${area(`perfs.${i}.name`, { rows: 2, ph: '수행평가 영역명' })}`)}</tr>
        <tr><th>평가방법</th>${subCells((s, i, j) => area(`exams.${i}.subs.${j}.method`, { rows: 1 }))}${perfCells((p, i) => perfMethodPicker(p, i))}</tr>
        <tr><th>영역만점</th>${subCells((s, i, j) => unitInput(`exams.${i}.subs.${j}.max`, '점', '50'))}${perfCells((p, i) => unitInput(`perfs.${i}.max`, '점', '15'))}</tr>
        <tr><th>학기말 반영비율</th>${subCells((s, i, j) => unitInput(`exams.${i}.subs.${j}.ratio`, '%', '15'))}${perfCells((p, i) => unitInput(`perfs.${i}.ratio`, '%', '15'))}</tr>
        <tr><th>교육과정 성취기준</th>
          ${examCells((e, i) => `<div class="codes">${codeList(e.standards)}</div>${b('pickStd', '선택', { target: `exams.${i}.standards`, mode: 'code' }, 'btn-plain small')}`)}
          ${perfCells((p, i) => `<div class="codes">${codeList(p.standards)}</div>${b('pickStd', '선택', { target: `perfs.${i}.standards`, mode: 'code' }, 'btn-plain small')}`)}</tr>
        <tr><th>기본점수</th>${examCells((e, i) => unitInput(`exams.${i}.base`, '점', '0'))}${perfCells((p, i) => unitInput(`perfs.${i}.base`, '점', '5'))}</tr>
        <tr><th>평가시기</th>${examCells((e, i) => input(`exams.${i}.when`, { ph: '학교 일정에 맞춰 실시' }))}${perfCells((p, i) => input(`perfs.${i}.when`, { ph: '9월' }))}</tr>
      </tbody>
    </table></div>`;
  const tie = `
    ${toggle('showTie', '문서에 동점자 처리 기준 순위 표 넣기')}
    ${state.showTie ? `<table class="sheet tie-sheet">
      <thead><tr><th>방안명</th><th>Ⅰ. 방안 순위</th><th>Ⅱ. 방안 내 순위</th></tr></thead>
      <tbody>
        <tr><td>정기시험/수행평가순</td><td rowspan="3" class="center">${input('tie.rank1', { cls: 'num' })}</td><td></td></tr>
        <tr><td class="indent">정기시험</td><td class="center">${input('tie.examRank', { cls: 'num' })}</td></tr>
        <tr><td class="indent">수행평가</td><td class="center">${input('tie.perfRank', { cls: 'num' })}</td></tr>
        <tr><td>정기시험/수행평가영역순</td><td rowspan="${E.length + P.length + 1}" class="center">${input('tie.rank2', { cls: 'num' })}</td><td></td></tr>
        ${E.map((e, i) => `<tr><td class="indent"><span data-calc="tieExam:${i}"></span></td><td class="center">${input(`exams.${i}.tieRank`, { cls: 'num' })}</td></tr>`).join('')}
        ${P.map((p, i) => `<tr><td class="indent"><span data-calc="tiePerf:${i}"></span></td><td class="center">${input(`perfs.${i}.tieRank`, { cls: 'num' })}</td></tr>`).join('')}
      </tbody></table>` : ''}`;
  return section('평가 개요표', table, {
    actions: `${status}${b('addExam', `${icon('plus')}정기시험`)}${b('addPerf', `${icon('plus')}수행평가`)}`,
    sub: '양식의 평가 개요표와 같은 표입니다. 칸을 눌러 바로 입력하세요. 수행평가마다 다음 단계에서 채점기준표를 만듭니다.',
  })
    + section('동점자 처리 기준 순위', tie, { sub: '석차등급을 산출하지 않는 과목은 넣지 않아도 됩니다.' })
    + `<datalist id="methodList">${METHOD_SUGGEST.map(m => `<option value="${m}">`).join('')}</datalist>`;
}

/* ---------- 4. 수행평가 채점기준 ---------- */
function stepRubric() {
  if (!state.perfs.length) return section('', empty('평가 설계에서 수행평가 영역을 먼저 추가하세요.', b('goStep', '평가 설계로', { step: 2 }, 'btn-primary')));
  ui.perf = Math.min(ui.perf, state.perfs.length - 1);
  const i = ui.perf, p = state.perfs[i], base = `perfs.${i}.rubric`, r = p.rubric;
  const tabs = `<div class="tabs" role="tablist">${state.perfs.map((q, k) => `<button type="button" class="${k === i ? 'on' : ''}" data-act="perfTab" data-i="${k}">${esc(q.name || `수행평가 ${k + 1}`)}${rubricOk(q) ? icon('check', 'tab-check') : ''}</button>`).join('')}</div>`;
  const info = `
    <table class="sheet form-sheet">
      <colgroup><col style="width:130px"><col style="width:44px"><col></colgroup>
      <tbody>
        <tr><th>수행 과제</th><td colspan="2">${area(`${base}.task`, { ph: '학생이 수행할 과제', rows: 2 })}</td></tr>
        <tr><th>교육과정<br>성취기준</th><td colspan="2">${area(`${base}.standards`, { rows: 2 })}${b('fillRubricStd', '평가 설계에서 고른 성취기준 넣기', { i }, 'btn-plain small')}</td></tr>
        ${LEVELS.map((L, li) => `<tr>${li === 0 ? `<th rowspan="5">평가기준${b('fillRubricLevels', '성취수준에서 가져오기', { i }, 'btn-plain small block')}</th>` : ''}<td class="lv">${L}</td><td>${area(`${base}.levels.${L}`, { rows: 1 })}</td></tr>`).join('')}
        <tr><th>평가방법</th><td colspan="2">${checkChips(`${base}.methods`, [...EVAL_METHODS, ...r.methods.filter(m => !EVAL_METHODS.includes(m))])}<p class="help">평가 설계에서 고른 평가방법이 자동으로 체크됩니다.</p></td></tr>
        <tr><th>관찰·평가</th><td colspan="2">${checkChips(`${base}.observe`, OBSERVE_METHODS)}</td></tr>
        <tr><th>학생 유의사항</th><td colspan="2">${area(`${base}.notes`, { rows: 2 })}</td></tr>
      </tbody>
    </table>`;
  const rows = r.elements.map((el, j) => el.criteria.map((c, k) => `
      <tr class="${k === 0 ? 'first' : ''}">
        ${k === 0 ? `<td rowspan="${el.criteria.length + 1}" class="el-cell">
          ${area(`${base}.elements.${j}.name`, { rows: 2, ph: '평가 요소' })}
          <div class="el-foot"><span class="muted" data-calc="elMaxLabel:${i}:${j}"></span>${ib('delEl', 'trash', '평가 요소 삭제', { i, j }, 'danger')}</div>
        </td>` : ''}
        <td>${area(`${base}.elements.${j}.criteria.${k}.text`, { rows: 1, ph: '수행수준(채점기준)' })}</td>
        <td class="score-cell"><div class="inline">${input(`${base}.elements.${j}.criteria.${k}.score`, { type: 'number', cls: 'num' })}<span>점</span></div></td>
        <td class="tool-cell">${ib('delCrit', 'x', '이 수준 삭제', { i, j, k })}</td>
      </tr>`).join('') + `<tr class="add-row"><td colspan="3">${b('addCrit', `${icon('plus')}수준 추가`, { i, j }, 'btn-plain small')}</td></tr>`).join('');
  const elements = `
    <table class="sheet crit-sheet">
      <colgroup><col style="width:24%"><col><col style="width:96px"><col style="width:40px"></colgroup>
      <thead><tr><th>평가 요소</th><th>수행수준(채점기준)</th><th>배점</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sheet-foot">${b('addEl', `${icon('plus')}평가 요소 추가`, { i }, 'btn-plain')}<span class="status-text" data-calc="rubCheck:${i}"></span></div>`;
  return tabs
    + section(esc(p.name || `수행평가 ${i + 1}`), info, { sub: `영역만점 ${isNaN(num(p.max)) ? '—' : num(p.max) + '점'} · 반영비율 ${isNaN(num(p.ratio)) ? '—' : num(p.ratio) + '%'}` })
    + section('평가 요소와 채점기준', elements, { sub: '평가 요소마다 가장 높은 배점의 합이 영역만점과 같아야 합니다.' });
}

/* ---------- 5. 주차별 수업 계획 ---------- */
function stepPlan() {
  const weeks = state.plan.map((r, i) => `
    <div class="week">
      <div class="week-head">
        <input class="input week-when" data-bind="plan.${i}.when" value="${esc(r.when)}" placeholder="시기">
        <label class="week-hours">시수 ${input(`plan.${i}.hours`, { type: 'number', cls: 'num', min: 0 })}</label>
        <span class="week-cum">누계 <b data-calc="cum:${i}"></b></span>
        <div class="week-tools">${ib('planUp', 'up', '위로', { i })}${ib('planDown', 'down', '아래로', { i })}${ib('planInsert', 'plus', '아래에 주 추가', { i })}${ib('planDel', 'trash', '삭제', { i }, 'danger')}</div>
      </div>
      <div class="week-body">
        <label class="wf"><span>단원명</span>${area(`plan.${i}.unit`, { rows: 1 })}</label>
        <label class="wf"><span>교육과정 성취기준 ${b('pickStd', '선택', { target: `plan.${i}.std`, mode: 'plan' }, 'btn-plain small')}</span>${area(`plan.${i}.std`, { rows: 1 })}</label>
        <label class="wf"><span>평가 요소</span>${area(`plan.${i}.elements`, { rows: 1 })}</label>
        <label class="wf"><span>수업·평가 방법, 수업-평가 연계의 주안점</span>${area(`plan.${i}.method`, { rows: 1 })}</label>
        <label class="wf wide"><span>비고</span>${input(`plan.${i}.note`)}</label>
      </div>
    </div>`).join('');
  return section('', `
      <div class="toolbar">
        ${b('fillHours', '시수 한꺼번에 채우기')}${b('planWeeks', `${state.meta.semester === '1' ? '1' : '2'}학기 주차로 다시 채우기`)}${b('planAdd', `${icon('plus')}주 추가`)}
        <span class="muted">총 <b data-calc="hoursTotal"></b>시간</span>
      </div>
      <div class="weeks">${weeks}</div>`,
    { sub: '성취기준의 [선택]을 누르면 성취기준마다 평가 유형(정기시험·수행평가)을 여러 개 고를 수 있습니다.', cls: 'plain-head' });
}

/* ---------- 6. 평가 운영 규정 ---------- */
const RESET_LABEL = { purpose: '평가 목적', direction: '평가 방향', policyGeneral: '일반사항', policyPerf: '수행평가 운영',
  policyPerf2: '수행평가 운영(안내 상자 아래)', policyResult: '평가 결과 안내', cautions: '평가 유의사항', absentee: '미응시자 처리', appeal: '이의신청', usage: '평가 결과의 활용' };
function stepRules() {
  const item = (no, title, body, { open = false, reset } = {}) => `
    <details class="row-disclosure"${open ? ' open' : ''}><summary><span class="no">${no}</span><span class="t">${title}</span>${icon('chevron', 'chev')}</summary>
      <div class="rd-body">${body}${reset ? `<div class="rd-foot">${reset.map(k => b('resetText', `‘${RESET_LABEL[k]}’ 기본 문구로 되돌리기`, { key: k }, 'btn-plain small')).join('')}</div>` : ''}</div></details>`;
  return section('', `
    ${item('1', '평가 목적', note('2022 개정 교육과정의 과목 각론을 참고해 ‘가. 제목’ 줄과 ‘- 설명’ 줄로 적습니다.') + area('text.purpose', { rows: 6 }), { open: true, reset: ['purpose'] })}
    ${item('2', '평가 방향', area('text.direction', { rows: 6 }), { reset: ['direction'] })}
    ${item('3', '평가 방침', `
      ${field('가. 일반사항', area('text.policyGeneral', { rows: 8 }))}
      ${field('나. 수행평가 운영', area('text.policyPerf', { rows: 5 }))}
      ${toggle('showTaskBox', '‘과제형·암기식 수행평가’ 안내 상자 넣기')}
      ${field('나. 수행평가 운영 (안내 상자 아래)', area('text.policyPerf2', { rows: 3 }))}
      ${field('다. 평가 결과 안내', area('text.policyResult', { rows: 2 }))}`, { reset: ['policyGeneral', 'policyPerf', 'policyPerf2', 'policyResult'] })}
    ${item('4', '평가 유의사항', area('text.cautions', { rows: 3 }), { reset: ['cautions'] })}
    ${item('5', '수강생(타학년 또는 타학과) 통합 산출 여부', input('text.integration', { ph: '해당없음' }))}
    ${item('9', '평가 미응시자(결시자) 및 학적 변동자 처리', `
      ${note('‘미응시 시 1회 응시 기회 부여 여부 및 점수 부여 방법’을 교과협의회에서 정해 적습니다. 예시를 누르면 ‘2) 수행평가’ 다음 줄에 들어갑니다.')}
      <div class="chips">${ABSENTEE_EXAMPLES.map((ex, k) => b('absEx', ['기회 미부여 · 기본점수', '기회 미부여 · 최하점의 차하점', '1회 기회 부여'][k], { i: k }, 'chip-btn')).join('')}</div>
      ${area('text.absentee', { rows: 10 })}`, { reset: ['absentee'] })}
    ${item('10', '이의신청 기간 및 절차', area('text.appeal', { rows: 2 }), { reset: ['appeal'] })}
    ${item('11', '평가 결과의 활용', area('text.usage', { rows: 5 }), { reset: ['usage'] })}
  `, { cls: 'list' });
}

/* ---------- 7. 학기 성취수준 ---------- */
function stepLevels() {
  const rt = RATE_TABLES[TYPE_RATE[state.subjectType] || 'common'];
  const rateOf = L => (rt.rows.find(r => r[1] === L) || [])[0] || '';
  const isCommon = state.subjectType === '공통과목';
  const levels = rt.rows.length > 3 ? LEVELS : ['A', 'B', 'C'];     // 과학탐구실험·체육·예술은 A~C
  return section('학기 단위 성취수준', `
      <table class="sheet form-sheet">
        <colgroup><col style="width:120px"><col></colgroup>
        <thead><tr><th>성취수준</th><th>학기 단위 성취수준 진술</th></tr></thead>
        <tbody>${levels.map(L => `<tr><th class="lv-head">${L}<small>${esc(rateOf(L))}</small></th><td>${area(`semesterLevels.${L}`, { rows: 3 })}</td></tr>`).join('')}</tbody>
      </table>`,
    { actions: b('draftSemester', '성취기준별 성취수준으로 초안 만들기', {}, 'btn-secondary'),
      sub: isCommon ? '공통과목은 E를 성취율 40%이상~60%미만으로 진술합니다.' : '선택과목은 E(C)의 성취율이 ‘60% 미만’임을 고려해 진술합니다.' })
    + (isCommon
      ? section('최소 성취수준', area('minLevel', { rows: 4, ph: '학기단위 최소 성취수준(성취율 40%의 성취수준 진술)' }), { sub: '공통과목만 작성합니다.' })
      : '')
    + section('성취도 기준표', `
      <div class="chips">${Object.entries(RATE_TABLES).map(([k]) => `<label class="chip"><input type="checkbox" data-bind="rateTables.${k}"${state.rateTables[k] ? ' checked' : ''}><span>${esc({ common: '공통과목', sciLab: '과학탐구 실험', elective: '선택과목', artsPe: '체육·예술' }[k])}</span></label>`).join('')}</div>`,
      { sub: `과목 유형(${esc(state.subjectType)})에 맞는 표가 선택되어 있습니다. 필요하면 더 고르세요.` });
}

/* ---------- 8. 확인 및 내려받기 ---------- */
function stepFinish() {
  const checks = [
    [0, '과목명과 학교명', STEPS[0].done()],
    [1, '성취기준', allStandards().length > 0],
    [2, '반영비율 합계 100%', ratioTotal() === 100, `현재 ${fmt(ratioTotal())}%`],
    [3, '채점기준 배점 합계와 영역만점', state.perfs.length > 0 && state.perfs.every(rubricOk),
      state.perfs.filter(p => !rubricOk(p)).map(p => p.name || '이름 없음').join(', ')],
    [4, '주차별 수업 계획', STEPS[4].done()],
    [5, '평가 목적', STEPS[5].done()],
    [6, '학기 단위 성취수준', STEPS[6].done()],
  ];
  if (state.subjectType === '공통과목') checks.push([6, '최소 성취수준', !!String(state.minLevel).trim()]);
  const left = checks.filter(c => !c[2]).length;
  return section('', `
      <div class="finish">
        <div>
          <h3>${left ? `확인이 필요한 항목 ${left}개` : '모든 항목을 채웠습니다'}</h3>
          <p class="muted">${left ? '그대로 내려받아도 됩니다. 필요하면 해당 단계에서 고치세요.' : '한글 파일로 내려받아 마무리하세요.'}</p>
        </div>
        <div class="finish-actions">
          ${b('exportHwpx', `${icon('download')}한글 파일 내려받기`, {}, 'btn-primary large')}
          ${b('print', '인쇄 또는 PDF', {}, 'btn-secondary large')}
        </div>
      </div>`)
    + section('', `<ul class="checklist">${checks.map(([s, label, ok, detail]) => `
        <li class="${ok ? 'ok' : 'todo'}">${icon(ok ? 'check' : 'alert', 'mark')}<span class="t">${label}${!ok && detail ? `<small>${esc(detail)}</small>` : ''}</span>
          ${ok ? '' : b('goStep', '고치기', { step: s }, 'btn-plain small')}</li>`).join('')}</ul>`, { cls: 'list' })
    + `<div class="preview-label"><h3>미리보기</h3><span class="muted">내려받을 문서의 모양입니다.</span></div>`;
}
