import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAnalyzer} from '../app/analyzer.mjs';
import {checkAnalyzerCase} from '../app/analyzer-checks.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const analyzer=createAnalyzer({...read('dictionary.json'),records:read('records.json'),comparisons:read('comparisons.json')});
for(const item of read('analyzer_cases.json').cases) {
  test(item.id,()=>{
    const checked=checkAnalyzerCase(analyzer,item);
    assert.equal(checked.passed,true,checked.errors.join('\n'));
  });
}
test('input size and required keyword are enforced',()=>{
  assert.throws(()=>analyzer.analyze({keyword:'',text:'NSCLC'}));
  assert.throws(()=>analyzer.analyze({keyword:'NSCLC',text:'x'.repeat(10001)}));
});
test('document definitions do not leak into the next input or mutate aliases',()=>{
  const core=read('dictionary.json'),before=JSON.stringify(core);
  const isolated=createAnalyzer(core);
  assert.equal(isolated.analyze({keyword:'CD',text:'Crohn disease (CD).'}).decision,'LINKED');
  assert.equal(isolated.analyze({keyword:'CD',text:'Patients with CD.'}).decision,'HOLD_AMBIGUOUS');
  assert.equal(isolated.analyze({keyword:'T2D',text:'Type 2 diabetes (T2D).'}).decision,'LINKED');
  assert.equal(isolated.analyze({keyword:'T2D',text:'T2D.'}).decision,'UNREGISTERED');
  assert.equal(JSON.stringify(core),before);
});
test('stored contexts and verdicts are not runtime prediction inputs',()=>{
  const records=read('records.json');
  const make=rows=>createAnalyzer({...read('dictionary.json'),records:rows,comparisons:read('comparisons.json')});
  const minimal=make(records.map(({source_id,concept_key,keyword,expression})=>({source_id,concept_key,keyword,expression})));
  for(const item of read('analyzer_cases.json').cases)assert.deepEqual(minimal.analyze(item),analyzer.analyze(item));
});
