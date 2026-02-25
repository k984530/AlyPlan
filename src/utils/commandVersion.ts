import * as vscode from 'vscode';

/**
 * 마크다운 파일의 YAML frontmatter에서 command-version 값을 추출합니다.
 * frontmatter가 없거나 command-version 필드가 없으면 0을 반환합니다.
 */
export function parseCommandVersion(content: string): number {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) { return 0; }
  const versionMatch = match[1].match(/^command-version:\s*(\d+)/m);
  return versionMatch ? parseInt(versionMatch[1], 10) : 0;
}

/**
 * 번들된 리소스와 설치된 커맨드의 버전을 비교하여,
 * 번들 버전이 더 높으면 덮어쓰기합니다.
 *
 * @returns 업데이트된 커맨드 이름 목록
 */
export async function syncCommandsIfOutdated(
  extensionUri: vscode.Uri,
  cmdDir: vscode.Uri,
  commandNames: string[],
): Promise<string[]> {
  const updated: string[] = [];

  await vscode.workspace.fs.createDirectory(cmdDir);

  for (const name of commandNames) {
    const src = vscode.Uri.joinPath(extensionUri, 'resources', `${name}.md`);
    const dest = vscode.Uri.joinPath(cmdDir, `${name}.md`);

    // 번들 리소스 버전 읽기
    const srcBytes = await vscode.workspace.fs.readFile(src);
    const srcVersion = parseCommandVersion(Buffer.from(srcBytes).toString('utf-8'));

    // 설치된 파일 버전 읽기 (없으면 0)
    let destVersion = 0;
    try {
      const destBytes = await vscode.workspace.fs.readFile(dest);
      destVersion = parseCommandVersion(Buffer.from(destBytes).toString('utf-8'));
    } catch {
      // 파일이 없음 → destVersion = 0
    }

    if (srcVersion > destVersion) {
      await vscode.workspace.fs.copy(src, dest, { overwrite: true });
      updated.push(name);
    }
  }

  return updated;
}
