/**
 * flowParser.ts: 마크다운 순서형 리스트를 Mermaid 플로우차트로 변환합니다.
 *
 * 연속된 순서형 리스트(1. 2. 3. ...)가 2개 이상이면 플로우로 인식하고,
 * 들여쓴 서브 아이템(- 조건: 결과)은 분기 노드로 변환합니다.
 */

interface FlowItem {
  text: string;
  subItems: string[];
}

interface FlowSection {
  heading: string;
  items: FlowItem[];
}

/**
 * 마크다운에서 순서형 리스트 블록을 추출하여 Mermaid flowchart 구문을 생성합니다.
 */
export function extractFlows(mdContent: string): string {
  const lines = mdContent.split('\n');
  const sections: FlowSection[] = [];
  let currentHeading = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 헤딩 컨텍스트 추적
    const hMatch = line.match(/^#{1,6}\s+(.*)/);
    if (hMatch) {
      currentHeading = hMatch[1].trim();
      i++;
      continue;
    }

    // 순서형 리스트 시작 감지
    if (line.match(/^\d+\.\s+/)) {
      const items: FlowItem[] = [];

      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        const ol = lines[i].match(/^\d+\.\s+(.*)/);
        if (ol) {
          const item: FlowItem = { text: ol[1], subItems: [] };
          i++;
          // 들여쓴 서브 아이템 수집
          while (i < lines.length && lines[i].match(/^\s+[-*]\s+/)) {
            const sub = lines[i].match(/^\s+[-*]\s+(.*)/);
            if (sub) { item.subItems.push(sub[1]); }
            i++;
          }
          items.push(item);
        }
      }

      // 2개 이상이면 플로우로 인식
      if (items.length >= 2) {
        sections.push({ heading: currentHeading, items });
      }
      continue;
    }

    i++;
  }

  return generateMermaid(sections);
}

function generateMermaid(sections: FlowSection[]): string {
  if (sections.length === 0) { return ''; }

  const useSubgraph = sections.length > 1;
  let mmd = 'flowchart TD\n';

  sections.forEach((sec, si) => {
    const p = `F${si}`;
    if (useSubgraph) {
      mmd += `  subgraph ${p}["${sanitize(sec.heading)}"]\n`;
    }
    const ind = useSubgraph ? '    ' : '  ';

    // 순차 노드 생성
    sec.items.forEach((item, idx) => {
      mmd += `${ind}${p}_${idx + 1}["${sanitize(item.text)}"]\n`;
    });

    // 순차 엣지
    for (let idx = 0; idx < sec.items.length - 1; idx++) {
      mmd += `${ind}${p}_${idx + 1} --> ${p}_${idx + 2}\n`;
    }

    // 분기 노드 (서브 아이템)
    sec.items.forEach((item, idx) => {
      if (item.subItems.length === 0) { return; }
      const parentId = `${p}_${idx + 1}`;
      item.subItems.forEach((sub, subIdx) => {
        const subId = `${parentId}_b${subIdx + 1}`;
        const condMatch = sub.match(/^(.+?)[:：]\s+(.+)/);
        if (condMatch) {
          mmd += `${ind}${subId}{"${sanitize(condMatch[1])}"}\n`;
          mmd += `${ind}${parentId} -.->|"${sanitize(condMatch[2])}"| ${subId}\n`;
        } else {
          mmd += `${ind}${subId}["${sanitize(sub)}"]\n`;
          mmd += `${ind}${parentId} -.-> ${subId}\n`;
        }
      });
    });

    if (useSubgraph) { mmd += '  end\n'; }
  });

  return mmd;
}

function sanitize(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/"/g, "'")
    .replace(/\[/g, '(')
    .replace(/\]/g, ')');
}
