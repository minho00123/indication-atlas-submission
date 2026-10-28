// Bounded, offline mention-normalization prototype. It does not diagnose patients.
// New text is evaluated at runtime. Stored raw contexts and rationales are not used.
export const ENGINE_VERSION = 'prototype-2';
const fold = s => String(s ?? '').normalize('NFKC').toLowerCase().replaceAll('ß','ss').replaceAll('ς','σ').replaceAll('’',"'");
const normalize = s => fold(s).replace(/\s+/gu,' ').trim();
const word = ch => !!ch && /[\p{L}\p{N}_]/u.test(ch);
const unique = items => [...new Set(items)];
const safeVariant = s => s.replace(/\bnon(?:[- ]+|(?=small))small\b/gu,'non-small');
const keyOf = s => safeVariant(normalize(s));
const escapeRE = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Declared G02 safety policy survives source ablation; it supplies no disease answer.
const documentRequired = new Set(['cd','aml']);
const unsupportedModifier = /\b(?:non|familial|acquired|idiopathic|eosinophilic|psoriatic|juvenile|guttate|pustular|atopic|subcutaneous|supravalvular|subvalvular|endocrine|exocrine|autoimmune|severe|recurrent|castration-resistant)[- ]+$/iu;
function clauseAt(text,start,end) {
  let left=0,right=text.length;
  for(const m of text.matchAll(/[.;!?\n]|\b(?:but|however|whereas)\b/giu)) {
    if(m.index+m[0].length<=start)left=m.index+m[0].length;
    if(m.index>=end){right=m.index;break;}
  }
  return {start:left,end:right};
}

function matchingView(text) {
  const parts = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(text)].map(s=>({text:s.segment,index:s.index}))
    : [...text].reduce((a,c)=>{a.push({text:c,index:a.length?a.at(-1).index+a.at(-1).text.length:0});return a;},[]);
  let normalized=''; const starts=[],ends=[];
  for(const part of parts) {
    for(const c of fold(part.text)) {
      const normalizedChar=/\s/u.test(c)?' ':c;
      if(normalizedChar===' ' && normalized.endsWith(' ')) { ends[ends.length-1]=part.index+part.text.length;continue; }
      normalized+=normalizedChar;
      for(let j=0;j<normalizedChar.length;j++) { starts.push(part.index);ends.push(part.index+part.text.length); }
    }
  }
  // Only the reviewed non-small/non small/nonsmall spelling family is folded.
  let out='',os=[],oe=[],cursor=0;
  for(const m of normalized.matchAll(/\bnon(?:[- ]+|(?=small))small\b/gu)) {
    out+=normalized.slice(cursor,m.index);os.push(...starts.slice(cursor,m.index));oe.push(...ends.slice(cursor,m.index));
    const replacement='non-small';
    for(let k=0;k<replacement.length;k++) { out+=replacement[k];os.push(starts[m.index]);oe.push(ends[m.index+m[0].length-1]); }
    cursor=m.index+m[0].length;
  }
  out+=normalized.slice(cursor);os.push(...starts.slice(cursor));oe.push(...ends.slice(cursor));
  return {text:out,starts:os,ends:oe};
}

function shortFormFits(shortForm,longForm) {
  const sf=fold(shortForm).replace(/[^\p{L}\p{N}]/gu,'');
  const lf=fold(longForm);let j=lf.length-1;
  for(let i=sf.length-1;i>=0;i--) {
    while(j>=0 && (lf[j]!==sf[i] || (i===0 && j>0 && word(lf[j-1]))))j--;
    if(j<0)return false;
    j--;
  }
  return sf.length>=2;
}

function assertionAt(text,start,end) {
  const left=text.slice(Math.max(0,start-90),start).split(/[.;!?\n]/u).at(-1);
  const clause=clauseAt(text,start,end),right=text.slice(end,Math.min(clause.end,end+75));
  if(/^\s*(?:(?:is|was|are|were)\s+)?not required\b/iu.test(right))return 'UNSUPPORTED_REQUIREMENT';
  if(/\b(?:no(?: history of| evidence of)?|not|without(?: evidence of)?|negative for)\s+(?:(?:metastatic|relapsed|refractory)\s+)?$/iu.test(left)
      || /^\s*(?:(?:was|is|has been)\s+)?(?:ruled out|absent|not present)\b/iu.test(right))return 'NEGATED';
  if(/\b(?:suspected|possible|probable|potential|rule out)\s+(?:(?:metastatic|relapsed|refractory)\s+)?$/iu.test(left)
      || /^\s*(?:is|was)\s+(?:suspected|possible|probable)\b/iu.test(right))return 'UNCERTAIN';
  return 'AFFIRMED';
}

const patterns = [
  {type:'disease_status',value:'metastatic',pattern:/\bmetastatic\b/giu},
  {type:'disease_status',value:'relapsed',pattern:/\brelapsed\b/giu},
  {type:'disease_status',value:'refractory',pattern:/\brefractory\b/giu},
  {type:'treatment_history',value:'prior_therapy',pattern:/\b(?:after\s+)?prior\s+therapy\b/giu},
  {type:'disease_status',value:'recurrent',pattern:/\brecurrent\b/giu},
  {type:'severity',value:'severe',pattern:/\bsevere\b/giu,nameOnly:true},
  {type:'treatment_response',value:'castration-resistant',pattern:/\bcastration[- ]resistant\b/giu,nameOnly:true},
  {type:'chronicity',value:'acute',pattern:/\bacute\b/giu,nameOnly:true},
  {type:'chronicity',value:'chronic',pattern:/\bchronic\b/giu,nameOnly:true},
  {type:'biomarker',pattern:/\bHER2(?:[- ](?:positive|negative)|[+-])/giu},
  {type:'duration',pattern:/\b(?:more than|at least|for|over)\s+\d+(?:\.\d+)?\s+(?:days?|weeks?|months?|years?)\b/giu}
];

export function createAnalyzer(catalog) {
  const concepts=new Map(catalog.concepts.map(c=>[c.concept_key,c]));
  const index=new Map();
  for(const a of catalog.aliases) {
    const key=keyOf(a.term);
    if(!index.has(key))index.set(key,[]);
    index.get(key).push(a);
  }
  const trie={};
  for(const key of index.keys()) {
    let node=trie;
    for(let i=0;i<key.length;i++)node=node[key[i]] ??= {};
    node.$=key;
  }
  const rows=new Map((catalog.records ?? []).map(r=>[r.source_id,r]));
  const scopePairs=new Set();
  for(const p of catalog.comparisons ?? []) {
    if(!['BROADER','NARROWER'].includes(p.relation))continue;
    const a=rows.get(p.left_source_id)?.concept_key,b=rows.get(p.right_source_id)?.concept_key;
    if(a && b)scopePairs.add([a,b].sort().join('|'));
  }
  const candidatesFor = term => unique((index.get(keyOf(term)) ?? []).map(a=>a.concept_key));
  const describe = key => {
    const c=concepts.get(key);
    return {concept_key:key,preferred_name:c?.preferred_name ?? key,entity_type:c?.entity_type ?? 'UNKNOWN',source_ids:c?.source_ids ?? []};
  };

  function mentionsIn(text) {
    const view=matchingView(text),mentions=[];
    for(let i=0;i<view.text.length;i++) {
      if(word(view.text[i-1]))continue;
      let node=trie,last=null;
      for(let j=i;j<view.text.length && node[view.text[j]];j++) {
        node=node[view.text[j]];
        if(node.$ && !word(view.text[j+1]))last={key:node.$,end:j};
      }
      if(!last)continue;
      const start=view.starts[i],end=view.ends[last.end],candidate_keys=candidatesFor(last.key);
      const blocked=unsupportedModifier.test(text.slice(0,start));
      mentions.push({text:text.slice(start,end),start,end,candidate_keys,concept_key:!blocked && !documentRequired.has(keyOf(text.slice(start,end))) && candidate_keys.length===1?candidate_keys[0]:null,
        status:blocked?'UNSUPPORTED_MODIFIER':documentRequired.has(keyOf(text.slice(start,end)))?'AMBIGUOUS':candidate_keys.length===1?'RESOLVED':'AMBIGUOUS',basis:'REVIEWED_ALIAS',assertion:assertionAt(text,start,end)});
      i=last.end;
    }
    return mentions;
  }

  function definitionsIn(text,mentions,offset=0) {
    const definitions=[];
    for(const m of text.matchAll(/\(([A-Za-z][A-Za-z0-9-]{1,9})\)/gu)) {
      const sf=m[1];
      if((sf.match(/[A-Z]/g) ?? []).length<2)continue;
      const before=mentions.filter(x=>x.end<=m.index+offset && !text.slice(x.end-offset,m.index).trim()).at(-1);
      let long_form,long_start;
      if(before) { long_form=before.text;long_start=before.start; }
      else {
        const prefix=text.slice(0,m.index),clause=prefix.split(/[.;!?\n]/u).at(-1).trim();
        long_form=clause;long_start=offset+prefix.lastIndexOf(long_form);
      }
      const candidate_keys=before && before.status!=='UNSUPPORTED_MODIFIER'?before.candidate_keys:[];
      const status=!shortFormFits(sf,long_form)?'INVALID':candidate_keys.length===1?'RESOLVED':candidate_keys.length?'AMBIGUOUS':'UNREGISTERED';
      definitions.push({short_form:sf,long_form,long_start,long_end:long_start+long_form.length,
        short_start:m.index+offset+1,short_end:m.index+offset+1+sf.length,candidate_keys,status});
    }
    return definitions;
  }

  function definitionResolution(term,definitions) {
    const defs=definitions.filter(d=>normalize(d.short_form)===normalize(term));
    if(!defs.length)return null;
    if(defs.some(d=>['INVALID','UNREGISTERED'].includes(d.status)))return {status:'HOLD_DEFINITION',keys:[],definitions:defs};
    const keys=unique(defs.flatMap(d=>d.candidate_keys));
    return {status:keys.length===1?'RESOLVED':'HOLD_AMBIGUOUS',keys,definitions:defs};
  }

  function extractAttributes(text,mentions) {
    const attributes=[],name_components=[];
    for(const spec of patterns) {
      for(const m of text.matchAll(new RegExp(spec.pattern))) {
        const start=m.index,end=start+m[0].length;
        const owner=mentions.find(item=>item.start<=start && item.end>=end);
        if(spec.nameOnly && !owner)continue;
        const value=spec.value ?? (spec.type==='biomarker'?fold(m[0]).includes('negative')||m[0].endsWith('-')?'HER2-negative':'HER2-positive':normalize(m[0]));
        const item={type:spec.type,value,text:m[0],start,end,role:owner?'NAME_COMPONENT':'CONTEXT_ATTRIBUTE',
          assertion:assertionAt(text,start,end),owner_start:owner?.start ?? null};
        const clause=clauseAt(text,start,end);
        const possibleOwners=mentions.filter(x=>x.start>=clause.start && x.end<=clause.end);
        const ownerKeys=unique(possibleOwners.map(x=>x.concept_key).filter(Boolean));
        const certain=ownerKeys.length===1 && possibleOwners.every(x=>x.concept_key===ownerKeys[0]);
        const nearest=owner ?? (certain?possibleOwners.reduce((best,x)=>Math.abs(x.start-start)<Math.abs(best.start-start)?x:best):null);
        item.ownership={status:owner?'NAME_SPAN':certain?'SINGLE_CONCEPT_IN_CLAUSE':'UNKNOWN',mention_start:nearest?.start ?? null,concept_key:nearest?.concept_key ?? null};
        item.scope={clause_start:clause.start,clause_end:clause.end,mention_assertion:nearest?.assertion ?? 'UNKNOWN',
          kind:spec.type==='duration' && nearest?.assertion==='NEGATED'?'DURATION_OF_NEGATED_MENTION':nearest?'MENTION_CONTEXT':'UNASSIGNED'};
        if(spec.type==='duration') {
          const match=fold(m[0]).match(/(\d+(?:\.\d+)?)\s+(days?|weeks?|months?|years?)/u);
          item.quantity={amount:Number(match[1]),unit:match[2].replace(/s$/u,''),comparator:/^(?:more than|over)\b/u.test(fold(m[0]))?'GT':/^at least\b/u.test(fold(m[0]))?'GTE':'UNSPECIFIED'};
        }
        (owner?name_components:attributes).push(item);
      }
    }
    return {attributes,name_components};
  }

  function analyze({keyword='',text=''}={}) {
    keyword=String(keyword).trim();text=String(text);
    if(keyword.length>200 || text.length>10000)throw new RangeError('대상 표현은 200자, 원문은 10,000자 이내로 입력해 주세요.');
    if(!keyword)throw new Error('분석할 대상 표현을 입력해 주세요.');
    // K024-style metadata is preserved but not treated as the source statement.
    const wrapper=text.match(/^\s*원문:\s*([\s\S]*?)\s*정규화 결과:/u);
    const body=wrapper?wrapper[1]:text,bodyStart=wrapper?text.indexOf(body):0;
    let mentions=mentionsIn(body).map(m=>({...m,start:m.start+bodyStart,end:m.end+bodyStart}));
    const definitions=definitionsIn(body,mentions,bodyStart);
    // A newly defined short form need not already exist in the dictionary.
    for(const d of definitions) {
      for(const m of body.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${d.short_form.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}\\p{N}_])`,'giu'))) {
        const start=m.index+bodyStart,end=start+m[0].length;
        if(mentions.some(item=>item.start<=start && item.end>=end))continue;
        mentions.push({text:m[0],start,end,candidate_keys:[],concept_key:null,status:'UNREGISTERED',basis:'DOCUMENT_DEFINITION',assertion:assertionAt(text,start,end)});
      }
    }
    mentions.sort((a,b)=>a.start-b.start);
    for(const m of mentions) {
      const resolved=definitionResolution(m.text,definitions);
      if(!resolved)continue;
      m.candidate_keys=resolved.keys;m.concept_key=resolved.status==='RESOLVED'?resolved.keys[0]:null;
      m.status=resolved.status;m.basis='DOCUMENT_DEFINITION';
    }
    // Unknown uppercase operands can participate in syntax without receiving a concept.
    for(const m of body.matchAll(/\b[A-Z][A-Z0-9]{1,9}\b/gu)) {
      const start=m.index+bodyStart,end=start+m[0].length;
      if(mentions.some(x=>x.start<=start && x.end>=end))continue;
      if(!/^(?:\s*(?:or|and)\b)/iu.test(body.slice(m.index+m[0].length)) && !/\b(?:or|and)\s*$/iu.test(body.slice(0,m.index)))continue;
      mentions.push({text:m[0],start,end,candidate_keys:[],concept_key:null,status:'UNREGISTERED',basis:'LOGICAL_OPERAND',assertion:assertionAt(text,start,end)});
    }
    mentions.sort((a,b)=>a.start-b.start);
    const logical_relations=[];
    for(let i=0;i<mentions.length-1;i++) {
      const a=mentions[i],b=mentions[i+1],between=text.slice(a.end,b.start),op=between.match(/^\s*(?:,\s*)?(or|and)\s*$/iu);
      if(!op)continue;
      const operands=[a,b].map(m=>({text:m.text,start:m.start,end:m.end,candidate_keys:m.candidate_keys,concept_key:m.concept_key,status:m.status}));
      logical_relations.push({operator:op[1].toUpperCase(),operands,concept_keys:unique(operands.map(o=>o.concept_key).filter(Boolean)),
        resolution:operands.every(o=>o.concept_key)?'RESOLVED':operands.some(o=>o.concept_key)?'PARTIAL':'UNRESOLVED'});
    }
    const extracted=extractAttributes(text.slice(bodyStart,bodyStart+body.length),mentions.map(m=>({...m,start:m.start-bodyStart,end:m.end-bodyStart})));
    for(const item of [...extracted.attributes,...extracted.name_components]) { item.start+=bodyStart;item.end+=bodyStart;if(item.owner_start!==null)item.owner_start+=bodyStart;
      if(item.ownership.mention_start!==null)item.ownership.mention_start+=bodyStart;
      item.scope.clause_start+=bodyStart;item.scope.clause_end+=bodyStart; }
    const keywordCandidates=candidatesFor(keyword),defined=definitionResolution(keyword,definitions);
    const reasons=[],warnings=[];let keys=[],decision;
    const reason=(rule,code,message)=>reasons.push({rule,code,message});
    if(defined) {
      if(defined.status==='RESOLVED') { keys=defined.keys;reason('G02','DOCUMENT_DEFINITION','원문에 있는 긴 이름–약어 정의를 등록된 개념과 대조했습니다. 이 연결은 현재 문서에만 적용합니다.'); }
      else { decision=defined.status;reason('G02','UNRESOLVED_DEFINITION','문서의 약어 정의가 충돌하거나 긴 이름을 검증할 수 없어 연결을 보류합니다.'); }
    } else if(documentRequired.has(keyOf(keyword))) {
      decision='HOLD_AMBIGUOUS';reason('G02','DECLARED_AMBIGUITY_POLICY','CD·AML은 검토 지식 일부를 제거해 후보가 하나 남아도 문서 정의 없이 단일 의미로 확정하지 않습니다.');
    } else if(keywordCandidates.length===1) {
      keys=keywordCandidates;reason('G04','REVIEWED_ALIAS','기존 사전에서 검토한 이름·별칭과 정확하게 일치합니다.');
    } else if(keywordCandidates.length>1) {
      decision='HOLD_AMBIGUOUS';reason('G02','AMBIGUOUS_ALIAS','여러 개념에 연결되는 표현이며 문서 내 명시적 정의가 없어 한쪽을 선택하지 않습니다.');
    } else {
      const parts=keyword.split(/\s*(?:\/|\bor\b|\band\b)\s*/iu).filter(Boolean);
      const operator=/\band\b/iu.test(keyword)?'AND':'OR';
      const relation=parts.length===2?logical_relations.find(r=>r.operator===operator && r.operands.every((o,i)=>keyOf(o.text)===keyOf(parts[i]) || candidatesFor(parts[i]).some(k=>o.candidate_keys.includes(k)))):null;
      if(parts.length===2 && logical_relations.some(r=>r.operator===operator)) {
        if(relation?.resolution==='RESOLVED' && operator==='OR') { keys=relation.concept_keys;decision='SPLIT_OR'; }
        else decision='HOLD_EXPRESSION_UNRESOLVED';
        reason('G06',decision==='SPLIT_OR'?'EXPLICIT_OR':'EXPRESSION_PARTIAL','원문의 논리 구조와 피연산자별 해소 상태를 구별합니다. 기존 판정 식을 답으로 재사용하지 않습니다.');
      } else {
        decision='UNREGISTERED';reason('G04','UNREGISTERED_TERM','이름이나 문서 내 정의를 현재 사전의 개념으로 확인하지 못했습니다. 새로운 LOCAL 개념을 자동으로 만들지 않습니다.');
      }
    }

    if(keys.length===1 && !defined) {
      const bodyKeys=unique(mentions.map(m=>m.concept_key).filter(Boolean));
      const targetPresent=mentions.some(m=>m.concept_key===keys[0]);
      if(body.trim() && !targetPresent) {
        decision=bodyKeys.length===1 && scopePairs.has([keys[0],bodyKeys[0]].sort().join('|'))?'HOLD_SCOPE_REVIEW':
          bodyKeys.length?'HOLD_RELATION_UNREVIEWED':'HOLD_TARGET_NOT_IN_TEXT';
        keys=[];reason(decision==='HOLD_SCOPE_REVIEW'?'G03':'G01',decision,
          decision==='HOLD_SCOPE_REVIEW'?'검토한 관계에서 범위 차이가 확인돼 재검토가 필요합니다.':
          decision==='HOLD_RELATION_UNREVIEWED'?'대상 표현과 원문 개념이 다릅니다. 관계 미검토 상태이며 입력 오류나 상하위를 단정하지 않습니다.':'원문에서 대상 개념을 확인하지 못했습니다. 사전 후보와 원문의 뒷받침을 구별해 검토 대상으로 남깁니다.');
      }
    }

    if(!decision) {
      const c=concepts.get(keys[0]);
      decision=c && !['DISEASE_OR_CONDITION','DISEASE_GROUP','NEOPLASM_GROUP','CLINICAL_CONDITION','CLINICAL_SYNDROME'].includes(c.entity_type)?'ROUTE_ENTITY':keys[0].startsWith('LOCAL:')?'LOCAL_LINKED':'LINKED';
      if(decision==='LOCAL_LINKED')reason('G10','EXISTING_LOCAL','기존에 검토한 자체 개념에 연결했습니다. 외부 코드가 새로 검증됐다는 뜻은 아닙니다.');
      if(decision==='ROUTE_ENTITY')reason('G07','ENTITY_TYPE','기존 개념의 개체 유형을 보존합니다. 원인 질환을 추론하지 않습니다.');
    }
    if(extracted.attributes.length)reason('G05','CONTEXT_PRESERVED','새 원문에서 지원하는 추가 조건 구간을 찾아 개념과 별도 필드로 보존했습니다.');
    if(mentions.some(m=>m.assertion!=='AFFIRMED'))warnings.push('부정·추정 표지는 언급된 개념과 별도로 기록합니다. 해당 환자의 진단을 확정하지 않습니다.');
    if(mentions.some(m=>!m.concept_key))warnings.push('해소하지 못한 문서 내 표현이 있습니다. 다른 개념의 언급만으로 약어를 추측하지 않습니다.');
    if(text && !mentions.length)warnings.push('현재 사전에서 인식한 원문 내 표현이 없습니다. 전체 문장의 의미를 이해했다고 해석하지 않습니다.');
    const targetMentions=mentions.filter(m=>keys.includes(m.concept_key));
    const unresolvedTarget=mentions.some(m=>!m.concept_key && keyOf(m.text)===keyOf(keyword));
    const assertionValues=unique(targetMentions.map(m=>m.assertion));
    const target_evidence_status=!body.trim()?'NO_TEXT':decision==='HOLD_EXPRESSION_UNRESOLVED'?'UNRESOLVED':!targetMentions.length?(unresolvedTarget?'UNRESOLVED':'NOT_FOUND'):assertionValues.length>1?'MIXED':assertionValues[0];
    const normalization_status=decision==='SPLIT_OR'?'EXPRESSION_RESOLVED':decision==='HOLD_EXPRESSION_UNRESOLVED'?'EXPRESSION_UNRESOLVED':
      ['LINKED','LOCAL_LINKED','ROUTE_ENTITY'].includes(decision)?'LINKED':decision==='UNREGISTERED'?'UNREGISTERED':'REVIEW_REQUIRED';
    const unsupported_patterns=[];
    if(mentions.some(m=>m.assertion==='UNSUPPORTED_REQUIREMENT'))unsupported_patterns.push('REQUIREMENT_NECESSITY');
    if(logical_relations.some(r=>r.operator==='AND'))unsupported_patterns.push('AND_ELIGIBILITY_INTERPRETATION');
    if(/\btype\s+1\s+or\s+type\s+2\b/iu.test(body))unsupported_patterns.push('COORDINATION_ELLIPSIS');
    if(unsupported_patterns.length)warnings.push('필수성·논리식 또는 생략 문형 중 해석을 지원하지 않는 구간이 있습니다. 환자 조건을 확정하지 않습니다.');
    return {engine_version:ENGINE_VERSION,normalization_status,target_evidence_status,eligibility_status:'NOT_EVALUATED',unsupported_patterns,input:{keyword,text},offset_encoding:'UTF-16 code units',decision,
      concept_keys:keys,concepts:keys.map(describe),keyword_candidates:keywordCandidates.map(describe),
      mentions:mentions.map(m=>({...m,concept:m.concept_key?describe(m.concept_key):null})),
      abbreviation_definitions:definitions,logical_relations,...extracted,reasons,warnings,
      scope:'Existing reviewed concepts and explicit document definitions; bounded rules, not general biomedical reasoning or clinical validation.'};
  }
  return {analyze,mentionsIn};
}
