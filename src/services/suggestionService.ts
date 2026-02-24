import * as vscode from 'vscode';
import type { Suggestion, SuggestionFile, DocInfo } from '../types/suggestion.js';
import { applySuggestion, getDefaultText } from '../utils/suggestionApply.js';
import { recalcLineNumbers } from '../utils/lineRecalc.js';
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

    // .md 파일 읽기
    const mdRaw = await vscode.workspace.fs.readFile(mdUri);
    const mdContent = Buffer.from(mdRaw).toString('utf-8');

    // 텍스트 적용
    const { newContent, lineDelta } = applySuggestion(mdContent, suggestion, text);

    // .md 파일 쓰기
    await vscode.workspace.fs.writeFile(mdUri, Buffer.from(newContent, 'utf-8'));

    // suggestion 상태 업데이트 + 라인 재계산
    const file = this.cache.get(sugJsonUri)!;
    suggestion.status = 'accepted';
    recalcLineNumbers(file.suggestions, id, lineDelta, suggestion.anchor.startLine);

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

    const pending = file.suggestions
      .filter(s => s.status === 'pending')
      .sort((a, b) => b.anchor.startLine - a.anchor.startLine);

    if (pending.length === 0) { return; }

    // 배치: md를 한 번만 읽고, 아래→위 순서로 모든 변경을 적용한 뒤, 한 번만 씀
    const mdRaw = await vscode.workspace.fs.readFile(mdUri);
    let mdContent = Buffer.from(mdRaw).toString('utf-8');

    for (const sug of pending) {
      const text = getDefaultText(sug);
      const { newContent } = applySuggestion(mdContent, sug, text);
      mdContent = newContent;
      sug.status = 'accepted';
    }

    await vscode.workspace.fs.writeFile(mdUri, Buffer.from(mdContent, 'utf-8'));
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
   * 현재 문서 텍스트와 anchor.textContent를 비교하여 staleness를 검사합니다.
   */
  checkStaleness(mdContent: string, suggestion: Suggestion): boolean {
    const lines = mdContent.split('\n');
    const actualText = lines.slice(
      suggestion.anchor.startLine - 1,
      suggestion.anchor.endLine,
    ).join('\n');
    return suggestion.anchor.textContent.trim() !== actualText.trim();
  }

  /**
   * .advice.md 파일의 URI를 반환합니다.
   * example.suggestions.json → example.advice.md
   */
  getAdviceMdUri(sugJsonUriStr: string): vscode.Uri {
    const sugUri = vscode.Uri.parse(sugJsonUriStr);
    const baseName = sugUri.path.split('/').pop()!.replace(/\.suggestions\.json$/, '');
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
    } catch { /* already exists */ }
  }

  private async writeAdviceMd(sugJsonUriStr: string, file: SuggestionFile): Promise<void> {
    const adviceUri = this.getAdviceMdUri(sugJsonUriStr);
    const mdUri = this.getMdUri(sugJsonUriStr);
    let mdContent = '';
    if (mdUri) {
      try {
        const raw = await vscode.workspace.fs.readFile(mdUri);
        mdContent = new TextDecoder('utf-8').decode(raw);
      } catch { /* 원본 파일 없으면 빈 문자열 */ }
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
   * .flow.mmd 파일의 URI를 반환합니다.
   * example.md → example.flow.mmd
   */
  getFlowMmdUri(mdUri: vscode.Uri): vscode.Uri {
    const dir = vscode.Uri.joinPath(mdUri, '..');
    const baseName = mdUri.path.split('/').pop()!.replace(/\.md$/, '');
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
    } catch {
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
