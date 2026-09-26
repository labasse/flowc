# flow-c

A fast, lightweight, client-side flowchart editor designed specifically for representing C applications and algorithms with strictly orthogonal routing.

`flow-c` runs entirely in the browser with zero backend requirements and can be hosted on any static web server or CDN. It is built using AI.

---

## Features

### 1. Orthogonal Routing & Flowchart Semantics
- **Strictly Orthogonal Arrows:** All arrow connections consist solely of horizontal and vertical segments (no diagonal/oblique lines).
- **Condition Badges:** Clear `true` and `false` badges on branch outputs.
- **Initial State:** Starts with an `"Empty flow"` diagram consisting of the terminal nodes (`start` and `end`) connected by a vertical downward arrow.

### 2. Supported C Patterns
- **Terminal Nodes (`start`, `end`):** Rounded pill rectangles representing entry and exit points.
- **Process:** Crisp rectangle containing action statements (default: `"Action"`).
- **Input / Output (I/O):** Parallelogram with horizontal top/bottom edges and slanted slash-direction sides (`/`) representing data transfers (default: `"Input/Output"`).
- **If Condition:** Diamond (rhombus) containing the condition expression.
  - `true` branch: Exits the bottom vertex vertically down to a junction point.
  - `false` branch: Exits the right vertex, elbows right, descends, and joins the junction point horizontally.
- **Do...While Loop:**
  - Junction point at the top.
  - Loop body below the junction.
  - Diamond condition at the bottom:
    - `true` branch: Exits the right vertex and loops back up to enter the right side of the junction point.
    - `false` branch: Exits the bottom vertex and proceeds to the destination below.
- **While Loop:**
  - Diamond condition tested directly upon entry.
  - `true` branch: Exits bottom vertex, descends through the loop body, and loops back up into the left vertex of the diamond.
  - `false` branch: Exits the right vertex, descends past the loop body, and connects to the destination below.

### 3. Interactive Pattern Insertion
- Hovering over any downward vertical arrow segment displays a clickable `+` button centered on the arrow.
- Clicking the `+` button opens a popover menu to pick any motif.
- The chosen motif is spliced into the sequence, all subsequent nodes automatically shift down, and the newly added node is immediately focused for inline text editing.

### 4. Smart Text Auto-Sizing
- Double-click any node or the diagram title to edit.
- Multiline text is centered horizontally and vertically.
- Shapes automatically expand horizontally up to **`500px`** (`MAX_NODE_WIDTH` constant).
- Beyond `500px`, font size dynamically scales down so that text is **never truncated**.
- Clicking outside the editor immediately commits and saves the change.

### 5. Drag-and-Drop Reordering
- Drag any Process, I/O, or Condition Diamond to reposition it within the flowchart.
- Moving a diamond moves its entire nested motif (including branch bodies or loop contents).
- A threshold prevents accidental drags when simply clicking or double-clicking nodes.

### 6. Pattern Deletion
- Hovering over any Process, I/O, or Diamond reveals a red `✕` delete button at the top-right corner.
- **Process / I/O:** Removed from sequence; following nodes connect and shift up.
- **While / Do...While Diamond:** The loop motif is replaced in-place by the nodes inside its loop body.
- **If Diamond:** The conditional motif is replaced in-place by the nodes of the `true` branch followed by the nodes of the `false` branch.

### 7. Complete Undo / Redo & Local Persistence
- Full undo and redo history for all operations (node insertion, text editing, moves, deletions, and title updates).
- Keyboard shortcuts: <kbd>Ctrl</kbd>+<kbd>Z</kbd> and <kbd>Ctrl</kbd>+<kbd>Y</kbd> (or <kbd>Cmd</kbd>+<kbd>Z</kbd> / <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>).
- Automatically persists diagram state, title, and undo history in `localStorage`.

### 8. Image Save & Open with Embedded Metadata
- **Save (PNG Export):** Generates a crisp, transparent PNG named by slugifying the diagram title (e.g. `empty-flow.png`).
  - Embeds standard PNG `iTXt` metadata chunks containing the exact diagram title, serialized undo/redo history, node labels, and history position.
  - Delete buttons and temporary hover handles are omitted from the export.
- **Open (Import):** Reopen any previously saved PNG or JSON flowchart. Restores the exact nodes, layout, title, and full undo/redo history. Dragging and dropping files directly onto the canvas is also supported.
- **New Flow:** Opens a clean flowchart in a new browser tab.

---

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Cmd</kbd> + <kbd>Z</kbd> | Undo |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo |
| <kbd>+</kbd> / <kbd>=</kbd> | Zoom In |
| <kbd>-</kbd> / <kbd>_</kbd> | Zoom Out |
| <kbd>0</kbd> | Reset Zoom (100%) |
| <kbd>F</kbd> | Fit to Screen |
| <kbd>Esc</kbd> | Close Menus / Cancel Edit |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Commit Text Edit |
| Click outside | Commit Text Edit |

---

## Tech Stack & Architecture

- **Language:** TypeScript
- **Rendering:** Pure DOM & SVG with dynamic coordinate transforms and canvas export.
- **Styles:** Pure custom modern CSS (`src/index.css`) with CSS variables and flexbox/grid layout (no Tailwind or external CSS frameworks).
- **Build Tool:** Vite

---

## Getting Started

### Installation

```bash
npm install
```

### Development Server

Start the local development server at `http://localhost:3000`:

```bash
npm run dev
```

### Production Build

Compile TypeScript and build the static assets in `dist/`:

```bash
npm run build
```

The resulting files in `dist/` can be served by any static web server (Nginx, Apache, GitHub Pages, Caddy, Cloudflare Pages, etc.).

---

## License

Apache-2.0
