import type { Suggestion } from '../types/suggestion.js';
import { resolveAnchor } from './resolveAnchor.js';

export interface ApplyResult {
  newContent: string;
}

/**
 * 제안을 마크다운 텍스트에 적용합니다.
 * headingPath + textContent로 위치를 동적 해석하여 적용합니다.
 */
export function applySuggestion(
  markdownContent: string,
  suggestion: Suggestion,
  selectedText: string,
): ApplyResult {
  const pos = resolveAnchor(
    markdownContent,
    suggestion.anchor.headingPath,
    suggestion.anchor.textContent,
  );

  if (!pos) {
    throw new Error(`제안 위치를 찾을 수 없습니다: "${suggestion.anchor.textContent.slice(0, 30)}..."`);
  }

  const lines = markdownContent.split('\n');
  const startIdx = pos.startLine - 1; // 1-based → 0-based
  const endIdx = pos.endLine;          // slice endIdx는 exclusive
  const newLines = selectedText.split('\n');

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

  return { newContent: resultLines.join('\n') };
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
