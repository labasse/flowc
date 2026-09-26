/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Max width before font size reduction begins, per user specification:
// "Au delà de 500px de large (constante modifiable dans le code), la taille du texte est réduite pour tenir dans la forme de manière à n'être jamais tronquée."
export const MAX_NODE_WIDTH = 500;

export const MIN_NODE_WIDTH = 130;
export const MIN_NODE_HEIGHT = 48;
export const BASE_FONT_SIZE = 14;
export const MIN_FONT_SIZE = 8;

export const VERTICAL_GAP = 56;
export const BRANCH_HORIZONTAL_GAP = 64;
export const LOOP_BACK_GAP = 52;
export const JUNCTION_RADIUS = 5;

export const STORAGE_KEY = 'flow_c_diagram_v1';
export const DEFAULT_FLOW_TITLE = 'Empty flow';

// Base URL for opening new diagrams in a separate browser tab
export const APP_BASE_URL: string =
  typeof window !== 'undefined'
    ? window.location.origin + window.location.pathname
    : '';

