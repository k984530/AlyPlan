import * as vscode from 'vscode';
import { SuggestionService } from './services/suggestionService.js';
import { FileWatcherService } from './services/fileWatcherService.js';
import { SuggestionDecorationProvider } from './providers/suggestionDecorationProvider.js';
import { SuggestionCodeLensProvider } from './providers/suggestionCodeLensProvider.js';
import { StatusBarController } from './statusBar/statusBarController.js';
import { registerAcceptCommand, registerEditAndAcceptCommand } from './commands/acceptCommand.js';
import { registerRejectCommand } from './commands/rejectCommand.js';
import { registerInitCommand } from './commands/initCommand.js';
import { registerShowDiffCommand } from './commands/showDiffCommand.js';
import { SuggestionWebviewProvider } from './providers/suggestionWebviewProvider.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const service = new SuggestionService();

  // 초기 스캔
  await service.scanAll();

  // FileWatcher
  const fileWatcher = new FileWatcherService(service);

  // Webview Review Panel (마크다운 + 제안 카드 통합 뷰)
  const webviewProvider = new SuggestionWebviewProvider(context.extensionUri, service);
  const webviewReg = vscode.window.registerWebviewViewProvider(
    SuggestionWebviewProvider.viewType,
    webviewProvider,
  );

  // Decoration (라인 하이라이트 + 거터 아이콘)
  const decorationProvider = new SuggestionDecorationProvider(service);

  // CodeLens (라인 위 액션)
  const codeLensProvider = new SuggestionCodeLensProvider(service);
  const codeLensReg = vscode.languages.registerCodeLensProvider(
    { language: 'markdown' },
    codeLensProvider,
  );

  // Status Bar
  const statusBar = new StatusBarController(service);

  // Commands
  const acceptCmd = registerAcceptCommand(service);
  const editAcceptCmd = registerEditAndAcceptCommand(service);
  const rejectCmd = registerRejectCommand(service);
  const showDiffDisposables = registerShowDiffCommand(service);

  // Accept All / Reject All
  const acceptAllCmd = vscode.commands.registerCommand(
    'alyplan.acceptAll',
    async () => {
      const infos = service.getDocInfos().filter(d => d.pendingCount > 0);
      if (infos.length === 0) {
        vscode.window.showInformationMessage('처리할 pending 제안이 없습니다.');
        return;
      }

      const items = infos.map(info => ({
        label: info.name,
        description: `${info.pendingCount} pending`,
        sugJsonUri: info.sugJsonUri,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: '모든 제안을 수락할 문서를 선택하세요',
      });
      if (!picked) { return; }

      await service.acceptAll(picked.sugJsonUri);
      vscode.window.showInformationMessage(`${picked.label}의 모든 제안이 수락되었습니다.`);
    },
  );

  const rejectAllCmd = vscode.commands.registerCommand(
    'alyplan.rejectAll',
    async () => {
      const infos = service.getDocInfos().filter(d => d.pendingCount > 0);
      if (infos.length === 0) {
        vscode.window.showInformationMessage('처리할 pending 제안이 없습니다.');
        return;
      }

      const items = infos.map(info => ({
        label: info.name,
        description: `${info.pendingCount} pending`,
        sugJsonUri: info.sugJsonUri,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: '모든 제안을 거절할 문서를 선택하세요',
      });
      if (!picked) { return; }

      await service.rejectAll(picked.sugJsonUri);
      vscode.window.showInformationMessage(`${picked.label}의 모든 제안이 거절되었습니다.`);
    },
  );

  // Init command
  const initCmd = registerInitCommand(service, context.extensionUri);

  // Install /suggest slash command
  const installCmd = vscode.commands.registerCommand(
    'alyplan.installSuggestCommand',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage('워크스페이스를 먼저 열어주세요.');
        return;
      }

      const targetDir = vscode.Uri.joinPath(workspaceFolders[0].uri, '.claude', 'commands');
      await vscode.workspace.fs.createDirectory(targetDir);

      const src = vscode.Uri.joinPath(context.extensionUri, 'resources', 'AlySuggest.md');
      const dest = vscode.Uri.joinPath(targetDir, 'AlySuggest.md');
      await vscode.workspace.fs.copy(src, dest, { overwrite: true });

      vscode.window.showInformationMessage(
        '/AlySuggest 커맨드가 설치되었습니다. Claude Code에서 /AlySuggest docs/파일.md 로 사용하세요.',
      );
    },
  );

  // Refresh
  const refreshCmd = vscode.commands.registerCommand(
    'alyplan.refresh',
    async () => {
      await service.scanAll();
      decorationProvider.updateDecorations();
    },
  );

  // 초기 데코레이션 적용
  decorationProvider.updateDecorations();

  context.subscriptions.push(
    service,
    fileWatcher,
    webviewReg,
    webviewProvider,
    decorationProvider,
    codeLensProvider,
    codeLensReg,
    statusBar,
    acceptCmd,
    editAcceptCmd,
    rejectCmd,
    acceptAllCmd,
    rejectAllCmd,
    refreshCmd,
    initCmd,
    installCmd,
    ...showDiffDisposables,
  );
}

export function deactivate(): void {
  // 모든 정리는 context.subscriptions dispose()에서 자동 처리됩니다.
}
