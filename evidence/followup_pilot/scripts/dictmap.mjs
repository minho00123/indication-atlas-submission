import fs from 'node:fs';
const [,,repo,inp]=process.argv;
const {createAnalyzer}=await import(repo+'/dist/analyzer.mjs');
const a=createAnalyzer(JSON.parse(fs.readFileSync(repo+'/dist/data/catalog.json')));
const items=JSON.parse(fs.readFileSync(inp));const out={};
for(const it of items){const m=it.condition.match(/^(.*?)\s*\(([^)]+)\)\s*$/);const k=m?m[1]:it.condition;const x=a.analyze({keyword:k,text:''});if(x.concepts.length)out[it.item]={keyword:k,decision:x.decision,concepts:x.concepts.map(c=>c.concept_key)};}
console.log(JSON.stringify(out,null,0));fs.writeFileSync(inp.replace('items.json','dict_overlap.json'),JSON.stringify(out));
