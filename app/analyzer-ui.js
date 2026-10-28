import {createAnalyzer} from './analyzer.mjs';
import {checkAnalyzerCase} from './analyzer-checks.mjs';

const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={LINKED:'기존 개념에 연결',LOCAL_LINKED:'기존 자체 개념에 연결',ROUTE_ENTITY:'별도 개체로 연결',SPLIT_OR:'OR 조건 보존',HOLD_AMBIGUOUS:'약어 의미 보류',HOLD_DEFINITION:'문서 정의 검토 필요',HOLD_SOURCE_CONFLICT:'입력 충돌 · 보류',HOLD_SCOPE_REVIEW:'범위 차이 · 검토 필요',UNREGISTERED:'미등록 표현 · 검토 필요'};
const assertions={AFFIRMED:'명시 언급',NEGATED:'직접 부정 표지',UNCERTAIN:'직접 추정 표지'};
const types={disease_status:'질환 상태',treatment_history:'이전 치료',chronicity:'급성·만성',biomarker:'바이오마커',duration:'기간 표현'};
const samples=[
  {label:'정의 없는 CD',keyword:'CD',text:'Patients with CD.'},
  {label:'크론병으로 정의',keyword:'CD',text:'Crohn disease (CD) is the target. Patients with CD are included.'},
  {label:'셀리악병으로 변경',keyword:'CD',text:'Celiac disease (CD) is the target. Patients with CD are included.'},
  {label:'새 약어 T2D',keyword:'T2D',text:'Type 2 diabetes (T2D) is mentioned.'},
  {label:'질환명과 재발·치료',keyword:'Acute myeloid leukemia',text:'Relapsed acute myeloid leukemia after prior therapy.'},
  {label:'키워드·원문 충돌',keyword:'eczema',text:'Adults with plaque psoriasis.'},
  {label:'부정 표현',keyword:'NSCLC',text:'No NSCLC is reported.'}
];
let remembered={keyword:samples[0].keyword,text:samples[0].text,report:null};
const conceptLink=c=>`<a class="source-link" href="#dictionary?concept=${encodeURIComponent(c.concept_key)}">${esc(c.preferred_name)} · 기존 사전 ↗</a>`;

function sourceHTML(report) {
  const text=report.input.text;let cursor=0,html='';
  for(const m of report.mentions) {
    html+=esc(text.slice(cursor,m.start))+`<mark class="mention-${m.assertion.toLowerCase()}" title="${esc(assertions[m.assertion])}">${esc(text.slice(m.start,m.end))}</mark>`;
    cursor=m.end;
  }
  return html+esc(text.slice(cursor));
}

function attributesHTML(items) {
  return items.map(a=>`<div class="runtime-attribute"><span class="badge gray">${esc(types[a.type])}</span><strong>${esc(a.value)}</strong><q>${esc(a.text)}</q><small>원문 [${a.start}:${a.end}] · ${esc(assertions[a.assertion])}${a.quantity?` · ${a.quantity.amount} ${esc(a.quantity.unit)} / ${esc(a.quantity.comparator)}`:''}</small></div>`).join('');
}

function reportHTML(r) {
  const held=r.decision.startsWith('HOLD') || r.decision==='UNREGISTERED';
  return `<div class="runtime-result-heading"><div><p class="eyebrow">입력한 원문에서 지금 계산한 결과</p><h2>시제품 판정</h2></div><span class="badge ${held?'amber':''}" id="analyzer-decision">${esc(labels[r.decision])}</span></div>
    <div class="runtime-concepts">${r.concepts.length?r.concepts.map(c=>`<div>${conceptLink(c)}<code>${esc(c.concept_key)}</code></div>`).join(''):'<p>선택한 단일 개념이 없습니다. 아래 후보와 보류 이유를 확인해 주세요.</p>'}</div>
    <ol class="runtime-reasons">${r.reasons.map(item=>`<li><span class="badge gray">${esc(item.rule)}</span> ${esc(item.message)}</li>`).join('')}</ol>
    ${r.warnings.map(message=>`<p class="runtime-note">${esc(message)}</p>`).join('')}
    <h3>입력 원문과 인식한 구간</h3><p class="source-note">표시는 개념의 언급과 직접적인 부정·추정 표현을 구별합니다. 환자의 진단 여부를 확정하지 않습니다.</p>
    <blockquote class="runtime-source">${r.input.text?sourceHTML(r):'입력 원문이 없어 등록된 대상 표현만 대조했습니다.'}</blockquote>
    <div class="table-wrap"><table class="runtime-mentions"><thead><tr><th>원문 구간</th><th>개념·후보</th><th>연결 근거</th><th>언급 표지</th></tr></thead><tbody>${r.mentions.map(m=>`<tr><td><strong>${esc(m.text)}</strong><br><small>[${m.start}:${m.end}]</small></td><td>${m.concept?conceptLink(m.concept):m.candidate_keys.map(key=>`<code>${esc(key)}</code>`).join('<br>') || '확인할 수 없음'}</td><td>${m.basis==='DOCUMENT_DEFINITION'?'문서 내 약어 정의':'검토한 이름·별칭'}<br><small>${esc(m.status)}</small></td><td>${esc(assertions[m.assertion])}</td></tr>`).join('') || '<tr><td colspan="4">현재 사전 범위에서 인식한 원문 표현이 없습니다.</td></tr>'}</tbody></table></div>
    ${r.abbreviation_definitions.length?`<h3>문서에서 찾은 약어 정의</h3><div class="runtime-definitions">${r.abbreviation_definitions.map(d=>`<div><strong>${esc(d.short_form)} → ${esc(d.long_form)}</strong><small>${esc(d.status)} · 원문 [${d.long_start}:${d.long_end}] / [${d.short_start}:${d.short_end}]</small><p>${d.status==='RESOLVED'?'등록된 긴 이름에 연결했습니다. 이 문서 밖으로 새 별칭을 전파하지 않습니다.':'긴 이름을 확인하지 못했거나 정의가 충돌합니다. 한쪽으로 추측하지 않습니다.'}</p></div>`).join('')}</div>`:''}
    <h3>질환명 구성 요소와 원문별 추가 조건</h3><div class="runtime-conditions"><section><h4>질환명 구성 요소</h4>${attributesHTML(r.name_components) || '<p>지원하는 패턴에서 찾은 이름 구성 요소가 없습니다.</p>'}</section><section><h4>원문별 추가 조건 구간</h4>${attributesHTML(r.attributes) || '<p>지원하는 패턴에서 찾은 추가 조건이 없습니다. 해당 조건이 없다고 확정한 뜻은 아닙니다.</p>'}</section></div>
    <p class="source-note">추가 조건은 문서 구간으로 보존합니다. 여러 질환이 나오면 어느 질환의 조건인지 자동 배정하지 않습니다. 기존 300건의 조건을 새 원문에 복사하지 않습니다.</p>
    ${r.logical_relations.length?`<h3>명시된 논리 관계</h3><p>${r.logical_relations.map(l=>`${esc(l.operator)} · ${l.concept_keys.map(esc).join(' / ')}`).join('<br>')}</p>`:''}
    <details class="runtime-json"><summary>분석 JSON과 원문 구간 확인</summary><pre>${esc(JSON.stringify(r,null,2))}</pre></details>`;
}

export function mountAnalyzer(root,catalog) {
  const analyzer=createAnalyzer(catalog);let current=remembered.report;
  root.innerHTML=`<div class="container"><div class="page-heading"><p class="eyebrow">새 입력에 적용하는 규칙 시제품</p><h1>새 문장 분석</h1><p>대상 표현과 원문을 입력해 약어 정의, 개념 후보, 추가 조건을 직접 확인하세요. 입력 문장은 브라우저에서만 처리합니다.</p></div>
    <div class="runtime-scope"><strong>현재 구현 범위</strong><span>기존 ${catalog.metadata.concepts}개 개념·검토한 별칭, 문서 내 긴 이름–약어 정의, 일부 조건 구간을 처리합니다. 일반적인 의학적 의미 추론이나 독립 정확도 검증을 마친 분류기는 아닙니다.</span></div>
    <div class="runtime-examples" aria-label="분석 예제">${samples.map((s,i)=>`<button class="example-chip" data-runtime-example="${i}">${esc(s.label)}</button>`).join('')}</div>
    <div class="runtime-layout"><section class="panel runtime-input"><h2>새 입력</h2><form id="analyzer-form"><label for="analyzer-keyword">대상 표현</label><input id="analyzer-keyword" type="text" maxlength="200" required autocomplete="off"><label for="analyzer-text">원문 문장·문단</label><textarea id="analyzer-text" rows="8" maxlength="10000" spellcheck="false"></textarea><p class="source-note">원문은 선택 입력입니다. 뜻을 구별할 근거가 부족하면 보류합니다.</p><button class="runtime-submit" type="submit">이 원문 분석하기</button><p id="analyzer-error" role="alert"></p></form><button id="download-analysis" class="subtle-button">분석 JSON 내려받기 ↓</button>
      <details class="runtime-method"><summary>판정 규칙과 지원 범위</summary><ol><li>등록된 이름·별칭을 단어 경계와 긴 표현 우선으로 찾습니다.</li><li>문서의 긴 이름(약어)을 기존 개념과 대조합니다. 긴 이름을 확인하지 못하거나 정의가 충돌하면 보류합니다.</li><li>다의 약어를 다른 질환의 단순 동시 언급만으로 해소하지 않습니다.</li><li>등록된 상하위 비교가 있으면 범위 검토로, 다른 의미이면 입력 충돌로 표시합니다.</li><li>Metastatic·Relapsed·Refractory·prior therapy와 일부 기간·이름 구성 요소만 처리합니다.</li></ol><p>표현이 더 복잡하거나 증상만으로 의미를 추론해야 하는 경우는 지원하지 않습니다. 미등록 개념을 자동 생성하지 않습니다.</p><a href="#materials/analyzer">구현·검사·한계 문서 ↗</a></details></section>
    <section id="analyzer-result" class="panel runtime-output" aria-label="새 원문 분석 결과" aria-live="polite"></section></div>
    <section class="panel runtime-checks"><div><h2>개발·반례 검사</h2><p>작성자가 구성한 신규 입력에서 의도한 규칙이 작동하는지 실행합니다. 독립된 임상 정답셋의 정확도 평가는 아닙니다.</p></div><button id="run-analyzer-checks" class="runtime-submit">검사 실행</button><div id="analyzer-check-results" aria-live="polite"></div></section></div>`;
  const keyword=root.querySelector('#analyzer-keyword'),text=root.querySelector('#analyzer-text');
  keyword.value=remembered.keyword;text.value=remembered.text;
  function run() {
    const error=root.querySelector('#analyzer-error');error.textContent='';
    try {
      current=analyzer.analyze({keyword:keyword.value,text:text.value});remembered={keyword:keyword.value,text:text.value,report:current};
      root.querySelector('#analyzer-result').innerHTML=reportHTML(current);
    } catch(e) { error.textContent=e.message; }
  }
  root.querySelector('#analyzer-form').addEventListener('submit',event=>{event.preventDefault();run();});
  root.querySelectorAll('[data-runtime-example]').forEach(button=>button.addEventListener('click',()=>{
    const sample=samples[Number(button.dataset.runtimeExample)];keyword.value=sample.keyword;text.value=sample.text;run();
    root.querySelectorAll('[data-runtime-example]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  }));
  root.querySelector('#download-analysis').addEventListener('click',()=>{
    if(!current)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(current,null,2)+'\n'],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='indication-analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  root.querySelector('#run-analyzer-checks').addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try {
      const response=await fetch('./data/analyzer-cases.json');if(!response.ok)throw Error('검사 자료를 불러오지 못했습니다.');
      const fixtures=await response.json(),checks=fixtures.cases.map(c=>checkAnalyzerCase(analyzer,c)),passed=checks.filter(c=>c.passed).length;
      if(!root.isConnected)return;
      root.querySelector('#analyzer-check-results').innerHTML=`<p class="runtime-check-count">개발·반례 검사 ${checks.length}건 중 ${passed}건 통과</p><p class="source-note">독립 정확도나 일반화 성능을 뜻하지 않습니다. 문서 정의·보류·정보 보존·원문 구간 등의 실행 결과입니다.</p><details><summary>항목별 기대 결과와 실제 판정</summary><div class="table-wrap"><table><thead><tr><th>검사</th><th>기대 판정</th><th>실제 판정</th><th>결과</th></tr></thead><tbody>${checks.map((c,i)=>`<tr><td>${esc(c.id)}</td><td>${esc(fixtures.cases[i].expected.decision)}</td><td>${esc(c.result.decision)}</td><td>${c.passed?'통과':esc(c.errors.join(' / '))}</td></tr>`).join('')}</tbody></table></div></details>`;
    } catch(e) { if(root.isConnected)root.querySelector('#analyzer-check-results').textContent=e.message; }
    finally { button.disabled=false; }
  });
  if(current)root.querySelector('#analyzer-result').innerHTML=reportHTML(current);else run();
}
