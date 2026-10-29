# 실행과 제출 자료

!> **웹에서 보기:** 설치 없이 이 사이트에서 검색·판단 근거·새 문장 분석을 확인할 수 있습니다.
!> **로컬 실행:** Python 3.9 이상에서 `python3 tools/serve.py`를 실행하고 http://127.0.0.1:8787 을 엽니다. 추가 패키지나 API 키는 필요 없습니다.
!> **다운로드:** 판정 CSV, 별칭 CSV, 전체 판정 JSON, 검증 결과, 제출 소스 ZIP을 받을 수 있습니다.

## 웹에서 확인하는 순서

1. 딕셔너리의 요약 숫자를 눌러 전체 입력·개념 목록·별칭 연결·보류 목록을 확인하거나 CD·T2DM·PASC·NAFLD를 검색합니다.
2. 개념을 선택하고 원문별 판단·후보 정의·공식 출처를 확인합니다.
3. 원본 300건에서 보류·자체 개념 등을 필터합니다.
4. 판단 사례에서 같은 개념과 다른 범위의 구별을 살펴봅니다.
5. 판단 사례의 비교 축·후보별 관계·최종 처리를 확인하고, 분류 기준과 적용 한계에서 반례·후속 연구·보조 자료를 읽습니다.
6. [새 문장 분석](#analyze)에서 CD의 문서 정의를 바꿔 실제 연결·보류 결과를 확인하고, 개발·반례 검사를 실행합니다. 같은 화면의 "여러 줄 한 번에 처리"에 새 질환명이나 `대상 | 원문`을 여러 줄 넣으면 줄마다 처리 결과와 다음 확인 단계를 보고 CSV·JSON으로 내려받을 수 있습니다.
7. 실행·다운로드에서 필요한 파일을 내려받습니다.

## 제출 자료 메뉴

판단 가이드라인(개념 비교 포함) → 유사 서비스 조사 → 구축 방법·한계(7단계·반례·후속 연구) → 검증 리포트(대조 방법 포함) → 실행·다운로드 순서입니다. 새 문장 분석은 딕셔너리 화면의 진입점에서 엽니다.

## 로컬 실행

Python 3.9 이상을 사용합니다. 추가 패키지 설치나 API 키가 필요 없습니다. 저장소 최상위 폴더에서 실행합니다.

```bash
python3 tools/serve.py
```

터미널에 표시되는 http://127.0.0.1:8787 주소를 엽니다. 종료는 Ctrl+C입니다. 다른 포트는 `python3 tools/serve.py --port 8790`으로 지정합니다.

## 빌드와 데이터 확인

```bash
python3 tools/build.py
python3 tools/dataset.py --term CD
python3 tools/score_legacy.py
python3 tools/verify_supplement.py
python3 -m unittest discover -s tests -p 'test_*.py'
```

정적 결과는 `dist/`에 생성됩니다. 파일을 더블클릭하는 대신 로컬 웹 서버 또는 배포 URL로 엽니다. 빌드는 고정한 판정을 검증·출력하며 새 의학 판정을 생성하지 않습니다. score_legacy.py는 구 정책 실험의 저장된 예측을 재채점하며 현재 사전의 정확도를 평가하지 않습니다.

## 분석 모듈 검사

웹의 [새 문장 분석](#analyze)은 외부 모델 없이 브라우저에서 실행합니다. 미등록 표현의 "MONDO·NCIt·MeSH에서 후보 비교하기"를 누를 때만 대상 표현을 EBI OLS와 NLM MeSH 공개 API로 보내며, 원문은 보내지 않습니다. 새 문서의 명시적 정의와 일부 조건 구간을 처리하며 기존 300행을 수정하지 않습니다. 같은 작성자 구성 검사는 Node.js 22 환경에서 실행할 수도 있습니다. Node는 선택 검사에만 필요합니다.

```bash
node --test tests/test_*.mjs
```

검사 사례와 통과 수는 독립 임상 정확도를 뜻하지 않습니다. [실행 원리·지원 범위·한계](#materials/methodology)를 함께 확인해 주세요.

[검증 리포트](#materials/audit)에서 A/B/C 전체 결과를 내려받을 수 있습니다. [대조 방법·재실행](#materials/audit?section=method)을 함께 제공합니다.

```bash
node tools/run_rule_audit.mjs --check
python3 tools/verify_rule_audit.py
```

## GitHub와 Netlify

이 폴더를 GitHub 저장소에 올리고 Netlify의 기존 프로젝트에서 저장소를 연결하거나 새 프로젝트로 가져옵니다. 아래 설정은 `netlify.toml`에도 기록되어 있습니다.

| 항목 | 값 |
|---|---|
| Base directory | 비워 둠: 저장소 루트 |
| Build command | python3 tools/build.py |
| Publish directory | dist |
| Production branch | main |

GitHub에 push하면 Netlify가 정적 파일을 다시 빌드하도록 연결할 수 있습니다. 실제 배포 URL은 연결 후 Netlify가 제공하는 주소를 사용합니다. [Netlify 공식 Git 배포 안내](https://docs.netlify.com/deploy/create-deploys/)

## 파일 안내

| 경로 | 내용 |
|---|---|
| app/ | 화면·스타일·브라우저 검색 코드 |
| data/ | 300행 판정, 개념·별칭·비교 사례·근거 목록·원본 XLSX |
| evidence/ | 공식 응답·MONDO 발췌·웹 인용 기록 |
| docs/ | 가이드라인·서비스 조사·구축 방법·실행 설명 |
| tools/ | 데이터 검증과 정적 빌드·로컬 실행 |
| tests/ | 원문·검색·그룹·근거와 빌드 검증 |

웹의 CSV·JSON·ZIP은 같은 판정 스냅샷에서 생성합니다. ZIP에는 실행에 필요한 코드와 자료가 포함되고 Git 이력·가상환경·생성된 dist는 포함하지 않습니다.


## Netlify가 주입하는 협업 도구

Netlify가 배포 HTML에 툴바를 주입하면 소스의 HTML 해시와 응답 해시가 다를 수 있습니다. JS·JSON·제출 ZIP의 동일성과 앱 동작 검사는 따로 확인합니다. 협업 도구를 사용하지 않는 프로젝트에서 Drawer를 끄는 공식 경로는 Project configuration → Developer settings → Continuous deployment → Collaboration tools → Configure입니다. [Netlify 공식 안내](https://docs.netlify.com/deploy/review-deploys/netlify-drawer-for-feedback/troubleshoot-the-netlify-drawer/)

이 항목은 호스팅 계정 설정이며 소스 수정만으로 껐다고 표시하지 않습니다. 실제 주입 여부와 콘솔 메시지는 배포 후 별도로 기록합니다.
