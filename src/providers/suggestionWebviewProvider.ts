import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';
import type { Suggestion } from '../types/suggestion.js';
import { extractFlows } from '../utils/flowParser.js';
import { WEBVIEW_CSS } from '../webview/webviewStyles.js';
import { WEBVIEW_BASE_SCRIPT, WEBVIEW_INIT_SCRIPT, getFlowDiagramScript } from '../webview/webviewScripts.js';

/* ─── 상수 ─── */
const TYPE_COLORS: Record<string, string> = {
  replace: '#FFD54F',
  insert_after: '#66BB6A',
  insert_before: '#66BB6A',
  delete: '#EF5350',
};

const TYPE_LABELS: Record<string, string> = {
  replace: '수정',
  insert_after: '삽입',
  insert_before: '삽입',
  delete: '삭제',
};

const CATEGORY_LABELS: Record<string, string> = {
  content: '내용',
  structure: '구조',
  style: '스타일',
  clarity: '명확성',
  completeness: '완전성',
};

export class SuggestionWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'alyplan.reviewPanel';
  private view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];
  private suppressNextRefresh = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly service: SuggestionService,
  ) {
    service.onDidChange(() => this.refresh(), undefined, this.disposables);
    vscode.window.onDidChangeActiveTextEditor(() => this.refresh(), undefined, this.disposables);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    };

    webviewView.webview.onDidReceiveMessage(
      async (msg: { command: string; id?: string; text?: string; line?: number }) => {
        if (msg.command === 'revealLine' && typeof msg.line === 'number') {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            const line = Math.max(0, msg.line - 1);
            const range = new vscode.Range(line, 0, line, 0);
            editor.selection = new vscode.Selection(line, 0, line, 0);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          }
          return;
        }
        if (msg.command === 'saveFlow' && msg.text) {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            this.suppressNextRefresh = true;
            await this.service.writeFlowMmd(editor.document.uri, msg.text);
          }
          return;
        }
        if (msg.command === 'init') {
          await vscode.commands.executeCommand('alyplan.init');
          return;
        }
        if (msg.id) {
          await vscode.commands.executeCommand(`alyplan.${msg.command}`, msg.id, msg.text);
        }
      },
      undefined,
      this.disposables,
    );

    this.refresh();
  }

  private async refresh(): Promise<void> {
    if (!this.view) { return; }
    if (this.suppressNextRefresh) {
      this.suppressNextRefresh = false;
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
      this.view.webview.html = this.emptyHtml();
      return;
    }

    const mdContent = editor.document.getText();
    const suggestions = this.service.getPendingSuggestionsForMd(editor.document.uri);
    const needsInit = !this.service.findSugJsonUriForMd(editor.document.uri);

    // 플로우 mermaid 소스 로드 (.flow.mmd 파일 우선, 없으면 자동 생성)
    let flowMermaid: string | null = await this.service.readFlowMmd(editor.document.uri);
    if (flowMermaid === null) {
      const generated = extractFlows(mdContent);
      flowMermaid = generated.trim() ? generated : null;
    }

    const mermaidPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'mermaid.min.js');
    const mermaidScriptUri = this.view.webview.asWebviewUri(mermaidPath).toString();
    const cspSource = this.view.webview.cspSource;

    this.view.webview.html = this.buildHtml(
      editor.document.fileName.split('/').pop() ?? '',
      mdContent,
      suggestions,
      flowMermaid,
      mermaidScriptUri,
      cspSource,
      needsInit,
    );
  }

  /* ─── HTML 생성: 마크다운 + 인라인 카드 ─── */

  private buildHtml(fileName: string, md: string, suggestions: Suggestion[], flowMermaid: string | null, mermaidScriptUri: string, cspSource: string, needsInit = false): string {
    const lines = md.split('\n');

    // startLine → suggestions 매핑
    const sugMap = new Map<number, Suggestion[]>();
    for (const s of suggestions) {
      const arr = sugMap.get(s.anchor.startLine) || [];
      arr.push(s);
      sugMap.set(s.anchor.startLine, arr);
    }

    // 제안 anchor가 커버하는 라인 범위 (중복 렌더 방지)
    const covered = new Set<number>();
    for (const s of suggestions) {
      for (let l = s.anchor.startLine; l <= s.anchor.endLine; l++) covered.add(l);
    }

    let body = '';
    let inCode = false;
    let codeBuf = '';
    let inTable = false;
    let tableRows: string[][] = [];
    let sugIdx = 0;
    let i = 0;

    const flushTable = () => {
      if (tableRows.length === 0) return;
      body += this.renderTable(tableRows);
      tableRows = [];
      inTable = false;
    };

    while (i < lines.length) {
      const ln = i + 1; // 1-indexed
      const line = lines[i];

      // 코드 블록 처리
      if (line.trim().startsWith('```')) {
        if (inTable) flushTable();
        if (inCode) {
          body += `<pre class="md-code">${this.esc(codeBuf)}</pre>`;
          codeBuf = '';
          inCode = false;
        } else {
          inCode = true;
        }
        i++;
        continue;
      }
      if (inCode) {
        codeBuf += line + '\n';
        i++;
        continue;
      }

      // 테이블 행 수집
      if (line.includes('|') && line.trim().startsWith('|')) {
        // 구분선 (|---|---|) → 스킵하되 테이블 상태 유지
        if (line.match(/^\|[\s:|-]+\|$/)) { i++; continue; }
        const cells = line.split('|').filter(c => c !== '').map(c => c.trim());
        tableRows.push(cells);
        inTable = true;
        i++;
        continue;
      }
      if (inTable) flushTable();

      // 제안이 시작되는 라인
      const sugsHere = sugMap.get(ln);
      if (sugsHere) {
        for (const sug of sugsHere) {
          const anchorLines = lines.slice(sug.anchor.startLine - 1, sug.anchor.endLine);
          sugIdx++;

          body += `<div class="sug-block" onclick="revealLine(${sug.anchor.startLine})">`;
          body += `<div class="sug-anchor-hl">`;
          body += this.renderMarkdownBlock(anchorLines.join('\n'));
          body += `</div>`;
          body += this.renderCard(sug, sugIdx);
          body += `</div>`;
        }
        const maxEnd = Math.max(...sugsHere.map(s => s.anchor.endLine));
        i = maxEnd;
        continue;
      }

      // 이미 제안 앵커에 포함된 라인 → 스킵
      if (covered.has(ln)) { i++; continue; }

      // 일반 마크다운 라인
      body += `<div class="md-line" onclick="revealLine(${ln})">${this.renderLine(line)}</div>`;
      i++;
    }
    if (inTable) flushTable();

    // ─── 섹션별 조언 뷰: 원본 문서 + 섹션 끝마다 조언 callout ───

    // headingPath[0] → suggestions 그룹화
    const adviceMap = new Map<string, Suggestion[]>();
    for (const s of suggestions) {
      const key = s.anchor.headingPath?.[0] || '';
      const list = adviceMap.get(key);
      if (list) list.push(s);
      else adviceMap.set(key, [s]);
    }

    // 최소 헤딩 레벨 (문서 제목 # 제외)
    let minLevel = 6;
    for (const line of lines) {
      const m = line.match(/^(#{2,6})\s/);
      if (m) minLevel = Math.min(minLevel, m[1].length);
    }

    // 조언 callout HTML 생성 헬퍼
    const makeCallout = (heading: string): string => {
      const items = adviceMap.get(heading);
      if (!items || items.length === 0) return '';
      let html = `<div class="advice-callout">`;
      html += `<div class="advice-callout__title">조언 (${items.length}건)</div>`;
      for (const sug of items) {
        const cat = CATEGORY_LABELS[sug.category] || sug.category;
        html += `<div class="advice-callout__item" onclick="revealLine(${sug.anchor.startLine})" style="cursor:pointer">`;
        html += `<span class="advice-callout__cat">${cat}</span>`;
        html += `<span class="advice-callout__line">L${sug.anchor.startLine}</span>`;
        html += this.esc(sug.reasoning);
        html += `</div>`;
      }
      html += `</div>`;
      return html;
    };

    // 섹션 뷰 body 생성
    let sectionBody = '';
    let currentHeading = '';
    let secInCode = false;
    let secCodeBuf = '';
    let secInTable = false;
    let secTableRows: string[][] = [];

    const flushSecTable = () => {
      if (secTableRows.length === 0) return;
      sectionBody += this.renderTable(secTableRows);
      secTableRows = [];
      secInTable = false;
    };

    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      const ln = j + 1;

      // 코드 블록
      if (line.trim().startsWith('```')) {
        if (secInTable) flushSecTable();
        if (secInCode) {
          sectionBody += `<pre class="md-code">${this.esc(secCodeBuf)}</pre>`;
          secCodeBuf = '';
          secInCode = false;
        } else {
          secInCode = true;
        }
        continue;
      }
      if (secInCode) { secCodeBuf += line + '\n'; continue; }

      // 테이블
      if (line.includes('|') && line.trim().startsWith('|')) {
        if (line.match(/^\|[\s:|-]+\|$/)) continue;
        const cells = line.split('|').filter(c => c !== '').map(c => c.trim());
        secTableRows.push(cells);
        secInTable = true;
        continue;
      }
      if (secInTable) flushSecTable();

      // 섹션 헤딩 감지: 새 최상위 섹션이 시작되면 이전 섹션의 조언 삽입
      const hMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (hMatch && hMatch[1].length <= minLevel) {
        if (currentHeading) {
          sectionBody += makeCallout(currentHeading);
        }
        currentHeading = hMatch[2].trim();
      }

      sectionBody += `<div class="md-line" onclick="revealLine(${ln})">${this.renderLine(line)}</div>`;
    }
    if (secInTable) flushSecTable();
    // 마지막 섹션 조언
    if (currentHeading) {
      sectionBody += makeCallout(currentHeading);
    }
    // headingPath가 없는 조언
    const noPathAdvice = adviceMap.get('');
    if (noPathAdvice && noPathAdvice.length > 0) {
      sectionBody += makeCallout('');
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${cspSource}; style-src 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource};">
<style>${WEBVIEW_CSS}</style>
</head>
<body>
  <div class="file-header">
    <span>${this.esc(fileName)}</span>
    ${needsInit
      ? '<button class="init-chip" onclick="send(\'init\')">초기화</button>'
      : `<span class="count">${suggestions.length}개 제안</span>`}
  </div>
  ${(suggestions.length > 0 || flowMermaid) ? `
  <div class="view-tabs">
    <button class="view-tab view-tab--active" onclick="switchView('all')">전체 제안</button>
    ${suggestions.length > 0 ? `<button class="view-tab" onclick="switchView('section')">섹션별 조언</button>` : ''}
    ${flowMermaid ? `<button class="view-tab" onclick="switchView('flow')">다이어그램</button>` : ''}
  </div>` : ''}
  <div id="view-all" class="view-pane view-pane--active">
    ${needsInit
      ? '<p class="empty">초기화 버튼을 눌러 AlyPlan을 시작하세요</p>'
      : (suggestions.length === 0 && lines.length < 2 ? '<p class="empty">처리할 제안이 없습니다</p>' : body)}
  </div>
  <div id="view-section" class="view-pane">
    ${sectionBody || '<p class="empty">표시할 내용이 없습니다</p>'}
  </div>
  ${flowMermaid ? `<div id="view-flow" class="view-pane">
    <div class="flow-toolbar">
      <button class="flow-zoom-btn" onclick="addNode('rect')" title="사각형 추가" style="font-size:11px">▭+</button>
      <button class="flow-zoom-btn" onclick="addNode('diamond')" title="다이아몬드 추가" style="font-size:11px">◇+</button>
      <span id="flow-status" style="font-size:11px;opacity:0.6;margin-left:4px"></span>
      <span class="spacer"></span>
      <div class="flow-zoom-controls">
        <button class="flow-zoom-btn" onclick="flowZoom(-1)" title="축소">−</button>
        <span id="flow-zoom-label" class="flow-zoom-label">100%</span>
        <button class="flow-zoom-btn" onclick="flowZoom(1)" title="확대">+</button>
        <button class="flow-zoom-btn" onclick="flowZoomReset()" title="원래 크기" style="font-size:12px;margin-left:2px">↺</button>
      </div>
    </div>
    <div id="flow-viewport" class="flow-viewport">
      <div id="flow-diagram" class="flow-diagram"><p class="empty">다이어그램 로딩 중...</p></div>
    </div>
    <div id="flow-ctx-menu" class="flow-ctx-menu">
      <div class="flow-ctx-label" id="flow-ctx-type">노드 편집</div>
      <textarea id="flow-ctx-input" class="flow-ctx-input" rows="1"></textarea>
      <div class="flow-ctx-actions">
        <button class="btn btn-reject" id="flow-ctx-del" onclick="deleteCtxTarget()">삭제</button>
        <button class="btn btn-accept" onclick="applyCtxEdit()">적용</button>
      </div>
    </div>
  </div>` : ''}
  ${flowMermaid ? `<script src="${mermaidScriptUri}"></script>` : ''}
  <script>
    ${WEBVIEW_BASE_SCRIPT}
    ${flowMermaid ? getFlowDiagramScript(flowMermaid) : ''}
    ${WEBVIEW_INIT_SCRIPT}
  </script>
</body>
</html>`;
  }

  /* ─── 마크다운 라인 렌더링 ─── */

  private renderLine(line: string): string {
    if (line.trim() === '') return '<div class="md-empty"></div>';

    // 헤딩
    const hMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (hMatch) {
      const lvl = hMatch[1].length;
      return `<div class="md-h${lvl}">${this.inlineFmt(hMatch[2])}</div>`;
    }

    // 인용문
    if (line.startsWith('> ')) {
      return `<div class="md-quote">${this.inlineFmt(line.slice(2))}</div>`;
    }

    // 수평선
    if (line.match(/^[-*_]{3,}\s*$/)) {
      return '<hr class="md-hr">';
    }

    // 들여쓴 리스트
    const indentUl = line.match(/^(\s+)[-*]\s+(.*)/);
    if (indentUl) {
      const depth = Math.floor(indentUl[1].length / 2);
      return `<div class="md-li" style="padding-left:${12 + depth * 14}px">• ${this.inlineFmt(indentUl[2])}</div>`;
    }
    const indentOl = line.match(/^(\s+)(\d+)\.\s+(.*)/);
    if (indentOl) {
      const depth = Math.floor(indentOl[1].length / 2);
      return `<div class="md-li" style="padding-left:${12 + depth * 14}px">${indentOl[2]}. ${this.inlineFmt(indentOl[3])}</div>`;
    }

    // 비순서 리스트
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      return `<div class="md-li">• ${this.inlineFmt(ulMatch[1])}</div>`;
    }

    // 순서 리스트
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      return `<div class="md-li">${olMatch[1]}. ${this.inlineFmt(olMatch[2])}</div>`;
    }

    // 일반 텍스트
    return this.inlineFmt(line);
  }

  private inlineFmt(text: string): string {
    return this.esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="md-inline-code">$1</code>');
  }

  /* ─── 멀티라인 마크다운 렌더링 (제안 텍스트용) ─── */
  private renderMarkdownBlock(text: string): string {
    const lines = text.split('\n');
    let result = '';
    let inCode = false;
    let codeBuf = '';
    let inTable = false;
    let tableRows: string[][] = [];

    const flushTable = () => {
      if (tableRows.length === 0) return;
      result += this.renderTable(tableRows);
      tableRows = [];
      inTable = false;
    };

    for (const line of lines) {
      // 코드 블록 처리
      if (line.trim().startsWith('```')) {
        if (inTable) flushTable();
        if (inCode) {
          result += `<pre class="md-code">${this.esc(codeBuf)}</pre>`;
          codeBuf = '';
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        codeBuf += line + '\n';
        continue;
      }

      // 테이블 행 처리
      if (line.includes('|') && line.trim().startsWith('|')) {
        // 구분선 (|---|---|) → 스킵하되 테이블 상태 유지
        if (line.match(/^\|[\s:|-]+\|$/)) continue;
        const cells = line.split('|').filter(c => c !== '').map(c => c.trim());
        tableRows.push(cells);
        inTable = true;
        continue;
      }
      if (inTable) flushTable();

      result += `<div class="md-line">${this.renderLine(line)}</div>`;
    }

    if (inTable) flushTable();

    return result;
  }

  /* ─── 제안 카드 렌더링 ─── */

  private renderCard(sug: Suggestion, idx: number): string {
    const typeLabel = TYPE_LABELS[sug.type] ?? sug.type;
    const typeColor = TYPE_COLORS[sug.type] ?? '#FFD54F';
    const catLabel = CATEGORY_LABELS[sug.category] ?? sug.category;

    const alts = sug.alternatives ?? [];
    const hasMultiAlts = alts.length > 1;

    let tabsHtml = '';
    let panelsHtml = '';

    const safeId = this.escAttr(sug.id);

    if (hasMultiAlts) {
      const tabs = alts.map((alt, i) => `
        <button class="tab ${i === 0 ? 'tab-active' : ''}"
                onclick="switchTab('${safeId}',${i})"
                data-card="${safeId}" data-idx="${i}">
          ${this.esc(alt.label)}
        </button>`).join('');
      tabsHtml = `<div class="tabs">${tabs}</div>`;

      panelsHtml = alts.map((alt, i) => `
        <div class="panel ${i === 0 ? '' : 'panel-hidden'}" data-card="${safeId}" data-idx="${i}"
             data-text="${this.escAttr(alt.text)}">
          <div class="suggested-text">${this.renderMarkdownBlock(alt.text)}</div>
          ${alt.reasoning ? `<div class="alt-reason">${this.renderMarkdownBlock(alt.reasoning)}</div>` : ''}
        </div>`).join('');
    } else if (alts.length === 1) {
      panelsHtml = `
        <div class="panel" data-card="${safeId}" data-idx="0"
             data-text="${this.escAttr(alts[0].text)}">
          <div class="section-label">제안</div>
          <div class="suggested-text">${this.renderMarkdownBlock(alts[0].text)}</div>
          ${alts[0].reasoning ? `<div class="alt-reason">${this.renderMarkdownBlock(alts[0].reasoning)}</div>` : ''}
        </div>`;
    } else if (sug.suggestedText) {
      panelsHtml = `
        <div class="panel" data-card="${safeId}" data-idx="0"
             data-text="${this.escAttr(sug.suggestedText)}">
          <div class="section-label">제안</div>
          <div class="suggested-text">${this.renderMarkdownBlock(sug.suggestedText)}</div>
        </div>`;
    }

    return `
    <div class="card">
      <div class="card-header">
        <span class="num">${idx}</span>
        <span class="badge" style="background:${typeColor}">${typeLabel}</span>
        <span class="badge badge-cat">${catLabel}</span>
      </div>
      <div class="reasoning">${this.esc(sug.reasoning)}</div>
      ${tabsHtml}
      ${panelsHtml}
      <div class="actions">
        <button class="btn btn-reject" onclick="send('reject','${safeId}')">거절</button>
        ${sug.type !== 'delete' ? `<button class="btn btn-edit" onclick="startEdit('${safeId}')">수정</button>` : ''}
        <button class="btn btn-accept" onclick="acceptSelected('${safeId}')">
          ${hasMultiAlts ? '선택안 수락' : '수락'}
        </button>
      </div>
    </div>`;
  }

  /* ─── 유틸리티 ─── */

  private renderTable(rows: string[][]): string {
    if (rows.length === 0) return '';
    const headerRow = rows[0];
    const dataRows = rows.slice(1);
    let html = `<div class="md-table-wrap"><table class="md-table">`;
    html += `<thead><tr>${headerRow.map(c => `<th>${this.inlineFmt(c)}</th>`).join('')}</tr></thead>`;
    if (dataRows.length) {
      html += `<tbody>${dataRows.map(r => `<tr>${r.map(c => `<td>${this.inlineFmt(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
    }
    html += `</table></div>`;
    return html;
  }

  private emptyHtml(): string {
    return `<!DOCTYPE html>
<html><body style="padding:16px;color:var(--vscode-foreground);font-family:var(--vscode-font-family);">
<p style="opacity:0.6;">마크다운 파일을 열면 제안을 볼 수 있습니다.</p>
</body></html>`;
  }

  private esc(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private escAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
  }
}
