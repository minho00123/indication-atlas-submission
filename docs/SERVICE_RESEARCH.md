# 질환·동의어 관리 유사 서비스 조사

!> **조사 범위:** 공개 서비스 4종과 상용 서비스 2종의 공식 자료를 비교했습니다.
!> **참고한 점:** 개념별 이름·동의어·정의·출처를 관리하는 방식과, 동의어 검색을 하위 개념 확장과 구별하는 방식입니다.
!> **이 사전의 방향:** 제공 항목마다 연결·분리·보류한 이유를 남겼습니다. 이름이 검색됐다는 사실과 같은 개념이라는 판단을 구별합니다.

공식 문서·공개 레코드·API 응답을 바탕으로 질환과 동의어의 관리·검색 방식을 비교하고, 이번 과제에 적용할 점을 정리했습니다.

## 비교 결과

| 서비스 | 질환·동의어를 관리하고 보여주는 방식 | 장점과 주의할 점 | 이번 과제에 반영한 선택 |
|---|---|---|---|
| Open Targets Platform | 질환·표현형을 연구용 개체로 통합하고, 프로필에서 설명·외부 참조·연관 근거를 연결합니다. 26.06에서 EFO 질환 용어를 MONDO로 대량 교체했고, 26.09에서 온톨로지 간 중복 질환 용어를 병합하는 단계를 추가했습니다. | 질환명 표준화가 표적·약물·임상 근거 연결로 이어집니다. 다만 표현형·측정도 함께 다루고, ID 교체·병합이 릴리스에 따라 달라집니다. | 개념 키·출처별 매핑·개체 유형·버전을 분리해 기록했습니다. |
| NCI EVS Explore / NCIt | Concept Details에서 코드·선호명, 정의의 출처, 동의어·약어, 계층을 구분해 보여줍니다. | 같은 이름의 출처와 의미를 검토하기 좋고 암의 조직형·분자형에 유용합니다. 같은 검색에 질환·소견·설문·평가 항목·동물 종양·폐기 코드가 함께 나올 수 있습니다. | 이름 외에 정의·개념 유형(semantic type)·활성 상태를 확인했습니다. K211의 요실금 설문, K134의 폐기 코드는 기본 개념으로 고르지 않았습니다. |
| NLM MeSH Browser | Descriptor → Concept → Term 구조입니다. 같은 Concept의 용어가 동의어 단위이고, 한 Descriptor에 범위가 다른 Concept이 함께 들어갈 수 있습니다. | 검색어와 개념 소속을 구조적으로 추적할 수 있습니다. 같은 Descriptor나 검색용 Entry Term이라는 사실만으로 임상 범위가 같다고 볼 수는 없습니다. | Descriptor ID와 Concept ID를 함께 보존했습니다. K052는 같은 Concept 소속을 근거로 보강하고, K070은 정의의 증상성 차이를 따로 판정했습니다. |
| NCBI MedGen | 여러 원천의 용어를 개념 번호(CUI) 중심으로 모으고 이름·개념 유형(semantic type)·외부 ID·정의를 구분해 보여줍니다. | 원천 간 연결과 정의 출처를 한곳에서 살피기 편하고, 누락 개념 생성·큐레이터 검토 같은 자체 관리도 있습니다. 다만 다른 서비스와 같은 원천 정의·매핑을 재사용한 부분의 일치는 독립 검증으로 중복 계산하면 안 됩니다. 화면과 XML의 표시 ID 범위도 다릅니다. | 출처 계보를 유지하고 다수결로 판정하지 않았습니다. 자체 큐레이션 정보는 실제 출처를 확인해 별도 근거로 검토합니다. 질환과 임상 소견을 구별하고 정의 출처를 함께 보여줍니다. |

Open Targets의 ID·중복 통합 변화는 각각 [26.06 공식 발표](https://blog.opentargets.org/open-targets-platform-26-06-has-been-released/)와 [26.09 공식 발표](https://blog.opentargets.org/open-targets-platform-26-09-has-been-released/)에서 확인했고, 인용 문장은 [Open Targets 발표 발췌](../evidence/service_research/opentargets_release_excerpts.json)에 보존했습니다. [질환/표현형 문서](https://platform-docs.opentargets.org/disease-or-phenotype.md)와 릴리스별 변경 사항을 함께 참고했습니다.

NCIt 화면 구성과 관리 항목은 [EVS Explore 공식 도움말](https://evsexplore.semantics.cancer.gov/evsexplore/overview), 과제 사례의 값은 보존한 [NCI 공식 API 조회](https://api-evsrest.nci.nih.gov/api/v1/concept/ncit/search?term=urinary%20incontinence&type=match&include=summary&pageSize=50)를 근거로 삼았습니다.

MeSH의 구조는 [NLM Concept 설명](https://www.nlm.nih.gov/mesh/concept_structure.html), 실제 용어 소속은 [Lichen Sclerosus 레코드](https://meshb.nlm.nih.gov/record/ui?ui=D018459)와 공식 RDF/API로 확인했습니다. MedGen의 통합 방식은 [데이터 처리 문서](https://www.ncbi.nlm.nih.gov/medgen/docs/data/), 표시 방식은 [레코드 탐색 문서](https://www.ncbi.nlm.nih.gov/medgen/docs/navigating/), 원천 재사용은 [개요](https://www.ncbi.nlm.nih.gov/medgen/docs/overview/)를 확인했습니다.

## 상용 서비스 비교

질환·적응증 검색을 제공하는 상용 서비스의 공개 문서에서 동의어 검색·매핑·검색 확장 기능을 비교했습니다.

| 서비스 | 공개 문서에서 확인한 관리·표시 방식 | 채택할 점 | 이번 조사 범위의 한계 |
|---|---|---|---|
| Clarivate Cortellis Ontologies API | 통제 어휘의 이름·동의어 사전, 개념 간 계층, 원문에서 질환명 등을 찾아 식별자와 위치를 반환하는 기능(NER)을 설명 | 표현·개념 ID·원문 위치를 연결하고, 이름 일치와 개념 범위를 구별 | 공개 API 소개를 확인했습니다. 실제 계약 API를 호출하거나 내부 정제·충돌 해결 정책을 검증하지 않음 |
| Elsevier Embase / Emtree | 용어를 선호어로 매핑하는 검색과 더 좁은 개념까지 확장하는 검색을 구별. 검색자가 동의어를 보고 추가·제거하도록 설명 | 동의어 검색과 하위 개념 포함 검색을 별도 동작으로 표시하고 실제 확장 내용을 확인 가능하게 제공 | 공식 도움말로 기능을 확인했습니다. 유료 화면·라이선스 어휘 데이터 전체를 검사하지 않음 |

Cortellis는 [공식 개발자 포털](https://developer.clarivate.com/)에서 안내하는 [Ontologies API 소개](https://cortellislabs.com/api/ontologies/)를 근거로 합니다. Embase는 [공식 검색 도움말](https://www.elsevier.support/embase/answer/how-do-i-search-in-embase)의 Disease·PICO 및 매핑/확장 설명을 확인했습니다. 조사 출처와 확인 문구는 `data/sources.json`에서 확인할 수 있습니다.

## 이 비교에서 내린 선택

입력별 문맥과 후보 정의를 비교할 수 있도록 **원본 항목 → 개념 → 문맥별 별칭 → 외부 코드 연결 → 판단 근거**를 구분해 보존했습니다.

검색에서는 검토 후 등록한 별칭을 이용하되, 상위·하위·관련 관계는 동의어 목록에 섞지 않습니다. 질환의 기본 개념이 같아도 전이·재발·이전 치료 조건은 원문 행에 남습니다. 출처 정의가 맞지 않으면 로컬 개념의 범위를 명시하고 같은 범위의 외부 코드를 찾는 일은 후속 작업으로 남깁니다.

300개 항목을 **어떤 근거로 묶거나 구분했는지** 검토할 수 있도록 웹에서 원문·후보 정의·출처 버전·판단 이유·보류 사유를 연결했습니다.

## 후보 조회에 사용한 서비스

[EMBL-EBI OLS 공식 도움말](https://www.ebi.ac.uk/ols4/ols3help)은 여러 온톨로지의 라벨·동의어·설명·식별자를 검색하는 방식을 제공합니다. 검색의 `exact` 옵션과 임상 개념의 EXACT 매핑은 다른 의미입니다. "직접 입력해 보기"의 후보 비교는 미등록 표현에 대해 OLS(MONDO·NCIt)와 NLM MeSH를 사용자가 버튼을 누를 때 조회하며, 그 결과를 사전에 자동 반영하지 않습니다.
