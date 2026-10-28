// Reproduce the eight reviewed inputs with the current engine and frozen development expectations.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createAnalyzer} from '../app/analyzer.mjs';
import {checkAnalyzerCase} from '../app/analyzer-checks.mjs';
const base=new URL('../',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,base),'utf8'));
const before=read('evidence/review_process/runtime_before.json');
const analyzer=createAnalyzer({...read('data/dictionary.json'),records:read('data/records.json'),comparisons:read('data/comparisons.json')});
const fixtures=read('data/analyzer_cases.json').cases;
const cases=before.cases.map(c=>{
 const fixture=fixtures.find(f=>f.keyword===c.input.keyword && f.text===c.input.text);
 if(!fixture)throw Error('Missing reviewed-input expectation: '+c.id);
 const checked=checkAnalyzerCase(analyzer,fixture);if(!checked.passed)throw Error(checked.errors.join('; '));
 return {id:c.id,input:c.input,fixture_id:fixture.id,expected:fixture.expected,passed:checked.passed,result:checked.result};
});
const names=['app/analyzer.mjs','app/analyzer-checks.mjs','data/analyzer_cases.json','data/dictionary.json','data/records.json','data/comparisons.json','evidence/review_process/runtime_before.json'];
const dependencies=Object.fromEntries(names.map(name=>[name,createHash('sha256').update(readFileSync(new URL(name,base))).digest('hex')]));
const output={engine_version:cases[0].result.engine_version,purpose:'Development regression checks for the eight reviewed inputs; not independent accuracy.',dependencies,cases};
if(process.argv.includes('--check')) {
 if(JSON.stringify(read('evidence/review_process/runtime_after.json'))!==JSON.stringify(output))throw Error('Saved reviewed-input results differ. Regenerate and review changes.');
 console.log(JSON.stringify({mode:'VERIFIED',reviewed_inputs:cases.length,passed:cases.filter(c=>c.passed).length}));
 process.exit(0);
}
writeFileSync(new URL('evidence/review_process/runtime_after.json',base),JSON.stringify(output,null,2)+'\n');
const folder=new URL('evidence/review_process/',base),files={};
for(const name of readdirSync(folder).sort())if(name!=='manifest.json')files[name]=createHash('sha256').update(readFileSync(new URL(name,folder))).digest('hex');
writeFileSync(new URL('manifest.json',folder),JSON.stringify({schema_version:1,scope:'Historical review excerpts and local runtime diagnostics; not independent expert validation.',files},null,2)+'\n');
console.log(JSON.stringify({reviewed_inputs:cases.length,passed:cases.filter(c=>c.passed).length}));
