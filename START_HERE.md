# Indication Atlas 제출 자료 안내

웹: https://indication-atlas.netlify.app/

제공된 300행의 원문·개념 연결·동의어와 판단 근거를 확인할 수 있습니다. 개념 그룹 287개, 출처별 별칭 연결 419건, 판단 보류 2건을 확인할 수 있습니다. 연구용 판정이며 독립 임상 정확도 평가나 전문가 승인을 거치지 않았습니다.

## 확인 순서

1. **개요(첫 화면):** 결과 요약과 CD·NSCLC의 판단 예시를 확인합니다.
2. **동의어 사전:** CD·T2DM 등을 검색하고 개념·별칭·관련 원문과 근거를 확인합니다.
3. **분류 결과:** 전체 판정과 후보 정의·범위 관계를 확인합니다.
4. **판단 기준:** 같은 개념과 다른 범위를 구별한 사례를 읽습니다.
5. **구축 보고서:** 아래 네 구역에서 조사·구축·검증·실행 자료를 확인합니다.

| 구역 | 포함한 내용 |
|---|---|
| [구축 과정](https://indication-atlas.netlify.app/#materials/methodology) | 문제 정의부터 반례·후속 연구까지 이어지는 7단계 |
| [유사 서비스 조사](https://indication-atlas.netlify.app/#materials/research) | 상용 서비스의 장점·한계와 이 사전의 방향 |
| [검증과 한계](https://indication-atlas.netlify.app/#materials/audit) | 현재 사전으로 다시 실행한 결과, 판단 규칙 검사와 상세 자료 |
| [파일과 실행 방법](https://indication-atlas.netlify.app/#materials/downloads) | 실행법·CSV·JSON·전체 코드와 자료 ZIP |

[판단 기준](https://indication-atlas.netlify.app/#cases)에서 G01–G12를, [사례별 검토](https://indication-atlas.netlify.app/#cases/examples)에서 실제 판단과 개념 비교를 제공합니다.

300건 밖의 실제 임상시험 조건명으로 해 본 예비 시험은 [구축 과정의 후속 연구](https://indication-atlas.netlify.app/#materials/methodology?section=future)에 정리했습니다.

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
