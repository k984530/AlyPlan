/**
 * Webview 공용 CSS
 * suggestionWebviewProvider.ts에서 추출하여 관리합니다.
 */
export const WEBVIEW_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    padding: 12px 14px;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 13px;
    line-height: 1.7;
  }

  /* 헤더 */
  .file-header {
    font-size: 14px; font-weight: 600;
    margin-bottom: 12px; padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex; justify-content: space-between; align-items: center;
  }
  .count {
    opacity: 0.7; font-weight: 400; font-size: 12px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 8px; border-radius: 10px;
  }
  .init-chip {
    font-size: 12px; font-weight: 500;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; padding: 3px 10px; border-radius: 10px;
    cursor: pointer;
  }
  .init-chip:hover {
    background: var(--vscode-button-hoverBackground);
  }

  /* 마크다운 렌더링 */
  .md-line { padding: 1px 6px; cursor: pointer; border-radius: 3px; }
  .md-line:hover { background: rgba(255,255,255,0.04); }
  .md-h1 {
    font-size: 20px; font-weight: 700; margin: 20px 0 10px;
    border-bottom: 2px solid var(--vscode-panel-border); padding-bottom: 6px;
  }
  .md-h2 {
    font-size: 17px; font-weight: 700; margin: 18px 0 8px;
    color: var(--vscode-textLink-foreground);
  }
  .md-h3 { font-size: 15px; font-weight: 700; margin: 14px 0 6px; }
  .md-h4, .md-h5, .md-h6 { font-size: 13px; font-weight: 700; margin: 10px 0 4px; }
  .md-quote {
    border-left: 3px solid var(--vscode-textBlockQuote-border, #888);
    padding: 4px 12px; margin: 6px 0;
    opacity: 0.85; font-style: italic;
    background: rgba(255,255,255,0.02);
    border-radius: 0 4px 4px 0;
    display: block;
  }
  .md-li { padding-left: 18px; line-height: 1.8; }
  .md-table-wrap {
    overflow-x: auto; margin: 6px 0;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
  }
  .md-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .md-table th, .md-table td {
    padding: 5px 10px; text-align: left;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .md-table th {
    font-weight: 600; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.3px; opacity: 0.7;
    background: rgba(255,255,255,0.03);
    position: sticky; top: 0;
  }
  .md-table tr:last-child td { border-bottom: none; }
  .md-table tr:hover td { background: rgba(255,255,255,0.02); }
  .md-code {
    background: rgba(0,0,0,0.25); border-radius: 6px;
    padding: 10px 12px; margin: 8px 0;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px; white-space: pre-wrap; overflow-x: auto;
    border: 1px solid rgba(255,255,255,0.06);
    line-height: 1.5;
  }
  .md-hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 12px 0; }
  .md-empty { height: 10px; }
  .md-inline-code {
    background: rgba(255,255,255,0.1);
    padding: 2px 6px; border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
  }
  .md-bold { font-weight: 700; }

  /* 제안 하이라이트 블록 */
  .sug-block {
    margin: 12px 0; border-radius: 8px;
    border: 1px solid rgba(255, 213, 79, 0.3);
    overflow: hidden; cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .sug-block:hover {
    border-color: rgba(255, 213, 79, 0.6);
    box-shadow: 0 0 0 1px rgba(255, 213, 79, 0.15);
  }
  .sug-anchor-hl {
    background: rgba(255, 213, 79, 0.06);
    padding: 6px 12px;
    border-left: 3px solid #FFD54F;
  }
  .sug-anchor-hl .md-line { padding: 0; }

  /* 카드 */
  .card {
    background: var(--vscode-editor-background);
    padding: 12px 14px;
    border-top: 1px solid rgba(255, 213, 79, 0.15);
  }
  .card-header {
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 8px; flex-wrap: wrap;
  }
  .num {
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; flex-shrink: 0;
  }
  .badge {
    font-size: 10px; padding: 2px 8px; border-radius: 4px;
    color: #000; font-weight: 600;
  }
  .badge-cat {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  .reasoning {
    font-size: 12px; margin-bottom: 10px; opacity: 0.85;
    line-height: 1.6; padding: 6px 0;
  }
  .section-label {
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.5px; opacity: 0.5; margin-bottom: 4px;
  }

  /* 제안 텍스트 */
  .suggested-text {
    font-size: 12px; word-break: break-word;
    line-height: 1.6;
  }
  .suggested-text .md-line { padding: 1px 0; cursor: default; }
  .suggested-text .md-line:hover { background: transparent; }
  .suggested-text .md-h1 { font-size: 16px; margin: 8px 0 4px; }
  .suggested-text .md-h2 { font-size: 14px; margin: 6px 0 3px; }
  .suggested-text .md-h3 { font-size: 13px; margin: 4px 0 2px; }
  .suggested-text .md-code { font-size: 11px; padding: 6px 8px; margin: 4px 0; }

  /* 탭 */
  .tabs {
    display: flex; gap: 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    margin-bottom: 8px;
  }
  .tab {
    padding: 6px 12px; border: none;
    background: transparent; color: var(--vscode-foreground);
    font-size: 12px; font-family: var(--vscode-font-family);
    cursor: pointer; opacity: 0.5;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .tab:hover { opacity: 0.8; background: rgba(255,255,255,0.03); }
  .tab-active { opacity: 1; font-weight: 600; border-bottom-color: #66BB6A; }

  .panel {
    background: rgba(102,187,106,0.05);
    border-left: 3px solid #66BB6A;
    border-radius: 0 6px 6px 0;
    padding: 10px 12px; margin-bottom: 8px;
  }
  .panel-hidden { display: none; }
  .alt-reason {
    font-size: 11px; opacity: 0.6; margin-top: 6px;
    font-style: italic; padding-left: 8px;
    border-left: 2px solid rgba(255,255,255,0.1);
    line-height: 1.5;
  }
  .alt-reason .md-line { padding: 0; cursor: default; }
  .alt-reason .md-line:hover { background: transparent; }

  /* 액션 버튼 */
  .actions {
    display: flex; gap: 6px; margin-top: 10px;
    padding-top: 10px; border-top: 1px solid var(--vscode-panel-border);
  }
  .btn {
    flex: 1; padding: 6px 10px; border: none; border-radius: 5px;
    font-size: 12px; cursor: pointer;
    font-family: var(--vscode-font-family); transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.85; }
  .btn-accept { background: #66BB6A; color: #000; font-weight: 600; }
  .btn-reject {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-edit {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .edit-area {
    width: 100%; min-height: 100px; padding: 8px 10px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px; line-height: 1.6;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 5px; resize: vertical;
    margin-bottom: 8px;
  }
  .edit-area:focus { outline: 1px solid var(--vscode-focusBorder); }
  .edit-actions { display: flex; gap: 6px; }
  .btn-apply { background: #66BB6A; color: #000; font-weight: 600; }
  .btn-cancel {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .empty { opacity: 0.5; text-align: center; margin-top: 40px; font-size: 13px; }

  /* 뷰 탭 바 */
  .view-tabs {
    display: flex; gap: 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    margin-bottom: 12px;
  }
  .view-tab {
    padding: 7px 14px; border: none;
    background: transparent; color: var(--vscode-foreground);
    font-size: 12px; font-family: var(--vscode-font-family);
    cursor: pointer; opacity: 0.5;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .view-tab:hover { opacity: 0.8; background: rgba(255,255,255,0.03); }
  .view-tab--active { opacity: 1; font-weight: 600; border-bottom-color: var(--vscode-textLink-foreground); }

  .view-pane { display: none; }
  .view-pane--active { display: block; }

  /* 섹션 조언 callout */
  .advice-callout {
    margin: 14px 0; padding: 10px 14px;
    border-left: 3px solid var(--vscode-textLink-foreground);
    background: rgba(255,255,255,0.03);
    border-radius: 0 6px 6px 0;
    font-size: 12px;
  }
  .advice-callout__title {
    font-weight: 700; font-size: 12px;
    margin-bottom: 6px; opacity: 0.85;
    color: var(--vscode-textLink-foreground);
  }
  .advice-callout__item {
    margin-bottom: 6px; line-height: 1.6; opacity: 0.9;
  }
  .advice-callout__item:last-child { margin-bottom: 0; }
  .advice-callout__cat {
    font-size: 10px; font-weight: 600; padding: 1px 6px;
    border-radius: 3px; margin-right: 4px;
    background: rgba(255,255,255,0.08);
  }
  .advice-callout__line {
    font-size: 10px; opacity: 0.5; margin-right: 4px;
  }

  /* 다이어그램 뷰 */
  .flow-toolbar {
    display: flex; gap: 6px; margin-bottom: 12px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.03);
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.06);
    align-items: center;
  }
  .flow-toolbar .spacer { flex: 1; }
  .flow-zoom-controls {
    display: flex; gap: 2px; align-items: center;
  }
  .flow-zoom-btn {
    width: 28px; height: 28px; border: none; border-radius: 6px;
    background: rgba(255,255,255,0.08); color: var(--vscode-foreground);
    font-size: 15px; cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    font-family: var(--vscode-font-family); transition: background 0.15s;
  }
  .flow-zoom-btn:hover { background: rgba(255,255,255,0.15); }
  .flow-zoom-label {
    font-size: 11px; opacity: 0.6; min-width: 38px;
    text-align: center; user-select: none;
  }
  .flow-viewport {
    overflow: hidden; position: relative;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.06);
    background: #ffffff;
    margin: 4px 0; cursor: grab;
    height: calc(100vh - 130px);
    min-height: 300px;
  }
  .flow-viewport:active { cursor: grabbing; }
  .flow-diagram {
    padding: 20px 12px;
    transform-origin: 0 0;
    transition: transform 0.15s ease;
    min-width: fit-content;
  }
  .flow-diagram svg { height: auto; }
  .flow-diagram .node rect,
  .flow-diagram .node circle,
  .flow-diagram .node polygon {
    filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25));
  }
  .flow-diagram .cluster rect {
    rx: 12px; ry: 12px;
  }
  .flow-diagram .edgeLabel {
    font-size: 11px;
  }
  .flow-diagram .flowchart-link {
    stroke-width: 2px;
  }
  .flow-diagram .edgePath:hover .flowchart-link {
    stroke-width: 3px;
    filter: drop-shadow(0 0 3px rgba(59,130,246,0.5));
  }
  .flow-source {
    width: 100%; min-height: 200px; padding: 12px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px; line-height: 1.6;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 8px; resize: vertical;
    margin-top: 8px;
  }
  .flow-source:focus { outline: 1px solid var(--vscode-focusBorder); }

  /* 컨텍스트 메뉴 */
  .flow-ctx-menu {
    position: fixed;
    z-index: 1000;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 10px 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    min-width: 200px;
    display: none;
  }
  .flow-ctx-menu--visible { display: block; }
  .flow-ctx-label {
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
    opacity: 0.5; margin-bottom: 6px;
  }
  .flow-ctx-input {
    width: 100%; padding: 6px 8px;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 4px; margin-bottom: 8px;
    resize: none; line-height: 1.5;
    max-height: 60px;
  }
  .flow-ctx-input:focus { outline: 1px solid var(--vscode-focusBorder); }
  .flow-ctx-actions { display: flex; gap: 6px; }
`;
