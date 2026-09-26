/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BASE_FONT_SIZE,
  MAX_NODE_WIDTH,
  MIN_FONT_SIZE,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
} from './constants';
import { NodeType } from './types';

export interface MeasuredTextNode {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  lines: string[];
}

let canvasCtx: CanvasRenderingContext2D | null = null;

function getContext(): CanvasRenderingContext2D | null {
  if (!canvasCtx && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvasCtx = canvas.getContext('2d');
  }
  return canvasCtx;
}

function measureLineWidth(text: string, fontSize: number): number {
  const ctx = getContext();
  if (!ctx) {
    return text.length * fontSize * 0.6;
  }
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  return ctx.measureText(text).width;
}

export function measureNodeText(
  rawText: string,
  type: NodeType
): MeasuredTextNode {
  if (type === 'junction') {
    return {
      width: 12,
      height: 12,
      fontSize: 0,
      lineHeight: 0,
      lines: [],
    };
  }

  const text = rawText || ' ';
  const lines = text.split('\n');

  // 1. Measure at BASE_FONT_SIZE
  let maxLineWidth = 0;
  for (const line of lines) {
    const w = measureLineWidth(line, BASE_FONT_SIZE);
    if (w > maxLineWidth) maxLineWidth = w;
  }

  // Determine shape-specific geometry requirements
  if (type === 'diamond') {
    // Rhombus: inner bounding box is restricted by diamond slopes
    const horizPadding = 44;
    const rhombusFactor = 1.42;
    const requiredWidth = maxLineWidth * rhombusFactor + horizPadding;

    if (requiredWidth <= MAX_NODE_WIDTH) {
      const width = Math.max(MIN_NODE_WIDTH + 24, Math.round(requiredWidth));
      const fontSize = BASE_FONT_SIZE;
      const lineHeight = Math.round(fontSize * 1.35);
      const textBlockHeight = lines.length * lineHeight;
      const height = Math.max(
        MIN_NODE_HEIGHT + 24,
        Math.round(textBlockHeight * 1.5 + 32)
      );
      return { width, height, fontSize, lineHeight, lines };
    } else {
      // Shape width clamped at MAX_NODE_WIDTH (500px)
      const width = MAX_NODE_WIDTH;
      const allowedTextWidth = Math.max(50, (width - horizPadding) / rhombusFactor);
      const scale = allowedTextWidth / maxLineWidth;
      const fontSize = Math.max(
        MIN_FONT_SIZE,
        Math.floor(BASE_FONT_SIZE * scale)
      );
      const lineHeight = Math.round(fontSize * 1.35);
      const textBlockHeight = lines.length * lineHeight;
      const height = Math.max(
        MIN_NODE_HEIGHT + 24,
        Math.round(textBlockHeight * 1.5 + 32)
      );
      return { width, height, fontSize, lineHeight, lines };
    }
  }

  if (type === 'io') {
    // Parallelogram with horizontal top/bottom and slash slant
    const slantOffset = 20;
    const horizPadding = 36 + slantOffset * 2;
    const requiredWidth = maxLineWidth + horizPadding;

    if (requiredWidth <= MAX_NODE_WIDTH) {
      const width = Math.max(MIN_NODE_WIDTH + 16, Math.round(requiredWidth));
      const fontSize = BASE_FONT_SIZE;
      const lineHeight = Math.round(fontSize * 1.35);
      const height = Math.max(
        MIN_NODE_HEIGHT,
        Math.round(lines.length * lineHeight + 26)
      );
      return { width, height, fontSize, lineHeight, lines };
    } else {
      const width = MAX_NODE_WIDTH;
      const allowedTextWidth = width - horizPadding;
      const scale = allowedTextWidth / maxLineWidth;
      const fontSize = Math.max(
        MIN_FONT_SIZE,
        Math.floor(BASE_FONT_SIZE * scale)
      );
      const lineHeight = Math.round(fontSize * 1.35);
      const height = Math.max(
        MIN_NODE_HEIGHT,
        Math.round(lines.length * lineHeight + 26)
      );
      return { width, height, fontSize, lineHeight, lines };
    }
  }

  // Standard process (rectangle) and terminal (pill)
  const horizPadding = 36;
  const requiredWidth = maxLineWidth + horizPadding;

  if (requiredWidth <= MAX_NODE_WIDTH) {
    const width = Math.max(MIN_NODE_WIDTH, Math.round(requiredWidth));
    const fontSize = BASE_FONT_SIZE;
    const lineHeight = Math.round(fontSize * 1.35);
    const height = Math.max(
      MIN_NODE_HEIGHT,
      Math.round(lines.length * lineHeight + 24)
    );
    return { width, height, fontSize, lineHeight, lines };
  } else {
    const width = MAX_NODE_WIDTH;
    const allowedTextWidth = width - horizPadding;
    const scale = allowedTextWidth / maxLineWidth;
    const fontSize = Math.max(
      MIN_FONT_SIZE,
      Math.floor(BASE_FONT_SIZE * scale)
    );
    const lineHeight = Math.round(fontSize * 1.35);
    const height = Math.max(
      MIN_NODE_HEIGHT,
      Math.round(lines.length * lineHeight + 24)
    );
    return { width, height, fontSize, lineHeight, lines };
  }
}
