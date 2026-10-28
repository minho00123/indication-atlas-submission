const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories={MATCH:'개념 연결 일치',MATCH_HOLD:'보류 행동 일치',MATCH_EXPRESSION:'논리식 일치',REVIEW_REQUIRED:'검토 필요',RULE_UNSUPPORTED:'규칙 미지원',UNREGISTERED:'색인에서 미등록',DIFFERENT_RESULT:'다른 실행 결과'};
const statuses={PASS:'검사 일관',DIFFERENCE:'차이',UNSUPPORTED:'미지원',MANUAL_REVIEW_REQUIRED:'사람 검토',REVIEW_REQUIRED:'검토 필요'};
let cached,state={mode:'A',category:'',query:'',page:0};
const perPage=20;
export async function mountAudit(root) {
  root.innerHTML='<p class="loading-state">전체 대조 결과를 불러오고 있습니다.</p>';
  try {
    cached??=Promise.all(['./downloads/rule-audit.json','./data/rule-support.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('자료를 불러오지 못했습니다.');return r.json();}));
    const [audit,support]=await cached;if(!root.isConnected)return;
    root.innerHTML=`<div class="audit-heading"><p class="eyebrow">전체 입력의 실행·의존성 대조</p><h1>규칙 적용과 남은 검토</h1><p>기존 판정과 실행 결과의 차이를 모두 공개합니다. 300행은 사전과 정책을 만들 때 사용한 개발 자료이며 독립 정확도 평가가 아닙니다.</p></div>
    <div class="audit-lookup"><strong>별칭 조회 무결성: ${audit.lookup.statuses.PASS??0} / ${audit.lookup.total}개 연결 보존</strong><p>등록한 term→concept 연결의 색인 검사입니다. 원문 해석 성능과 구별합니다.</p></div>
    <div class="audit-downloads"><a href="./downloads/rule-audit.json" download>전체 A/B/C JSON ↓</a><a href="./downloads/rule-audit-A.json" download>A 실행 대조 ↓</a><a href="./downloads/rule-audit-B.json" download>B 출처 제거 대조 ↓</a><a href="./downloads/rule-audit-C.json" download>C 규칙·조건 감사 ↓</a><a href="./downloads/rule-audit-lookup.json" download>별칭 조회 검사 ↓</a></div>
    <div class="audit-mode" role="group" aria-label="대조 조건"><button data-audit-mode="A">A · 전체 사전 기반</button><button data-audit-mode="B">B · 행 출처 제거</button></div><div id="audit-mode-description"></div><div id="audit-counts" class="audit-counts"></div>
    <div class="audit-filters"><label>입력·행 번호 검색 <input id="audit-search" type="search" placeholder="CD, K007 등"></label><button id="audit-reset">전체 행 보기</button><span id="audit-row-count" aria-live="polite"></span></div>
    <div class="table-wrap"><table class="audit-table"><thead><tr><th>입력</th><th>기존 판정</th><th>실행 결과</th><th>대조·상세</th></tr></thead><tbody id="audit-rows"></tbody></table></div><div class="audit-pagination"><button id="audit-prev">이전</button><span id="audit-page"></span><button id="audit-next">다음</button></div>
    <h2>C · 규칙별 적용·조건 감사</h2><p>현재 선택한 A/B 실행의 규칙 검사를 집계합니다. 한 행에 여러 검사가 적용되며, 적용 횟수의 합은 300행과 다릅니다. 통과는 명시한 보존 조건의 일관성을 뜻하며 임상 정답을 뜻하지 않습니다.</p><div class="table-wrap"><table><thead><tr><th>규칙</th><th>적용 행 / 300</th><th>검사 횟수</th><th>검사 상태별 횟수</th></tr></thead><tbody id="audit-rules"></tbody></table></div>
    <h2>G01–G12 실행 지원표</h2><p>실제 계산, 검토 지식 재사용, 사람 판단, 파일 검사를 구별합니다.</p><div class="table-wrap"><table class="support-table"><thead><tr><th>규칙·처리 방식</th><th>현재 구현</th><th>지원 한계</th></tr></thead><tbody>${support.rules.map(r=>`<tr><td><strong>${esc(r.rule)} · ${esc(r.title)}</strong><br>${esc(r.mode)}</td><td>${esc(r.implemented)}</td><td>${esc(r.limits)}</td></tr>`).join('')}</tbody></table></div><p><a href="#materials/audit-method">대조 설계·실행 방법·해석 한계 ↗</a></p>`;
    const $=s=>root.querySelector(s);
    function render() {
      const mode=state.mode,summary=audit.summary[mode];
      root.querySelectorAll('[data-audit-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.auditMode===mode)));
      $('#audit-mode-description').innerHTML=mode==='A'?'<h2>A · 전체 사전 기반 실행 대조</h2><p>검토한 별칭과 관계를 모두 사용해 기존 300행을 다시 처리합니다. 단순 별칭 조회 검사와 다르며, 불일치가 모두 색인 버그라는 뜻은 아닙니다.</p>':'<h2>B · 행 출처 제거 후 재현성·의존성 대조</h2><p>각 행이 출처인 모든 별칭, 해당 행을 포함한 비교 쌍, 해당 행의 식 기록을 제거합니다. 다른 행의 지식·전체 개념 목록·CD/AML 안전 규칙을 포함한 전역 정책은 남습니다. 미등록은 이 조건의 색인에서 찾지 못했다는 뜻입니다. 개념 홀드아웃이나 독립 평가가 아닙니다.</p>';
      $('#audit-counts').innerHTML=Object.entries(summary.categories).map(([key,count])=>`<button data-audit-category="${key}" aria-pressed="${state.category===key}"><strong>${count}<small> / 300행</small></strong><span>${esc(categories[key])}</span></button>`).join('');
      const rows=audit.rows.filter(r=>(!state.category || r[mode].category===state.category) && `${r.source_id} ${r.keyword}`.toLowerCase().includes(state.query.toLowerCase())),pages=Math.max(1,Math.ceil(rows.length/perPage));state.page=Math.min(state.page,pages-1);
      $('#audit-row-count').textContent=`${rows.length} / 300행`;
      $('#audit-rows').innerHTML=rows.slice(state.page*perPage,(state.page+1)*perPage).map(row=>{const run=row[mode],r=run.result;return `<tr><td><a href="#records?record=${row.source_id}">${row.source_id}</a><br><strong>${esc(row.keyword)}</strong></td><td>${esc(row.expected.decision)}<br><code>${esc(row.expected.concept_key??'단일 개념 없음')}</code></td><td>${esc(r.decision)}<br><code>${esc(r.concept_keys.join(' / ')||'단일 개념 미선택')}</code><br><small>원문 표지: ${esc(r.target_evidence_status)} · 적격성 미평가</small></td><td><strong>${esc(categories[run.category])}</strong><details><summary>결과·규칙 감사</summary><p>${esc(run.reason)}</p><blockquote>${esc(row.raw_context)}</blockquote>${mode==='B'?`<p>제거: 별칭 ${run.removed.aliases}개 · 비교 ${run.removed.comparisons}쌍 · 식 ${run.removed.expression}개<br>남은 동일 키워드 출처: ${esc(run.remaining_keyword_sources.join(', ')||'없음')}</p>`:''}<ul>${r.reasons.map(x=>`<li>${esc(x.rule)} / ${esc(x.code)}: ${esc(x.message)}</li>`).join('')}</ul><ul>${run.checks.map(c=>`<li>${esc(c.rule)} / ${esc(c.check)} · ${esc(statuses[c.status])}: ${esc(c.reason)}</li>`).join('')}</ul></details></td></tr>`;}).join('')||'<tr><td colspan="4">조건에 맞는 행이 없습니다.</td></tr>';
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
