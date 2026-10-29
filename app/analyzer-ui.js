import {createAnalyzer} from './analyzer.mjs';
import {fetchCandidates,compareCandidates} from './candidates.mjs';
import {BATCH_FORMAT,BATCH_LIMITS,parseBatch,runBatch,nextSteps,searchLinks,needsReview,batchCSV} from './batch.mjs';

const esc=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={LINKED:'기존 개념에 연결',LOCAL_LINKED:'기존 자체 개념에 연결',ROUTE_ENTITY:'별도 개체로 연결',SPLIT_OR:'OR 조건 보존',HOLD_AMBIGUOUS:'약어 의미 보류',HOLD_DEFINITION:'문서 정의 검토 필요',HOLD_SOURCE_CONFLICT:'입력 충돌 · 보류',HOLD_RELATION_UNREVIEWED:'개념 차이 · 관계 미검토',HOLD_TARGET_NOT_IN_TEXT:'원문 근거 미확인',HOLD_MODIFIED_MENTION:'수식된 이름 · 범위 검토 필요',HOLD_EXPRESSION_UNRESOLVED:'AND/OR 구성 개념 검토 필요',HOLD_SCOPE_REVIEW:'범위 차이 · 검토 필요',UNREGISTERED:'미등록 표현 · 검토 필요'};
const assertions={NO_CUE_DETECTED:'부정·추정 표현을 찾지 못함',UNKNOWN:'언급 방식 미상',NEGATED:'부정 표현 있음',UNCERTAIN:'추정 표현 있음',UNSUPPORTED_REQUIREMENT:'필수 조건 여부는 판단하지 않음'};
// Plain labels for match states; the raw code stays in the JSON download.
const matchStates={RESOLVED:'개념 1개로 확인',AMBIGUOUS:'여러 개념 후보',UNREGISTERED:'사전에 없음',INVALID:'약어와 긴 이름이 맞지 않음',UNSUPPORTED_MODIFIER:'검토하지 않은 수식어',UNREVIEWED_PREFIX:'검토하지 않은 앞말',PARTIAL:'일부만 확인',UNRESOLVED:'확인하지 못함',HOLD_DEFINITION:'정의 확인 필요',HOLD_AMBIGUOUS:'여러 개념 후보'};
const stateLabel=code=>matchStates[code] ?? code;
// Plain wording for engine warnings; the engine text stays unchanged in the JSON download.
const warningText={'부정·추정 표지는 언급된 개념과 별도로 기록합니다. 해당 환자의 진단을 확정하지 않습니다.':'부정·추정 표현은 언급된 개념과 따로 기록합니다. 해당 환자의 진단을 확정하지 않습니다.','다의·수식어·미등록 때문에 해소하지 못한 문서 내 표현이 있습니다. 다른 개념의 언급만으로 추측하지 않습니다.':'여러 뜻의 약어·수식어·미등록 때문에 개념을 정하지 못한 표현이 있습니다. 다른 개념의 언급만으로 추측하지 않습니다.'};
const types={disease_status:'질환 상태',treatment_history:'이전 치료',chronicity:'급성·만성',biomarker:'바이오마커',duration:'기간 표현',severity:'중증도',treatment_response:'치료 반응',etiology:'원인 표현',treatment_requirement:'치료 필요 표현',disease_activity:'질환 활성도',control_status:'조절 상태',stage:'병기',extent:'진행 범위'};
const samples=[
  {label:'문맥이 부족한 CD',keyword:'CD',text:'Patients with CD.'},
  {label:'크론병을 뜻하는 CD',keyword:'CD',text:'Crohn disease (CD) is the target. Patients with CD are included.'},
  {label:'셀리악병을 뜻하는 CD',keyword:'CD',text:'Celiac disease (CD) is the target. Patients with CD are included.'},
  {label:'사전에 없는 약어 T2D',keyword:'T2D',text:'Type 2 diabetes (T2D) is mentioned.'},
  {label:'재발·치료 조건',keyword:'Acute myeloid leukemia',text:'Relapsed acute myeloid leukemia after prior therapy.'},
  {label:'입력과 문장의 차이',keyword:'eczema',text:'Adults with plaque psoriasis.'},
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
  return items.map(a=>`<div class="runtime-attribute"><span class="badge gray">${esc(types[a.type])}</span><strong>${esc(a.value)}</strong><q>${esc(a.text)}</q><small>원문 [${a.start}:${a.end}] · ${esc(assertions[a.assertion])}${a.quantity?` · ${a.quantity.amount} ${esc(a.quantity.unit)} / ${esc(a.quantity.comparator)}`:''}</small><small>적용 질환: ${a.ownership.status==='UNKNOWN'?'미상':esc(a.ownership.concept_key ?? '이름 구간')} · 적용 범위: ${esc({DURATION_OF_NEGATED_MENTION:'질환이 없었던 기간',MENTION_CONTEXT:'해당 언급의 문맥',UNASSIGNED:'적용 대상 미상'}[a.scope.kind]??a.scope.kind)} · 그 질환의 언급 방식: ${esc(assertions[a.scope.mention_assertion] ?? '미상')}</small></div>`).join('');
}

const batchSample=['T2DM','CD','CD | Crohn disease (CD) is mentioned. Patients with CD.','Asthma | Patients with severe asthma.','Multiple myeloma | Patients with smoldering multiple myeloma.','Psoriasis | Patients who do not have psoriasis.','Fabry disease | Adults with Fabry disease.','| target missing'].join('\n');
function nextStepsHTML(r) {
  const items=nextSteps(r);if(!items.length)return '';
  const links=searchLinks(r.input.keyword);
  return `<div class="next-steps"><h3>다음에 확인할 내용</h3><ol>${items.map(s=>`<li><span class="badge gray">${esc(s.rule)}</span> ${esc(s.text)}</li>`).join('')}</ol>
    ${r.decision==='UNREGISTERED'?`<div class="compare-entry"><button class="runtime-submit" type="button" data-compare-term="${esc(r.input.keyword)}">MONDO·NCIt·MeSH에서 후보 비교하기</button><small>버튼을 누르면 이름만 외부 용어 API로 보냅니다. 입력한 문장은 보내지 않습니다.</small></div><div class="candidate-compare" data-compare-output aria-live="polite"></div>`:''}
    ${r.decision==='UNREGISTERED' || r.decision.startsWith('HOLD')?`<details class="external-search"><summary>외부 사이트에서 직접 찾아보기</summary><div><p class="next-steps-links">${links.map(l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)} ↗</a>`).join('')}</p><p class="source-note">대상 이름만 해당 사이트로 전달합니다. 외부 검색 결과는 검토 전 후보이며, 현재 사전에 자동으로 추가되지 않습니다.</p></div></details>`:''}</div>`;
}
function snapshotHTML(meta) {
  const s=meta.snapshot ?? {};
  return `<p class="snapshot-note">엔진 ${esc(s.engine_version)} · 사전 v${esc(meta.dataset_version)} · 엔진 SHA-256 <code>${esc((s.engine_sha256 ?? '').slice(0,12))}</code> · 사전 SHA-256 <code>${esc((s.dictionary_sha256 ?? '').slice(0,12))}</code><br>고정한 엔진·사전 스냅샷에서 같은 입력의 판정 필드를 재현합니다.</p>`;
}

// Screen wording for engine reasons that describe internal test conditions.
const reasonText={DECLARED_AMBIGUITY_POLICY:'CD·AML은 여러 질환을 뜻할 수 있어 문서에 긴 이름(약어) 정의가 없으면 하나로 고르지 않습니다.'};
function reportHTML(r) {
  const held=r.decision.startsWith('HOLD') || r.decision==='UNREGISTERED';
  return `<div class="runtime-result-heading"><div><p class="eyebrow">사전과 비교한 결과</p><h2>확인 결과</h2></div><span class="badge ${held?'amber':''}" id="analyzer-decision">${esc(labels[r.decision])}</span></div>
    <div class="runtime-concepts">${r.concepts.length?r.concepts.map(c=>`<div>${conceptLink(c)}<code>${esc(c.concept_key)}</code></div>`).join(''):'<p>하나의 개념으로 연결하지 않았습니다. 판단 이유와 다음 확인 단계를 살펴보세요.</p>'}</div>
    <h3 class="runtime-section-title">판단 이유</h3><ol class="runtime-reasons">${r.reasons.map(item=>`<li><span class="badge gray">${esc(item.rule)}</span><span>${esc(reasonText[item.code] ?? item.message)}</span></li>`).join('')}</ol>
    ${!r.concepts.length && r.keyword_candidates.length?`<details><summary>사전 후보 · 원문 연결 확정 아님</summary>${r.keyword_candidates.map(conceptLink).join('<br>')}</details>`:''}
    ${nextStepsHTML(r)}
    <h3 class="runtime-section-title">문장에서 찾은 표현</h3><p class="source-note">질환명과 직접적인 부정·추정 표현을 표시합니다.</p>
    <blockquote class="runtime-source">${r.input.text?sourceHTML(r):'입력 원문이 없어 등록된 대상 표현만 대조했습니다.'}</blockquote>
    <details class="runtime-analysis-detail"><summary>원문 구간과 추가 조건 자세히 보기</summary><div class="runtime-detail-content">
    <div class="runtime-axes" aria-label="분석 결과의 네 가지 축"><div><small>개념 연결</small><strong>${esc({LINKED:'등록 개념 연결',REVIEW_REQUIRED:'검토 필요',UNREGISTERED:'미등록 표현',EXPRESSION_RESOLVED:'AND/OR의 각 개념 확인',EXPRESSION_UNRESOLVED:'AND/OR 일부 개념 미확인'}[r.normalization_status])}</strong></div><div><small>원문에서 대상을 언급한 방식</small><strong>${esc({...assertions,NO_TEXT:'원문 없음 · 사전 조회',NOT_FOUND:'원문에서 대상 표현 미확인',UNRESOLVED:'대상 의미 미확정',MIXED:'부정·추정 표현 혼재'}[r.target_evidence_status])}</strong></div><div><small>조건이 적용되는 질환</small><strong>아래 원문 구간별 표시</strong></div><div><small>참여·치료 조건 충족 여부</small><strong>평가하지 않음</strong></div></div>
    ${r.warnings.map(message=>`<p class="runtime-note">${esc(warningText[message] ?? message)}</p>`).join('')}
    ${r.unsupported_patterns.length?`<h3>해석을 지원하지 않는 문형</h3><ul>${r.unsupported_patterns.map(p=>`<li>${esc({EXPERIENCER_FAMILY_HISTORY:'가족력: 환자 본인의 질환 상태로 해석하지 않습니다.',HISTORICAL:'과거력: 현재 질환 상태로 해석하지 않습니다.',SECTION_CONTEXT:'선정·제외 기준 문맥: 참여 조건 충족 여부를 자동 해석하지 않습니다.',COORDINATED_NEGATION_UNRESOLVED:'여러 표현에 걸친 부정: 첫 표현을 확인하지 못해 부정 범위를 미상으로 둡니다.',REQUIREMENT_NECESSITY:'필수 조건 문장: 질환이 없다는 뜻과 구별하고, 조건 충족 여부는 판단하지 않습니다.',AND_ELIGIBILITY_INTERPRETATION:'AND로 연결된 참여 조건의 해석은 지원하지 않습니다.',COORDINATION_ELLIPSIS:'생략된 공통 질환명 복원은 미지원입니다.'}[p]??p)}</li>`).join('')}</ul>`:''}
    <div class="table-wrap"><table class="runtime-mentions"><thead><tr><th>원문 구간</th><th>개념·후보</th><th>연결 근거</th><th>언급 방식</th></tr></thead><tbody>${r.mentions.map(m=>`<tr><td><strong>${esc(m.text)}</strong><br><small>[${m.start}:${m.end}]</small></td><td>${m.concept?conceptLink(m.concept):m.candidate_keys.map(key=>`<code>${esc(key)}</code>`).join('<br>') || '확인할 수 없음'}</td><td>${m.basis==='DOCUMENT_DEFINITION'?'문서 내 약어 정의':m.basis==='REVIEWED_NAME_VARIANT'?'검토한 긴 이름의 형태 변형':'검토한 이름·별칭'}<br><small>${esc(stateLabel(m.status))}</small></td><td>${esc(assertions[m.assertion])}</td></tr>`).join('') || '<tr><td colspan="4">현재 사전 범위에서 인식한 원문 표현이 없습니다.</td></tr>'}</tbody></table></div>
    ${r.abbreviation_definitions.length?`<h3>문서에서 찾은 약어 정의</h3><div class="runtime-definitions">${r.abbreviation_definitions.map(d=>`<div><strong>${esc(d.short_form)} → ${esc(d.long_form)}</strong><small>${esc(stateLabel(d.status))} · 원문 [${d.long_start}:${d.long_end}] / [${d.short_start}:${d.short_end}]</small><p>${d.status==='RESOLVED'?'등록된 긴 이름에 연결했습니다. 이 문서 밖으로 새 별칭을 전파하지 않습니다.':'긴 이름을 확인하지 못했거나 정의가 충돌합니다. 한쪽으로 추측하지 않습니다.'}</p></div>`).join('')}</div>`:''}
    <h3>질환명 구성 요소와 원문별 추가 조건</h3><div class="runtime-conditions"><section><h4>질환명 구성 요소</h4>${attributesHTML(r.name_components) || '<p>지원하는 패턴에서 찾은 이름 구성 요소가 없습니다.</p>'}</section><section><h4>원문별 추가 조건 구간</h4>${attributesHTML(r.attributes) || '<p>지원하는 패턴에서 찾은 추가 조건이 없습니다. 해당 조건이 없다고 확정한 뜻은 아닙니다.</p>'}</section></div>
    <p class="source-note">추가 조건은 원문 구간으로 보존합니다. 문장 일부에서 질환이 하나만 확인되는 등 지원하는 경우에만, 추가 조건이 어느 질환에 해당하는지 연결합니다. 여러 질환이 나오거나 적용 대상이 불분명하면 판단하지 않습니다. 부정 문장에 나온 기간은 질환이 없었던 기간으로 구별합니다. 기존 300건의 조건을 새 원문에 복사하지 않습니다.</p>
    ${r.logical_relations.length?`<h3>명시된 논리 관계</h3><p>${r.logical_relations.map(l=>`${esc(l.operator)} · ${esc(stateLabel(l.resolution))}<br>${l.operands.map(o=>`${esc(o.text)} [${o.start}:${o.end}] → ${esc(o.concept_key ?? stateLabel(o.status))}`).join('<br>')}`).join('<br>')}</p>`:''}
    </div></details>
    <details class="runtime-json"><summary>전체 결과와 실행 정보</summary>${snapshotHTML(r.snapshot_meta ?? {})}<details><summary>분석 JSON 확인</summary><pre>${esc(JSON.stringify(r,null,2))}</pre></details></details>`;
}

const evidenceLabels={...assertions,NO_TEXT:'원문 없음 · 사전 조회',NOT_FOUND:'원문에서 대상 표현 미확인',UNRESOLVED:'대상 의미 미확정',MIXED:'부정·추정 표현 혼재'};
const verdicts={CROSS_SOURCE_AGREEMENT:['이름·교차참조 연결 확인 · 범위 미검토','gray'],PARTIAL_AGREEMENT:['일부 이름·교차참조 연결 · 범위 미검토','gray'],MONDO_ONLY:['MONDO 이름만 일치 · 다른 출처 연결 미확인','amber'],
  NON_EXACT_LINK:['교차참조가 exact 관계 아님 · 관계 검토','amber'],SOURCE_DISAGREEMENT:['이름 일치 후보와 교차참조의 차이 · 관계 검토','amber'],MULTIPLE_CANDIDATES:['MONDO 이름 일치 후보 여러 개 · 사람 검토','amber'],
  SCOPE_REVIEW:['관련 동의어로만 일치 · 범위 검토','amber'],ABBREVIATION_NEEDS_DEFINITION:['약어 형태 · 문서 정의 필요','amber'],NO_MONDO_MATCH:['이번 검색에서 MONDO 일치 후보 미확인','amber'],
  NO_CANDIDATE:['세 출처 검색 결과에 이름 일치 후보 없음','amber'],LOOKUP_INCOMPLETE:['조회 미완료 · 다시 조회 필요','amber'],SOURCE_ERROR:['조회 실패 · 다시 조회 필요','amber']};
const levels={LABEL:'대표 이름 일치',EXACT_SYNONYM:'정확 동의어 일치',RELATED_SYNONYM:'관련 동의어',NARROW_SYNONYM:'좁은 동의어',BROAD_SYNONYM:'넓은 동의어',ENTRY_TERM:'Descriptor 입력어 일치 · Concept 범위 미검토',PARTIAL:'검색 결과 · 이름 불일치'};
const relations={EXACT_MATCH:'MONDO exact match',CLOSE_MATCH:'MONDO close match',BROAD_MATCH:'MONDO broad match',NARROW_MATCH:'MONDO narrow match',RELATED_MATCH:'MONDO related match',XREF_UNQUALIFIED:'MONDO xref · 관계 미표기'};
const flagLabels={ALTERNATIVE_EXACT_CANDIDATES:'같은 이름의 다른 후보가 있습니다.',ENTITY_TYPE_UNCHECKED:'NCIt 이름 일치 후보 일부는 개체 유형(질환·평가 항목·pathway 등)을 확인하지 않았습니다.',MESH_DESCRIPTOR_ENTRY_TERM:'MeSH는 Descriptor의 입력어로 일치했습니다. Concept 소속은 확인하지 않았습니다.',VERSION_UNAVAILABLE:'출처 버전을 확인하지 못했습니다. 연결 결과와 별개이며 다시 조회할 수 있습니다.'};
const officialPage=id=>id.startsWith('MONDO:')?`https://www.ebi.ac.uk/ols4/ontologies/mondo/classes?obo_id=${encodeURIComponent(id)}`:
  id.startsWith('NCIT:')?`https://evsexplore.semantics.cancer.gov/evsexplore/concept/ncit/${encodeURIComponent(id.slice(5))}`:`https://meshb.nlm.nih.gov/record/ui?ui=${encodeURIComponent(id.slice(5))}`;
const statusText={OK:'',PARTIAL:'일부 조회 실패',ERROR:'조회 실패'};
function compareHTML(c,{retry=''}={}) {
  const [label,tone]=verdicts[c.code] ?? [c.code,'amber'],linked=new Set(c.proposal?.records ?? []);
  const bestXrefs=c.sources.mondo.candidates.find(x=>x.id===c.proposal?.concept_key)?.xrefs ?? c.sources.mondo.candidates.find(x=>x.xrefs)?.xrefs ?? {};
  const column=(name,s)=>`<section><h4>${name}<small>${s.status!=='OK'?esc(statusText[s.status]):''}${s.version?` 버전 ${esc(s.version)}`:s.status==='OK'?' 현재 서비스':''}</small></h4>${s.candidates.length?[...s.candidates].sort((a,b)=>(linked.has(b.id)||!!bestXrefs[b.id])-(linked.has(a.id)||!!bestXrefs[a.id])).slice(0,4).map(x=>`<div class="candidate-item${linked.has(x.id)?' agreed':''}"><a href="${esc(officialPage(x.id))}" target="_blank" rel="noopener noreferrer"><code>${esc(x.id)}</code> ↗</a><strong>${esc(x.label)}</strong><span class="badge ${['LABEL','EXACT_SYNONYM','ENTRY_TERM'].includes(x.level)?'gray':'amber'}">${esc(levels[x.level] ?? x.level)}</span>${bestXrefs[x.id]?`<span class="badge ${bestXrefs[x.id]==='EXACT_MATCH'?'':'amber'}">${esc(relations[bestXrefs[x.id]])}</span>`:''}${x.semantic_type?`<small>유형: ${esc(x.semantic_type.join(', '))}</small>`:''}${x.definition?`<p>${esc(x.definition.length>220?x.definition.slice(0,220)+'…':x.definition)}</p>`:''}${x.entry_terms?.length?`<p><small>입력어: ${esc(x.entry_terms.join(' · '))}</small></p>`:''}</div>`).join(''):`<p class="source-note">${s.status==='OK'?'이름 일치 후보 없음':'확인하지 못함'}</p>`}${s.candidates.length>4?`<p class="source-note">외 ${s.candidates.length-4}개 후보는 비교 기록 JSON에 있습니다. 판정에는 모두 사용했습니다.</p>`:''}</section>`;
  return `<div class="compare-heading"><h3>공식 용어체계 연결 기록 찾기</h3><span class="badge ${tone}">${esc(label)}</span></div>
    ${!c.complete?`<p class="runtime-note">일부 조회가 끝나지 않았습니다. 확보한 후보만 표시하며 완결된 결과로 보지 않습니다. ${retry}</p>`:!c.metadata_complete?`<p class="runtime-note">출처 버전을 확인하지 못했습니다(${esc(c.metadata_failures.map(f=>f.source+' '+f.error).join(', '))}). 연결 결과는 그대로이며 버전은 다시 조회할 수 있습니다. ${retry}</p>`:''}
    <ol class="compare-reasons">${c.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
    ${c.flags.length?`<ul class="compare-flags">${c.flags.map(f=>`<li>${esc(flagLabels[f] ?? f)}</li>`).join('')}</ul>`:''}
    ${c.proposal?`<div class="compare-proposal"><b>검토할 외부 기록 · 연결 여부 미승인</b><span>${esc(c.proposal.preferred_name)} <code>${esc(c.proposal.concept_key)}</code></span><small>${esc(c.proposal.records.join(' · '))} · ${esc(c.proposal.name_relation)} · 사전에 반영하지 않았습니다.</small></div>`:''}
    <div class="compare-columns">${column('MONDO',c.sources.mondo)}${column('NCIt',c.sources.ncit)}${column('MeSH',c.sources.mesh)}</div>
    <ul class="compare-limits">${c.limits.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    <p class="snapshot-note">조회 ${esc(c.retrieved_at)} · 비교 규칙 ${esc(c.format)} · 같은 응답 기록이면 같은 비교 결과를 냅니다. 외부 서비스의 응답은 시간에 따라 바뀔 수 있습니다. <button class="subtle-button" type="button" data-compare-download>이 비교의 기록 JSON 내려받기 ↓</button></p>`;
}

const statusLabel=row=>{
  if(row.status==='INPUT_ERROR')return ['입력 오류','amber'];
  const r=row.result;
  if(['LINKED','LOCAL_LINKED','ROUTE_ENTITY'].includes(r.decision) && r.target_evidence_status==='NO_TEXT')return [`${labels[r.decision]} · 원문 없음`,'gray'];
  return [labels[r.decision] ?? r.decision,needsReview(row)?'amber':''];
};
function candidateCell(row,i) {
  if(!row.result || row.result.decision!=='UNREGISTERED')return '<small>—</small>';
  if(row.candidate_pending)return '<small>조회 중…</small>';
  if(!row.candidate_pair)return `${row.candidate_error?`<small>오류: ${esc(row.candidate_error)}</small><br>`:''}<button class="subtle-button" type="button" data-row-compare="${i}" data-force>${row.candidate_error?'다시 조회':'후보 비교'}</button>`;
  const c=row.candidate_pair.comparison,[label,tone]=verdicts[c.code] ?? [c.code,'amber'];
  return `<span class="badge ${tone}">${esc(label)}</span>${c.proposal?`<br><small>검토할 기록: ${esc(c.proposal.records.join(' · '))}</small>`:''}<br><button class="subtle-button" type="button" data-batch-compare="${i}">근거 자세히 ↑</button>${!c.complete || !c.metadata_complete?` <button class="subtle-button" type="button" data-row-compare="${i}" data-force>다시 조회</button>`:''}`;
}
function batchHTML(rows,meta) {
  const analyzed=rows.filter(r=>r.status==='ANALYZED'),linked=analyzed.filter(r=>!needsReview(r)).length,review=analyzed.length-linked;
  const errors=rows.length-analyzed.length,noText=analyzed.filter(r=>!r.has_text).length,unregistered=analyzed.filter(r=>r.result.decision==='UNREGISTERED').length;
  return `<p class="batch-summary"><strong>${rows.length}줄 처리</strong> · 기존 사전으로 연결 ${linked} · 검토 필요 ${review} · 입력 오류 ${errors}${noText?`<br><small>이 중 ${noText}줄은 문장 없이 이름만 확인했습니다. 문장의 문맥과 환자 조건은 확인하지 않았습니다.</small>`:''}</p>
    ${unregistered?`<div class="batch-compare-all"><button class="runtime-submit" type="button" data-compare-all>미등록 ${unregistered}줄 모두 MONDO·NCIt·MeSH 후보 비교</button><small>미등록 줄의 이름만 외부 용어 API로 보냅니다. 결과는 표의 "공식 용어체계 후보" 칸에 표시하며 사전에는 반영하지 않습니다.</small></div>`:''}
    <div class="table-wrap"><table class="batch-table"><colgroup><col class="c-line"><col class="c-term"><col class="c-text"><col class="c-status"><col class="c-concept"><col class="c-candidate"><col class="c-steps"></colgroup><thead><tr><th>줄</th><th>대상 표현</th><th>원문</th><th>처리 결과</th><th>연결 개념</th><th>공식 용어체계 후보</th><th>다음 단계</th></tr></thead><tbody>${rows.map(row=>{
      const [label,tone]=statusLabel(row),r=row.result,steps=nextSteps(r);
      return `<tr><td data-label="줄">${row.line}</td><td data-label="대상 표현"><strong>${esc(row.keyword) || '—'}</strong></td><td data-label="원문">${row.has_text?`<small>${esc(row.text.length>90?row.text.slice(0,90)+'…':row.text)}</small>`:'<small>없음 · 이름만 조회</small>'}</td>
        <td data-label="처리 결과"><span class="badge ${tone}">${esc(label)}</span>${r && row.has_text?`<br><small class="batch-evidence">언급 방식: ${esc(evidenceLabels[r.target_evidence_status] ?? r.target_evidence_status)}</small>`:''}${!r?`<br><small>${esc(row.error)}</small>`:''}</td>
        <td data-label="연결 개념">${r && r.concepts.length?r.concepts.map(conceptLink).join('<br>'):'<small>단일 개념 없음</small>'}</td>
        <td data-label="공식 용어체계 후보" data-candidate-cell="${rows.indexOf(row)}"${r && r.decision==='UNREGISTERED'?'':' data-empty'}>${candidateCell(row,rows.indexOf(row))}</td>
        <td data-label="다음 단계"${steps.length?'':' data-empty'}>${steps.length?`<details><summary>${steps.length}개 확인 항목</summary><ol>${steps.map(s=>`<li><b>${esc(s.rule)}</b> ${esc(s.text)}</li>`).join('')}</ol>${r.decision==='UNREGISTERED' || r.decision.startsWith('HOLD')?`<p><small>외부 후보 찾기 · 미검증</small><br>${searchLinks(row.keyword).map(l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)} ↗</a>`).join('<br>')}</p>`:''}</details>`:'<small>—</small>'}</td></tr>`;}).join('')}</tbody></table></div>
    ${snapshotHTML(meta)}`;
}
const download=(name,body,type)=>{
  const url=URL.createObjectURL(new Blob([body],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

export function mountAnalyzer(root,catalog) {
  const analyzer=createAnalyzer(catalog);let current=remembered.report;
  root.innerHTML=`<div class="container analyzer-page"><div class="page-heading"><p class="eyebrow">기존 사전과 비교</p><h1>직접 입력해 보기</h1><p>이름이나 약어가 사전의 어떤 개념에 연결되는지 확인합니다. 등록되지 않은 표현은 외부 용어체계에서 후보를 찾아볼 수 있습니다.</p></div>
    <div class="intake-tabs" role="tablist" aria-label="입력 방식"><button id="intake-single-tab" role="tab" aria-selected="true" aria-controls="intake-single" data-intake-mode="single">한 건 확인</button><button id="intake-batch-tab" role="tab" aria-selected="false" aria-controls="intake-batch" tabindex="-1" data-intake-mode="batch">여러 건 확인</button></div>
    <section id="intake-single" role="tabpanel" aria-labelledby="intake-single-tab">
    <div class="runtime-examples" aria-label="분석 예제"><span>예시로 시작하기</span>${samples.map((s,i)=>`<button class="example-chip" data-runtime-example="${i}">${esc(s.label)}</button>`).join('')}</div>
    <div class="runtime-layout"><section class="panel runtime-input"><h2>확인할 내용</h2><form id="analyzer-form"><label for="analyzer-keyword">이름 또는 약어 <span class="field-required">필수</span></label><input id="analyzer-keyword" type="text" maxlength="200" required autocomplete="off" placeholder="예: NSCLC, CD, Fabry disease"><label for="analyzer-text">이름이 쓰인 문장 <span class="field-optional">선택</span></label><textarea id="analyzer-text" rows="5" maxlength="10000" spellcheck="false" placeholder="예: Crohn disease (CD) is mentioned." aria-describedby="analyzer-context-help"></textarea><p id="analyzer-context-help" class="source-note">약어의 긴 이름이 함께 적힌 문장을 넣어보세요. 문맥이 부족하면 뜻을 정하지 않고 보류합니다.</p><button class="runtime-submit" type="submit">사전과 비교하기</button><p id="analyzer-error" role="alert"></p></form></section>
    <section class="panel runtime-output" aria-label="새 원문 분석 결과"><div id="analyzer-result" aria-live="polite"></div><div class="runtime-result-tools"><button id="download-analysis" class="subtle-button" type="button">결과 JSON 내려받기 ↓</button><span>입력·판단 근거·실행 정보를 포함합니다.</span></div></section></div></section>
    <section id="intake-batch" role="tabpanel" aria-labelledby="intake-batch-tab" hidden><section class="panel batch-panel" aria-labelledby="batch-heading"><div class="batch-intro"><div><h2 id="batch-heading">여러 이름을 한 번에 확인</h2><p>한 줄에 하나씩 입력하세요. 문장을 함께 넣을 때는 이름 뒤에 <code>|</code>를 붙입니다. 최대 ${BATCH_LIMITS.rows}줄까지 처리하며, 각 줄은 별도 문서로 확인합니다.</p></div></div>
      <label for="batch-input">이름 또는 약어 <span class="field-optional">줄마다 하나</span></label><textarea id="batch-input" rows="7" spellcheck="false" placeholder="T2DM&#10;CD | Crohn disease (CD) is mentioned. Patients with CD."></textarea>
      <div class="batch-actions"><button id="run-batch" class="runtime-submit" type="button">여러 건 확인하기</button><button id="batch-sample" class="subtle-button" type="button">예시 넣기</button></div>
      <p id="batch-error" role="alert"></p><div id="batch-result" aria-live="polite"></div><div class="batch-downloads"><button id="batch-csv" class="subtle-button" type="button" disabled>여러 줄 결과 CSV ↓</button><button id="batch-json" class="subtle-button" type="button" disabled>여러 줄 결과 JSON ↓</button></div></section></section>
    <div class="runtime-boundary"><p>등록된 이름·약어 정의와 지원하는 조건 표현을 확인합니다. 환자의 진단과 참여·치료 조건 충족 여부는 판단하지 않습니다.</p><details class="runtime-method"><summary>처리 방식과 한계</summary><ol><li>등록된 이름·별칭을 단어 경계와 긴 표현 우선으로 찾습니다.</li><li>문서의 긴 이름(약어)을 기존 개념과 대조합니다. type 1/2 diabetes mellitus의 선언한 짧은 형태도 기존 이름에 근거해 처리합니다. 긴 이름을 확인하지 못하거나 정의가 충돌하면 보류합니다.</li><li>여러 뜻을 가진 약어는 다른 질환이 함께 언급됐다는 이유만으로 뜻을 정하지 않습니다.</li><li>등록된 범위 관계는 검토로 표시하며 미검토 관계나 원문 근거 부족을 입력 오류로 단정하지 않습니다.</li><li>전이·재발·불응·이전 치료, 중증도·질환 활성도·조절 상태·병기·진행 범위와 일부 기간·이름 구성 요소만 처리합니다. 개념을 바꿀 수 있는 미검토 수식어가 붙으면 보류합니다. OR 구조와, OR로 연결된 각 표현이 어떤 개념인지 확인한 상태를 나누어 보존합니다.</li></ol><p>표현이 더 복잡하거나 증상만으로 의미를 추론해야 하는 경우는 지원하지 않습니다. 미등록 개념을 자동 생성하지 않습니다.</p><a href="#materials/methodology">구현·검사·한계 문서 ↗</a></details></div>
</div>`;
  const modeButtons=[...root.querySelectorAll('[data-intake-mode]')];
  function selectMode(mode,focus=false) {
    modeButtons.forEach(button=>{const selected=button.dataset.intakeMode===mode;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected && focus)button.focus();});
    root.querySelector('#intake-single').hidden=mode!=='single';root.querySelector('#intake-batch').hidden=mode!=='batch';
  }
  modeButtons.forEach((button,i)=>{
    button.addEventListener('click',()=>selectMode(button.dataset.intakeMode));
    button.addEventListener('keydown',event=>{
      const index=event.key==='Home'?0:event.key==='End'?modeButtons.length-1:event.key==='ArrowRight'?(i+1)%modeButtons.length:event.key==='ArrowLeft'?(i+modeButtons.length-1)%modeButtons.length:null;
      if(index!==null){event.preventDefault();selectMode(modeButtons[index].dataset.intakeMode,true);}
    });
  });
  const keyword=root.querySelector('#analyzer-keyword'),text=root.querySelector('#analyzer-text');
  keyword.value=remembered.keyword;text.value=remembered.text;
  function run() {
    const error=root.querySelector('#analyzer-error');error.textContent='';
    try {
      current=analyzer.analyze({keyword:keyword.value,text:text.value});current.snapshot_meta={dataset_version:catalog.metadata.dataset_version,snapshot:catalog.metadata.snapshot};remembered={keyword:keyword.value,text:text.value,report:current};
      viewToken++;viewPair=null;
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
  // Every displayed comparison keeps its own {record, comparison} pair; downloads use that pair.
  // Only complete records are reused; in-flight lookups for the same term are shared.
  const completeCache=new Map(),inflight=new Map(),infoCache=new Map();let viewPair=null,viewToken=0;
  let active=0;const queue=[];
  // At most six HTTP requests in flight across all lookups.
  const limitedFetch=(url,init)=>new Promise((resolve,reject)=>{
    const start=()=>{active++;fetch(url,init).then(resolve,reject).finally(()=>{active--;queue.shift()?.();});};
    active<6?start():queue.push(start);
  });
  function lookup(term,force=false) {
    if(!force && completeCache.has(term))return Promise.resolve(completeCache.get(term));
    if(!force && inflight.has(term))return inflight.get(term);
    const p=fetchCandidates(term,{fetchImpl:limitedFetch,infoCache}).then(record=>{
      const pair={record,comparison:compareCandidates(record)};
      if(pair.comparison.complete && pair.comparison.metadata_complete)completeCache.set(term,pair);else completeCache.delete(term);
      return pair;
    }).finally(()=>{if(inflight.get(term)===p)inflight.delete(term);});
    inflight.set(term,p);return p;
  }
  const showPair=(pair,target)=>{viewPair=pair;target.innerHTML=compareHTML(pair.comparison,{retry:`<button class="subtle-button" type="button" data-compare-term="${esc(pair.record.term)}" data-force>다시 조회</button>`});};
  async function compareInto(term,target,button,force=false) {
    const token=++viewToken;viewPair=null;button.disabled=true;
    target.innerHTML='<p class="source-note">MONDO·NCIt·MeSH에서 후보를 조회하고 있습니다…</p>';
    try {
      const pair=await lookup(term,force);
      if(token===viewToken && target.isConnected)showPair(pair,target);
    } catch(e) { if(token===viewToken && target.isConnected)target.textContent='후보 비교 중 오류가 발생했습니다: '+e.message; }
    finally { if(button.isConnected)button.disabled=false; }
  }
  root.addEventListener('click',event=>{
    const compare=event.target.closest('[data-compare-term]');
    if(compare){compareInto(compare.dataset.compareTerm,root.querySelector('#analyzer-result [data-compare-output]'),compare,compare.hasAttribute('data-force'));return;}
    if(event.target.closest('[data-compare-download]') && viewPair){download('indication-candidates.json',JSON.stringify(viewPair,null,2)+'\n','application/json;charset=utf-8');return;}
    const rowCompare=event.target.closest('[data-row-compare]');
    if(rowCompare && batchRows){compareRow(Number(rowCompare.dataset.rowCompare),rowCompare.hasAttribute('data-force'));return;}
    if(event.target.closest('[data-compare-all]') && batchRows){compareAll(event.target.closest('[data-compare-all]'));return;}
    const fromBatch=event.target.closest('[data-batch-compare]');
    if(fromBatch && batchRows) {
      const row=batchRows[Number(fromBatch.dataset.batchCompare)];
      selectMode('single');keyword.value=row.keyword;text.value=row.text;run();
      const output=root.querySelector('#analyzer-result [data-compare-output]');
      if(output && row.candidate_pair)showPair(row.candidate_pair,output);
      root.querySelector('#analyzer-result').scrollIntoView({block:'start'});
    }
  });
  async function compareRow(i,force=false) {
    const owner=batchRows,row=owner?.[i],cell=()=>owner===batchRows?root.querySelector(`[data-candidate-cell="${i}"]`):null;
    if(!row?.result || row.result.decision!=='UNREGISTERED' || row.candidate_pending)return;
    row.candidate_pending=true;if(cell())cell().innerHTML=candidateCell(row,i);
    try { row.candidate_pair=await lookup(row.keyword,force); }
    catch(e) { row.candidate_pair=null;row.candidate_error=e.message; }
    finally { row.candidate_pending=false; }
    if(cell())cell().innerHTML=candidateCell(row,i);
  }
  async function compareAll(button) {
    button.disabled=true;const owner=batchRows;
    const pending=owner.map((r,i)=>i).filter(i=>owner[i].result?.decision==='UNREGISTERED' && !owner[i].candidate_pair);
    // Three terms at a time; the shared limiter also caps HTTP requests at six.
    const worker=async()=>{while(pending.length && owner===batchRows)await compareRow(pending.shift());};
    await Promise.all([worker(),worker(),worker()]);
    if(button.isConnected)button.textContent='후보 비교 완료 · 미완료 줄은 칸의 "다시 조회"를 누르세요';
  }
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
  root.querySelector('#batch-json').addEventListener('click',()=>{if(batchRows)download('indication-batch.json',JSON.stringify({...meta,rows:batchRows.map(({candidate_pair,candidate_pending,...r})=>({...r,next_steps:nextSteps(r.result),candidate_comparison:candidate_pair?.comparison ?? null,candidate_record:candidate_pair?.record ?? null}))},null,2)+'\n','application/json;charset=utf-8');});
  if(current)root.querySelector('#analyzer-result').innerHTML=reportHTML(current);else run();
}
