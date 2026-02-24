import * as vscode from 'vscode';
import type { SuggestionService } from './suggestionService.js';

/**
 * FileWatcherService: .suggestions.json 및 .md 파일의 변경을 감시합니다.
 *
 * 300ms 디바운스를 적용하여 빈번한 파일 변경(예: AI 에이전트가 연속 수정)
 * 시에도 성능을 보장합니다.
 */
export class FileWatcherService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private static readonly DEBOUNCE_MS = 300;

  constructor(private suggestionService: SuggestionService) {
    // .suggestions.json 파일 감시
    const sugWatcher = vscode.workspace.createFileSystemWatcher('**/*.suggestions.json');
    sugWatcher.onDidChange(uri => this.onSugFileChange(uri));
    sugWatcher.onDidCreate(uri => this.onSugFileChange(uri));
    sugWatcher.onDidDelete(uri => this.onSugFileDelete(uri));
    this.disposables.push(sugWatcher);

    // .md 파일 감시 (staleness 갱신용)
    const mdWatcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    mdWatcher.onDidChange(() => this.debouncedRefresh());
    this.disposables.push(mdWatcher);

    // .flow.mmd 파일 감시 (유저 플로우 변경 시 webview 새로고침)
    const flowWatcher = vscode.workspace.createFileSystemWatcher('**/*.flow.mmd');
    flowWatcher.onDidChange(() => this.debouncedRefresh());
    flowWatcher.onDidCreate(() => this.debouncedRefresh());
    flowWatcher.onDidDelete(() => this.debouncedRefresh());
    this.disposables.push(flowWatcher);
  }

  private onSugFileChange(uri: vscode.Uri): void {
    this.debouncedAction(() => this.suggestionService.loadFile(uri));
  }

  private onSugFileDelete(uri: vscode.Uri): void {
    this.suggestionService.removeFile(uri);
  }

  private debouncedRefresh(): void {
    this.debouncedAction(() => this.suggestionService.scanAll());
  }

  private debouncedAction(action: () => Promise<void> | void): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(async () => {
      await action();
    }, FileWatcherService.DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
