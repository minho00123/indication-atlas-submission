import {createAnalyzer,ENGINE_VERSION} from './analyzer.mjs';
import {normalize} from './search.js';
const unique=xs=>[...new Set(xs)];
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const linked=r=>['LINKED','LOCAL_LINKED','ROUTE_ENTITY'].includes(r.decision);
const counts=items=>items.reduce((out,k)=>(out[k]=(out[k]??0)+1,out),{});

export function withoutRow(core,records,comparisons,sourceId) {
  return {...core,aliases:core.aliases.filter(a=>a.source_id!==sourceId),
    records:records.filter(r=>r.source_id!==sourceId),
    comparisons:comparisons.filter(p=>p.left_source_id!==sourceId && p.right_source_id!==sourceId)};
}
function compare(row,r) {
  if(row.concept_key && linked(r) && same([row.concept_key],r.concept_keys))return {category:'MATCH',reason:'기존 개념 연결을 재현했습니다. 의미 정확도 평가가 아닙니다.'};
  if(row.research_decision.startsWith('HOLD_') && r.decision.startsWith('HOLD_') && !r.concept_keys.length)return {category:'MATCH_HOLD',reason:'단일 개념으로 확정하지 않는 보류 행동을 재현했습니다. 세부 사유는 별도로 비교합니다.'};
  if(row.expression && r.decision==='SPLIT_OR' && same(row.expression.operands,r.concept_keys))return {category:'MATCH_EXPRESSION',reason:'구성 개념이 해소된 OR 식을 재현했습니다.'};
  if(r.decision==='UNREGISTERED')return {category:'UNREGISTERED',reason:'이 실행 조건의 색인과 문서 정의로 대상 표현을 연결하지 못했습니다. 질환이 외부에 없다는 뜻은 아닙니다.'};
  if(row.concept_key && r.keyword_candidates.length>1 && !r.abbreviation_definitions.length && !linked(r))return {category:'RULE_UNSUPPORTED',reason:'기존 판정의 증상 단서 또는 정의 없는 약어 해소를 현재 규칙이 지원하지 않습니다.'};
  if(r.decision.startsWith('HOLD_'))return {category:'REVIEW_REQUIRED',reason:'실행기가 검토 대상으로 남겼습니다. 원문 근거·관계·논리식 해소 상태를 확인해야 합니다.'};
  return {category:'DIFFERENT_RESULT',reason:'기존 연결 또는 처리와 실행 결과가 다릅니다. 오류 여부는 근거를 검토해야 합니다.'};
}
function auditRules(row,result,catalog) {
  const checks=[];
  const add=(rule,check,status,reason,details={})=>checks.push({rule,check,status,reason,...details});
  if(row.research_decision==='HOLD_SOURCE_CONFLICT')add('G01','SOURCE_CONFLICT_NOT_AUTO_CORRECTED',result.decision.startsWith('HOLD') && !result.concept_keys.length?'PASS':'DIFFERENCE','원본의 충돌 사례를 자동 정정해 연결하지 않는지 확인합니다.');
  const candidates=unique(catalog.aliases.filter(a=>normalize(a.term)===normalize(row.keyword)).map(a=>a.concept_key));
  if(candidates.length>1 || row.research_decision==='HOLD_AMBIGUOUS') {
    const expectedHold=row.research_decision==='HOLD_AMBIGUOUS';
    const status=expectedHold?(result.decision==='HOLD_AMBIGUOUS'?'PASS':'DIFFERENCE'):
      linked(result) && result.concept_keys.includes(row.concept_key)?'PASS':'UNSUPPORTED';
    add('G02','ABBREVIATION_EVIDENCE',status,expectedHold?'문맥 없는 다의 약어를 보류하는지 확인합니다.':'고정 판정의 약어 해석을 실행기가 재현하는지 확인합니다. 증상 기반 해소는 미지원입니다.');
  }
  if((row.reviewed_candidates??[]).some(c=>['BROADER','NARROWER','UNKNOWN'].includes(c.relation)))add('G03','CANDIDATE_SCOPE_REVIEW','MANUAL_REVIEW_REQUIRED','후보 정의의 부위·원인·아형 동등성은 일반적으로 자동 비교하지 않습니다. 기존 검토 관계의 재사용과 구별합니다.');
  add('G04','INPUT_AND_FRAGMENT_GUARD',result.input.keyword===row.keyword.trim() && !result.mentions.some(m=>m.status==='UNSUPPORTED_MODIFIER' && m.concept_key)?'PASS':'DIFFERENCE','입력 표기의 보존과 미지원 수식어가 붙은 부분 구간의 미승인을 검사합니다. 의미 동등성 검사가 아닙니다.');
  for(const [field,actual,role] of [['clinical_attributes',result.attributes,'CONTEXT_ATTRIBUTE'],['concept_name_components',result.name_components,'NAME_COMPONENT']]) {
    for(const e of row[field]??[]) {
      if(e.source_field!=='raw_context')continue;
      const match=actual.find(a=>a.start===e.start && a.end===e.end);
      const wrong=(role==='NAME_COMPONENT'?result.attributes:result.name_components).find(a=>a.start===e.start && a.end===e.end);
      add('G05',role,match?'PASS':wrong?'DIFFERENCE':'UNSUPPORTED',match?'기존 원문 구간을 같은 역할로 보존했습니다.':wrong?'구간은 찾았으나 이름/추가 조건 역할이 다릅니다.':'기존 원문 구간을 지원 패턴에서 추출하지 못했습니다.',{expected_span:{text:e.source_span,start:e.start,end:e.end},type:e.type});
    }
  }
  if(row.expression) {
    const relations=result.logical_relations.filter(r=>r.operator===row.expression.operator);
    add('G06','EXPRESSION_STRUCTURE',relations.length?'PASS':'UNSUPPORTED','원문 논리 구조를 개념 해소와 별도로 보존하는지 확인합니다.');
    add('G06','EXPRESSION_RESOLUTION',relations.some(r=>r.resolution==='RESOLVED' && same(r.concept_keys,row.expression.operands))?'PASS':'UNSUPPORTED','기존 구성 개념과의 일치 여부입니다. 미등록·다의 피연산자를 추측하지 않습니다.');
  }
  if(row.research_decision==='ROUTE_ENTITY')add('G07','ENTITY_ROUTE',result.decision==='ROUTE_ENTITY' && result.concept_keys.includes(row.concept_key)?'PASS':'UNSUPPORTED','기존 비질환 개체의 식별과 라우팅을 확인합니다. 원인 질환 추론은 하지 않습니다.');
  if(row.scope_assumptions?.length)add('G08','DECLARED_SENSE_OVERRIDE','MANUAL_REVIEW_REQUIRED','저장된 기본 의미와 반례 조건은 표시하며 모든 반대 문맥을 자동 해석하지 않습니다.');
  if(row.concept_key?.startsWith('LOCAL:'))add('G10','EXISTING_LOCAL_NOT_INVENTED',result.concept_keys.includes(row.concept_key)?'PASS':result.decision==='UNREGISTERED'?'UNSUPPORTED':'REVIEW_REQUIRED','기존 자체 개념의 재사용 여부입니다. 실행기는 새 LOCAL을 생성하지 않습니다.');
  return checks;
}
function project(result) {
  return {engine_version:result.engine_version,decision:result.decision,normalization_status:result.normalization_status,
    target_evidence_status:result.target_evidence_status,eligibility_status:result.eligibility_status,concept_keys:result.concept_keys,
    keyword_candidates:result.keyword_candidates.map(c=>c.concept_key),mentions:result.mentions.map(({text,start,end,status,basis,assertion,concept_key,candidate_keys})=>({text,start,end,status,basis,assertion,concept_key,candidate_keys})),
    attributes:result.attributes,name_components:result.name_components,logical_relations:result.logical_relations,
    unsupported_patterns:result.unsupported_patterns,reasons:result.reasons,warnings:result.warnings};
}
export function runAudit({core,records,comparisons}) {
  const catalog={...core,records,comparisons},analyzer=createAnalyzer(catalog);
  const aliasChecks=core.aliases.map(a=>({source_id:a.source_id,term:a.term,concept_key:a.concept_key,
    status:analyzer.mentionsIn(a.term).some(m=>m.start===0 && m.end===a.term.length && m.candidate_keys.includes(a.concept_key))?'PASS':'DIFFERENCE'}));
  const rows=records.map(row=>{
    const input={keyword:row.keyword,text:row.raw_context},a=analyzer.analyze(input),reduced=withoutRow(core,records,comparisons,row.source_id),b=createAnalyzer(reduced).analyze(input);
    return {source_id:row.source_id,keyword:row.keyword,raw_context:row.raw_context,expected:{decision:row.research_decision,concept_key:row.concept_key,expression:row.expression??null},
      A:{...compare(row,a),result:project(a),checks:auditRules(row,a,catalog)},
      B:{...compare(row,b),result:project(b),checks:auditRules(row,b,reduced),removed:{aliases:core.aliases.length-reduced.aliases.length,comparisons:comparisons.length-reduced.comparisons.length,expression:row.expression?1:0},
        remaining_keyword_sources:unique(reduced.aliases.filter(x=>normalize(x.term)===normalize(row.keyword)).map(x=>x.source_id))}};
  });
  const modes={};
  for(const mode of ['A','B']) {
    const checks=rows.flatMap(r=>r[mode].checks);
    modes[mode]={unit:'input rows',total:records.length,categories:counts(rows.map(r=>r[mode].category)),
      check_unit:'applicable rule checks; multiple checks may apply per row',check_total:checks.length,
      rules:Array.from({length:12},(_,i)=>{const rule='G'+String(i+1).padStart(2,'0'),applicable=checks.filter(c=>c.rule===rule);return {rule,applications:applicable.length,rows:rows.filter(r=>r[mode].checks.some(c=>c.rule===rule)).length,statuses:counts(applicable.map(c=>c.status))};})};
  }
  return {schema_version:1,engine_version:ENGINE_VERSION,purpose:'Development replay and source-dependency audit; not independent clinical accuracy.',
    limitations:['All 300 rows were used to develop the dictionary and policies.','B removes row-owned aliases/comparisons/records; concept inventory, global safety policies (including CD/AML), and knowledge from other rows remain.','PASS checks a stated invariant or existing decision, not clinical truth.','G09/G11/G12 integrity and provenance checks run separately in the Python build; no per-row semantic pass is invented.'],
    lookup:{unit:'alias connections',total:aliasChecks.length,statuses:counts(aliasChecks.map(a=>a.status)),checks:aliasChecks},summary:modes,rows};
}
