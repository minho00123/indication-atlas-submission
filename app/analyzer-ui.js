import {createAnalyzer} from './analyzer.mjs';
import {checkAnalyzerCase} from './analyzer-checks.mjs';
import {fetchCandidates,compareCandidates} from './candidates.mjs';
import {BATCH_FORMAT,BATCH_LIMITS,parseBatch,runBatch,nextSteps,searchLinks,needsReview,batchCSV} from './batch.mjs';

const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={LINKED:'기존 개념에 연결',LOCAL_LINKED:'기존 자체 개념에 연결',ROUTE_ENTITY:'별도 개체로 연결',SPLIT_OR:'OR 조건 보존',HOLD_AMBIGUOUS:'약어 의미 보류',HOLD_DEFINITION:'문서 정의 검토 필요',HOLD_SOURCE_CONFLICT:'입력 충돌 · 보류',HOLD_RELATION_UNREVIEWED:'개념 차이 · 관계 미검토',HOLD_TARGET_NOT_IN_TEXT:'원문 근거 미확인',HOLD_MODIFIED_MENTION:'수식된 이름 · 범위 검토 필요',HOLD_EXPRESSION_UNRESOLVED:'논리식 · 해소 검토 필요',HOLD_SCOPE_REVIEW:'범위 차이 · 검토 필요',UNREGISTERED:'미등록 표현 · 검토 필요'};
const assertions={NO_CUE_DETECTED:'부정·추정 표지 없음',UNKNOWN:'원문 주장 범위 미상',NEGATED:'직접 부정 표지',UNCERTAIN:'직접 추정 표지',UNSUPPORTED_REQUIREMENT:'필수성 해석 미지원'};
const types={disease_status:'질환 상태',treatment_history:'이전 치료',chronicity:'급성·만성',biomarker:'바이오마커',duration:'기간 표현',severity:'중증도',treatment_response:'치료 반응',etiology:'원인 표현',treatment_requirement:'치료 필요 표현',disease_activity:'질환 활성도',control_status:'조절 상태',stage:'병기',extent:'진행 범위'};
const samples=[
  {label:'정의 없는 CD',keyword:'CD',text:'Patients with CD.'},
  {label:'크론병으로 정의',keyword:'CD',text:'Crohn disease (CD) is the target. Patients with CD are included.'},
  {label:'셀리악병으로 변경',keyword:'CD',text:'Celiac disease (CD) is the target. Patients with CD are included.'},
  {label:'새 약어 T2D',keyword:'T2D',text:'Type 2 diabetes (T2D) is mentioned.'},
  {label:'질환명과 재발·치료',keyword:'Acute myeloid leukemia',text:'Relapsed acute myeloid leukemia after prior therapy.'},
  {label:'키워드·원문 충돌',keyword:'eczema',text:'Adults with plaque psoriasis.'},
  {label:'MDS OR AML',keyword:'MDS/AML',text:'Patients with MDS or AML; either diagnosis is eligible.'},
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
  return items.map(a=>`<div class="runtime-attribute"><span class="badge gray">${esc(types[a.type])}</span><strong>${esc(a.value)}</strong><q>${esc(a.text)}</q><small>원문 [${a.start}:${a.end}] · ${esc(assertions[a.assertion])}${a.quantity?` · ${a.quantity.amount} ${esc(a.quantity.unit)} / ${esc(a.quantity.comparator)}`:''}</small><small>소유: ${a.ownership.status==='UNKNOWN'?'미상':esc(a.ownership.concept_key ?? '이름 구간')} · 범위: ${esc({DURATION_OF_NEGATED_MENTION:'부정된 질환 언급의 기간',MENTION_CONTEXT:'해당 언급의 문맥',UNASSIGNED:'적용 대상 미상'}[a.scope.kind]??a.scope.kind)} · 소유 언급 표지: ${esc(assertions[a.scope.mention_assertion] ?? '미상')}</small></div>`).join('');
}

const batchSample=['T2DM','CD','CD | Crohn disease (CD) is mentioned. Patients with CD.','Asthma | Patients with severe asthma.','Multiple myeloma | Patients with smoldering multiple myeloma.','Psoriasis | Patients who do not have psoriasis.','Fabry disease | Adults with Fabry disease.','| target missing'].join('\n');
function nextStepsHTML(r) {
  const items=nextSteps(r);if(!items.length)return '';
  const links=searchLinks(r.input.keyword);
  return `<div class="next-steps"><h3>다음 확인 단계</h3><ol>${items.map(s=>`<li><span class="badge gray">${esc(s.rule)}</span> ${esc(s.text)}</li>`).join('')}</ol>
    ${r.decision==='UNREGISTERED'?`<div class="compare-entry"><button class="runtime-submit" type="button" data-compare-term="${esc(r.input.keyword)}">MONDO·NCIt·MeSH에서 후보 비교하기</button><small>누르면 대상 표현만 EBI OLS(MONDO·NCIt)와 NLM MeSH 공개 API로 보내 후보를 받아옵니다. 원문은 보내지 않습니다.</small></div><div class="candidate-compare" data-compare-output aria-live="polite"></div>`:''}
    ${r.decision==='UNREGISTERED' || r.decision.startsWith('HOLD')?`<p class="next-steps-links"><strong>외부 사이트에서 후보 찾기 · 아직 검증하지 않았습니다.</strong>${links.map(l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)} ↗</a>`).join('')}</p><p class="source-note">링크를 누르면 대상 표현만 해당 사이트로 전달됩니다. 이 앱은 외부 사이트를 자동 조회하지 않으며, 외부 사이트의 현재 버전은 이 사전의 고정 스냅샷과 다를 수 있습니다. 검색 결과는 공식 근거 검토와 변경 기록을 거쳐야 사전에 반영됩니다.</p>`:''}</div>`;
}
function snapshotHTML(meta) {
  const s=meta.snapshot ?? {};
  return `<p class="snapshot-note">엔진 ${esc(s.engine_version)} · 사전 v${esc(meta.dataset_version)} · 엔진 SHA-256 <code>${esc((s.engine_sha256 ?? '').slice(0,12))}</code> · 사전 SHA-256 <code>${esc((s.dictionary_sha256 ?? '').slice(0,12))}</code><br>고정한 엔진·사전 스냅샷에서 같은 입력의 판정 필드를 재현합니다.</p>`;
}

function reportHTML(r) {
  const held=r.decision.startsWith('HOLD') || r.decision==='UNREGISTERED';
  return `<div class="runtime-result-heading"><div><p class="eyebrow">입력한 원문에서 지금 계산한 결과</p><h2>시제품 판정</h2></div><span class="badge ${held?'amber':''}" id="analyzer-decision">${esc(labels[r.decision])}</span></div>
    <div class="runtime-concepts">${r.concepts.length?r.concepts.map(c=>`<div>${conceptLink(c)}<code>${esc(c.concept_key)}</code></div>`).join(''):'<p>선택한 단일 개념이 없습니다. 아래 후보와 보류 이유를 확인해 주세요.</p>'}</div>
    <div class="runtime-axes" aria-label="분석 결과의 네 가지 축"><div><small>개념 연결</small><strong>${esc({LINKED:'등록 개념 연결',REVIEW_REQUIRED:'검토 필요',UNREGISTERED:'미등록 표현',EXPRESSION_RESOLVED:'논리식 개념 해소',EXPRESSION_UNRESOLVED:'논리식 해소 미완료'}[r.normalization_status])}</strong></div><div><small>대상에 대한 원문 주장</small><strong>${esc({...assertions,NO_TEXT:'원문 없음 · 사전 조회',NOT_FOUND:'대상 근거 미확인',UNRESOLVED:'대상 의미 미해소',MIXED:'서로 다른 표지 혼재'}[r.target_evidence_status])}</strong></div><div><small>조건의 소유·범위</small><strong>아래 원문 구간별 표시</strong></div><div><small>환자 적격성</small><strong>미평가</strong></div></div>
    ${!r.concepts.length && r.keyword_candidates.length?`<details><summary>사전 후보 · 원문 연결 확정 아님</summary>${r.keyword_candidates.map(conceptLink).join('<br>')}</details>`:''}
    ${nextStepsHTML(r)}
    <ol class="runtime-reasons">${r.reasons.map(item=>`<li><span class="badge gray">${esc(item.rule)} · ${esc(item.code)}</span> ${esc(item.message)}</li>`).join('')}</ol>
    ${r.warnings.map(message=>`<p class="runtime-note">${esc(message)}</p>`).join('')}
    ${r.unsupported_patterns.length?`<h3>해석을 지원하지 않는 문형</h3><ul>${r.unsupported_patterns.map(p=>`<li>${esc({EXPERIENCER_FAMILY_HISTORY:'가족력: 환자 본인의 질환 상태로 해석하지 않습니다.',HISTORICAL:'과거력: 현재 질환 상태로 해석하지 않습니다.',SECTION_CONTEXT:'선정·제외 기준의 절 문맥: 적격성을 자동 해석하지 않습니다.',COORDINATED_NEGATION_UNRESOLVED:'등위 부정: 첫 피연산자를 확인하지 못해 범위를 미상으로 둡니다.',REQUIREMENT_NECESSITY:'요건 필수성: 질환 부재와 구별하고 적격성을 해석하지 않습니다.',AND_ELIGIBILITY_INTERPRETATION:'AND 적격성 해석은 미지원입니다.',COORDINATION_ELLIPSIS:'생략된 공통 질환명 복원은 미지원입니다.'}[p]??p)}</li>`).join('')}</ul>`:''}
    <h3>입력 원문과 인식한 구간</h3><p class="source-note">표시는 개념의 언급과 직접적인 부정·추정 표현을 구별합니다. 환자의 진단 여부를 확정하지 않습니다.</p>
    <blockquote class="runtime-source">${r.input.text?sourceHTML(r):'입력 원문이 없어 등록된 대상 표현만 대조했습니다.'}</blockquote>
    <div class="table-wrap"><table class="runtime-mentions"><thead><tr><th>원문 구간</th><th>개념·후보</th><th>연결 근거</th><th>언급 표지</th></tr></thead><tbody>${r.mentions.map(m=>`<tr><td><strong>${esc(m.text)}</strong><br><small>[${m.start}:${m.end}]</small></td><td>${m.concept?conceptLink(m.concept):m.candidate_keys.map(key=>`<code>${esc(key)}</code>`).join('<br>') || '확인할 수 없음'}</td><td>${m.basis==='DOCUMENT_DEFINITION'?'문서 내 약어 정의':m.basis==='REVIEWED_NAME_VARIANT'?'검토한 긴 이름의 형태 변형':'검토한 이름·별칭'}<br><small>${esc(m.status)}</small></td><td>${esc(assertions[m.assertion])}</td></tr>`).join('') || '<tr><td colspan="4">현재 사전 범위에서 인식한 원문 표현이 없습니다.</td></tr>'}</tbody></table></div>
    ${r.abbreviation_definitions.length?`<h3>문서에서 찾은 약어 정의</h3><div class="runtime-definitions">${r.abbreviation_definitions.map(d=>`<div><strong>${esc(d.short_form)} → ${esc(d.long_form)}</strong><small>${esc(d.status)} · 원문 [${d.long_start}:${d.long_end}] / [${d.short_start}:${d.short_end}]</small><p>${d.status==='RESOLVED'?'등록된 긴 이름에 연결했습니다. 이 문서 밖으로 새 별칭을 전파하지 않습니다.':'긴 이름을 확인하지 못했거나 정의가 충돌합니다. 한쪽으로 추측하지 않습니다.'}</p></div>`).join('')}</div>`:''}
    <h3>질환명 구성 요소와 원문별 추가 조건</h3><div class="runtime-conditions"><section><h4>질환명 구성 요소</h4>${attributesHTML(r.name_components) || '<p>지원하는 패턴에서 찾은 이름 구성 요소가 없습니다.</p>'}</section><section><h4>원문별 추가 조건 구간</h4>${attributesHTML(r.attributes) || '<p>지원하는 패턴에서 찾은 추가 조건이 없습니다. 해당 조건이 없다고 확정한 뜻은 아닙니다.</p>'}</section></div>
    <p class="source-note">추가 조건은 문서 구간으로 보존합니다. 한 절에서 단일 개념만 확인한 제한된 경우에 소유 언급을 연결하고, 여러 질환이나 불명확한 범위는 미상으로 둡니다. 부정 언급의 기간은 질환 부재에 대한 기간으로 구별합니다. 기존 300건의 조건을 새 원문에 복사하지 않습니다.</p>
    ${r.logical_relations.length?`<h3>명시된 논리 관계</h3><p>${r.logical_relations.map(l=>`${esc(l.operator)} · ${esc(l.resolution)}<br>${l.operands.map(o=>`${esc(o.text)} [${o.start}:${o.end}] → ${esc(o.concept_key ?? o.status)}`).join('<br>')}`).join('<br>')}</p>`:''}
    ${snapshotHTML(r.snapshot_meta ?? {})}
    <details class="runtime-json"><summary>분석 JSON과 원문 구간 확인</summary><pre>${esc(JSON.stringify(r,null,2))}</pre></details>`;
}

const evidenceLabels={...assertions,NO_TEXT:'원문 없음 · 사전 조회',NOT_FOUND:'대상 근거 미확인',UNRESOLVED:'대상 의미 미해소',MIXED:'서로 다른 표지 혼재'};
const verdicts={CROSS_SOURCE_AGREEMENT:['세 출처 교차 일치 · 같은 개념 후보',''],PARTIAL_AGREEMENT:['일부 출처 교차 일치 · 같은 개념 후보',''],MONDO_ONLY:['MONDO만 일치 · 다른 출처 확인 필요','amber'],
  SOURCE_DISAGREEMENT:['출처 간 불일치 · 사람 검토','amber'],MULTIPLE_CANDIDATES:['후보 여러 개 · 사람 검토','amber'],SCOPE_REVIEW:['관련 동의어로만 일치 · 범위 검토','amber'],
  ABBREVIATION_NEEDS_DEFINITION:['약어 · 문서 정의 필요','amber'],NO_MONDO_MATCH:['MONDO 대응 없음 · 사람 검토','amber'],NO_CANDIDATE:['후보 없음','amber'],SOURCE_ERROR:['조회 실패','amber']};
const levels={LABEL:'대표 이름 일치',EXACT_SYNONYM:'정확 동의어 일치',RELATED_SYNONYM:'관련 동의어',NARROW_SYNONYM:'좁은 동의어',BROAD_SYNONYM:'넓은 동의어',ENTRY_TERM:'MeSH 입력어 일치',PARTIAL:'검색 결과 · 이름 불일치'};
const officialPage=id=>id.startsWith('MONDO:')?`https://www.ebi.ac.uk/ols4/ontologies/mondo/classes?obo_id=${encodeURIComponent(id)}`:
  id.startsWith('NCIT:')?`https://evsexplore.semantics.cancer.gov/evsexplore/concept/ncit/${encodeURIComponent(id.slice(5))}`:`https://meshb.nlm.nih.gov/record/ui?ui=${encodeURIComponent(id.slice(5))}`;
function compareHTML(c) {
  const [label,tone]=verdicts[c.code] ?? [c.code,'amber'],agreed=new Set([...(c.proposal?.candidates ?? [])]);
  const column=(name,s)=>`<section><h4>${name}<small>${s.status==='ERROR'?'조회 실패':s.version?`버전 ${esc(s.version)}`:'현재 서비스'}</small></h4>${s.candidates.length?s.candidates.slice(0,4).map(x=>`<div class="candidate-item${agreed.has(x.id)?' agreed':''}"><a href="${esc(officialPage(x.id))}" target="_blank" rel="noopener noreferrer"><code>${esc(x.id)}</code> ↗</a><strong>${esc(x.label)}</strong><span class="badge ${['LABEL','EXACT_SYNONYM','ENTRY_TERM'].includes(x.level)?'gray':'amber'}">${esc(levels[x.level] ?? x.level)}</span>${agreed.has(x.id)?'<span class="badge">교차참조 일치</span>':''}${x.definition?`<p>${esc(x.definition.length>220?x.definition.slice(0,220)+'…':x.definition)}</p>`:''}${x.entry_terms?.length?`<p><small>입력어: ${esc(x.entry_terms.join(' · '))}</small></p>`:''}</div>`).join(''):'<p class="source-note">후보 없음</p>'}</section>`;
  return `<div class="compare-heading"><h3>공식 용어체계 후보 비교</h3><span class="badge ${tone}">${esc(label)}</span></div>
    <ol class="compare-reasons">${c.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
    ${c.proposal?`<div class="compare-proposal"><b>제안 · 검토 대기</b><span>${esc(c.proposal.preferred_name)} <code>${esc(c.proposal.concept_key)}</code></span><small>함께 연결할 후보: ${esc(c.proposal.candidates.join(' · '))} · ${esc(c.proposal.name_relation)} · 사전에 반영하지 않았습니다.</small></div>`:''}
    <div class="compare-columns">${column('MONDO',c.sources.mondo)}${column('NCIt',c.sources.ncit)}${column('MeSH',c.sources.mesh)}</div>
    <ul class="compare-limits">${c.limits.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    <p class="snapshot-note">조회 ${esc(c.retrieved_at)} · 비교 규칙 ${esc(c.format)} · 같은 응답이면 같은 제안을 냅니다. <button class="subtle-button" type="button" data-compare-download>비교 기록 JSON 내려받기 ↓</button></p>`;
}

const statusLabel=row=>{
  if(row.status==='INPUT_ERROR')return ['입력 오류','amber'];
  const r=row.result;
  if(['LINKED','LOCAL_LINKED','ROUTE_ENTITY'].includes(r.decision) && r.target_evidence_status==='NO_TEXT')return ['기존 사전의 이름 연결 · 원문 없음','gray'];
  return [labels[r.decision] ?? r.decision,needsReview(row)?'amber':''];
};
function batchHTML(rows,meta) {
  const analyzed=rows.filter(r=>r.status==='ANALYZED'),linked=analyzed.filter(r=>!needsReview(r)).length,review=analyzed.length-linked;
  const errors=rows.length-analyzed.length,noText=analyzed.filter(r=>!r.has_text).length;
  return `<p class="batch-summary"><strong>${rows.length}줄 처리</strong> · 기존 지식으로 연결 ${linked} · 검토 필요 ${review} · 입력 오류 ${errors}<br><small>원문 없음 ${noText}줄은 별도 축입니다(위 합계와 겹칩니다). 원문 없이 이름만 조회한 행은 원문 문맥·환자 조건을 확인하지 않았습니다.</small></p>
    <div class="table-wrap"><table class="batch-table"><thead><tr><th>줄</th><th>대상 표현</th><th>원문</th><th>처리 결과</th><th>연결 개념</th><th>다음 단계</th></tr></thead><tbody>${rows.map(row=>{
      const [label,tone]=statusLabel(row),r=row.result,steps=nextSteps(r);
      return `<tr><td>${row.line}</td><td><strong>${esc(row.keyword) || '—'}</strong></td><td>${row.has_text?`<small>${esc(row.text.length>90?row.text.slice(0,90)+'…':row.text)}</small>`:'<small>없음 · 이름만 조회</small>'}</td>
        <td><span class="badge ${tone}">${esc(label)}</span>${r && row.has_text?`<br><small class="batch-evidence">원문 주장: ${esc(evidenceLabels[r.target_evidence_status] ?? r.target_evidence_status)}</small>`:''}${r?`<br><small>${esc(r.reasons.map(x=>x.code).join(' · '))}</small>`:`<br><small>${esc(row.error)}</small>`}</td>
        <td>${r && r.concepts.length?r.concepts.map(conceptLink).join('<br>'):'<small>단일 개념 없음</small>'}</td>
        <td>${steps.length?`<details><summary>${steps.length}개 확인 항목</summary><ol>${steps.map(s=>`<li><b>${esc(s.rule)}</b> ${esc(s.text)}</li>`).join('')}</ol>${r.decision==='UNREGISTERED'?`<button class="subtle-button batch-compare" type="button" data-batch-compare="${rows.indexOf(row)}">이 줄 후보 비교 ↓</button>`:''}${r.decision==='UNREGISTERED' || r.decision.startsWith('HOLD')?`<p><small>외부 후보 찾기 · 미검증</small><br>${searchLinks(row.keyword).map(l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)} ↗</a>`).join('<br>')}</p>`:''}</details>`:'<small>—</small>'}</td></tr>`;}).join('')}</tbody></table></div>
    ${snapshotHTML(meta)}`;
}
const download=(name,body,type)=>{
  const url=URL.createObjectURL(new Blob([body],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export function mountAnalyzer(root,catalog) {
  const analyzer=createAnalyzer(catalog);let current=remembered.report;
  root.innerHTML=`<div class="container"><div class="page-heading"><p class="eyebrow">새 입력에 적용하는 규칙 시제품</p><h1>새 문장 분석</h1><p>등록된 이름·별칭과 문서 내 약어 정의를 대조하고, 지원하는 조건 구간을 확인하세요. 입력 문장은 브라우저에서 처리하며, 후보 비교를 누를 때만 대상 표현을 공개 용어 API로 보냅니다.</p></div>
    <div class="runtime-scope"><strong>현재 구현 범위</strong><span>기존 ${catalog.metadata.concepts}개 개념·검토한 별칭, 문서 내 긴 이름–약어 정의, 일부 조건 구간을 처리합니다. 개념 식별·원문 주장·조건 범위를 구별하며 환자의 진단·적격성은 평가하지 않습니다. 일반적인 의학적 의미 추론이나 독립 정확도 검증을 마친 분류기는 아닙니다.</span></div>
    <div class="runtime-examples" aria-label="분석 예제">${samples.map((s,i)=>`<button class="example-chip" data-runtime-example="${i}">${esc(s.label)}</button>`).join('')}</div>
    <div class="runtime-layout"><section class="panel runtime-input"><h2>새 입력</h2><form id="analyzer-form"><label for="analyzer-keyword">대상 표현</label><input id="analyzer-keyword" type="text" maxlength="200" required autocomplete="off"><label for="analyzer-text">원문 문장·문단</label><textarea id="analyzer-text" rows="8" maxlength="10000" spellcheck="false"></textarea><p class="source-note">원문은 선택 입력입니다. 뜻을 구별할 근거가 부족하면 보류합니다.</p><button class="runtime-submit" type="submit">이 원문 분석하기</button><p id="analyzer-error" role="alert"></p></form><button id="download-analysis" class="subtle-button">분석 JSON 내려받기 ↓</button>
      <details class="runtime-method"><summary>판정 규칙과 지원 범위</summary><ol><li>등록된 이름·별칭을 단어 경계와 긴 표현 우선으로 찾습니다.</li><li>문서의 긴 이름(약어)을 기존 개념과 대조합니다. type 1/2 diabetes mellitus의 선언한 짧은 형태도 기존 이름에 근거해 처리합니다. 긴 이름을 확인하지 못하거나 정의가 충돌하면 보류합니다.</li><li>다의 약어를 다른 질환의 단순 동시 언급만으로 해소하지 않습니다.</li><li>등록된 범위 관계는 검토로 표시하며 미검토 관계나 원문 근거 부족을 입력 오류로 단정하지 않습니다.</li><li>전이·재발·불응·이전 치료, 중증도·질환 활성도·조절 상태·병기·진행 범위와 일부 기간·이름 구성 요소만 처리합니다. 개념을 바꿀 수 있는 미검토 수식어가 붙으면 보류합니다. OR 구조와 피연산자 해소 상태를 나누어 보존합니다.</li></ol><p>표현이 더 복잡하거나 증상만으로 의미를 추론해야 하는 경우는 지원하지 않습니다. 미등록 개념을 자동 생성하지 않습니다.</p><a href="#materials/methodology">구현·검사·한계 문서 ↗</a></details></section>
    <section id="analyzer-result" class="panel runtime-output" aria-label="새 원문 분석 결과" aria-live="polite"></section></div>
    <section class="panel batch-panel" aria-labelledby="batch-heading"><div class="batch-intro"><div><p class="eyebrow">새 데이터가 들어오면</p><h2 id="batch-heading">여러 줄 한 번에 처리</h2><p>한 줄에 <code>대상 표현</code> 또는 <code>대상 표현 | 원문</code>을 넣으세요. 각 줄은 독립 문서로, 위와 같은 규칙 엔진을 그대로 사용합니다. 등록된 지식으로 처리할 수 있는 줄은 연결하고, 나머지는 이유와 다음 확인 단계를 남깁니다. 최대 ${BATCH_LIMITS.rows}줄입니다.</p></div>
      <ol class="intake-flow"><li><b>1 · 규칙으로 연결</b>검토한 이름·별칭·문서 내 약어 정의</li><li><b>2 · 검토 필요로 분류</b>다의·수식어·원문 근거 부족·미등록·미지원 문형</li><li><b>3 · 후보 비교 → 사람 승인 후 새 버전</b>미등록 표현은 "이 줄 후보 비교"로 MONDO·NCIt·MeSH 후보를 받아 이름 일치와 교차참조를 규칙으로 비교해 제안합니다. 정의 범위 판정과 사전 반영은 사람이 하며, 이 화면에서 자동 등록하지 않습니다.</li></ol></div>
      <label for="batch-input">입력 (줄마다 하나)</label><textarea id="batch-input" rows="9" spellcheck="false" placeholder="T2DM&#10;CD | Crohn disease (CD) is mentioned. Patients with CD."></textarea>
      <div class="batch-actions"><button id="run-batch" class="runtime-submit" type="button">여러 줄 분석하기</button><button id="batch-sample" class="subtle-button" type="button">예시 넣기</button><button id="batch-csv" class="subtle-button" type="button" disabled>여러 줄 결과 CSV ↓</button><button id="batch-json" class="subtle-button" type="button" disabled>여러 줄 결과 JSON ↓</button></div>
      <p id="batch-error" role="alert"></p><div id="batch-result" aria-live="polite"></div></section>
    <section class="panel runtime-checks"><div><h2>개발·반례 검사</h2><p>작성자가 구성한 신규 입력에서 의도한 규칙이 작동하는지 실행합니다. 독립된 임상 정답셋의 정확도 평가는 아닙니다.</p></div><button id="run-analyzer-checks" class="runtime-submit">검사 실행</button><div id="analyzer-check-results" aria-live="polite"></div></section></div>`;
  const keyword=root.querySelector('#analyzer-keyword'),text=root.querySelector('#analyzer-text');
  keyword.value=remembered.keyword;text.value=remembered.text;
  function run() {
    const error=root.querySelector('#analyzer-error');error.textContent='';
    try {
      current=analyzer.analyze({keyword:keyword.value,text:text.value});current.snapshot_meta={dataset_version:catalog.metadata.dataset_version,snapshot:catalog.metadata.snapshot};remembered={keyword:keyword.value,text:text.value,report:current};
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
  const compareCache=new Map();let lastCompare=null;
  async function compareInto(term,target,button) {
    button.disabled=true;target.innerHTML='<p class="source-note">MONDO·NCIt·MeSH에서 후보를 조회하고 있습니다…</p>';
    try {
      if(!compareCache.has(term))compareCache.set(term,await fetchCandidates(term));
      const record=compareCache.get(term),comparison=compareCandidates(record);
      lastCompare={record,comparison};
      if(target.isConnected)target.innerHTML=compareHTML(comparison);
    } catch(e) { if(target.isConnected)target.textContent='후보 비교 중 오류가 발생했습니다: '+e.message; }
    finally { button.disabled=false; }
  }
  root.addEventListener('click',event=>{
    const compare=event.target.closest('[data-compare-term]');
    if(compare){compareInto(compare.dataset.compareTerm,root.querySelector('#analyzer-result [data-compare-output]'),compare);return;}
    if(event.target.closest('[data-compare-download]') && lastCompare){download('indication-candidates.json',JSON.stringify(lastCompare,null,2)+'\n','application/json;charset=utf-8');return;}
    const fromBatch=event.target.closest('[data-batch-compare]');
    if(fromBatch && batchRows) {
      const row=batchRows[Number(fromBatch.dataset.batchCompare)];
      keyword.value=row.keyword;text.value=row.text;run();
      root.querySelector('#analyzer-result').scrollIntoView({block:'start'});
      root.querySelector('#analyzer-result [data-compare-term]')?.click();
    }
  });
  const meta={format:BATCH_FORMAT,engine_version:catalog.metadata.snapshot?.engine_version,dataset_version:catalog.metadata.dataset_version,snapshot:catalog.metadata.snapshot,limits:BATCH_LIMITS};
  let batchRows=null;
  const batchInput=root.querySelector('#batch-input');
  root.querySelector('#batch-sample').addEventListener('click',()=>{batchInput.value=batchSample;});
  root.querySelector('#run-batch').addEventListener('click',()=>{
    const error=root.querySelector('#batch-error');error.textContent='';
    try {
      batchRows=runBatch(analyzer,parseBatch(batchInput.value));
      if(!batchRows.length)throw Error('분석할 줄을 입력해 주세요.');
      root.querySelector('#batch-result').innerHTML=batchHTML(batchRows,{dataset_version:meta.dataset_version,snapshot:meta.snapshot});
      root.querySelector('#batch-csv').disabled=root.querySelector('#batch-json').disabled=false;
    } catch(e) { batchRows=null;error.textContent=e.message;root.querySelector('#batch-result').innerHTML='';root.querySelector('#batch-csv').disabled=root.querySelector('#batch-json').disabled=true; }
  });
  root.querySelector('#batch-csv').addEventListener('click',()=>{if(batchRows)download('indication-batch.csv','\ufeff'+batchCSV(batchRows,meta),'text/csv;charset=utf-8');});
  root.querySelector('#batch-json').addEventListener('click',()=>{if(batchRows)download('indication-batch.json',JSON.stringify({...meta,rows:batchRows.map(r=>({...r,next_steps:nextSteps(r.result)}))},null,2)+'\n','application/json;charset=utf-8');});
  if(current)root.querySelector('#analyzer-result').innerHTML=reportHTML(current);else run();
}
