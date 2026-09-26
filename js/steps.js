/* 단계별 작성 화면
 * 양식의 순서가 아니라 작성하기 편한 순서로 나누고, 마지막 단계에서 양식 모양으로 미리보기·내려받기 합니다. */
'use strict';

const SUBJECT_TYPES = ['공통과목', '선택과목', '과학탐구실험', '체육·예술'];
const TYPE_RATE = { '공통과목': 'common', '선택과목': 'elective', '과학탐구실험': 'sciLab', '체육·예술': 'artsPe' };
const METHOD_SUGGEST = ['프로젝트', '토의·토론', '서술', '논술', '구술·발표', '실험·실습', '포트폴리오', '실기', '보고서'];
let currentPerf = 0;

/* ---------- 작은 부품 ---------- */
const attr = (k, v) => (v === undefined || v === null || v === false ? '' : ` ${k}="${esc(v === true ? k : v)}"`);
function input(path, { ph = '', type = 'text', list, rerender, cls = '', min } = {}) {
  return `<input class="inp ${cls}" type="${type}" data-bind="${path}" value="${esc(getPath(path) ?? '')}"${attr('placeholder', ph)}${attr('list', list)}${attr('min', min)}${rerender ? ' data-rerender="1"' : ''}>`;
}
function area(path, { ph = '', rows = 2, cls = '' } = {}) {
  return `<textarea class="inp ${cls}" rows="${rows}" data-bind="${path}"${attr('placeholder', ph)}>${esc(getPath(path) ?? '')}</textarea>`;
}
function field(label, control, { hint: h, span = 1 } = {}) {
  return `<label class="field span-${span}"><span class="field-label">${label}</span>${control}${h ? `<span class="field-hint">${h}</span>` : ''}</label>`;
}
function seg(path, options, { rerender = true, labels } = {}) {
  const cur = String(getPath(path) ?? '');
  return `<div class="seg" role="radiogroup">${options.map((o, i) => `<label><input type="radio" name="${path}" data-bind="${path}" value="${esc(o)}"${cur === String(o) ? ' checked' : ''}${rerender ? ' data-rerender="1"' : ''}><span>${esc(labels ? labels[i] : o)}</span></label>`).join('')}</div>`;
}
function checkChips(path, options) {
  const arr = getPath(path) || [];
  return `<div class="chips">${options.map(o => `<label class="chip"><input type="checkbox" data-arr="${path}" value="${esc(o)}"${arr.includes(o) ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>`;
}
function card(title, body, { sub = '', actions = '', cls = '' } = {}) {
  return `<section class="card ${cls}"><header class="card-head"><div><h3>${title}</h3>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div>${actions ? `<div class="card-actions">${actions}</div>` : ''}</header><div class="card-body">${body}</div></section>`;
}
function b(act, label, data = {}, cls = 'secondary') {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button type="button" class="btn ${cls}" data-act="${act}" ${attrs}>${label}</button>`;
}
function tip(text) { return `<div class="tip">${text}</div>`; }
function empty(text, action = '') { return `<div class="empty-state"><p>${text}</p>${action}</div>`; }

/* 성취기준 고르기 칩 — target 칸의 [코드] 목록을 켜고 끔 */
function stdChips(target) {
  if (!state.areas.length) return `<p class="muted">2단계에서 성취기준을 불러오면 여기서 고를 수 있습니다.</p>`;
  const on = extractCodes(getPath(target));
  return `<div class="std-chips">${state.areas.map(a => `
    <div class="std-chip-group"><span class="std-chip-area">${esc(a.name)}</span>
      ${a.standards.map(s => `<button type="button" class="chip std${on.includes(s.code) ? ' on' : ''}" data-act="toggleStd" data-target="${target}" data-code="${esc(s.code)}" title="${esc(s.text)}">${esc(s.code)}</button>`).join('')}
    </div>`).join('')}</div>`;
}

/* ---------- 단계 정의 ---------- */
const STEPS = [
  { id: 'basic', title: '기본 정보', render: stepBasic, done: () => !!state.meta.subject.trim() && !!state.meta.school.trim() },
  { id: 'standards', title: '성취기준', render: stepStandards, done: () => allStandards().length > 0 },
  { id: 'design', title: '평가 설계', render: stepDesign, done: () => ratioTotal() === 100 },
  { id: 'rubric', title: '수행평가 채점기준', render: stepRubric, done: () => state.perfs.length > 0 && state.perfs.every(rubricOk) },
  { id: 'plan', title: '주차별 수업 계획', render: stepPlan, done: () => state.plan.some(r => String(r.hours).trim() && (r.unit || r.std).trim()) },
  { id: 'rules', title: '평가 운영 규정', render: stepRules, done: () => /[가-힣]{4,}/.test(state.text.purpose) },
  { id: 'levels', title: '학기 성취수준', render: stepLevels, done: () => LEVELS.every(L => String(state.semesterLevels[L]).trim()) },
  { id: 'finish', title: '확인·내려받기', render: stepFinish, done: () => false },
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
function stepBasic() {
  const idx = window.STANDARDS_INDEX || [];
  const n = allStandards().length;
  const loaded = state.standardsSource
    ? `<div class="loaded ok">✔ <b>${esc(state.standardsSource)}</b> 성취기준 ${n}개를 불러왔습니다. ${b('goStep', '확인하기 →', { step: 1 }, 'link')}</div>`
    : `<div class="loaded">아직 성취기준을 불러오지 않았습니다.</div>`;
  return card('과목', `
      <div class="subject-pick">
        <input class="inp big" id="subjectSearch" list="subjectList" placeholder="과목명을 입력하세요 (예: 공통국어1, 화학, 스포츠 개론)" autocomplete="off">
        <datalist id="subjectList">${idx.map(s => `<option value="${esc(s.subject)}">${esc(s.group || '')}</option>`).join('')}</datalist>
        ${b('pickSubject', '이 과목으로 시작', {}, 'primary')}
      </div>
      ${loaded}
      <div class="grid cols-4">
        ${field('문서에 쓸 과목명', input('meta.subject', { ph: '과목명' }), { span: 2, hint: '제목과 평가 개요표에 들어갑니다' })}
        ${field('학년도', input('meta.year', { type: 'number', ph: '2026' }))}
        ${field('학기', seg('meta.semester', ['1', '2'], { labels: ['1학기', '2학기'] }))}
      </div>
      ${field('과목 유형', seg('subjectType', SUBJECT_TYPES), { hint: '성취도 기준표와 최소 성취수준 작성 여부가 자동으로 정해집니다' })}`,
    { sub: `${idx.length}개 과목의 성취기준이 준비되어 있습니다. 과목을 고르면 성취기준이 자동으로 채워집니다.` })
    + card('학교·학급', `
      <div class="grid cols-4">
        ${field('학교명', input('meta.school', { ph: 'OO고등학교' }))}
        ${field('학년', input('meta.grade', { ph: '1학년' }))}
        ${field('학급', input('meta.classes', { ph: '1~8반' }))}
        ${field('학점', input('meta.credit', { ph: '4' }))}
        ${field('지도교사', input('meta.teachers', { ph: '홍길동, 김철수' }), { span: 2, hint: '여러 명이면 쉼표로 구분' })}
        ${field('분할점수 산출 유형', seg('meta.cutType', ['고정', '추정'], { rerender: false }), { span: 2 })}
      </div>
      <details class="more"><summary>5명 이하 과목인 경우 (석차등급란 표기)</summary>
        <div class="grid cols-4">
          ${field('석차등급', input('meta.rank5'))}
          ${field('가운뎃 점', input('meta.midpoint'))}
        </div>
      </details>
      <label class="switch"><input type="checkbox" data-bind="showProcedure"${state.showProcedure ? ' checked' : ''}> 문서 맨 위에 ‘수립 및 시행 절차’ 안내 상자 넣기</label>`);
}

/* ---------- 2. 성취기준 ---------- */
function stepStandards() {
  const n = allStandards().length;
  const tools = `${b('goStep', '과목 바꾸기', { step: 0 })}
    <label class="btn secondary file">JSON 파일에서 불러오기<input type="file" id="stdFile" accept=".json,.js" hidden></label>
    ${b('addArea', '+ 영역 추가')}`;
  if (!state.areas.length) {
    return card('성취기준', empty('아직 불러온 성취기준이 없습니다.', b('goStep', '1단계에서 과목 고르기', { step: 0 }, 'primary')), { actions: tools });
  }
  const areas = state.areas.map((a, ai) => `
    <div class="area-block">
      <div class="area-head">
        <span class="area-no">(${ai + 1})</span>
        ${input(`areas.${ai}.name`, { ph: '영역명', cls: 'area-name' })}
        ${b('addStd', '+ 성취기준', { ai })}${b('delArea', '영역 삭제', { ai }, 'ghost danger')}
      </div>
      ${a.standards.map((s, si) => `
        <div class="std-item">
          <div class="std-main">
            ${input(`areas.${ai}.standards.${si}.code`, { ph: '코드', cls: 'code' })}
            ${area(`areas.${ai}.standards.${si}.text`, { ph: '성취기준 문장', rows: 1 })}
            ${b('delStd', '×', { ai, si }, 'icon danger')}
          </div>
          <details class="levels"><summary>성취수준 ${Object.keys(s.levels || {}).filter(L => s.levels[L]).join('·') || '(비어 있음)'}</summary>
            ${LEVELS.map(L => `<div class="level-row"><span class="lv-badge">${L}</span>${area(`areas.${ai}.standards.${si}.levels.${L}`, { rows: 2 })}</div>`).join('')}
          </details>
        </div>`).join('')}
    </div>`).join('');
  return card('성취기준', areas, {
    sub: `${state.areas.length}개 영역 · ${n}개 성취기준. 문서의 Ⅱ(성취기준별 성취수준)에 그대로 들어갑니다. 필요 없는 성취기준은 × 로 지우세요.`,
    actions: tools,
  });
}

/* ---------- 3. 평가 설계 ---------- */
function stepDesign() {
  const meter = `<div class="meter-wrap"><div class="meter" data-calc-html="ratioMeter"></div><div class="meter-text" data-calc="ratioText"></div></div>`;
  const exams = state.exams.map((e, i) => `
    <div class="item-card">
      <div class="item-head"><b>정기시험 ${i + 1}</b>${b('delExam', '삭제', { i }, 'ghost danger')}</div>
      <div class="grid cols-4">
        ${field('이름', input(`exams.${i}.name`, { ph: '1차시험' }))}
        ${field('반영비율(%)', input(`exams.${i}.ratio`, { type: 'number', ph: '30', min: 0 }))}
        ${field('평가 시기', input(`exams.${i}.when`, { ph: '학교 일정에 맞춰 실시' }))}
        ${field('기본점수', input(`exams.${i}.base`, { ph: '0점' }))}
      </div>
      <table class="mini">
        <tr><th>문항 유형</th><th>영역만점</th><th>학기말 반영비율</th></tr>
        ${e.subs.map((s, j) => `<tr><td>${input(`exams.${i}.subs.${j}.method`)}</td><td>${input(`exams.${i}.subs.${j}.max`, { ph: '50점' })}</td><td>${input(`exams.${i}.subs.${j}.ratio`, { ph: '15%' })}</td></tr>`).join('')}
      </table>
      <div class="field-label">평가할 성취기준</div>${stdChips(`exams.${i}.standards`)}
    </div>`).join('');
  const perfs = state.perfs.map((p, i) => `
    <div class="item-card perf">
      <div class="item-head"><b>수행평가 ${i + 1}</b>
        <span>${b('perfLeft', '↑', { i }, 'icon')}${b('perfRight', '↓', { i }, 'icon')}${b('delPerf', '삭제', { i }, 'ghost danger')}</span></div>
      <div class="grid cols-4">
        ${field('영역명', input(`perfs.${i}.name`, { ph: '예: 진로 독서를 바탕으로 매체자료 제작하기' }), { span: 2 })}
        ${field('평가 방법', input(`perfs.${i}.method`, { ph: '프로젝트', list: 'methodList' }))}
        ${field('시기', input(`perfs.${i}.when`, { ph: '9월' }))}
        ${field('영역만점(점)', input(`perfs.${i}.max`, { type: 'number', ph: '15', min: 0 }))}
        ${field('반영비율(%)', input(`perfs.${i}.ratio`, { type: 'number', ph: '15', min: 0 }))}
        ${field('기본점수', input(`perfs.${i}.base`, { ph: '영역만점의 10%이상~40%미만' }), { span: 2 })}
      </div>
      <div class="field-label">평가할 성취기준</div>${stdChips(`perfs.${i}.standards`)}
    </div>`).join('');
  const tie = `
    <details class="more"${state.showTie ? '' : ''}><summary>동점자 처리 기준 순위 (선택)</summary>
      <label class="switch"><input type="checkbox" data-bind="showTie"${state.showTie ? ' checked' : ''}> 문서에 동점자 처리 표 넣기</label>
      <table class="mini">
        <tr><th>방안</th><th>순위</th></tr>
        <tr><td>Ⅰ. 정기시험/수행평가순</td><td>${input('tie.rank1', { cls: 'tiny' })}</td></tr>
        <tr><td class="indent">정기시험</td><td>${input('tie.examRank', { cls: 'tiny' })}</td></tr>
        <tr><td class="indent">수행평가</td><td>${input('tie.perfRank', { cls: 'tiny' })}</td></tr>
        <tr><td>Ⅱ. 정기시험/수행평가영역순</td><td>${input('tie.rank2', { cls: 'tiny' })}</td></tr>
        ${state.exams.map((e, i) => `<tr><td class="indent"><span data-calc="tieExam:${i}"></span></td><td>${input(`exams.${i}.tieRank`, { cls: 'tiny' })}</td></tr>`).join('')}
        ${state.perfs.map((p, i) => `<tr><td class="indent"><span data-calc="tiePerf:${i}"></span></td><td>${input(`perfs.${i}.tieRank`, { cls: 'tiny' })}</td></tr>`).join('')}
      </table>
    </details>`;
  return card('반영비율', meter + tip('정기시험과 수행평가의 반영비율 합이 100%가 되어야 합니다. 아래에서 비율을 바꾸면 막대가 바로 바뀝니다.'))
    + card('정기시험', exams || empty('정기시험이 없습니다.'), { actions: b('addExam', '+ 정기시험 추가') })
    + card('수행평가', perfs || empty('수행평가 영역이 없습니다.'), { actions: b('addPerf', '+ 수행평가 추가'), sub: '영역마다 4단계에서 채점기준표를 만듭니다.' })
    + card('기타', tie)
    + `<datalist id="methodList">${METHOD_SUGGEST.map(m => `<option value="${m}">`).join('')}</datalist>`;
}

/* ---------- 4. 수행평가 채점기준 ---------- */
function stepRubric() {
  if (!state.perfs.length) return card('수행평가 채점기준', empty('3단계에서 수행평가 영역을 먼저 추가하세요.', b('goStep', '3단계로', { step: 2 }, 'primary')));
  currentPerf = Math.min(currentPerf, state.perfs.length - 1);
  const i = currentPerf, p = state.perfs[i], base = `perfs.${i}.rubric`, r = p.rubric;
  const tabs = `<div class="pills">${state.perfs.map((q, k) => `<button type="button" class="pill${k === i ? ' on' : ''}${rubricOk(q) ? ' ok' : ''}" data-act="perfTab" data-i="${k}">${esc(q.name || `수행평가 ${k + 1}`)}</button>`).join('')}</div>`;
  const elements = r.elements.map((el, j) => `
    <div class="item-card element">
      <div class="item-head">
        ${input(`${base}.elements.${j}.name`, { ph: '평가 요소 (예: 진로 분야 책 선정 및 읽기)', cls: 'grow' })}
        <span class="badge" data-calc="elMaxLabel:${i}:${j}"></span>
        ${b('delEl', '요소 삭제', { i, j }, 'ghost danger')}
      </div>
      ${el.criteria.map((c, k) => `
        <div class="crit-row">
          ${area(`${base}.elements.${j}.criteria.${k}.text`, { ph: '수행수준(채점기준)', rows: 1 })}
          <div class="score">${input(`${base}.elements.${j}.criteria.${k}.score`, { type: 'number', ph: '점', cls: 'tiny' })}<span>점</span></div>
          ${b('delCrit', '×', { i, j, k }, 'icon danger')}
        </div>`).join('')}
      ${b('addCrit', '+ 수준 추가', { i, j }, 'link')}
    </div>`).join('');
  return tabs
    + card(`${esc(p.name || `수행평가 ${i + 1}`)}`, `
        ${field('수행 과제', area(`${base}.task`, { ph: '학생이 수행할 과제를 적어 주세요', rows: 2 }))}
        <div class="field">
          <span class="field-label">교육과정 성취기준 ${b('fillRubricStd', '3단계에서 고른 성취기준 넣기', { i }, 'link')}</span>
          ${area(`${base}.standards`, { rows: 2 })}
        </div>
        <div class="field">
          <span class="field-label">평가기준 (A~E) ${b('fillRubricLevels', '성취수준에서 가져오기', { i }, 'link')}</span>
          ${LEVELS.map(L => `<div class="level-row"><span class="lv-badge">${L}</span>${area(`${base}.levels.${L}`, { rows: 1 })}</div>`).join('')}
        </div>
        <div class="grid cols-2">
          ${field('평가 방법', checkChips(`${base}.methods`, EVAL_METHODS))}
          ${field('관찰·평가 주체', checkChips(`${base}.observe`, OBSERVE_METHODS))}
        </div>
        ${field('학생 유의사항', area(`${base}.notes`, { rows: 2 }))}`,
      { sub: `영역만점 ${isNaN(num(p.max)) ? '(3단계에서 입력)' : num(p.max) + '점'} · 반영비율 ${isNaN(num(p.ratio)) ? '-' : num(p.ratio) + '%'}` })
    + card('평가 요소와 채점기준', elements + `<div class="check-line" data-calc="rubCheck:${i}"></div>`,
      { actions: b('addEl', '+ 평가 요소 추가', { i }), sub: '평가 요소마다 가장 높은 배점의 합이 영역만점과 같아야 합니다.' });
}

/* ---------- 5. 주차별 수업 계획 ---------- */
function stepPlan() {
  const weeks = state.plan.map((r, i) => `
    <div class="week${String(r.hours).trim() || r.unit || r.std ? ' filled' : ''}">
      <div class="week-top">
        <div class="week-when">${input(`plan.${i}.when`, { cls: 'when', ph: '시기' })}</div>
        <label class="mini-field"><span>시수</span>${input(`plan.${i}.hours`, { type: 'number', cls: 'tiny', min: 0 })}</label>
        <div class="mini-field cum"><span>누계</span><b data-calc="cum:${i}"></b></div>
        <div class="week-act">${b('planUp', '↑', { i }, 'icon')}${b('planDown', '↓', { i }, 'icon')}${b('planInsert', '+', { i }, 'icon')}${b('planDel', '×', { i }, 'icon danger')}</div>
      </div>
      <div class="week-grid">
        <label class="wf"><span>단원명</span>${area(`plan.${i}.unit`, { rows: 1 })}</label>
        <label class="wf wide"><span>교육과정 성취기준 ${b('pickStd', '고르기', { target: `plan.${i}.std`, mode: 'plan' }, 'link')}</span>${area(`plan.${i}.std`, { rows: 1 })}</label>
        <label class="wf"><span>평가 요소</span>${area(`plan.${i}.elements`, { rows: 1 })}</label>
        <label class="wf wide"><span>수업·평가 방법, 수업-평가 연계의 주안점</span>${area(`plan.${i}.method`, { rows: 1 })}</label>
        <label class="wf full"><span>비고</span>${input(`plan.${i}.note`)}</label>
      </div>
    </div>`).join('');
  return card('주차별 수업 계획', `
      <div class="toolbar-row sticky-tools">
        ${b('fillHours', '시수 한꺼번에 채우기')}${b('planWeeks', `${state.meta.semester === '1' ? '1' : '2'}학기 주차로 다시 채우기`)}${b('planAdd', '+ 주 추가')}
        <span class="muted">총 <b data-calc="hoursTotal"></b>시간</span>
      </div>
      <div class="weeks">${weeks}</div>`,
    { sub: '문서의 Ⅰ(교수학습-평가 계획)이 됩니다. 시수를 넣으면 누계가 자동으로 계산됩니다. 평가하는 주에는 성취기준을 고를 때 평가 유형(1차 정기시험·수행평가)을 함께 표시하세요.' });
}

/* ---------- 6. 평가 운영 규정 ---------- */
function stepRules() {
  const sec = (no, title, body, { open = false, reset } = {}) => `
    <details class="acc"${open ? ' open' : ''}><summary><span class="acc-no">${no}</span>${title}</summary>
      <div class="acc-body">${body}${reset ? `<div class="acc-foot">${reset.map(k => b('resetText', `‘${RESET_LABEL[k]}’ 기본 문구로 되돌리기`, { key: k }, 'link')).join('')}</div>` : ''}</div></details>`;
  return card('평가 운영 규정', `
    ${tip('양식의 기본 문구가 미리 들어 있습니다. 학교·교과 사정에 맞게 고치면 됩니다. 제목을 누르면 펼쳐집니다.')}
    ${sec('1', '평가 목적', tip('2022 개정 교육과정의 과목 각론을 참고해 ‘가. 제목’ 줄과 ‘- 설명’ 줄로 적어 주세요.') + area('text.purpose', { rows: 6 }), { open: true, reset: ['purpose'] })}
    ${sec('2', '평가 방향', area('text.direction', { rows: 6 }), { reset: ['direction'] })}
    ${sec('3', '평가 방침', `
      ${field('가. 일반사항', area('text.policyGeneral', { rows: 8 }))}
      ${field('나. 수행평가 운영', area('text.policyPerf', { rows: 5 }))}
      <label class="switch"><input type="checkbox" data-bind="showTaskBox"${state.showTaskBox ? ' checked' : ''}> ‘과제형·암기식 수행평가’ 안내 상자 넣기</label>
      ${field('나. 수행평가 운영 (안내 상자 아래)', area('text.policyPerf2', { rows: 3 }))}
      ${field('다. 평가 결과 안내', area('text.policyResult', { rows: 2 }))}`, { reset: ['policyGeneral', 'policyPerf', 'policyPerf2', 'policyResult'] })}
    ${sec('4', '평가 유의사항', area('text.cautions', { rows: 3 }), { reset: ['cautions'] })}
    ${sec('5', '수강생(타학년 또는 타학과) 통합 산출 여부', input('text.integration', { ph: '해당없음' }))}
    ${sec('9', '평가 미응시자(결시자) 및 학적 변동자 처리', `
      ${tip('‘미응시 시 1회 응시 기회 부여 여부 및 점수 부여 방법’을 교과협의회에서 정해 적습니다. 아래 예시를 누르면 ‘2) 수행평가’ 다음 줄에 들어갑니다.')}
      <div class="chips">${ABSENTEE_EXAMPLES.map((ex, i) => b('absEx', ['기회 미부여 · 기본점수', '기회 미부여 · 최하점의 차하점', '1회 기회 부여'][i], { i }, 'chip-btn')).join('')}</div>
      ${area('text.absentee', { rows: 10 })}`, { reset: ['absentee'] })}
    ${sec('10', '이의신청 기간 및 절차', area('text.appeal', { rows: 2 }), { reset: ['appeal'] })}
    ${sec('11', '평가 결과의 활용', area('text.usage', { rows: 5 }), { reset: ['usage'] })}
  `);
}
const RESET_LABEL = { purpose: '평가 목적', direction: '평가 방향', policyGeneral: '일반사항', policyPerf: '수행평가 운영',
  policyPerf2: '수행평가 운영(아래)', policyResult: '평가 결과 안내', cautions: '평가 유의사항', absentee: '미응시자 처리', appeal: '이의신청', usage: '평가 결과의 활용' };

/* ---------- 7. 학기 성취수준 ---------- */
function stepLevels() {
  const rt = RATE_TABLES[TYPE_RATE[state.subjectType] || 'common'];
  const rateOf = L => (rt.rows.find(r => r[1] === L) || [])[0] || '';
  const isCommon = state.subjectType === '공통과목';
  const levels = rt.rows.length > 3 ? LEVELS : ['A', 'B', 'C'];     // 과학탐구실험·체육·예술은 A~C
  return card('학기 단위 성취수준', `
      ${tip(isCommon ? '공통과목은 E를 성취율 40%이상~60%미만으로 진술합니다.' : '선택과목은 E(C)의 성취율이 ‘60% 미만’임을 고려해 진술합니다.')}
      ${levels.map(L => `<div class="level-row big"><span class="lv-badge">${L}<small>${esc(rateOf(L))}</small></span>${area(`semesterLevels.${L}`, { rows: 3 })}</div>`).join('')}`,
    { actions: b('draftSemester', '성취기준별 성취수준으로 초안 만들기', {}, 'primary'), sub: '영역별로 성취기준의 성취수준을 이어 붙인 초안을 만든 뒤 다듬으면 편합니다.' })
    + (isCommon
      ? card('최소 성취수준 (공통과목)', area('minLevel', { rows: 4, ph: '학기단위 최소 성취수준(성취율 40%의 성취수준 진술)' }))
      : card('최소 성취수준', `<p class="muted">공통과목만 작성합니다. (1단계의 과목 유형: ${esc(state.subjectType)})</p>`))
    + card('성취도 기준표', `
      <p class="muted">과목 유형(${esc(state.subjectType)})에 맞는 표가 문서에 들어갑니다. 필요하면 추가로 고르세요.</p>
      <div class="chips">${Object.entries(RATE_TABLES).map(([k, t]) => `<label class="chip"><input type="checkbox" data-bind="rateTables.${k}"${state.rateTables[k] ? ' checked' : ''}><span>${esc({ common: '공통과목', sciLab: '과학탐구 실험', elective: '선택과목', artsPe: '체육·예술' }[k])}</span></label>`).join('')}</div>`);
}

/* ---------- 8. 확인·내려받기 ---------- */
function stepFinish() {
  const checks = [
    [0, '과목명과 학교명', !!state.meta.subject.trim() && !!state.meta.school.trim()],
    [1, '성취기준 불러오기', allStandards().length > 0],
    [2, '반영비율 합계 100%', ratioTotal() === 100, `현재 ${fmt(ratioTotal())}%`],
    [3, '수행평가 채점기준 배점 = 영역만점', state.perfs.length > 0 && state.perfs.every(rubricOk),
      state.perfs.filter(p => !rubricOk(p)).map(p => p.name || '(이름 없음)').join(', ')],
    [4, '주차별 수업 계획', STEPS[4].done()],
    [5, '평가 목적 작성', STEPS[5].done()],
    [6, '학기 단위 성취수준 A~E', STEPS[6].done()],
  ];
  if (state.subjectType === '공통과목') checks.push([6, '최소 성취수준 (공통과목)', !!String(state.minLevel).trim()]);
  const left = checks.filter(c => !c[2]).length;
  return card('마무리 점검', `
      <ul class="checklist">${checks.map(([step, label, ok, detail]) => `
        <li class="${ok ? 'ok' : 'todo'}"><span class="mark">${ok ? '✔' : '!'}</span><span>${label}${!ok && detail ? ` <small>(${esc(detail)})</small>` : ''}</span>
          ${ok ? '' : b('goStep', '고치러 가기', { step }, 'link')}</li>`).join('')}</ul>
      <p class="${left ? 'warn-text' : 'ok-text'}">${left ? `확인이 필요한 항목이 ${left}개 있습니다. 그래도 내려받을 수 있습니다.` : '모든 항목을 채웠습니다.'}</p>
      <div class="download-row">
        ${b('exportHwpx', '한글(.hwpx) 다운로드', {}, 'primary big')}
        ${b('print', '인쇄 / PDF', {}, 'secondary big')}
        ${b('saveFile', '작성 파일 저장(.json)', {}, 'secondary big')}
      </div>`)
    + `<div class="preview-head"><h3>미리보기</h3><span class="muted">양식 모양으로 합친 결과입니다. 고칠 곳은 해당 단계로 돌아가 고치세요.</span></div>`;
}
