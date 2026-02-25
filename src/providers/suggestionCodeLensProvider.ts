import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';

/**
 * CodeLens 프로바이더 (비활성화됨).
 * 제안 관리는 사이드바 패널에서만 수행합니다.
 */
export class SuggestionCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private service: SuggestionService) {
    service.onDidChange(() => this._onDidChangeCodeLenses.fire());
  }

  provideCodeLenses(): vscode.CodeLens[] {
    return [];
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
