// On-demand candidate lookup for an unregistered expression in MONDO and NCIt (via EBI OLS)
// and MeSH (NLM RDF lookup). Requests run only when the user asks. The comparison is a fixed
// rule over the saved responses: the same responses always give the same proposal. A proposal
// is never written to the dictionary; scope review (G03) and approval remain human decisions.
export const COMPARE_VERSION = 'candidates-1';
const OLS='https://www.ebi.ac.uk/ols4/api',MESH='https://id.nlm.nih.gov/mesh/lookup';
const norm=s=>String(s ?? '').normalize('NFKC').toLowerCase().replace(/['’]s\b/gu,'').replace(/[-_,/()]+/gu,' ').replace(/\s+/gu,' ').trim();
const olsFields='obo_id,label,exact_synonyms,related_synonyms,narrow_synonyms,broad_synonyms,is_obsolete,description';
export const isAbbreviation=term=>/^[A-Z][A-Z0-9-]{1,6}$/u.test(String(term).trim());

export function lookupUrls(term) {
  const q=encodeURIComponent(String(term).trim());
  const search=(ontology,exact)=>`${OLS}/search?q=${q}&ontology=${ontology}&rows=${exact?10:8}&queryFields=label,synonym&type=class&fieldList=${olsFields}${exact?'&exact=true':''}`;
  return {mondo_exact:search('mondo',true),mondo_fuzzy:search('mondo',false),ncit_exact:search('ncit',true),ncit_fuzzy:search('ncit',false),
    mesh_exact:`${MESH}/descriptor?label=${q}&match=exact&limit=5`,mesh_contains:`${MESH}/descriptor?label=${q}&match=contains&limit=5`,
    mondo_info:`${OLS}/ontologies/mondo`,ncit_info:`${OLS}/ontologies/ncit`};
}
const termUrl=id=>`${OLS}/ontologies/mondo/terms?obo_id=${encodeURIComponent(id)}`;
const ncitTermUrl=id=>`${OLS}/ontologies/ncit/terms?obo_id=${encodeURIComponent(id)}`;
const meshDetailsUrl=id=>`${MESH}/details?descriptor=${encodeURIComponent(id)}&includes=terms`;

async function getJSON(url,fetchImpl,timeout) {
  const controller=typeof AbortController==='function'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeout):null;
  try {
    const response=await fetchImpl(url,controller?{signal:controller.signal}:{});
    if(!response.ok)return {url,ok:false,error:'HTTP '+response.status};
    return {url,ok:true,data:await response.json()};
  } catch(e) { return {url,ok:false,error:e.name==='AbortError'?'timeout':String(e.message ?? e)}; }
  finally { if(timer)clearTimeout(timer); }
}

// Collects raw responses; compareCandidates() only reads this record.
export async function fetchCandidates(term,{fetchImpl=globalThis.fetch,timeout=12000,now=()=>new Date().toISOString()}={}) {
  const urls=lookupUrls(term),get=url=>getJSON(url,fetchImpl,timeout),responses={};
  const keys=['mondo_exact','ncit_exact','mesh_exact','mondo_info','ncit_info'];
  (await Promise.all(keys.map(k=>get(urls[k])))).forEach((r,i)=>responses[keys[i]]=r);
  const docs=r=>r?.ok?r.data.response?.docs ?? []:[];
  const own=(r,prefix)=>docs(r).filter(d=>String(d.obo_id ?? '').startsWith(prefix));
  const fallback=[];
  if(responses.mondo_exact.ok && !own(responses.mondo_exact,'MONDO:').length)fallback.push('mondo_fuzzy');
  if(responses.ncit_exact.ok && !own(responses.ncit_exact,'NCIT:').length)fallback.push('ncit_fuzzy');
  if(responses.mesh_exact.ok && !(responses.mesh_exact.data ?? []).length)fallback.push('mesh_contains');
  (await Promise.all(fallback.map(k=>get(urls[k])))).forEach((r,i)=>responses[fallback[i]]=r);
  const mondoIds=[...own(responses.mondo_exact,'MONDO:'),...own(responses.mondo_fuzzy,'MONDO:')].slice(0,3).map(d=>d.obo_id);
  const terms=await Promise.all(mondoIds.map(id=>get(termUrl(id))));
  responses.mondo_terms=Object.fromEntries(mondoIds.map((id,i)=>[id,terms[i]]));
  // NCIt targets named by MONDO cross-references are fetched even when the name search misses them.
  const ncitIds=[...new Set(terms.filter(r=>r.ok).flatMap(r=>(r.data._embedded?.terms?.[0]?.obo_xref ?? []).filter(x=>x.database==='NCIT' && /^C\d+$/u.test(x.id)).map(x=>'NCIT:'+x.id)))].slice(0,3);
  const ncitTerms=await Promise.all(ncitIds.map(id=>get(ncitTermUrl(id))));
  responses.ncit_terms=Object.fromEntries(ncitIds.map((id,i)=>[id,ncitTerms[i]]));
  const meshIds=new Set();
  for(const r of [responses.mesh_exact,responses.mesh_contains])for(const d of (r?.ok?r.data:[]) ?? [])meshIds.add(String(d.resource).split('/').pop());
  for(const r of terms)if(r.ok)for(const x of r.data._embedded?.terms?.[0]?.obo_xref ?? [])if(x.database==='MESH' && /^D\d+$/u.test(x.id))meshIds.add(x.id);
  const ids=[...meshIds].slice(0,4),details=await Promise.all(ids.map(id=>get(meshDetailsUrl(id))));
  responses.mesh_details=Object.fromEntries(ids.map((id,i)=>[id,details[i]]));
  return {format:COMPARE_VERSION,term:String(term).trim(),retrieved_at:now(),responses};
}

const levelOrder=['LABEL','EXACT_SYNONYM','RELATED_SYNONYM','NARROW_SYNONYM','BROAD_SYNONYM','PARTIAL'];
function olsLevel(q,doc) {
  if(norm(doc.label)===q)return 'LABEL';
  for(const [field,level] of [['exact_synonyms','EXACT_SYNONYM'],['related_synonyms','RELATED_SYNONYM'],['narrow_synonyms','NARROW_SYNONYM'],['broad_synonyms','BROAD_SYNONYM']])
    if((doc[field] ?? []).some(s=>norm(s)===q))return level;
  return 'PARTIAL';
}
// MeSH lists inverted entry terms ("Apnea, Sleep"); compare the natural order as well.
const meshForms=label=>{const parts=String(label).split(/,\s*/u);return unique2([norm(label),parts.length===2?norm(parts[1]+' '+parts[0]):null].filter(Boolean));};
const unique2=xs=>[...new Set(xs)];
const exactLevel=c=>['LABEL','EXACT_SYNONYM'].includes(c.level);

export function compareCandidates(record) {
  const q=norm(record.term),r=record.responses,status={};
  const docs=(keys,prefix)=>{
    const seen=new Map();
    for(const k of keys)for(const d of (r[k]?.ok?r[k].data.response?.docs ?? []:[]))if(String(d.obo_id ?? '').startsWith(prefix) && !seen.has(d.obo_id))seen.set(d.obo_id,d);
    return [...seen.values()];
  };
  status.mondo=r.mondo_exact?.ok?'OK':'ERROR';status.ncit=r.ncit_exact?.ok?'OK':'ERROR';status.mesh=r.mesh_exact?.ok?'OK':'ERROR';
  const rank=list=>list.sort((a,b)=>levelOrder.indexOf(a.level)-levelOrder.indexOf(b.level));
  const mondo=rank(docs(['mondo_exact','mondo_fuzzy'],'MONDO:').map(d=>{
    const t=r.mondo_terms?.[d.obo_id]?.ok?r.mondo_terms[d.obo_id].data._embedded?.terms?.[0]:null;
    const xrefs=(t?.obo_xref ?? []).map(x=>`${x.database}:${x.id}`).filter(x=>/^(NCIT|MESH):/u.test(x));
    return {id:d.obo_id,label:d.label,level:olsLevel(q,d),obsolete:!!(t?.is_obsolete ?? d.is_obsolete),definition:(t?.description ?? d.description ?? [])[0] ?? '',xrefs,xrefs_loaded:!!t};
  })).filter(c=>!c.obsolete).slice(0,6);
  const searched=docs(['ncit_exact','ncit_fuzzy'],'NCIT:').map(d=>({id:d.obo_id,label:d.label,level:olsLevel(q,d),obsolete:!!d.is_obsolete,definition:(d.description ?? [])[0] ?? ''}));
  const viaXref=Object.entries(r.ncit_terms ?? {}).filter(([id,v])=>v.ok && !searched.some(c=>c.id===id)).map(([id,v])=>{
    const t=v.data._embedded?.terms?.[0] ?? {},syn=t.obo_synonym ?? [];
    const doc={label:t.label,exact_synonyms:syn.filter(s=>s.scope==='hasExactSynonym').map(s=>s.name),related_synonyms:syn.filter(s=>s.scope==='hasRelatedSynonym').map(s=>s.name),
      narrow_synonyms:syn.filter(s=>s.scope==='hasNarrowSynonym').map(s=>s.name),broad_synonyms:syn.filter(s=>s.scope==='hasBroadSynonym').map(s=>s.name)};
    return {id,label:t.label ?? id,level:olsLevel(q,doc),obsolete:!!t.is_obsolete,definition:(t.description ?? [])[0] ?? '',via_xref:true};
  });
  const ncit=rank([...searched,...viaXref]).filter(c=>!c.obsolete).slice(0,6);
  const mesh=rank(Object.entries(r.mesh_details ?? {}).filter(([,v])=>v.ok).map(([id,v])=>{
    const terms=v.data.terms ?? [],preferred=terms.find(t=>t.preferred)?.label ?? id;
    const level=meshForms(preferred).includes(q)?'LABEL':terms.some(t=>meshForms(t.label).includes(q))?'ENTRY_TERM':'PARTIAL';
    return {id:'MESH:'+id,label:preferred,level,entry_terms:terms.filter(t=>!t.preferred).map(t=>t.label).slice(0,8)};
  }));
  const mondoExact=mondo.filter(exactLevel),ncitExact=ncit.filter(exactLevel),meshExact=mesh.filter(c=>['LABEL','ENTRY_TERM'].includes(c.level));
  const reasons=[];let code;
  const best=mondoExact.length===1?mondoExact[0]:null,xrefs=new Set(best?.xrefs ?? []);
  const agree=list=>list.filter(c=>xrefs.has(c.id)),cross={ncit:best?agree(ncitExact).map(c=>c.id):[],mesh:best?agree(meshExact).map(c=>c.id):[]};
  if(Object.values(status).every(s=>s==='ERROR')) { code='SOURCE_ERROR';reasons.push('세 출처를 모두 조회하지 못했습니다.'); }
  else if(isAbbreviation(record.term)) { code='ABBREVIATION_NEEDS_DEFINITION';reasons.push('짧은 약어는 출처 이름이 일치해도 여러 질환일 수 있습니다. 문서의 긴 이름(약어) 정의를 먼저 확인합니다(G02).'); }
  else if(mondoExact.length>1) { code='MULTIPLE_CANDIDATES';reasons.push(`MONDO에서 이름·정확 동의어가 일치하는 개념이 ${mondoExact.length}개입니다. 한쪽을 고르지 않습니다.`); }
  else if(best) {
    const ncitConflict=ncitExact.length && !cross.ncit.length,meshConflict=meshExact.length && !cross.mesh.length;
    reasons.push(`${best.id}: 입력이 MONDO ${best.level==='LABEL'?'대표 이름과':'정확 동의어와'} 일치합니다.`);
    if(cross.ncit.length)reasons.push(`MONDO 교차참조 ↔ NCIt 이름 일치 후보: ${cross.ncit.join(', ')} 일치.`);
    else if(ncitConflict)reasons.push(`NCIt 이름 일치 후보(${ncitExact.map(c=>c.id).join(', ')})가 MONDO 교차참조에 없습니다.`);
    else {
      const target=ncit.find(c=>c.via_xref && xrefs.has(c.id));
      reasons.push(target?`NCIt에서 이름이 일치하는 후보는 없지만, MONDO 교차참조가 ${target.id}(${target.label})를 가리킵니다. 이름이 달라 사람이 확인합니다.`:'NCIt에서 이름이 일치하는 후보를 찾지 못했습니다.');
    }
    if(cross.mesh.length)reasons.push(`MONDO 교차참조 ↔ MeSH 이름 일치 후보: ${cross.mesh.join(', ')} 일치.`);
    else if(meshConflict)reasons.push(`MeSH 이름 일치 후보(${meshExact.map(c=>c.id).join(', ')})가 MONDO 교차참조에 없습니다.`);
    else reasons.push('MeSH에서 이름이 일치하는 후보를 찾지 못했습니다.');
    code=ncitConflict || meshConflict?'SOURCE_DISAGREEMENT':cross.ncit.length && cross.mesh.length?'CROSS_SOURCE_AGREEMENT':cross.ncit.length || cross.mesh.length?'PARTIAL_AGREEMENT':'MONDO_ONLY';
  }
  else if(mondo.some(c=>c.level!=='PARTIAL')) { code='SCOPE_REVIEW';reasons.push('이름이 관련·좁은·넓은 동의어로만 일치합니다. 같은 개념인지 정의 범위를 비교해야 합니다(G03).'); }
  else if(ncitExact.length || meshExact.length) { code='NO_MONDO_MATCH';reasons.push('NCIt 또는 MeSH에만 이름 일치 후보가 있습니다. MONDO 대응을 사람이 확인해야 합니다.'); }
  else { code='NO_CANDIDATE';reasons.push('세 출처에서 이름이 일치하는 후보를 찾지 못했습니다. 표기를 바꿔 찾거나 LOCAL 필요성을 검토합니다(G04·G10).'); }
  for(const [name,s] of Object.entries(status))if(s==='ERROR' && code!=='SOURCE_ERROR')reasons.push(`${name.toUpperCase()} 조회에 실패해 이 출처는 비교에서 빠졌습니다.`);
  const proposal=['CROSS_SOURCE_AGREEMENT','PARTIAL_AGREEMENT','MONDO_ONLY'].includes(code)?{concept_key:best.id,preferred_name:best.label,
    candidates:[best.id,...cross.ncit,...cross.mesh],name_relation:'이름 일치 · 범위 미검토',review_status:'REVIEW_PENDING'}:null;
  const info=k=>r[k]?.ok?r[k].data.config?.version ?? null:null;
  return {format:COMPARE_VERSION,term:record.term,retrieved_at:record.retrieved_at,code,reasons,proposal,cross_reference:cross,
    sources:{mondo:{status:status.mondo,version:info('mondo_info'),candidates:mondo},ncit:{status:status.ncit,version:info('ncit_info'),candidates:ncit},mesh:{status:status.mesh,version:null,candidates:mesh}},
    limits:['이름 일치와 교차참조 일치는 같은 임상 범위의 충분조건이 아닙니다. 정의 범위(G03)는 사람이 비교합니다.','제안은 사전에 반영되지 않습니다. 승인·변경 기록·회귀 검사를 거쳐 새 사전 버전으로 반영합니다.','외부 서비스의 현재 버전은 이 사전의 고정 스냅샷과 다를 수 있습니다.']};
}
