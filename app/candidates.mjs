// On-demand candidate lookup for an unregistered expression in MONDO and NCIt (via EBI OLS)
// and MeSH (NLM RDF lookup). Requests run only when the user asks. The comparison is a fixed
// rule over a saved response record: the same record always gives the same result. It finds
// linked records by name and cross-reference; it does not compare clinical scope, and a
// proposal is never written to the dictionary. MONDO reuses NCIt/MeSH knowledge, so linked
// records are not three independent votes.
export const COMPARE_VERSION = 'candidates-2';
export const NAME_POLICY = 'name-match-1: NFKC/case, word-internal hyphen or underscore as space, comma/parentheses as space, possessive removed; +/- signs, slashes and numbers kept; MeSH inverted terms also read in natural order';
const OLS='https://www.ebi.ac.uk/ols4/api',MESH='https://id.nlm.nih.gov/mesh/lookup';
const LIMITS={mondoTerms:3,ncitTerms:3,meshDetails:4};
export const norm=s=>String(s ?? '').normalize('NFKC').toLowerCase().replace(/['’]s\b/gu,'')
  .replace(/(?<=[\p{L}\p{N}])[-_‐‑](?=[\p{L}\p{N}])/gu,' ').replace(/[,()]+/gu,' ').replace(/\s+/gu,' ').trim();
const unique=xs=>[...new Set(xs)];
const olsFields='obo_id,label,exact_synonyms,related_synonyms,narrow_synonyms,broad_synonyms,is_obsolete,description';
// An all-caps short string looks like an abbreviation unless it is the concept's own name (MALARIA).
export const looksLikeAbbreviation=term=>/^[A-Z][A-Z0-9-]{1,6}$/u.test(String(term).trim());

export function lookupUrls(term) {
  const q=encodeURIComponent(String(term).trim());
  const search=(ontology,exact)=>`${OLS}/search?q=${q}&ontology=${ontology}&rows=${exact?10:8}&queryFields=label,synonym&type=class&fieldList=${olsFields}${exact?'&exact=true':''}`;
  return {mondo_exact:search('mondo',true),mondo_fuzzy:search('mondo',false),ncit_exact:search('ncit',true),ncit_fuzzy:search('ncit',false),
    mesh_exact:`${MESH}/descriptor?label=${q}&match=exact&limit=5`,mesh_contains:`${MESH}/descriptor?label=${q}&match=contains&limit=5`,
    mondo_info:`${OLS}/ontologies/mondo`,ncit_info:`${OLS}/ontologies/ncit`};
}
const termUrl=(ontology,id)=>`${OLS}/ontologies/${ontology}/terms?obo_id=${encodeURIComponent(id)}`;
const meshDetailsUrl=id=>`${MESH}/details?descriptor=${encodeURIComponent(id)}&includes=terms`;

async function getJSON(url,fetchImpl,timeout) {
  const controller=typeof AbortController==='function'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeout):null;
  try {
    const response=await fetchImpl(url,controller?{signal:controller.signal}:{});
    if(!response.ok)return {url,ok:false,error:response.status===429?'HTTP 429 요청 한도':'HTTP '+response.status};
    return {url,ok:true,data:await response.json()};
  } catch(e) { return {url,ok:false,error:e.name==='AbortError'?'timeout':String(e.message ?? e)}; }
  finally { if(timer)clearTimeout(timer); }
}
const olsDocs=(r,prefix)=>r?.ok?(r.data.response?.docs ?? []).filter(d=>String(d.obo_id ?? '').startsWith(prefix)):[];
const termOf=r=>r?.ok?r.data._embedded?.terms?.[0] ?? null:null;

// Collects raw responses; compareCandidates() reads only this record. infoCache shares the
// ontology version lookups between terms.
export async function fetchCandidates(term,{fetchImpl=globalThis.fetch,timeout=12000,now=()=>new Date().toISOString(),infoCache=null}={}) {
  const urls=lookupUrls(term),get=url=>getJSON(url,fetchImpl,timeout),responses={};
  const info=url=>{
    if(!infoCache)return get(url);
    if(!infoCache.has(url))infoCache.set(url,get(url).then(r=>{if(!r.ok)infoCache.delete(url);return r;}));
    return infoCache.get(url);
  };
  const first=[['mondo_exact',get],['ncit_exact',get],['mesh_exact',get],['mondo_info',info],['ncit_info',info]];
  (await Promise.all(first.map(([k,f])=>f(urls[k])))).forEach((r,i)=>responses[first[i][0]]=r);
  const fallback=[];
  if(responses.mondo_exact.ok && !olsDocs(responses.mondo_exact,'MONDO:').length)fallback.push('mondo_fuzzy');
  if(responses.ncit_exact.ok && !olsDocs(responses.ncit_exact,'NCIT:').length)fallback.push('ncit_fuzzy');
  if(responses.mesh_exact.ok && !(responses.mesh_exact.data ?? []).length)fallback.push('mesh_contains');
  (await Promise.all(fallback.map(k=>get(urls[k])))).forEach((r,i)=>responses[fallback[i]]=r);
  const mondoAll=unique([...olsDocs(responses.mondo_exact,'MONDO:'),...olsDocs(responses.mondo_fuzzy,'MONDO:')].map(d=>d.obo_id));
  const mondoIds=mondoAll.slice(0,LIMITS.mondoTerms),terms=await Promise.all(mondoIds.map(id=>get(termUrl('mondo',id))));
  responses.mondo_terms=Object.fromEntries(mondoIds.map((id,i)=>[id,terms[i]]));
  // Cross-reference targets come first so the limits never drop the records the rule needs.
  const xrefOf=db=>unique(terms.flatMap(r=>(termOf(r)?.obo_xref ?? []).filter(x=>x.database===db).map(x=>x.id)));
  const ncitAll=xrefOf('NCIT').filter(id=>/^C\d+$/u.test(id)).map(id=>'NCIT:'+id),ncitIds=ncitAll.slice(0,LIMITS.ncitTerms);
  const ncitTerms=await Promise.all(ncitIds.map(id=>get(termUrl('ncit',id))));
  responses.ncit_terms=Object.fromEntries(ncitIds.map((id,i)=>[id,ncitTerms[i]]));
  const looked=[responses.mesh_exact,responses.mesh_contains].flatMap(r=>r?.ok?r.data ?? []:[]).map(d=>String(d.resource).split('/').pop());
  const meshAll=unique([...xrefOf('MESH').filter(id=>/^D\d+$/u.test(id)),...looked]),meshIds=meshAll.slice(0,LIMITS.meshDetails);
  const details=await Promise.all(meshIds.map(id=>get(meshDetailsUrl(id))));
  responses.mesh_details=Object.fromEntries(meshIds.map((id,i)=>[id,details[i]]));
  return {format:COMPARE_VERSION,term:String(term).trim(),retrieved_at:now(),
    truncated:{mondo_terms:Math.max(0,mondoAll.length-mondoIds.length),ncit_terms:Math.max(0,ncitAll.length-ncitIds.length),mesh_details:Math.max(0,meshAll.length-meshIds.length)},responses};
}

const levelOrder=['LABEL','EXACT_SYNONYM','ENTRY_TERM','RELATED_SYNONYM','NARROW_SYNONYM','BROAD_SYNONYM','PARTIAL'];
function olsLevel(q,doc) {
  if(norm(doc.label)===q)return 'LABEL';
  for(const [field,level] of [['exact_synonyms','EXACT_SYNONYM'],['related_synonyms','RELATED_SYNONYM'],['narrow_synonyms','NARROW_SYNONYM'],['broad_synonyms','BROAD_SYNONYM']])
    if((doc[field] ?? []).some(s=>norm(s)===q))return level;
  return 'PARTIAL';
}
const meshForms=label=>{const parts=String(label).split(/,\s*/u);return unique([norm(label),parts.length===2?norm(parts[1]+' '+parts[0]):null].filter(Boolean));};
const exactLevel=c=>['LABEL','EXACT_SYNONYM','ENTRY_TERM'].includes(c.level);
const iriId=iri=>{
  const s=String(iri);
  if(/NCIT_C\d+$/u.test(s))return 'NCIT:'+s.split('NCIT_').pop();
  if(/\/mesh\/D\d+$/u.test(s))return 'MESH:'+s.split('/').pop();
  return null;
};
// MONDO states the mapping precision; only an exact match counts as a name-and-xref link.
function xrefRelations(term) {
  const rel=new Map(),a=term?.annotation ?? {};
  for(const [key,kind] of [['has exact match','EXACT_MATCH'],['has close match','CLOSE_MATCH'],['has broad match','BROAD_MATCH'],['has narrow match','NARROW_MATCH'],['has related match','RELATED_MATCH']])
    for(const iri of a[key] ?? []){const id=iriId(iri);if(id && !rel.has(id))rel.set(id,kind);}
  for(const x of term?.obo_xref ?? [])if(['NCIT','MESH'].includes(x.database) && !rel.has(`${x.database}:${x.id}`))rel.set(`${x.database}:${x.id}`,'XREF_UNQUALIFIED');
  return rel;
}

export function compareCandidates(record) {
  const q=norm(record.term),r=record.responses,failures=[],flags=[];
  const fail=(source,step,res)=>{if(res && !res.ok)failures.push({source,step,error:res.error});};
  fail('MONDO','이름 검색',r.mondo_exact);fail('MONDO','대체 검색',r.mondo_fuzzy);fail('NCIt','이름 검색',r.ncit_exact);fail('NCIt','대체 검색',r.ncit_fuzzy);
  fail('MeSH','이름 검색',r.mesh_exact);fail('MeSH','대체 검색',r.mesh_contains);
  for(const [id,v] of Object.entries(r.mondo_terms ?? {}))fail('MONDO',`상세 ${id}`,v);
  for(const [id,v] of Object.entries(r.ncit_terms ?? {}))fail('NCIt',`교차참조 대상 ${id}`,v);
  for(const [id,v] of Object.entries(r.mesh_details ?? {}))fail('MeSH',`상세 ${id}`,v);
  const searchDone=(exact,fuzzy,has)=>!!exact?.ok && (has || !!fuzzy?.ok);
  const search={mondo:searchDone(r.mondo_exact,r.mondo_fuzzy,olsDocs(r.mondo_exact,'MONDO:').length>0),
    ncit:searchDone(r.ncit_exact,r.ncit_fuzzy,olsDocs(r.ncit_exact,'NCIT:').length>0),
    mesh:searchDone(r.mesh_exact,r.mesh_contains,(r.mesh_exact?.ok?r.mesh_exact.data ?? []:[]).length>0)};
  // ERROR only when no request for the source succeeded; any mix of success and failure is PARTIAL.
  const status=(name,responses)=>!failures.some(f=>f.source===name)?'OK':responses.some(x=>x?.ok)?'PARTIAL':'ERROR';
  const st={mondo:status('MONDO',[r.mondo_exact,r.mondo_fuzzy,...Object.values(r.mondo_terms ?? {})]),ncit:status('NCIt',[r.ncit_exact,r.ncit_fuzzy,...Object.values(r.ncit_terms ?? {})]),
    mesh:status('MeSH',[r.mesh_exact,r.mesh_contains,...Object.values(r.mesh_details ?? {})])};
  const rank=list=>list.sort((a,b)=>levelOrder.indexOf(a.level)-levelOrder.indexOf(b.level));
  const seen=new Set(),mondo=rank([...olsDocs(r.mondo_exact,'MONDO:'),...olsDocs(r.mondo_fuzzy,'MONDO:')].filter(d=>!seen.has(d.obo_id) && seen.add(d.obo_id)).map(d=>{
    const t=termOf(r.mondo_terms?.[d.obo_id]);
    return {id:d.obo_id,label:d.label,level:olsLevel(q,d),obsolete:!!(t?.is_obsolete ?? d.is_obsolete),definition:(t?.description ?? d.description ?? [])[0] ?? '',
      xrefs:t?Object.fromEntries(xrefRelations(t)):null,xrefs_loaded:!!t};
  })).filter(c=>!c.obsolete);
  const ncitDetail=Object.fromEntries(Object.entries(r.ncit_terms ?? {}).map(([id,v])=>[id,termOf(v)]).filter(([,t])=>t));
  const seenN=new Set(),searched=[...olsDocs(r.ncit_exact,'NCIT:'),...olsDocs(r.ncit_fuzzy,'NCIT:')].filter(d=>!seenN.has(d.obo_id) && seenN.add(d.obo_id))
    .map(d=>({id:d.obo_id,label:d.label,level:olsLevel(q,d),obsolete:!!d.is_obsolete,definition:(d.description ?? [])[0] ?? '',semantic_type:ncitDetail[d.obo_id]?.annotation?.Semantic_Type ?? null}));
  const viaXref=Object.entries(ncitDetail).filter(([id])=>!searched.some(c=>c.id===id)).map(([id,t])=>{
    const syn=t.obo_synonym ?? [],by=scope=>syn.filter(s=>s.scope===scope).map(s=>s.name);
    const doc={label:t.label,exact_synonyms:by('hasExactSynonym'),related_synonyms:by('hasRelatedSynonym'),narrow_synonyms:by('hasNarrowSynonym'),broad_synonyms:by('hasBroadSynonym')};
    return {id,label:t.label ?? id,level:olsLevel(q,doc),obsolete:!!t.is_obsolete,definition:(t.description ?? [])[0] ?? '',via_xref:true,semantic_type:t.annotation?.Semantic_Type ?? null};
  });
  // Judge on every retrieved candidate; only the screen limits how many are shown.
  const ncit=rank([...searched,...viaXref]).filter(c=>!c.obsolete);
  const mesh=rank(Object.entries(r.mesh_details ?? {}).filter(([,v])=>v.ok).map(([id,v])=>{
    const terms=v.data.terms ?? [],preferred=terms.find(t=>t.preferred)?.label ?? id;
    const level=meshForms(preferred).includes(q)?'LABEL':terms.some(t=>meshForms(t.label).includes(q))?'ENTRY_TERM':'PARTIAL';
    return {id:'MESH:'+id,label:preferred,level,record_level:'Descriptor',entry_terms:terms.filter(t=>!t.preferred).map(t=>t.label).slice(0,8)};
  }));
  const mondoExact=mondo.filter(exactLevel),ncitExact=ncit.filter(exactLevel),meshExact=mesh.filter(exactLevel);
  const best=mondoExact.length===1?mondoExact[0]:null,reasons=[];let code;
  const cross={ncit:[],mesh:[]},links={ncit:[],mesh:[]};
  // AGREE: a name match MONDO maps as exact; LINK: mapped with another precision;
  // CONFLICT: the name matches none of the mappings; NONE: no name match; UNKNOWN: lookup incomplete.
  const assess=(name,exact,label,sourceStatus)=>{
    const rel=best.xrefs ?? {},pool=name==='ncit'?ncit:mesh,prefix=name==='ncit'?'NCIT:':'MESH:';
    const agreed=exact.filter(c=>rel[c.id]==='EXACT_MATCH'),linked=exact.filter(c=>rel[c.id] && rel[c.id]!=='EXACT_MATCH');
    cross[name]=agreed.map(c=>c.id);links[name]=linked.map(c=>`${c.id} ${rel[c.id]}`);
    const targets=Object.keys(rel).filter(id=>id.startsWith(prefix)),missing=targets.some(id=>!pool.some(c=>c.id===id));
    const unread=record.truncated?.[name==='ncit'?'ncit_terms':'mesh_details'] ?? 0;
    if(agreed.length){reasons.push(`${label}: 이름 일치 후보 ${cross[name].join(', ')}를 MONDO가 exact match로 연결합니다.`);if(exact.length>agreed.length)flags.push('ALTERNATIVE_EXACT_CANDIDATES');return 'AGREE';}
    if(linked.length){reasons.push(`${label}: 이름 일치 후보가 MONDO에서 exact가 아닌 관계로 연결됩니다(${links[name].join(', ')}).`);return 'LINK';}
    if(unread){reasons.push(`${label}: 조회한 기록에서는 exact 연결을 찾지 못했고, 조회 상한으로 ${unread}개를 읽지 않아 연결 여부를 판단하지 않았습니다.`);return 'UNKNOWN';}
    if(sourceStatus!=='OK' && (missing || !exact.length)){reasons.push(`${label}: 조회가 끝나지 않아 연결 여부를 판단하지 않았습니다.`);return 'UNKNOWN';}
    if(exact.length){reasons.push(`${label}: 이름 일치 후보(${exact.map(c=>c.id).join(', ')})가 MONDO 교차참조에 없습니다.`);return 'CONFLICT';}
    const target=pool.find(c=>targets.includes(c.id));
    reasons.push(target?`${label}: 이름 일치 후보는 없지만 MONDO 교차참조가 ${target.id}(${target.label}, ${rel[target.id]})를 가리킵니다. 이름이 달라 사람이 확인합니다.`:`${label}: 이름이 일치하는 후보를 찾지 못했습니다.`);
    return 'NONE';
  };
  if(Object.values(st).every(s=>s==='ERROR')) { code='SOURCE_ERROR';reasons.push('세 출처를 모두 조회하지 못했습니다.'); }
  else if(looksLikeAbbreviation(record.term) && !mondo.some(c=>c.level==='LABEL')) {
    code='ABBREVIATION_NEEDS_DEFINITION';reasons.push('대문자 약어 형태이고 어떤 MONDO 대표 이름과도 같지 않습니다. 여러 질환일 수 있어 문서의 긴 이름(약어) 정의를 먼저 확인합니다(G02).');
  }
  else if(mondoExact.length>1) { code='MULTIPLE_CANDIDATES';reasons.push(`MONDO에서 이름·정확 동의어가 일치하는 개념이 ${mondoExact.length}개입니다. 한쪽을 고르지 않습니다.`); }
  else if(best && !best.xrefs_loaded) { code='LOOKUP_INCOMPLETE';reasons.push(`${best.id}의 상세(교차참조)를 읽지 못했습니다. 교차참조가 없다는 뜻이 아닙니다.`); }
  else if(best) {
    reasons.push(`${best.id}: 입력이 MONDO ${best.level==='LABEL'?'대표 이름과':'정확 동의어와'} 일치합니다.`);
    const n=assess('ncit',ncitExact,'NCIt',st.ncit),m=assess('mesh',meshExact,'MeSH',st.mesh),both=[n,m];
    code=both.includes('UNKNOWN')?'LOOKUP_INCOMPLETE':both.includes('CONFLICT')?'SOURCE_DISAGREEMENT':both.includes('LINK')?'NON_EXACT_LINK':
      n==='AGREE' && m==='AGREE'?'CROSS_SOURCE_AGREEMENT':both.includes('AGREE')?'PARTIAL_AGREEMENT':'MONDO_ONLY';
  }
  else if(!search.mondo) { code='LOOKUP_INCOMPLETE';reasons.push('MONDO 이름 검색이 끝나지 않았습니다. 후보가 없다는 뜻이 아닙니다.'); }
  else if(mondo.some(c=>c.level!=='PARTIAL')) { code='SCOPE_REVIEW';reasons.push('이름이 관련·좁은·넓은 동의어로만 일치합니다. 같은 개념인지 정의 범위를 비교해야 합니다(G03).'); }
  else if(ncitExact.length || meshExact.length) { code='NO_MONDO_MATCH';reasons.push('이번 이름 검색에서 MONDO 일치 후보는 확인하지 못했고, NCIt 또는 MeSH에만 이름 일치 후보가 있습니다.'); }
  else if(!search.ncit || !search.mesh) { code='LOOKUP_INCOMPLETE';reasons.push('일부 출처의 검색이 끝나지 않아 후보 부재로 판단하지 않았습니다.'); }
  else { code='NO_CANDIDATE';reasons.push('세 출처의 검색 결과에서 이름 일치 후보를 찾지 못했습니다. 표기를 바꿔 찾거나 LOCAL 필요성을 검토합니다(G04·G10).'); }
  if(ncit.some(c=>exactLevel(c) && !c.semantic_type))flags.push('ENTITY_TYPE_UNCHECKED');
  if(meshExact.some(c=>c.level==='ENTRY_TERM'))flags.push('MESH_DESCRIPTOR_ENTRY_TERM');
  const truncated=Object.entries(record.truncated ?? {}).filter(([,n])=>n>0);
  if(truncated.length)reasons.push(`조회 상한으로 확인하지 않은 항목: ${truncated.map(([k,n])=>`${k} ${n}개`).join(', ')}. 미확인 항목을 불일치로 보지 않습니다.`);
  if(code!=='SOURCE_ERROR')for(const f of failures)reasons.push(`${f.source} ${f.step} 실패(${f.error}).`);
  const proposal=['CROSS_SOURCE_AGREEMENT','PARTIAL_AGREEMENT','MONDO_ONLY'].includes(code)?{concept_key:best.id,preferred_name:best.label,
    records:[best.id,...cross.ncit,...cross.mesh],name_relation:'이름 일치 · 범위 미검토',review_status:'REVIEW_PENDING'}:null;
  const version=k=>r[k]?.ok?r[k].data.config?.version ?? null:null;
  // Version lookups are metadata: they do not change the link result but are shown and retried.
  const metadata_failures=[['MONDO','mondo_info'],['NCIt','ncit_info']].filter(([,k])=>r[k] && !r[k].ok).map(([source,k])=>({source,step:'버전 조회',error:r[k].error}));
  if(metadata_failures.length)flags.push('VERSION_UNAVAILABLE');
  return {format:COMPARE_VERSION,name_policy:NAME_POLICY,term:record.term,retrieved_at:record.retrieved_at,code,complete:!failures.length && !truncated.length,metadata_complete:!metadata_failures.length,metadata_failures,
    reasons,flags:unique(flags),failures,proposal,cross_reference:cross,non_exact_links:links,
    sources:{mondo:{status:st.mondo,version:version('mondo_info'),candidates:mondo},ncit:{status:st.ncit,version:version('ncit_info'),candidates:ncit},mesh:{status:st.mesh,version:null,candidates:mesh}},
    limits:['이름·교차참조 연결은 같은 임상 범위의 충분조건이 아닙니다. 정의 범위(G03)는 사람이 비교합니다.','MONDO는 NCIt·MeSH 지식을 재사용하므로 세 기록의 연결은 독립된 세 검증이 아닙니다.','MeSH는 Descriptor 수준의 입력어로 대조했으며 Concept 범위와 Scope Note는 비교하지 않았습니다.','제안은 사전에 반영되지 않습니다. 승인·변경 기록·회귀 검사를 거쳐 새 사전 버전으로 반영합니다.','외부 서비스의 현재 버전은 이 사전의 고정 스냅샷과 다를 수 있습니다.']};
}
