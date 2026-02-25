export interface SuggestionAnchor {
  textContent: string;
  headingPath: string[];
  /** @deprecated 동적 해석으로 대체. 하위 호환용 */
  startLine?: number;
  /** @deprecated 동적 해석으로 대체. 하위 호환용 */
  endLine?: number;
}

export type SuggestionType = 'replace' | 'insert_after' | 'insert_before' | 'delete';
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';
export type SuggestionCategory = 'content' | 'structure' | 'style' | 'clarity' | 'completeness';

export interface Alternative {
  id: string;
  label: string;
  text: string;
  reasoning?: string;
}

export interface Suggestion {
  id: string;
  status: SuggestionStatus;
  anchor: SuggestionAnchor;
  type: SuggestionType;
  originalText: string;
  /** @deprecated alternatives 사용 권장. 하위 호환용 단일 제안 텍스트 */
  suggestedText?: string;
  alternatives?: Alternative[];
  reasoning: string;
  category: SuggestionCategory;
}

export interface SuggestionFile {
  version: number;
  sourceFile: string;
  generatedAt: string;
  prompt: string;
  suggestions: Suggestion[];
}

export interface DocInfo {
  name: string;
  path: string;
  sugJsonUri: string;
  suggestionCount: number;
  pendingCount: number;
}
