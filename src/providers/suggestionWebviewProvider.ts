import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';
import type { Suggestion } from '../types/suggestion.js';
import { extractFlows } from '../utils/flowParser.js';
import { WEBVIEW_CSS } from '../webview/webviewStyles.js';
import { WEBVIEW_BASE_SCRIPT, WEBVIEW_INIT_SCRIPT, getFlowDiagramScript } from '../webview/webviewScripts.js';
import { resolveAnchor } from '../utils/resolveAnchor.js';

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
            await this.service.writeFlowMmd(editor.document.uri, msg.text);
          }
          return;
        }
        if (msg.command === 'init') {
          await vscode.commands.executeCommand('alyplan.init');
          return;
        }
        if (msg.command === 'refresh') {
          await vscode.commands.executeCommand('alyplan.refresh');
          return;
        }
        const ALLOWED_COMMANDS = ['accept', 'reject', 'showDiff'];
        if (msg.id && msg.command && ALLOWED_COMMANDS.includes(msg.command)) {
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
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
      this.view.webview.html = this.emptyHtml();
      return;
    }

    const mdContent = editor.document.getText();
    const suggestions = this.service.getPendingSuggestionsForMd(editor.document.uri)
      .filter(s => resolveAnchor(mdContent, s.anchor.headingPath, s.anchor.textContent) !== null);
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

    const diagramFont = vscode.workspace.getConfiguration('alyplan').get<string>('diagramFontFamily') || '';
    const adviceReview = await this.service.readAdviceMd(editor.document.uri);

    this.view.webview.html = this.buildHtml(
      editor.document.fileName.split('/').pop() ?? '',
      mdContent,
      suggestions,
      flowMermaid,
      mermaidScriptUri,
      cspSource,
      needsInit,
      diagramFont,
      adviceReview,
    );
  }

  /* ─── HTML 생성: 마크다운 + 인라인 카드 ─── */

  private buildHtml(fileName: string, md: string, suggestions: Suggestion[], flowMermaid: string | null, mermaidScriptUri: string, cspSource: string, needsInit = false, diagramFont = '', adviceReview: string | null = null): string {
    const lines = md.split('\n');

    // 동적 위치 해석 후 startLine → suggestions 매핑
    const sugMap = new Map<number, Suggestion[]>();
    const resolvedPositions = new Map<string, { startLine: number; endLine: number }>();
    for (const s of suggestions) {
      const pos = resolveAnchor(md, s.anchor.headingPath, s.anchor.textContent);
      if (!pos) continue;
      resolvedPositions.set(s.id, pos);
      const arr = sugMap.get(pos.startLine) || [];
      arr.push(s);
      sugMap.set(pos.startLine, arr);
    }

    // 제안 anchor가 커버하는 라인 범위 (중복 렌더 방지)
    const covered = new Set<number>();
    for (const [, pos] of resolvedPositions) {
      for (let l = pos.startLine; l <= pos.endLine; l++) covered.add(l);
    }

    let body = '';
    let inCode = false;
    let codeBuf = '';
    let inTable = false;
    let tableRows: string[][] = [];
    let sugIdx = 0;
    let i = 0;
    const renderedIds = new Set<string>();

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
        let maxEnd = ln;
        for (const sug of sugsHere) {
          const pos = resolvedPositions.get(sug.id);
          if (!pos) continue;
          const anchorLines = lines.slice(pos.startLine - 1, pos.endLine);
          sugIdx++;
          renderedIds.add(sug.id);

          body += `<div class="sug-block" onclick="revealLine(${pos.startLine})">`;
          body += `<div class="sug-anchor-hl">`;
          body += this.renderMarkdownBlock(anchorLines.join('\n'));
          body += `</div>`;
          body += this.renderCard(sug, sugIdx);
          body += `</div>`;
          if (pos.endLine > maxEnd) maxEnd = pos.endLine;
        }
        // 점프 범위 안에 다른 제안이 있으면 함께 렌더링
        for (let j = i + 1; j < maxEnd && j < lines.length; j++) {
          const innerLn = j + 1;
          const innerSugs = sugMap.get(innerLn);
          if (innerSugs) {
            for (const sug of innerSugs) {
              if (renderedIds.has(sug.id)) continue;
              const pos = resolvedPositions.get(sug.id);
              if (!pos) continue;
              const anchorLines = lines.slice(pos.startLine - 1, pos.endLine);
              sugIdx++;
              renderedIds.add(sug.id);

              body += `<div class="sug-block" onclick="revealLine(${pos.startLine})">`;
              body += `<div class="sug-anchor-hl">`;
              body += this.renderMarkdownBlock(anchorLines.join('\n'));
              body += `</div>`;
              body += this.renderCard(sug, sugIdx);
              body += `</div>`;
            }
          }
        }
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

    // advice.md 섹션별 파싱
    let parsedAdviceSections: Map<string, string> | null = null;
    let adviceSummaryHtml = '';
    let adviceFooterHtml = '';
    if (adviceReview) {
      const parsed = this.parseAdviceBySections(adviceReview);
      parsedAdviceSections = parsed.sectionAdvice;
      if (parsed.summary.trim()) {
        adviceSummaryHtml = `<div class="advice-review-block">${this.renderMarkdownBlock(parsed.summary)}</div>`;
      }
      if (parsed.footer.trim()) {
        adviceFooterHtml = `<div class="advice-review-block">${this.renderMarkdownBlock(parsed.footer)}</div>`;
      }
    }

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
        const pos = resolvedPositions.get(sug.id);
        const line = pos?.startLine ?? 0;
        html += `<div class="advice-callout__item"${line > 0 ? ` onclick="revealLine(${line})" style="cursor:pointer"` : ''}>`;
        html += `<span class="advice-callout__cat">${cat}</span>`;
        if (line > 0) html += `<span class="advice-callout__line">L${line}</span>`;
        html += this.esc(sug.reasoning);
        html += `</div>`;
      }
      html += `</div>`;
      return html;
    };

    // 섹션 뷰 body 생성 (iterateMdLines로 코드블록/테이블 처리 위임)
    let currentHeading = '';
    const appendSectionAdvice = (): string => {
      if (!currentHeading) { return ''; }
      let html = makeCallout(currentHeading);
      if (parsedAdviceSections) {
        const matched = this.findMatchingAdvice(currentHeading, parsedAdviceSections);
        if (matched?.trim()) {
          html += `<div class="advice-review-callout">${this.renderMarkdownBlock(matched)}</div>`;
        }
      }
      return html;
    };

    let sectionBody = this.iterateMdLines(lines, (line, ln) => {
      let html = '';
      const hMatch = line.match(/^(#{1,6})\s+(.*)/);
      if (hMatch && hMatch[1].length <= minLevel) {
        html += appendSectionAdvice();
        currentHeading = hMatch[2].trim();
      }
      html += `<div class="md-line" onclick="revealLine(${ln})">${this.renderLine(line)}</div>`;
      return html;
    });
    // 마지막 섹션 조언
    sectionBody += appendSectionAdvice();
    // headingPath가 없는 조언
    const noPathAdvice = adviceMap.get('');
    if (noPathAdvice && noPathAdvice.length > 0) {
      sectionBody += makeCallout('');
    }
    // advice.md 요약(상단) 및 통합 검증(하단)
    if (adviceSummaryHtml) {
      sectionBody = adviceSummaryHtml + sectionBody;
    }
    if (adviceFooterHtml) {
      sectionBody += adviceFooterHtml;
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
      : `<span class="header-right"><span class="count">${suggestions.length}개 제안</span><button class="refresh-btn" onclick="send('refresh')" title="제안 새로고침">↻</button></span>`}
  </div>
  ${!needsInit ? `
  <div class="view-tabs">
    <button class="view-tab view-tab--active" onclick="switchView('all')">제안</button>
    <button class="view-tab" onclick="switchView('section')">검증</button>
    <button class="view-tab" onclick="switchView('flow')">다이어그램</button>
  </div>` : ''}
  <div id="view-all" class="view-pane view-pane--active">
    ${needsInit
      ? '<p class="empty">초기화 버튼을 눌러 AlyPlan을 시작하세요</p>'
      : (suggestions.length === 0 && lines.length < 2 ? '<p class="empty">처리할 제안이 없습니다</p>' : body)}
  </div>
  <div id="view-section" class="view-pane">
    ${sectionBody || '<p class="empty">/LaLaAdvice를 실행하면 다관점 검증 결과가 여기에 표시됩니다</p>'}
  </div>
  <div id="view-flow" class="view-pane">
    ${flowMermaid ? `
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
    </div>` : '<p class="empty">/LaLaSuggest를 실행하면 플로우 다이어그램이 여기에 표시됩니다</p>'}
  </div>
  ${flowMermaid ? `<script src="${mermaidScriptUri}"></script>` : ''}
  <script>
    ${WEBVIEW_BASE_SCRIPT}
    ${flowMermaid ? getFlowDiagramScript(flowMermaid, diagramFont) : ''}
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

  /* ─── 공통 마크다운 라인 순회 (코드블록/테이블 처리) ─── */
  private iterateMdLines(
    lines: string[],
    onLine: (line: string, lineNum: number) => string,
  ): string {
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ln = i + 1;

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
      if (inCode) { codeBuf += line + '\n'; continue; }

      if (line.includes('|') && line.trim().startsWith('|')) {
        if (line.match(/^\|[\s:|-]+\|$/)) continue;
        const cells = line.split('|').filter(c => c !== '').map(c => c.trim());
        tableRows.push(cells);
        inTable = true;
        continue;
      }
      if (inTable) flushTable();

      result += onLine(line, ln);
    }
    if (inTable) flushTable();
    return result;
  }

  /* ─── 멀티라인 마크다운 렌더링 (제안 텍스트용) ─── */
  private renderMarkdownBlock(text: string): string {
    return this.iterateMdLines(text.split('\n'), (line) =>
      `<div class="md-line">${this.renderLine(line)}</div>`,
    );
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

  /* ─── advice.md 섹션 파싱 ─── */

  private parseAdviceBySections(adviceContent: string): {
    summary: string;
    sectionAdvice: Map<string, string>;
    footer: string;
  } {
    const lines = adviceContent.split('\n');
    const summary: string[] = [];
    const sectionAdvice = new Map<string, string>();
    const footer: string[] = [];

    let state: 'summary' | 'sections' | 'footer' = 'summary';
    let currentSection = '';
    let currentLines: string[] = [];

    for (const line of lines) {
      if (line.match(/^##\s+섹션별/)) {
        state = 'sections';
        continue;
      }

      if (state === 'sections' && line.match(/^##\s+(통합|핵심|액션)/)) {
        if (currentSection) {
          sectionAdvice.set(currentSection, currentLines.join('\n'));
        }
        state = 'footer';
        footer.push(line);
        continue;
      }

      if (state === 'summary') {
        summary.push(line);
      } else if (state === 'sections') {
        const secMatch = line.match(/^###\s+섹션\s*\d*[:.：]\s*(.*)/);
        if (secMatch) {
          if (currentSection) {
            sectionAdvice.set(currentSection, currentLines.join('\n'));
          }
          currentSection = secMatch[1].trim();
          currentLines = [];
        } else {
          currentLines.push(line);
        }
      } else {
        footer.push(line);
      }
    }

    if (currentSection && state === 'sections') {
      sectionAdvice.set(currentSection, currentLines.join('\n'));
    }

    return { summary: summary.join('\n'), sectionAdvice, footer: footer.join('\n') };
  }

  private findMatchingAdvice(heading: string, sections: Map<string, string>): string | null {
    if (sections.has(heading)) { return sections.get(heading)!; }
    const norm = (s: string) => s.replace(/[#\d.:\-\s]/g, '').toLowerCase();
    const h = norm(heading);
    if (h.length === 0) { return null; }

    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const [key, value] of sections) {
      const k = norm(key);
      if (k.length === 0) { continue; }
      if (k === h) { return value; } // 정확 일치

      // 포함 관계 체크: 짧은 쪽이 긴 쪽의 50% 이상이어야 매칭 인정
      const shorter = Math.min(h.length, k.length);
      const longer = Math.max(h.length, k.length);
      if (shorter / longer < 0.3) { continue; } // 길이 비율이 너무 다르면 스킵

      if (h.includes(k) || k.includes(h)) {
        const score = shorter / longer;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = value;
        }
      }
    }
    return bestMatch;
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
  }
}
