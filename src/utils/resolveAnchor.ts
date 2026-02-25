/**
 * headingPath + textContent를 기반으로 문서에서 실제 라인 위치를 동적으로 해석합니다.
 * 라인 번호에 의존하지 않으므로 문서 편집 후에도 안정적으로 위치를 찾습니다.
 */

export interface ResolvedPosition {
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed
}

/**
 * headingPath와 textContent로 문서 내 위치를 찾습니다.
 *
 * 1단계: headingPath의 마지막 헤딩으로 섹션 범위를 좁힘
 * 2단계: 해당 섹션 내에서 textContent를 검색
 * 3단계: 섹션 내에서 못 찾으면 전체 문서에서 검색 (폴백)
 */
export function resolveAnchor(
  mdContent: string,
  headingPath: string[],
  textContent: string,
): ResolvedPosition | null {
  const lines = mdContent.split('\n');
  const searchText = textContent.trim();
  if (!searchText) { return null; }

  // 섹션 범위 결정
  let sectionStart = 0;
  let sectionEnd = lines.length;

  if (headingPath.length > 0) {
    const lastHeading = headingPath[headingPath.length - 1];
    const headingText = lastHeading.replace(/^#+\s*/, '').trim();

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+(.*)/);
      if (m && m[2].trim() === headingText) {
        sectionStart = i;
        const level = m[1].length;
        sectionEnd = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          const nm = lines[j].match(/^(#{1,6})\s/);
          if (nm && nm[1].length <= level) {
            sectionEnd = j;
            break;
          }
        }
        break;
      }
    }
  }

  // 섹션 내에서 textContent 검색
  const pos = findTextInRange(lines, sectionStart, sectionEnd, searchText);
  if (pos) { return pos; }

  // 폴백: 전체 문서에서 검색
  const fallback = findTextInRange(lines, 0, lines.length, searchText);
  return fallback;
}

function findTextInRange(
  lines: string[],
  rangeStart: number,
  rangeEnd: number,
  searchText: string,
): ResolvedPosition | null {
  const rangeLines = lines.slice(rangeStart, rangeEnd);
  const rangeStr = rangeLines.join('\n');
  const idx = rangeStr.indexOf(searchText);
  if (idx === -1) { return null; }

  const before = rangeStr.substring(0, idx);
  const startLine = rangeStart + before.split('\n').length; // 1-indexed
  const endLine = startLine + searchText.split('\n').length - 1;
  return { startLine, endLine };
}
