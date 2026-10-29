# 실제 임상시험 문구의 비교 — 잠정 탐색 자료

**40개 임상시험에서 구성한 42개 조건명–적격 기준 비교 항목**입니다. Claude가 어려운 상황(약어·세분도·조건 차이 등)을 범주별로 검색하고 골라 구성했습니다. 전체 임상시험을 대표하는 표본이 아닙니다. 출처는 ClinicalTrials.gov API v2의 당시 수집 발췌이며, 전체 공식 응답을 보존했다고 표시하지 않습니다.

## 라벨과 비교 대상

라벨은 단일 AI(Claude)의 PROVISIONAL_RESEARCHER_LABEL입니다. 독립 2인 주석이나 임상 전문가 검증을 받지 않았습니다. 각 항목에는 조건명의 개념 연결과, 맨 질환 개념만으로 표현한 환자군이 선택한 원문과 같은지 보는 잠정 비교를 구별해 기록했습니다.

‘조건명과 적격 기준이 다름’은 질환명 정규화가 틀렸다는 뜻이 아닙니다. 질환명에는 연령·치료 이력 등 전체 환자 조건이 담겨 있지 않을 수 있습니다. 발췌에 없는 정보가 전체 기록에도 없다고 판단하지 않습니다.

| 잠정 라벨 | 항목 수 |
|---|---:|
| EQUIVALENT | 2 |
| NARROWER — 발췌가 조건을 더 제한 | 22 |
| BROADER — 발췌가 더 넓은 범위를 허용 | 3 |
| DIFFERENT | 9 |
| NOT_DISEASE | 3 |
| UNKNOWN | 3 |
| 합계 | 42 |

**2/42는 이 잠정 라벨의 분포입니다.** 현재 사전의 정확도, 질환명 정규화의 성공률, 전체 임상시험의 일반적 비율을 뜻하지 않습니다.

## 원문 필드와 함께 읽는 예

E01의 조건명은 Acute Myeloid Leukemia (AML)이며, 임상시험 제목에는 Relapsed or Refractory가 있습니다. 당시 보존한 적격 기준 발췌에는 연령과 ECOG 등의 조건이 있습니다. 재발·불응 정보의 출처는 제목과 구별해서 읽어야 합니다.

```text
항목: E01 / NCT07198867
제목: A Study of A-CAR028 Treatment in Subjects With Relapsed or Refractory Acute Myeloid Leukemia
조건명: Acute Myeloid Leukemia (AML)
적격 기준 발췌: 18 to 75 years old at the time of signing the Informed Consent Form (ICF)
적격 기준 발췌: ECOG score 0 or 1
잠정 비교: NARROWER
```

[임상시험 원천 페이지](https://clinicaltrials.gov/study/NCT07198867)의 현재 내용은 수집 당시와 달라질 수 있습니다. 당시 제목·조건 목록·발췌는 아래 보존 파일로 확인합니다.

E02의 조건명은 Metastatic Castration-resistant Prostate Cancer이며, 보존된 발췌에는 성별·연령·검사 조건 등이 있습니다. 이 자료는 조건명과 원문별 조건을 따로 보존할 필요를 살펴보는 예입니다. 각 라벨이 적절한지는 독립 검토가 필요합니다.

- [42개 비교 항목 JSON](../evidence/boundary_checks/eligibility_seed_v1.json)
- [42개 비교 항목 CSV](../evidence/boundary_checks/eligibility_seed_v1.csv)
- [당시 수집한 제목·조건 목록·적격 기준 발췌](../evidence/boundary_checks/ctgov_items_raw_20261028.json)
- [잠정 라벨 구성 스크립트](../evidence/boundary_checks/build_eligibility_seed.py)
- [당시 수집 스크립트](../evidence/boundary_checks/fetch_ctgov_items.py)

위 스크립트와 라벨은 과거 탐색 자료입니다. 현재 사전의 판정이나 실행 중 동작에 적용하지 않습니다. 원천 사실·조건명·적격 기준·선택한 발췌·라벨을 구별하고, 독립 주석 후 평가 자료로 사용할 수 있는지 검토하는 것이 후속 과제입니다.
