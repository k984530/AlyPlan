# LaLaPlan

AI 수정 제안을 시각적으로 리뷰하는 마크다운 기획서 도우미 VS Code 확장 프로그램입니다.

## 주요 기능

- **AI 제안 리뷰** — Claude Code가 생성한 기획서 개선 제안을 에디터에서 바로 확인하고 수락/거절
- **인라인 하이라이트** — 제안이 있는 라인을 시각적으로 강조 표시
- **Diff 뷰** — 원본과 제안 텍스트를 나란히 비교
- **웹뷰 패널** — 사이드바에서 전체 제안 목록을 한눈에 관리
- **CodeLens 액션** — 코드 라인 위에 수락/거절 버튼 표시
- **일괄 처리** — 모든 제안을 한 번에 수락 또는 거절

## 설치

### VS Code / Cursor
```bash
code --install-extension alyduho.alyplan-vscode
```

### Open VSX (Windsurf, Antigravity 등)
Extensions 패널에서 `alyplan` 검색 후 설치

## 사용법

### 1. 초기화
1. 마크다운 기획서 파일(`.md`)을 엽니다
2. `Cmd+Shift+P` → `LaLaPlan: Initialize for Current Markdown File` 실행

### 2. Claude Code 연동
1. `Cmd+Shift+P` → `LaLaPlan: Install /suggest Command for Claude Code` 실행
2. Claude Code에서 `/LaLaSuggest docs/파일명.md` 로 제안 생성

### 3. 제안 리뷰
- 사이드바 **LaLaPlan** 패널에서 제안 카드 확인
- 각 제안에 대해 **수락**, **거절**, **편집 후 수락** 선택
- CodeLens 버튼으로 에디터에서 바로 처리 가능

## 제안 파일 형식

Claude Code가 `.suggestions.json` 파일을 생성하면 LaLaPlan이 자동으로 감지합니다.

```
프로젝트/
├── docs/
│   ├── example.md                    # 기획서 원본
│   └── .alyplan/
│       └── example/
│           └── example.suggestions.json  # AI 제안
```

## 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `alyplan.highlightColor` | `rgba(255, 213, 79, 0.15)` | 제안 라인 하이라이트 색상 |
| `alyplan.gutterIconColor` | `#FFD54F` | 거터 아이콘 색상 |

## 명령어

| 명령어 | 설명 |
|--------|------|
| `LaLaPlan: Initialize for Current Markdown File` | 현재 파일에 대해 LaLaPlan 초기화 |
| `LaLaPlan: Install /suggest Command for Claude Code` | Claude Code 슬래시 커맨드 설치 |
| `LaLaPlan: Show Diff` | 제안의 Diff 뷰 표시 |
| `Accept Suggestion` | 제안 수락 |
| `Reject Suggestion` | 제안 거절 |
| `Edit & Accept` | 편집 후 수락 |
| `Accept All Suggestions` | 모든 제안 일괄 수락 |
| `Reject All Suggestions` | 모든 제안 일괄 거절 |
| `Refresh Suggestions` | 제안 목록 새로고침 |

## 개발

```bash
# 의존성 설치
npm install

# 빌드
npm run build

# 개발 모드 (파일 변경 감시)
npm run watch

# VSIX 패키징
npm run package
```

## 라이선스

[MIT](LICENSE)
