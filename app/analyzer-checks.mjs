// Shared by the Node runner and browser QA. These are author-written development checks.
const ordered = items => [...new Set(items)].sort();
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);

export function checkAnalyzerCase(analyzer, item) {
  const result=analyzer.analyze({keyword:item.keyword,text:item.text}),expected=item.expected,errors=[];
  const check=(yes,label)=>{if(!yes)errors.push(label);};
  check(result.decision===expected.decision,`decision: ${result.decision} != ${expected.decision}`);
  check(same(ordered(result.concept_keys),ordered(expected.concept_keys)),`concepts: ${result.concept_keys} != ${expected.concept_keys}`);
  if('attributes' in expected)check(same(ordered(result.attributes.map(a=>a.type+':'+a.value)),ordered(expected.attributes)),`attributes: ${result.attributes.map(a=>a.type+':'+a.value)}`);
  if('name_components' in expected)check(same(ordered(result.name_components.map(a=>a.type+':'+a.value)),ordered(expected.name_components)),`name components: ${result.name_components.map(a=>a.type+':'+a.value)}`);
  if('assertions' in expected)check(same(ordered(result.mentions.filter(m=>expected.concept_keys.includes(m.concept_key)).map(m=>m.assertion)),ordered(expected.assertions)),'mention assertions');
  if('all_assertions' in expected)check(result.mentions.every(m=>m.assertion===expected.all_assertions),'all mention assertions');
  if('attribute_assertions' in expected)check(same(ordered(result.attributes.map(a=>a.assertion)),ordered(expected.attribute_assertions)),'attribute assertions');
  if('mention_texts' in expected)check(same(result.mentions.map(m=>m.text),expected.mention_texts),'mention text boundaries');
  if('logical_operator' in expected)check(expected.logical_operator?result.logical_relations.some(r=>r.operator===expected.logical_operator):!result.logical_relations.length,'logical operator');
  for(const field of ['normalization_status','target_evidence_status','eligibility_status'])if(field in expected)check(result[field]===expected[field],field+': '+result[field]);
  check(result.eligibility_status==='NOT_EVALUATED','eligibility must not be inferred');
  check(typeof result.normalization_status==='string' && typeof result.target_evidence_status==='string','normalization and source assertion axes');
  if('logical_resolution' in expected)check(result.logical_relations.some(r=>r.resolution===expected.logical_resolution),'logical resolution');
  if('unsupported' in expected)check(result.unsupported_patterns.includes(expected.unsupported),'unsupported pattern');
  if('condition_scope' in expected)check(result.attributes.some(a=>a.scope.kind===expected.condition_scope),'condition scope');
  if('owner_concept' in expected)check(result.attributes.some(a=>a.ownership.concept_key===expected.owner_concept),'condition owner');
  if('ownership_status' in expected)check(result.attributes.every(a=>a.ownership.status===expected.ownership_status),'condition ownership status');
  if('scope_assertion' in expected)check(result.attributes.every(a=>a.scope.mention_assertion===expected.scope_assertion),'scope assertion');
  if(expected.blocked_mention)check(result.mentions.some(m=>m.status==='UNSUPPORTED_MODIFIER' && !m.concept_key),'modified fragment must not resolve');
  for(const span of [...result.mentions,...result.attributes,...result.name_components])check(item.text.slice(span.start,span.end)===span.text,'source span: '+span.text);
  for(const attribute of [...result.attributes,...result.name_components]) {
    check(attribute.scope.clause_start<=attribute.start && attribute.scope.clause_end>=attribute.end,'attribute clause boundaries');
    if(attribute.ownership.mention_start!==null)check(result.mentions.some(m=>m.start===attribute.ownership.mention_start && m.concept_key===attribute.ownership.concept_key),'attribute owner points to a mention');
  }
  for(const d of result.abbreviation_definitions) {
    check(item.text.slice(d.short_start,d.short_end)===d.short_form,'short-form span');
    check(item.text.slice(d.long_start,d.long_end)===d.long_form,'long-form span');
  }
  for(const relation of result.logical_relations)for(const operand of relation.operands)check(item.text.slice(operand.start,operand.end)===operand.text,'logical operand span');
  return {id:item.id,passed:!errors.length,errors,result};
}
