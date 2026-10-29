# 질환·동의어 관리 유사 서비스 조사

> - **비교 대상:** 동의어 관리·문서 인식·검색 기능이 유사한 상용 서비스 3종을 비교했습니다.
> - **구축 자료:** MONDO·NCIt·MeSH·HPO는 질환 후보와 정의를 확인하는 공개 용어체계로 사용했습니다.
> - **적용한 점:** 이름과 개념을 분리하고, 동의어 검색과 상하위 관계를 구별하며, 입력별 판단 근거를 남겼습니다.

## 비교 대상과 참고 자료의 구분

| 구분 | 대상 | 이번 과제에서의 역할 |
|---|---|---|
| 상용 유사 서비스 | SciBite(CENtree·TERMite), Cortellis Ontologies API, Embase | 동의어 관리·문서 인식·검색 방식을 비교 |
| 공개 통합 플랫폼 | Open Targets, NCBI MedGen | 여러 용어체계와 연구 정보를 연결하는 방식 참고 |
| 공개 용어 조회 도구 | NCI EVS Explore, MeSH Browser, EBI OLS | 개념·동의어·정의·관계를 찾아보고 보여주는 방식 참고 |
| 구축에 사용한 용어 자료 | MONDO, NCIt, MeSH, HPO | 제공 키워드와 비교할 후보·정의·코드를 확인 |

Emtree는 Embase 검색에 쓰이는 용어체계입니다. 서비스인 Embase와, 그 검색의 기반이 되는 Emtree를 구분해 설명했습니다.

## 상용 유사 서비스 비교

공식 제품 문서와 도움말에 명시된 기능을 비교했습니다. 같은 입력으로 서비스 간 정확도나 속도를 측정한 비교는 수행하지 않았습니다.

| 서비스 | 동의어를 관리하고 보여주는 방식 | 장점과 주의할 점 | 이번 과제에 적용한 선택 |
|---|---|---|---|
| SciBite — CENtree·TERMite | CENtree는 개념·동의어·관계를 관리하며, 협업·검토·승인·버전 관리 기능을 제공합니다. TERMite는 용어집을 사용해 원문에서 표현을 인식하고 개념에 연결합니다. | 동의어·관계 편집과 검토·승인·변경 이력·출처 추적이 관리 흐름으로 연결됩니다. 원문 표현의 인식은 TERMite가 담당합니다. 공개 문서만으로는 개별 연결의 범위 판단 근거가 사용자에게 어떻게 보이는지 확인할 수 없습니다. | 이름·개념·후보 관계·출처를 나누어 저장했습니다. 다중 사용자 승인과 항목별 변경 이력 관리는 후속 과제로 남겼습니다. |
| Clarivate Cortellis Ontologies API | 통제 어휘에서 동의어·상하위 개념을 조회하고, 용어체계 사이의 ID를 연결합니다. 원문에서 인식한 표현의 ID와 위치를 반환하는 기능(NER)도 제공합니다. | 동의어 조회·계층 조회·코드 연결·원문 인식을 구별해 제공합니다. 공개 API 소개에서 확인한 범위이며 내부의 질환 동등성 판정 기준은 확인하지 못했습니다. | 원래 표현·연결한 개념·원문 위치를 구분했습니다. 코드가 연결돼 있어도 입력과 같은 범위인지는 별도로 검토했습니다. |
| Elsevier Embase / Emtree | 동의어를 선호어로 연결하는 검색과 더 좁은 개념까지 포함하는 검색을 구별합니다. 검색자가 동의어를 확인하고 추가·제거할 수 있습니다. | 검색 범위 확장은 더 많은 자료를 찾기 위한 동작입니다. 확장된 용어 모두가 같은 질환을 뜻하는 것은 아닙니다. | 등록된 별칭의 일치와 상하위·관련 개념을 구분했습니다. NAFLD/MASLD 같은 관련 결과를 같은 동의어 그룹으로 합치지 않았습니다. |

### 공식 근거

- **SciBite:** [용어 관리 기능](https://www.elsevier.com/products/scibite/ontology-management)에서 동의어·관계 관리, 검토·승인, 변경 이력과 출처 추적을 설명합니다. [문서 인식 기능](https://www.elsevier.com/products/scibite/data-enrichment)은 과학 개념·표기 변형·동의어의 인식과 연결을 설명합니다. 제품별 설명은 [CENtree 자료](https://scibite.com/wp-content/uploads/2024/01/Datasheet-SciBite-CENtree-3.0_20250312.pdf)와 [TERMite 자료](https://scibite.com/wp-content/uploads/2024/09/SciBite-Datasheet-TERMite.pdf)를 참고했습니다.
- **Cortellis:** [공식 개발자 포털](https://developer.clarivate.com/)의 [Ontologies API 소개](https://cortellislabs.com/api/ontologies/)에서 동의어·계층·ID 연결과 원문 인식 기능을 확인했습니다.
- **Embase:** [공식 검색 도움말](https://www.elsevier.support/embase/answer/how-do-i-search-in-embase)의 선호어 매핑, 하위 개념 확장, 동의어 선택 설명을 확인했습니다.

출처와 확인 문구는 [서비스 조사 근거 기록](../evidence/service_research/service_comparison_sources.json)에 보존했습니다.

## 공개 통합 플랫폼에서 참고한 점

| 플랫폼 | 관리·표시 방식 | 이번 과제에 반영한 점 |
|---|---|---|
| Open Targets | 질환·표현형을 연구 정보와 연결합니다. 26.06에서 EFO 질환 용어를 MONDO로 대량 교체했고, 26.09에서 온톨로지 간 중복 용어를 통합하는 단계를 추가했습니다. | 표시 이름과 개념 키·외부 코드·출처 버전을 나누어 관리했습니다. |
| NCBI MedGen | 여러 원천의 용어를 개념 번호(CUI)로 모으고 정의·개념 유형·외부 ID를 함께 보여줍니다. 누락 개념 생성과 큐레이터 검토도 수행합니다. | 같은 원천에서 가져온 정의·매핑의 일치를 독립 근거로 중복 계산하지 않았습니다. 자체 큐레이션 정보는 실제 출처를 확인해 별도로 검토합니다. |

Open Targets의 변경 사항은 [26.06 발표](https://blog.opentargets.org/open-targets-platform-26-06-has-been-released/)와 [26.09 발표](https://blog.opentargets.org/open-targets-platform-26-09-has-been-released/)를 확인했고, [발표 발췌](../evidence/service_research/opentargets_release_excerpts.json)를 보존했습니다. MedGen의 통합·관리 방식은 [공식 처리 문서](https://www.ncbi.nlm.nih.gov/medgen/docs/data/), [레코드 탐색 안내](https://www.ncbi.nlm.nih.gov/medgen/docs/navigating/), [개요](https://www.ncbi.nlm.nih.gov/medgen/docs/overview/)를 참고했습니다.

## 용어 조회 도구와 구축 자료

| 도구 | 참고한 관리·표시 방식 | 실제 적용 |
|---|---|---|
| NCI EVS Explore | NCIt의 코드·선호명·출처별 정의·동의어·계층을 구분해 표시 | K211의 요실금 임상 소견과 설문·평가 항목을 구별하고, K134의 폐기 코드를 대표로 고르지 않았습니다. |
| NLM MeSH Browser | Descriptor 안에 여러 Concept이 있고, 각 Concept에 Term이 속하는 구조 | 같은 Descriptor의 검색어라는 이유만으로 동의어로 묶지 않았습니다. K052의 용어 소속과 K070의 정의 범위를 따로 확인했습니다. |
| EBI OLS | 여러 용어체계의 이름·동의어·정의·ID를 검색 | 실제 임상시험 조건명 예비 시험에서 MONDO 후보를 조회했습니다. 조회 결과를 자동으로 사전에 등록하지 않습니다. |

NCIt의 관리 항목은 [EVS Explore 도움말](https://evsexplore.semantics.cancer.gov/evsexplore/overview), 사례 값은 [NCI 공식 API](https://api-evsrest.nci.nih.gov/api/v1/concept/ncit/search?term=urinary%20incontinence&type=match&include=summary&pageSize=50) 응답을 참고했습니다. MeSH 구조는 [NLM 설명](https://www.nlm.nih.gov/mesh/concept_structure.html), 실제 소속은 [Lichen Sclerosus 레코드](https://meshb.nlm.nih.gov/record/ui?ui=D018459)와 공식 RDF/API로 확인했습니다. OLS의 검색 방식은 [공식 도움말](https://www.ebi.ac.uk/ols4/ols3help)을 참고했습니다. 검색 옵션의 `exact`와 임상 범위 관계의 EXACT는 구별합니다.

MONDO·NCIt·MeSH·HPO는 이 사전의 구축 근거입니다. 제공 키워드와 후보의 의미 범위를 대조한 방법은 [구축 과정](#materials/methodology), 개별 판단 규칙은 [판단 기준](#cases)에 정리했습니다.

## 조사에서 정한 구현 방향

1. **이름과 개념을 분리:** 같은 뜻의 이름은 같은 개념 키에 연결하고, CD처럼 뜻이 여러 개인 표현은 문맥별 판단을 남겼습니다.
2. **검색 범위와 동의어를 구분:** 상하위·관련 관계는 동의어 목록과 분리했습니다. 후보 이름이 같아도 정의 범위와 개념 유형을 비교했습니다.
3. **입력별 근거를 보존:** 원문·후보·관계·판단 이유·보류 사유를 연결했습니다. 같은 NSCLC 개념으로 묶어도 K010의 전이·이전 치료 조건은 해당 항목에만 보존했습니다.

이번 구현에서는 제공된 300개 항목의 원문과 판단을 한곳에서 검토할 수 있게 했습니다. 협업 승인·변경 이력 관리와 새 자료에 대한 독립 평가는 후속 과제로 남아 있습니다.
