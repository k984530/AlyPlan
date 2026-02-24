import type { Suggestion } from '../types/suggestion.js';

/**
 * 제안이 적용(accept)된 후, 나머지 pending 제안들의 라인 번호를 조정합니다.
 *
 * 적용된 제안보다 아래에 위치한 pending 제안들의 startLine/endLine에
 * lineDelta를 더하여 실제 문서 위치와 동기화합니다.
 */
export function recalcLineNumbers(
  suggestions: Suggestion[],
  appliedId: string,
  lineDelta: number,
  appliedStartLine: number,
): void {
  for (const s of suggestions) {
    if (s.id === appliedId) { continue; }
    if (s.status !== 'pending') { continue; }
    if (s.anchor.startLine > appliedStartLine) {
      s.anchor.startLine += lineDelta;
      s.anchor.endLine += lineDelta;
    }
  }
}
