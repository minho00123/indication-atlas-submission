import fs from 'node:fs';
const [,,repo,inp]=process.argv;
const {createAnalyzer}=await import(repo+'/dist/analyzer.mjs');
const a=createAnalyzer(JSON.parse(fs.readFileSync(repo+'/dist/data/catalog.json')));
const rows=JSON.parse(fs.readFileSync(inp)).rows;
const cnt=(arr)=>arr.reduce((m,x)=>(m[x]=(m[x]||0)+1,m),{});
const nameOnly=rows.map(r=>a.analyze({keyword:r.condition,text:''}).decision);
console.log('name only',cnt(nameOnly));
// paren variants: "Long name (ABBR)" -> try long part and abbr part
const paren=[];
rows.forEach((r,i)=>{const m=r.condition.match(/^(.*?)\s*\(([^)]+)\)\s*$/);if(!m)return;const d0=a.analyze({keyword:r.condition,text:''}).decision;
 const d1=a.analyze({keyword:m[1],text:''}),d2=a.analyze({keyword:m[2],text:''});paren.push([r.condition,d0,d1.decision,d1.concepts.map(c=>c.concept_key).join(','),d2.decision]);});
console.log('paren rows',paren.length,'recoverable via long part',paren.filter(p=>p[1]==='UNREGISTERED'&&p[2]==='LINKED').length);
console.log(paren.filter(p=>p[1]==='UNREGISTERED'&&p[2]!=='UNREGISTERED').slice(0,20));
// text-not-found holds: does name-only link?
const tn=rows.map((r,i)=>[r,i]).filter(([r])=>true);
const holdT=rows.filter(r=>a.analyze({keyword:r.condition,text:r.text}).decision==='HOLD_TARGET_NOT_IN_TEXT');
console.log('HOLD_TARGET_NOT_IN_TEXT -> name only',cnt(holdT.map(r=>a.analyze({keyword:r.condition,text:''}).decision)));
console.log(holdT.slice(0,6).map(r=>[r.nct,r.condition,r.text.slice(0,160).replace(/\s+/g,' ')]));
const rel=rows.filter(r=>a.analyze({keyword:r.condition,text:r.text}).decision==='HOLD_RELATION_UNREVIEWED');
console.log(rel.slice(0,6).map(r=>{const x=a.analyze({keyword:r.condition,text:r.text});return [r.nct,r.condition,x.mentions.map(m=>m.text+'→'+(m.concept?.concept_key||m.status)).slice(0,4)]}));
