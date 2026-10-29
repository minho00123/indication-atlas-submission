// Multi-line intake for new inputs. Each line is an independent document run through the
// same analyzer; this module adds no classification rules of its own.
export const BATCH_FORMAT = 'batch-1';
export const BATCH_LIMITS = {rows:50,characters:50000};

// "target" or "target | source text"; only the first ASCII "|" separates the two.
export function parseBatch(input,limits=BATCH_LIMITS) {
  const text=String(input ?? '');
  if(text.length>limits.characters)throw new RangeError(`전체 입력은 ${limits.characters.toLocaleString('en-US')}자 이내로 입력해 주세요. 잘라내지 않고 중단했습니다.`);
  const rows=[];
  text.split(/\r\n|\r|\n/u).forEach((raw,i)=>{
    if(!raw.trim())return;
    const bar=raw.indexOf('|');
    const keyword=(bar<0?raw:raw.slice(0,bar)).trim(),source=bar<0?'':raw.slice(bar+1);
    rows.push({line:i+1,keyword,text:source.trim()?source:'',has_text:!!source.trim()});
  });
  if(rows.length>limits.rows)throw new RangeError(`한 번에 ${limits.rows}줄까지 처리합니다. 현재 ${rows.length}줄이며 잘라내지 않고 중단했습니다.`);
  return rows;
}

export function runBatch(analyzer,rows) {
  return rows.map(row=>{
    if(!row.keyword)return {...row,status:'INPUT_ERROR',error:'대상 표현이 비어 있습니다.',result:null};
    try { return {...row,status:'ANALYZED',result:analyzer.analyze({keyword:row.keyword,text:row.text})}; }
    catch(e) { return {...row,status:'INPUT_ERROR',error:e.message,result:null}; }
  });
}

const steps={
  UNREGISTERED:[['G04','다른 표기나 기존 개념의 별칭인지 먼저 확인합니다. 기존 개념의 별칭이면 새 개념을 만들지 않습니다.'],['G07','질환인지, 소견·증상·생리 상태·사건인지 개체 유형을 확인합니다.'],['G03','후보 정의의 부위·원인·아형 범위를 원문과 비교합니다.'],['G10','의미가 분명하고 맞는 외부 코드가 없을 때만 범위를 정의한 LOCAL을 검토합니다. 검색에서 못 찾았다는 이유만으로 만들지 않습니다.']],
  AMBIGUOUS:[['G02','문서 안의 긴 이름(약어) 정의와 후보 의미를 확인합니다. 다른 질환의 동시 언급만으로 해소하지 않습니다.']],
  MODIFIED:[['G03','수식어·부위·아형·바이오마커가 개념 범위를 바꾸는지, 상태를 덧붙이는 추가 조건인지 확인합니다.']],
  TEXT:[['G01','원문과 대상 표현 중 어느 쪽이 맞는지 자동 단정하지 않고 두 필드를 확인합니다.'],['G03','원문의 개념과 대상 개념의 범위 관계를 검토합니다.']],
  EXPRESSION:[['G06','논리 구조와 각 피연산자의 미등록·다의 여부를 확인합니다.']],
  CONTEXT:[['G05','가족력·과거력·선정/제외 기준·등위 부정 등 지원하지 않는 문형을 실제 문장으로 확인합니다. 상태 코드만 보고 승인하지 않습니다.']],
  NAME_ONLY:[['G01','이름만 조회했습니다. 원문 문맥·환자 조건은 확인하지 않았습니다.']]
};
const groupOf={UNREGISTERED:'UNREGISTERED',HOLD_AMBIGUOUS:'AMBIGUOUS',HOLD_DEFINITION:'AMBIGUOUS',HOLD_MODIFIED_MENTION:'MODIFIED',HOLD_SCOPE_REVIEW:'MODIFIED',
  HOLD_TARGET_NOT_IN_TEXT:'TEXT',HOLD_RELATION_UNREVIEWED:'TEXT',HOLD_SOURCE_CONFLICT:'TEXT',HOLD_EXPRESSION_UNRESOLVED:'EXPRESSION',
  UNREGISTERED_TERM:'UNREGISTERED',AMBIGUOUS_ALIAS:'AMBIGUOUS',DECLARED_AMBIGUITY_POLICY:'AMBIGUOUS',UNRESOLVED_DEFINITION:'AMBIGUOUS',EXPRESSION_PARTIAL:'EXPRESSION'};

// Review guidance from decision, reason codes and unsupported patterns; several may apply.
export function nextSteps(result) {
  if(!result)return [];
  const groups=[];
  const add=g=>{if(g && !groups.includes(g))groups.push(g);};
  add(groupOf[result.decision]);
  for(const r of result.reasons)add(groupOf[r.code]);
  if(result.unsupported_patterns.length || result.target_evidence_status==='UNKNOWN')add('CONTEXT');
  if(result.target_evidence_status==='NO_TEXT')add('NAME_ONLY');
  return groups.flatMap(g=>steps[g].map(([rule,text])=>({rule,text})));
}

// Fixed official search pages; only the target expression is encoded, never the source text.
export function searchLinks(keyword) {
  const q=encodeURIComponent(String(keyword).trim());
  return [
    {name:'MONDO (OLS)',url:`https://www.ebi.ac.uk/ols4/search?q=${q}&ontology=mondo`},
    {name:'NCIt (EVS Explore)',url:`https://evsexplore.semantics.cancer.gov/evsexplore/search?terminology=ncit&term=${q}&type=contains`},
    {name:'MeSH Browser',url:`https://meshb.nlm.nih.gov/search?searchMethod=FullWord&searchInField=allTerms&searchType=allWords&sort=primaryTerm&size=20&from=0&q=${q}`}
  ];
}

export function needsReview(row) {
  return row.status==='INPUT_ERROR' || !['LINKED','LOCAL_LINKED','ROUTE_ENTITY','SPLIT_OR'].includes(row.result.decision);
}

// Spreadsheet cells must not execute input as formulas; JSON keeps the raw strings.
const cell=value=>{
  let s=String(value ?? '');
  if(/^[=+\-@\t\r]/u.test(s))s="'"+s;
  return /[",\r\n]/u.test(s)?'"'+s.replaceAll('"','""')+'"':s;
};
export function batchCSV(rows,meta) {
  const header=['line','keyword','has_text','status','decision','normalization_status','target_evidence_status','concept_keys','reason_codes','unsupported_patterns','engine_version','dataset_version'];
  const lines=rows.map(r=>[r.line,r.keyword,r.has_text,r.status,r.result?.decision ?? '',r.result?.normalization_status ?? '',r.result?.target_evidence_status ?? '',
    (r.result?.concept_keys ?? []).join(' '),(r.result?.reasons ?? []).map(x=>x.code).join(' '),(r.result?.unsupported_patterns ?? []).join(' '),meta.engine_version,meta.dataset_version].map(cell).join(','));
  return [header.join(','),...lines].join('\r\n')+'\r\n';
}
