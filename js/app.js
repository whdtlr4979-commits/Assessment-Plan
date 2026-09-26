/* 교수학습 및 평가 운영 계획 작성 도구 */
'use strict';

const STORAGE_KEY = 'assessPlan.v1';
window.STANDARDS_DB = window.STANDARDS_DB || {};
function registerStandards(data) {
  window.STANDARDS_DB[data.id || data.subject] = data;
}

let state = loadState() || blankState('2');

/* ---------- 유틸 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const fmt = n => (Math.round(n * 100) / 100).toString();
const KOR_ORDER = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

function getPath(path, obj = state) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(path, value, obj = state) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

/* 편집 가능한 칸 */
function ce(path, { ph = '', cls = '', inline = false } = {}) {
  const tag = inline ? 'span' : 'div';
  return `<${tag} class="ce ${inline ? 'ce-inline' : ''} ${cls}" contenteditable="plaintext-only" spellcheck="false" data-bind="${path}" data-ph="${esc(ph)}">${esc(getPath(path))}</${tag}>`;
}
function btn(act, label, data = {}, cls = '') {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button type="button" class="btn-mini no-export ${cls}" data-act="${act}" ${attrs}>${label}</button>`;
}
function hint(text) { return `<div class="hint no-export">${text}</div>`; }
function sectionBar(roman, title) {
  return `<table class="sec-bar"><colgroup><col style="width:6%"><col style="width:94%"></colgroup><tr><td class="sec-roman">${roman}</td><td class="sec-title">${title}</td></tr></table>`;
}

/* ---------- 저장 ---------- */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) { return null; }
}
function migrate(s) {
  const base = blankState(s?.meta?.semester || '2');
  const out = Object.assign(base, s);
  out.meta = Object.assign(blankState().meta, s.meta || {});
  out.text = Object.assign({ ...DEFAULT_TEXT }, s.text || {});
  out.tie = Object.assign(blankState().tie, s.tie || {});
  out.rateTables = Object.assign(blankState().rateTables, s.rateTables || {});
  out.perfs = (out.perfs || []).map(p => Object.assign(newPerf(), p, { rubric: Object.assign(newRubric(), p.rubric || {}) }));
  if (!s.subjectType) {
    const rt = out.rateTables;
    out.subjectType = rt.common ? '공통과목' : rt.elective ? '선택과목' : rt.sciLab ? '과학탐구실험' : rt.artsPe ? '체육·예술' : '공통과목';
  }
  return out;
}
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  setStatus('저장 중…');
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStatus('자동 저장됨 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setStatus('브라우저 저장 실패 — [파일로 저장]을 이용하세요');
    }
  }, 400);
}
function setStatus(t) { const el = $('#status'); if (el) el.textContent = t; }

/* ---------- 렌더링 ---------- */
const STEP_KEY = 'assessPlan.step';
let step = (() => { try { return Math.max(0, Math.min(7, +localStorage.getItem(STEP_KEY) || 0)); } catch (e) { return 0; } })();

/* 단계 화면 그리기 */
function render() {
  const scroll = window.scrollY;
  $('#stepNav').innerHTML = STEPS.map((s, i) => `
    <button type="button" class="step-tab${i === step ? ' on' : ''}${s.done() ? ' done' : ''}" data-act="goStep" data-step="${i}">
      <span class="step-no">${s.done() && i !== step ? '✔' : i + 1}</span><span class="step-title">${s.title}</span></button>`).join('');
  $('#stepPanel').innerHTML = `<div class="step-heading"><span class="step-count">${step + 1} / ${STEPS.length}</span><h2>${STEPS[step].title}</h2></div>`
    + STEPS[step].render();
  $('#stepFoot').innerHTML = `
    ${step > 0 ? `<button type="button" class="btn secondary" data-act="goStep" data-step="${step - 1}">← ${STEPS[step - 1].title}</button>` : '<span></span>'}
    ${step < STEPS.length - 1 ? `<button type="button" class="btn primary" data-act="goStep" data-step="${step + 1}">${STEPS[step + 1].title} →</button>` : ''}`;
  const onFinish = STEPS[step].id === 'finish';
  $('#doc').hidden = !onFinish;
  if (onFinish) renderDoc();
  updateCalcs();
  $$('#stepPanel textarea').forEach(autoGrow);
  window.scrollTo(0, scroll);
}

/* 양식 모양 문서 (미리보기·한글 내려받기·인쇄용, 읽기 전용) */
function renderDoc() {
  const doc = $('#doc');
  doc.innerHTML = [renderHeader(), renderPlan(), renderStandards(), renderDetail()].join('');
  updateCalcs();
  doc.querySelectorAll('.no-export, .btn-mini').forEach(e => e.remove());
  doc.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
  doc.querySelectorAll('input, select').forEach(e => { e.disabled = true; });
}
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + 2) + 'px';
}

function renderHeader() {
  const m = state.meta;
  const cut = v => `<label class="chk"><input type="radio" name="cutType" data-bind="meta.cutType" value="${v}" ${m.cutType === v ? 'checked' : ''}> ${v}</label>`;
  return `
  <section class="page">
    ${state.showProcedure ? `<div class="procedure">${esc(PROCEDURE_TEXT)} ${btn('toggle', '숨기기', { key: 'showProcedure' })}</div>`
      : `<div class="no-export">${btn('toggle', '수립 및 시행 절차 안내문 표시', { key: 'showProcedure' })}</div>`}
    <div class="title-wrap">
      <div class="title-bar-top"></div>
      <h1 class="doc-title">${ce('meta.year', { inline: true, ph: '2026' })}학년도 ${ce('meta.semester', { inline: true, ph: '2' })}학기 [${ce('meta.subject', { inline: true, ph: '과목명', cls: 'subject-name' })}]과목 교수학습 및 평가 운영 계획</h1>
      <div class="title-bar-bottom"></div>
    </div>
    <table class="grid info">
      <colgroup><col style="width:13%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:6%"><col style="width:15%"><col style="width:21%"></colgroup>
      <tr>
        <th rowspan="2">학교명</th><th rowspan="2">학년</th><th rowspan="2">학기</th><th rowspan="2">학급</th>
        <th colspan="2" class="small">5명 이하 과목<br>‘석차등급’란 표기</th>
        <th rowspan="2">학점</th><th rowspan="2">분할점수산출<br>유형</th><th rowspan="2">지도교사</th>
      </tr>
      <tr><th class="small">석차등급</th><th class="small">가운뎃 점</th></tr>
      <tr class="center">
        <td>${ce('meta.school', { ph: '학교명' })}</td>
        <td>${ce('meta.grade', { ph: 'O학년' })}</td>
        <td>${ce('meta.term', { ph: 'O학기' })}</td>
        <td>${ce('meta.classes', { ph: 'O~O반' })}</td>
        <td>${ce('meta.rank5')}</td>
        <td>${ce('meta.midpoint')}</td>
        <td>${ce('meta.credit', { ph: '□' })}</td>
        <td class="left-inner">${cut('고정')}<br>${cut('추정')}</td>
        <td>${ce('meta.teachers', { ph: 'OOO(인), OOO(인)' })}</td>
      </tr>
    </table>
  </section>`;
}

function renderPlan() {
  const rows = state.plan.map((r, i) => `
    <tr>
      <td class="center when">${ce(`plan.${i}.when`)}
        <span class="row-tools no-export">${btn('planUp', '▲', { i }, 'icon')}${btn('planDown', '▼', { i }, 'icon')}${btn('planInsert', '+', { i }, 'icon')}${btn('planDel', '×', { i }, 'icon danger')}</span></td>
      <td class="center">${ce(`plan.${i}.hours`)}</td>
      <td class="center"><span data-calc="cum:${i}"></span></td>
      <td>${ce(`plan.${i}.unit`)}</td>
      <td>${ce(`plan.${i}.std`)}${btn('pickStd', '성취기준 선택', { target: `plan.${i}.std`, mode: 'plan' })}</td>
      <td>${ce(`plan.${i}.elements`)}</td>
      <td>${ce(`plan.${i}.method`)}</td>
      <td>${ce(`plan.${i}.note`)}</td>
    </tr>`).join('');
  return `
  <section class="page">
    ${sectionBar('Ⅰ', '교수학습-평가 계획')}
    ${hint('각 칸을 클릭해 바로 입력하세요. 시수를 입력하면 누계가 자동 계산됩니다. 성취기준은 [성취기준 선택] 버튼으로 Ⅱ에 불러온 성취기준에서 고를 수 있습니다.')}
    <table class="grid plan">
      <colgroup><col style="width:8%"><col style="width:5%"><col style="width:5%"><col style="width:12%"><col style="width:20%"><col style="width:17%"><col style="width:25%"><col style="width:8%"></colgroup>
      <tr><th>시기</th><th>시수</th><th>누계</th><th>단원명</th><th>교육과정 성취기준</th><th>평가 요소</th><th>수업·평가 방법,<br>수업-평가 연계의 주안점</th><th>비고</th></tr>
      ${rows}
    </table>
    <div class="table-actions no-export">
      ${btn('planAdd', '+ 행 추가')}
      ${btn('planWeeks', '시기(주차) 다시 채우기')}
      <span class="muted">누계 합계: <b data-calc="hoursTotal"></b>시간</span>
    </div>
  </section>`;
}

function renderStandards() {
  const idx = window.STANDARDS_INDEX || [];
  const groups = {};
  idx.forEach(s => { (groups[s.group || '기타'] = groups[s.group || '기타'] || []).push(s); });
  const options = Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${esc(g)}">${list.map(s => `<option value="${esc(s.id)}" ${state.standardsSource === s.id ? 'selected' : ''}>${esc(s.subject)}</option>`).join('')}</optgroup>`).join('');
  const loader = `
    <div class="loader no-export">
      <b>과목 성취기준 불러오기</b>
      <select id="stdSelect"><option value="">— 과목 선택 (${idx.length}개) —</option>${options}</select>
      ${btn('loadStd', '불러오기', {}, 'primary')}
      <label class="btn-mini file">JSON 파일에서 불러오기<input type="file" id="stdFile" accept=".json,.js" hidden></label>
      ${btn('addArea', '+ 영역 직접 추가')}
      ${state.areas.length ? btn('clearAreas', '모두 지우기', {}, 'danger') : ''}
    </div>`;
  const areas = state.areas.map((a, ai) => {
    const stds = a.standards.map((s, si) => {
      const levels = Object.keys(s.levels || {}).length ? Object.keys(s.levels) : LEVELS;
      return levels.map((L, li) => `
        <tr>
          ${li === 0 ? `<td rowspan="${levels.length}" class="std-cell">[${ce(`areas.${ai}.standards.${si}.code`, { inline: true, ph: '코드' })}] ${ce(`areas.${ai}.standards.${si}.text`, { inline: true, ph: '성취기준' })}
            <div class="no-export">${btn('delStd', '성취기준 삭제', { ai, si }, 'danger')}</div></td>` : ''}
          <td class="center lv">${esc(L)}</td>
          <td>${ce(`areas.${ai}.standards.${si}.levels.${L}`)}</td>
        </tr>`).join('');
    }).join('');
    return `
      <div class="area">
        <p class="area-title">(${ai + 1}) ${ce(`areas.${ai}.name`, { inline: true, ph: '영역명' })}
          <span class="no-export">${btn('addStd', '+ 성취기준 추가', { ai })}${btn('delArea', '영역 삭제', { ai }, 'danger')}</span></p>
        <table class="grid std">
          <colgroup><col style="width:30%"><col style="width:5%"><col style="width:65%"></colgroup>
          <tr><th>성취기준</th><th colspan="2">성취기준별 성취수준</th></tr>
          ${stds}
        </table>
      </div>`;
  }).join('');
  return `
  <section class="page">
    ${sectionBar('Ⅱ', '성취기준별 성취수준')}
    ${hint('성취기준에 따른 성취수준 분석을 바탕으로 평가 계획 수립')}
    ${loader}
    ${areas || '<p class="empty no-export">아직 불러온 성취기준이 없습니다. 위에서 과목을 선택하고 [불러오기]를 누르세요.</p>'}
  </section>`;
}

function renderDetail() {
  const t = key => ce(`text.${key}`, { cls: 'para' });
  return `
  <section class="page">
    ${sectionBar('Ⅲ', '평가 세부계획')}
    <h3>1. 평가 목적</h3>
    ${hint('2022 개정 교육과정의 각 과목 각론을 참고하여 작성')}
    ${t('purpose')}
    <h3>2. 평가 방향</h3>
    ${hint('2022 개정 교육과정의 각 과목 각론을 참고하여 작성')}
    ${t('direction')}
    <h3>3. 평가 방침</h3>
    <h4>가. 일반사항</h4>
    ${t('policyGeneral')}
    <h4>나. 수행평가 운영</h4>
    ${t('policyPerf')}
    ${state.showTaskBox ? `<div class="notice-box">${esc(TASK_TYPE_BOX).replace(/\n/g, '<br>')}</div>` : ''}
    <div class="no-export">${btn('toggle', state.showTaskBox ? '과제형 수행평가 안내 상자 숨기기' : '과제형 수행평가 안내 상자 표시', { key: 'showTaskBox' })}</div>
    ${t('policyPerf2')}
    <h4>다. 평가 결과 안내</h4>
    ${t('policyResult')}
    <h3>4. 평가 유의사항</h3>
    ${t('cautions')}
    <h3>5. 수강생(타학년 또는 타학과) 통합 산출 여부: ${ce('text.integration', { inline: true, ph: '해당없음' })}</h3>
    <h3>6. 평가 개요표</h3>
    ${renderOverview()}
    ${renderTie()}
    <h3>7. 기준 성취율과 성취도</h3>
    ${renderRates()}
    <h3>8. 수행평가 영역별 세부기준</h3>
    ${hint('- 수행평가 문항 출제는 수행평가 출제 계획표 등을 작성 및 활용함<br>- 수행평가 채점기준표에 명시한 배점에 따라 산출된 점수만 부여함<br>- 평가 요소에 따른 배점의 합이 각 영역의 만점과 일치하는지 확인')}
    ${state.perfs.map((p, i) => renderRubric(p, i)).join('') || '<p class="empty no-export">6. 평가 개요표에서 수행평가 영역을 추가하면 세부기준 표가 생깁니다.</p>'}
    <h3>9. 평가 미응시자(결시자) 및 학적 변동자(전입학, 재입학, 편입학) 처리</h3>
    ${hint('※ 정기시험 결시자, 수행평가 미응시자(결시자) 및 학적 변동자 등의 성적처리는 시도교육청의 학업성적관리 시행지침과 단위학교의 학업성적관리규정을 참고하여 작성. ‘미응시 시 1회 응시 기회 부여 여부 및 점수 부여 방법’을 교과협의회를 통해 결정하여 명시함.')}
    <div class="no-export examples">예시 문구 넣기: ${ABSENTEE_EXAMPLES.map((_, i) => btn('absEx', ['미부여-기본점수', '미부여-차하점', '1회 부여'][i], { i })).join('')}</div>
    ${t('absentee')}
    <h3>10. 정기시험 및 수행평가의 이의신청 기간 및 절차: ${ce('text.appeal', { inline: true })}</h3>
    <h3>11. 평가 결과의 활용</h3>
    ${t('usage')}
    <h3>12. 학기 단위 성취수준 설정</h3>
    ${hint('- 선택과목의 학기 단위 성취수준 진술 시, 성취도 E(C)의 성취율이 ‘60% 미만’ 임을 고려하여 진술<br>- 공통과목은 성취율 40%이상~60%미만으로 진술')}
    <div class="no-export">${btn('draftSemester', 'Ⅱ의 성취기준별 성취수준으로 초안 채우기', {}, 'primary')}</div>
    <table class="grid">
      <colgroup><col style="width:12%"><col style="width:88%"></colgroup>
      <tr><th>성취수준</th><th>학기단위 성취수준 진술</th></tr>
      ${LEVELS.map(L => `<tr><td class="center lv">${L}</td><td>${ce(`semesterLevels.${L}`)}</td></tr>`).join('')}
    </table>
    <h3>13. 최소 성취수준 설정(공통과목)</h3>
    <table class="grid">
      <tr><th>학기단위 최소 성취수준(성취율 40%의 성취수준 진술)</th></tr>
      <tr><td>${ce('minLevel')}</td></tr>
    </table>
  </section>`;
}

function renderOverview() {
  const E = state.exams, P = state.perfs;
  const nE = E.length * 2, nP = P.length;
  const examCells = (fn, span = 2) => E.map((e, i) => `<td colspan="${span}" class="center">${fn(e, i)}</td>`).join('');
  const subCells = fn => E.map((e, i) => e.subs.map((s, j) => `<td class="center">${fn(s, i, j)}</td>`).join('')).join('');
  const perfCells = fn => P.map((p, i) => `<td class="center">${fn(p, i)}</td>`).join('');
  return `
    ${hint('영역명·비율을 바꾸면 반영비율 합계, 동점자 처리 표, 수행평가 세부기준 제목이 자동으로 바뀝니다.')}
    <table class="grid overview">
      <tr><th>과목명<br>항목</th><td colspan="${nE + nP}" class="center">${ce('meta.subject', { ph: '과목명' })}</td></tr>
      <tr><th>평가종류</th>${nE ? `<th colspan="${nE}">정기시험</th>` : ''}${nP ? `<th colspan="${nP}">수행평가</th>` : ''}</tr>
      <tr><th>반영비율</th>${nE ? `<td colspan="${nE}" class="center"><span data-calc="examTotal"></span>%</td>` : ''}${nP ? `<td colspan="${nP}" class="center"><span data-calc="perfTotal"></span>%</td>` : ''}</tr>
      <tr><th>횟수/영역</th>
        ${examCells((e, i) => `${ce(`exams.${i}.name`, { inline: true, ph: 'O차시험' })}(${ce(`exams.${i}.ratio`, { inline: true, ph: '30' })}%)<div class="no-export">${btn('delExam', '삭제', { i }, 'danger')}</div>`)}
        ${perfCells((p, i) => `${ce(`perfs.${i}.name`, { ph: '수행평가 영역명' })}<div class="no-export">${btn('perfLeft', '◀', { i }, 'icon')}${btn('perfRight', '▶', { i }, 'icon')}${btn('delPerf', '삭제', { i }, 'danger')}</div>`)}
      </tr>
      <tr><th>평가방법</th>${subCells((s, i, j) => ce(`exams.${i}.subs.${j}.method`))}${perfCells((p, i) => ce(`perfs.${i}.method`, { ph: '예: 프로젝트' }))}</tr>
      <tr><th>영역만점</th>${subCells((s, i, j) => ce(`exams.${i}.subs.${j}.max`, { ph: '50점' }))}${perfCells((p, i) => `${ce(`perfs.${i}.max`, { inline: true, ph: '15' })}점`)}</tr>
      <tr><th>학기말<br>반영비율</th>${subCells((s, i, j) => ce(`exams.${i}.subs.${j}.ratio`, { ph: '15%' }))}${perfCells((p, i) => `${ce(`perfs.${i}.ratio`, { inline: true, ph: '15' })}%`)}</tr>
      <tr><th>교육과정<br>성취기준</th>
        ${examCells((e, i) => ce(`exams.${i}.standards`, { cls: 'left' }) + btn('pickStd', '선택', { target: `exams.${i}.standards`, mode: 'code' }))}
        ${perfCells((p, i) => ce(`perfs.${i}.standards`, { cls: 'left' }) + btn('pickStd', '선택', { target: `perfs.${i}.standards`, mode: 'code' }))}</tr>
      <tr><th>기본점수</th>${examCells((e, i) => ce(`exams.${i}.base`))}${perfCells((p, i) => ce(`perfs.${i}.base`, { ph: '영역만점의 10%이상~40%미만' }))}</tr>
      <tr><th>평가시기</th>${examCells((e, i) => ce(`exams.${i}.when`))}${perfCells((p, i) => ce(`perfs.${i}.when`, { ph: 'O월' }))}</tr>
    </table>
    <div class="table-actions no-export">
      ${btn('addExam', '+ 정기시험 추가')}${btn('addPerf', '+ 수행평가 영역 추가')}
      <span class="check" data-calc="ratioCheck"></span>
    </div>`;
}

function renderTie() {
  if (!state.showTie) return `<div class="no-export">${btn('toggle', '동점자 처리 기준 순위 표 표시', { key: 'showTie' })}</div>`;
  const E = state.exams, P = state.perfs;
  const n2 = E.length + P.length;
  return `
    <p class="sub-title">* 동점자 처리 기준 순위 <span class="no-export">${btn('toggle', '숨기기', { key: 'showTie' })}</span></p>
    <table class="grid tie">
      <colgroup><col style="width:60%"><col style="width:20%"><col style="width:20%"></colgroup>
      <tr><th>방안명</th><th>Ⅰ.방안 순위</th><th>Ⅱ.방안내순위</th></tr>
      <tr><td>정기시험/수행평가순</td><td rowspan="3" class="center">${ce('tie.rank1')}</td><td></td></tr>
      <tr><td>*정기시험</td><td class="center">${ce('tie.examRank')}</td></tr>
      <tr><td>*수행평가</td><td class="center">${ce('tie.perfRank')}</td></tr>
      <tr><td>정기시험/수행평가영역순</td><td rowspan="${n2 + 1}" class="center">${ce('tie.rank2')}</td><td></td></tr>
      ${E.map((e, i) => `<tr><td><span data-calc="tieExam:${i}"></span></td><td class="center">${ce(`exams.${i}.tieRank`)}</td></tr>`).join('')}
      ${P.map((p, i) => `<tr><td><span data-calc="tiePerf:${i}"></span></td><td class="center">${ce(`perfs.${i}.tieRank`)}</td></tr>`).join('')}
    </table>
    <p class="small-note">- 석차등급을 산출하지 않은 과목 제외</p>`;
}

function renderRates() {
  const chooser = Object.entries(RATE_TABLES).map(([k, t]) =>
    `<label class="chk"><input type="checkbox" data-bind="rateTables.${k}" data-rerender="1" ${state.rateTables[k] ? 'checked' : ''}> ${esc(t.title.slice(0, 2))} ${esc({ common: '공통과목', sciLab: '과학탐구 실험', elective: '선택과목', artsPe: '체육·예술' }[k])}</label>`).join(' ');
  const tables = Object.entries(RATE_TABLES).filter(([k]) => state.rateTables[k]).map(([, t]) => `
    <p class="sub-title">${esc(t.title)}</p>
    <table class="grid rate">
      <tr><th>${t.head[0]}</th><th>${t.head[1]}</th></tr>
      ${t.rows.map(r => `<tr><td class="center">${r[0]}</td><td class="center">${r[1]}</td></tr>`).join('')}
      ${t.note ? `<tr><td colspan="2">${esc(t.note)}</td></tr>` : ''}
    </table>`).join('');
  return `
    <div class="notice-box">${esc(RATE_NOTICE)}</div>
    <div class="no-export chooser">포함할 표: ${chooser}</div>
    ${tables}`;
}

function renderRubric(p, i) {
  const r = p.rubric, base = `perfs.${i}.rubric`;
  const checks = (list, key) => list.map(m =>
    `<label class="chk"><input type="checkbox" data-arr="${base}.${key}" value="${esc(m)}" ${r[key].includes(m) ? 'checked' : ''}> ${esc(m)}</label>`).join('&nbsp;&nbsp;&nbsp;');
  const elements = r.elements.map((el, j) => el.criteria.map((c, k) => `
      <tr>
        ${k === 0 ? `<td colspan="2" rowspan="${el.criteria.length}" class="center">${ce(`${base}.elements.${j}.name`, { ph: '평가 요소' })}(<span data-calc="elMax:${i}:${j}"></span>점)
          <div class="no-export">${btn('addCrit', '+ 수준', { i, j })}${btn('delEl', '요소 삭제', { i, j }, 'danger')}</div></td>` : ''}
        <td colspan="2">${ce(`${base}.elements.${j}.criteria.${k}.text`, { ph: '수행수준(채점기준)' })}</td>
        <td class="center">${ce(`${base}.elements.${j}.criteria.${k}.score`)}<span class="no-export">${btn('delCrit', '×', { i, j, k }, 'icon danger')}</span></td>
      </tr>`).join('')).join('');
  return `
    <div class="rubric">
      <p class="sub-title">${KOR_ORDER[i] || i + 1}. <span data-calc="rubTitle:${i}"></span></p>
      <table class="grid">
        <colgroup><col style="width:14%"><col style="width:6%"><col style="width:20%"><col style="width:50%"><col style="width:10%"></colgroup>
        <tr><th>수행 과제</th><td colspan="4">${ce(`${base}.task`, { ph: '· 수행 과제를 입력하세요' })}</td></tr>
        <tr><th>교육과정<br>성취기준</th><td colspan="4">${ce(`${base}.standards`)}${btn('pickStd', '성취기준 선택', { target: `${base}.standards`, mode: 'full' })}</td></tr>
        ${LEVELS.map((L, li) => `<tr>${li === 0 ? `<th rowspan="5">평가기준${btn('fillRubricLevels', 'Ⅱ에서 가져오기', { i })}</th>` : ''}<td colspan="2" class="center lv">${L}</td><td colspan="2">${ce(`${base}.levels.${L}`, { ph: '·' })}</td></tr>`).join('')}
        <tr><th rowspan="2">평가방법</th><td colspan="4">${checks(EVAL_METHODS, 'methods')}</td></tr>
        <tr><td colspan="4">${checks(OBSERVE_METHODS, 'observe')}</td></tr>
        <tr><th>학생 유의사항</th><td colspan="4">${ce(`${base}.notes`)}</td></tr>
        <tr><th colspan="2">평가 요소</th><th colspan="2">수행수준(채점기준)</th><th>배점</th></tr>
        ${elements}
      </table>
      <div class="table-actions no-export">${btn('addEl', '+ 평가 요소 추가', { i })}<span class="check" data-calc="rubCheck:${i}"></span></div>
    </div>`;
}

/* ---------- 자동 계산 ---------- */
function elMax(el) {
  const scores = el.criteria.map(c => num(c.score)).filter(n => !isNaN(n));
  return scores.length ? Math.max(...scores) : 0;
}
function calc(key) {
  const [k, a, b] = key.split(':');
  const sum = arr => arr.reduce((s, x) => s + (isNaN(x) ? 0 : x), 0);
  switch (k) {
    case 'cum': {
      const i = +a;
      if (String(state.plan[i].hours).trim() === '') return '';
      return fmt(sum(state.plan.slice(0, i + 1).map(r => num(r.hours))));
    }
    case 'hoursTotal': return fmt(sum(state.plan.map(r => num(r.hours))));
    case 'examTotal': return fmt(sum(state.exams.map(e => num(e.ratio))));
    case 'perfTotal': return fmt(sum(state.perfs.map(p => num(p.ratio))));
    case 'ratioCheck': {
      const t = sum(state.exams.map(e => num(e.ratio))) + sum(state.perfs.map(p => num(p.ratio)));
      return t === 100 ? `✔ 반영비율 합계 ${fmt(t)}%` : `⚠ 반영비율 합계가 ${fmt(t)}%입니다 (100%가 되어야 합니다)`;
    }
    case 'tieExam': { const e = state.exams[+a]; return `*[지필] ${e.name || ''} (${isNaN(num(e.ratio)) ? '' : num(e.ratio).toFixed(2)}%)`; }
    case 'tiePerf': { const p = state.perfs[+a]; return `*[수행] ${p.name || ''} (${isNaN(num(p.ratio)) ? '' : num(p.ratio).toFixed(2)}%)`; }
    case 'rubTitle': { const p = state.perfs[+a]; return `${p.name || '(수행평가 영역명)'}(총 ${isNaN(num(p.max)) ? '  ' : fmt(num(p.max))}점)`; }
    case 'elMax': return fmt(elMax(state.perfs[+a].rubric.elements[+b]));
    case 'elMaxLabel': return `최고 ${fmt(elMax(state.perfs[+a].rubric.elements[+b]))}점`;
    case 'ratioText': {
      const t = ratioTotal();
      return t === 100 ? `✔ 합계 ${fmt(t)}%` : `합계 ${fmt(t)}% — ${t < 100 ? `${fmt(100 - t)}% 부족` : `${fmt(t - 100)}% 초과`}`;
    }
    case 'rubCheck': {
      const p = state.perfs[+a];
      const total = sum(p.rubric.elements.map(elMax));
      const max = num(p.max);
      if (isNaN(max)) return `평가 요소 최고 배점 합계 ${fmt(total)}점 (평가 개요표에 영역만점을 입력하세요)`;
      return total === max ? `✔ 평가 요소 배점 합계 ${fmt(total)}점 = 영역만점 ${fmt(max)}점` : `⚠ 평가 요소 배점 합계 ${fmt(total)}점 ≠ 영역만점 ${fmt(max)}점`;
    }
  }
  return '';
}
function ratioMeterHTML() {
  const seg = (label, v, cls) => isNaN(v) || v <= 0 ? '' :
    `<div class="meter-seg ${cls}" style="flex-basis:${Math.min(v, 100)}%" title="${esc(label)} ${fmt(v)}%"><span>${esc(label)} ${fmt(v)}%</span></div>`;
  const t = ratioTotal();
  return state.exams.map(e => seg(e.name || '정기시험', num(e.ratio), 'exam')).join('')
    + state.perfs.map((p, i) => seg(p.name || `수행평가 ${i + 1}`, num(p.ratio), 'perf')).join('')
    + (t < 100 ? `<div class="meter-seg rest" style="flex-basis:${100 - t}%"></div>` : '');
}
function updateCalcs() {
  $$('[data-calc]').forEach(el => {
    const v = calc(el.dataset.calc);
    if (el.textContent !== v) el.textContent = v;
    if (el.classList.contains('check') || el.classList.contains('check-line') || el.classList.contains('meter-text')) {
      el.classList.toggle('warn', v.startsWith('⚠') || v.startsWith('합계'));
      el.classList.toggle('ok', v.startsWith('✔'));
    }
  });
  $$('[data-calc-html="ratioMeter"]').forEach(el => { el.innerHTML = ratioMeterHTML(); });
}

/* ---------- 입력 처리 ---------- */
function readValue(el) {
  if (el.isContentEditable) {
    let v = el.innerText;
    if (v === '\n') v = '';
    return v.replace(/ /g, ' ');
  }
  if (el.type === 'checkbox') return el.checked;
  return el.value;
}
document.addEventListener('input', e => {
  const el = e.target.closest('[data-bind]');
  if (!el || el.type === 'radio') return;
  const path = el.dataset.bind;
  const v = readValue(el);
  setPath(path, v);
  afterChange(path);
  // 같은 값을 보여주는 다른 칸 동기화 (예: 과목명)
  $$(`[data-bind="${CSS.escape(path)}"]`).forEach(o => {
    if (o === el) return;
    if (o.isContentEditable && o.innerText !== v) o.textContent = v;
    else if ('value' in o && o.type !== 'checkbox' && o.type !== 'radio' && o.value !== v) o.value = v;
  });
  if (el.tagName === 'TEXTAREA') autoGrow(el);
  if (el.dataset.rerender || el.type === 'checkbox') render(); else updateCalcs();
  saveSoon();
});
/* 한 값이 바뀌면 함께 바뀌어야 하는 값 */
function afterChange(path) {
  if (path === 'meta.semester') state.meta.term = `${state.meta.semester}학기`;
  if (path === 'subjectType') {
    Object.keys(state.rateTables).forEach(k => { state.rateTables[k] = false; });
    state.rateTables[TYPE_RATE[state.subjectType] || 'common'] = true;
  }
}
document.addEventListener('change', e => {
  const el = e.target;
  if (el.type === 'radio' && el.dataset.bind) {
    setPath(el.dataset.bind, el.value);
    afterChange(el.dataset.bind);
    if (el.dataset.rerender) render();
    saveSoon();
  }
  if (el.dataset.arr) {
    const arr = getPath(el.dataset.arr);
    const i = arr.indexOf(el.value);
    if (el.checked && i < 0) arr.push(el.value);
    if (!el.checked && i >= 0) arr.splice(i, 1);
    saveSoon();
  }
  if (el.id === 'stdFile' && el.files[0]) importStandardsFile(el.files[0]);
  if (el.id === 'planFile' && el.files[0]) importPlanFile(el.files[0]);
});
// 붙여넣기는 항상 일반 텍스트로
document.addEventListener('paste', e => {
  const el = e.target.closest && e.target.closest('.ce');
  if (!el) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
});

/* ---------- 버튼 동작 ---------- */
const actions = {
  toggle: d => { state[d.key] = !state[d.key]; },
  goStep: d => {
    step = Math.max(0, Math.min(STEPS.length - 1, +d.step));
    try { localStorage.setItem(STEP_KEY, step); } catch (e) { /* 저장 못 해도 동작에는 지장 없음 */ }
    window.scrollTo(0, 0);
  },
  pickSubject: () => {
    const name = $('#subjectSearch').value.trim();
    const entry = (window.STANDARDS_INDEX || []).find(s => s.subject === name)
      || (window.STANDARDS_INDEX || []).find(s => s.subject.replace(/\s/g, '') === name.replace(/\s/g, ''));
    if (!entry) { alert(name ? `‘${name}’ 과목을 찾지 못했습니다. 목록에서 골라 주세요.` : '과목명을 입력하세요.'); return false; }
    if (state.areas.length && state.standardsSource !== entry.id && !confirm(`성취기준을 ‘${entry.subject}’(으)로 바꿀까요?`)) return false;
    state.meta.subject = entry.subject;
    if (/공통|통합|과학탐구실험|한국사/.test(entry.subject)) state.subjectType = /과학탐구실험/.test(entry.subject) ? '과학탐구실험' : '공통과목';
    else if (/체육|스포츠|음악|미술|연극|영화|예술|운동|육상|체조|수상|드로잉|합창|시창/.test(entry.subject + entry.group)) state.subjectType = '체육·예술';
    else state.subjectType = '선택과목';
    afterChange('subjectType');
    loadStandards(entry.id);
  },
  toggleStd: d => {
    const codes = extractCodes(getPath(d.target));
    const i = codes.indexOf(d.code);
    if (i >= 0) codes.splice(i, 1); else codes.push(d.code);
    const order = allStandards().map(s => s.code);
    codes.sort((a, b2) => order.indexOf(a) - order.indexOf(b2));
    setPath(d.target, codes.map(c => `[${c}]`).join('\n'));
  },
  perfTab: d => { currentPerf = +d.i; },
  fillHours: () => {
    const v = prompt('비어 있는 주의 시수를 몇 시간으로 채울까요?', '4');
    if (v == null || isNaN(num(v))) return false;
    state.plan.forEach(r => { if (!String(r.hours).trim()) r.hours = String(num(v)); });
  },
  resetText: d => {
    if (!confirm('이 항목을 양식의 기본 문구로 되돌릴까요? 지금 적은 내용은 지워집니다.')) return false;
    state.text[d.key] = DEFAULT_TEXT[d.key];
  },
  fillRubricStd: d => {
    const p = state.perfs[+d.i];
    const codes = extractCodes(p.standards);
    if (!codes.length) { alert('3단계(평가 설계)에서 이 수행평가의 성취기준을 먼저 골라 주세요.'); return false; }
    const byCode = Object.fromEntries(allStandards().map(s => [s.code, s]));
    p.rubric.standards = codes.map(c => `[${c}] ${byCode[c] ? byCode[c].text : ''}`.trim()).join('\n');
  },
  planAdd: () => { state.plan.push(newPlanRow()); },
  planInsert: d => { state.plan.splice(+d.i + 1, 0, newPlanRow()); },
  planDel: d => { if (confirm('이 행을 삭제할까요?')) state.plan.splice(+d.i, 1); else return false; },
  planUp: d => move(state.plan, +d.i, -1),
  planDown: d => move(state.plan, +d.i, 1),
  planWeeks: () => {
    const sem = String(state.meta.semester).trim() === '1' ? '1' : '2';
    if (!confirm(`${sem}학기 주차로 '시기' 칸을 다시 채울까요? (다른 칸의 내용은 유지됩니다)`)) return false;
    const weeks = WEEKS[sem];
    while (state.plan.length < weeks.length) state.plan.push(newPlanRow());
    weeks.forEach((w, i) => { state.plan[i].when = w; });
  },
  loadStd: () => {
    const id = $('#stdSelect').value;
    if (!id) { alert('과목을 선택하세요.'); return false; }
    if (state.areas.length && !confirm('현재 Ⅱ의 성취기준 내용을 선택한 과목으로 바꿀까요?')) return false;
    loadStandards(id);
    return false;
  },
  clearAreas: () => { if (!confirm('Ⅱ의 성취기준을 모두 지울까요?')) return false; state.areas = []; state.standardsSource = ''; },
  addArea: () => { state.areas.push({ name: '', standards: [newStandard()] }); },
  addStd: d => { state.areas[+d.ai].standards.push(newStandard()); },
  delStd: d => { if (!confirm('이 성취기준을 삭제할까요?')) return false; state.areas[+d.ai].standards.splice(+d.si, 1); },
  delArea: d => { if (!confirm('이 영역을 통째로 삭제할까요?')) return false; state.areas.splice(+d.ai, 1); },
  addExam: () => { state.exams.push(newExam(`${state.exams.length + 1}차시험`)); },
  delExam: d => { if (!confirm('이 정기시험을 삭제할까요?')) return false; state.exams.splice(+d.i, 1); },
  addPerf: () => { state.perfs.push(newPerf()); },
  delPerf: d => { if (!confirm('이 수행평가 영역과 세부기준(8번)을 함께 삭제할까요?')) return false; state.perfs.splice(+d.i, 1); },
  perfLeft: d => move(state.perfs, +d.i, -1),
  perfRight: d => move(state.perfs, +d.i, 1),
  addEl: d => { state.perfs[+d.i].rubric.elements.push(newRubricElement()); },
  delEl: d => { if (!confirm('이 평가 요소를 삭제할까요?')) return false; state.perfs[+d.i].rubric.elements.splice(+d.j, 1); },
  addCrit: d => { state.perfs[+d.i].rubric.elements[+d.j].criteria.push({ text: '', score: '' }); },
  delCrit: d => {
    const c = state.perfs[+d.i].rubric.elements[+d.j].criteria;
    if (c.length <= 1) { alert('수준은 최소 1개가 필요합니다. 요소 전체를 지우려면 [요소 삭제]를 누르세요.'); return false; }
    c.splice(+d.k, 1);
  },
  absEx: d => {
    const cur = state.text.absentee;
    const ex = ABSENTEE_EXAMPLES[+d.i];
    const re = /(2\) 수행평가\n)([^\n]*)(\n)/;
    state.text.absentee = re.test(cur) ? cur.replace(re, (_, a, _b, c) => a + ' ' + ex + c) : cur + '\n' + ex;
  },
  draftSemester: () => {
    if (!state.areas.length) { alert('먼저 Ⅱ에서 성취기준을 불러오세요.'); return false; }
    if (LEVELS.some(L => state.semesterLevels[L]) && !confirm('기존 학기 단위 성취수준 내용을 덮어쓸까요?')) return false;
    LEVELS.forEach(L => {
      state.semesterLevels[L] = state.areas.map(a => {
        const t = a.standards.map(s => (s.levels || {})[L]).filter(Boolean).join(' ');
        return t ? `(${a.name}) ${t}` : '';
      }).filter(Boolean).join('\n');
    });
  },
  fillRubricLevels: d => {
    const r = state.perfs[+d.i].rubric;
    const codes = extractCodes(r.standards);
    const found = allStandards().filter(s => codes.includes(s.code));
    if (!found.length) { alert('수행평가 세부기준의 [교육과정 성취기준] 칸에 Ⅱ에 있는 성취기준 코드를 먼저 넣어주세요.'); return false; }
    if (LEVELS.some(L => r.levels[L]) && !confirm('평가기준(A~E) 내용을 덮어쓸까요?')) return false;
    LEVELS.forEach(L => { r.levels[L] = found.map(s => (s.levels || {})[L]).filter(Boolean).join('\n'); });
  },
  pickStd: d => { openPicker(d.target, d.mode); return false; },
  newPlan: () => {
    const sem = prompt('새 평가계획을 만듭니다. 학기를 입력하세요 (1 또는 2)\n※ 현재 내용은 지워집니다. 필요하면 먼저 [파일로 저장]하세요.', state.meta.semester || '2');
    if (sem == null) return false;
    state = blankState(String(sem).trim() === '1' ? '1' : '2');
    step = 0;
  },
  loadExample: () => {
    if (!confirm('양식의 <예시>(공통국어1)를 불러올까요? 현재 내용은 지워집니다.')) return false;
    state = exampleState();
    loadStandards('공통국어1');
  },
  saveFile: () => { downloadBlob(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }), fileBase() + '.json'); return false; },
  exportHwpx: () => { exportHwpx(); return false; },
  print: () => { renderDoc(); $('#doc').hidden = false; setTimeout(() => window.print(), 50); return false; },
};
function move(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
function newStandard() { return { code: '', text: '', levels: { A: '', B: '', C: '', D: '', E: '' } }; }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  e.preventDefault();
  const fn = actions[b.dataset.act];
  if (!fn) {
    // 새 화면(index.html)과 예전 스크립트가 섞여 불러와진 경우
    alert('사이트가 업데이트되었습니다. Ctrl+Shift+R(또는 Ctrl+F5)로 새로고침한 뒤 다시 눌러 주세요.');
    return;
  }
  const result = fn({ ...b.dataset });
  if (result !== false) { render(); saveSoon(); }
});

/* ---------- 성취기준 데이터 ---------- */
function loadStandards(id) {
  const apply = () => {
    const data = window.STANDARDS_DB[id];
    if (!data) { alert('성취기준 데이터를 찾을 수 없습니다: ' + id); return; }
    applyStandards(data);
  };
  if (window.STANDARDS_DB[id]) return apply();
  const entry = (window.STANDARDS_INDEX || []).find(s => s.id === id);
  if (!entry) { alert('목록에 없는 과목입니다: ' + id); return; }
  const sc = document.createElement('script');
  sc.src = 'data/standards/' + encodeURIComponent(entry.file) + '?v=' + (window.APP_VERSION || '');
  sc.onload = apply;
  sc.onerror = () => alert('성취기준 파일을 불러오지 못했습니다: ' + entry.file);
  document.head.appendChild(sc);
}
function applyStandards(data) {
  state.areas = clone(data.areas || []);
  state.standardsSource = data.id || data.subject || '';
  if (!state.meta.subject && data.subject) state.meta.subject = data.subject;
  render(); saveSoon();
}
function importStandardsFile(file) {
  file.text().then(txt => {
    const json = txt.trim().replace(/^[^{]*registerStandards\(/, '').replace(/\);?\s*$/, '');
    const data = JSON.parse(json);
    if (!Array.isArray(data.areas)) throw new Error('areas 항목이 없습니다');
    if (state.areas.length && !confirm('현재 Ⅱ의 성취기준 내용을 파일 내용으로 바꿀까요?')) return;
    applyStandards(data);
  }).catch(err => alert('성취기준 파일을 읽지 못했습니다.\n' + err.message));
}
function allStandards() { return state.areas.flatMap(a => a.standards.map(s => ({ ...s, area: a.name }))); }
function extractCodes(text) { return [...String(text || '').matchAll(/\[([^\]\s]+)\]/g)].map(m => m[1].replace(/—/g, '-')); }

/* ---------- 성취기준 선택 창 ---------- */
function openPicker(target, mode) {
  const dlg = $('#picker');
  const list = state.areas;
  const current = extractCodes(getPath(target));
  const body = list.length ? list.map(a => `
      <fieldset><legend>${esc(a.name)}</legend>
      ${a.standards.map(s => `<label class="pick-item"><input type="checkbox" value="${esc(s.code)}" ${current.includes(s.code) ? 'checked' : ''}>
        <b>[${esc(s.code)}]</b> ${esc(s.text)}</label>`).join('')}
      </fieldset>`).join('')
    : '<p>Ⅱ. 성취기준별 성취수준에서 먼저 과목 성취기준을 불러오세요.</p>';
  $('#pickerBody').innerHTML = body;
  $('#pickerType').hidden = mode !== 'plan';
  $('#pickerApply').onclick = () => {
    const codes = $$('#pickerBody input:checked').map(i => i.value);
    const byCode = Object.fromEntries(allStandards().map(s => [s.code, s]));
    const type = $('#pickerTypeSel').value;
    let out;
    if (mode === 'plan') out = codes.map(c => `[${c}]${type ? `(${type})` : ''}\n${byCode[c].text}`).join('\n');
    else if (mode === 'full') out = codes.map(c => `[${c}] ${byCode[c].text}`).join('\n');
    else out = codes.map(c => `[${c}]`).join('\n');
    setPath(target, out);
    dlg.close();
    render(); saveSoon();
  };
  dlg.showModal();
}

/* ---------- 파일 저장/불러오기 ---------- */
function fileBase() {
  const m = state.meta;
  return `${m.year || ''}학년도 ${m.semester || ''}학기 ${m.subject || '과목'} 교수학습 및 평가 운영 계획`.trim();
}
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function importPlanFile(file) {
  file.text().then(txt => {
    const data = JSON.parse(txt);
    if (!data.meta || !data.plan) throw new Error('평가계획 파일 형식이 아닙니다');
    if (!confirm('불러온 파일로 현재 내용을 바꿀까요?')) return;
    state = migrate(data);
    render(); saveSoon();
  }).catch(err => alert('파일을 읽지 못했습니다.\n' + err.message));
  $('#planFile').value = '';
}

/* 내보내기용 깨끗한 HTML 만들기 */
function cleanDocHTML() {
  const c = $('#doc').cloneNode(true);
  c.querySelectorAll('.no-export, .btn-mini').forEach(e => e.remove());
  c.querySelectorAll('input[type=checkbox], input[type=radio]').forEach(i => {
    const box = document.createTextNode(i.checked ? '☑' : '□');
    i.replaceWith(box);
  });
  c.querySelectorAll('.ce').forEach(e => {
    const span = document.createElement(e.tagName === 'SPAN' ? 'span' : 'div');
    span.innerHTML = esc(getPath(e.dataset.bind)).replace(/\n/g, '<br>');
    if (e.classList.contains('para')) span.className = 'para';
    e.replaceWith(span);
  });
  return c.innerHTML;
}

function exportHwpx() {
  const root = document.createElement('div');
  renderDoc();
  root.innerHTML = cleanDocHTML();
  setStatus('한글 파일 만드는 중…');
  HWPX.ensureTemplate()
    .then(() => {
      downloadBlob(HWPX.build(root, fileBase()), fileBase() + '.hwpx');
      setStatus('한글 파일을 내려받았습니다');
    })
    .catch(err => alert('한글 파일을 만들지 못했습니다.\n' + err.message));
}

/* ---------- 시작 ---------- */
window.addEventListener('DOMContentLoaded', () => {
  render();
  setStatus(loadState() ? '이전에 작성하던 내용을 불러왔습니다' : '새 평가계획');
  $('#pickerCancel').onclick = () => $('#picker').close();
});
