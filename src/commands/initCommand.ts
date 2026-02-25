import * as vscode from 'vscode';
import type { SuggestionService } from '../services/suggestionService.js';
import { syncCommandsIfOutdated } from '../utils/commandVersion.js';

export function registerInitCommand(
  service: SuggestionService,
  extensionUri: vscode.Uri,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'alyplan.init',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showErrorMessage('마크다운 파일을 먼저 열어주세요.');
        return;
      }

      const mdUri = editor.document.uri;
      const dir = vscode.Uri.joinPath(mdUri, '..');
      const fileName = mdUri.path.split('/').pop() ?? '';
      const baseName = fileName.replace(/\.md$/, '');
      const dotDir = vscode.Uri.joinPath(dir, '.alyplan', baseName);

      await vscode.workspace.fs.createDirectory(dotDir);

      // suggestions.json 템플릿
      const sugUri = vscode.Uri.joinPath(dotDir, `${baseName}.suggestions.json`);
      const sugTemplate = {
        version: 1,
        sourceFile: fileName,
        generatedAt: new Date().toISOString(),
        prompt: '',
        suggestions: [],
      };
      await writeIfNotExists(sugUri, JSON.stringify(sugTemplate, null, 2) + '\n');

      // flow.mmd 템플릿
      const flowUri = vscode.Uri.joinPath(dotDir, `${baseName}.flow.mmd`);
      await writeIfNotExists(flowUri, 'flowchart TD\n  Start["시작"]\n');

      // advice.md 템플릿
      const adviceUri = vscode.Uri.joinPath(dotDir, `${baseName}.advice.md`);
      await writeIfNotExists(
        adviceUri,
        `# ${baseName} - 조언\n\n_/suggest 커맨드로 제안을 생성하면 여기에 조언이 표시됩니다._\n`,
      );

      // 슬래시 커맨드 버전 기반 자동 설치/업데이트
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        const cmdDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.claude', 'commands');
        await syncCommandsIfOutdated(extensionUri, cmdDir, ['LaLaSuggest', 'LaLaAdvice']);
      }

      await service.scanAll();
      vscode.window.showInformationMessage(
        `AlyPlan 초기화 완료: .alyplan/${baseName}/ 폴더가 생성되었습니다.`,
      );
    },
  );
}

async function writeIfNotExists(uri: vscode.Uri, content?: string, copyFrom?: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    if (copyFrom) {
      await vscode.workspace.fs.copy(copyFrom, uri);
    } else {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content ?? '', 'utf-8'));
    }
  }
}
