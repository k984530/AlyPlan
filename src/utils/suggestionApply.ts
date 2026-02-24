import type { Suggestion } from '../types/suggestion.js';

export interface ApplyResult {
  newContent: string;
  lineDelta: number;
}

/**
 * 제안을 마크다운 텍스트에 적용합니다.
 *
 * 1-based 라인 번호(anchor.startLine, endLine)를 사용하여
 * replace / insert_after / insert_before / delete 연산을 수행합니다.
 *
 * @returns 적용 후 텍스트와 라인 변화량(lineDelta)
 */
export function applySuggestion(
  markdownContent: string,
  suggestion: Suggestion,
  selectedText: string,
): ApplyResult {
  const lines = markdownContent.split('\n');
  const { startLine, endLine } = suggestion.anchor;
  const startIdx = startLine - 1; // 1-based → 0-based
  const endIdx = endLine; // slice endIdx는 exclusive

  const newLines = selectedText.split('\n');
  const oldLineCount = endIdx - startIdx;
  let resultLines: string[];

  switch (suggestion.type) {
    case 'replace':
      resultLines = [
        ...lines.slice(0, startIdx),
        ...newLines,
        ...lines.slice(endIdx),
      ];
      break;

    case 'insert_after':
      resultLines = [
        ...lines.slice(0, endIdx),
        ...newLines,
        ...lines.slice(endIdx),
      ];
      break;

    case 'insert_before':
      resultLines = [
        ...lines.slice(0, startIdx),
        ...newLines,
        ...lines.slice(startIdx),
      ];
      break;

    case 'delete':
      resultLines = [
        ...lines.slice(0, startIdx),
        ...lines.slice(endIdx),
      ];
      break;

    default:
      throw new Error(`Unknown suggestion type: ${suggestion.type}`);
  }

  const lineDelta = (() => {
    switch (suggestion.type) {
      case 'replace': return newLines.length - oldLineCount;
      case 'insert_after': return newLines.length;
      case 'insert_before': return newLines.length;
      case 'delete': return -oldLineCount;
    }
  })();

  return {
    newContent: resultLines.join('\n'),
    lineDelta,
  };
}

/**
 * 제안의 적용할 텍스트를 결정합니다.
 * alternatives가 있으면 첫 번째 대안을, 없으면 suggestedText를 반환합니다.
 */
export function getDefaultText(suggestion: Suggestion): string {
  if (suggestion.alternatives && suggestion.alternatives.length > 0) {
    return suggestion.alternatives[0].text;
  }
  return suggestion.suggestedText ?? '';
}
