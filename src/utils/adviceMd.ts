import type { Suggestion } from '../types/suggestion.js';
import { resolveAnchor } from './resolveAnchor.js';

const catLabel: Record<string, string> = {
  content: '내용',
  structure: '구조',
  style: '스타일',
  clarity: '명확성',
  completeness: '완전성',
};

interface Section {
  heading: string;      // 헤딩 텍스트 (e.g. "2. 목표")
  level: number;        // 헤딩 레벨 (1-6)
  lines: string[];      // 해당 섹션의 원본 라인들 (헤딩 포함)
}

/**
 * 마크다운을 최상위 섹션 레벨 기준으로 분리합니다.
 */
function parseSections(mdContent: string): Section[] {
  const lines = mdContent.split('\n');
  const sections: Section[] = [];

  // 최소 헤딩 레벨 찾기 (문서 제목 제외)
  let minLevel = 6;
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s/);
    if (m && m[1].length > 1) {
      minLevel = Math.min(minLevel, m[1].length);
    }
  }

  let current: Section | null = null;

  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.*)/);
    if (m && m[1].length <= minLevel) {
      // 새 최상위 섹션 시작
      if (current) sections.push(current);
      current = {
        heading: m[2].trim(),
        level: m[1].length,
        lines: [line],
      };
    } else if (current) {
      current.lines.push(line);
    } else {
      // 첫 헤딩 전 프리앰블
      current = { heading: '', level: 0, lines: [line] };
    }
  }
  if (current) sections.push(current);

  return sections;
}

/**
 * 원본 문서를 섹션별로 나누고, 각 섹션에 해당하는 pending 조언을 삽입한
 * .advice.md 마크다운을 생성합니다.
 */
export function generateAdviceMd(
  suggestions: Suggestion[],
  sourceFile: string,
  mdContent: string,
): string {
  const pending = suggestions.filter(s => s.status === 'pending');
  const sections = parseSections(mdContent);

  // headingPath[0] 기준으로 제안 그룹화
  const adviceMap = new Map<string, Suggestion[]>();
  for (const sug of pending) {
    const key = sug.anchor.headingPath?.[0] || '';
    const list = adviceMap.get(key);
    if (list) list.push(sug);
    else adviceMap.set(key, [sug]);
  }

  let md = `# 섹션별 조언\n\n`;
  md += `> ${sourceFile} · ${pending.length}개 조언 대기 중\n\n---\n\n`;

  for (const section of sections) {
    // 원본 내용 출력
    md += section.lines.join('\n') + '\n\n';

    // 해당 섹션에 대한 조언 삽입
    const advice = adviceMap.get(section.heading);
    if (advice && advice.length > 0) {
      md += `> **조언 (${advice.length}건)**\n>\n`;
      for (const sug of advice) {
        const cat = catLabel[sug.category] || sug.category;
        const pos = resolveAnchor(mdContent, sug.anchor.headingPath, sug.anchor.textContent);
        const lineRef = pos ? ` (L${pos.startLine})` : '';
        md += `> - **[${cat}]**${lineRef} ${sug.reasoning}\n`;
      }
      md += '\n';
    }
  }

  // headingPath가 없는 제안 (문서 전체 수준)
  const noSection = adviceMap.get('');
  if (noSection && noSection.length > 0) {
    md += `---\n\n> **문서 전체 조언 (${noSection.length}건)**\n>\n`;
    for (const sug of noSection) {
      const cat = catLabel[sug.category] || sug.category;
      const pos = resolveAnchor(mdContent, sug.anchor.headingPath, sug.anchor.textContent);
      const lineRef = pos ? ` (L${pos.startLine})` : '';
      md += `> - **[${cat}]**${lineRef} ${sug.reasoning}\n`;
    }
    md += '\n';
  }

  return md;
}
