/**
 * 커맨드 인자에서 suggestion ID를 추출합니다.
 *
 * VS Code에서 커맨드가 호출되는 경로에 따라 인자 타입이 다릅니다:
 * - CodeLens / TreeItem.command → string ID 직접 전달
 * - TreeView 인라인 메뉴 버튼 → TreeElement 객체 전달
 */
export function resolveId(arg: unknown): string | undefined {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg && typeof arg === 'object') {
    const obj = arg as Record<string, unknown>;
    // TreeElement { kind: 'suggestion', suggestion: { id: '...' } }
    if (obj.kind === 'suggestion' && obj.suggestion && typeof obj.suggestion === 'object') {
      return (obj.suggestion as Record<string, unknown>).id as string | undefined;
    }
    // TreeElement { kind: 'alternative', suggestionId: '...' }
    if (obj.kind === 'alternative' && typeof obj.suggestionId === 'string') {
      return obj.suggestionId;
    }
  }
  return undefined;
}
