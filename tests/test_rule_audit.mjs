import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withoutRow} from '../app/rule-audit.mjs';
import {createAnalyzer} from '../app/analyzer.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../data/'+n,import.meta.url),'utf8'));
const core=read('dictionary.json'),records=read('records.json'),comparisons=read('comparisons.json');
test('source ablation removes every alias kind and attached comparisons, preserving other provenance',()=>{
  for(const row of records) {
    const reduced=withoutRow(core,records,comparisons,row.source_id);
    assert.deepEqual(reduced.aliases,core.aliases.filter(a=>a.source_id!==row.source_id));
    assert.ok(reduced.records.every(r=>r.source_id!==row.source_id));
    assert.ok(reduced.comparisons.every(c=>c.left_source_id!==row.source_id && c.right_source_id!==row.source_id));
    assert.equal(reduced.concepts,core.concepts);
  }
});
test('removing one CD sense does not approve the remaining opposite sense',()=>{
  for(const id of ['K007','K008']) {
    const row=records.find(r=>r.source_id===id),a=createAnalyzer(withoutRow(core,records,comparisons,id));
    const result=a.analyze({keyword:row.keyword,text:row.raw_context});
    assert.equal(result.decision,'HOLD_AMBIGUOUS');assert.deepEqual(result.concept_keys,[]);
  }
});
test('OR structure and resolution do not require original records or expression metadata',()=>{
  const a=createAnalyzer(core);
  const unresolved=a.analyze({keyword:'MDS/AML',text:'MDS or AML; either diagnosis is eligible.'});
  assert.equal(unresolved.logical_relations[0].operator,'OR');
  assert.equal(unresolved.logical_relations[0].resolution,'UNRESOLVED');
  assert.equal(unresolved.decision,'HOLD_EXPRESSION_UNRESOLVED');
  const term='Myelodysplastic syndrome or acute myeloid leukemia';
  const resolved=a.analyze({keyword:term,text:term+'.'});
  assert.equal(resolved.decision,'SPLIT_OR');
});
