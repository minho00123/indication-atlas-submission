# 판정 지침 — 실제 임상시험 조건명 30건

목적: 300건 구축에 쓴 판단 기준(G01–G12)을 처음 보는 실제 데이터에 적용했을 때 판정이 일관되게 나오는지 시험합니다. 당신은 두 명의 독립 판정자 중 한 명입니다. 정답을 맞히는 시험이 아니라, 기준을 충실히 적용하는 것이 목표입니다.

## 반드시 읽을 것
1. 판단 기준: /Users/mino/Documents/indication-atlas-submission/docs/GUIDELINES.md (전체)
2. 300건의 판정 예시: /Users/mino/Documents/indication-atlas-submission/data/records.json
   - 참고할 항목 예: K007·K008·K009(CD 문맥), K010·K131(NSCLC와 조건 분리), K014(HER2 → LOCAL), K022(별도 개체), K116·K117(NAFLD/MASLD), K024(입력 충돌), K018(OR 표현)
   - 필드: research_decision, selected_standard_id, reviewed_candidates[].relation, rule_ids, rationale_ko
3. 판정 대상과 기본 후보: /private/tmp/claude-501/-Users-mino-Documents/f36b4291-b0fc-4d9e-aa2a-a0c100892fb9/scratchpad/val/judge/pack.json
   - 항목마다 condition(ClinicalTrials.gov 조건명), title, inclusion_excerpt(포함 기준 앞부분), MONDO·NCIt 기본 후보와 정의가 있습니다.

## 읽거나 열면 안 되는 것
- val/work/ 폴더 전체, val/judge/ 안의 다른 판정자 결과 파일. 자동 엔진 결과나 다른 판정을 보면 독립성이 깨집니다.
- 저장소 파일을 수정하지 마세요. 읽기만 합니다.

## 추가 후보 조회
기본 후보가 부족하면 공개 API로 직접 더 찾아도 됩니다(curl 또는 WebFetch).
- MONDO: https://www.ebi.ac.uk/ols4/api/search?q=<검색어>&ontology=mondo&rows=10
- NCIt: https://api-evsrest.nci.nih.gov/api/v1/concept/ncit/search?term=<검색어>&type=match&include=definitions
- MeSH: https://id.nlm.nih.gov/mesh/lookup/descriptor?label=<검색어>&match=contains&limit=10
규칙: **실제로 조회해서 응답에서 확인한 ID만** 적습니다. 기억으로 ID를 적지 마세요. 조회한 검색어는 queries_made에 남깁니다.

## 판정 방법 (300건과 같은 절차)
1. 조건명이 무엇을 가리키는지 정합니다. 제목과 포함 기준을 문맥으로 사용합니다.
2. 후보 정의를 읽고 각 후보와의 관계를 정합니다: EXACT(범위 같음) / BROADER(원문이 더 넓음) / NARROWER(원문이 더 좁음) / RELATED / DIFFERENT_ENTITY / UNKNOWN. 판단한 주요 후보만 적어도 됩니다.
3. 처리 상태(research_decision)를 아래 중 하나로 고릅니다.
   - PROVISIONAL_MAP: 같은 범위의 외부 개념에 연결
   - LOCAL_CONCEPT: 의미는 분명하지만 같은 범위의 외부 개념이 없음(검색 실패만으로 고르지 않음)
   - ROUTE_ENTITY: 질환이 아닌 개체(증상·소견·생리 상태·사건 등)로 별도 처리
   - SPLIT_EXPRESSION: OR 등으로 여러 개념이 결합된 표현
   - HOLD_AMBIGUOUS: 뜻을 정할 근거 부족
   - HOLD_SOURCE_CONFLICT: 조건명과 문맥이 서로 충돌
4. 조건명 안의 수식어(예: Metastatic, Prolonged)와 포함 기준의 환자 조건은 개념에 섞지 말고 patient_conditions에 따로 적습니다(G05).
5. 기준으로 판정하기 어려운 경우(예: 질환이 아닌 시술·교육·측정 지표 등)는 가장 가까운 처리 상태를 고르고 guideline_gap에 이유를 적습니다. 억지로 확신하지 마세요.

## 출력
아래 형식의 JSON 배열 하나를 지정된 경로에 저장합니다. 30건 모두 포함합니다.

```json
[{
  "item": "V01",
  "interpretation_ko": "조건명이 가리키는 대상 한 문장",
  "entity_type": "disease | finding_or_symptom | physiological_state | procedure_or_intervention | population | measurement | other",
  "research_decision": "PROVISIONAL_MAP | LOCAL_CONCEPT | ROUTE_ENTITY | SPLIT_EXPRESSION | HOLD_AMBIGUOUS | HOLD_SOURCE_CONFLICT",
  "selected_id": "MONDO:... 또는 NCIT:... 또는 MeSH:... 또는 null",
  "selected_label": "선택한 개념 이름 또는 null",
  "candidate_relations": [{"id": "MONDO:...", "relation": "EXACT"}],
  "patient_conditions": ["metastatic", "..."],
  "rule_ids": ["G04", "G07"],
  "rationale_ko": "판단 이유 1~3문장",
  "guideline_gap": {"flag": false, "note": ""},
  "confidence": "high | medium | low",
  "queries_made": ["..."]
}]
```

마지막에 짧은 요약(처리 상태별 건수, 기준이 부족했던 지점)을 답변으로 돌려주세요.
