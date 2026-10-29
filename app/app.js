import {normalize, searchCatalog, filterRecords} from './search.js';
import {mountCompare} from './compare-ui.js';
import {mountAudit} from './audit-ui.js';
import {mountAnalyzer} from './analyzer-ui.js';

const $ = (s, root=document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL = value => { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
const icon = '<svg class="search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" stroke-width="1.6"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const entityLabels = {DISEASE_OR_CONDITION:'질환·조건',DISEASE_GROUP:'질환군',NEOPLASM_GROUP:'신생물군',CLINICAL_CONDITION:'임상 조건',CLINICAL_EVENT:'임상 사건',CLINICAL_FINDING:'임상 소견',CLINICAL_SYNDROME:'임상 증후군',LIFE_STAGE:'생애 단계',PHYSIOLOGICAL_STATE:'생리 상태',SYMPTOM:'증상'};
const decisionLabels = {PROVISIONAL_MAP:'개념 연결 · 잠정',LOCAL_CONCEPT:'자체 관리 개념',ROUTE_ENTITY:'별도 개체',SPLIT_EXPRESSION:'OR 조건',HOLD_AMBIGUOUS:'문맥 부족 · 보류',HOLD_SOURCE_CONFLICT:'입력 충돌 · 보류'};
const relations = {EXACT:'같은 개념',BROADER:'원문이 더 넓음',NARROWER:'원문이 더 좁음',RELATED:'관련 개념',UNKNOWN:'동등성 미확정',DIFFERENT_ENTITY:'다른 개체',COMPONENT:'OR 구성 개념'};
const kindLabels = {PROVIDED_INPUT:'제공된 표현',REVIEWED_DISPLAY_NAME:'검토한 표시명',REVIEWED_EXACT_PREFERRED_LABEL:'검토한 공식 명칭',EXPLICIT_CITED_ALIAS:'근거로 추가한 별칭',EXPLICIT_REVIEWED_SOURCE_ALIAS:'근거로 추가한 별칭'};
const scopeLabels = {
  ESOPHAGEAL_ACHALASIA:'식도 이완불능증의 의미를 적용합니다. 식도 외 다른 괄약근을 명시한 문맥에서는 재검토합니다.',
  EXOCRINE_DIGESTIVE_ENZYME_INSUFFICIENCY:'외분비 췌장 기능부전의 의미를 적용합니다. 내분비 기능·인슐린 분비를 명시한 문맥에는 이 연결을 적용하지 않습니다.',
  VALVULAR_AORTIC_STENOSIS:'대동맥판 협착의 의미를 적용합니다. 판막 위·아래 협착을 명시한 문맥에서는 재검토합니다.',
  PULMONARY_EMPHYSEMA:'폐기종의 의미를 적용합니다. 피하 등 비폐성 위치를 명시한 문맥에는 적용하지 않습니다.',
  MYELOFIBROSIS_UNSPECIFIED_CAUSE:'원인 미지정 골수 섬유화의 범위를 유지합니다. MPN 또는 특정 약물의 적응증 문맥이 있으면 그 제한을 별도로 검토합니다.'
};
let data, conceptByKey, recordById, route, searchPage=0, recordPage=0, aliasPage=0, selectedKey=null;
const detailCache=new Map(), docCache=new Map();
const pageSize=6, rowPageSize=25;
const storyTitles={cd:'CD·AML: 문맥에 따라 달라지는 약어',eczema:'Eczema: 일반명과 아형의 범위',nsclc:'NSCLC: 같은 질환, 다른 추가 조건',masld:'NAFLD·MASLD: 명칭과 기준의 차이',conflict:'키워드와 문맥이 충돌한 입력',or:'MDS/AML: OR 조건을 유지한 표현',her2:'HER2 양성: 외부 정의와 자체 관리 개념',gca:'GCA·측두동맥염: 이름과 침범 범위',sense:'문맥이 적을 때의 기본 의미', 'long-covid':'Long COVID·PASC: 명칭과 기간 기준'};
const caseGroups=[['약어의 여러 뜻',['cd']],['일반명과 범위',['eczema','gca','sense']],['질환명과 추가 조건',['nsclc']],['명칭과 기준의 변화',['masld','long-covid']],['표준 정의와 자체 관리 개념',['her2']],['입력 충돌과 복합 표현',['conflict','or']]];

function badge(text, tone='') { return `<span class="badge ${tone}">${esc(text)}</span>`; }
function decisionBadge(r) {
  const d=r.research_decision;
  return badge(decisionLabels[d] ?? d, d.startsWith('HOLD_')?'amber':d==='LOCAL_CONCEPT'?'blue':d==='SPLIT_EXPRESSION'?'purple':d==='ROUTE_ENTITY'?'gray':'');
}
function pathFor(page, values={}) {
  const p=new URLSearchParams(Object.entries(values).filter(([,v])=>v!=='' && v!=null));
  return `#${page}${p.size?'?'+p.toString():''}`;
}
function navigate(page, values={}) { location.hash=pathFor(page,values).slice(1); }
function currentParams() { return Object.fromEntries(route.params.entries()); }
function readRoute() {
  const [path,query='']=(location.hash.slice(1)||'dictionary').split('?');
  return {path, page:path.split('/')[0], sub:path.split('/')[1], params:new URLSearchParams(query)};
}
function toast(message) {
  const node=$('#toast'); node.textContent=message; node.classList.add('visible');
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>node.classList.remove('visible'),2400);
}
function sourceLabel(source) {
  const url=source?.url ?? '';
  if(url.includes('api-evsrest.nci') || url.includes('evs.nci'))return 'NCI EVS / NCIt';
  if(url.includes('mesh'))return 'NLM MeSH';
  if(url.includes('monarch') || url.includes('mondo'))return 'MONDO';
  if(url.includes('monash.edu'))return 'Monash 가이드라인';
  if(url.includes('nichd.nih'))return 'NIH NICHD';
  if(url.includes('niddk.nih'))return 'NIH NIDDK';
  if(url.includes('niams.nih'))return 'NIH NIAMS';
  if(url.includes('cancer.gov'))return 'NCI';
  if(url.includes('cdc.gov'))return 'CDC';
  if(url.includes('aasld'))return 'AASLD';
  if(url.includes('medlineplus'))return 'MedlinePlus';
  if(url.includes('heart.org'))return 'American Heart Association';
  if(url.includes('cortellis'))return 'Cortellis 공개 문서';
  if(url.includes('elsevier'))return 'Embase 공개 도움말';
  try { return new URL(url).hostname.replace(/^www\./,''); } catch { return source?.label ?? '원문별 판단 근거'; }
}
function sourcesHTML(refs) {
  const seen=new Set();
  return [...new Set(refs)].map(id=>data.sources[id]).filter(s=>s && safeURL(s.url) && !seen.has(s.url) && seen.add(s.url))
    .map(s=>`<a class="source-link" href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer" title="${esc(s.locator)}">${esc(sourceLabel(s))} ↗</a>`).join('');
}
function heading(eyebrow,title,description) {
  return `<div class="page-heading"><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`;
}
// Story tags carry their original numbers; grouping by topic reorders them, so the screen omits them.
const caseTag=tag=>String(tag ?? '').replace(/^\d+\s*·\s*/u,'');
function featureCards(stories) {
  return stories.map(s=>`<button class="feature-card" data-case="${esc(s.id)}"><span class="feature-kicker">${esc(caseTag(s.tag))}</span><h3>${esc(storyTitles[s.id] ?? s.title)}</h3><p>${esc(s.teaser)}</p><span class="feature-link">판단 근거 보기 <span aria-hidden="true">↗</span></span></button>`).join('');
}

function recordProofLink(id,label=id,values={}) {
  return `<a class="source-link" href="${esc(pathFor('records',{record:id,...values}))}">${esc(label)} ↗</a>`;
}

function structuredReviewHTML(story) {
  const statuses={EXPLICIT:'명시',NOT_STATED:'미명시',NOT_APPLICABLE:'해당 없음',NOT_VERIFIED:'근거 미확인'};
  const fields={keyword:'키워드',raw_context:'제공 문맥',input_normalized_condition:'입력 파일의 정규화명'};
  const criteria={added_restriction:'추가되는 제한',information_preservation:'정보 보존',uncertainty:'불확실성과 적용 조건'};
  return `<section class="case-review" aria-label="구조화한 비교 기준"><h3>비교한 정보</h3>
    <p class="source-note">기존 판정의 근거를 구조화했습니다. 미명시는 해당 조건이 없다고 확인했다는 뜻이 아닙니다.</p>
    <p class="case-scroll-note">표를 좌우로 밀어 원문·후보·판정 영향을 비교할 수 있습니다.</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="사례 비교 축 표 · 좌우 스크롤 가능"><table class="comparison-table"><thead><tr><th>비교 축</th><th>원문에서 확인한 정보</th><th>후보·비교 기준</th><th>판정에 미친 영향</th></tr></thead><tbody>
    ${story.comparison_axes.map(axis=>`<tr><th scope="row">${esc(axis.axis)}</th><td>${axis.source_items.map(item=>`<div class="evidence-item">${recordProofLink(item.source_id,item.source_id+' · '+fields[item.field])}${badge(statuses[item.status],item.status==='NOT_VERIFIED'?'amber':'gray')}${item.quote?`<blockquote class="evidence-quote">${esc(item.quote)}</blockquote>`:''}${item.note?`<p>${esc(item.note)}</p>`:''}</div>`).join('')}</td>
    <td>${axis.candidate_items.map(item=>`<div class="evidence-item">${recordProofLink(item.source_id,item.source_id+' → '+item.candidate_key,{candidate:item.candidate_key})}<strong>${esc(item.label)}</strong>${badge(relations[item.relation] ?? item.relation,item.relation==='UNKNOWN'?'amber':'gray')}${item.quote?`<blockquote class="evidence-quote">${esc(item.quote)}</blockquote><span class="source-note">정의 발췌 · ${esc(item.definition_source)}</span>`:''}${item.note?`<p>${esc(item.note)}</p>`:''}</div>`).join('')}${axis.comparison_note?`<p>${esc(axis.comparison_note)}</p>`:''}</td>
    <td><p>${esc(axis.impact_ko)}</p><details class="axis-sources"><summary>판정 근거</summary><div>${sourcesHTML(axis.evidence_refs)}</div></details></td></tr>`).join('')}
    </tbody></table></div>
    <h3 class="label-spaced">적용한 판단 기준</h3><div class="table-wrap"><table class="criteria-table"><tbody>${story.decision_criteria.map(item=>`<tr><th scope="row">${esc(criteria[item.kind])}</th><td><p>${esc(item.text_ko)}</p><div>${item.source_ids.map(id=>recordProofLink(id)).join('')}</div></td></tr>`).join('')}</tbody></table></div>
    <details class="case-candidates"><summary>후보별 관계 ${story.candidate_reviews.length}개와 대표 선택 확인</summary><p class="source-note">관계 방향은 원문 → 후보입니다. 입력의 최종 처리 상태는 아래 원문별로 따로 표시합니다.</p>
    ${story.candidate_reviews.length?`<div class="table-wrap"><table class="candidate-review-table"><thead><tr><th>제공 항목</th><th>검토한 후보</th><th>후보와의 관계</th><th>대표 선택</th></tr></thead><tbody>${story.candidate_reviews.map(item=>`<tr><td>${recordProofLink(item.source_id)}</td><td>${recordProofLink(item.source_id,item.source_id+' → '+item.candidate_key,{candidate:item.candidate_key})}<br>${esc(item.label)}</td><td>${badge(relations[item.relation] ?? item.relation,item.relation==='UNKNOWN'?'amber':'gray')}</td><td>${item.selected?'대표 ID로 선택':'검토 기록 보존'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="source-note">이 사례는 입력 충돌로 후보를 채택하지 않았습니다. 아래 최종 처리와 원문을 확인해 주세요.</p>'}</details>
    </section>`;
}

function dictionaryPage() {
  const m=data.metadata;
  $('#main-content').innerHTML=`<div class="container home-page">
    <section class="home-head" aria-labelledby="hero-title"><div class="home-title"><h1 id="hero-title">질환 동의어 사전</h1><p>제공된 키워드와 문맥을 대조해 같은 개념을 묶었습니다.</p></div>
    <div class="stats" aria-label="사전 요약">${[['검토한 키워드',m.records,'건','#records','전체 분류 결과'],['개념 그룹',m.concepts,'개','#dictionary?view=concepts','개념 목록'],['별칭 연결',m.aliases,'건','#aliases','별칭 목록'],['판단 보류',m.holds,'건','#records?decision=HOLD','보류 사유 확인']].map(([label,n,u,href,action])=>`<a class="stat" href="${href}"${href.includes('view=concepts')?' data-concept-list':''} aria-label="${label} ${n}${u} · ${action}"><span class="stat-value">${n}<small>${u}</small></span><span class="stat-label">${label}</span></a>`).join('')}</div></section>
    <section class="key-points" aria-label="핵심 포인트">${[
      ['판단 원칙','같은 개념·범위일 때만 묶음','#cases'],
      ['이 사전의 방향','항목별 판단 이유와 출처','#materials/methodology'],
      ['반례와 수정','발견한 오류와 수정 내용','#materials/methodology?section=counterexamples']
    ].map(([label,title,href])=>`<a class="key-point" href="${href}"><span>${label}</span><strong>${title} <span aria-hidden="true">↗</span></strong></a>`).join('')}</section>
    <section id="concept-explorer" aria-labelledby="search-heading"><div class="search-heading-row"><h2 id="search-heading" tabindex="-1">사전 검색</h2><div class="examples"><span>예시</span>${['CD','T2DM','eczema','NAFLD'].map(q=>`<button class="example-chip" data-query="${q}">${q}</button>`).join('')}<span class="scope-note">질환군·소견·상태도 포함합니다.</span></div></div>
    <div class="search-toolbar"><label class="search-box">${icon}<input id="dictionary-search" type="search" autocomplete="off" aria-label="질환명·약어·항목 번호 검색" placeholder="질환명, 약어 또는 항목 번호 검색"><span class="search-key" aria-hidden="true">/</span></label><a class="new-keyword-link" href="#analyze">새 키워드 확인 <span aria-hidden="true">↗</span></a></div>
    <div class="explorer"><div id="results" class="panel result-panel"></div><div id="dictionary-detail" class="panel detail"></div></div></section>
    <section class="featured-section"><div class="section-heading"><div><h2>사례별 판단 근거</h2><p>약어, 범위 차이, 추가 조건과 보류 사례를 확인할 수 있습니다.</p></div><a href="#cases/examples">전체 사례 ↗</a></div><div class="featured-grid">${featureCards(['cd','eczema','nsclc','masld','conflict'].map(id=>data.stories.find(s=>s.id===id)))}</div></section>
  </div>`;
  const input=$('#dictionary-search'); input.value=route.params.get('q') ?? '';
  selectedKey=route.params.get('concept'); searchPage=0;
  input.addEventListener('input',()=>{
    selectedKey=null; searchPage=0;
    const params={q:input.value}; history.replaceState(null,'',pathFor('dictionary',params)); route=readRoute();
    updateSearch();
  });
  updateSearch();
}

function resultButton(key, type, matches=[]) {
  const c=conceptByKey.get(key); if(!c)return '';
  const a=matches.find(a=>a.concept_key===key);
  const local=key.startsWith('LOCAL:');
  return `<button class="result-item ${selectedKey===key?'selected':''}" data-concept="${esc(key)}" aria-pressed="${selectedKey===key}"><span class="result-name">${esc(c.preferred_name)}</span>${a?`<span class="result-match">${esc(a.term)}</span>`:''}<span class="result-meta">${badge(local?'자체 관리 개념':entityLabels[c.entity_type] ?? c.entity_type,local?'blue':'gray')}<span>제공 항목 ${c.source_ids.length}건</span>${type==='partial'?badge('부분 일치','gray'):''}<span class="result-arrow" aria-hidden="true">↗</span></span></button>`;
}

function updateSearch({autoSelect=true}={}) {
  const q=$('#dictionary-search').value;
  const result=searchCatalog(data,q);
  const relatedKeys=result.related.map(r=>r.concept_key);
  let keys;
  if(!normalize(q)) {
    keys=[...data.concepts].sort((a,b)=>b.source_ids.length-a.source_ids.length || a.preferred_name.localeCompare(b.preferred_name,'en')).map(c=>c.concept_key);
  } else keys=[...result.exactKeys,...relatedKeys,...result.partialKeys];
  const pages=Math.max(1,Math.ceil(keys.length/pageSize)); searchPage=Math.min(searchPage,pages-1);
  const visible=keys.slice(searchPage*pageSize,(searchPage+1)*pageSize);
  if(autoSelect && !selectedKey && result.exactKeys.length===1) selectedKey=result.exactKeys[0];
  let previousGroup='';
  const items=visible.map(key=>{
    const type=!normalize(q)?'browse':result.exactKeys.includes(key)?'exact':relatedKeys.includes(key)?'related':'partial';
    const title={browse:'연결된 제공 항목이 많은 순서',exact:'등록 이름·별칭 일치',related:'관련 결과 · 동의어 병합 아님',partial:'부분 일치 · 탐색 결과'}[type];
    const group=previousGroup!==type?`<div class="result-group-label">${title}</div>`:''; previousGroup=type;
    return group+resultButton(key,type,type==='exact'?result.exactAliases:type==='browse'?[]:data.aliases.filter(a=>a.concept_key===key && normalize(a.term).includes(normalize(q))));
  }).join('');
  $('#results').classList.toggle('has-selection',!!selectedKey);
  $('#results').innerHTML=`<div class="result-heading"><b>${normalize(q)?'검색 결과':'개념 둘러보기'}</b><span>${keys.length}개 개념</span></div>
    ${result.exactKeys.length>1?`<div class="hold-result"><b>문맥 확인이 필요합니다.</b><br>같은 표기가 ${result.exactKeys.length}개 개념에 연결됩니다.</div>`:''}
    ${items || (result.holds.length || result.expressions.length ? '<div class="empty-state">해당 항목은 단일 개념으로 연결하지 않았습니다.<br>아래에서 원문과 처리 이유를 확인하세요.</div>' : '<div class="empty-state">등록된 이름을 찾지 못했습니다.<br>긴 질환명이나 다른 표기로 검색해 보세요.</div>')}
    ${[...result.holds,...result.expressions].map(r=>`<div class="hold-result">${decisionBadge(r)}<p>${esc(r.source_id)} · ${esc(r.keyword)}</p><button data-open-record="${r.source_id}">원문과 판단 이유 보기 ↗</button></div>`).join('')}
    <div class="pager"><button data-search-page="-1" ${searchPage===0?'disabled':''} aria-label="이전 개념 목록">← 이전</button><span>${searchPage+1} / ${pages}</span><button data-search-page="1" ${searchPage>=pages-1?'disabled':''} aria-label="다음 개념 목록">다음 →</button></div>`;
  const target=$('#dictionary-detail');
  // Same spelling, several concepts or held rows: show every row's context and decision side by side.
  const sameSpelling=term=>data.records.filter(r=>normalize(r.keyword)===normalize(term));
  const ambiguous=normalize(q) && (result.exactKeys.length>1 || result.holds.some(r=>normalize(r.keyword)===normalize(q)));
  $('#concept-explorer .explorer').classList.toggle('featured',!selectedKey && !normalize(q));
  if(selectedKey && conceptByKey.has(selectedKey)) {
    const c=conceptByKey.get(selectedKey);
    const requested=route.params.get('record');
    const row=recordById.get(c.source_ids.includes(requested)?requested:c.source_ids[0]);
    target.innerHTML=detailHTML(c,row,true);
    loadCandidates(row.source_id);
  } else if(!normalize(q)) {
    target.innerHTML=ambiguityHTML('CD',sameSpelling('CD'),true);
  } else if(ambiguous) {
    target.innerHTML=ambiguityHTML(q.trim(),sameSpelling(q),false);
  } else {
    target.innerHTML=`<div class="empty-state"><div class="empty-symbol" aria-hidden="true">⌕</div><h3>항목을 선택해 주세요</h3><p>항목을 선택하면 판단 이유, 제공 문맥과 연결된 이름을 볼 수 있습니다.</p>${result.holds.length?`<p>${result.holds.map(r=>`${esc(r.source_id)}는 추가 문맥이 없어 보류했습니다.`).join('<br>')}</p>`:''}</div>`;
  }
}

function ambiguityHTML(term,rows,featured) {
  return `<div class="badge-row">${featured?badge('대표 사례 표시 중','gray'):''}${badge('같은 표기 · 다른 처리','amber')}</div>
    <h2 class="ambiguity-title">${esc(term)}: 문맥에 따라 다른 처리</h2>
    <p class="ambiguity-lead">이 표기는 하나의 질환으로 확정하지 않았습니다. 문맥이 뜻을 가리키는 항목만 연결했습니다.${rows.some(r=>!r.concept_key)?' 근거가 없는 항목은 보류했습니다.':''}</p>
    <ol class="ambiguity-rows">${rows.map(r=>{
      const c=r.concept_key?conceptByKey.get(r.concept_key):null;
      return `<li class="ambiguity-row${c?'':' held'}"><div class="ambiguity-source"><span class="ambiguity-id">${esc(r.source_id)} · 제공 문맥</span><blockquote>${esc(r.raw_context)}</blockquote></div>
        <div class="ambiguity-result"><div class="ambiguity-outcome"><strong>${c?esc(c.preferred_name):'단일 개념 없음'}</strong>${decisionBadge(r)}</div><p>${esc(r.rationale_ko)} ${c?`<button class="text-button" data-concept="${esc(c.concept_key)}" data-record="${esc(r.source_id)}">전체 근거 ↗</button>`:`<button class="text-button" data-open-record="${esc(r.source_id)}">보류 사유 ↗</button>`}</p></div></li>`;
    }).join('')}</ol>
    <p class="example-other"><a href="#cases/cd">판단 기준: 약어의 여러 뜻 ↗</a>${featured?' · 다른 예시: <button class="text-button" data-query="T2DM">T2DM 표기 변형 ↗</button>':''}</p>`;
}

function atomsHTML(atoms) {
  const groups=new Map();
  for(const atom of atoms ?? []) {
    const key=atom.type+'|'+atom.source_span;
    if(!groups.has(key))groups.set(key,atom);
  }
  return [...groups.values()].map(a=>`<span class="atom" title="${esc(a.source_field)} [${a.start}:${a.end}]">${esc(a.source_span)}</span>`).join('');
}

function detailHTML(concept,row,fromSearch=false) {
  const aliases=concept?data.aliases.filter(a=>a.concept_key===concept.concept_key):[];
  const uniqueAliases=[...new Map(aliases.map(a=>[a.term,a])).values()];
  const ids=concept?.source_ids ?? [row.source_id];
  const names=row.concept_name_components ?? [], attributes=row.clinical_attributes ?? [];
  const related=concept?.related_concepts ?? [];
  return `${fromSearch?'<button class="back-link" data-results-back>← 검색 결과 목록</button>':''}
    <div class="badge-row">${decisionBadge(row)}${badge(entityLabels[row.entity_type] ?? row.entity_type,'gray')}</div>
    <div class="detail-title"><h2>${esc(concept?.preferred_name || row.keyword)}</h2><button class="subtle-button" data-copy-link aria-label="현재 판단 주소 복사">링크 ↗</button></div>
    <div class="detail-code" id="code-${row.source_id}">${esc(row.selected_standard_id ?? (row.concept_key?'자체 관리 개념 (LOCAL)':'단일 개념으로 연결하지 않은 입력'))}</div>
    ${row.research_decision==='LOCAL_CONCEPT'?'<p class="detail-subtitle">제공 문맥의 의미를 자체 개념으로 관리합니다. 같은 범위의 외부 표준 연결은 추가 검토가 필요합니다.</p>':''}
    <div class="detail-section"><p class="label">원문별 판단 <span class="small-count">${ids.length}</span></p>
    ${ids.length>1?`<div class="row-tabs" aria-label="연결된 원문 선택">${ids.map(id=>`<button class="${id===row.source_id?'active':''}" data-select-record="${id}" data-owner-concept="${esc(concept.concept_key)}" aria-pressed="${id===row.source_id}">${id} · ${esc(recordById.get(id).keyword)}</button>`).join('')}</div>`:''}
    <div class="label">${esc(row.source_id)} · ${esc(row.keyword)}</div><blockquote class="source-quote">${esc(row.raw_context)}</blockquote>
    ${row.context_quality==='TEMPLATE_NO_ADDITIONAL_DETAILS'?'<p class="source-note">질환명 외의 추가 아형·진단 정보가 없는 문맥입니다.</p>':''}
    <p class="label label-spaced">판단 이유</p><p class="rationale rationale-strong">${esc(row.rationale_ko)}</p>
    ${(attributes.length || names.length)?`<div class="observations"><div class="observation"><p>원문의 추가 조건</p>${atomsHTML(attributes) || '<p>별도 조건이 기록돼 있지 않습니다.</p>'}</div><div class="observation"><p>질환명 구성 요소</p>${atomsHTML(names) || '<p>분리해 기록한 구성 요소가 없습니다.</p>'}</div></div>`:''}
    ${(row.scope_assumptions ?? []).map(scope=>`<div class="info-note"><strong>기본 의미와 적용 조건</strong>${esc(scopeLabels[scope.sense] ?? scope.override_if)}</div>`).join('')}
    ${(row.definition_warnings ?? []).map(w=>`<div class="warning-note"><strong>출처 정의·범위 확인</strong>${esc(w.rationale_ko)}</div>`).join('')}
    ${row.expression?`<div class="info-note"><strong>${esc(row.expression.operator)} 조건으로 보존</strong>전체 표현을 한 질환의 동의어로 등록하지 않습니다.<div>${row.expression.operands.map(id=>`<a href="${esc(pathFor('dictionary',{concept:id}))}">${esc(conceptByKey.get(id)?.preferred_name ?? id)} ↗</a>`).join(' <span aria-hidden="true"> · </span> ')}</div></div>`:''}
    ${uniqueAliases.length?`<div class="detail-section"><p class="label">연결된 이름 <span class="small-count">${uniqueAliases.length}</span></p><div class="alias-list">${uniqueAliases.map(a=>`<span class="alias" title="${esc(kindLabels[a.kind] ?? a.kind)}${a.context_required?' · 문맥 확인 필요':''}">${esc(a.term)}${a.context_required?' · 문맥':''}</span>`).join('')}</div></div>`:''}
    ${related.length?`<div class="info-note"><strong>관련 개념 · 같은 뜻으로 병합하지 않음</strong>${related.map(link=>`<a href="${esc(pathFor('dictionary',{concept:link.concept_key}))}">${esc(conceptByKey.get(link.concept_key)?.preferred_name ?? link.concept_key)} ↗</a><br>${esc(link.rationale_ko)}`).join('<br>')}</div>`:''}
    <div class="detail-section"><h3>검토한 후보와 범위 관계</h3><p class="source-note">관계 방향: 원문 → 후보. 코드의 존재와 의미 범위의 일치는 구별합니다.</p><div id="candidates-${row.source_id}"><p class="source-note">후보 정의를 불러오고 있습니다.</p></div></div>
    <div class="detail-section"><p class="label">판단에 참고한 출처</p><div class="source-link-list">${sourcesHTML(row.evidence_refs) || '<span class="source-note">제공 원문과 판단 가이드라인을 기준으로 기록했습니다.</span>'}</div><p class="source-note">${esc((row.rule_ids ?? []).join(' · '))} · <a href="#cases">판단 기준 ↗</a></p></div></div>`;
}

async function loadCandidates(id) {
  try {
    if(!detailCache.has(id))detailCache.set(id,fetch(`./data/records/${encodeURIComponent(id)}.json`).then(res=>{if(!res.ok)throw Error('HTTP '+res.status); return res.json();}));
    const row=await detailCache.get(id), target=document.getElementById('candidates-'+id);
    if(!target)return;
    const items=row.reviewed_candidates ?? [];
    const selected=items.find(c=>c.candidate_key===row.selected_standard_id), code=document.getElementById('code-'+id);
    if(selected && code && safeURL(selected.source_url))code.innerHTML=`<a href="${esc(safeURL(selected.source_url))}" target="_blank" rel="noopener noreferrer">${esc(row.selected_standard_id)} ↗</a>`;
    target.innerHTML=items.map(c=>`<details data-candidate-key="${esc(c.candidate_key)}"><summary>${badge(relations[c.relation] ?? c.relation,c.relation==='UNKNOWN'?'amber':c.relation==='EXACT'?'':'gray')}<span class="candidate-heading"><span>${esc(c.label)}</span><span class="candidate-origin">${badge(c.system || c.candidate_key.split(':')[0],'gray')}<span>${esc(c.candidate_key)}</span></span></span></summary><div class="candidate-body"><div class="candidate-meta">${esc(c.candidate_key)}${c.candidate_key===row.selected_standard_id?' · 선택한 대표 ID':''} · ${esc(c.version.startsWith('LIVE_')?'조회 시점 스냅샷':c.version)}${c.active===false?' · 비활성':''}</div>${c.definitions.map(d=>`<p class="candidate-definition"><b>${esc(d.source)}</b>${esc(d.text || '정의가 제공되지 않았습니다.')}</p>`).join('')}<a class="source-link" href="${esc(safeURL(c.source_url))}" target="_blank" rel="noopener noreferrer">공식 출처 확인 ↗</a></div></details>`).join('') || '<p class="source-note">범위 관계를 확정해 기록한 외부 후보가 없습니다. 위 판단 이유와 출처를 확인해 주세요.</p>';
    const requested=route.params.get('candidate');
    if(route.page==='records' && route.params.get('record')===id && requested) {
      const detail=[...target.querySelectorAll('details')].find(node=>node.dataset.candidateKey===requested);
      if(detail) { detail.open=true;detail.querySelector('summary').focus({preventScroll:true});detail.scrollIntoView({block:'start',behavior:'instant'}); }
    }
  } catch {
    detailCache.delete(id);
    const target=document.getElementById('candidates-'+id);
    if(target)target.innerHTML=`<div class="warning-note">후보 정의를 불러오지 못했습니다. <button class="subtle-button" data-retry-candidate="${id}">다시 시도</button></div>`;
  }
}

function recordsPage() {
  const selected=recordById.get(route.params.get('record'));
  if(selected) {
    const params=currentParams(); delete params.record;
    $('#main-content').innerHTML=`<div class="container">${heading('키워드별 검토 기록','분류 상세','선택한 개념과 제공 문맥, 판단 이유를 확인할 수 있습니다.')}<button class="back-link" data-records-back>← 분류 결과 목록</button><div class="record-detail-wrap"><div class="panel detail">${detailHTML(conceptByKey.get(selected.concept_key),selected)}</div></div></div>`;
    loadCandidates(selected.source_id); return;
  }
  $('#main-content').innerHTML=`<div class="container">${heading('제공 키워드 300건','키워드별 분류 결과','항목을 선택하면 제공 문맥과 판단 이유, 참고한 출처를 볼 수 있습니다.')}
    <div class="filter-bar"><label class="search-box">${icon}<input id="record-search" type="search" placeholder="항목 번호·키워드·문맥 검색" aria-label="분류 결과 검색"></label>
    <select id="decision-filter" aria-label="처리 상태 필터"><option value="">모든 처리 상태</option>${[['PROVISIONAL_MAP','개념 연결'],['LOCAL_CONCEPT','자체 관리 개념'],['ROUTE_ENTITY','별도 개체'],['SPLIT_EXPRESSION','OR 조건'],['HOLD','보류']].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
    <select id="entity-filter" aria-label="개체 유형 필터"><option value="">모든 개체 유형</option>${[...new Set(data.records.map(r=>r.entity_type))].map(e=>`<option value="${e}">${esc(entityLabels[e] ?? e)}</option>`).join('')}</select></div>
    <div id="record-table" class="panel section-space"></div></div>`;
  $('#record-search').value=route.params.get('q') ?? '';
  $('#decision-filter').value=route.params.get('decision') ?? '';
  $('#entity-filter').value=route.params.get('entity') ?? '';
  const update=()=>{
    recordPage=0; const params={q:$('#record-search').value,decision:$('#decision-filter').value,entity:$('#entity-filter').value};
    history.replaceState(null,'',pathFor('records',params)); route=readRoute(); updateRecords();
  };
  $('#record-search').addEventListener('input',update);
  $('#decision-filter').addEventListener('change',update);
  $('#entity-filter').addEventListener('change',update);
  recordPage=0; updateRecords();
}

function updateRecords() {
  const rows=filterRecords(data.records,{query:$('#record-search').value,decision:$('#decision-filter').value,entity:$('#entity-filter').value});
  const pages=Math.max(1,Math.ceil(rows.length/rowPageSize)); recordPage=Math.min(recordPage,pages-1);
  $('#record-table').innerHTML=`<div class="table-caption"><span id="record-count">${rows.length} / ${data.records.length}건</span><a href="./downloads/judgments.csv" download>전체 CSV 내려받기 ↓</a></div><p class="record-scroll-note">표를 좌우로 밀면 처리 상태와 판단 이유를 볼 수 있습니다.</p><div class="table-wrap" tabindex="0" role="region" aria-label="분류 결과 표 · 좌우 스크롤 가능"><table class="record-table"><thead><tr><th>항목 번호</th><th>제공 키워드</th><th>선택한 개념</th><th>처리 상태</th><th>판단 요약</th></tr></thead><tbody>${rows.slice(recordPage*rowPageSize,(recordPage+1)*rowPageSize).map(r=>`<tr data-open-record="${r.source_id}"><td><button class="subtle-button" data-open-record="${r.source_id}" aria-label="${r.source_id} 판단 상세 보기">${r.source_id}</button></td><td class="keyword-cell">${esc(r.keyword)}</td><td>${esc(r.standard_name || '단일 개념 연결 보류')}</td><td>${decisionBadge(r)}</td><td class="reason-cell"><span class="truncate">${esc(r.rationale_ko)}</span></td></tr>`).join('') || '<tr><td colspan="5"><div class="empty-state">조건에 맞는 항목이 없습니다. 검색어나 필터를 바꿔 보세요.</div></td></tr>'}</tbody></table></div><div class="pager"><button data-record-page="-1" ${recordPage===0?'disabled':''}>← 이전</button><span>${recordPage+1} / ${pages}</span><button data-record-page="1" ${recordPage>=pages-1?'disabled':''}>다음 →</button></div>`;
}

function aliasesPage() {
  $('#main-content').innerHTML=`<div class="container">${heading('표현과 개념의 연결','별칭 연결 목록',`${data.metadata.aliases}개 연결을 확인할 수 있습니다. 고유 검색 문자열은 ${data.metadata.unique_alias_spellings}개이며, 같은 표현도 제공 항목이나 개념이 다르면 별도 연결로 기록합니다.`)}
    <a class="back-link" href="#dictionary">← 동의어 사전으로 돌아가기</a>
    <label class="search-box">${icon}<input id="alias-search" type="search" placeholder="별칭·개념명·항목 번호 검색" aria-label="별칭 연결 검색"></label>
    <div id="alias-table" class="panel section-space"></div></div>`;
  const input=$('#alias-search');input.value=route.params.get('q') ?? '';aliasPage=0;
  input.addEventListener('input',()=>{
    aliasPage=0;history.replaceState(null,'',pathFor('aliases',{q:input.value}));route=readRoute();updateAliases();
  });
  updateAliases();
}

function updateAliases() {
  const q=normalize($('#alias-search').value);
  const rows=data.aliases.filter(a=>!q || [a.term,a.source_id,conceptByKey.get(a.concept_key)?.preferred_name ?? ''].some(value=>normalize(value).includes(q)));
  const pages=Math.max(1,Math.ceil(rows.length/rowPageSize));aliasPage=Math.min(aliasPage,pages-1);
  $('#alias-table').innerHTML=`<div class="table-caption"><span id="alias-count">${rows.length} / ${data.aliases.length}건</span><a href="./downloads/aliases.csv" download>전체 별칭 CSV 내려받기 ↓</a></div>
    <p class="alias-scroll-note">표를 좌우로 밀면 연결한 개념과 근거 항목을 확인할 수 있습니다.</p><div class="table-wrap" tabindex="0" role="region" aria-label="별칭 연결 표 · 좌우 스크롤 가능"><table class="alias-table"><thead><tr><th>등록된 표현</th><th>연결한 개념</th><th>근거 항목</th><th>적용 조건</th></tr></thead><tbody>${rows.slice(aliasPage*rowPageSize,(aliasPage+1)*rowPageSize).map(a=>`<tr><td><strong>${esc(a.term)}</strong><br><span class="source-note">${esc(kindLabels[a.kind] ?? a.kind)}</span></td><td><a class="source-link" href="${esc(pathFor('dictionary',{concept:a.concept_key,record:a.source_id}))}">${esc(conceptByKey.get(a.concept_key)?.preferred_name ?? a.concept_key)} ↗</a></td><td><a class="source-link" href="${esc(pathFor('records',{record:a.source_id}))}">${esc(a.source_id)} · 판단 근거 ↗</a></td><td>${a.context_required?badge('문맥 확인 필요','amber'):badge('검토한 개념 연결','gray')}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty-state">일치하는 별칭 연결이 없습니다. 다른 표현으로 검색해 보세요.</div></td></tr>'}</tbody></table></div>
    <div class="pager"><button data-alias-page="-1" ${aliasPage===0?'disabled':''} aria-label="이전 별칭 목록">← 이전</button><span>${aliasPage+1} / ${pages}</span><button data-alias-page="1" ${aliasPage>=pages-1?'disabled':''} aria-label="다음 별칭 목록">다음 →</button></div>`;
}

function criteriaTabs(active) {
  return `<nav class="criteria-tabs" aria-label="판단 기준 구역">${[['rules','공통 기준','#cases'],['examples','사례별 검토','#cases/examples']].map(([key,label,href])=>`<a href="${href}" class="${active===key?'active':''}" ${active===key?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
}
async function loadDocument(node,key,section) {
  try {
    if(!docCache.has(key))docCache.set(key,fetch(`./content/${key}.html`).then(r=>{if(!r.ok)throw Error('document');return r.text();}));
    const html=await docCache.get(key);
    if(!node.isConnected)return;
    node.innerHTML=html;focusMaterialsSection(node,section);
  } catch {
    docCache.delete(key);
    if(node.isConnected)node.innerHTML='<p>문서를 불러오지 못했습니다. 새로고침하거나 제출 파일의 docs 폴더를 확인해 주세요.</p>';
  }
}
function casesPage() {
  const story=data.stories.find(s=>s.id===route.sub);
  const intro=heading('분류 원칙과 적용 사례','판단 기준','공통 규칙과 실제 사례에서 어떤 표현을 묶고 구별했는지 확인할 수 있습니다.');
  if(!story && route.sub!=='examples') {
    $('#main-content').innerHTML=`<div class="container">${intro}${criteriaTabs('rules')}<article id="document-content" class="panel document markdown" data-document="guidelines"><p class="loading-state">판단 기준을 불러오고 있습니다.</p></article><p class="document-next"><a href="#cases/examples">사례별 검토와 개념 비교 보기 ↗</a></p></div>`;
    loadDocument($('#document-content'),'guidelines',route.params.get('section'));return;
  }
  if(!story) {
    $('#main-content').innerHTML=`<div class="container">${intro}${criteriaTabs('examples')}${caseGroups.map(([title,ids])=>`<section class="case-group"><h2>${esc(title)}</h2><div class="case-grid">${featureCards(ids.map(id=>data.stories.find(s=>s.id===id)))}</div></section>`).join('')}
    <section class="section-space"><details><summary>${data.comparisons.length}쌍의 비교 기록</summary><div class="table-wrap"><table><thead><tr><th>비교한 항목</th><th>판단 이유</th></tr></thead><tbody>${data.comparisons.map(c=>`<tr><td><a href="${pathFor('records',{record:c.left_source_id})}">${esc(c.left_keyword)} · ${c.left_source_id}</a><br><a href="${pathFor('records',{record:c.right_source_id})}">${esc(c.right_keyword)} · ${c.right_source_id}</a></td><td>${esc(c.rationale_ko)}</td></tr>`).join('')}</tbody></table></div></details><p class="source-note">구축에 사용한 규칙의 일관성을 확인한 기록입니다. 독립 평가셋은 아닙니다.</p></section><section id="concept-comparison" tabindex="-1" class="panel document embedded-comparison"></section></div>`;
    mountCompare($('#concept-comparison'),data);focusMaterialsSection($('#main-content'),route.params.get('section'));return;
  }
  $('#main-content').innerHTML=`<div class="container">${intro}${criteriaTabs('examples')}<a class="back-link" href="#cases/examples">← 사례 목록</a><div class="case-layout"><nav class="case-sidebar" aria-label="판단 사례 목록">${data.stories.map(s=>`<a class="${s.id===story.id?'active':''}" href="#cases/${s.id}">${esc(s.short_title)}</a>`).join('')}</nav><article class="panel case-story"><span class="feature-kicker">${esc(caseTag(story.tag))}</span><h2>${esc(storyTitles[story.id] ?? story.title)}</h2><p>${esc(story.explanation)}</p><div class="info-note"><strong>판단 원칙</strong>${esc(story.principle)}</div>${structuredReviewHTML(story)}<h3 class="case-final-heading">최종 처리와 원문 근거</h3>${story.source_ids.map(id=>{
    const r=recordById.get(id);return `<section class="case-row"><div class="case-row-head">${badge(id,'gray')}<span>${esc(r.keyword)}</span>${decisionBadge(r)}</div><blockquote class="source-quote">${esc(r.raw_context)}</blockquote><p><b>선택:</b> ${esc(r.standard_name || '단일 개념 연결 보류')}</p><p>${esc(r.rationale_ko)}</p><a href="${pathFor('records',{record:id})}">후보 정의와 전체 출처 보기 ↗</a></section>`;
  }).join('')}<div class="detail-section"><h3>반례·적용 조건</h3><p>${esc(story.exception)}</p><a href="#cases">공통 판단 기준 보기 ↗</a></div></article></div></div>`;
}

const materials={methodology:['구축 과정','methodology'],research:['서비스 조사','research'],audit:['검증과 한계',null],downloads:['파일과 실행 방법','run']};
const materialAliases={boundaries:['methodology','counterexamples'],analyzer:['methodology',''],'audit-method':['audit','method'],review:['methodology','']};
function focusMaterialsSection(root,section) {
  const ids={compare:'concept-comparison',counterexamples:'method-counterexamples',future:'method-future',method:'audit-method-section'};
  const target=root.querySelector('#'+(ids[section]??'not-a-section'));
  if(target)requestAnimationFrame(()=>{if(target.isConnected){target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'instant'});}});
}
async function materialsPage() {
  const alias=materialAliases[route.sub];
  if(alias){history.replaceState(null,'',pathFor('materials/'+alias[0],alias[1]?{section:alias[1]}:{}));route=readRoute();}
  const tab=materials[route.sub]?route.sub:'methodology',section=route.params.get('section');
  $('#main-content').innerHTML=`<div class="container">${heading('조사·설계·검증 기록','구축 보고서','구축 과정과 서비스 조사, 검증 결과, 실행 파일을 제공합니다.')}<nav class="materials-tabs" aria-label="구축 보고서 구역">${Object.entries(materials).map(([key,[label]])=>`<a class="${tab===key?'active':''}" href="#materials/${key}">${label}</a>`).join('')}</nav>
    ${tab==='downloads'?`<div class="download-grid">${[
      ['CSV · 300개 제공 항목','전체 판단표','원문·선택한 개념·판단 이유·출처를 담은 표','judgments.csv'],
      ['CSV · 별칭 연결','동의어 목록','검토한 이름·별칭과 연결된 개념','aliases.csv'],
      ['ZIP · 코드·자료','제출 프로젝트 전체','독립 실행 코드, 문서, 판정 데이터와 공식 근거','indication-atlas-submission.zip'],
      ['JSON · 데이터','판정 데이터 JSON','원문 조건·이름 구성 요소·후보 정의와 범위 관계','records.json']
    ].map(([type,title,text,file])=>`<a class="download-card" href="./downloads/${file}" download><small>${type} ↓</small><h3>${title}</h3><p>${text}</p></a>`).join('')}</div>`:''}
    <article id="document-content" class="panel document markdown" data-document="${tab}"><p class="loading-state">문서를 불러오고 있습니다.</p></article></div>`;
  if(tab==='audit'){const node=$('#document-content');await mountAudit(node);if(node.isConnected)focusMaterialsSection(node,section);return;}
  await loadDocument($('#document-content'),materials[tab][1],section);
}

function render() {
  route=readRoute();
  // Keep previously shared guideline/comparison links while moving them under judgment criteria.
  if(route.page==='materials' && ['guidelines','compare'].includes(route.sub)) {
    const params=currentParams(),comparison=route.sub==='compare' || params.section==='compare';
    if(comparison)params.section='compare';
    history.replaceState(null,'',pathFor(comparison?'cases/examples':'cases',params));route=readRoute();
  }
  document.querySelectorAll('[data-nav]').forEach(a=>{
    const active=a.dataset.nav===(['aliases','analyze'].includes(route.page)?'dictionary':route.page);a.classList.toggle('active',active);
    if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  const titles={dictionary:'동의어 사전',aliases:'별칭 연결',analyze:'새 키워드 확인',records:'분류 결과',cases:'판단 기준',materials:'구축 보고서'};
  document.title=`${titles[route.page] ?? '동의어 사전'} | Indication Atlas`;
  if(route.page==='records')recordsPage();
  else if(route.page==='aliases')aliasesPage();
  else if(route.page==='cases')casesPage();
  else if(route.page==='materials')materialsPage();
  else if(route.page==='analyze')mountAnalyzer($('#main-content'),data);
  else dictionaryPage();
}

document.addEventListener('click', async event=>{
  const button=event.target.closest('button'); if(!button)return;
  const d=button.dataset;
  if(d.query!=null) { navigate('dictionary',{q:d.query}); return; }
  if(d.case) { navigate('cases/'+d.case); return; }
  if(d.concept) { navigate('dictionary',{q:$('#dictionary-search')?.value ?? '',concept:d.concept,...(d.record?{record:d.record}:{})}); return; }
  if(d.openRecord) { navigate('records',{...currentParams(),record:d.openRecord}); return; }
  if(d.selectRecord) { navigate(route.page,{...currentParams(),concept:d.ownerConcept,record:d.selectRecord}); return; }
  if(d.searchPage) { if(route.params.size===0)selectedKey=null; searchPage+=Number(d.searchPage);updateSearch();return; }
  if(d.recordPage) { recordPage+=Number(d.recordPage);updateRecords();return; }
  if(d.aliasPage) { aliasPage+=Number(d.aliasPage);updateAliases();return; }
  if('recordsBack' in d) { const p=currentParams();delete p.record;delete p.concept;delete p.candidate;navigate('records',p);return; }
  if('resultsBack' in d) { selectedKey=null; const q=$('#dictionary-search').value; history.replaceState(null,'',pathFor('dictionary',{q}));route=readRoute();updateSearch({autoSelect:false});$('#results').scrollIntoView({block:'start'});return; }
  if('copyLink' in d) { try { await navigator.clipboard.writeText(location.href);toast('현재 판단의 주소를 복사했습니다.'); } catch { toast('주소창의 링크를 복사해 주세요.'); } return; }
  if(d.retryCandidate)loadCandidates(d.retryCandidate);
});
document.addEventListener('click',event=>{
  if(event.target.closest('[data-concept-list]') && route.page==='dictionary' && route.params.get('view')==='concepts') {
    event.preventDefault();$('#search-heading').focus({preventScroll:true});$('#concept-explorer').scrollIntoView({block:'start',behavior:'instant'});return;
  }
  if(event.target.closest('.skip-link')) {
    event.preventDefault();$('#main-content').focus();$('#main-content').scrollIntoView({block:'start'});return;
  }
  if(event.target.closest('button,a'))return;
  const row=event.target.closest('tr[data-open-record]');
  if(row)navigate('records',{...currentParams(),record:row.dataset.openRecord});
});
document.addEventListener('keydown',event=>{
  if(event.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
    const input=$('#dictionary-search') ?? $('#record-search') ?? $('#alias-search');
    if(input) { event.preventDefault();input.focus(); }
  }
});
window.addEventListener('hashchange',()=>{
  const previous=route, next=readRoute(), scrollY=window.scrollY;
  render();
  if(next.page==='dictionary' && next.params.get('view')==='concepts') {
    $('#search-heading').focus({preventScroll:true});$('#concept-explorer').scrollIntoView({block:'start',behavior:'instant'});return;
  }
  if(previous?.page==='dictionary' && next.page==='dictionary') {
    if(window.innerWidth<=760 && selectedKey)$('#dictionary-detail').scrollIntoView({block:'start',behavior:'instant'});
    else window.scrollTo({top:scrollY,behavior:'instant'});
  } else window.scrollTo({top:0,behavior:'instant'});
});

try {
  const response=await fetch('./data/catalog.json');
  if(!response.ok)throw Error('Catalog HTTP '+response.status);
  data=await response.json();
  conceptByKey=new Map(data.concepts.map(c=>[c.concept_key,c]));
  recordById=new Map(data.records.map(r=>[r.source_id,r]));
  $('#data-version').textContent=`자료 기준 ${data.metadata.as_of} · v${data.metadata.dataset_version}`;
  render();
  if(route.page==='dictionary' && route.params.get('view')==='concepts') {
    $('#search-heading').focus({preventScroll:true});$('#concept-explorer').scrollIntoView({block:'start',behavior:'instant'});
  }
} catch {
  $('#main-content').innerHTML='<div class="container"><div class="empty-state"><h1>데이터를 불러오지 못했습니다.</h1><p>인터넷 연결을 확인한 뒤 새로고침해 주세요.</p><p>로컬 실행 시에는 README의 웹 서버 실행 방법을 사용해 주세요.</p><a href="./downloads/judgments.csv">전체 판단표 내려받기 ↓</a></div></div>';
}
