/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  APP_BASE_URL,
  DEFAULT_FLOW_TITLE,
  JUNCTION_RADIUS,
  STORAGE_KEY,
} from './constants';
import { computeFlowLayout } from './layout';
import {
  extractMetadataFromPNG,
  injectMetadataIntoPNG,
  slugify,
} from './png-metadata';
import {
  createInitialBlocks,
  createNewBlock,
  deleteNodeFromTree,
  extractNodeLabels,
  insertBlockAtSlot,
  isDescendantBlock,
  removeBlockById,
  updateNodeText,
} from './tree-ops';
import {
  Block,
  DiagramSnapshot,
  FlowLayout,
  InsertionSlot,
  LayoutNodeBox,
  PNGMetadata,
  Point,
} from './types';

export class FlowChartApp {
  private container: HTMLElement;
  private title: string = DEFAULT_FLOW_TITLE;
  private blocks: Block[] = [];
  private history: DiagramSnapshot[] = [];
  private historyIndex: number = -1;

  // Viewport
  private zoom: number = 1;
  private panX: number = 0;
  private panY: number = 0;
  private isPanning: boolean = false;
  private panStart: Point = { x: 0, y: 0 };
  private initialPan: Point = { x: 0, y: 0 };

  // Layout & Interaction
  private layout: FlowLayout = {
    nodes: [],
    arrows: [],
    slots: [],
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
  };

  private hoveredSlot: InsertionSlot | null = null;
  private activeMenuSlot: InsertionSlot | null = null;
  private hoveredNodeId: string | null = null;

  // Drag & Drop
  private pendingDrag: {
    box: LayoutNodeBox;
    startX: number;
    startY: number;
  } | null = null;
  private draggedBlockId: string | null = null;
  private draggedNodeBox: LayoutNodeBox | null = null;
  private dragMouseStart: Point = { x: 0, y: 0 };
  private isDragging: boolean = false;
  private dragGhostPos: Point = { x: 0, y: 0 };
  private dropTargetSlot: InsertionSlot | null = null;

  // Editing
  private editingNodeId: string | null = null;
  private isEditingTitle: boolean = false;

  // DOM Elements
  private svgEl!: SVGSVGElement;
  private canvasWrapper!: HTMLElement;
  private plusButtonEl!: HTMLElement;
  private motifMenuEl!: HTMLElement;
  private editorOverlayEl!: HTMLElement;
  private titleInputEl!: HTMLInputElement;
  private titleDisplayEl!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private zoomDisplayEl!: HTMLElement;
  private toastEl!: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init() {
    this.buildDOM();
    this.loadState();
    this.attachEventListeners();
    this.render();
    this.centerDiagram();
  }

  private buildDOM() {
    this.container.innerHTML = `
      <div class="flow-app-root">
        <!-- Top Toolbar -->
        <header class="flow-header">
          <div class="flow-header-left">
            <div class="flow-logo" title="flow-c: C Flowchart Editor">
              <span class="flow-logo-icon">⚡</span>
              <span class="flow-logo-text">flow-c</span>
            </div>
            <div class="flow-title-container">
              <span class="flow-title-display" id="flow-title-display" title="Double click to edit diagram title">Empty flow</span>
              <input type="text" class="flow-title-input" id="flow-title-input" style="display: none;" />
              <button class="flow-btn-icon-subtle" id="flow-title-edit-btn" title="Edit diagram title">✎</button>
            </div>
          </div>

          <div class="flow-header-center">
            <div class="flow-btn-group">
              <button class="flow-btn" id="btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo" role='button' disabled>
                <span class="btn-icon">↶</span>
              </button>
              <button class="flow-btn" id="btn-redo" title="Redo (Ctrl+Y)" aria-label="Redo" role='button' disabled>
                <span class="btn-icon">↷</span>
              </button>
            </div>

            <div class="flow-btn-group">
              <button class="flow-btn-icon" id="btn-zoom-out" title="Zoom Out (-)">−</button>
              <span class="flow-zoom-label" id="zoom-label">100%</span>
              <button class="flow-btn-icon" id="btn-zoom-in" title="Zoom In (+)">+</button>
              <button class="flow-btn" id="btn-zoom-fit" title="Zoom to Fit (F)">Fit</button>
              <button class="flow-btn" id="btn-zoom-reset" title="Reset Zoom (0)">100%</button>
            </div>
          </div>

          <div class="flow-header-right">
            <a class="flow-btn" id="btn-new-flow" href="${APP_BASE_URL}?new=1" target="_blank" rel="noopener noreferrer" title="Open new flowchart in a new tab">
              <span class="btn-icon">✦</span> New
            </a>
            <button class="flow-btn" id="btn-import" title="Open flowchart">
              <span class="btn-icon">📂</span> Open
            </button>
            <input type="file" id="file-import-input" accept=".png,.json" style="display: none;" />
            <button class="flow-btn flow-btn-primary" id="btn-export-png" title="Download Image with data">
              <span class="btn-icon">⬇</span> Save
            </button>
            <button class="flow-btn-icon" id="btn-help" title="Flowchart Guide & Shortcuts">?</button>
          </div>
        </header>

        <!-- Canvas Area -->
        <main class="flow-canvas-wrapper" id="canvas-wrapper">
          <svg class="flow-svg-canvas" id="flow-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <!-- Arrowhead markers -->
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#334155" />
              </marker>
              <marker id="arrow-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#2563eb" />
              </marker>
              <!-- Drop shadow filter -->
              <filter id="node-shadow" x="-8%" y="-8%" width="120%" height="124%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.08" />
              </filter>
              <!-- Grid pattern -->
              <pattern id="dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="#cbd5e1" />
              </pattern>
            </defs>
            <rect id="bg-grid-rect" width="100%" height="100%" fill="url(#dot-grid)" />
            <g id="viewport-group"></g>
          </svg>

          <!-- Interactive Hover Plus Button on downward arrows -->
          <div class="flow-plus-btn" id="flow-plus-btn" style="display: none;" title="Insert block here">
            <span>+</span>
          </div>

          <!-- Add Motif Dropdown Popover -->
          <div class="flow-motif-menu" id="flow-motif-menu" style="display: none;">
            <div class="flow-menu-header">Add flowchart pattern</div>
            <button class="flow-menu-item" data-motif="process">
              <span class="motif-badge badge-process">▭</span>
              <div class="motif-text">
                <div class="motif-title">Process</div>
                <div class="motif-desc">Rectangle (Action statement)</div>
              </div>
            </button>
            <button class="flow-menu-item" data-motif="io">
              <span class="motif-badge badge-io">▱</span>
              <div class="motif-text">
                <div class="motif-title">Input / Output</div>
                <div class="motif-desc">Parallelogram (I/O, scanf, printf)</div>
              </div>
            </button>
            <button class="flow-menu-item" data-motif="if">
              <span class="motif-badge badge-diamond">◇</span>
              <div class="motif-text">
                <div class="motif-title">If Condition</div>
                <div class="motif-desc">Diamond condition with true & false branches</div>
              </div>
            </button>
            <button class="flow-menu-item" data-motif="dowhile">
              <span class="motif-badge badge-loop">↻</span>
              <div class="motif-text">
                <div class="motif-title">Do...While Loop</div>
                <div class="motif-desc">Junction, body, condition with upward loop</div>
              </div>
            </button>
            <button class="flow-menu-item" data-motif="while">
              <span class="motif-badge badge-loop">↺</span>
              <div class="motif-text">
                <div class="motif-title">While Loop</div>
                <div class="motif-desc">Condition test at entry, loop body below</div>
              </div>
            </button>
          </div>

          <!-- In-place text editor -->
          <div class="flow-text-editor-container" id="flow-editor-overlay" style="display: none;">
            <textarea id="flow-node-textarea" class="flow-node-textarea" spellcheck="false"></textarea>
          </div>

          <!-- Drag Ghost Preview -->
          <div class="flow-drag-ghost" id="flow-drag-ghost" style="display: none;"></div>

          <!-- Toast Notification -->
          <div class="flow-toast" id="flow-toast" style="display: none;"></div>
        </main>

        <!-- Help Modal -->
        <div class="flow-modal-backdrop" id="help-modal" style="display: none;">
          <div class="flow-modal">
            <div class="flow-modal-header">
              <h3>flow-c Guide & Shortcuts</h3>
              <button class="flow-btn-icon-subtle" id="help-close-btn">✕</button>
            </div>
            <div class="flow-modal-body">
              <h4>Patterns (Motifs)</h4>
              <ul>
                <li><strong>Process:</strong> Rectangle with default text "Action".</li>
                <li><strong>Input / Output:</strong> Parallelogram with slanted sides (slash direction).</li>
                <li><strong>If Condition:</strong> Diamond with true branch (down to junction) and false branch (elbow to junction).</li>
                <li><strong>Do...While Loop:</strong> Top junction, loop body, diamond condition (true loops up, false exits).</li>
                <li><strong>While Loop:</strong> Top junction, diamond condition (true descends into body & loops to left vertex, false exits right).</li>
              </ul>
              <h4>Text Auto-Sizing</h4>
              <p>Double-click any node or the diagram title to edit. The shape automatically enlarges up to <strong>500px</strong>. Beyond 500px, font size reduces so text is never truncated.</p>
              <h4>Shortcuts & Controls</h4>
              <ul>
                <li><strong>Add Pattern:</strong> Hover over any downward vertical arrow segment and click the <code>+</code> button.</li>
                <li><strong>Reorder (Drag & Drop):</strong> Drag process, IO, or diamond shapes to move motifs between nodes.</li>
                <li><strong>Delete Motif:</strong> Hover over a process, IO, or diamond shape and click the red <code>✕</code> cross.</li>
                <li><strong>Undo / Redo:</strong> <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> (or <kbd>Cmd+Z</kbd> / <kbd>Cmd+Shift+Z</kbd>).</li>
                <li><strong>Canvas Navigation:</strong> Drag canvas background to pan; mouse wheel to zoom.</li>
                <li><strong>Open:</strong> Loads a previously saved flowchart.</li>
                <li><strong>Save:</strong> Generates a transparent PNG containing all the flowchart.</li>
              </ul>
            </div>
            <div class="flow-modal-footer">
              <button class="flow-btn flow-btn-primary" id="help-ok-btn">Got it</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Cache elements
    this.canvasWrapper = this.container.querySelector('#canvas-wrapper')!;
    this.svgEl = this.container.querySelector('#flow-svg')!;
    this.plusButtonEl = this.container.querySelector('#flow-plus-btn')!;
    this.motifMenuEl = this.container.querySelector('#flow-motif-menu')!;
    this.editorOverlayEl = this.container.querySelector(
      '#flow-editor-overlay'
    )!;
    this.titleInputEl = this.container.querySelector('#flow-title-input')!;
    this.titleDisplayEl = this.container.querySelector('#flow-title-display')!;
    this.undoBtn = this.container.querySelector('#btn-undo')!;
    this.redoBtn = this.container.querySelector('#btn-redo')!;
    this.zoomDisplayEl = this.container.querySelector('#zoom-label')!;
    this.toastEl = this.container.querySelector('#flow-toast')!;
  }

  private loadState() {
    // If opened with ?new=1, initialize a fresh empty flow
    if (
      typeof window !== 'undefined' &&
      window.location.search.includes('new=1')
    ) {
      this.resetToDefault(false);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.title && Array.isArray(parsed.blocks)) {
          this.title = parsed.title;
          this.blocks = parsed.blocks;
          this.history = parsed.history || [
            { title: this.title, blocks: this.blocks },
          ];
          this.historyIndex =
            typeof parsed.historyIndex === 'number'
              ? parsed.historyIndex
              : this.history.length - 1;
          this.updateTitleDisplay();
          this.updateUndoRedoButtons();
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to restore flowchart from localStorage', e);
    }

    // Default state: Empty flow with start & end
    this.resetToDefault(false);
  }

  private saveState() {
    try {
      const payload = {
        title: this.title,
        blocks: this.blocks,
        history: this.history,
        historyIndex: this.historyIndex,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save to localStorage', e);
    }
  }

  private recordSnapshot(actionName?: string) {
    const snap: DiagramSnapshot = {
      title: this.title,
      blocks: JSON.parse(JSON.stringify(this.blocks)),
    };

    // If we're not at head, truncate forward history
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(snap);
    // Limit history stack size to 80
    if (this.history.length > 80) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;

    this.updateUndoRedoButtons();
    this.saveState();
  }

  private undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const snap = this.history[this.historyIndex];
      this.title = snap.title;
      this.blocks = JSON.parse(JSON.stringify(snap.blocks));
      this.updateTitleDisplay();
      this.updateUndoRedoButtons();
      this.saveState();
      this.render();
      this.showToast('Undo');
    }
  }

  private redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const snap = this.history[this.historyIndex];
      this.title = snap.title;
      this.blocks = JSON.parse(JSON.stringify(snap.blocks));
      this.updateTitleDisplay();
      this.updateUndoRedoButtons();
      this.saveState();
      this.render();
      this.showToast('Redo');
    }
  }

  private resetToDefault(confirmPrompt: boolean = true) {
    if (
      confirmPrompt &&
      this.blocks.length > 2 &&
      !window.confirm('Reset flowchart to initial start and end nodes?')
    ) {
      return;
    }
    this.title = DEFAULT_FLOW_TITLE;
    this.blocks = createInitialBlocks();
    this.history = [{ title: this.title, blocks: this.blocks }];
    this.historyIndex = 0;
    this.updateTitleDisplay();
    this.updateUndoRedoButtons();
    this.saveState();
    this.render();
    this.centerDiagram();
    this.showToast('Created empty flow');
  }

  private updateTitleDisplay() {
    this.titleDisplayEl.textContent = this.title;
    this.titleInputEl.value = this.title;
  }

  private updateUndoRedoButtons() {
    this.undoBtn.disabled = this.historyIndex <= 0;
    this.redoBtn.disabled = this.historyIndex >= this.history.length - 1;
  }

  private showToast(msg: string) {
    this.toastEl.textContent = msg;
    this.toastEl.style.display = 'block';
    this.toastEl.classList.remove('fade-out');
    clearTimeout((this.toastEl as any)._timeout);
    (this.toastEl as any)._timeout = setTimeout(() => {
      this.toastEl.classList.add('fade-out');
      setTimeout(() => {
        this.toastEl.style.display = 'none';
      }, 300);
    }, 1800);
  }

  // Viewport transforms
  private screenToWorld(sx: number, sy: number): Point {
    const rect = this.svgEl.getBoundingClientRect();
    const cx = sx - rect.left;
    const cy = sy - rect.top;
    return {
      x: (cx - this.panX) / this.zoom,
      y: (cy - this.panY) / this.zoom,
    };
  }

  private worldToCanvas(wx: number, wy: number): Point {
    return {
      x: this.panX + wx * this.zoom,
      y: this.panY + wy * this.zoom,
    };
  }

  private worldToScreen(wx: number, wy: number): Point {
    const rect = this.svgEl.getBoundingClientRect();
    return {
      x: rect.left + this.panX + wx * this.zoom,
      y: rect.top + this.panY + wy * this.zoom,
    };
  }

  private setZoom(newZoom: number, focalScreenX?: number, focalScreenY?: number) {
    const clampedZoom = Math.min(2.5, Math.max(0.3, newZoom));
    if (focalScreenX !== undefined && focalScreenY !== undefined) {
      const rect = this.svgEl.getBoundingClientRect();
      const fx = focalScreenX - rect.left;
      const fy = focalScreenY - rect.top;
      const wx = (fx - this.panX) / this.zoom;
      const wy = (fy - this.panY) / this.zoom;
      this.zoom = clampedZoom;
      this.panX = fx - wx * this.zoom;
      this.panY = fy - wy * this.zoom;
    } else {
      this.zoom = clampedZoom;
    }
    this.zoomDisplayEl.textContent = `${Math.round(this.zoom * 100)}%`;
    this.applyTransform();
  }

  private centerDiagram() {
    this.layout = computeFlowLayout(this.blocks);
    const rect = this.canvasWrapper.getBoundingClientRect();
    const b = this.layout.bounds;

    const availWidth = rect.width || 800;
    const availHeight = rect.height || 600;

    const contentWidth = b.width + 120;
    const contentHeight = b.height + 140;

    const scale = Math.min(
      1.1,
      Math.max(0.4, Math.min(availWidth / contentWidth, availHeight / contentHeight))
    );

    this.zoom = scale;
    const centerX = b.minX + b.width / 2;
    const centerY = b.minY + b.height / 2;

    this.panX = availWidth / 2 - centerX * this.zoom;
    this.panY = Math.max(30, availHeight / 2 - centerY * this.zoom);

    this.zoomDisplayEl.textContent = `${Math.round(this.zoom * 100)}%`;
    this.applyTransform();
  }

  private applyTransform() {
    const viewportGroup = this.svgEl.querySelector('#viewport-group');
    if (viewportGroup) {
      viewportGroup.setAttribute(
        'transform',
        `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`
      );
    }
    // Update active motif menu if visible
    if (this.motifMenuEl.style.display !== 'none' && this.activeMenuSlot) {
      this.positionMotifMenu(this.activeMenuSlot);
    }
  }

  // Event Listeners
  private attachEventListeners() {
    // Window resize
    window.addEventListener('resize', () => this.applyTransform());

    // Canvas panning & zooming
    this.canvasWrapper.addEventListener('mousedown', (e) => {
      // If clicking directly on SVG canvas or background grid
      const target = e.target as Element;
      if (
        target === this.svgEl ||
        target?.id === 'bg-grid-rect' ||
        target?.classList.contains('flow-svg-canvas') ||
        e.button === 1 // middle click
      ) {
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.initialPan = { x: this.panX, y: this.panY };
        this.canvasWrapper.style.cursor = 'grabbing';
        this.closeMotifMenu();
        e.preventDefault();
      }
    });

    // Commit node text edit on click outside
    document.addEventListener(
      'mousedown',
      (e) => {
        if (this.editingNodeId) {
          const target = e.target as HTMLElement;
          if (!this.editorOverlayEl.contains(target)) {
            this.commitNodeTextEdit();
          }
        }
      },
      true
    );

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = this.initialPan.x + (e.clientX - this.panStart.x);
        this.panY = this.initialPan.y + (e.clientY - this.panStart.y);
        this.applyTransform();
        return;
      }

      // Check if pending drag crosses threshold
      if (this.pendingDrag && !this.isDragging) {
        const dist = Math.hypot(
          e.clientX - this.pendingDrag.startX,
          e.clientY - this.pendingDrag.startY
        );
        if (dist > 6) {
          this.startNodeDrag(this.pendingDrag.box, e);
        }
      }

      if (this.isDragging) {
        this.handleNodeDragMove(e);
        return;
      }

      // Detect hover over downward vertical arrow segments for "+" button
      if (this.motifMenuEl.style.display === 'none' && !this.editingNodeId) {
        this.handleArrowHover(e);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.canvasWrapper.style.cursor = 'default';
      }
      if (this.isDragging) {
        this.handleNodeDragEnd(e);
      }
      this.pendingDrag = null;
    });

    // Mouse wheel zoom
    this.canvasWrapper.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.12 : 0.89;
        this.setZoom(this.zoom * delta, e.clientX, e.clientY);
      },
      { passive: false }
    );

    // Title editing
    this.titleDisplayEl.addEventListener('dblclick', () =>
      this.startTitleEdit()
    );
    this.container
      .querySelector('#flow-title-edit-btn')
      ?.addEventListener('click', () => this.startTitleEdit());

    this.titleInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.commitTitleEdit();
      if (e.key === 'Escape') this.cancelTitleEdit();
    });
    this.titleInputEl.addEventListener('blur', () => this.commitTitleEdit());

    // Toolbar actions
    this.undoBtn.addEventListener('click', () => this.undo());
    this.redoBtn.addEventListener('click', () => this.redo());
    this.container
      .querySelector('#btn-zoom-in')
      ?.addEventListener('click', () =>
        this.setZoom(
          this.zoom * 1.2,
          window.innerWidth / 2,
          window.innerHeight / 2
        )
      );
    this.container
      .querySelector('#btn-zoom-out')
      ?.addEventListener('click', () =>
        this.setZoom(
          this.zoom * 0.83,
          window.innerWidth / 2,
          window.innerHeight / 2
        )
      );
    this.container
      .querySelector('#btn-zoom-fit')
      ?.addEventListener('click', () => this.centerDiagram());
    this.container
      .querySelector('#btn-zoom-reset')
      ?.addEventListener('click', () =>
        this.setZoom(1.0, window.innerWidth / 2, window.innerHeight / 2)
      );
    this.container
      .querySelector('#btn-export-png')
      ?.addEventListener('click', () => this.exportPNG());

    // Import file
    const fileInput = this.container.querySelector(
      '#file-import-input'
    ) as HTMLInputElement;
    this.container
      .querySelector('#btn-import')
      ?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleFileImport(e));

    // Drag and drop file onto canvas
    this.canvasWrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this.canvasWrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        this.importFile(e.dataTransfer.files[0]);
      }
    });

    // Help modal
    const helpModal = this.container.querySelector(
      '#help-modal'
    ) as HTMLElement;
    this.container
      .querySelector('#btn-help')
      ?.addEventListener('click', () => (helpModal.style.display = 'flex'));
    this.container
      .querySelector('#help-close-btn')
      ?.addEventListener('click', () => (helpModal.style.display = 'none'));
    this.container
      .querySelector('#help-ok-btn')
      ?.addEventListener('click', () => (helpModal.style.display = 'none'));
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) helpModal.style.display = 'none';
    });

    // Plus button click -> deploy motif picker
    this.plusButtonEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.hoveredSlot) {
        this.openMotifMenu(this.hoveredSlot);
      }
    });

    // Motif picker buttons
    this.motifMenuEl.querySelectorAll('.flow-menu-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const motif = (item as HTMLElement).dataset.motif as
          | 'process'
          | 'io'
          | 'if'
          | 'dowhile'
          | 'while';
        if (motif && this.activeMenuSlot) {
          this.handleAddMotif(motif, this.activeMenuSlot);
        }
      });
    });

    // Close motif menu on click outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (
        !this.motifMenuEl.contains(target) &&
        !target.closest?.('.svg-plus-btn')
      ) {
        this.closeMotifMenu();
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        e.preventDefault();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'y'
      ) {
        this.redo();
        e.preventDefault();
      } else if (e.key === '+' || e.key === '=') {
        this.setZoom(
          this.zoom * 1.15,
          window.innerWidth / 2,
          window.innerHeight / 2
        );
        e.preventDefault();
      } else if (e.key === '-' || e.key === '_') {
        this.setZoom(
          this.zoom * 0.85,
          window.innerWidth / 2,
          window.innerHeight / 2
        );
        e.preventDefault();
      } else if (e.key === '0') {
        this.setZoom(1.0, window.innerWidth / 2, window.innerHeight / 2);
        e.preventDefault();
      } else if (e.key.toLowerCase() === 'f') {
        this.centerDiagram();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.closeMotifMenu();
        helpModal.style.display = 'none';
      }
    });
  }

  // Hover detection on downward vertical arrow segments
  private handleArrowHover(e: MouseEvent) {
    if (this.motifMenuEl.style.display !== 'none' || this.editingNodeId) return;

    const world = this.screenToWorld(e.clientX, e.clientY);
    let foundSlot: InsertionSlot | null = null;
    let minDistance = 24; // detection radius

    for (const slot of this.layout.slots) {
      // Must be downward vertical
      if (world.y >= slot.yTop - 4 && world.y <= slot.yBottom + 4) {
        const dx = Math.abs(world.x - slot.x);
        if (dx < minDistance) {
          minDistance = dx;
          foundSlot = slot;
        }
      }
    }

    if (foundSlot) {
      this.hoveredSlot = foundSlot;
      this.renderSvgPlusButton(foundSlot);
    } else {
      this.hideSvgPlusButton();
    }
  }

  private renderSvgPlusButton(slot: InsertionSlot) {
    let group = this.svgEl.querySelector('#svg-plus-btn-layer');
    if (!group) {
      const viewport = this.svgEl.querySelector('#viewport-group');
      if (!viewport) return;
      group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('id', 'svg-plus-btn-layer');
      viewport.appendChild(group);
    }

    const midY = (slot.yTop + slot.yBottom) / 2;
    group.innerHTML = `
      <g class="svg-plus-btn" transform="translate(${slot.x}, ${midY})">
        <circle cx="0" cy="0" r="11" fill="#2563eb" filter="url(#node-shadow)"/>
        <line x1="-5" y1="0" x2="5" y2="0" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
        <line x1="0" y1="-5" x2="0" y2="5" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
      </g>
    `;

    const btn = group.querySelector('.svg-plus-btn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openMotifMenu(slot);
      });
    }
  }

  private hideSvgPlusButton() {
    if (this.motifMenuEl.style.display !== 'none') return;
    this.hoveredSlot = null;
    const group = this.svgEl.querySelector('#svg-plus-btn-layer');
    if (group) group.innerHTML = '';
  }

  private openMotifMenu(slot: InsertionSlot) {
    this.activeMenuSlot = slot;
    this.positionMotifMenu(slot);
    this.motifMenuEl.style.display = 'block';
  }

  private positionMotifMenu(slot: InsertionSlot) {
    const midY = (slot.yTop + slot.yBottom) / 2;
    const canvasPos = this.worldToCanvas(slot.x, midY);
    this.motifMenuEl.style.left = `${canvasPos.x + 20}px`;
    this.motifMenuEl.style.top = `${canvasPos.y - 40}px`;
  }

  private closeMotifMenu() {
    this.motifMenuEl.style.display = 'none';
    this.activeMenuSlot = null;
    this.hideSvgPlusButton();
  }

  // Adding a motif
  private handleAddMotif(
    motifType: 'process' | 'io' | 'if' | 'dowhile' | 'while',
    slot: InsertionSlot
  ) {
    this.closeMotifMenu();
    const { block, focusNodeId } = createNewBlock(motifType);
    this.blocks = insertBlockAtSlot(this.blocks, block, slot);
    this.recordSnapshot(`Add ${motifType}`);
    this.render();

    // Directly open in-place editor with text selected!
    setTimeout(() => {
      this.startNodeTextEdit(focusNodeId, true);
    }, 50);

    this.showToast(`Added ${motifType} pattern`);
  }

  // Deleting a node
  private handleDeleteNode(nodeId: string) {
    this.blocks = deleteNodeFromTree(this.blocks, nodeId);
    this.recordSnapshot('Delete pattern');
    this.render();
    this.showToast('Pattern deleted');
  }

  // Drag and Drop reordering
  private startNodeDrag(box: LayoutNodeBox, e: MouseEvent) {
    if (!box.canDrag) return;
    this.isDragging = true;
    this.draggedBlockId = box.blockId;
    this.draggedNodeBox = box;
    this.dragMouseStart = { x: e.clientX, y: e.clientY };
    this.dragGhostPos = { x: e.clientX, y: e.clientY };

    const ghost = this.container.querySelector(
      '#flow-drag-ghost'
    ) as HTMLElement;
    ghost.textContent = `${box.type.toUpperCase()}: ${box.text || 'Pattern'}`;
    ghost.style.left = `${e.clientX + 14}px`;
    ghost.style.top = `${e.clientY + 14}px`;
    ghost.style.display = 'block';

    document.body.style.cursor = 'grabbing';
    e.stopPropagation();
  }

  private handleNodeDragMove(e: MouseEvent) {
    const ghost = this.container.querySelector(
      '#flow-drag-ghost'
    ) as HTMLElement;
    ghost.style.left = `${e.clientX + 14}px`;
    ghost.style.top = `${e.clientY + 14}px`;

    // Find nearest drop slot
    const world = this.screenToWorld(e.clientX, e.clientY);
    let bestSlot: InsertionSlot | null = null;
    let minDistance = 50;

    for (const slot of this.layout.slots) {
      // Cannot drop inside itself
      if (slot.parentId === this.draggedBlockId) continue;

      const midY = (slot.yTop + slot.yBottom) / 2;
      const dist = Math.hypot(world.x - slot.x, world.y - midY);
      if (dist < minDistance) {
        minDistance = dist;
        bestSlot = slot;
      }
    }

    this.dropTargetSlot = bestSlot;
    this.renderDropIndicator(bestSlot);
  }

  private handleNodeDragEnd(e: MouseEvent) {
    this.isDragging = false;
    document.body.style.cursor = 'default';
    const ghost = this.container.querySelector(
      '#flow-drag-ghost'
    ) as HTMLElement;
    ghost.style.display = 'none';

    const slot = this.dropTargetSlot;
    const blockId = this.draggedBlockId;
    this.draggedBlockId = null;
    this.draggedNodeBox = null;
    this.dropTargetSlot = null;
    this.clearDropIndicator();

    if (slot && blockId) {
      // Check if trying to drop inside own children
      const { block: targetBlock, newBlocks: treeWithoutBlock } =
        removeBlockById(this.blocks, blockId);

      if (targetBlock) {
        // Verify not dropping into own descendant
        if (slot.parentId && isDescendantBlock(targetBlock, slot.parentId)) {
          this.showToast('Cannot drop inside itself');
          this.render();
          return;
        }

        // Insert into slot
        this.blocks = insertBlockAtSlot(treeWithoutBlock, targetBlock, slot);
        this.recordSnapshot('Reorder pattern');
        this.render();
        this.showToast('Pattern moved');
      }
    } else {
      this.render();
    }
  }

  private renderDropIndicator(slot: InsertionSlot | null) {
    const group = this.svgEl.querySelector('#viewport-group');
    if (!group) return;

    let dropLine = group.querySelector('#drop-indicator-line');
    if (!slot) {
      if (dropLine) dropLine.remove();
      return;
    }

    if (!dropLine) {
      dropLine = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      dropLine.setAttribute('id', 'drop-indicator-line');
      group.appendChild(dropLine);
    }

    const midY = (slot.yTop + slot.yBottom) / 2;
    dropLine.innerHTML = `
      <line x1="${slot.x - 70}" y1="${midY}" x2="${slot.x + 70}" y2="${midY}" stroke="#2563eb" stroke-width="3" stroke-dasharray="4,4" />
      <circle cx="${slot.x}" cy="${midY}" r="6" fill="#2563eb" />
      <text x="${slot.x + 12}" y="${midY + 4}" fill="#2563eb" font-size="11" font-weight="bold">Insert here</text>
    `;
  }

  private clearDropIndicator() {
    const el = this.svgEl.querySelector('#drop-indicator-line');
    if (el) el.remove();
  }

  // Text editing
  private startTitleEdit() {
    this.isEditingTitle = true;
    this.titleDisplayEl.style.display = 'none';
    this.titleInputEl.style.display = 'inline-block';
    this.titleInputEl.value = this.title;
    this.titleInputEl.focus();
    this.titleInputEl.select();
  }

  private commitTitleEdit() {
    if (!this.isEditingTitle) return;
    this.isEditingTitle = false;
    const newTitle = this.titleInputEl.value.trim() || DEFAULT_FLOW_TITLE;
    if (newTitle !== this.title) {
      this.title = newTitle;
      this.recordSnapshot('Edit diagram title');
    }
    this.titleDisplayEl.textContent = this.title;
    this.titleInputEl.style.display = 'none';
    this.titleDisplayEl.style.display = 'inline-block';
  }

  private cancelTitleEdit() {
    this.isEditingTitle = false;
    this.titleInputEl.style.display = 'none';
    this.titleDisplayEl.style.display = 'inline-block';
  }

  private commitNodeTextEdit() {
    if (!this.editingNodeId) return;
    const textarea = this.editorOverlayEl.querySelector(
      '#flow-node-textarea'
    ) as HTMLTextAreaElement;
    const text = textarea ? textarea.value : '';
    const nodeId = this.editingNodeId;
    this.editingNodeId = null;
    this.editorOverlayEl.style.display = 'none';

    const nodeBox = this.layout.nodes.find((n) => n.nodeId === nodeId);
    if (nodeBox && text !== nodeBox.text) {
      this.blocks = updateNodeText(this.blocks, nodeId, text);
      this.recordSnapshot('Edit text');
      this.render();
    }
  }

  private cancelNodeTextEdit() {
    this.editingNodeId = null;
    this.editorOverlayEl.style.display = 'none';
  }

  private startNodeTextEdit(nodeId: string, selectAll: boolean = false) {
    const nodeBox = this.layout.nodes.find((n) => n.nodeId === nodeId);
    if (!nodeBox || nodeBox.type === 'junction') return;

    this.editingNodeId = nodeId;
    const canvasPos = this.worldToCanvas(nodeBox.x, nodeBox.y);
    const screenW = nodeBox.width * this.zoom;
    const screenH = nodeBox.height * this.zoom;

    const textarea = this.editorOverlayEl.querySelector(
      '#flow-node-textarea'
    ) as HTMLTextAreaElement;

    this.editorOverlayEl.style.left = `${canvasPos.x}px`;
    this.editorOverlayEl.style.top = `${canvasPos.y}px`;
    this.editorOverlayEl.style.width = `${Math.max(140, screenW)}px`;
    this.editorOverlayEl.style.height = `${Math.max(50, screenH)}px`;
    this.editorOverlayEl.style.display = 'flex';

    textarea.value = nodeBox.text;
    textarea.focus();
    if (selectAll) {
      textarea.select();
    }

    textarea.onkeydown = (e) => {
      if (e.key === 'Escape') {
        this.cancelNodeTextEdit();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        this.commitNodeTextEdit();
      }
    };
  }

  // Rendering the flowchart
  private render() {
    this.layout = computeFlowLayout(this.blocks);

    const group = this.svgEl.querySelector('#viewport-group');
    if (!group) return;
    group.innerHTML = '';

    // 1. Render Arrows
    for (const arrow of this.layout.arrows) {
      const pathEl = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );
      const d = `M ${arrow.p1.x} ${arrow.p1.y} L ${arrow.p2.x} ${arrow.p2.y}`;
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('stroke', '#334155');
      pathEl.setAttribute('stroke-width', '2');
      pathEl.setAttribute('fill', 'none');

      // Check if arrow has arrowheads (if it ends at destination)
      if (arrow.hasArrowHead) {
        pathEl.setAttribute('marker-end', 'url(#arrow)');
      }
      group.appendChild(pathEl);

      // Render branch labels (true / false)
      if (arrow.label) {
        const textG = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'g'
        );
        textG.setAttribute('class', `branch-label label-${arrow.label.text}`);

        // Label background badge
        const badgeW = arrow.label.text === 'true' ? 32 : 36;
        const badgeH = 18;
        const rect = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'rect'
        );
        rect.setAttribute('x', `${arrow.label.x}`);
        rect.setAttribute('y', `${arrow.label.y - 12}`);
        rect.setAttribute('width', `${badgeW}`);
        rect.setAttribute('height', `${badgeH}`);
        rect.setAttribute('rx', '4');
        rect.setAttribute(
          'fill',
          arrow.label.text === 'true' ? '#ecfdf5' : '#fef2f2'
        );
        rect.setAttribute(
          'stroke',
          arrow.label.text === 'true' ? '#10b981' : '#f43f5e'
        );
        rect.setAttribute('stroke-width', '1');

        const labelText = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'text'
        );
        labelText.setAttribute('x', `${arrow.label.x + badgeW / 2}`);
        labelText.setAttribute('y', `${arrow.label.y + 1}`);
        labelText.setAttribute('text-anchor', 'middle');
        labelText.setAttribute('font-size', '11');
        labelText.setAttribute('font-weight', 'bold');
        labelText.setAttribute(
          'fill',
          arrow.label.text === 'true' ? '#047857' : '#e11d48'
        );
        labelText.textContent = arrow.label.text;

        textG.appendChild(rect);
        textG.appendChild(labelText);
        group.appendChild(textG);
      }
    }

    // 2. Render Nodes
    for (const nodeBox of this.layout.nodes) {
      const nodeG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      nodeG.setAttribute('class', `flow-node node-${nodeBox.type}`);
      nodeG.setAttribute('data-node-id', nodeBox.nodeId);
      nodeG.setAttribute('filter', 'url(#node-shadow)');

      // Double-click to edit text
      nodeG.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.startNodeTextEdit(nodeBox.nodeId);
      });

      // Drag start
      if (nodeBox.canDrag) {
        nodeG.style.cursor = 'grab';
        nodeG.addEventListener('mousedown', (e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest('.btn-delete-node')) {
            this.pendingDrag = {
              box: nodeBox,
              startX: e.clientX,
              startY: e.clientY,
            };
          }
        });
      }

      // Render Shape Geometry
      this.renderShapeGeometry(nodeG, nodeBox);

      // Render Text lines
      this.renderNodeText(nodeG, nodeBox);

      // Delete cross button on hover
      if (nodeBox.canDelete && nodeBox.deleteButtonPos) {
        this.renderDeleteButton(nodeG, nodeBox);
      }

      group.appendChild(nodeG);
    }

    this.applyTransform();
  }

  private renderShapeGeometry(nodeG: SVGGElement, node: LayoutNodeBox) {
    const { x, y, width, height, type } = node;

    if (type === 'terminal') {
      // Pill / Rounded rectangle with very rounded corners
      const rect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      rect.setAttribute('x', `${x}`);
      rect.setAttribute('y', `${y}`);
      rect.setAttribute('width', `${width}`);
      rect.setAttribute('height', `${height}`);
      rect.setAttribute('rx', `${height / 2}`);
      rect.setAttribute('ry', `${height / 2}`);
      rect.setAttribute('fill', '#f8fafc');
      rect.setAttribute('stroke', '#3b82f6');
      rect.setAttribute('stroke-width', '2.5');
      nodeG.appendChild(rect);
    } else if (type === 'process') {
      // Rectangle
      const rect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      rect.setAttribute('x', `${x}`);
      rect.setAttribute('y', `${y}`);
      rect.setAttribute('width', `${width}`);
      rect.setAttribute('height', `${height}`);
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', '#ffffff');
      rect.setAttribute('stroke', '#0284c7');
      rect.setAttribute('stroke-width', '2');
      nodeG.appendChild(rect);
    } else if (type === 'io') {
      // Parallelogram / Trapezoid with horizontal top/bottom and slash slant
      // Coordinates: top edge (x + slant, y) to (x + width, y)
      // bottom edge (x, y + height) to (x + width - slant, y + height)
      const slant = 18;
      const poly = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'polygon'
      );
      const points = `
        ${x + slant},${y}
        ${x + width},${y}
        ${x + width - slant},${y + height}
        ${x},${y + height}
      `.trim();
      poly.setAttribute('points', points);
      poly.setAttribute('fill', '#ffffff');
      poly.setAttribute('stroke', '#059669');
      poly.setAttribute('stroke-width', '2');
      nodeG.appendChild(poly);
    } else if (type === 'diamond') {
      // Rhombus: top (cx, y), right (x + width, cy), bottom (cx, y + height), left (x, cy)
      const cx = x + width / 2;
      const cy = y + height / 2;
      const poly = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'polygon'
      );
      const points = `
        ${cx},${y}
        ${x + width},${cy}
        ${cx},${y + height}
        ${x},${cy}
      `.trim();
      poly.setAttribute('points', points);
      poly.setAttribute('fill', '#ffffff');
      poly.setAttribute('stroke', '#d97706');
      poly.setAttribute('stroke-width', '2');
      nodeG.appendChild(poly);
    } else if (type === 'junction') {
      // Junction point: small circle
      const circle = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'circle'
      );
      circle.setAttribute('cx', `${x + JUNCTION_RADIUS}`);
      circle.setAttribute('cy', `${y + JUNCTION_RADIUS}`);
      circle.setAttribute('r', `${JUNCTION_RADIUS}`);
      circle.setAttribute('fill', '#334155');
      nodeG.appendChild(circle);
    }
  }

  private renderNodeText(nodeG: SVGGElement, node: LayoutNodeBox) {
    if (node.type === 'junction' || !node.lines.length) return;

    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const fontSize = node.fontSize;
    const lineHeight = fontSize * 1.35;
    const totalTextH = node.lines.length * lineHeight;
    const startY = cy - totalTextH / 2 + fontSize * 0.9;

    const textEl = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'text'
    );
    textEl.setAttribute('x', `${cx}`);
    textEl.setAttribute('y', `${startY}`);
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('font-size', `${fontSize}`);
    textEl.setAttribute(
      'font-family',
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    );
    textEl.setAttribute('font-weight', '500');
    textEl.setAttribute('fill', '#0f172a');
    textEl.setAttribute('pointer-events', 'none');

    node.lines.forEach((line, index) => {
      const tspan = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'tspan'
      );
      tspan.setAttribute('x', `${cx}`);
      if (index > 0) {
        tspan.setAttribute('dy', `${lineHeight}`);
      }
      tspan.textContent = line || ' ';
      textEl.appendChild(tspan);
    });

    nodeG.appendChild(textEl);
  }

  private renderDeleteButton(nodeG: SVGGElement, node: LayoutNodeBox) {
    const pos = node.deleteButtonPos!;
    const delG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    delG.setAttribute('class', 'btn-delete-node');
    delG.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

    const circle = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'circle'
    );
    circle.setAttribute('r', '9');
    circle.setAttribute('fill', '#ef4444');

    const cross = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    );
    cross.setAttribute('d', 'M -4 -4 L 4 4 M 4 -4 L -4 4');
    cross.setAttribute('stroke', '#ffffff');
    cross.setAttribute('stroke-width', '1.8');
    cross.setAttribute('stroke-linecap', 'round');

    delG.appendChild(circle);
    delG.appendChild(cross);

    delG.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleDeleteNode(node.nodeId);
    });

    nodeG.appendChild(delG);
  }

  // PNG Export with embedded metadata
  private async exportPNG() {
    this.showToast('Generating PNG...');
    this.layout = computeFlowLayout(this.blocks);

    const b = this.layout.bounds;
    const padding = 50;
    const xMin = b.minX - padding;
    const yMin = b.minY - padding;
    const width = b.width + padding * 2;
    const height = b.height + padding * 2;

    // Create standalone SVG string with transparent background
    const clonedSvg = this.svgEl.cloneNode(true) as SVGSVGElement;
    // Remove grid rect
    const grid = clonedSvg.querySelector('#bg-grid-rect');
    if (grid) grid.remove();
    // Remove temporary drop lines
    const dropLine = clonedSvg.querySelector('#drop-indicator-line');
    if (dropLine) dropLine.remove();
    // Remove all delete cross buttons so they never appear in the exported PNG
    clonedSvg.querySelectorAll('.btn-delete-node').forEach((el) => el.remove());
    // Remove hover plus button layer
    clonedSvg.querySelectorAll('#svg-plus-btn-layer').forEach((el) => el.remove());

    clonedSvg.setAttribute('width', `${width}`);
    clonedSvg.setAttribute('height', `${height}`);
    clonedSvg.setAttribute('viewBox', `${xMin} ${yMin} ${width} ${height}`);

    const viewportGroup = clonedSvg.querySelector('#viewport-group');
    if (viewportGroup) {
      viewportGroup.removeAttribute('transform');
    }

    const svgXml = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgXml], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = async () => {
      // 2x Retina resolution
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }

      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const arrayBuffer = await blob.arrayBuffer();

        // Prepare embedded metadata
        const metadata: PNGMetadata = {
          title: this.title,
          history: this.history,
          labels: extractNodeLabels(this.blocks),
          historyIndex: this.historyIndex,
        };

        const finalBlob = injectMetadataIntoPNG(arrayBuffer, metadata);

        // Download as slugified title
        const filename = `${slugify(this.title)}.png`;
        const downloadUrl = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        this.showToast(`Exported ${filename}`);
      }, 'image/png');
    };
    img.src = url;
  }

  // Import file
  private handleFileImport(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.importFile(input.files[0]);
      input.value = '';
    }
  }

  private async importFile(file: File) {
    this.showToast(`Opening ${file.name}...`);
    try {
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.title && Array.isArray(data.blocks)) {
          this.title = data.title;
          this.blocks = data.blocks;
          this.history = data.history || [{ title: this.title, blocks: this.blocks }];
          this.historyIndex =
            typeof data.historyIndex === 'number'
              ? data.historyIndex
              : this.history.length - 1;
          this.updateTitleDisplay();
          this.updateUndoRedoButtons();
          this.saveState();
          this.render();
          this.centerDiagram();
          this.showToast('Imported diagram from JSON');
          return;
        }
      } else {
        // PNG file
        const buffer = await file.arrayBuffer();
        const meta = extractMetadataFromPNG(buffer);
        if (meta && meta.history && meta.history.length > 0) {
          this.title = meta.title;
          this.history = meta.history;
          this.historyIndex = Math.min(
            meta.historyIndex,
            this.history.length - 1
          );
          const currentSnap = this.history[this.historyIndex];
          this.blocks = JSON.parse(JSON.stringify(currentSnap.blocks));

          this.updateTitleDisplay();
          this.updateUndoRedoButtons();
          this.saveState();
          this.render();
          this.centerDiagram();
          this.showToast('Restored diagram & history from PNG metadata!');
          return;
        } else {
          alert(
            'This PNG does not contain flow-c flowchart metadata. Please import a PNG exported by flow-c or a .json file.'
          );
        }
      }
    } catch (err) {
      console.error('Failed to open file', err);
      alert('Could not read or parse flowchart data from this file.');
    }
  }
}
