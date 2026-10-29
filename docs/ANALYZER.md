# 분석 엔진 — 처리 방식과 한계

[검증과 한계](https://indication-atlas.netlify.app/#materials/audit)

`app/analyzer.mjs`는 등록된 이름·별칭과 정해진 규칙으로 입력을 처리하는 엔진입니다. 300건을 현재 사전으로 다시 실행하는 검사(A)와 판단 규칙 검사(C)에 사용합니다. 외부 모델이나 네트워크를 사용하지 않으며, 기존 300행·사전의 판정을 수정하지 않습니다.

이 엔진은 검토한 별칭과 제한된 규칙을 재사용하며, 새 키워드에 대해 외부 후보 정의를 읽고 같은 의미인지 판단하는 구축 절차를 다시 수행하지 않습니다. 실제 임상시험 조건명 932건에 적용한 결과와 판단 지침의 보완점은 [구축 과정의 후속 연구](https://indication-atlas.netlify.app/#materials/methodology?section=future)와 `evidence/followup_pilot/`에 있습니다.

## 현재 하는 일 (엔진 버전 prototype-4)

검토한 287개 개념·별칭의 이름을 단어 경계와 긴 표현 우선으로 찾습니다. 문서에 명시된 긴 이름(약어)을 확인해 기존 개념과 대조합니다. CD·AML은 의미 후보가 하나 남더라도 문서 정의 없이는 단일 의미로 고르지 않습니다. 문서에서 새로 확인한 약어를 다음 입력으로 전파하지 않습니다.

non-small / non small / nonsmall cell 표현은 검토한 제한된 변형으로 대조해 SCLC 부분 구간으로 연결하지 않습니다. 의미를 가르는 HER2 부호나 유형 숫자를 전역 정규화로 삭제하지 않습니다. 인접한 접두·수식어는 기본적으로 검토 대상으로 둡니다. 문법적 경계 또는 검토한 추가 조건 수식어만 허용합니다. 중증도(mild·moderate·severe, moderate-to-severe, moderately to severely active), 조절 상태(uncontrolled·controlled), 병기(stage 3, stage IIIb 등), 진행 범위(advanced·locally advanced·unresectable), recurrent·active는 개념을 바꾸지 않고 상태를 덧붙이는 수식어로 검토해 추가 조건으로 보존합니다. 가장 긴 검토 이름 안에 있으면 이름 구성 요소로 둡니다. smoldering·latent·portal·secondary·pseudo- 같이 개념 자체를 바꿀 수 있는 수식어는 이 목록에 넣지 않았습니다. 알려지지 않은 수식어는 HOLD_MODIFIED_MENTION으로 표시해 이름 자체의 미검출과 구별합니다. pustular plaque psoriasis처럼 대상 이름을 포함한 더 긴 이름이 수식된 경우도 같습니다. 모든 수식어와 표기 변형을 이해하는 일반 모델은 아닙니다.

원문에 대상 개념을 확인하지 못하면 사전 후보와 원문 근거 미확인을 구별합니다. 다른 개념이 나와도 검토된 범위 관계가 없으면 관계 미검토로 남기며 입력 오류·상하위를 단정하지 않습니다. 기존 자체 개념(LOCAL)은 재사용하되 새 LOCAL을 만들지 않습니다.

검토한 type 1/2 diabetes mellitus 이름에서 type 1/2 diabetes의 짧은 형태를 파생하는 제한된 규칙을 사용합니다. 파생은 남아 있는 별칭의 개념과 출처에 연결되며 새로운 질환을 추론하지 않습니다. K006의 autoimmune 수식어도 제1형 개념에 대한 검토된 원문 조건으로 보존합니다. 이를 모든 질환에 허용하지 않습니다. 원본 사전의 별칭 연결 수에는 이 실행 중 파생을 더하지 않습니다.

## 결과는 네 가지 축으로 읽습니다

| 축 | 의미 |
|---|---|
| normalization_status | 등록 개념 연결, 논리식 해소, 검토 필요 또는 미등록 표현 |
| target_evidence_status | 원문에서 대상에 대한 직접 언급·부정·추정·혼합·미해소·미검출·요건 해석 미지원 |
| attributes의 ownership/scope | 조건의 원문 구간, 제한된 소유 언급, 적용 범위 또는 미상 |
| eligibility_status | 항상 NOT_EVALUATED입니다. 환자 진단·치료·시험 적격성을 산출하지 않습니다. |

`No NSCLC`의 NSCLC는 어떤 개념인지 식별할 수 있으면서 원문 표지는 NEGATED입니다. 개념을 식별했다고 해당 환자에게 질환이 있다는 뜻이 아닙니다. 제한된 부정 패턴에서 부정·추정을 찾지 못했다는 결과도 임상 사실 확정이 아닙니다. 출력 기본값은 NO_CUE_DETECTED(부정·추정 표지 없음)이며, 이를 긍정·질환 존재로 해석하지 않습니다.

## 질환명과 문서 조건

Metastatic·Relapsed·Refractory·Recurrent·Active·prior therapy, 중증도·질환 활성도·조절 상태·병기·진행 범위, 일부 기간 표현을 추출합니다. 겹치는 구간은 가장 긴 구간 하나만 남깁니다. 인식한 이름 구간의 acute·chronic·HER2·Severe·Castration-resistant 등은 이름 구성 요소로 구별합니다.

한 절에서 단일 개념만 확인한 제한된 경우에 조건의 소유 언급을 연결합니다. 여러 질환·미해소 표현이 있어 소유자가 불명확하면 UNKNOWN입니다. 같은 절 전체에 부정을 복사하지 않습니다.

`No chronic kidney disease for at least 3 months`는 기간 표현과 부정된 CKD 언급의 범위를 연결합니다. 기간 값 자체를 부정된 수치로 바꾸지 않습니다. `DURATION_OF_NEGATED_MENTION`과 소유 언급의 NEGATED를 함께 보존합니다.

`History of psoriasis is not required`는 건선 부재라는 뜻이 아닙니다. 요건 필수성 문형으로 인식해 UNSUPPORTED_REQUIREMENT를 표시하며(`Hypertension or diabetes is not required`처럼 등위 주어도 포함) 적격성을 추론하지 않습니다. 조건을 찾지 못했다는 결과도 조건 부재 확정이 아닙니다.

do/does/did/must not have, free of, absence of, 직접적인 excluded 등의 표지를 제한적으로 인식합니다. 이미 부정된 언급과 다음 언급 사이가 or/and/nor/쉼표뿐인 경우에 인접 표지를 연결합니다. 다음 언급 뒤에 present·allowed·eligible·is 같은 자체 술어가 있으면 연결하지 않습니다(`No psoriasis, eczema present`의 eczema는 부정이 아닙니다). 쉼표만 있는 경우는 목록이 문장 끝이나 or/and/nor로 이어질 때만 연결하고, 그 밖에는 UNKNOWN입니다. 첫 피연산자가 미등록이거나 범위를 확인하지 못하면 UNKNOWN으로 둡니다. 가족력·과거력·선정/제외 기준 절은 unsupported_patterns에 표시하고 환자 본인의 현재 상태를 확정하지 않습니다.

## 논리 구조와 개념 해소

인접한 명시적 OR/AND 구조와 피연산자 문자열·구간·후보를 보존합니다. 기존 행의 expression을 정답으로 대조하지 않습니다.

- RESOLVED: 이 구조의 피연산자 개념을 모두 확인했습니다.
- PARTIAL: 일부만 확인했습니다.
- UNRESOLVED: 피연산자 개념을 확정하지 못했습니다.

`MDS or AML`은 MDS가 현재 별칭에 없고 AML이 다의여도 OR 구조를 남깁니다. 이를 해소된 두 질환으로 분리 완료했다고 표시하지 않습니다. MDS 동시 언급만으로 AML 의미를 추측하지 않습니다. AND 적격성 해석, 임의 중첩 논리, `type 1 or type 2 diabetes` 같은 등위 생략은 미지원으로 표시합니다.

## 실제 입력 예

| 대상 표현 | 원문 | 처리 |
|---|---|---|
| CD | Patients with CD. | 다의 약어 보류 |
| CD | Crohn disease (CD) is mentioned. | 문서 정의로 크론병 연결 |
| CD | Celiac disease (CD) is mentioned. | 문서 정의로 셀리악병 연결 |
| NSCLC | non small cell lung cancer after prior therapy. | NSCLC 표기 변형 대조, 치료 조건 보존 |
| Stable angina | Unstable angina within 30 days. | 원문에서 대상 개념 미확인·검토 필요 |
| Psoriasis | Patients without psoriasis but with eczema. | 건선 개념 식별과 NEGATED를 구별 |
| MDS/AML | Patients with MDS or AML. | OR 구조 보존, 피연산자 개념 해소 보류 |

원문 인덱스는 UTF-16 코드 단위이며 start/end로 잘랐을 때 text와 일치하는지 검사합니다. 원문 포장 문자열의 정규화 결과 열을 원문 근거로 재사용하지 않습니다.

## 지원 범위와 검사

증상만으로 약어를 해소하는 일반 문맥 추론, 외부 질환 정의 수집·자동 비교, 전체 부정·가족력·과거력·시간 해석, 새 질환 승인과 환자 적격성 비교는 지원 범위 밖입니다. [G01–G12 지원표](https://indication-atlas.netlify.app/#materials/audit)에서 규칙으로 계산하는 부분과 사람이 검토한 결과를 재사용하는 부분을 구별합니다.

작성자 구성 개발·반례 입력은 `data/analyzer_cases.json`에 있습니다. Node.js 22 자동 테스트와 브라우저 검사에서 실행합니다.

```bash
node --test tests/test_*.mjs
```

이 검사를 보며 구현을 수정하므로 독립 정확도·일반화 성능이 아닙니다. 임상 전문가의 별도 정답 표시와 구축에 쓰지 않은 자료로 하는 평가는 남아 있습니다. 정적 빌드·열람에는 Python만 필요하고, 재실행 검사에만 Node를 사용합니다.
