/**
 * Webview JavaScript 스크립트
 * suggestionWebviewProvider.ts에서 추출하여 관리합니다.
 */

/** 기본 웹뷰 스크립트 (항상 포함) */
export const WEBVIEW_BASE_SCRIPT = `
const vscode = acquireVsCodeApi();

function send(command, id, text) {
  vscode.postMessage({ command, id, text });
}

function revealLine(line) {
  vscode.postMessage({ command: 'revealLine', line });
}

function switchTab(cardId, idx) {
  document.querySelectorAll('.tab[data-card="'+cardId+'"]').forEach((t,i) => {
    t.classList.toggle('tab-active', i === idx);
  });
  document.querySelectorAll('.panel[data-card="'+cardId+'"]').forEach((p,i) => {
    p.classList.toggle('panel-hidden', i !== idx);
  });
}

function acceptSelected(cardId) {
  const activePanel = document.querySelector('.panel[data-card="'+cardId+'"]:not(.panel-hidden)');
  const text = activePanel?.dataset.text;
  send('accept', cardId, text);
}

function startEdit(cardId) {
  const activePanel = document.querySelector('.panel[data-card="'+cardId+'"]:not(.panel-hidden)');
  const text = activePanel?.dataset.text || '';

  const card = document.querySelector('.sug-block:has([onclick*="'+cardId+'"]) .card')
            || document.querySelector('.card:has([onclick*="'+cardId+'"])');
  if (!card) return;

  const actions = card.querySelector('.actions');
  if (!actions) return;

  actions.style.display = 'none';

  const editDiv = document.createElement('div');
  editDiv.className = 'edit-container';
  editDiv.innerHTML =
    '<textarea class="edit-area">' + text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</textarea>' +
    '<div class="edit-actions">' +
      '<button class="btn btn-cancel" onclick="cancelEdit(this,\\''+cardId+'\\')">취소</button>' +
      '<button class="btn btn-apply" onclick="applyEdit(this,\\''+cardId+'\\')">적용</button>' +
    '</div>';

  actions.parentNode.insertBefore(editDiv, actions.nextSibling);

  const ta = editDiv.querySelector('.edit-area');
  if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
}

function applyEdit(btn, cardId) {
  const container = btn.closest('.edit-container');
  const ta = container.querySelector('.edit-area');
  const editedText = ta.value;
  send('accept', cardId, editedText);

  const actions = container.previousElementSibling;
  if (actions) actions.style.display = '';
  container.remove();
}

function cancelEdit(btn, cardId) {
  const container = btn.closest('.edit-container');
  const actions = container.previousElementSibling;
  if (actions) actions.style.display = '';
  container.remove();
}

function switchView(view) {
  document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('view-tab--active'));
  document.querySelectorAll('.view-pane').forEach(p => p.classList.remove('view-pane--active'));
  document.querySelector('.view-tab[onclick*="'+view+'"]')?.classList.add('view-tab--active');
  document.getElementById('view-'+view)?.classList.add('view-pane--active');
  if (view === 'flow' && typeof renderFlowDiagram === 'function') { renderFlowDiagram(); }
  var st = vscode.getState() || {}; st.activeView = view; vscode.setState(st);
}
`;

/** Mermaid 다이어그램 설정 */
export const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'loose',
  theme: 'base',
  themeVariables: {
    primaryColor: 'transparent',
    primaryTextColor: '#1e293b',
    primaryBorderColor: '#3b82f6',
    lineColor: '#94a3b8',
    secondaryColor: 'transparent',
    secondaryTextColor: '#92400e',
    secondaryBorderColor: '#f59e0b',
    tertiaryColor: 'transparent',
    tertiaryTextColor: '#166534',
    tertiaryBorderColor: '#22c55e',
    clusterBkg: 'transparent',
    clusterBorder: 'rgba(59,130,246,0.3)',
    background: '#ffffff',
    mainBkg: 'transparent',
    nodeBorder: '#3b82f6',
    nodeTextColor: '#1e293b',
    edgeLabelBackground: '#ffffff',
    fontFamily: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
    fontSize: '13px',
  },
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
    padding: 15,
    nodeSpacing: 50,
    rankSpacing: 60,
  }
};

/** 플로우 다이어그램 스크립트 생성 */
export function getFlowDiagramScript(flowMermaidSource: string, fontFamily?: string): string {
  const config = { ...MERMAID_CONFIG, themeVariables: { ...MERMAID_CONFIG.themeVariables } };
  if (fontFamily) {
    config.themeVariables.fontFamily = fontFamily;
  }
  const fontVar = fontFamily || MERMAID_CONFIG.themeVariables.fontFamily;
  return `
// ─── 다이어그램 ───
var flowMermaidSource = ${JSON.stringify(flowMermaidSource)};
var diagramFont = ${JSON.stringify(fontVar)};
var selectedNodeId = '', selectedNodeEl = null;
var origStroke = '', origStrokeWidth = '';
var ctxType = '', ctxId = '', ctxOldText = '';

if (typeof mermaid !== 'undefined') {
  mermaid.initialize(${JSON.stringify(config)});
}

async function renderFlowDiagram() {
  if (typeof mermaid === 'undefined') return;
  var el = document.getElementById('flow-diagram');
  if (!el || !flowMermaidSource) return;
  try {
    var result = await mermaid.render('flow-svg-' + Date.now(), flowMermaidSource);
    el.innerHTML = result.svg;
    // 다이어그램 폰트 후처리: Mermaid 인라인 스타일 강제 교체
    el.querySelectorAll('text, tspan, span, div, p, foreignObject, .nodeLabel, .edgeLabel, .label').forEach(function(node) {
      node.style.fontFamily = diagramFont;
    });
    el.querySelectorAll('[font-family]').forEach(function(node) {
      node.setAttribute('font-family', diagramFont);
    });
    attachFlowHandlers();
    applyFlowTransform();
  } catch(e) {
    el.innerHTML = '<p class="empty">렌더링 오류: ' + e.message + '</p>';
  }
}

// ─── 노드 추가 ───
function nextNodeId() {
  var max = 0;
  var re = /N(\\d+)/g;
  var m;
  while ((m = re.exec(flowMermaidSource)) !== null) {
    var n = parseInt(m[1]); if (n > max) max = n;
  }
  return 'N' + (max + 1);
}

function addNode(type) {
  var id = nextNodeId();
  if (type === 'diamond') {
    flowMermaidSource = flowMermaidSource.trimEnd() + '\\n  ' + id + '{"새 조건"}';
  } else {
    flowMermaidSource = flowMermaidSource.trimEnd() + '\\n  ' + id + '["새 노드"]';
  }
  saveAndRender();
}

function saveAndRender() {
  vscode.postMessage({ command: 'saveFlow', text: flowMermaidSource });
  deselectNode();
  renderFlowDiagram();
}

// ─── 노드/엣지 클릭 핸들러 ───
function attachFlowHandlers() {
  var diagram = document.getElementById('flow-diagram');
  if (!diagram) return;

  diagram.querySelectorAll('.node').forEach(function(node) {
    node.style.cursor = 'pointer';
    node.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    node.addEventListener('click', function(e) {
      e.stopPropagation();
      hideCtxMenu();
      var svgId = node.id || '';
      var m = svgId.match(/flowchart-(.+?)-\\d+$/);
      var nodeId = m ? m[1] : '';
      if (!nodeId) return;

      if (selectedNodeId && selectedNodeId !== nodeId) {
        toggleEdge(selectedNodeId, nodeId);
      } else if (selectedNodeId === nodeId) {
        var labelEl = node.querySelector('.nodeLabel');
        var text = labelEl ? labelEl.textContent.trim() : '';
        deselectNode();
        showCtxMenu(e.clientX, e.clientY, 'node', nodeId, text);
      } else {
        selectNode(node, nodeId);
      }
    });
  });

  var sourceEdges = getEdgesFromSource();
  diagram.querySelectorAll('path.flowchart-link').forEach(function(path, idx) {
    var edgeInfo = sourceEdges[idx] || { lineIdx: -1, label: '' };

    var hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', path.getAttribute('d'));
    hit.style.stroke = 'transparent';
    hit.style.strokeWidth = '20px';
    hit.style.fill = 'none';
    hit.style.pointerEvents = 'all';
    hit.style.cursor = 'pointer';
    path.parentNode.appendChild(hit);

    hit.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    hit.addEventListener('click', function(e) {
      e.stopPropagation();
      deselectNode();
      showCtxMenu(e.clientX, e.clientY, 'edgeLine', '' + edgeInfo.lineIdx, edgeInfo.label);
    });
  });

  diagram.querySelectorAll('.edgeLabel').forEach(function(g, idx) {
    var edgeInfo = sourceEdges[idx] || { lineIdx: -1, label: '' };
    var span = g.querySelector('span');
    var text = span ? span.textContent.trim() : '';
    g.style.cursor = 'pointer';
    g.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    g.addEventListener('click', function(e) {
      e.stopPropagation();
      deselectNode();
      showCtxMenu(e.clientX, e.clientY, 'edgeLine', '' + edgeInfo.lineIdx, text);
    });
  });
}

// ─── 노드 선택/해제 ───
var origFill = '';
var selectedShapeEl = null;

function findMainShape(gEl) {
  var all = gEl.querySelectorAll('rect, polygon, circle, ellipse, path');
  for (var i = 0; i < all.length; i++) {
    if (!all[i].closest('foreignObject')) return all[i];
  }
  return null;
}

function selectNode(gEl, nodeId) {
  deselectNode();
  selectedNodeEl = gEl;
  selectedNodeId = nodeId;
  var shape = findMainShape(gEl);
  selectedShapeEl = shape;
  if (shape) {
    origStroke = shape.style.stroke || '';
    origStrokeWidth = shape.style.strokeWidth || '';
    origFill = shape.style.fill || '';
    shape.style.stroke = '#f59e0b';
    shape.style.strokeWidth = '3px';
    shape.style.fill = 'rgba(245,158,11,0.15)';
  }
  setStatus('노드 선택됨 — 다른 노드 클릭: 연결/해제 | 같은 노드: 편집');
}

function deselectNode() {
  if (selectedShapeEl) {
    selectedShapeEl.style.stroke = origStroke;
    selectedShapeEl.style.strokeWidth = origStrokeWidth;
    selectedShapeEl.style.fill = origFill;
  }
  selectedNodeEl = null;
  selectedNodeId = '';
  selectedShapeEl = null;
  setStatus('');
}

function setStatus(msg) {
  var el = document.getElementById('flow-status');
  if (el) el.textContent = msg;
}

// ─── 엣지 토글 ───
function findEdgeLine(fromId, toId) {
  var lines = flowMermaidSource.split('\\n');
  for (var j = 0; j < lines.length; j++) {
    var t = lines[j].trim();
    if (t.indexOf('-->') < 0 && t.indexOf('-.->') < 0) continue;
    var src = t.split(/\\s/)[0];
    if (src !== fromId) continue;
    var arrowPos = t.indexOf('-->');
    if (arrowPos < 0) arrowPos = t.indexOf('-.->');
    var rest = t.substring(arrowPos);
    var toPos = rest.indexOf(toId);
    if (toPos < 0) continue;
    var charAfter = rest[toPos + toId.length] || '';
    if (!/[a-zA-Z0-9_]/.test(charAfter)) return j;
  }
  return -1;
}

function toggleEdge(fromId, toId) {
  var idx = findEdgeLine(fromId, toId);
  if (idx < 0) idx = findEdgeLine(toId, fromId);
  if (idx >= 0) {
    var lines = flowMermaidSource.split('\\n');
    lines.splice(idx, 1);
    flowMermaidSource = lines.join('\\n');
  } else {
    flowMermaidSource = flowMermaidSource.trimEnd() + '\\n  ' + fromId + ' --> ' + toId;
  }
  saveAndRender();
}

// ─── 소스에서 엣지 정보 추출 ───
function getEdgesFromSource() {
  var edges = [];
  var lines = flowMermaidSource.split('\\n');
  for (var j = 0; j < lines.length; j++) {
    var t = lines[j].trim();
    if (t.indexOf('-->') < 0 && t.indexOf('-.->') < 0) continue;
    var lm = t.match(/[|]"([^"]*)"[|]/);
    edges.push({ lineIdx: j, label: lm ? lm[1] : '' });
  }
  return edges;
}

// ─── 컨텍스트 메뉴 ───
function showCtxMenu(x, y, type, id, text) {
  ctxType = type; ctxId = id; ctxOldText = text;
  var menu = document.getElementById('flow-ctx-menu');
  var input = document.getElementById('flow-ctx-input');
  var labels = { node: '노드 편집', edge: '라벨 편집', edgeLine: '연결선' };
  document.getElementById('flow-ctx-type').textContent = labels[type] || type;
  document.getElementById('flow-ctx-del').style.display = (type === 'node' || type === 'edgeLine') ? '' : 'none';
  input.value = text;
  input.placeholder = type === 'edgeLine' ? '라벨 추가...' : '';
  input.rows = Math.min(3, Math.max(1, (text.match(/\\n/g) || []).length + 1));
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 120) + 'px';
  menu.classList.add('flow-ctx-menu--visible');
  input.focus(); input.select();
  input.onkeydown = function(ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); applyCtxEdit(); }
    if (ev.key === 'Escape') hideCtxMenu();
  };
  input.oninput = function() {
    input.rows = Math.min(3, Math.max(1, input.value.split('\\n').length));
  };
}

function hideCtxMenu() {
  var menu = document.getElementById('flow-ctx-menu');
  if (menu) menu.classList.remove('flow-ctx-menu--visible');
  ctxType = '';
}

function applyCtxEdit() {
  var newText = document.getElementById('flow-ctx-input').value.trim();
  if (!newText || newText === ctxOldText) { hideCtxMenu(); return; }
  newText = newText.replace(/"/g, "'");
  if (ctxType === 'node' && ctxId) {
    var lines = flowMermaidSource.split('\\n');
    for (var j = 0; j < lines.length; j++) {
      var t = lines[j].trim();
      if (t.indexOf(ctxId + '["') === 0 || t.indexOf(ctxId + '{"') === 0 || t.indexOf(ctxId + '("') === 0) {
        var q1 = lines[j].indexOf('"');
        var q2 = lines[j].indexOf('"', q1 + 1);
        if (q1 >= 0 && q2 > q1) {
          lines[j] = lines[j].substring(0, q1 + 1) + newText + lines[j].substring(q2);
        }
        break;
      }
    }
    flowMermaidSource = lines.join('\\n');
  } else if (ctxType === 'edgeLine' && ctxId) {
    var ei = parseInt(ctxId);
    if (ei >= 0 && newText) {
      var elines = flowMermaidSource.split('\\n');
      var eline = elines[ei];
      if (eline.indexOf('|"') >= 0) {
        eline = eline.replace(/[|]"[^"]*"[|]/, '|"' + newText + '"|');
      } else if (eline.indexOf('-.->') >= 0) {
        eline = eline.replace('-.->',  '-.->|"' + newText + '"|');
      } else {
        eline = eline.replace('-->', '-->|"' + newText + '"|');
      }
      elines[ei] = eline;
      flowMermaidSource = elines.join('\\n');
    }
  }
  hideCtxMenu();
  saveAndRender();
}

function deleteCtxTarget() {
  if (ctxType === 'edgeLine' && ctxId) {
    var ei = parseInt(ctxId);
    if (ei >= 0) {
      var elines = flowMermaidSource.split('\\n');
      elines.splice(ei, 1);
      flowMermaidSource = elines.join('\\n');
    }
    hideCtxMenu();
    saveAndRender();
    return;
  }
  if (ctxType !== 'node' || !ctxId) { hideCtxMenu(); return; }
  var lines = flowMermaidSource.split('\\n');
  flowMermaidSource = lines.filter(function(line) {
    var t = line.trim();
    if (t.indexOf(ctxId + '[') === 0 || t.indexOf(ctxId + '{') === 0 || t.indexOf(ctxId + '(') === 0) return false;
    if (t.indexOf('-->') >= 0 || t.indexOf('-.->') >= 0) {
      var parts = t.split(/\\s+/);
      for (var p = 0; p < parts.length; p++) {
        if (parts[p] === ctxId) return false;
      }
    }
    return true;
  }).join('\\n');
  hideCtxMenu();
  saveAndRender();
}

document.addEventListener('click', function(e) {
  var menu = document.getElementById('flow-ctx-menu');
  if (menu && menu.classList.contains('flow-ctx-menu--visible') && !menu.contains(e.target)) {
    hideCtxMenu();
  }
});

// ─── 확대/축소 + 드래그 이동 ───
var _fs = (vscode.getState() || {});
var flowScale = _fs.flowScale || 1;
var flowPanX = _fs.flowPanX || 0, flowPanY = _fs.flowPanY || 0;
var flowDragging = false, flowLastX = 0, flowLastY = 0;

function flowZoom(dir) {
  var steps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  var idx = steps.indexOf(flowScale);
  if (idx < 0) { idx = steps.reduce(function(best, v, i) { return Math.abs(v - flowScale) < Math.abs(steps[best] - flowScale) ? i : best; }, 0); }
  idx = Math.max(0, Math.min(steps.length - 1, idx + dir));
  flowScale = steps[idx];
  applyFlowTransform();
}

function flowZoomReset() {
  flowScale = 1; flowPanX = 0; flowPanY = 0;
  applyFlowTransform();
}

function applyFlowTransform() {
  var el = document.getElementById('flow-diagram');
  if (el) { el.style.transform = 'translate(' + flowPanX + 'px,' + flowPanY + 'px) scale(' + flowScale + ')'; }
  var label = document.getElementById('flow-zoom-label');
  if (label) { label.textContent = Math.round(flowScale * 100) + '%'; }
  var st = vscode.getState() || {};
  st.flowScale = flowScale; st.flowPanX = flowPanX; st.flowPanY = flowPanY;
  vscode.setState(st);
}

(function() {
  var vp = document.getElementById('flow-viewport');
  if (!vp) return;
  vp.addEventListener('wheel', function(e) {
    e.preventDefault();
    flowZoom(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  vp.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    flowDragging = true; flowLastX = e.clientX; flowLastY = e.clientY;
    e.preventDefault();
  });
  window.addEventListener('mousemove', function(e) {
    if (!flowDragging) return;
    flowPanX += e.clientX - flowLastX;
    flowPanY += e.clientY - flowLastY;
    flowLastX = e.clientX; flowLastY = e.clientY;
    var el = document.getElementById('flow-diagram');
    if (el) { el.style.transition = 'none'; el.style.transform = 'translate(' + flowPanX + 'px,' + flowPanY + 'px) scale(' + flowScale + ')'; }
  });
  window.addEventListener('mouseup', function() {
    if (flowDragging) {
      flowDragging = false;
      var el = document.getElementById('flow-diagram');
      if (el) { el.style.transition = ''; }
    }
  });

  vp.addEventListener('click', function(e) {
    if (e.target === vp || e.target.closest('#flow-diagram') === document.getElementById('flow-diagram')) {
      if (selectedNodeId && !e.target.closest('.node') && !e.target.closest('.edgeLabel')) {
        deselectNode();
      }
    }
  });
})();
`;
}

/** 초기화 스크립트 (항상 마지막에 실행) */
export const WEBVIEW_INIT_SCRIPT = `
// 버튼/탭 클릭 시 카드의 revealLine 전파 방지
document.querySelectorAll('.btn, .tab, .view-tab').forEach(el => {
  el.addEventListener('click', e => e.stopPropagation());
});

// 탭 상태 복원
(function() {
  var state = vscode.getState();
  if (state && state.activeView && state.activeView !== 'all') {
    switchView(state.activeView);
  }
})();
`;
