# Indication Atlas 제출 자료 안내

웹: https://indication-atlas.netlify.app/

제공된 300행의 원문·개념 연결·동의어와 판단 근거를 확인할 수 있습니다. 개념 그룹 287개, 별칭 연결 419개, 원문 의미 보류 2행을 보존합니다. 연구 판정이며 독립 임상 정확도 평가나 전문가 승인을 뜻하지 않습니다.

## 확인 순서

1. **동의어 사전:** CD·T2DM 등을 검색하고 개념·별칭·관련 원문과 근거를 확인합니다.
2. **분류 결과:** 전체 판정과 후보 정의·범위 관계를 확인합니다.
3. **판단 기준:** 같은 개념과 다른 범위를 구별한 사례를 읽습니다.
4. **구축 보고서:** 아래 네 구역에서 조사·구축·검증·실행 자료를 확인합니다.

| 구역 | 포함한 내용 |
|---|---|
| [구축 과정](https://indication-atlas.netlify.app/#materials/methodology) | 문제 정의부터 반례·후속 연구까지 이어지는 7단계 |
| [서비스 조사](https://indication-atlas.netlify.app/#materials/research) | 공식 공개 자료에서 확인한 관리·검색 방식과 이 사전의 방향 |
| [검증과 한계](https://indication-atlas.netlify.app/#materials/audit) | 300행 A/B/C 대조, 규칙 지원표와 대조 방법 |
| [파일과 실행 방법](https://indication-atlas.netlify.app/#materials/downloads) | 실행법·CSV·JSON·전체 코드와 자료 ZIP |

[판단 기준](https://indication-atlas.netlify.app/#cases)에서 G01–G12를, [사례별 검토](https://indication-atlas.netlify.app/#cases/examples)에서 실제 판단과 개념 비교를 제공합니다.

[새 키워드 확인](https://indication-atlas.netlify.app/#analyze)은 홈의 ‘직접 입력해 보기’ 버튼으로 엽니다. 등록된 표현·명시적 약어 정의·일부 조건 패턴을 처리하고, 미등록 표현은 외부 후보와 비교할 수 있습니다. 환자의 진단·적격성은 판정하지 않습니다.

## 실행

Python 3.9 이상, 표준 라이브러리만으로 빌드·열람할 수 있습니다.

```bash
python3 tools/serve.py
```

규칙의 재실행·회귀 검사에는 Node.js 22를 사용합니다. 추가 npm 패키지나 모델 호출은 필요 없습니다.

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/test_*.mjs
node tools/run_rule_audit.mjs --check
node tools/export_runtime_review.mjs --check
```

이전 비교·반례·분석기 설명·대조 방법 주소는 합쳐진 페이지로 연결됩니다. 원문과 실행·근거 기록은 소스에 보존했습니다.
