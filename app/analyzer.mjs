// Bounded, offline mention-normalization prototype. It does not diagnose patients.
// New text is evaluated at runtime. Stored raw contexts and rationales are not used.
export const ENGINE_VERSION = 'prototype-4';
const fold = s => String(s ?? '').normalize('NFKC').toLowerCase().replaceAll('ß','ss').replaceAll('ς','σ').replaceAll('’',"'");
const normalize = s => fold(s).replace(/\s+/gu,' ').trim();
const word = ch => !!ch && /[\p{L}\p{N}_]/u.test(ch);
const unique = items => [...new Set(items)];
const safeVariant = s => s.replace(/\bnon(?:[- ]+|(?=small))small\b/gu,'non-small');
const keyOf = s => safeVariant(normalize(s));
const escapeRE = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Declared G02 safety policy survives source ablation; it supplies no disease answer.
const documentRequired = new Set(['cd','aml']);
// Unknown adjacent lexical prefixes require review. These are grammatical boundaries,
// not a blacklist of diseases. Reviewed context modifiers retain their source spans.
const boundaryWords=new Set('with of for and or nor but however whereas no not without patients patient adults adult children child in among during after before from to by under following within has have had having is are was were mentions mentioned reports reported confirms confirmed documented diagnosed known a an the both either suspected possible probable potential only'.split(' '));
// State modifiers add severity, control, stage or extent; they do not change the named concept.
// Concept-changing prefixes (smoldering, latent, portal, secondary, pseudo-) stay unreviewed.
const contextModifiers=new Set(['metastatic','relapsed','refractory','recurrent','severe','active','mild','moderate','moderately','severely',
  'mild-to-moderate','moderate-to-severe','uncontrolled','controlled','well-controlled','poorly-controlled','advanced','locally','unresectable']);
const stageValue=/^(?:[0-4][a-c]?|i{1,3}[a-c]?|iv[a-c]?)$/u;
const modifierRun=`(?:(?:${[...contextModifiers].map(escapeRE).join('|')}|stage\\s+(?:[0-4][a-c]?|i{1,3}[a-c]?|iv[a-c]?))\\s+)*`;
function modifierAt(text,start,keys) {
  let cursor=start;
  while(cursor>0) {
    const prefix=text.slice(0,cursor),m=prefix.match(/([\p{L}\p{N}]+(?:[-‐‑–—][\p{L}\p{N}]+)*)([-‐‑–—]?) *$/u);
    if(!m)return null;
    const token=fold(m[1]),span={text:m[0].trim(),start:m.index,end:m.index+m[0].trimEnd().length};
    if(m[2])return {...span,status:'UNREVIEWED_PREFIX'};
    if(boundaryWords.has(token))return null;
    if(stageValue.test(token) && /\bstage\s+$/iu.test(text.slice(0,m.index))) { cursor=text.slice(0,m.index).search(/stage\s+$/iu);continue; }
    if(contextModifiers.has(token) || (token==='autoimmune' && keys.length===1 && keys[0]==='MONDO:0005147')) { cursor=m.index;continue; }
    return {...span,status:'UNREVIEWED_PREFIX'};
  }
  return null;
}
function contextFlagsAt(text,start,end) {
  const left=text.slice(clauseAt(text,start,end).start,start),flags=[];
  if(/\bfamily\s+history\s+of\s*$/iu.test(left))flags.push('EXPERIENCER_FAMILY_HISTORY');
  else if(/\bhistory\s+of\s*$/iu.test(left))flags.push('HISTORICAL');
  const line=text.slice(text.lastIndexOf('\n',start-1)+1,start);
  if(/\b(?:exclusion|inclusion)\s+criteria\s*:/iu.test(line))flags.push('SECTION_CONTEXT');
  return flags;
}
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

const negationCue=new RegExp(`\\b(?:no(?: history of| evidence of)?|neither|not|without(?: evidence of)?|negative for|(?:do|does|did|must|should)\\s+not\\s+have|free of|absence of)\\s+${modifierRun}$`,'iu');
const uncertaintyCue=new RegExp(`\\b(?:suspected|possible|probable|potential|rule out)\\s+${modifierRun}$`,'iu');
// Affirmative predicates end a negated list: "No A, B present" does not negate B.
const affirmativePredicate=/^\s*(?:is|are|was|were|present|allowed|permitted|eligible|accepted|required)\b/iu;
function assertionAt(text,start,end) {
  const clause=clauseAt(text,start,end),left=text.slice(Math.max(clause.start,start-150),start),right=text.slice(end,Math.min(clause.end,end+90));
  // A coordinated subject shares the predicate: "A or B is not required".
  if(/^\s*(?:(?:,\s*)?(?:or|and|nor)\s+[^.;,!?\n]{1,60}?\s+)?(?:(?:is|was|are|were)\s+)?not\s+(?:required|(?:an?\s+)?exclusion criteri(?:on|a))\b/iu.test(right))return 'UNSUPPORTED_REQUIREMENT';
  if(negationCue.test(left)
      || /^\s*(?:(?:was|were|is|are|has been)\s+)?(?:ruled out|excluded|absent|not present)\b/iu.test(right))return 'NEGATED';
  if(uncertaintyCue.test(left)
      || /^\s*(?:is|was)\s+(?:suspected|possible|probable)\b/iu.test(right))return 'UNCERTAIN';
  if(contextFlagsAt(text,start,end).length)return 'UNKNOWN';
  // A cue before an unrecognized first operand cannot establish the full scope.
  if(/\b(?:no|without|neither|free of|absence of)\b[^.;!?\n]*\b(?:or|and|nor)\s*$/iu.test(left))return 'UNKNOWN';
  return 'NO_CUE_DETECTED';
}
function coordinateAssertions(text,mentions) {
  for(let i=1;i<mentions.length;i++) {
    const a=mentions[i-1],b=mentions[i],gap=text.slice(a.end,b.start);
    if(a.assertion==='NEGATED' && ['NO_CUE_DETECTED','UNKNOWN'].includes(b.assertion) && !b.context_flags?.length && /^\s*(?:(?:,\s*)?(?:or|and|nor)|,)\s*$/iu.test(gap)) {
      const after=text.slice(b.end,clauseAt(text,b.start,b.end).end),commaOnly=/^\s*,\s*$/u.test(gap);
      // "No A, B present": B has its own predicate. A bare comma propagates only to a list end.
      if(affirmativePredicate.test(after)) { if(!commaOnly){b.assertion='UNKNOWN';b.assertion_basis='COORDINATED_PREDICATE_UNRESOLVED';} continue; }
      if(commaOnly && after.trim() && !/^\s*(?:,\s*)?(?:or|and|nor)\b/iu.test(after)) { b.assertion='UNKNOWN';b.assertion_basis='COMMA_SCOPE_UNRESOLVED';continue; }
      b.assertion='NEGATED';b.assertion_basis='ADJACENT_COORDINATED_CUE';b.assertion_scope={from:a.start,to:b.end};
    }
  }
}

const patterns = [
  {type:'disease_status',value:'metastatic',pattern:/\bmetastatic\b/giu},
  {type:'disease_status',value:'relapsed',pattern:/\brelapsed\b/giu},
  {type:'disease_status',value:'refractory',pattern:/\brefractory\b/giu},
  {type:'treatment_history',value:'prior_therapy',pattern:/\b(?:after\s+)?prior\s+therapy\b/giu},
  {type:'disease_status',value:'recurrent',pattern:/\brecurrent\b/giu},
  {type:'disease_status',value:'active',pattern:/\bactive\b/giu},
  {type:'etiology',value:'autoimmune',pattern:/\bautoimmune\b/giu},
  {type:'treatment_requirement',value:'insulin_required',pattern:/\brequiring\s+insulin\b/giu},
  {type:'severity',pattern:/\b(?:mild|moderate)(?:[- ]to[- ](?:moderate|severe))?\b|\bsevere\b/giu},
  {type:'disease_activity',pattern:/\b(?:mildly|moderately|severely)(?:\s+to\s+(?:moderately|severely))?\s+active\b/giu},
  {type:'control_status',pattern:/\b(?:uncontrolled|(?:well|poorly)[- ]controlled|controlled)\b/giu},
  {type:'stage',pattern:/\bstage\s+(?:[0-4][a-c]?|iv[a-c]?|i{1,3}[a-c]?)\b/giu},
  {type:'extent',pattern:/\b(?:locally\s+advanced|advanced|unresectable)\b/giu},
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
  for(const alias of catalog.aliases) {
    const m=keyOf(alias.term).match(/^type ([12]) diabetes mellitus$/u);
    if(!m)continue;
    const term=`type ${m[1]} diabetes`;
    if(!index.has(term))index.set(term,[]);
    if(!index.get(term).some(a=>a.concept_key===alias.concept_key))index.get(term).push({...alias,term,variant_of:alias.term,generated_variant:true});
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
      const modifier=modifierAt(text,start,candidate_keys),blocked=!!modifier;
      mentions.push({text:text.slice(start,end),start,end,candidate_keys,concept_key:!blocked && !documentRequired.has(keyOf(text.slice(start,end))) && candidate_keys.length===1?candidate_keys[0]:null,
        status:blocked?'UNSUPPORTED_MODIFIER':documentRequired.has(keyOf(text.slice(start,end)))?'AMBIGUOUS':candidate_keys.length===1?'RESOLVED':'AMBIGUOUS',variant_sources:(index.get(last.key)??[]).filter(a=>a.generated_variant).map(a=>({source_id:a.source_id,variant_of:a.variant_of})),basis:index.get(last.key).every(a=>a.generated_variant)?'REVIEWED_NAME_VARIANT':'REVIEWED_ALIAS',modifier,context_flags:contextFlagsAt(text,start,end),assertion:assertionAt(text,start,end)});
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
    // Keep the longest span: "moderately to severely active" is one activity, not also "active".
    const outer=items=>items.filter(x=>!items.some(y=>y!==x && y.start<=x.start && y.end>=x.end && y.end-y.start>x.end-x.start));
    return {attributes:outer(attributes),name_components:outer(name_components)};
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
    for(const m of mentions)m.context_flags=contextFlagsAt(text,m.start,m.end);
    coordinateAssertions(text,mentions);
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
      keys=keywordCandidates;reason('G04','REVIEWED_ALIAS','검토한 이름·별칭 또는 선언한 type 1/2 diabetes 이름 변형과 일치합니다.');
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
        // A modified longer name that ends with a target name ("plaque psoriasis") is also a modified mention.
        const targetTerms=unique([keyOf(keyword),...catalog.aliases.filter(a=>a.concept_key===keys[0]).map(a=>keyOf(a.term))]);
        const modified=mentions.some(m=>m.status==='UNSUPPORTED_MODIFIER' && (m.candidate_keys.includes(keys[0]) || targetTerms.some(t=>keyOf(m.text).endsWith(' '+t))));
        decision=modified?'HOLD_MODIFIED_MENTION':bodyKeys.length===1 && scopePairs.has([keys[0],bodyKeys[0]].sort().join('|'))?'HOLD_SCOPE_REVIEW':
          bodyKeys.length?'HOLD_RELATION_UNREVIEWED':'HOLD_TARGET_NOT_IN_TEXT';
        keys=[];reason(decision==='HOLD_SCOPE_REVIEW'?'G03':'G01',decision,
          decision==='HOLD_MODIFIED_MENTION'?'대상 이름 구간은 원문에 있으나 검토하지 않은 수식어가 붙어 있습니다. 기본 개념으로 확정하지 않습니다.':
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
    if(mentions.some(m=>!['NO_CUE_DETECTED'].includes(m.assertion)))warnings.push('부정·추정 표지는 언급된 개념과 별도로 기록합니다. 해당 환자의 진단을 확정하지 않습니다.');
    if(mentions.some(m=>!m.concept_key))warnings.push('다의·수식어·미등록 때문에 해소하지 못한 문서 내 표현이 있습니다. 다른 개념의 언급만으로 추측하지 않습니다.');
    if(text && !mentions.length)warnings.push('현재 사전에서 인식한 원문 내 표현이 없습니다. 전체 문장의 의미를 이해했다고 해석하지 않습니다.');
    const targetMentions=mentions.filter(m=>keys.includes(m.concept_key));
    const unresolvedTarget=mentions.some(m=>!m.concept_key && keyOf(m.text)===keyOf(keyword));
    const assertionValues=unique(targetMentions.map(m=>m.assertion));
    const target_evidence_status=!body.trim()?'NO_TEXT':['HOLD_EXPRESSION_UNRESOLVED','HOLD_MODIFIED_MENTION'].includes(decision)?'UNRESOLVED':!targetMentions.length?(unresolvedTarget?'UNRESOLVED':'NOT_FOUND'):assertionValues.length>1?'MIXED':assertionValues[0];
    const normalization_status=decision==='SPLIT_OR'?'EXPRESSION_RESOLVED':decision==='HOLD_EXPRESSION_UNRESOLVED'?'EXPRESSION_UNRESOLVED':
      ['LINKED','LOCAL_LINKED','ROUTE_ENTITY'].includes(decision)?'LINKED':decision==='UNREGISTERED'?'UNREGISTERED':'REVIEW_REQUIRED';
    const unsupported_patterns=unique(mentions.flatMap(m=>m.context_flags));
    if(mentions.some(m=>m.assertion==='UNKNOWN' && !m.context_flags.length))unsupported_patterns.push('COORDINATED_NEGATION_UNRESOLVED');
    if(mentions.some(m=>m.assertion==='UNSUPPORTED_REQUIREMENT'))unsupported_patterns.push('REQUIREMENT_NECESSITY');
    if(logical_relations.some(r=>r.operator==='AND'))unsupported_patterns.push('AND_ELIGIBILITY_INTERPRETATION');
    if(/\btype\s+1\s+or\s+type\s+2\b/iu.test(body))unsupported_patterns.push('COORDINATION_ELLIPSIS');
    if(unsupported_patterns.length)warnings.push('지원하지 않는 문형이나 확인하지 못한 문맥 범위가 있습니다. 미지원 항목을 확인하고 환자 상태를 확정하지 않습니다.');
    return {engine_version:ENGINE_VERSION,normalization_status,target_evidence_status,eligibility_status:'NOT_EVALUATED',unsupported_patterns,input:{keyword,text},offset_encoding:'UTF-16 code units',decision,
      concept_keys:keys,concepts:keys.map(describe),keyword_candidates:keywordCandidates.map(describe),
      mentions:mentions.map(m=>({...m,concept:m.concept_key?describe(m.concept_key):null})),
      abbreviation_definitions:definitions,logical_relations,...extracted,reasons,warnings,
      scope:'Existing reviewed concepts and explicit document definitions; bounded rules, not general biomedical reasoning or clinical validation.'};
  }
  return {analyze,mentionsIn};
}
