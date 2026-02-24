import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';
import { resolveId } from './resolveId.js';

/**
 * 제안 수락 커맨드.
 * TreeView 인라인 버튼 클릭 시 TreeElement 객체가 전달되고,
 * CodeLens/TreeItem 클릭 시 string ID가 전달됩니다. 둘 다 처리합니다.
 */
export function registerAcceptCommand(
  service: SuggestionService,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'alyplan.accept',
    async (idOrElement: unknown, selectedText?: string) => {
      try {
        const id = resolveId(idOrElement);
        if (!id) {
          vscode.window.showErrorMessage('제안 ID를 확인할 수 없습니다.');
          return;
        }

        if (typeof selectedText === 'string') {
          await service.accept(id, selectedText);
          vscode.window.showInformationMessage('제안이 수락되었습니다.');
          return;
        }

        const found = service.findSuggestionById(id);
        if (!found) {
          vscode.window.showErrorMessage(`제안을 찾을 수 없습니다: ${id}`);
          return;
        }

        const { suggestion } = found;
        const alts = suggestion.alternatives ?? [];

        if (alts.length > 1) {
          const items = alts.map(alt => ({
            label: alt.label,
            description: alt.reasoning ?? '',
            detail: alt.text.slice(0, 120),
            text: alt.text,
          }));

          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: '적용할 대안을 선택하세요',
            title: `제안: ${suggestion.reasoning.slice(0, 60)}`,
          });

          if (!picked) { return; }
          await service.accept(id, picked.text);
        } else {
          await service.accept(id);
        }

        vscode.window.showInformationMessage('제안이 수락되었습니다.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`수락 실패: ${msg}`);
      }
    },
  );
}

export function registerEditAndAcceptCommand(
  service: SuggestionService,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'alyplan.editAndAccept',
    async (idOrElement: unknown) => {
      try {
        const id = resolveId(idOrElement);
        if (!id) {
          vscode.window.showErrorMessage('제안 ID를 확인할 수 없습니다.');
          return;
        }

        const found = service.findSuggestionById(id);
        if (!found) {
          vscode.window.showErrorMessage(`제안을 찾을 수 없습니다: ${id}`);
          return;
        }

        const { suggestion } = found;
        const defaultText = suggestion.alternatives?.[0]?.text
          ?? suggestion.suggestedText
          ?? '';

        const doc = await vscode.workspace.openTextDocument({
          content: defaultText,
          language: 'markdown',
        });
        const editor = await vscode.window.showTextDocument(doc);

        const action = await vscode.window.showInformationMessage(
          '텍스트를 편집한 후 "적용"을 클릭하세요.',
          '적용',
          '취소',
        );

        if (action === '적용') {
          const editedText = editor.document.getText();
          await service.accept(id, editedText);
          vscode.window.showInformationMessage('편집된 제안이 수락되었습니다.');
        }

        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`편집 수락 실패: ${msg}`);
      }
    },
  );
}
