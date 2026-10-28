// Reproduce reviewed inputs with the current engine and fixed development expectations.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createAnalyzer} from '../app/analyzer.mjs';
import {checkAnalyzerCase} from '../app/analyzer-checks.mjs';
const base=new URL('../',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,base),'utf8'));
const analyzer=createAnalyzer({...read('data/dictionary.json'),records:read('data/records.json'),comparisons:read('data/comparisons.json')});
const fixtures=read('data/analyzer_cases.json').cases;
for(const [beforeName,afterName] of [['runtime_before.json','runtime_after.json'],['reverify_before.json','reverify_after.json']]) {
 const before=read('evidence/review_process/'+beforeName);
 const cases=before.cases.map(c=>{
  const fixture=fixtures.find(f=>f.keyword===c.input.keyword && f.text===c.input.text);
  if(!fixture)throw Error('Missing reviewed-input expectation: '+c.id);
  const checked=checkAnalyzerCase(analyzer,fixture);if(!checked.passed)throw Error(checked.errors.join('; '));
  return {id:c.id,input:c.input,fixture_id:fixture.id,expected:fixture.expected,passed:checked.passed,result:checked.result};
 });
 const names=['app/analyzer.mjs','app/analyzer-checks.mjs','data/analyzer_cases.json','data/dictionary.json','data/records.json','data/comparisons.json','evidence/review_process/'+beforeName];
 const dependencies=Object.fromEntries(names.map(name=>[name,createHash('sha256').update(readFileSync(new URL(name,base))).digest('hex')]));
 const output={engine_version:cases[0].result.engine_version,purpose:'Development regression checks for reviewed inputs; not independent accuracy.',dependencies,cases};
 if(process.argv.includes('--check')) {
  if(JSON.stringify(read('evidence/review_process/'+afterName))!==JSON.stringify(output))throw Error('Saved reviewed-input results differ: '+afterName);
 }else writeFileSync(new URL('evidence/review_process/'+afterName,base),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({mode:process.argv.includes('--check')?'VERIFIED':'GENERATED',file:afterName,reviewed_inputs:cases.length,passed:cases.filter(c=>c.passed).length}));
}
if(!process.argv.includes('--check')) {
 const folder=new URL('evidence/review_process/',base),files={};
 for(const name of readdirSync(folder).sort())if(name!=='manifest.json')files[name]=createHash('sha256').update(readFileSync(new URL(name,folder))).digest('hex');
 writeFileSync(new URL('manifest.json',folder),JSON.stringify({schema_version:1,scope:'Historical review excerpts and local runtime diagnostics; not independent expert validation.',files},null,2)+'\n');
}
