import * as vscode from 'vscode';
import type { Suggestion, SuggestionFile, DocInfo } from '../types/suggestion.js';
import { applySuggestion, getDefaultText } from '../utils/suggestionApply.js';
import { resolveAnchor } from '../utils/resolveAnchor.js';
import { generateAdviceMd } from '../utils/adviceMd.js';

/**
 * SuggestionService: .suggestions.json 파일을 읽고, 캐싱하고,
 * accept/reject 로직을 처리하는 핵심 서비스입니다.
 *
 * VS Code의 workspace.fs API를 사용하여 Remote SSH/WSL/Codespaces 환경에서도 동작합니다.
 */
export class SuggestionService {
  private cache = new Map<string, SuggestionFile>();
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  private readonly log = vscode.window.createOutputChannel('AlyPlan');

  /**
   * 워크스페이스 내 모든 .suggestions.json 파일을 스캔하여 캐시를 갱신합니다.
   */
  async scanAll(): Promise<void> {
    // 워크스페이스 진단
    const folders = vscode.workspace.workspaceFolders;
    this.log.appendLine(`[scanAll] Workspace folders: ${folders?.map(f => f.uri.fsPath).join(', ') ?? 'NONE'}`);

    const files = await vscode.workspace.findFiles('**/*.suggestions.json', null);
    this.log.appendLine(`[scanAll] Found ${files.length} .suggestions.json files`);
    for (const f of files) {
      this.log.appendLine(`  - ${f.fsPath}`);
    }
    await Promise.all(files.map(uri => this.loadFile(uri)));
    this.log.appendLine(`[scanAll] Cache size: ${this.cache.size}`);
    this._onDidChange.fire();
  }

  /**
   * 단일 .suggestions.json 파일을 읽어 캐시에 저장합니다.
   */
  async loadFile(uri: vscode.Uri): Promise<void> {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder('utf-8').decode(raw);
      const data: SuggestionFile = JSON.parse(text);
      this.cache.set(uri.toString(), data);
      this.log.appendLine(`[loadFile] Loaded ${uri.fsPath}: ${data.suggestions.length} suggestions`);
      await this.writeAdviceMd(uri.toString(), data);
      this._onDidChange.fire();
    } catch (err) {
      this.log.appendLine(`[loadFile] ERROR loading ${uri.fsPath}: ${err}`);
      this.cache.delete(uri.toString());
    }
  }

  /**
   * 캐시에서 파일을 제거합니다.
   */
  removeFile(uri: vscode.Uri): void {
    this.cache.delete(uri.toString());
    this._onDidChange.fire();
  }

  /**
   * 모든 문서의 요약 정보를 반환합니다.
   */
  getDocInfos(): DocInfo[] {
    const infos: DocInfo[] = [];
    for (const [uriStr, file] of this.cache) {
      const uri = vscode.Uri.parse(uriStr);
      const pending = file.suggestions.filter(s => s.status === 'pending').length;
      infos.push({
        name: file.sourceFile,
        path: uri.fsPath,
        sugJsonUri: uriStr,
        suggestionCount: file.suggestions.length,
        pendingCount: pending,
      });
    }
    return infos.sort((a, b) => b.pendingCount - a.pendingCount);
  }

  /**
   * 특정 .suggestions.json URI에 대한 제안 목록을 반환합니다.
   */
  getSuggestions(sugJsonUri: string): Suggestion[] {
    return this.cache.get(sugJsonUri)?.suggestions ?? [];
  }

  /**
   * 특정 .md 파일에 매핑된 .suggestions.json URI를 찾습니다.
   */
  findSugJsonUriForMd(mdUri: vscode.Uri): string | undefined {
    for (const [uriStr, file] of this.cache) {
      const sugUri = vscode.Uri.parse(uriStr);
      const baseDir = this.getMdBaseDir(sugUri);
      const expectedMd = vscode.Uri.joinPath(baseDir, file.sourceFile);
      if (expectedMd.fsPath === mdUri.fsPath) {
        return uriStr;
      }
    }
    return undefined;
  }

  /**
   * .suggestions.json URI로부터 대응하는 .md 파일의 URI를 반환합니다.
   */
  getMdUri(sugJsonUri: string): vscode.Uri | undefined {
    const file = this.cache.get(sugJsonUri);
    if (!file) { return undefined; }
    const sugUri = vscode.Uri.parse(sugJsonUri);
    const baseDir = this.getMdBaseDir(sugUri);
    return vscode.Uri.joinPath(baseDir, file.sourceFile);
  }

  /**
   * 특정 .md 파일의 pending 제안만 반환합니다.
   */
  getPendingSuggestionsForMd(mdUri: vscode.Uri): Suggestion[] {
    const sugUri = this.findSugJsonUriForMd(mdUri);
    if (!sugUri) { return []; }
    return this.getSuggestions(sugUri).filter(s => s.status === 'pending');
  }

  /**
   * ID로 제안을 찾습니다.
   */
  findSuggestionById(id: string): { sugJsonUri: string; suggestion: Suggestion } | undefined {
    for (const [uriStr, file] of this.cache) {
      const sug = file.suggestions.find(s => s.id === id);
      if (sug) {
        return { sugJsonUri: uriStr, suggestion: sug };
      }
    }
    return undefined;
  }

  /**
   * 제안을 수락합니다.
   * 1. .md 파일에 텍스트 변경 적용
   * 2. 나머지 pending 제안들의 라인 번호 재계산
   * 3. .suggestions.json 업데이트
   */
  async accept(id: string, selectedText?: string): Promise<void> {
    const found = this.findSuggestionById(id);
    if (!found) { throw new Error(`Suggestion not found: ${id}`); }

    const { sugJsonUri, suggestion } = found;
    const mdUri = this.getMdUri(sugJsonUri);
    if (!mdUri) { throw new Error(`Markdown file not found for suggestion: ${id}`); }

    const text = selectedText ?? getDefaultText(suggestion);

    // .md 파일을 에디터 버퍼에서 읽기 (디스크 대신)
    const doc = await vscode.workspace.openTextDocument(mdUri);
    const mdContent = doc.getText();

    // 텍스트 적용
    const { newContent } = applySuggestion(mdContent, suggestion, text);

    // 에디터 버퍼에 직접 쓰기 (WorkspaceEdit 사용)
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(mdContent.length));
    edit.replace(mdUri, fullRange, newContent);
    await vscode.workspace.applyEdit(edit);
    await doc.save();

    // suggestion 상태 업데이트 (라인 재계산 불필요 — 동적 위치 해석)
    const file = this.cache.get(sugJsonUri)!;
    suggestion.status = 'accepted';

    // .suggestions.json 쓰기
    await this.writeSugJson(sugJsonUri, file);
    await this.writeAdviceMd(sugJsonUri, file);
    this._onDidChange.fire();
  }

  /**
   * 제안을 거절합니다.
   */
  async reject(id: string): Promise<void> {
    const found = this.findSuggestionById(id);
    if (!found) { throw new Error(`Suggestion not found: ${id}`); }

    const { sugJsonUri, suggestion } = found;
    suggestion.status = 'rejected';

    const file = this.cache.get(sugJsonUri)!;
    await this.writeSugJson(sugJsonUri, file);
    await this.writeAdviceMd(sugJsonUri, file);
    this._onDidChange.fire();
  }

  /**
   * 특정 문서의 모든 pending 제안을 수락합니다.
   * 라인 번호 충돌을 방지하기 위해 아래→위 순서로 적용합니다.
   */
  async acceptAll(sugJsonUri: string): Promise<void> {
    const file = this.cache.get(sugJsonUri);
    if (!file) { return; }

    const mdUri = this.getMdUri(sugJsonUri);
    if (!mdUri) { return; }

    const pending = file.suggestions.filter(s => s.status === 'pending');

    if (pending.length === 0) { return; }

    // 에디터 버퍼에서 읽기 (디스크 대신)
    const doc = await vscode.workspace.openTextDocument(mdUri);
    let mdContent = doc.getText();

    // 매 적용마다 위치를 재해석하여 앵커 무효화 방지
    let remaining = pending.filter(s => s.status === 'pending');
    while (remaining.length > 0) {
      const withPos = remaining.map(sug => ({
        sug,
        pos: resolveAnchor(mdContent, sug.anchor.headingPath, sug.anchor.textContent),
      })).filter(x => x.pos !== null)
        .sort((a, b) => b.pos!.startLine - a.pos!.startLine);

      if (withPos.length === 0) { break; }

      const { sug } = withPos[0];
      const text = getDefaultText(sug);
      const { newContent } = applySuggestion(mdContent, sug, text);
      mdContent = newContent;
      sug.status = 'accepted';
      remaining = remaining.filter(s => s.status === 'pending');
    }

    // 에디터 버퍼에 직접 쓰기 (WorkspaceEdit 사용)
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    edit.replace(mdUri, fullRange, mdContent);
    await vscode.workspace.applyEdit(edit);
    await doc.save();

    await this.writeSugJson(sugJsonUri, file);
    await this.writeAdviceMd(sugJsonUri, file);
    this._onDidChange.fire();
  }

  /**
   * 특정 문서의 모든 pending 제안을 거절합니다.
   */
  async rejectAll(sugJsonUri: string): Promise<void> {
    const file = this.cache.get(sugJsonUri);
    if (!file) { return; }

    for (const sug of file.suggestions) {
      if (sug.status === 'pending') {
        sug.status = 'rejected';
      }
    }

    await this.writeSugJson(sugJsonUri, file);
    this._onDidChange.fire();
  }

  /**
   * headingPath + textContent로 문서 내 위치를 찾을 수 없으면 stale입니다.
   */
  checkStaleness(mdContent: string, suggestion: Suggestion): boolean {
    const pos = resolveAnchor(
      mdContent,
      suggestion.anchor.headingPath,
      suggestion.anchor.textContent,
    );
    return pos === null;
  }

  /**
   * 연동되지 않는(stale) pending 제안을 JSON에서 제거합니다.
   * - startLine이 문서 범위를 벗어난 제안
   * - anchor.textContent가 현재 문서 내용과 일치하지 않는 제안
   */
  async pruneStale(sugJsonUri: string): Promise<number> {
    const file = this.cache.get(sugJsonUri);
    if (!file) { return 0; }

    const mdUri = this.getMdUri(sugJsonUri);
    if (!mdUri) { return 0; }

    let mdContent = '';
    try {
      const doc = await vscode.workspace.openTextDocument(mdUri);
      mdContent = doc.getText();
    } catch (err) {
      this.log.appendLine(`[pruneStale] openTextDocument failed: ${err}`);
      try {
        const raw = await vscode.workspace.fs.readFile(mdUri);
        mdContent = new TextDecoder('utf-8').decode(raw);
      } catch (err2) {
        this.log.appendLine(`[pruneStale] readFile also failed: ${err2}`);
        return 0;
      }
    }

    const before = file.suggestions.length;

    file.suggestions = file.suggestions.filter(sug => {
      // 이미 처리된 제안(accepted/rejected)은 유지
      if (sug.status !== 'pending') { return true; }
      // 문서에서 위치를 찾을 수 없으면 제거
      if (this.checkStaleness(mdContent, sug)) { return false; }
      return true;
    });

    const removed = before - file.suggestions.length;
    if (removed > 0) {
      this.log.appendLine(`[pruneStale] Removed ${removed} stale suggestions from ${sugJsonUri}`);
      await this.writeSugJson(sugJsonUri, file);
      await this.writeAdviceMd(sugJsonUri, file);
      this._onDidChange.fire();
    }
    return removed;
  }

  /**
   * 모든 캐시된 파일에서 stale 제안을 정리합니다.
   */
  async pruneAllStale(): Promise<number> {
    let total = 0;
    for (const uriStr of this.cache.keys()) {
      total += await this.pruneStale(uriStr);
    }
    return total;
  }

  /**
   * .advice.md 파일의 URI를 반환합니다.
   * example.suggestions.json → example.advice.md
   */
  getAdviceMdUri(sugJsonUriStr: string): vscode.Uri {
    const sugUri = vscode.Uri.parse(sugJsonUriStr);
    const baseName = (sugUri.path.split('/').pop() ?? '').replace(/\.suggestions\.json$/, '');
    const baseDir = this.getMdBaseDir(sugUri);
    return vscode.Uri.joinPath(this.getOutputDir(baseDir, baseName), `${baseName}.advice.md`);
  }

  /**
   * .advice.md 파일을 생성/갱신합니다.
   * 원본 .md 파일을 읽어 섹션별로 분리한 뒤 조언을 삽입합니다.
   */
  private getOutputDir(baseDir: vscode.Uri, baseName: string): vscode.Uri {
    return vscode.Uri.joinPath(baseDir, '.alyplan', baseName);
  }

  private getMdBaseDir(sugJsonUri: vscode.Uri): vscode.Uri {
    // .alyplan/{project}/example.suggestions.json → 2단계 위가 .md 파일 위치
    let dir = vscode.Uri.joinPath(sugJsonUri, '..');
    const parentDir = vscode.Uri.joinPath(dir, '..');
    const parentName = parentDir.path.split('/').pop() || '';
    if (parentName === '.alyplan') {
      return vscode.Uri.joinPath(parentDir, '..');
    }
    return dir;
  }

  private async ensureDir(dirUri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(dirUri);
    } catch (err) {
      this.log.appendLine(`[ensureDir] ${dirUri.fsPath}: ${err}`);
    }
  }

  private async writeAdviceMd(sugJsonUriStr: string, file: SuggestionFile): Promise<void> {
    const adviceUri = this.getAdviceMdUri(sugJsonUriStr);

    // LaLaAdvice가 작성한 다관점 리뷰가 있으면 덮어쓰지 않음
    try {
      const existing = await vscode.workspace.fs.readFile(adviceUri);
      const content = new TextDecoder('utf-8').decode(existing);
      if (content.includes('generated-by: LaLaAdvice') || content.includes('다관점 평가') || content.includes('종합 점수')) {
        this.log.appendLine(`[writeAdviceMd] Skipped: LaLaAdvice review exists at ${adviceUri.fsPath}`);
        return;
      }
    } catch (err) {
      this.log.appendLine(`[writeAdviceMd] No existing file at ${adviceUri.fsPath}: ${err}`);
    }

    const mdUri = this.getMdUri(sugJsonUriStr);
    let mdContent = '';
    if (mdUri) {
      try {
        const raw = await vscode.workspace.fs.readFile(mdUri);
        mdContent = new TextDecoder('utf-8').decode(raw);
      } catch (err) {
        this.log.appendLine(`[writeAdviceMd] Cannot read source md: ${err}`);
      }
    }
    const md = generateAdviceMd(file.suggestions, file.sourceFile, mdContent);
    await this.ensureDir(vscode.Uri.joinPath(adviceUri, '..'));
    await vscode.workspace.fs.writeFile(adviceUri, Buffer.from(md, 'utf-8'));
    this.log.appendLine(`[writeAdviceMd] Updated ${adviceUri.fsPath}`);
  }

  /**
   * .suggestions.json 파일을 디스크에 씁니다.
   */
  private async writeSugJson(uriStr: string, file: SuggestionFile): Promise<void> {
    const uri = vscode.Uri.parse(uriStr);
    const json = JSON.stringify(file, null, 2) + '\n';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
  }

  /**
   * .advice.md 파일을 읽습니다. (LaLaAdvice 결과 또는 자동 생성)
   */
  async readAdviceMd(mdUri: vscode.Uri): Promise<string | null> {
    const dir = vscode.Uri.joinPath(mdUri, '..');
    const baseName = (mdUri.path.split('/').pop() ?? '').replace(/\.md$/, '');
    const adviceUri = vscode.Uri.joinPath(dir, '.alyplan', baseName, `${baseName}.advice.md`);
    try {
      const raw = await vscode.workspace.fs.readFile(adviceUri);
      return new TextDecoder('utf-8').decode(raw);
    } catch (err) {
      // FileNotFound는 정상 — 그 외 에러만 로깅
      if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') { /* normal */ }
      else { this.log.appendLine(`[readAdviceMd] ${adviceUri.fsPath}: ${err}`); }
      return null;
    }
  }

  /**
   * .flow.mmd 파일의 URI를 반환합니다.
   * example.md → example.flow.mmd
   */
  getFlowMmdUri(mdUri: vscode.Uri): vscode.Uri {
    const dir = vscode.Uri.joinPath(mdUri, '..');
    const baseName = (mdUri.path.split('/').pop() ?? '').replace(/\.md$/, '');
    return vscode.Uri.joinPath(this.getOutputDir(dir, baseName), `${baseName}.flow.mmd`);
  }

  /**
   * .flow.mmd 파일을 읽습니다. 없으면 null을 반환합니다.
   */
  async readFlowMmd(mdUri: vscode.Uri): Promise<string | null> {
    const mmdUri = this.getFlowMmdUri(mdUri);
    try {
      const raw = await vscode.workspace.fs.readFile(mmdUri);
      return new TextDecoder('utf-8').decode(raw);
    } catch (err) {
      if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') { /* normal */ }
      else { this.log.appendLine(`[readFlowMmd] ${mmdUri.fsPath}: ${err}`); }
      return null;
    }
  }

  /**
   * .flow.mmd 파일을 저장합니다.
   */
  async writeFlowMmd(mdUri: vscode.Uri, source: string): Promise<void> {
    const mmdUri = this.getFlowMmdUri(mdUri);
    await this.ensureDir(vscode.Uri.joinPath(mmdUri, '..'));
    await vscode.workspace.fs.writeFile(mmdUri, Buffer.from(source, 'utf-8'));
    this.log.appendLine(`[writeFlowMmd] Updated ${mmdUri.fsPath}`);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
