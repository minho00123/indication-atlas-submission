// Candidate comparison over saved real responses (retrieved 2026-10-29). Development checks only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchCandidates,compareCandidates,lookupUrls} from '../app/candidates.mjs';
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

test('three-way agreement links MONDO, NCIt and MeSH by cross-reference',()=>{
  const c=compareCandidates(fixture('Fabry_disease'));
  assert.deepEqual(c.proposal.candidates,['MONDO:0010526','NCIT:C84701','MESH:D000795']);
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
  assert.ok(partial.reasons.some(r=>r.includes('MESH 조회에 실패')));
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
  assert.deepEqual(c.proposal.candidates,['MONDO:0009290']);
});
