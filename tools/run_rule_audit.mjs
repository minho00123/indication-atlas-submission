// Node 22 optional audit runner; static Python builds verify and publish its saved artifact.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runAudit} from '../app/rule-audit.mjs';
const base=new URL('../',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,base),'utf8'));
const result=runAudit({core:read('data/dictionary.json'),records:read('data/records.json'),comparisons:read('data/comparisons.json')});
const destination=new URL('data/rule_audit.json',base);
if(process.argv.includes('--check')) {
  if(JSON.stringify(read('data/rule_audit.json'))!==JSON.stringify(result))throw Error('Saved audit differs. Run node tools/run_rule_audit.mjs and review the results.');
} else {
  writeFileSync(destination,JSON.stringify(result,null,2)+'\n');
  const dependencies=['app/analyzer.mjs','app/rule-audit.mjs','app/search.js','data/dictionary.json','data/records.json','data/comparisons.json','data/rule_support.json','data/rule_audit.json'];
  const files=Object.fromEntries(dependencies.map(name=>[name,createHash('sha256').update(readFileSync(new URL(name,base))).digest('hex')]));
  writeFileSync(new URL('data/rule_audit_manifest.json',base),JSON.stringify({schema_version:1,engine_version:result.engine_version,files},null,2)+'\n');
}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'VERIFIED':'GENERATED',lookup:result.lookup.statuses,A:result.summary.A.categories,B:result.summary.B.categories}));
