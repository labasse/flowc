/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type NodeType = 'terminal' | 'process' | 'io' | 'diamond' | 'junction';

export interface BaseNode {
  id: string;
  type: NodeType;
  text: string;
  terminalKind?: 'start' | 'end';
}

export interface SimpleBlock {
  kind: 'simple';
  id: string;
  node: BaseNode; // terminal, process, or io
}

export interface IfBlock {
  kind: 'if';
  id: string;
  diamond: BaseNode;
  junction: BaseNode;
  trueBranch: Block[];
  falseBranch: Block[];
}

export interface DoWhileBlock {
  kind: 'dowhile';
  id: string;
  junction: BaseNode;
  body: Block[];
  diamond: BaseNode;
}

export interface WhileBlock {
  kind: 'while';
  id: string;
  diamond: BaseNode;
  body: Block[];
}

export type Block = SimpleBlock | IfBlock | DoWhileBlock | WhileBlock;

export interface InsertionSlot {
  slotId: string;
  // Parent reference: null if root, or parent block id and branch name
  parentId: string | null;
  branch: 'root' | 'true' | 'false' | 'body';
  index: number;
  x: number;
  yTop: number;
  yBottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ArrowSegment {
  p1: Point;
  p2: Point;
  isDownwardVertical: boolean;
  hasArrowHead?: boolean;
  slot?: InsertionSlot;
  label?: {
    text: 'true' | 'false';
    x: number;
    y: number;
  };
}

export interface LayoutNodeBox {
  nodeId: string;
  blockId: string;
  type: NodeType;
  text: string;
  terminalKind?: 'start' | 'end';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  lines: string[];
  isDiamond?: boolean;
  canDelete: boolean;
  canDrag: boolean;
  deleteButtonPos?: Point;
}

export interface FlowLayout {
  nodes: LayoutNodeBox[];
  arrows: ArrowSegment[];
  slots: InsertionSlot[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

export interface DiagramSnapshot {
  title: string;
  blocks: Block[];
}

export interface PNGMetadata {
  title: string;
  history: DiagramSnapshot[];
  labels: Record<string, string>;
  historyIndex: number;
}
