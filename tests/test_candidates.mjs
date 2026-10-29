// Candidate comparison over saved real responses (retrieved 2026-10-29). Development checks only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchCandidates,compareCandidates,lookupUrls,norm} from '../app/candidates.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/candidates/${name}.json`,import.meta.url),'utf8'));
const allResponses=record=>[...Object.values(record.responses).filter(r=>r && 'url' in r),
  ...Object.values(record.responses.mondo_terms ?? {}),...Object.values(record.responses.ncit_terms ?? {}),...Object.values(record.responses.mesh_details ?? {})];
function replay(record,{fail=()=>false}={}) {
  const byUrl=new Map(allResponses(record).map(r=>[r.url,r])),seen=[];
  const fetchImpl=async url=>{
    seen.push(url);
    if(fail(url))throw new Error('network down');
    const r=byUrl.get(url);
    if(!r)return {ok:false,status:404,json:async()=>({})};
    return r.ok?{ok:true,status:200,json:async()=>r.data}:{ok:false,status:500,json:async()=>({})};
  };
  return {fetchImpl,seen};
}

test('expected proposals for saved responses',()=>{
  const expected={Fabry_disease:'CROSS_SOURCE_AGREEMENT',Sleep_apnea:'SOURCE_DISAGREEMENT',MS:'ABBREVIATION_NEEDS_DEFINITION',Kawasaki_disease:'CROSS_SOURCE_AGREEMENT',Xyzzy_syndrome:'NO_CANDIDATE',Pompe_disease:'MONDO_ONLY'};
  for(const [name,code] of Object.entries(expected))assert.equal(compareCandidates(fixture(name)).code,code,name);
});

test('name and exact-match cross-reference link MONDO, NCIt and MeSH records',()=>{
  const c=compareCandidates(fixture('Fabry_disease'));
  assert.deepEqual(c.proposal.records,['MONDO:0010526','NCIT:C84701','MESH:D000795']);
  assert.equal(c.sources.mondo.candidates[0].xrefs['NCIT:C84701'],'EXACT_MATCH');
  assert.equal(c.complete,true);
  assert.equal(c.proposal.review_status,'REVIEW_PENDING');
  assert.equal(c.sources.mondo.version,'2026-10-06');
});

test('MeSH entry term is distinguished from the preferred name',()=>{
  const mesh=compareCandidates(fixture('Kawasaki_disease')).sources.mesh.candidates[0];
  assert.equal(mesh.label,'Mucocutaneous Lymph Node Syndrome');
  assert.equal(mesh.level,'ENTRY_TERM');
});

test('no proposal without agreement, for abbreviations or without candidates',()=>{
  for(const name of ['Sleep_apnea','MS','Xyzzy_syndrome'])assert.equal(compareCandidates(fixture(name)).proposal,null,name);
});

test('replayed lookup reproduces the same comparison',async()=>{
  for(const name of ['Fabry_disease','Sleep_apnea','MS','Kawasaki_disease','Xyzzy_syndrome','Pompe_disease']) {
    const saved=fixture(name),{fetchImpl,seen}=replay(saved);
    const again=await fetchCandidates(saved.term,{fetchImpl,now:()=>saved.retrieved_at});
    assert.deepEqual(compareCandidates(again),compareCandidates(saved),name);
    for(const url of seen)assert.ok(['www.ebi.ac.uk','id.nlm.nih.gov'].includes(new URL(url).host),url);
  }
});

test('source failures are reported, not hidden',async()=>{
  const saved=fixture('Fabry_disease');
  const down=replay(saved,{fail:()=>true});
  assert.equal(compareCandidates(await fetchCandidates(saved.term,{fetchImpl:down.fetchImpl})).code,'SOURCE_ERROR');
  const noMesh=replay(saved,{fail:url=>url.includes('id.nlm.nih.gov')});
  const partial=compareCandidates(await fetchCandidates(saved.term,{fetchImpl:noMesh.fetchImpl}));
  assert.equal(partial.sources.mesh.status,'ERROR');
  assert.ok(partial.reasons.some(r=>r.startsWith('MeSH') && r.includes('실패(network down)')));
  assert.equal(partial.sources.mesh.status,'ERROR');
  assert.notEqual(partial.code,'CROSS_SOURCE_AGREEMENT');
});

test('only the encoded target expression is sent',()=>{
  for(const url of Object.values(lookupUrls('Crohn & <x>')))assert.ok(!url.includes('<') && (url.includes('Crohn%20%26%20%3Cx%3E') || url.endsWith('/mondo') || url.endsWith('/ncit')));
});

test('NCIt target named by a MONDO cross-reference is shown even without a name match',()=>{
  const c=compareCandidates(fixture('Pompe_disease'));
  const target=c.sources.ncit.candidates.find(x=>x.id==='NCIT:C84734');
  assert.ok(target && target.via_xref && target.level!=='LABEL');
  assert.ok(c.reasons.some(r=>r.includes('NCIT:C84734')));
  assert.deepEqual(c.proposal.records,['MONDO:0009290']);
});

const clone=x=>JSON.parse(JSON.stringify(x));
async function injected(name,failIf) {
  const saved=fixture(name),{fetchImpl}=replay(saved);
  const f=async url=>failIf(url)?{ok:false,status:503,json:async()=>({})}:fetchImpl(url);
  return compareCandidates(await fetchCandidates(saved.term,{fetchImpl:f}));
}

test('failures after the first search are not read as absence or disagreement',async()=>{
  const meshDetails=await injected('Fabry_disease',u=>u.includes('/lookup/details'));
  assert.equal(meshDetails.code,'LOOKUP_INCOMPLETE');assert.equal(meshDetails.sources.mesh.status,'PARTIAL');assert.equal(meshDetails.proposal,null);
  const mondoTerm=await injected('Fabry_disease',u=>u.includes('ontologies/mondo/terms'));
  assert.equal(mondoTerm.code,'LOOKUP_INCOMPLETE');assert.equal(mondoTerm.sources.mondo.status,'PARTIAL');
  const fallback=await injected('Xyzzy_syndrome',u=>u.includes('/search?') && !u.includes('exact=true') || u.includes('match=contains'));
  assert.equal(fallback.code,'LOOKUP_INCOMPLETE');assert.ok(Object.values(fallback.sources).every(s=>s.status==='PARTIAL'));
  const meshSearch=await injected('Fabry_disease',u=>u.includes('match=exact'));
  assert.equal(meshSearch.sources.mesh.status,'PARTIAL');assert.equal(meshSearch.complete,false);
  const version=await injected('Fabry_disease',u=>/\/ontologies\/(mondo|ncit)$/u.test(u));
  assert.equal(version.code,'CROSS_SOURCE_AGREEMENT');assert.equal(version.sources.mondo.version,null);
});

test('only exact-match cross-references count as a link',()=>{
  const rec=clone(fixture('Fabry_disease')),term=Object.values(rec.responses.mondo_terms)[0].data._embedded.terms[0];
  term.annotation['has exact match']=term.annotation['has exact match'].filter(x=>!x.endsWith('NCIT_C84701'));
  term.annotation['has close match']=[...(term.annotation['has close match'] ?? []),'http://purl.obolibrary.org/obo/NCIT_C84701'];
  const c=compareCandidates(rec);
  assert.equal(c.code,'NON_EXACT_LINK');assert.equal(c.proposal,null);
});

test('name matching keeps signs and numbers',()=>{
  assert.notEqual(norm('HER2- breast cancer'),norm('HER2 breast cancer'));
  assert.notEqual(norm('HER2+ breast cancer'),norm('HER2- breast cancer'));
  assert.notEqual(norm('type 1 diabetes'),norm('type 2 diabetes'));
  assert.equal(norm('type-2 diabetes'),norm('Type 2 diabetes'));
  assert.equal(norm('Guillain-Barre syndrome'),norm('Guillain Barre Syndrome'));
  const rec=clone(fixture('Fabry_disease'));rec.term='HER2- breast cancer';
  for(const d of rec.responses.mondo_exact.data.response.docs){d.label='HER2 breast cancer';d.exact_synonyms=[];}
  for(const d of rec.responses.ncit_exact.data.response.docs){d.label='HER2 breast cancer';d.exact_synonyms=[];}
  for(const v of Object.values(rec.responses.mesh_details))v.data.terms=[{label:'HER2 Breast Cancer',preferred:true}];
  const c=compareCandidates(rec);
  assert.equal(c.proposal,null);assert.ok(c.sources.mondo.candidates.every(x=>x.level==='PARTIAL'));
});

test('an all-caps disease name is not treated as an abbreviation; a synonym-only short form is',()=>{
  const caps=clone(fixture('Fabry_disease'));caps.term='MALARIA';
  for(const d of caps.responses.mondo_exact.data.response.docs){d.label='malaria';d.exact_synonyms=[];}
  for(const d of caps.responses.ncit_exact.data.response.docs){d.label='Malaria';d.exact_synonyms=[];}
  for(const v of Object.values(caps.responses.mesh_details))v.data.terms=[{label:'Malaria',preferred:true}];
  assert.equal(compareCandidates(caps).code,'CROSS_SOURCE_AGREEMENT');
  const abbr=clone(fixture('Fabry_disease'));abbr.term='FD';
  for(const d of abbr.responses.mondo_exact.data.response.docs)d.exact_synonyms=['FD'];
  assert.equal(compareCandidates(abbr).code,'ABBREVIATION_NEEDS_DEFINITION');
});

test('records cut by lookup limits are reported as incomplete',()=>{
  const rec=clone(fixture('Fabry_disease'));rec.truncated={mondo_terms:0,ncit_terms:0,mesh_details:2};
  const c=compareCandidates(rec);
  assert.equal(c.complete,false);assert.ok(c.reasons.some(r=>r.includes('mesh_details 2개')));
});

const boundaries=Object.fromEntries(JSON.parse(readFileSync(new URL('./fixtures/candidates/review_boundaries.json',import.meta.url),'utf8')).cases.map(c=>[c.id,c.record]));

test('a linked target beyond the display limit still decides the result',()=>{
  const c=compareCandidates(boundaries['R2-linked-target-removed-by-candidate-slice']);
  assert.ok(c.cross_reference.ncit.includes('NCIT:C84701'));
  assert.notEqual(c.code,'SOURCE_DISAGREEMENT');
  assert.ok(c.flags.includes('ALTERNATIVE_EXACT_CANDIDATES'));
  const shuffled=clone(boundaries['R2-linked-target-removed-by-candidate-slice']);
  shuffled.responses.ncit_exact.data.response.docs.reverse();
  assert.equal(compareCandidates(shuffled).code,c.code);
});

test('records left unread by a lookup limit keep that source unknown',()=>{
  const c=compareCandidates(boundaries['R3-detail-limit-read-as-no-name-match']);
  assert.equal(c.code,'LOOKUP_INCOMPLETE');assert.equal(c.complete,false);
  assert.ok(c.cross_reference.ncit.length,'confirmed NCIt link is kept');
  assert.ok(c.reasons.some(r=>r.startsWith('MeSH') && r.includes('읽지 않아')));
  assert.ok(!c.reasons.some(r=>r.startsWith('MeSH') && r.includes('이름이 달라')));
});

test('version lookup failures are shown separately and never complete metadata',()=>{
  const c=compareCandidates(boundaries['R1-version-failure-omitted']);
  assert.equal(c.code,'CROSS_SOURCE_AGREEMENT');assert.equal(c.complete,true);
  assert.equal(c.metadata_complete,false);assert.ok(c.flags.includes('VERSION_UNAVAILABLE'));
  assert.deepEqual(c.metadata_failures.map(f=>f.source),['MONDO','NCIt']);
  assert.equal(compareCandidates(fixture('Fabry_disease')).metadata_complete,true);
});

test('earlier review boundaries stay fixed',()=>{
  assert.equal(compareCandidates(boundaries['F4-mesh-search-failure-with-xref-details']).complete,false);
  assert.equal(compareCandidates(boundaries['N1-negative-sign']).proposal,null);
});
