const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories={MATCH:'개념 연결 일치',MATCH_HOLD:'보류 판단 일치',MATCH_EXPRESSION:'논리식 일치',REVIEW_REQUIRED:'검토 필요',RULE_UNSUPPORTED:'규칙 미지원',UNREGISTERED:'사전에 미등록',DIFFERENT_RESULT:'다른 실행 결과'};
const statuses={PASS:'검사 일관',DIFFERENCE:'차이',UNSUPPORTED:'미지원',MANUAL_REVIEW_REQUIRED:'사람 검토',REVIEW_REQUIRED:'검토 필요'};
const expectedLabels={PROVISIONAL_MAP:'개념 연결 · 잠정',LOCAL_CONCEPT:'자체 관리 개념',ROUTE_ENTITY:'별도 개체',SPLIT_EXPRESSION:'OR 조건',HOLD_AMBIGUOUS:'문맥 부족 · 보류',HOLD_SOURCE_CONFLICT:'입력 충돌 · 보류'};
const runLabels={LINKED:'기존 개념에 연결',LOCAL_LINKED:'기존 자체 개념에 연결',ROUTE_ENTITY:'별도 개체로 연결',SPLIT_OR:'OR 조건 보존',HOLD_AMBIGUOUS:'약어 의미 보류',HOLD_DEFINITION:'문서 정의 검토 필요',HOLD_SOURCE_CONFLICT:'입력 충돌 · 보류',HOLD_RELATION_UNREVIEWED:'개념 차이 · 관계 미검토',HOLD_TARGET_NOT_IN_TEXT:'원문 근거 미확인',HOLD_MODIFIED_MENTION:'수식된 이름 · 범위 검토',HOLD_EXPRESSION_UNRESOLVED:'AND/OR 구성 개념 검토',HOLD_SCOPE_REVIEW:'범위 차이 · 검토',UNREGISTERED:'미등록 표현'};
const evidenceLabels={NO_CUE_DETECTED:'부정·추정 표현을 찾지 못함',NEGATED:'부정 표현 있음',UNCERTAIN:'추정 표현 있음',UNKNOWN:'원문의 언급 방식 미상',UNSUPPORTED_REQUIREMENT:'필수 조건 여부는 판단하지 않음',NO_TEXT:'원문 없음',NOT_FOUND:'원문에서 대상 표현 미확인',UNRESOLVED:'대상 의미 미확정',MIXED:'부정·추정 표현 혼재'};
const tone={MATCH:'',MATCH_HOLD:'',MATCH_EXPRESSION:'',REVIEW_REQUIRED:'amber',RULE_UNSUPPORTED:'amber',UNREGISTERED:'gray',DIFFERENT_RESULT:'amber'};
// Plain wording for the fixed support-table labels; the stored file keeps its original terms.
const plain=s=>String(s??'').replaceAll('무결성 검사','데이터 변경·누락 검사').replace(/^다의 약어$/,'여러 뜻을 가진 약어').replace(/^논리식 보존$/,'AND/OR 조건 보존');
// Details open as a full-width row under the selected row, so the table columns never reflow.
function detailRow(row,run) {
  const r=run.result;
  return `<tr class="audit-detail-row"><td colspan="4"><div class="audit-detail">
    <section><h3>제공 문맥</h3><blockquote>${esc(row.raw_context)}</blockquote>
      <h3>비교 결과</h3><p>${esc(run.reason)}</p>
    </section>
    <section><h3>실행 근거</h3><ul class="audit-reasons">${r.reasons.map(x=>`<li><span class="badge gray">${esc(x.rule)}</span> ${esc(x.message)} <small>${esc(x.code)}</small></li>`).join('')}</ul>
      <h3>규칙 검사</h3><table class="audit-checks"><thead><tr><th>규칙</th><th>상태</th><th>설명</th></tr></thead><tbody>${run.checks.map(c=>`<tr><td>${esc(c.rule)}<br><small>${esc(c.check)}</small></td><td><span class="badge ${c.status==='PASS'?'':c.status==='DIFFERENCE'?'amber':'gray'}">${esc(statuses[c.status])}</span></td><td>${esc(c.reason)}</td></tr>`).join('')}</tbody></table></section>
  </div></td></tr>`;
}
let cached,state={mode:'A',category:'',query:'',page:0};
const perPage=20;
export async function mountAudit(root) {
  root.innerHTML='<p class="loading-state">검증 결과를 불러오고 있습니다.</p>';
  try {
    cached??=Promise.all([...['./downloads/rule-audit.json','./data/rule-support.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('자료를 불러오지 못했습니다.');return r.json();}),fetch('./content/audit-method.html').then(r=>{if(!r.ok)throw Error('대조 방법 자료');return r.text();})]);
    const [audit,support,method]=await cached;if(!root.isConnected)return;
    root.innerHTML=`<div class="audit-heading"><p class="eyebrow">검증과 한계</p><h1>무엇을 확인했고, 무엇이 남았나</h1></div>
    <div class="audit-summary"><section><h2>확인한 것</h2><ul><li>제공 XLSX와 제출 데이터 300행의 일치</li><li>보류 2건과 OR 표현 1건을 제외한 297개 항목을 287개 개념 그룹에 연결</li><li>별칭 연결 ${audit.lookup.statuses.PASS??0} / ${audit.lookup.total}건이 검색에서 그대로 찾아짐</li><li>같은 개념·구별할 개념을 다룬 87쌍 비교의 일관성</li><li>300건을 현재 사전으로 다시 실행해 저장한 판정과 같은 개념에 연결되는지 확인 (아래 표). 추가 조건·세부 사유는 판단 규칙 검사에서 따로 확인합니다.</li><li>자동 검사: 데이터·빌드(Python), 규칙·후보 비교(JS), 화면 동작(브라우저)</li></ul></section>
      <section><h2>한계</h2><ul><li>300행은 사전과 규칙을 만들 때 쓴 자료입니다. 아래 일치는 독립 정확도가 아닙니다.</li><li>임상 전문가 승인은 0건입니다.</li><li>제공 문맥 300행 중 276행은 추가 정보가 없는 정형 문장이라, 문맥에 따른 판단은 24행에서만 시험됐습니다.</li><li>자체 관리 개념(LOCAL)은 외부 코드가 없다는 증명이 아닙니다.</li><li>현재 자동 처리는 등록된 이름·별칭과 정해진 규칙을 사용합니다. 미등록 표현은 후보 조회와 추가 검토가 필요합니다.</li><li>후속 연구는 <a href="#materials/methodology?section=future">구축 과정 7단계</a>에 있습니다.</li></ul></section></div>
    <div class="audit-downloads"><a href="./downloads/rule-audit-A.json" download>다시 실행한 결과 ↓</a><a href="./downloads/rule-audit-C.json" download>판단 규칙 검사 ↓</a><a href="./downloads/rule-audit-lookup.json" download>별칭 조회 검사 ↓</a><a href="./downloads/rule-audit.json" download>전체 검증 JSON(상세 자료 포함) ↓</a></div>
    <div id="audit-mode-description"><h2>현재 사전으로 다시 실행한 결과</h2><p>사전 구축에 사용한 300건을 다시 실행한 결과입니다. 같은 개념에 연결되는지 확인한 검사이며, 새로운 자료에 대한 정확도 평가는 아닙니다.</p></div><div id="audit-counts" class="audit-counts"></div>
    <div class="audit-filters"><label>입력·행 번호 검색 <input id="audit-search" type="search" placeholder="CD, K007 등"></label><button id="audit-reset">전체 행 보기</button><span id="audit-row-count" aria-live="polite"></span></div>
    <div class="table-wrap"><table class="audit-table"><thead><tr><th>입력</th><th>기존 판정</th><th>다시 실행한 결과</th><th>비교·상세</th></tr></thead><tbody id="audit-rows"></tbody></table></div><div class="audit-pagination"><button id="audit-prev">이전</button><span id="audit-page"></span><button id="audit-next">다음</button></div>
    <h2>판단 규칙 검사</h2><p>위 실행에서 규칙별 검사를 집계합니다. 한 행에 여러 검사가 적용되며, 적용 횟수의 합은 300행과 다릅니다. 통과는 명시한 보존 조건의 일관성을 뜻하며 임상 정답을 뜻하지 않습니다.</p><div class="table-wrap"><table><thead><tr><th>규칙</th><th>적용 행 / 300</th><th>검사 횟수</th><th>검사 상태별 횟수</th></tr></thead><tbody id="audit-rules"></tbody></table></div>
    <h2>G01–G12 실행 지원표</h2><p>규칙으로 계산하는 부분, 사람이 검토한 결과를 재사용하는 부분, 사람 판단, 파일 검사를 구별합니다.</p><div class="table-wrap"><table class="support-table"><thead><tr><th>규칙·처리 방식</th><th>현재 구현</th><th>지원 한계</th></tr></thead><tbody>${support.rules.map(r=>`<tr><td><strong>${esc(r.rule)} · ${esc(plain(r.title))}</strong><br>${esc(plain(r.mode))}</td><td>${esc(r.implemented)}</td><td>${esc(r.limits)}</td></tr>`).join('')}</tbody></table></div><section id="audit-method-section" tabindex="-1" class="audit-method">${method}</section>`;
    const $=s=>root.querySelector(s);
    function render() {
      const mode=state.mode,summary=audit.summary[mode];
      $('#audit-counts').innerHTML=Object.entries(summary.categories).map(([key,count])=>`<button data-audit-category="${key}" aria-pressed="${state.category===key}"><strong>${count}<small> / 300행</small></strong><span>${esc(categories[key])}</span></button>`).join('');
      const rows=audit.rows.filter(r=>(!state.category || r[mode].category===state.category) && `${r.source_id} ${r.keyword}`.toLowerCase().includes(state.query.toLowerCase())),pages=Math.max(1,Math.ceil(rows.length/perPage));state.page=Math.min(state.page,pages-1);
      $('#audit-row-count').textContent=`${rows.length} / 300행`;
      $('#audit-rows').innerHTML=rows.slice(state.page*perPage,(state.page+1)*perPage).map(row=>{const run=row[mode],r=run.result;return `<tr data-audit-row="${row.source_id}"><td><a href="#records?record=${row.source_id}">${row.source_id}</a><br><strong>${esc(row.keyword)}</strong></td><td>${esc(expectedLabels[row.expected.decision] ?? row.expected.decision)}<br><code>${esc(row.expected.concept_key??'단일 개념 없음')}</code><br><small>${esc(row.expected.decision)}</small></td><td>${esc(runLabels[r.decision] ?? r.decision)}<br><code>${esc(r.concept_keys.join(' / ')||'단일 개념 미선택')}</code><br><small>원문 표현: ${esc(evidenceLabels[r.target_evidence_status] ?? r.target_evidence_status)} · 조건 충족 여부 미평가</small></td><td><span class="badge ${tone[run.category] ?? 'gray'}">${esc(categories[run.category])}</span><br><button class="text-button audit-toggle" type="button" aria-expanded="false" data-audit-open="${row.source_id}">상세 보기 ↓</button></td></tr>`;}).join('')||'<tr><td colspan="4">조건에 맞는 행이 없습니다.</td></tr>';
      $('#audit-rows').querySelectorAll('[data-audit-open]').forEach(button=>button.onclick=()=>{
        const tr=button.closest('tr'),next=tr.nextElementSibling,open=next?.classList.contains('audit-detail-row');
        if(open){next.remove();button.setAttribute('aria-expanded','false');button.textContent='상세 보기 ↓';return;}
        const row=audit.rows.find(x=>x.source_id===button.dataset.auditOpen);
        tr.insertAdjacentHTML('afterend',detailRow(row,row[mode]));button.setAttribute('aria-expanded','true');button.textContent='상세 닫기 ↑';
      });
      $('#audit-page').textContent=`${state.page+1} / ${pages}`;$('#audit-prev').disabled=state.page===0;$('#audit-next').disabled=state.page===pages-1;
      $('#audit-rules').innerHTML=summary.rules.map(r=>`<tr><td>${r.rule}</td><td>${r.rows} / 300행</td><td>${r.applications}회</td><td>${r.applications?Object.entries(r.statuses).map(([s,n])=>`${esc(statuses[s])} ${n}회`).join(' · '):'행별 실행 없음 · 위 지원표와 빌드 검사 범위 참조'}</td></tr>`).join('');
      $('#audit-counts').querySelectorAll('[data-audit-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.auditCategory;state.page=0;render();});
    }
    $('#audit-search').value=state.query;$('#audit-search').oninput=e=>{state.query=e.target.value;state.page=0;render();};
    $('#audit-reset').onclick=()=>{state.category='';state.query='';state.page=0;$('#audit-search').value='';render();};
    $('#audit-prev').onclick=()=>{state.page--;render();};$('#audit-next').onclick=()=>{state.page++;render();};render();
  } catch(error){if(root.isConnected)root.textContent='검증 자료를 불러오지 못했습니다. 새로고침해 주세요.';}
}
