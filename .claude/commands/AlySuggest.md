$ARGUMENTS 파일을 읽고, 기획서 내용을 분석하여 개선 제안을 생성하세요.

## 지침

1. 지정된 마크다운 파일을 읽습니다.
2. 기획서의 내용, 구조, 완성도, 명확성을 분석합니다.
3. 개선 제안을 생성하여 `.alyplan/<baseName>/` 폴더 안에 `<baseName>.suggestions.json` 파일을 생성합니다.
   - 예: `docs/example.md` → `.alyplan/example/example.suggestions.json`
   - `.alyplan/<baseName>/` 폴더가 없으면 생성합니다.

## 출력 형식 (.suggestions.json)

```json
{
  "version": 1,
  "sourceFile": "파일명.md",
  "generatedAt": "ISO 날짜",
  "prompt": "분석 프롬프트",
  "suggestions": [
    {
      "id": "sug_랜덤8자리",
      "status": "pending",
      "anchor": {
        "startLine": 1,
        "endLine": 1,
        "textContent": "해당 줄의 실제 텍스트",
        "headingPath": ["## 상위 헤딩", "### 하위 헤딩"]
      },
      "type": "replace | insert_after | insert_before | delete",
      "originalText": "기존 텍스트 (마크다운 원문 그대로)",
      "alternatives": [
        {
          "id": "alt_랜덤4자리",
          "label": "1. 설명",
          "text": "제안 텍스트",
          "reasoning": "이 대안의 근거"
        },
        {
          "id": "alt_랜덤4자리",
          "label": "2. 설명",
          "text": "다른 제안 텍스트",
          "reasoning": "이 대안의 근거"
        },
        {
          "id": "alt_랜덤4자리",
          "label": "3. 설명",
          "text": "또 다른 제안 텍스트",
          "reasoning": "이 대안의 근거"
        }
      ],
      "reasoning": "전체 제안의 변경 이유",
      "category": "content | structure | style | clarity | completeness"
    }
  ]
}
```

## 규칙

- `anchor.startLine` / `endLine`: 1부터 시작하는 줄 번호 (정확히 파일의 줄과 일치해야 함)
- `anchor.textContent`: 해당 줄 범위의 실제 텍스트 (staleness 검증용)
- `originalText`: 마크다운 원문 그대로 (** 등 문법 포함)
- `alternatives`: 반드시 3개 이상의 대안을 제시. 라벨은 `"1. 설명"`, `"2. 설명"`, `"3. 설명"` 형식으로 번호를 매긴다
- `id` 형식: 제안은 `sug_` + 8자리, 대안은 `alt_` + 4자리 랜덤 영숫자

## 분석 관점

- **content**: 내용의 정확성, 깊이
- **structure**: 문서 구조, 섹션 구성
- **style**: 문체, 일관성
- **clarity**: 명확성, 모호함 제거
- **completeness**: 누락된 내용, 엣지 케이스
