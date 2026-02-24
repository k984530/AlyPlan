import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';

/**
 * 상태 바에 현재 파일의 pending 제안 수를 표시합니다.
 * 예: "$(lightbulb) AlyPlan: 3 pending"
 */
export class StatusBarController implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor(private service: SuggestionService) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.command = 'alyplan.reviewPanel.focus';

    vscode.window.onDidChangeActiveTextEditor(
      () => this.update(),
      undefined,
      this.disposables,
    );
    service.onDidChange(
      () => this.update(),
      undefined,
      this.disposables,
    );

    this.update();
  }

  private update(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
      this.item.hide();
      return;
    }

    const pending = this.service.getPendingSuggestionsForMd(editor.document.uri);
    if (pending.length === 0) {
      this.item.hide();
      return;
    }

    this.item.text = `$(lightbulb) AlyPlan: ${pending.length} pending`;
    this.item.tooltip = `${pending.length}개의 수정 제안이 있습니다`;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
