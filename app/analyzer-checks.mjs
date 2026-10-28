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
  if('attribute_assertions' in expected)check(same(ordered(result.attributes.map(a=>a.assertion)),ordered(expected.attribute_assertions)),'attribute assertions');
  if('mention_texts' in expected)check(same(result.mentions.map(m=>m.text),expected.mention_texts),'mention text boundaries');
  if('logical_operator' in expected)check(expected.logical_operator?result.logical_relations.some(r=>r.operator===expected.logical_operator):!result.logical_relations.length,'logical operator');
  for(const span of [...result.mentions,...result.attributes,...result.name_components])check(item.text.slice(span.start,span.end)===span.text,'source span: '+span.text);
  for(const d of result.abbreviation_definitions) {
    check(item.text.slice(d.short_start,d.short_end)===d.short_form,'short-form span');
    check(item.text.slice(d.long_start,d.long_end)===d.long_form,'long-form span');
  }
  return {id:item.id,passed:!errors.length,errors,result};
}
