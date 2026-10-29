# 보조 분석 자료

2026-10-28에 작성된 기존 탐색 분석의 필요한 결과·코드·당시 수집 발췌만 보존했습니다. 현재 프로젝트 사전의 정확도나 분류 방법의 개선을 입증한 자료가 아닙니다. 과거 리뷰 대화와 이전 버전의 전체 프로젝트는 포함하지 않습니다.

- NCBI Disease Corpus: https://www.ncbi.nlm.nih.gov/CBBresearch/Dogan/DISEASE/
- MONDO 고정 릴리스: https://github.com/monarch-initiative/mondo/releases/tag/v2026-10-06
- ClinicalTrials.gov API v2: https://clinicaltrials.gov/data-api/api

NCBI 코퍼스 원본과 MONDO OBO 전체는 포함하지 않습니다. 실행 입력 해시·출처·범위·파일 해시는 manifest.json에서 확인합니다. mondo_hierarchy_excerpt.json은 원본의 선택 구문만 담으며 전체 온톨로지나 임상 검증 결과가 아닙니다.

results_concept_baselines.json과 results_abbrev_resolution.json의 WRONG/false_auto_merge는 과거 코드의 교차참조 기반 불일치 지표입니다. 실제 병합 오류나 독립 전문가가 확정한 의미 오류와 구별해야 합니다. UNSCORABLE을 제외한 precision과 전체 예측 coverage의 분모도 다릅니다. 약어 시제품은 동일 테스트셋을 보며 개발했습니다.

eligibility_seed_v1.json/csv는 40개 임상시험에서 Claude가 어려운 사례를 범주별로 검색해 골라 구성한 42개 비교 항목입니다. 라벨은 Claude 단독의 잠정 판단이며 비대표 표본입니다. ctgov_items_raw_20261028.json은 당시의 제목·조건 목록·선택한 적격 기준 발췌입니다. 전체 API 응답은 아니며, 발췌에 없는 정보가 전체 원문에도 없다는 뜻은 아닙니다. condition_text와 qualifiers에는 분석자가 구성한 표현도 있으므로 원천 필드와 구별해 읽어야 합니다.

현재 제출물에서는 이 파일들을 실행 중 분류에 사용하지 않습니다. tools/verify_supplement.py는 해시·단위·집계·발췌 연결을 확인합니다. 벤치마크 입력으로 새 예측을 생성하거나 임상 라벨의 타당성을 검증하지는 않습니다.
