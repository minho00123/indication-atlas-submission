const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories={MATCH:'개념 연결 일치',MATCH_HOLD:'보류 행동 일치',MATCH_EXPRESSION:'논리식 일치',REVIEW_REQUIRED:'검토 필요',RULE_UNSUPPORTED:'규칙 미지원',UNREGISTERED:'색인에서 미등록',DIFFERENT_RESULT:'다른 실행 결과'};
const statuses={PASS:'검사 일관',DIFFERENCE:'차이',UNSUPPORTED:'미지원',MANUAL_REVIEW_REQUIRED:'사람 검토',REVIEW_REQUIRED:'검토 필요'};
const expectedLabels={PROVISIONAL_MAP:'개념 연결 · 잠정',LOCAL_CONCEPT:'자체 관리 개념',ROUTE_ENTITY:'별도 개체',SPLIT_EXPRESSION:'OR 조건',HOLD_AMBIGUOUS:'문맥 부족 · 보류',HOLD_SOURCE_CONFLICT:'입력 충돌 · 보류'};
const runLabels={LINKED:'기존 개념에 연결',LOCAL_LINKED:'기존 자체 개념에 연결',ROUTE_ENTITY:'별도 개체로 연결',SPLIT_OR:'OR 조건 보존',HOLD_AMBIGUOUS:'약어 의미 보류',HOLD_DEFINITION:'문서 정의 검토 필요',HOLD_SOURCE_CONFLICT:'입력 충돌 · 보류',HOLD_RELATION_UNREVIEWED:'개념 차이 · 관계 미검토',HOLD_TARGET_NOT_IN_TEXT:'원문 근거 미확인',HOLD_MODIFIED_MENTION:'수식된 이름 · 범위 검토',HOLD_EXPRESSION_UNRESOLVED:'논리식 해소 검토',HOLD_SCOPE_REVIEW:'범위 차이 · 검토',UNREGISTERED:'미등록 표현'};
const evidenceLabels={NO_CUE_DETECTED:'부정·추정 표지 없음',NEGATED:'직접 부정 표지',UNCERTAIN:'직접 추정 표지',UNKNOWN:'원문 주장 범위 미상',UNSUPPORTED_REQUIREMENT:'필수성 해석 미지원',NO_TEXT:'원문 없음',NOT_FOUND:'대상 근거 미확인',UNRESOLVED:'대상 의미 미해소',MIXED:'서로 다른 표지 혼재'};
const tone={MATCH:'',MATCH_HOLD:'',MATCH_EXPRESSION:'',REVIEW_REQUIRED:'amber',RULE_UNSUPPORTED:'amber',UNREGISTERED:'gray',DIFFERENT_RESULT:'amber'};
// Details open as a full-width row under the selected row, so the table columns never reflow.
function detailRow(row,run,mode) {
  const r=run.result;
  return `<tr class="audit-detail-row"><td colspan="4"><div class="audit-detail">
    <section><h3>제공 문맥</h3><blockquote>${esc(row.raw_context)}</blockquote>
      <h3>대조 결과</h3><p>${esc(run.reason)}</p>
      ${mode==='B'?`<h3>제거한 출처</h3><p>별칭 ${run.removed.aliases}개 · 비교 ${run.removed.comparisons}쌍 · 식 ${run.removed.expression}개<br>남은 같은 키워드 출처: ${esc(run.remaining_keyword_sources.join(', ')||'없음')}</p>`:''}</section>
    <section><h3>실행 근거</h3><ul class="audit-reasons">${r.reasons.map(x=>`<li><span class="badge gray">${esc(x.rule)}</span> ${esc(x.message)} <small>${esc(x.code)}</small></li>`).join('')}</ul>
      <h3>규칙 검사</h3><table class="audit-checks"><thead><tr><th>규칙</th><th>상태</th><th>설명</th></tr></thead><tbody>${run.checks.map(c=>`<tr><td>${esc(c.rule)}<br><small>${esc(c.check)}</small></td><td><span class="badge ${c.status==='PASS'?'':c.status==='DIFFERENCE'?'amber':'gray'}">${esc(statuses[c.status])}</span></td><td>${esc(c.reason)}</td></tr>`).join('')}</tbody></table></section>
  </div></td></tr>`;
}
let cached,state={mode:'A',category:'',query:'',page:0};
const perPage=20;
export async function mountAudit(root) {
  root.innerHTML='<p class="loading-state">전체 대조 결과를 불러오고 있습니다.</p>';
  try {
    cached??=Promise.all([...['./downloads/rule-audit.json','./data/rule-support.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('자료를 불러오지 못했습니다.');return r.json();}),fetch('./content/audit-method.html').then(r=>{if(!r.ok)throw Error('대조 방법 자료');return r.text();})]);
    const [audit,support,method]=await cached;if(!root.isConnected)return;
    root.innerHTML=`<div class="audit-heading"><p class="eyebrow">검증과 한계</p><h1>무엇을 확인했고, 무엇이 남았나</h1></div>
    <div class="audit-summary"><section><h2>확인한 것</h2><ul><li>제공 XLSX와 제출 데이터 300행의 일치</li><li>별칭 연결 ${audit.lookup.statuses.PASS??0} / ${audit.lookup.total}건이 검색 색인에 보존됨</li><li>같은 개념·구별할 개념을 다룬 87쌍 비교의 일관성</li><li>저장한 판정을 현재 규칙으로 다시 처리한 대조 A·B·C (아래 표)</li><li>자동 검사: 데이터·빌드(Python), 규칙·후보 비교(JS), 화면 동작(브라우저)</li></ul></section>
      <section><h2>한계</h2><ul><li>300행은 사전과 규칙을 만들 때 쓴 자료입니다. 아래 일치는 독립 정확도가 아닙니다.</li><li>임상 전문가 승인은 0건입니다.</li><li>276행의 문맥은 추가 아형 정보가 없는 템플릿입니다.</li><li>자체 관리 개념(LOCAL)은 외부 코드가 없다는 증명이 아닙니다.</li><li>후속 연구는 <a href="#materials/methodology?section=future">구축 과정 7단계</a>에 있습니다.</li></ul></section></div>
    <div class="audit-downloads"><a href="./downloads/rule-audit.json" download>전체 A/B/C JSON ↓</a><a href="./downloads/rule-audit-A.json" download>A 실행 대조 ↓</a><a href="./downloads/rule-audit-B.json" download>B 출처 제거 대조 ↓</a><a href="./downloads/rule-audit-C.json" download>C 규칙·조건 감사 ↓</a><a href="./downloads/rule-audit-lookup.json" download>별칭 조회 검사 ↓</a></div>
    <div class="audit-mode" role="group" aria-label="대조 조건"><button data-audit-mode="A">A · 전체 사전 기반</button><button data-audit-mode="B">B · 행 출처 제거</button></div><div id="audit-mode-description"></div><div id="audit-counts" class="audit-counts"></div>
    <div class="audit-filters"><label>입력·행 번호 검색 <input id="audit-search" type="search" placeholder="CD, K007 등"></label><button id="audit-reset">전체 행 보기</button><span id="audit-row-count" aria-live="polite"></span></div>
    <div class="table-wrap"><table class="audit-table"><thead><tr><th>입력</th><th>기존 판정</th><th>실행 결과</th><th>대조·상세</th></tr></thead><tbody id="audit-rows"></tbody></table></div><div class="audit-pagination"><button id="audit-prev">이전</button><span id="audit-page"></span><button id="audit-next">다음</button></div>
    <h2>C · 규칙별 적용·조건 감사</h2><p>현재 선택한 A/B 실행의 규칙 검사를 집계합니다. 한 행에 여러 검사가 적용되며, 적용 횟수의 합은 300행과 다릅니다. 통과는 명시한 보존 조건의 일관성을 뜻하며 임상 정답을 뜻하지 않습니다.</p><div class="table-wrap"><table><thead><tr><th>규칙</th><th>적용 행 / 300</th><th>검사 횟수</th><th>검사 상태별 횟수</th></tr></thead><tbody id="audit-rules"></tbody></table></div>
    <h2>G01–G12 실행 지원표</h2><p>실제 계산, 검토 지식 재사용, 사람 판단, 파일 검사를 구별합니다.</p><div class="table-wrap"><table class="support-table"><thead><tr><th>규칙·처리 방식</th><th>현재 구현</th><th>지원 한계</th></tr></thead><tbody>${support.rules.map(r=>`<tr><td><strong>${esc(r.rule)} · ${esc(r.title)}</strong><br>${esc(r.mode)}</td><td>${esc(r.implemented)}</td><td>${esc(r.limits)}</td></tr>`).join('')}</tbody></table></div><section id="audit-method-section" tabindex="-1" class="audit-method">${method}</section>`;
    const $=s=>root.querySelector(s);
    function render() {
      const mode=state.mode,summary=audit.summary[mode];
      root.querySelectorAll('[data-audit-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.auditMode===mode)));
      $('#audit-mode-description').innerHTML=mode==='A'?'<h2>A · 전체 사전 기반 실행 대조</h2><p>검토한 별칭과 관계를 모두 사용해 기존 300행을 다시 처리합니다. 단순 별칭 조회 검사와 다르며, 불일치가 모두 색인 버그라는 뜻은 아닙니다.</p>':'<h2>B · 행 출처 제거 후 재현성·의존성 대조</h2><p>각 행이 출처인 모든 별칭, 해당 행을 포함한 비교 쌍, 해당 행의 식 기록을 제거합니다. 다른 행의 지식·전체 개념 목록·CD/AML 안전 규칙을 포함한 전역 정책은 남습니다. 미등록은 이 조건의 색인에서 찾지 못했다는 뜻입니다. 개념 홀드아웃이나 독립 평가가 아닙니다.</p>';
      $('#audit-counts').innerHTML=Object.entries(summary.categories).map(([key,count])=>`<button data-audit-category="${key}" aria-pressed="${state.category===key}"><strong>${count}<small> / 300행</small></strong><span>${esc(categories[key])}</span></button>`).join('');
      const rows=audit.rows.filter(r=>(!state.category || r[mode].category===state.category) && `${r.source_id} ${r.keyword}`.toLowerCase().includes(state.query.toLowerCase())),pages=Math.max(1,Math.ceil(rows.length/perPage));state.page=Math.min(state.page,pages-1);
      $('#audit-row-count').textContent=`${rows.length} / 300행`;
      $('#audit-rows').innerHTML=rows.slice(state.page*perPage,(state.page+1)*perPage).map(row=>{const run=row[mode],r=run.result;return `<tr data-audit-row="${row.source_id}"><td><a href="#records?record=${row.source_id}">${row.source_id}</a><br><strong>${esc(row.keyword)}</strong></td><td>${esc(expectedLabels[row.expected.decision] ?? row.expected.decision)}<br><code>${esc(row.expected.concept_key??'단일 개념 없음')}</code><br><small>${esc(row.expected.decision)}</small></td><td>${esc(runLabels[r.decision] ?? r.decision)}<br><code>${esc(r.concept_keys.join(' / ')||'단일 개념 미선택')}</code><br><small>원문 표지: ${esc(evidenceLabels[r.target_evidence_status] ?? r.target_evidence_status)} · 적격성 미평가</small></td><td><span class="badge ${tone[run.category] ?? 'gray'}">${esc(categories[run.category])}</span><br><button class="text-button audit-toggle" type="button" aria-expanded="false" data-audit-open="${row.source_id}">상세 보기 ↓</button></td></tr>`;}).join('')||'<tr><td colspan="4">조건에 맞는 행이 없습니다.</td></tr>';
      $('#audit-rows').querySelectorAll('[data-audit-open]').forEach(button=>button.onclick=()=>{
        const tr=button.closest('tr'),next=tr.nextElementSibling,open=next?.classList.contains('audit-detail-row');
        if(open){next.remove();button.setAttribute('aria-expanded','false');button.textContent='상세 보기 ↓';return;}
        const row=audit.rows.find(x=>x.source_id===button.dataset.auditOpen);
        tr.insertAdjacentHTML('afterend',detailRow(row,row[mode],mode));button.setAttribute('aria-expanded','true');button.textContent='상세 닫기 ↑';
      });
      $('#audit-page').textContent=`${state.page+1} / ${pages}`;$('#audit-prev').disabled=state.page===0;$('#audit-next').disabled=state.page===pages-1;
      $('#audit-rules').innerHTML=summary.rules.map(r=>`<tr><td>${r.rule}</td><td>${r.rows} / 300행</td><td>${r.applications}회</td><td>${r.applications?Object.entries(r.statuses).map(([s,n])=>`${esc(statuses[s])} ${n}회`).join(' · '):'행별 실행 없음 · 위 지원표와 빌드 검사 범위 참조'}</td></tr>`).join('');
      $('#audit-counts').querySelectorAll('[data-audit-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.auditCategory;state.page=0;render();});
    }
    root.querySelectorAll('[data-audit-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.auditMode;state.category='';state.page=0;render();});
    $('#audit-search').value=state.query;$('#audit-search').oninput=e=>{state.query=e.target.value;state.page=0;render();};
    $('#audit-reset').onclick=()=>{state.category='';state.query='';state.page=0;$('#audit-search').value='';render();};
    $('#audit-prev').onclick=()=>{state.page--;render();};$('#audit-next').onclick=()=>{state.page++;render();};render();
  } catch(error){if(root.isConnected)root.textContent='대조 자료를 불러오지 못했습니다. 새로고침해 주세요.';}
}
