/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BRANCH_HORIZONTAL_GAP,
  JUNCTION_RADIUS,
  LOOP_BACK_GAP,
  VERTICAL_GAP,
} from './constants';
import { measureNodeText } from './text-measurer';
import {
  ArrowSegment,
  Block,
  FlowLayout,
  InsertionSlot,
  LayoutNodeBox,
  Point,
} from './types';

interface SubLayoutResult {
  entryPoint: Point;
  exitPoint: Point;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  nodes: LayoutNodeBox[];
  arrows: ArrowSegment[];
  slots: InsertionSlot[];
}

export function computeFlowLayout(blocks: Block[]): FlowLayout {
  const startX = 400;
  const startY = 60;

  const result = layoutBlockSequence(blocks, startX, startY, null, 'root');

  let minX = startX - 200;
  let maxX = startX + 200;
  let minY = startY;
  let maxY = result.exitPoint.y + 40;

  for (const n of result.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y < minY) minY = n.y;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }

  for (const a of result.arrows) {
    if (a.p1.x < minX) minX = a.p1.x;
    if (a.p1.x > maxX) maxX = a.p1.x;
    if (a.p2.x < minX) minX = a.p2.x;
    if (a.p2.x > maxX) maxX = a.p2.x;
    if (a.p1.y < minY) minY = a.p1.y;
    if (a.p1.y > maxY) maxY = a.p1.y;
    if (a.p2.y < minY) minY = a.p2.y;
    if (a.p2.y > maxY) maxY = a.p2.y;
  }

  return {
    nodes: result.nodes,
    arrows: result.arrows,
    slots: result.slots,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}

function layoutBlockSequence(
  blocks: Block[],
  centerX: number,
  startY: number,
  parentId: string | null,
  branch: 'root' | 'true' | 'false' | 'body'
): SubLayoutResult {
  const nodes: LayoutNodeBox[] = [];
  const arrows: ArrowSegment[] = [];
  const slots: InsertionSlot[] = [];

  let currentY = startY;
  let minX = centerX - 100;
  let maxX = centerX + 100;
  const minY = startY;
  let lastExitPoint: Point = { x: centerX, y: startY };

  if (blocks.length === 0) {
    return {
      entryPoint: { x: centerX, y: startY },
      exitPoint: { x: centerX, y: startY },
      minX,
      maxX,
      minY,
      maxY: startY,
      nodes,
      arrows,
      slots,
    };
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (i > 0) {
      // Create vertical downward connection between block i-1 and block i
      const p1 = lastExitPoint;
      const p2 = { x: centerX, y: currentY };
      const slot: InsertionSlot = {
        slotId: `slot_${parentId ?? 'root'}_${branch}_${i}`,
        parentId,
        branch,
        index: i,
        x: centerX,
        yTop: p1.y,
        yBottom: p2.y,
      };
      arrows.push({
        p1,
        p2,
        isDownwardVertical: true,
        hasArrowHead: true,
        slot,
      });
      slots.push(slot);
    }

    const blockRes = layoutSingleBlock(block, centerX, currentY);

    nodes.push(...blockRes.nodes);
    arrows.push(...blockRes.arrows);
    slots.push(...blockRes.slots);

    if (blockRes.minX < minX) minX = blockRes.minX;
    if (blockRes.maxX > maxX) maxX = blockRes.maxX;

    lastExitPoint = blockRes.exitPoint;
    currentY = blockRes.exitPoint.y + VERTICAL_GAP;
  }

  return {
    entryPoint: { x: centerX, y: startY },
    exitPoint: lastExitPoint,
    minX,
    maxX,
    minY,
    maxY: lastExitPoint.y,
    nodes,
    arrows,
    slots,
  };
}

function layoutSingleBlock(
  block: Block,
  centerX: number,
  topY: number
): SubLayoutResult {
  switch (block.kind) {
    case 'simple':
      return layoutSimpleBlock(block, centerX, topY);
    case 'if':
      return layoutIfBlock(block, centerX, topY);
    case 'dowhile':
      return layoutDoWhileBlock(block, centerX, topY);
    case 'while':
      return layoutWhileBlock(block, centerX, topY);
  }
}

function layoutSimpleBlock(
  block: Block & { kind: 'simple' },
  centerX: number,
  topY: number
): SubLayoutResult {
  const measured = measureNodeText(block.node.text, block.node.type);
  const x = centerX - measured.width / 2;
  const y = topY;
  const isTerminal = block.node.type === 'terminal';

  const nodeBox: LayoutNodeBox = {
    nodeId: block.node.id,
    blockId: block.id,
    type: block.node.type,
    text: block.node.text,
    terminalKind: block.node.terminalKind,
    x,
    y,
    width: measured.width,
    height: measured.height,
    fontSize: measured.fontSize,
    lines: measured.lines,
    canDelete: !isTerminal,
    canDrag: !isTerminal,
    deleteButtonPos: !isTerminal
      ? { x: x + measured.width - 2, y: y + 2 }
      : undefined,
  };

  return {
    entryPoint: { x: centerX, y: topY },
    exitPoint: { x: centerX, y: topY + measured.height },
    minX: x,
    maxX: x + measured.width,
    minY: y,
    maxY: y + measured.height,
    nodes: [nodeBox],
    arrows: [],
    slots: [],
  };
}

function layoutIfBlock(
  block: Block & { kind: 'if' },
  centerX: number,
  topY: number
): SubLayoutResult {
  const nodes: LayoutNodeBox[] = [];
  const arrows: ArrowSegment[] = [];
  const slots: InsertionSlot[] = [];

  // Diamond
  const measuredDiamond = measureNodeText(block.diamond.text, 'diamond');
  const diamondX = centerX - measuredDiamond.width / 2;
  const diamondY = topY;
  const diamondBottom = diamondY + measuredDiamond.height;
  const diamondRight = centerX + measuredDiamond.width / 2;
  const diamondCenterY = diamondY + measuredDiamond.height / 2;

  nodes.push({
    nodeId: block.diamond.id,
    blockId: block.id,
    type: 'diamond',
    text: block.diamond.text,
    x: diamondX,
    y: diamondY,
    width: measuredDiamond.width,
    height: measuredDiamond.height,
    fontSize: measuredDiamond.fontSize,
    lines: measuredDiamond.lines,
    isDiamond: true,
    canDelete: true,
    canDrag: true,
    deleteButtonPos: {
      x: diamondX + measuredDiamond.width - 12,
      y: diamondY + 12,
    },
  });

  // True branch layout
  const trueStartY = diamondBottom + VERTICAL_GAP;
  let trueExitY = trueStartY;
  let maxTrueRight = diamondRight;
  let lastTrueExitPoint: Point = { x: centerX, y: diamondBottom };

  let firstBlockRes: SubLayoutResult | null = null;
  if (block.trueBranch.length > 0) {
    firstBlockRes = layoutBlockSequence(
      block.trueBranch,
      centerX,
      trueStartY,
      block.id,
      'true'
    );
    nodes.push(...firstBlockRes.nodes);
    arrows.push(...firstBlockRes.arrows);
    slots.push(...firstBlockRes.slots);

    maxTrueRight = Math.max(maxTrueRight, firstBlockRes.maxX);
    lastTrueExitPoint = firstBlockRes.exitPoint;
    trueExitY = firstBlockRes.exitPoint.y + VERTICAL_GAP;
  }

  // False branch layout (elbow to right, then down, then left into junction)
  const falseX = maxTrueRight + BRANCH_HORIZONTAL_GAP + 50;
  const falseStartY = diamondCenterY + 40;
  let falseExitY = falseStartY;
  let lastFalseExitPoint: Point = { x: falseX, y: diamondCenterY };

  let falseRes: SubLayoutResult | null = null;
  if (block.falseBranch.length > 0) {
    falseRes = layoutBlockSequence(
      block.falseBranch,
      falseX,
      falseStartY,
      block.id,
      'false'
    );
    nodes.push(...falseRes.nodes);
    arrows.push(...falseRes.arrows);
    slots.push(...falseRes.slots);
    lastFalseExitPoint = falseRes.exitPoint;
    falseExitY = falseRes.exitPoint.y + VERTICAL_GAP;
  }

  // Junction Y position: strictly below both true and false branches
  const junctionY = Math.max(trueExitY, falseExitY);

  // Now create connections to junction so arrows always reach the junction:
  if (block.trueBranch.length === 0) {
    // Empty true branch: arrow goes from diamond bottom directly to junction top
    const p1 = { x: centerX, y: diamondBottom };
    const p2 = { x: centerX, y: junctionY - JUNCTION_RADIUS };
    const slot: InsertionSlot = {
      slotId: `slot_${block.id}_true_0`,
      parentId: block.id,
      branch: 'true',
      index: 0,
      x: centerX,
      yTop: p1.y,
      yBottom: p2.y,
    };
    arrows.push({
      p1,
      p2,
      isDownwardVertical: true,
      hasArrowHead: true,
      slot,
      label: { text: 'true', x: centerX + 12, y: diamondBottom + 16 },
    });
    slots.push(slot);
  } else {
    // Arrow from diamond bottom to first true block
    const p1 = { x: centerX, y: diamondBottom };
    const p2 = { x: centerX, y: trueStartY };
    const slot0: InsertionSlot = {
      slotId: `slot_${block.id}_true_0`,
      parentId: block.id,
      branch: 'true',
      index: 0,
      x: centerX,
      yTop: p1.y,
      yBottom: p2.y,
    };
    arrows.push({
      p1,
      p2,
      isDownwardVertical: true,
      hasArrowHead: true,
      slot: slot0,
      label: { text: 'true', x: centerX + 12, y: diamondBottom + 16 },
    });
    slots.push(slot0);

    // Arrow from last true block directly to junction top
    const pExit1 = lastTrueExitPoint;
    const pExit2 = { x: centerX, y: junctionY - JUNCTION_RADIUS };
    const slotLast: InsertionSlot = {
      slotId: `slot_${block.id}_true_${block.trueBranch.length}`,
      parentId: block.id,
      branch: 'true',
      index: block.trueBranch.length,
      x: centerX,
      yTop: pExit1.y,
      yBottom: pExit2.y,
    };
    arrows.push({
      p1: pExit1,
      p2: pExit2,
      isDownwardVertical: true,
      hasArrowHead: true,
      slot: slotLast,
    });
    slots.push(slotLast);
  }

  // False branch arrows:
  // 1. Horizontal from diamond right to falseX
  arrows.push({
    p1: { x: diamondRight, y: diamondCenterY },
    p2: { x: falseX, y: diamondCenterY },
    isDownwardVertical: false,
    hasArrowHead: false,
    label: { text: 'false', x: diamondRight + 12, y: diamondCenterY - 10 },
  });

  if (block.falseBranch.length === 0) {
    // 2. Vertical downward from diamondCenterY to junctionY
    const slotFalse: InsertionSlot = {
      slotId: `slot_${block.id}_false_0`,
      parentId: block.id,
      branch: 'false',
      index: 0,
      x: falseX,
      yTop: diamondCenterY,
      yBottom: junctionY,
    };
    arrows.push({
      p1: { x: falseX, y: diamondCenterY },
      p2: { x: falseX, y: junctionY },
      isDownwardVertical: true,
      hasArrowHead: false,
      slot: slotFalse,
    });
    slots.push(slotFalse);
  } else {
    // Vertical downward to first false block
    const slot0: InsertionSlot = {
      slotId: `slot_${block.id}_false_0`,
      parentId: block.id,
      branch: 'false',
      index: 0,
      x: falseX,
      yTop: diamondCenterY,
      yBottom: falseStartY,
    };
    arrows.push({
      p1: { x: falseX, y: diamondCenterY },
      p2: { x: falseX, y: falseStartY },
      isDownwardVertical: true,
      hasArrowHead: true,
      slot: slot0,
    });
    slots.push(slot0);

    // From last false block to junctionY
    const slotEnd: InsertionSlot = {
      slotId: `slot_${block.id}_false_${block.falseBranch.length}`,
      parentId: block.id,
      branch: 'false',
      index: block.falseBranch.length,
      x: falseX,
      yTop: lastFalseExitPoint.y,
      yBottom: junctionY,
    };
    arrows.push({
      p1: lastFalseExitPoint,
      p2: { x: falseX, y: junctionY },
      isDownwardVertical: true,
      hasArrowHead: false,
      slot: slotEnd,
    });
    slots.push(slotEnd);
  }

  // 3. Horizontal from falseX back left to junction right
  arrows.push({
    p1: { x: falseX, y: junctionY },
    p2: { x: centerX + JUNCTION_RADIUS, y: junctionY },
    isDownwardVertical: false,
    hasArrowHead: true,
  });

  // Junction node
  nodes.push({
    nodeId: block.junction.id,
    blockId: block.id,
    type: 'junction',
    text: '',
    x: centerX - JUNCTION_RADIUS,
    y: junctionY - JUNCTION_RADIUS,
    width: JUNCTION_RADIUS * 2,
    height: JUNCTION_RADIUS * 2,
    fontSize: 0,
    lines: [],
    canDelete: false,
    canDrag: false,
  });

  return {
    entryPoint: { x: centerX, y: topY },
    exitPoint: { x: centerX, y: junctionY + JUNCTION_RADIUS },
    minX: Math.min(centerX - measuredDiamond.width / 2, centerX - 100),
    maxX: Math.max(falseX + 80, diamondRight),
    minY: topY,
    maxY: junctionY + JUNCTION_RADIUS,
    nodes,
    arrows,
    slots,
  };
}

function layoutDoWhileBlock(
  block: Block & { kind: 'dowhile' },
  centerX: number,
  topY: number
): SubLayoutResult {
  const nodes: LayoutNodeBox[] = [];
  const arrows: ArrowSegment[] = [];
  const slots: InsertionSlot[] = [];

  // Junction at top
  const junctionY = topY + JUNCTION_RADIUS;
  nodes.push({
    nodeId: block.junction.id,
    blockId: block.id,
    type: 'junction',
    text: '',
    x: centerX - JUNCTION_RADIUS,
    y: junctionY - JUNCTION_RADIUS,
    width: JUNCTION_RADIUS * 2,
    height: JUNCTION_RADIUS * 2,
    fontSize: 0,
    lines: [],
    canDelete: false,
    canDrag: false,
  });

  const bodyStartY = junctionY + JUNCTION_RADIUS + VERTICAL_GAP;
  let diamondY = bodyStartY;
  let maxBodyRight = centerX + 80;

  if (block.body.length === 0) {
    // Arrow from junction bottom directly to diamond
    const p1 = { x: centerX, y: junctionY + JUNCTION_RADIUS };
    const p2 = { x: centerX, y: bodyStartY };
    const slot: InsertionSlot = {
      slotId: `slot_${block.id}_body_0`,
      parentId: block.id,
      branch: 'body',
      index: 0,
      x: centerX,
      yTop: p1.y,
      yBottom: p2.y,
    };
    arrows.push({
      p1,
      p2,
      isDownwardVertical: true,
      hasArrowHead: true,
      slot,
    });
    slots.push(slot);
    diamondY = bodyStartY;
  } else {
    // Body blocks
    const bodyRes = layoutBlockSequence(
      block.body,
      centerX,
      bodyStartY,
      block.id,
      'body'
    );
    nodes.push(...bodyRes.nodes);
    arrows.push(...bodyRes.arrows);
    slots.push(...bodyRes.slots);

    // Arrow from junction to first body block
    const p1 = { x: centerX, y: junctionY + JUNCTION_RADIUS };
    const p2 = { x: centerX, y: bodyStartY };
    const slot0: InsertionSlot = {
      slotId: `slot_${block.id}_body_0`,
      parentId: block.id,
      branch: 'body',
      index: 0,
      x: centerX,
      yTop: p1.y,
      yBottom: p2.y,
    };
    arrows.push({
      p1,
      p2,
      isDownwardVertical: true,
      hasArrowHead: true,
      slot: slot0,
    });
    slots.push(slot0);

    maxBodyRight = Math.max(maxBodyRight, bodyRes.maxX);
    diamondY = bodyRes.exitPoint.y + VERTICAL_GAP;

    // Arrow from last body block to diamond top
    const pLast1 = bodyRes.exitPoint;
    const pLast2 = { x: centerX, y: diamondY };
    const slotLast: InsertionSlot = {
      slotId: `slot_${block.id}_body_${block.body.length}`,
      parentId: block.id,
      branch: 'body',
      index: block.body.length,
      x: centerX,
      yTop: pLast1.y,
      yBottom: pLast2.y,
    };
    arrows.push({
      p1: pLast1,
      p2: pLast2,
      isDownwardVertical: true,
      hasArrowHead: true,
      slot: slotLast,
    });
    slots.push(slotLast);
  }

  // Diamond
  const measuredDiamond = measureNodeText(block.diamond.text, 'diamond');
  const diamondX = centerX - measuredDiamond.width / 2;
  const diamondCenterY = diamondY + measuredDiamond.height / 2;
  const diamondRight = centerX + measuredDiamond.width / 2;
  const diamondBottom = diamondY + measuredDiamond.height;

  nodes.push({
    nodeId: block.diamond.id,
    blockId: block.id,
    type: 'diamond',
    text: block.diamond.text,
    x: diamondX,
    y: diamondY,
    width: measuredDiamond.width,
    height: measuredDiamond.height,
    fontSize: measuredDiamond.fontSize,
    lines: measuredDiamond.lines,
    isDiamond: true,
    canDelete: true,
    canDrag: true,
    deleteButtonPos: {
      x: diamondX + measuredDiamond.width - 12,
      y: diamondY + 12,
    },
  });

  // True branch: leaves diamond right, loops up to junction level, enters junction from right
  const loopX = Math.max(diamondRight, maxBodyRight) + LOOP_BACK_GAP;
  // 1. Horizontal from diamond right to loopX
  arrows.push({
    p1: { x: diamondRight, y: diamondCenterY },
    p2: { x: loopX, y: diamondCenterY },
    isDownwardVertical: false,
    hasArrowHead: false,
    label: { text: 'true', x: diamondRight + 12, y: diamondCenterY - 10 },
  });
  // 2. Vertical up from diamondCenterY to junctionY
  arrows.push({
    p1: { x: loopX, y: diamondCenterY },
    p2: { x: loopX, y: junctionY },
    isDownwardVertical: false,
    hasArrowHead: false,
  });
  // 3. Horizontal left from loopX to junction right
  arrows.push({
    p1: { x: loopX, y: junctionY },
    p2: { x: centerX + JUNCTION_RADIUS, y: junctionY },
    isDownwardVertical: false,
    hasArrowHead: true,
  });

  // False branch label on bottom exit
  // (The arrow itself will be created by the sequence connection, but we can emit a label placeholder)
  const exitPoint: Point = { x: centerX, y: diamondBottom };

  return {
    entryPoint: { x: centerX, y: topY },
    exitPoint,
    minX: Math.min(diamondX, centerX - 100),
    maxX: Math.max(loopX + 20, diamondRight),
    minY: topY,
    maxY: diamondBottom,
    nodes,
    arrows,
    slots,
  };
}

function layoutWhileBlock(
  block: Block & { kind: 'while' },
  centerX: number,
  topY: number
): SubLayoutResult {
  const nodes: LayoutNodeBox[] = [];
  const arrows: ArrowSegment[] = [];
  const slots: InsertionSlot[] = [];

  // Diamond (no preceding junction node)
  const diamondY = topY;
  const measuredDiamond = measureNodeText(block.diamond.text, 'diamond');
  const diamondX = centerX - measuredDiamond.width / 2;
  const diamondCenterY = diamondY + measuredDiamond.height / 2;
  const diamondLeft = centerX - measuredDiamond.width / 2;
  const diamondRight = centerX + measuredDiamond.width / 2;
  const diamondBottom = diamondY + measuredDiamond.height;

  nodes.push({
    nodeId: block.diamond.id,
    blockId: block.id,
    type: 'diamond',
    text: block.diamond.text,
    x: diamondX,
    y: diamondY,
    width: measuredDiamond.width,
    height: measuredDiamond.height,
    fontSize: measuredDiamond.fontSize,
    lines: measuredDiamond.lines,
    isDiamond: true,
    canDelete: true,
    canDrag: true,
    deleteButtonPos: {
      x: diamondX + measuredDiamond.width - 12,
      y: diamondY + 12,
    },
  });

  // True branch: exits diamond bottom, descends down (body blocks), then loops back up to diamond left!
  const bodyStartY = diamondBottom + VERTICAL_GAP;
  let loopBottomY = diamondBottom + 90;
  let minBodyLeft = diamondLeft;
  let maxBodyRight = diamondRight;

  if (block.body.length === 0) {
    // Downward segment where + can be added (generous room for hover)
    const p1 = { x: centerX, y: diamondBottom };
    const p2 = { x: centerX, y: loopBottomY };
    const slot: InsertionSlot = {
      slotId: `slot_${block.id}_body_0`,
      parentId: block.id,
      branch: 'body',
      index: 0,
      x: centerX,
      yTop: p1.y,
      yBottom: p2.y,
    };
    arrows.push({
      p1,
      p2,
      isDownwardVertical: true,
      hasArrowHead: false,
      slot,
      label: { text: 'true', x: centerX + 12, y: diamondBottom + 16 },
    });
    slots.push(slot);
  } else {
    // Body blocks
    const bodyRes = layoutBlockSequence(
      block.body,
      centerX,
      bodyStartY,
      block.id,
      'body'
    );
    nodes.push(...bodyRes.nodes);
    arrows.push(...bodyRes.arrows);
    slots.push(...bodyRes.slots);

    // Arrow from diamond bottom to first body block
    const p1 = { x: centerX, y: diamondBottom };
    const p2 = { x: centerX, y: bodyStartY };
    const slot0: InsertionSlot = {
      slotId: `slot_${block.id}_body_0`,
      parentId: block.id,
      branch: 'body',
      index: 0,
      x: centerX,
      yTop: p1.y,
      yBottom: p2.y,
    };
    arrows.push({
      p1,
      p2,
      isDownwardVertical: true,
      hasArrowHead: true,
      slot: slot0,
      label: { text: 'true', x: centerX + 12, y: diamondBottom + 16 },
    });
    slots.push(slot0);

    minBodyLeft = Math.min(minBodyLeft, bodyRes.minX);
    maxBodyRight = Math.max(maxBodyRight, bodyRes.maxX);
    loopBottomY = bodyRes.exitPoint.y + 40;

    // Arrow from last body block to loopBottomY
    const pExit1 = bodyRes.exitPoint;
    const pExit2 = { x: centerX, y: loopBottomY };
    const slotEnd: InsertionSlot = {
      slotId: `slot_${block.id}_body_${block.body.length}`,
      parentId: block.id,
      branch: 'body',
      index: block.body.length,
      x: centerX,
      yTop: pExit1.y,
      yBottom: pExit2.y,
    };
    arrows.push({
      p1: pExit1,
      p2: pExit2,
      isDownwardVertical: true,
      hasArrowHead: false,
      slot: slotEnd,
    });
    slots.push(slotEnd);
  }

  // True loop-back path to diamond left vertex:
  // 1. Horizontal left from centerX to loopLeftX
  const loopLeftX = minBodyLeft - LOOP_BACK_GAP;
  arrows.push({
    p1: { x: centerX, y: loopBottomY },
    p2: { x: loopLeftX, y: loopBottomY },
    isDownwardVertical: false,
    hasArrowHead: false,
  });
  // 2. Vertical UP from loopBottomY to diamondCenterY
  arrows.push({
    p1: { x: loopLeftX, y: loopBottomY },
    p2: { x: loopLeftX, y: diamondCenterY },
    isDownwardVertical: false,
    hasArrowHead: false,
  });
  // 3. Horizontal right into diamond left vertex
  arrows.push({
    p1: { x: loopLeftX, y: diamondCenterY },
    p2: { x: diamondLeft, y: diamondCenterY },
    isDownwardVertical: false,
    hasArrowHead: true,
  });

  // False branch: exits diamond right, goes right, descends past loopBottomY, and rejoins centerX!
  const falseRightX = maxBodyRight + LOOP_BACK_GAP;
  const exitY = loopBottomY + 36;

  // 1. Horizontal from diamond right to falseRightX
  arrows.push({
    p1: { x: diamondRight, y: diamondCenterY },
    p2: { x: falseRightX, y: diamondCenterY },
    isDownwardVertical: false,
    hasArrowHead: false,
    label: { text: 'false', x: diamondRight + 12, y: diamondCenterY - 10 },
  });
  // 2. Vertical down to exitY
  arrows.push({
    p1: { x: falseRightX, y: diamondCenterY },
    p2: { x: falseRightX, y: exitY },
    isDownwardVertical: false,
    hasArrowHead: false,
  });
  // 3. Horizontal back left to centerX
  arrows.push({
    p1: { x: falseRightX, y: exitY },
    p2: { x: centerX, y: exitY },
    isDownwardVertical: false,
    hasArrowHead: false,
  });

  return {
    entryPoint: { x: centerX, y: topY },
    exitPoint: { x: centerX, y: exitY },
    minX: loopLeftX - 10,
    maxX: falseRightX + 20,
    minY: topY,
    maxY: exitY,
    nodes,
    arrows,
    slots,
  };
}
