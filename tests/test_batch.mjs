// Functional and preservation checks for multi-line intake; not an accuracy evaluation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAnalyzer} from '../app/analyzer.mjs';
import {parseBatch,runBatch,nextSteps,searchLinks,batchCSV,BATCH_LIMITS} from '../app/batch.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const analyzer=createAnalyzer({...read('dictionary.json'),records:read('records.json'),comparisons:read('comparisons.json')});
const strip=r=>JSON.stringify(r);

test('batch rows equal direct single analysis',()=>{
  const lines=['T2DM','Asthma | Patients with severe asthma.','Multiple myeloma | Patients with smoldering multiple myeloma.','Psoriasis | Patients who do not have psoriasis.'];
  for(const row of runBatch(analyzer,parseBatch(lines.join('\n'))))
    assert.equal(strip(row.result),strip(analyzer.analyze({keyword:row.keyword,text:row.text})));
});

test('each line is an independent document',()=>{
  const rows=runBatch(analyzer,parseBatch('CD | Crohn disease (CD) is mentioned.\nCD | Patients with CD.'));
  assert.equal(rows[0].result.decision,'LINKED');
  assert.equal(rows[1].result.decision,'HOLD_AMBIGUOUS');
  const reversed=runBatch(analyzer,parseBatch('CD | Patients with CD.\nCD | Crohn disease (CD) is mentioned.'));
  assert.equal(strip(reversed[0].result),strip(rows[1].result));
  assert.equal(strip(reversed[1].result),strip(rows[0].result));
});

test('input contract: first bar, blank lines, CRLF, empty target, unicode',()=>{
  const rows=parseBatch('T2DM\r\n\r\nCD | a | b\n| no target\nAsthma |\n천식 😀 | 원문');
  assert.deepEqual(rows.map(r=>r.line),[1,3,4,5,6]);
  assert.equal(rows[1].keyword,'CD');assert.equal(rows[1].text,' a | b');
  assert.equal(rows[0].has_text,false);assert.equal(rows[3].has_text,false);
  assert.equal(rows[4].keyword,'천식 😀');
  const results=runBatch(analyzer,rows);
  assert.equal(results[2].status,'INPUT_ERROR');
  assert.equal(results.filter(r=>r.status==='ANALYZED').length,4);
});

test('limits stop instead of truncating',()=>{
  assert.equal(parseBatch(Array(BATCH_LIMITS.rows).fill('Asthma').join('\n')).length,BATCH_LIMITS.rows);
  assert.throws(()=>parseBatch(Array(BATCH_LIMITS.rows+1).fill('Asthma').join('\n')),RangeError);
  assert.throws(()=>parseBatch('a'.repeat(BATCH_LIMITS.characters+1)),RangeError);
  const long=runBatch(analyzer,parseBatch('x'.repeat(201)));
  assert.equal(long[0].status,'INPUT_ERROR');
});

test('next steps follow decision, reasons and missing text',()=>{
  const [unregistered,nameOnly,modified,family]=runBatch(analyzer,parseBatch('Fabry disease | Adults with Fabry disease.\nT2DM\nMultiple myeloma | Patients with smoldering multiple myeloma.\nColon cancer | Family history of colon cancer.'));
  assert.deepEqual(nextSteps(unregistered.result).map(s=>s.rule),['G04','G07','G03','G10']);
  assert.equal(unregistered.result.decision,'UNREGISTERED');
  assert.deepEqual(nextSteps(nameOnly.result).map(s=>s.rule),['G01']);
  assert.ok(nextSteps(modified.result).some(s=>s.rule==='G03'));
  assert.ok(nextSteps(family.result).some(s=>s.rule==='G05'));
});

test('search links: fixed official hosts, encoded target only',()=>{
  const links=searchLinks('Crohn & <disease>');
  assert.deepEqual(links.map(l=>new URL(l.url).host),['www.ebi.ac.uk','evsexplore.semantics.cancer.gov','meshb.nlm.nih.gov']);
  for(const l of links)assert.ok(l.url.includes('Crohn%20%26%20%3Cdisease%3E') && !l.url.includes('<'));
});

test('CSV quotes fields and neutralizes formulas',()=>{
  const rows=runBatch(analyzer,parseBatch('=HYPERLINK("x") | text, with "quotes"\nT2DM'));
  const csv=batchCSV(rows,{engine_version:'e',dataset_version:'d'});
  const first=csv.split('\r\n')[1];
  assert.ok(first.startsWith(`1,"'=HYPERLINK(""x"")",true,`));
  assert.equal(csv.split('\r\n').length,4);
});
