import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';
import { resolveAnchor } from '../utils/resolveAnchor.js';

/**
 * pending 제안이 있는 라인에 하이라이트 + 거터 아이콘을 표시합니다.
 * VS Code의 표준 패턴(git blame, lint error 등)과 동일한 방식입니다.
 */
export class SuggestionDecorationProvider implements vscode.Disposable {
  private decorationType: vscode.TextEditorDecorationType;
  private staleDecorationType: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(private service: SuggestionService) {
    const config = vscode.workspace.getConfiguration('alyplan');
    const highlightColor = config.get<string>('highlightColor', 'rgba(255, 213, 79, 0.15)');

    this.decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: highlightColor,
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
      borderColor: '#FFD54F',
      overviewRulerColor: '#FFD54F',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });

    this.staleDecorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(255, 82, 82, 0.1)',
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
      borderColor: '#FF5252',
      overviewRulerColor: '#FF5252',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });

    // 에디터 변경 시 데코레이션 갱신
    vscode.window.onDidChangeActiveTextEditor(
      () => this.updateDecorations(),
      undefined,
      this.disposables,
    );
    vscode.workspace.onDidChangeTextDocument(
      () => this.debouncedUpdate(),
      undefined,
      this.disposables,
    );
    service.onDidChange(
      () => this.updateDecorations(),
      undefined,
      this.disposables,
    );
  }

  private debouncedUpdate(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.debounceTimer = setTimeout(() => this.updateDecorations(), 150);
  }

  updateDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
      return;
    }

    const mdUri = editor.document.uri;
    const suggestions = this.service.getPendingSuggestionsForMd(mdUri);
    const mdContent = editor.document.getText();

    const normalRanges: vscode.DecorationOptions[] = [];
    const staleRanges: vscode.DecorationOptions[] = [];

    for (const sug of suggestions) {
      const pos = resolveAnchor(mdContent, sug.anchor.headingPath, sug.anchor.textContent);

      if (!pos) {
        // stale: 위치를 찾을 수 없는 제안
        const range = new vscode.Range(0, 0, 0, 0);
        const hoverMessage = new vscode.MarkdownString();
        hoverMessage.appendMarkdown(`$(warning) **[${sug.type}]** 위치를 찾을 수 없습니다: ${sug.reasoning}`);
        staleRanges.push({ range, hoverMessage });
        continue;
      }

      const startLine = Math.max(0, pos.startLine - 1);
      const endLine = Math.max(0, pos.endLine - 1);

      if (startLine >= editor.document.lineCount) { continue; }
      const clampedEnd = Math.min(endLine, editor.document.lineCount - 1);

      const range = new vscode.Range(startLine, 0, clampedEnd, Number.MAX_SAFE_INTEGER);
      const hoverMessage = new vscode.MarkdownString();
      hoverMessage.appendMarkdown(`**[${sug.type}]** ${sug.reasoning}`);

      normalRanges.push({ range, hoverMessage });
    }

    editor.setDecorations(this.decorationType, normalRanges);
    editor.setDecorations(this.staleDecorationType, staleRanges);
  }

  dispose(): void {
    this.decorationType.dispose();
    this.staleDecorationType.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
