import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';

/**
 * 제안이 있는 라인 위에 클릭 가능한 CodeLens를 표시합니다.
 *
 * CodeLens는 VS Code 에디터에서 코드 라인 위에 인라인 액션을 보여주는 기능입니다.
 * 예: "[replace] 구조 개선 — 대상 독자를 명시하면..." 형태로 표시됩니다.
 */
export class SuggestionCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private service: SuggestionService) {
    service.onDidChange(() => this._onDidChangeCodeLenses.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== 'markdown') {
      return [];
    }

    const suggestions = this.service.getPendingSuggestionsForMd(document.uri);
    const lenses: vscode.CodeLens[] = [];

    if (suggestions.length === 0) {
      return lenses;
    }

    for (const sug of suggestions) {
      const line = Math.max(0, sug.anchor.startLine - 1);
      if (line >= document.lineCount) { continue; }
      const range = new vscode.Range(line, 0, line, 0);

      // 정보 렌즈 (클릭 시 수락)
      lenses.push(new vscode.CodeLens(range, {
        title: `$(${this.typeIcon(sug.type)}) [${sug.category}] ${sug.reasoning.slice(0, 50)}`,
        command: 'alyplan.accept',
        arguments: [sug.id],
      }));

      // Accept 렌즈
      lenses.push(new vscode.CodeLens(range, {
        title: '$(check) Accept',
        command: 'alyplan.accept',
        arguments: [sug.id],
      }));

      // Reject 렌즈
      lenses.push(new vscode.CodeLens(range, {
        title: '$(close) Reject',
        command: 'alyplan.reject',
        arguments: [sug.id],
      }));
    }

    return lenses;
  }

  private typeIcon(type: string): string {
    switch (type) {
      case 'replace': return 'replace';
      case 'insert_after': return 'diff-insert';
      case 'insert_before': return 'diff-insert';
      case 'delete': return 'diff-remove';
      default: return 'edit';
    }
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
