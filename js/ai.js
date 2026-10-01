/* AI(Claude)로 수행평가 평가기준 A~E 초안 작성
 * - API 키가 있으면: 이 브라우저에서 Claude API를 바로 불러 작성 (키는 이 브라우저에만 저장)
 * - API 키가 없으면: 질문(프롬프트)을 복사해 Claude·ChatGPT 등 채팅에 붙여 넣고, 답을 다시 붙여 넣어 채움 */
'use strict';

const AI_MODEL = 'claude-opus-5-5';
const AI_KEY = 'assessPlan.aiKey';
const AI_TAB = 'assessPlan.aiTab';

function aiGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function aiSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* 저장 못 해도 이번 작성은 진행 */ } }

const AI_SYSTEM = `당신은 한국 고등학교 교사의 수행평가 계획 작성을 돕는 평가 전문가입니다. 2022 개정 교육과정의 성취평가제(A~E 다섯 단계)에 맞추어, 교사가 제시한 수행 과제와 교육과정 성취기준을 근거로 수행평가 채점기준표의 '평가기준' A, B, C, D, E를 작성합니다.

작성 원칙
- 각 수준은 이 수행 과제에서 학생이 실제로 보여 주는 수행을 기준으로 씁니다. 성취기준 문장을 그대로 옮기지 말고 과제의 활동·산출물에 맞게 구체화합니다.
- 제공된 '성취기준별 성취수준'이 있으면 그 수준 구분(지식·이해의 정확성과 깊이, 적용의 자율성, 태도 등)을 따르되 과제에 맞게 다시 씁니다.
- A에서 E로 갈수록 수행의 질이 한 단계씩 낮아지도록 같은 관점(예: 정확성, 근거의 충실성, 완성도, 자기주도성)을 일관되게 유지합니다. 수준 사이의 차이가 분명해야 합니다.
- E도 학생이 할 수 있는 것을 긍정적으로 서술합니다(예: '교사의 안내나 동료의 도움을 받아 ~의 일부를 ~할 수 있다'). '못한다', '부족하다' 같은 결핍 표현만으로 쓰지 않습니다.
- 성취기준이 여러 개이면 한 수준 안에서 자연스럽게 통합해 서술합니다.
- 각 수준은 1~3문장, '~할 수 있다.'처럼 성취수준 문체로 씁니다. 수준 이름(A:, B 등), 기호, 줄머리표는 넣지 않습니다.
- 평가 요소가 주어지면 그 요소들이 각 수준 서술에 드러나게 합니다.`;

/* 이 수행평가에 대해 AI에 넘길 내용 */
function aiContext(i) {
  const p = state.perfs[i], r = p.rubric;
  const codes = extractCodes(r.standards);
  const found = allStandards().filter(s => codes.includes(s.code));
  const lines = [
    `과목: ${state.meta.subject || '(미입력)'}`,
    `수행평가 영역: ${p.name || `수행평가 ${i + 1}`}`,
    `평가방법: ${splitMethods(p.method).join(', ') || r.methods.join(', ') || '(미입력)'}`,
    '',
    '[수행 과제]',
    r.task.trim(),
    '',
    '[교육과정 성취기준]',
    r.standards.trim(),
  ];
  if (found.length) {
    lines.push('', '[성취기준별 성취수준 (참고)]');
    found.forEach(s => {
      lines.push(`[${s.code}]`);
      LEVELS.forEach(L => { if ((s.levels || {})[L]) lines.push(`${L}: ${s.levels[L]}`); });
    });
  }
  const els = r.elements.map(el => el.name.trim()).filter(Boolean);
  if (els.length) lines.push('', '[평가 요소]', ...els.map(e => `- ${e}`));
  return lines.join('\n');
}
function aiUserText(i, extra) {
  return `다음 수행평가의 평가기준 A~E를 작성해 주세요.\n\n${aiContext(i)}${extra ? `\n\n[교사의 추가 요청]\n${extra}` : ''}`;
}
/* 채팅에 붙여 넣는 질문: 답을 'A: …' 형식으로 받아 다시 읽을 수 있게 함 */
function aiChatPrompt(i, extra) {
  return `${AI_SYSTEM}\n\n${aiUserText(i, extra)}\n\n답은 아래 형식으로만 써 주세요. 다른 설명은 붙이지 마세요.\nA: (A 수준 평가기준)\nB: (B 수준 평가기준)\nC: (C 수준 평가기준)\nD: (D 수준 평가기준)\nE: (E 수준 평가기준)`;
}
/* 'A: …' 형식의 답 읽기 (여러 줄이면 다음 수준 전까지 이어 붙임) */
function aiParseLevels(text) {
  const out = {};
  let cur = null;
  String(text || '').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*(?:[-*·•]\s*)?\**\s*([A-E])\s*(?:수준)?\s*\**\s*[:：.)]\s*\**\s*(.*)$/);
    if (m) { cur = m[1]; out[cur] = m[2].trim(); } else if (cur && line.trim()) out[cur] += ' ' + line.trim();
  });
  return LEVELS.every(L => out[L]) ? out : null;
}

let aiSdk = null;
function aiLoadSdk() {
  if (!aiSdk) {
    const url = new URL(`js/vendor/anthropic-sdk.mjs?v=${window.APP_VERSION || ''}`, document.baseURI).href;
    aiSdk = import(url).then(m => m.default).catch(e => { aiSdk = null; throw e; });
  }
  return aiSdk;
}

const LEVELS_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(LEVELS.map(L => [L, { type: 'string', description: `${L} 수준 평가기준 (1~3문장)` }])),
  required: [...LEVELS],
  additionalProperties: false,
};

async function aiGenerate(i, apiKey, extra) {
  const Anthropic = await aiLoadSdk();
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  let res;
  try {
    res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: LEVELS_SCHEMA } },
      system: AI_SYSTEM,
      messages: [{ role: 'user', content: aiUserText(i, extra) }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error('이 API 키로는 사용할 수 없습니다. Claude Console에서 키 권한과 결제 상태를 확인해 주세요.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('요청이 많아 잠시 막혔습니다. 1분쯤 뒤에 다시 시도해 주세요.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Claude API에 연결하지 못했습니다. 인터넷 연결(학교 방화벽 포함)을 확인해 주세요.');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude API 오류 (${e.status || '알 수 없음'}): ${e.message}`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('AI가 이 요청에 답하지 않았습니다. 수행 과제·성취기준 내용을 확인한 뒤 다시 시도해 주세요.');
  if (res.stop_reason === 'max_tokens') throw new Error('답이 너무 길어 중간에 끊겼습니다. 다시 시도해 주세요.');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch (e) { data = aiParseLevels(text); }
  if (!data || !LEVELS.every(L => typeof data[L] === 'string' && data[L].trim())) throw new Error('AI 답을 읽지 못했습니다. 다시 시도해 주세요.');
  return Object.fromEntries(LEVELS.map(L => [L, data[L].trim()]));
}

/* ---------- AI 작성 창 ---------- */
function openAiDialog(i) {
  const p = state.perfs[i], r = p.rubric;
  const missing = [!r.task.trim() && '수행 과제', !r.standards.trim() && '교육과정 성취기준'].filter(Boolean);
  if (missing.length) { alert(`AI로 작성하려면 먼저 ${missing.join('와 ')}을(를) 입력해 주세요.`); return; }
  const dlg = $('#picker'), body = $('#pickerBody'), apply = $('#pickerApply');
  let tab = aiGet(AI_TAB) === 'chat' ? 'chat' : 'api', result = null, busy = false;
  $('#pickerTitle').textContent = 'AI로 평가기준 작성';
  $('#pickerHint').textContent = `${p.name || `수행평가 ${i + 1}`} · 수행 과제와 성취기준(성취수준 포함)을 바탕으로 A~E 초안을 만듭니다. 넣기 전에 내용을 확인하고 고쳐 쓰세요.`;
  body.onchange = null;

  const preview = levels => `<div class="ai-result">${LEVELS.map(L => `<div class="ai-lv"><span class="lv-badge">${L}</span><textarea class="input" rows="3" data-ai-lv="${L}">${esc(levels[L])}</textarea></div>`).join('')}</div>`;
  const draw = () => {
    const extra = esc($('#aiExtra') ? $('#aiExtra').value : '');
    const tabs = `<div class="segmented ai-tabs" role="tablist">
        <label><input type="radio" name="aiTab" value="api"${tab === 'api' ? ' checked' : ''}><span>API 키로 바로 작성</span></label>
        <label><input type="radio" name="aiTab" value="chat"${tab === 'chat' ? ' checked' : ''}><span>AI 채팅에 붙여 넣기</span></label></div>`;
    const extraBox = `<label class="field"><span class="label">추가 요청 (선택)</span><textarea class="input" id="aiExtra" rows="2" placeholder="예: 더 간결하게, 모둠 활동의 협력 과정도 드러나게">${extra}</textarea></label>`;
    if (tab === 'api') {
      body.innerHTML = tabs + `
        <label class="field"><span class="label">Claude API 키</span><input class="input" type="password" id="aiKey" autocomplete="off" placeholder="sk-ant-…" value="${esc(aiGet(AI_KEY))}">
          <span class="help">키는 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Claude Console</a>에서 만들 수 있으며 사용량만큼 요금이 듭니다. 키는 이 브라우저에만 저장되고 작성 파일(.json)이나 한글 파일에는 들어가지 않습니다. 공용 컴퓨터에서는 쓰고 나서 [키 지우기]를 누르세요. <button type="button" class="btn-link" id="aiForget">키 지우기</button></span></label>
        ${extraBox}
        <div id="aiOut">${result ? preview(result) + '<button type="button" class="btn btn-secondary small" id="aiRedo">다시 작성</button>' : ''}</div>
        <p class="ai-status" id="aiStatus" role="status"></p>`;
      apply.textContent = result ? '평가기준에 넣기' : 'AI로 작성';
      if (result) $('#aiRedo').onclick = () => { result = null; apply.textContent = 'AI로 작성'; apply.click(); };
      $('#aiForget').onclick = () => { aiSet(AI_KEY, ''); $('#aiKey').value = ''; $('#aiStatus').textContent = '이 브라우저에 저장된 키를 지웠습니다.'; };
    } else {
      body.innerHTML = tabs + `
        <ol class="ai-steps">
          <li>${extraBox}<button type="button" class="btn btn-secondary" id="aiCopy">질문 복사</button>
            <span class="help">복사한 질문을 Claude(claude.ai)·ChatGPT 같은 AI 채팅에 붙여 넣으세요.</span></li>
          <li><label class="field"><span class="label">AI의 답 붙여 넣기</span><textarea class="input" id="aiPaste" rows="6" placeholder="A: …&#10;B: …&#10;C: …&#10;D: …&#10;E: …"></textarea></label></li>
        </ol>
        <p class="ai-status" id="aiStatus" role="status"></p>`;
      apply.textContent = '평가기준에 넣기';
      $('#aiCopy').onclick = () => {
        const text = aiChatPrompt(i, $('#aiExtra').value.trim());
        const done = () => { $('#aiStatus').textContent = '질문을 복사했습니다. AI 채팅에 붙여 넣으세요.'; };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => aiCopyFallback(text, done));
        else aiCopyFallback(text, done);
      };
    }
    body.querySelectorAll('input[name=aiTab]').forEach(x => { x.onchange = () => { tab = x.value; aiSet(AI_TAB, tab); draw(); }; });
  };
  const fill = levels => {
    if (LEVELS.some(L => String(r.levels[L] || '').trim()) && !confirm('지금 적힌 평가기준(A~E)을 바꿀까요?')) return;
    LEVELS.forEach(L => { r.levels[L] = levels[L]; });
    dlg.close();
    render(); saveSoon();
  };
  apply.onclick = async () => {
    if (busy) return;
    const status = $('#aiStatus');
    if (tab === 'chat') {
      const levels = aiParseLevels($('#aiPaste').value);
      if (!levels) { status.textContent = '답에서 A~E를 모두 찾지 못했습니다. "A: …"처럼 수준마다 줄을 바꾼 답을 붙여 넣어 주세요.'; status.className = 'ai-status warn'; return; }
      fill(levels);
      return;
    }
    if (result) {
      fill(Object.fromEntries(LEVELS.map(L => [L, $(`[data-ai-lv="${L}"]`).value.trim()])));
      return;
    }
    const key = $('#aiKey').value.trim();
    if (!key) { status.textContent = 'API 키를 입력해 주세요. 키가 없으면 [AI 채팅에 붙여 넣기]를 쓰세요.'; status.className = 'ai-status warn'; $('#aiKey').focus(); return; }
    aiSet(AI_KEY, key);
    busy = true; apply.disabled = true; status.className = 'ai-status'; status.textContent = 'AI가 평가기준을 쓰고 있습니다… (보통 20초~1분)';
    try {
      result = await aiGenerate(i, key, $('#aiExtra').value.trim());
      draw();
      $('#aiStatus').textContent = '초안이 나왔습니다. 고칠 곳을 고친 뒤 [평가기준에 넣기]를 누르세요.';
      $('#aiStatus').className = 'ai-status ok';
    } catch (e) {
      status.textContent = e.message || String(e);
      status.className = 'ai-status warn';
    } finally {
      busy = false; apply.disabled = false;
    }
  };
  dlg.addEventListener('close', () => { apply.disabled = false; apply.textContent = '적용'; }, { once: true });
  draw();
  dlg.showModal();
}
function aiCopyFallback(text, done) {
  const t = document.createElement('textarea');
  t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); done(); } catch (e) { alert('복사하지 못했습니다. 브라우저 설정을 확인해 주세요.'); }
  t.remove();
}
