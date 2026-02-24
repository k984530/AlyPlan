import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';
import { applySuggestion, getDefaultText } from '../utils/suggestionApply.js';
import { resolveId } from './resolveId.js';

const SCHEME_ORIGINAL = 'alyplan-original';
const SCHEME_SUGGESTED = 'alyplan-suggested';

const virtualDocs = new Map<string, string>();

/** 현재 diff 뷰에서 보고 있는 제안 ID */
let activeDiffSuggestionId: string | undefined;

class VirtualDocProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    return virtualDocs.get(uri.toString()) ?? '';
  }
}

export function registerShowDiffCommand(
  service: SuggestionService,
): vscode.Disposable[] {
  const provider = new VirtualDocProvider();

  const reg1 = vscode.workspace.registerTextDocumentContentProvider(SCHEME_ORIGINAL, provider);
  const reg2 = vscode.workspace.registerTextDocumentContentProvider(SCHEME_SUGGESTED, provider);

  // Context key: diff 뷰가 열려있을 때 true
  const setDiffContext = (active: boolean) => {
    vscode.commands.executeCommand('setContext', 'alyplan.diffActive', active);
  };

  const cmd = vscode.commands.registerCommand(
    'alyplan.showDiff',
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

        const { sugJsonUri, suggestion } = found;
        const mdUri = service.getMdUri(sugJsonUri);
        if (!mdUri) {
          vscode.window.showErrorMessage('마크다운 파일을 찾을 수 없습니다.');
          return;
        }

        const mdRaw = await vscode.workspace.fs.readFile(mdUri);
        const mdContent = new TextDecoder('utf-8').decode(mdRaw);

        const text = getDefaultText(suggestion);
        const { newContent } = applySuggestion(mdContent, suggestion, text);

        const key = `${id}-${Date.now()}`;
        const originalUri = vscode.Uri.parse(`${SCHEME_ORIGINAL}:${key}.md`);
        const suggestedUri = vscode.Uri.parse(`${SCHEME_SUGGESTED}:${key}.md`);

        virtualDocs.set(originalUri.toString(), mdContent);
        virtualDocs.set(suggestedUri.toString(), newContent);

        // 현재 diff 대상 제안 ID 저장 + context key 활성화
        activeDiffSuggestionId = id;
        setDiffContext(true);

        const typeLabel = { replace: '수정', insert_after: '삽입', insert_before: '삽입', delete: '삭제' }[suggestion.type] ?? suggestion.type;
        const title = `[${typeLabel}] ${suggestion.reasoning.slice(0, 50)}`;
        await vscode.commands.executeCommand('vscode.diff', originalUri, suggestedUri, title);

        setTimeout(() => {
          virtualDocs.delete(originalUri.toString());
          virtualDocs.delete(suggestedUri.toString());
        }, 120_000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Diff 표시 실패: ${msg}`);
      }
    },
  );

  // diff 에디터가 닫히면 context key 해제
  const tabChangeListener = vscode.window.tabGroups.onDidChangeTabs((e) => {
    for (const tab of e.closed) {
      if (tab.input && typeof tab.input === 'object' && 'modified' in tab.input) {
        const diffInput = tab.input as { modified?: { scheme?: string } };
        if (diffInput.modified?.scheme === SCHEME_SUGGESTED) {
          activeDiffSuggestionId = undefined;
          setDiffContext(false);
        }
      }
    }
  });

  /** diff 탭을 찾아서 닫기 */
  async function closeDiffTab(): Promise<void> {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input && typeof tab.input === 'object' && 'modified' in tab.input) {
          const diffInput = tab.input as { modified?: { scheme?: string } };
          if (diffInput.modified?.scheme === SCHEME_SUGGESTED) {
            await vscode.window.tabGroups.close(tab);
            return;
          }
        }
      }
    }
  }

  // Diff 뷰 전용 수락 버튼
  const diffAcceptCmd = vscode.commands.registerCommand(
    'alyplan.diffAccept',
    async () => {
      if (!activeDiffSuggestionId) {
        vscode.window.showErrorMessage('활성 diff 제안이 없습니다.');
        return;
      }

      const id = activeDiffSuggestionId;
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

      await closeDiffTab();
      activeDiffSuggestionId = undefined;
      setDiffContext(false);
      vscode.window.showInformationMessage('제안이 수락되었습니다.');
    },
  );

  // Diff 뷰 전용 거절 버튼
  const diffRejectCmd = vscode.commands.registerCommand(
    'alyplan.diffReject',
    async () => {
      if (!activeDiffSuggestionId) {
        vscode.window.showErrorMessage('활성 diff 제안이 없습니다.');
        return;
      }

      const id = activeDiffSuggestionId;
      await service.reject(id);
      await closeDiffTab();
      activeDiffSuggestionId = undefined;
      setDiffContext(false);
      vscode.window.showInformationMessage('제안이 거절되었습니다.');
    },
  );

  // Diff 뷰 닫기 (돌아가기) 버튼
  const diffCloseCmd = vscode.commands.registerCommand(
    'alyplan.diffClose',
    async () => {
      await closeDiffTab();
      activeDiffSuggestionId = undefined;
      setDiffContext(false);
    },
  );

  return [reg1, reg2, cmd, tabChangeListener, diffAcceptCmd, diffRejectCmd, diffCloseCmd];
}
