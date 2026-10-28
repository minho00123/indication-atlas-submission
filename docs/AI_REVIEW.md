# AI 교차 검토로 찾고 고친 문제

AI를 초안 작성·공식 자료 대조·반례 탐색·구현에 사용했습니다. 검토에서 나온 의견은 원문, 보존한 공식 자료, 실제 실행 결과와 대조해 채택·부분 채택·유지로 나눴습니다. **두 AI의 의견 일치를 정답으로 보지 않았습니다. 교차 검토는 블라인드 독립 검토나 임상 전문가 검증이 아닙니다.**

## 실제 기록으로 확인하는 과정

초기 사전·검토 결과를 받은 뒤 원문과 공식 자료로 대조하고, 제안을 채택하거나 유지한 이유를 남겼습니다. 수정된 자료를 다시 검토하면서 별칭 누락·이름 구성 요소의 역할을 보강했습니다. 웹 구현 뒤에는 Claude의 반례 보고를 Codex가 재현하고 실행기를 수정했습니다. 아래 사례는 이 단계의 기록이며 모든 AI 작업의 완전한 시간 순서를 재구성한 것은 아닙니다.

## 지적에서 판정·수정까지

| 지적·검토 방향 | 확인한 내용 | 근거 기록 | 판정과 반영 |
|---|---|---|---|
| Claude → Codex 사전 | NAFLD·MASLD·PASC·Polycystic Ovarian Syndrome 등의 별칭 누락 | [최종 교차판정 항목 1](./evidence/review_process/final_adjudication_excerpt.json), [K116](#records?record=K116) | 채택. 공식 명칭·용어 소속을 확인해 별칭을 추가했습니다. NAFLD/MASLD 개념 병합과는 구별했습니다. |
| Claude → Codex 사전 | K262 NTM MeSH 후보 누락 | [최종 교차판정 항목 2](./evidence/review_process/final_adjudication_excerpt.json), [K262 정의·출처](#records?record=K262) | 부분 채택. 후보를 추가했지만 MeSH의 M. leprae 포함과 CDC의 제외 차이 때문에 EXACT로 승인하지 않았습니다. LOCAL·UNKNOWN을 유지했습니다. |
| Claude → Codex 사전 | acute/chronic 등의 이름 토큰과 환자 조건 역할 혼재 | [최종 교차판정 항목 3](./evidence/review_process/final_adjudication_excerpt.json), [K011](#records?record=K011) | 역할 분리를 채택했습니다. 원문 구간을 보존하고 이름 구성 요소와 추가 조건을 구별했습니다. 이후 다른 수식어에도 적용했습니다. |
| Codex의 초기 교차판정 | K043·K139·K200 등의 ID와 관계 방향 차이 | [초기 사례별 교차판정](./evidence/review_process/initial_id_review_excerpt.json), [K200](#records?record=K200) | 공식 정의·원문 범위를 대조하고 관계를 원문→후보로 통일했습니다. 모든 차이가 잘못된 ID라는 결론은 내리지 않았습니다. |
| Codex 일관성 검토 | K004 판단 이유의 원문에 없는 인슐린 조건 설명 | [K004 검토 행](./evidence/review_process/k004_consistency_excerpt.json), [현재 K004](#records?record=K004) | 설명을 수정했습니다. 실제 환자 속성에는 원래도 인슐린 조건을 생성하지 않았음을 구별했습니다. |
| Codex → Claude 분석 제안 | 68건을 임상 오류로 단정, 531을 문서 수로 표기, 42개 항목을 42개 시험으로 표기 | [제안 정정 기록](./evidence/review_process/proposal_corrections_excerpt.json), [보조 분석 근거](./evidence/boundary_checks/manifest.json) | 수정했습니다. 교차참조 불일치, 100개 문서의 중복 제거 단위, 40개 시험의 42개 비교 항목으로 구별했습니다. 현재 사전의 성능으로 사용하지 않습니다. |
| Claude → Codex 분석기 | SCLC 부분 구간 오연결, 원문 근거 미확인, 부정·조건 범위, 관계 사유, OR 의존 | [수정 전 반례 8개 실행](./evidence/review_process/runtime_before.json), [수정 후 같은 8개 입력](./evidence/review_process/runtime_after.json), [현재 실행 검사](#analyze) | 반례를 재현한 뒤 부분 표기 보호·원문 주장·조건 범위·미검토 관계·논리 구조의 처리를 보강했습니다. 새 검사도 개발 검사이며 독립 평가가 아닙니다. |
| Codex → Claude 제안 | 부정 접두·절 전체의 부정 복사, 300행 재조회 해석 | [제안 발췌와 원본 해시](./evidence/review_process/proposal_corrections_excerpt.json), [대조 설계](#materials/audit-method) | 일괄 전파를 채택하지 않았습니다. 개념 식별·문장 주장·요건 필수성을 구별하고, PROVIDED_INPUT이 있는 297행과 전체 300행을 구별했습니다. |
| Codex 대조 실행 중 발견 | 한 의미의 별칭을 제거한 뒤 CD가 반대 의미로 연결되는 위험 | [수정 전 출처 제거 반례](./evidence/review_process/ablation_discovery.json), [현재 B 대조](#materials/audit) | CD·AML의 문서 정의 요구 안전 규칙을 추가했습니다. B에도 남는 전역 정책이며 행 출처 제거를 독립 평가로 포장하지 않습니다. |

## 근거를 추적하는 방법

각 링크는 실제 판정 행, 보존한 검토 기록 발췌 또는 실행 결과로 연결됩니다. 검토 발췌에는 원본 파일명·원본 SHA-256·해당 항목을 남겼습니다. 발췌가 원본 전체 파일이라는 뜻은 아닙니다. [포함된 검토 자료의 해시 목록](./evidence/review_process/manifest.json)으로 제출 파일의 변경 여부를 확인할 수 있습니다.

개인 대화, 개인 경로, 비용 정보는 포함하지 않았습니다. 지적자나 순서를 확인하지 못한 과거 사례는 임의로 채우지 않았습니다. 구 LLM 실험 수치를 현재 정확도로 쓰지 않는 정책은 [방법·한계](#materials/methodology)의 별도 초기 탐색 실험에서 확인할 수 있습니다.
