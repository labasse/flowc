/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Block, InsertionSlot } from './types';

let nextIdCounter = 1;
export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${nextIdCounter++}_${Math.random().toString(36).substring(2, 6)}`;
}

export function createInitialBlocks(): Block[] {
  return [
    {
      kind: 'simple',
      id: generateId('block_start'),
      node: {
        id: generateId('start'),
        type: 'terminal',
        terminalKind: 'start',
        text: 'start',
      },
    },
    {
      kind: 'simple',
      id: generateId('block_end'),
      node: {
        id: generateId('end'),
        type: 'terminal',
        terminalKind: 'end',
        text: 'end',
      },
    },
  ];
}

export function createNewBlock(
  type: 'process' | 'io' | 'if' | 'dowhile' | 'while'
): { block: Block; focusNodeId: string } {
  switch (type) {
    case 'process': {
      const nodeId = generateId('process');
      return {
        block: {
          kind: 'simple',
          id: generateId('block_proc'),
          node: {
            id: nodeId,
            type: 'process',
            text: 'Action',
          },
        },
        focusNodeId: nodeId,
      };
    }
    case 'io': {
      const nodeId = generateId('io');
      return {
        block: {
          kind: 'simple',
          id: generateId('block_io'),
          node: {
            id: nodeId,
            type: 'io',
            text: 'Input/Output',
          },
        },
        focusNodeId: nodeId,
      };
    }
    case 'if': {
      const diamondId = generateId('if_cond');
      return {
        block: {
          kind: 'if',
          id: generateId('block_if'),
          diamond: {
            id: diamondId,
            type: 'diamond',
            text: 'Condition',
          },
          junction: {
            id: generateId('if_junc'),
            type: 'junction',
            text: '',
          },
          trueBranch: [],
          falseBranch: [],
        },
        focusNodeId: diamondId,
      };
    }
    case 'dowhile': {
      const diamondId = generateId('dowhile_cond');
      return {
        block: {
          kind: 'dowhile',
          id: generateId('block_dowhile'),
          junction: {
            id: generateId('dowhile_junc'),
            type: 'junction',
            text: '',
          },
          body: [],
          diamond: {
            id: diamondId,
            type: 'diamond',
            text: 'Condition',
          },
        },
        focusNodeId: diamondId,
      };
    }
    case 'while': {
      const diamondId = generateId('while_cond');
      return {
        block: {
          kind: 'while',
          id: generateId('block_while'),
          diamond: {
            id: diamondId,
            type: 'diamond',
            text: 'Condition',
          },
          body: [],
        },
        focusNodeId: diamondId,
      };
    }
  }
}

/**
 * Inserts a block into the tree according to the insertion slot
 */
export function insertBlockAtSlot(
  blocks: Block[],
  newBlock: Block,
  slot: InsertionSlot
): Block[] {
  // Deep clone
  const tree = JSON.parse(JSON.stringify(blocks)) as Block[];

  if (slot.parentId === null || slot.branch === 'root') {
    // Root level insertion
    const idx = Math.min(Math.max(1, slot.index), tree.length - 1);
    tree.splice(idx, 0, newBlock);
    return tree;
  }

  // Find parent block
  function insertInBlock(b: Block): boolean {
    if (b.id === slot.parentId) {
      if (b.kind === 'if') {
        if (slot.branch === 'true') {
          b.trueBranch.splice(slot.index, 0, newBlock);
          return true;
        } else if (slot.branch === 'false') {
          b.falseBranch.splice(slot.index, 0, newBlock);
          return true;
        }
      } else if (b.kind === 'dowhile' && slot.branch === 'body') {
        b.body.splice(slot.index, 0, newBlock);
        return true;
      } else if (b.kind === 'while' && slot.branch === 'body') {
        b.body.splice(slot.index, 0, newBlock);
        return true;
      }
    }

    // Traverse recursively
    if (b.kind === 'if') {
      for (const child of b.trueBranch) {
        if (insertInBlock(child)) return true;
      }
      for (const child of b.falseBranch) {
        if (insertInBlock(child)) return true;
      }
    } else if (b.kind === 'dowhile') {
      for (const child of b.body) {
        if (insertInBlock(child)) return true;
      }
    } else if (b.kind === 'while') {
      for (const child of b.body) {
        if (insertInBlock(child)) return true;
      }
    }

    return false;
  }

  for (const rootBlock of tree) {
    if (insertInBlock(rootBlock)) break;
  }

  return tree;
}

/**
 * Deletes a motif or replaces it according to the specifications:
 * - If process or io: removed from parent sequence
 * - If while or do...while diamond: replaced by loop body nodes
 * - If if diamond: replaced by trueBranch followed by falseBranch nodes
 */
export function deleteNodeFromTree(
  blocks: Block[],
  targetNodeId: string
): Block[] {
  const tree = JSON.parse(JSON.stringify(blocks)) as Block[];

  function processList(list: Block[]): Block[] {
    const result: Block[] = [];
    for (const b of list) {
      if (b.kind === 'simple') {
        if (b.node.id === targetNodeId) {
          // Skip if process or io (delete)
          // Terminal nodes cannot be deleted
          if (b.node.type === 'terminal') {
            result.push(b);
          }
          continue;
        }
        result.push(b);
      } else if (b.kind === 'if') {
        if (b.diamond.id === targetNodeId) {
          // If diamond deleted: replaced by true branch followed by false branch!
          result.push(...processList(b.trueBranch), ...processList(b.falseBranch));
          continue;
        }
        b.trueBranch = processList(b.trueBranch);
        b.falseBranch = processList(b.falseBranch);
        result.push(b);
      } else if (b.kind === 'dowhile') {
        if (b.diamond.id === targetNodeId) {
          // Do...While diamond deleted: replaced by loop body!
          result.push(...processList(b.body));
          continue;
        }
        b.body = processList(b.body);
        result.push(b);
      } else if (b.kind === 'while') {
        if (b.diamond.id === targetNodeId) {
          // While diamond deleted: replaced by true branch loop body!
          result.push(...processList(b.body));
          continue;
        }
        b.body = processList(b.body);
        result.push(b);
      }
    }
    return result;
  }

  return processList(tree);
}

/**
 * Finds and removes a block by blockId, returning the removed block and new tree
 */
export function removeBlockById(
  blocks: Block[],
  targetBlockId: string
): { block: Block | null; newBlocks: Block[] } {
  let removed: Block | null = null;
  const tree = JSON.parse(JSON.stringify(blocks)) as Block[];

  function filterList(list: Block[]): Block[] {
    const res: Block[] = [];
    for (const b of list) {
      if (b.id === targetBlockId) {
        removed = b;
        continue;
      }
      if (b.kind === 'if') {
        b.trueBranch = filterList(b.trueBranch);
        b.falseBranch = filterList(b.falseBranch);
      } else if (b.kind === 'dowhile') {
        b.body = filterList(b.body);
      } else if (b.kind === 'while') {
        b.body = filterList(b.body);
      }
      res.push(b);
    }
    return res;
  }

  const newBlocks = filterList(tree);
  return { block: removed, newBlocks };
}

/**
 * Updates text of a node anywhere in the tree
 */
export function updateNodeText(
  blocks: Block[],
  nodeId: string,
  newText: string
): Block[] {
  const tree = JSON.parse(JSON.stringify(blocks)) as Block[];

  function updateInList(list: Block[]): boolean {
    for (const b of list) {
      if (b.kind === 'simple' && b.node.id === nodeId) {
        b.node.text = newText;
        return true;
      }
      if (b.kind === 'if') {
        if (b.diamond.id === nodeId) {
          b.diamond.text = newText;
          return true;
        }
        if (updateInList(b.trueBranch)) return true;
        if (updateInList(b.falseBranch)) return true;
      }
      if (b.kind === 'dowhile') {
        if (b.diamond.id === nodeId) {
          b.diamond.text = newText;
          return true;
        }
        if (updateInList(b.body)) return true;
      }
      if (b.kind === 'while') {
        if (b.diamond.id === nodeId) {
          b.diamond.text = newText;
          return true;
        }
        if (updateInList(b.body)) return true;
      }
    }
    return false;
  }

  updateInList(tree);
  return tree;
}

/**
 * Extracts a map of nodeId -> label text for metadata serialization
 */
export function extractNodeLabels(blocks: Block[]): Record<string, string> {
  const map: Record<string, string> = {};

  function traverse(list: Block[]) {
    for (const b of list) {
      if (b.kind === 'simple') {
        map[b.node.id] = b.node.text;
      } else if (b.kind === 'if') {
        map[b.diamond.id] = b.diamond.text;
        traverse(b.trueBranch);
        traverse(b.falseBranch);
      } else if (b.kind === 'dowhile') {
        map[b.diamond.id] = b.diamond.text;
        traverse(b.body);
      } else if (b.kind === 'while') {
        map[b.diamond.id] = b.diamond.text;
        traverse(b.body);
      }
    }
  }

  traverse(blocks);
  return map;
}

/**
 * Checks if candidate blockId is contained inside parentBlockId (to prevent dropping into itself)
 */
export function isDescendantBlock(
  parentBlock: Block,
  candidateBlockId: string
): boolean {
  if (parentBlock.id === candidateBlockId) return true;

  if (parentBlock.kind === 'if') {
    for (const c of parentBlock.trueBranch) {
      if (isDescendantBlock(c, candidateBlockId)) return true;
    }
    for (const c of parentBlock.falseBranch) {
      if (isDescendantBlock(c, candidateBlockId)) return true;
    }
  } else if (parentBlock.kind === 'dowhile') {
    for (const c of parentBlock.body) {
      if (isDescendantBlock(c, candidateBlockId)) return true;
    }
  } else if (parentBlock.kind === 'while') {
    for (const c of parentBlock.body) {
      if (isDescendantBlock(c, candidateBlockId)) return true;
    }
  }

  return false;
}
