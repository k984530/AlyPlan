import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';
import { resolveId } from './resolveId.js';

export function registerRejectCommand(
  service: SuggestionService,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'alyplan.reject',
    async (idOrElement: unknown) => {
      try {
        const id = resolveId(idOrElement);
        if (!id) {
          vscode.window.showErrorMessage('제안 ID를 확인할 수 없습니다.');
          return;
        }
        await service.reject(id);
        vscode.window.showInformationMessage('제안이 거절되었습니다.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`거절 실패: ${msg}`);
      }
    },
  );
}
