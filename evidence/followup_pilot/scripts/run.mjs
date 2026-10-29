import fs from 'node:fs';
const [,,repo,inp,out]=process.argv;
const {createAnalyzer}=await import(repo+'/dist/analyzer.mjs');
const a=createAnalyzer(JSON.parse(fs.readFileSync(repo+'/dist/data/catalog.json')));
const s=JSON.parse(fs.readFileSync(inp));
const res=s.rows.map(r=>{try{const x=a.analyze({keyword:r.condition,text:r.text});return {...r,text:undefined,decision:x.decision,norm:x.normalization_status,evidence:x.target_evidence_status,concepts:x.concepts.map(c=>c.concept_key),reasons:x.reasons.map(q=>q.rule+':'+q.code),unsupported:x.unsupported_patterns}}catch(e){return {...r,text:undefined,error:String(e.message)}}});
fs.writeFileSync(out,JSON.stringify(res));
console.log('done',res.length);
