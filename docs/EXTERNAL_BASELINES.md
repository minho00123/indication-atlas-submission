# 외부 코퍼스의 문자열 매칭 기준선 — 과거 탐색 기록

**현재 Indication Atlas 사전이나 분류 방법의 정확도 평가가 아닙니다.** 이 기준선들은 프로젝트 사전을 사용하지 않고 공식 MONDO만 사용합니다. 새 실험을 실행한 결과가 아니라 기존 실행 기록을 분리해 보존한 자료입니다.

## 입력과 단위

[NCBI Disease Corpus 공식 배포처](https://www.ncbi.nlm.nih.gov/CBBresearch/Dogan/DISEASE/)의 전문가 MeSH/OMIM 주석을 참조했습니다. 보존한 실행 입력은 100개 문서·960개 언급입니다. 공식 배포 설명의 다른 버전·집계와 혼동하지 않도록 실행 입력의 SHA-256을 고정했습니다.

```text
NCBItestset_corpus.txt
61c8050bf6979ef7b943ec1158dfc03b651ea3367d4c37356f9de4841e85c9a3
```

문서 내 중복 제거 단위는 `(문서, 정규화된 언급, 정답 ID)` 조합입니다. 아래의 531은 문서 수가 아니며, 100개 문서에서 얻은 조합 수입니다. 이 단위들도 모두 독립 표본이라고 가정하지 않습니다. 코퍼스 원본과 MONDO OBO 전체는 제출물에 포함하지 않습니다.

## 방법과 채점

- M1: MONDO 라벨과 대소문자를 무시한 문자열 일치입니다.
- M2: 구두점 정규화 후 라벨·EXACT 동의어를 조회하고, 다중 후보는 보류합니다.
- M3: 모든 동의어 범위를 사용하고, 다중 후보에서는 가장 작은 ID를 선택합니다.
- 약어 시제품: 문서 내 긴 이름을 찾아 M2에 적용하고, 정의가 없는 약어형 표현은 보류합니다. 이 정책은 시제품에 한정되며 현재 사전의 관행적 약어 정책과 동일하지 않습니다.

정답과 예측의 MeSH/OMIM 교차참조 ID가 겹치면 CORRECT, 교차참조는 있지만 겹치지 않으면 WRONG, 예측 개념에 해당 교차참조가 없으면 UNSCORABLE, 예측하지 않으면 ABSTAIN으로 셌습니다. **WRONG은 교차참조 기준 불일치이며 전문가가 확정한 의미 오류 수가 아닙니다.** 원본 JSON의 false_auto_merge 필드는 당시 이름이며 실제 병합 동작을 측정한 지표로 해석하지 않습니다.

## 언급 단위 결과 — N=960

precision은 채점 가능한 예측 C/(C+W)입니다. coverage는 미채점 예측까지 포함한 (N−A)/N이므로 precision 분모와 다릅니다.

| 방법 | 예측 수 | CORRECT | ID 불일치 | 미채점 | 보류 | coverage | 채점 가능한 예측의 precision |
|---|---:|---:|---:|---:|---:|---:|---|
| M1 라벨 일치 | 231 | 149 | 27 | 55 | 729 | 0.241 | 149/176 |
| M2 EXACT 후보 | 465 | 280 | 68 | 117 | 495 | 0.484 | 280/348 |
| M3 모든 범위·다중 후보 선택 | 575 | 336 | 120 | 119 | 385 | 0.599 | 336/456 |
| M2 + 약어 시제품(동일 테스트셋 노출) | 494 | 319 | 52 | 123 | 466 | 0.515 | 319/371 |

M2는 465건을 예측했으며 그중 117건은 미채점입니다. 280/348을 960건 전체의 정확도로 읽지 않습니다.

## 문서 내 중복 제거 결과 — N=531 조합

| 방법 | CORRECT | ID 불일치 | 미채점 | 보류 | 채점 가능한 예측의 precision |
|---|---:|---:|---:|---:|---|
| M1 | 88 | 9 | 35 | 399 | 88/97 |
| M2 | 150 | 24 | 63 | 294 | 150/174 |
| M3 | 167 | 36 | 68 | 260 | 167/203 |
| 약어 시제품(탐색) | 159 | 20 | 64 | 288 | 159/179 |

## 결과 해석의 한계

M2의 68개 불일치를 잠정 재검토한 분포는 약어 의미 21, 세분도 13, 교차매핑 차이 28, 정답 의문 6입니다. 이 재분류 역시 단일 검토자의 잠정 라벨입니다. 의미 차이로 볼 수 있는 약어 의미(21)·세분도(13) 34건도 독립 전문가가 확인한 의미 오류라고 표현하지 않습니다.

- M2→M3는 동의어 범위와 다중 후보 처리 방식이 동시에 달라집니다. 차이를 범위 무시 하나의 인과 효과로 해석하지 않습니다.
- 약어 시제품은 같은 테스트셋의 출력을 보면서 만들고 파싱 문제를 수정했습니다. 독립 최종 평가나 일반화 성능으로 주장하지 않습니다.
- 정규화 함수는 부호 등 의미 있는 차이를 잃을 수 있습니다. 이 코드는 비교용 과거 기준선이며 현재 검색 정규화와 다릅니다.
- 채점은 교차참조의 범위·누락·버전 차이에 영향을 받습니다. 보존 결과의 신뢰구간도 이 채점 정의와 표본 구조의 한계 안에서 읽어야 합니다.
- LLM 조건과 사람 검수 조건은 실행하지 않았습니다. 경쟁사 시스템도 실측하지 않았습니다.

## 보존 파일과 재현 범위

- [기준선 결과 JSON](../evidence/boundary_checks/results_concept_baselines.json)
- [기준선 채점 코드](../evidence/boundary_checks/concept_baselines.py)
- [불일치 잠정 재검토 CSV](../evidence/boundary_checks/wrong_case_adjudication.csv)
- [약어 시제품 결과 JSON](../evidence/boundary_checks/results_abbrev_resolution.json)
- [약어 시제품 코드](../evidence/boundary_checks/abbrev_resolution.py)

파일 해시와 결과 집계는 `python3 tools/verify_supplement.py`로 오프라인 확인할 수 있습니다. 원래 벤치마크를 재실행하려면 별도로 확보한 원본 OBO·코퍼스와 해당 해시가 필요합니다.

```bash
python3 evidence/boundary_checks/concept_baselines.py --obo /path/to/mondo.obo --corpus /path/to/NCBItestset_corpus.txt --out /tmp/concept-baselines.json
python3 evidence/boundary_checks/abbrev_resolution.py --obo /path/to/mondo.obo --corpus /path/to/NCBItestset_corpus.txt --out /tmp/abbrev-resolution.json
```
