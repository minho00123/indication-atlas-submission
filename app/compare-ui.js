const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const presets=[
 {label:'NAFLD / MASLD',left:{id:'K116'},right:{id:'K117'},note:'현재 사전에서는 과거 NAFLD 범위와 현행 MASLD 범위를 분리하고 관련 검색으로 연결합니다. 같은 이름 변경이라는 설명만으로 기준 차이를 지우지 않습니다.',case:'masld'},
 {label:'eczema / 아토피 피부염',left:{id:'K001'},right:{id:'K025'},note:'일반 eczema 원문을 atopic dermatitis 아형으로 좁히지 않습니다. K001의 원문→아토피 후보 관계는 BROADER입니다.',case:'eczema'},
 {label:'PTCL 질환군 / PTCL-NOS',left:{id:'K171'},right:{id:'K171',candidate:'MONDO:0004964'},note:'질환군과 NOS 후보를 구별합니다. K171 원문→NOS 후보 관계는 BROADER입니다. 오른쪽은 검토 후보이며 새로 승인한 사전 개념이 아닙니다.'},
 {label:'GCA / temporal arteritis',left:{id:'K076'},right:{id:'K076',candidate:'NCIT:C35065'},note:'공식 명칭 관계와 출처 정의를 검토해 같은 개념으로 연결한 사례입니다. 두 개의 다른 질환 그룹을 만든 것이 아닙니다.',case:'gca'}
];
const cached=new Map();
async function record(id){if(!cached.has(id))cached.set(id,fetch(`./data/records/${id}.json`).then(r=>{if(!r.ok)throw Error('record');return r.json();}));return cached.get(id);}
export function mountCompare(root,catalog) {
 root.innerHTML=`<h1>개념과 후보 나란히 보기</h1><p>같은 이름·범위·관계인지 기존 검토 자료로 비교합니다. 출처가 다른 정의를 같은 기준의 완전한 명세로 취급하지 않습니다.</p><div class="compare-choices" role="group" aria-label="비교 사례">${presets.map((p,i)=>`<button data-compare="${i}">${esc(p.label)}</button>`).join('')}</div><div id="compare-result" aria-live="polite"></div>`;
 let request=0;
 async function show(index) {
  const serial=++request,p=presets[index],node=root.querySelector('#compare-result');node.innerHTML='<p>비교 자료를 불러오고 있습니다.</p>';
  root.querySelectorAll('[data-compare]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.compare)===index)));
  try {
   const rows=await Promise.all([record(p.left.id),record(p.right.id)]);if(!root.isConnected || serial!==request)return;
   node.innerHTML=`<p class="compare-note">${esc(p.note)}</p><div class="compare-columns">${[p.left,p.right].map((side,i)=>{
    const row=rows[i],candidate=row.reviewed_candidates.find(c=>c.candidate_key===(side.candidate??row.selected_standard_id??row.concept_key)),isGroup=!side.candidate;
    const aliases=isGroup || candidate?.relation==='EXACT'?catalog.aliases.filter(a=>a.concept_key===row.concept_key):[];
    return `<section class="compare-column"><p class="eyebrow">${isGroup?'현재 사전의 선택 개념':'공식 출처의 검토 후보'}</p><h2>${esc(candidate?.label??row.standard_name)}</h2><code>${esc(candidate?.candidate_key??row.concept_key)}</code>${candidate?`<p class="source-note">출처: ${esc(candidate.system)} · 원문→이 후보: ${esc(candidate.relation)} · 버전 ${esc(candidate.version==='LIVE_API_SNAPSHOT_RELEASE_NOT_EXPOSED'?'조회 응답 · 릴리스 미노출':candidate.version??'응답 기록 참조')}</p>`:''}
    <h3>원문</h3><blockquote>${esc(row.raw_context)}</blockquote><h3>이 출처의 보존 정의</h3>${row.source_id==='K116'?'<p class="runtime-note">이 카드는 과거 NAFLD 범위를 보존합니다. 현행 MASLD와의 기준 차이는 오른쪽 카드와 관련 판정에서 확인합니다.</p>':''}${(row.definition_warnings??[]).filter(w=>w.candidate_keys?.includes(candidate?.candidate_key)).map(w=>`<p class="runtime-note">정의·범위 주의: ${esc(w.rationale_ko)}</p>`).join('')}${candidate?.definitions.length?candidate.definitions.map(d=>`<blockquote>${esc(d.text)}<small>${esc(d.source??candidate.system)}</small></blockquote>`).join(''):'<p>이 후보의 보존 정의가 없습니다. 이름으로 내용을 보충하지 않습니다.</p>'}
    <h3>${isGroup?'개념 그룹의 검토 별칭':'현재 그룹의 검토 별칭 · EXACT 후보인 경우'}</h3><p>${aliases.length?esc([...new Set(aliases.map(a=>a.term))].join(' · ')):'이 후보를 새 동의어 그룹으로 승인하지 않았습니다.'}</p><h3>현재 판정 근거</h3><p>${esc(row.rationale_ko)}</p><a href="#records?record=${row.source_id}${candidate?'&candidate='+encodeURIComponent(candidate.candidate_key):''}">${row.source_id} 원문·전체 후보·근거 보기 ↗</a></section>`;
   }).join('')}</div><p>${p.case?`<a href="#cases/${p.case}">이 판단 사례의 비교 축 보기 ↗</a>`:''}</p>`;
  }catch(e){if(root.isConnected && serial===request)node.textContent='비교 자료를 불러오지 못했습니다. 새로고침해 주세요.';}
 }
 root.querySelectorAll('[data-compare]').forEach(b=>b.onclick=()=>show(Number(b.dataset.compare)));show(0);
}
