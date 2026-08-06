# Milestone 4 Investigation & Decomposition Plan
**Client Performance Optimization & Code Modularization**

> **Author**: Explorer 1 (Milestone 4)  
> **Date**: 2026-08-06  
> **Target Scope**: `client/src/pages/AnnotatorPage.tsx`, `client/src/pages/ProjectDetailPage.tsx`, `client/src/App.tsx`, `client/vite.config.ts`  
> **Mode**: Read-Only Analysis & Architectural Blueprint

---

## 1. Executive Summary

This report delivers the comprehensive architectural investigation and refactoring plan for **Milestone 4: Client Performance Optimization & Code Modularization**.

### Key Findings
1. **Monolithic Page Bottlenecks**:
   - `AnnotatorPage.tsx`: **1,709 lines** (77.5 KB). Contains canvas rendering engine, 2D geometry math, drag/zoom/pan state, hotkey buffer, MRU tracking, undo/redo history stack, quick switcher modal, filmstrip carousel, review status workflow, and 3 distinct UI sidebars/toolbars in a single file.
   - `ProjectDetailPage.tsx`: **794 lines** (39.1 KB). Combines project header, drag-and-drop file upload, class label CRUD, model metadata management & mAP ranking, multi-select filtering, batch operations, pagination, and modal triggers into a single file.
2. **Missing Route Code-Splitting**:
   - `App.tsx` statically imports all pages (`AnnotatorPage`, `ProjectDetailPage`, `DashboardPage`, `UsersPage`, etc.). Consequently, initial page loads (e.g., navigating to `/login` or `/`) force the browser to download the entire application bundle, including heavy charting libraries (`recharts`) and canvas engines.
3. **Unoptimized Vite Bundle Build**:
   - `vite.config.ts` lacks custom Rollup `manualChunks` splitting. Third-party dependencies like `recharts` (~300KB+) and `lucide-react` get bundled together, triggering Vite's bundle chunk size warnings (>500kB).

---

## 2. Deep-Dive Analysis of Monolithic Pages

### 2.1 `client/src/pages/AnnotatorPage.tsx` (1,709 lines)

#### State & Ref Overload
The component maintains **28 `useState` hooks** and **18 `useRef` hooks**:
- **Domain State**: `classes`, `images`, `image`, `boxes`, `activeClassId`, `selectedId`, `selectedIds`, `saveState`, `reviewBusy`, `doneBusy`.
- **Canvas & Interaction State**: `tool`, `drawingPoints`, `mousePos`, `imgEl`, `scale`, `zoom`, `spaceHeld`, `isPanning`, `selectRect`.
- **UI & Modal State**: `prefillLoading`, `prefillCount`, `copyingLabels`, `showFilmstrip`, `mruClassIds`, `showSwitcher`, `switcherQuery`, `switcherIdx`, `undoSize`, `redoSize`, `hasClipboard`.
- **Refs**: `canvasRef`, `containerRef`, `dragRef`, `windowListenersRef`, `selectRectRef`, `saveTimer`, `annotationVersionRef`, `zoomRef`, `pendingScrollRef`, `filmstripRef`, `hotkeyBufferRef`, `hotkeyTimerRef`, `switcherInputRef`, `undoStackRef`, `redoStackRef`, `boxesRef`, `preDragSnapshotRef`, `lastDrawnSizeRef`, `clipboardBoxRef`, `lastMousePosRef`.

#### Responsibility Overlap
1. **Canvas Geometry Engine**:
   - `draw()` function (lines 493–596) handles 2D context drawing of bounding boxes, quads, label pills (`drawLabel`), drag handles, rubber-band selection box, and quad placement preview lines.
2. **Drag & Coordinate Mechanics**:
   - Coordinate conversion (`toImageCoords`), hit testing (`hitTestHandle`, `hitTestBox`), mouse down/move/up handlers (`onMouseDown`, `onMouseMove`, `handleDragMove`, `handleDragUp`), window listener attachment (`attachWindowDragListeners`), and pan execution (`startPan`).
3. **History (Undo/Redo) & Clipboard**:
   - Snapshot capture (`pushHistorySnapshot`), `undo`, `redo`, history stack limits (`MAX_UNDO = 50`), box copy (`copySelectedBox`), and box paste at cursor position (`pasteBox`).
4. **Keyboard Shortcut Engine**:
   - Complex `onKey` listener (lines 1149–1281) parsing single keys, Ctrl/Cmd shortcuts, Alt shortcuts, 1–9 MRU keys, 2-character hotkey buffer timing, and escape handling.
5. **UI Sub-views**:
   - Top Toolbar (lines 1287–1432), Prefill Banner (lines 1435–1459), Quad Hint Bar (lines 1460–1475), Class Picker Sidebar (lines 1480–1528), Canvas Container (lines 1530–1537), Annotation List Sidebar (lines 1538–1560), Quick Class Switcher Modal (lines 1569–1607), and Filmstrip Carousel (lines 1609–1641).

---

### 2.2 `client/src/pages/ProjectDetailPage.tsx` (794 lines)

#### State & Functionality Analysis
The component manages **24 `useState` hooks**:
- **Project Data**: `project`, `classes`, `images`, `models`.
- **Model Metadata**: `editingModelId`, `editDraft`, `savingModelMeta`, `settingDefault`.
- **Upload & Drag**: `dragOver`, `uploading`.
- **Modal Toggles**: `exportOpen`, `statsOpen`, `autoLabelOpen`, `validateOpen`, `assignmentOpen`.
- **Filters & Pagination**: `search`, `statusFilter`, `classFilter`, `classFilterOpen`, `splitFilter`, `reviewFilter`, `doneFilter`, `page`, `pageSize`.
- **Batch Selection**: `selectedIds`.

#### Responsibility Overlap
1. **Class Label CRUD**: Inline editing of class names, color picker, hotkey validation (rejecting numeric hotkeys reserved for MRU), and class removal.
2. **Model Management**: Sorting models by mAP score, highlighting `★ Best` model, setting default model, inline editing of metadata (`notes`, `map_score`, `version_label`).
3. **File & Folder Upload**: Handling raw images, ZIP archives, webkit directory uploads via drag-and-drop or file pickers.
4. **Multi-Select Dataset Filtering**: Real-time filtering across search query, status, multi-select class array (OR logic), split, review status, and done status.
5. **Batch Image Actions**: Page select, batch split change, batch deletion, selection state clear.
6. **Image Grid & Pagination**: Grid rendering of image cards with status badges, review badges, split badges, done badges, and pagination calculation.

---

## 3. Planned Modular Decomposition

### 3.1 Architecture for `client/src/pages/annotator/`

The target structure will decompose `AnnotatorPage.tsx` into clean, single-responsibility submodules:

```
client/src/pages/annotator/
├── index.tsx                         # Main AnnotatorPage component (~120 lines)
├── types.ts                          # Types: Box, Tool, DragMode, Handle, SelectRect
├── utils.ts                          # Math & conversion: drawLabel, boundingRect, pointInPolygon, cloneBox, etc.
├── hooks/
│   ├── useAnnotatorState.ts          # Core data fetching, boxes state, active class, save schedule
│   ├── useAnnotatorHistory.ts        # Undo/redo stack management, copy/paste clipboard
│   ├── useAnnotatorZoomPan.ts        # Zoom scaling, pan offset, native wheel listener
│   └── useAnnotatorHotkeys.ts        # Global key listener, 2-char hotkey buffer, MRU shortcuts
└── components/
    ├── AnnotatorToolbar.tsx          # Top navigation bar, mode toggles, action buttons
    ├── ClassPickerPanel.tsx          # Left sidebar: class list, MRU indicators, hotkeys
    ├── AnnotationListPanel.tsx       # Right sidebar: current annotations list, delete triggers
    ├── CanvasStage.tsx               # 2D Canvas stage & drawing renderer
    ├── Filmstrip.tsx                 # Bottom thumbnail carousel with auto-scroll
    ├── QuickSwitcherModal.tsx        # Ctrl+K modal overlay & fuzzy search list
    └── PrefillBanner.tsx             # Auto-prefill model suggestion banner
```

#### Module Breakdown & Responsibilities

1. `types.ts`:
   - Exports `Box`, `Tool`, `DragMode`, `Handle`, `SelectRect`, `SaveState`.
2. `utils.ts`:
   - Exports pure functions: `drawLabel()`, `boundingRect()`, `pointInPolygon()`, `cloneBox()`, `annotationToBox()`, `suggestionToBox()`, `clamp()`, `fuzzyMatch()`.
3. `hooks/useAnnotatorState.ts`:
   - Encapsulates image fetching, annotation loading, auto-save timer (`scheduleSave`), review status transitions (`submitReview`, `approveReview`, `rejectReview`), and mark/unmark done.
4. `hooks/useAnnotatorHistory.ts`:
   - Manages `undoStackRef`, `redoStackRef`, `pushHistorySnapshot()`, `undo()`, `redo()`, `clipboardBoxRef`, `copySelectedBox()`, `pasteBox()`.
5. `hooks/useAnnotatorZoomPan.ts`:
   - Controls `zoom`, `scale`, `spaceHeld`, `isPanning`, `zoomRef`, `pendingScrollRef`, and attaches the native non-passive wheel event listener to `containerRef`.
6. `hooks/useAnnotatorHotkeys.ts`:
   - Manages `hotkeyBufferRef`, `hotkeyTimerRef`, keydown event listener registration for undo, redo, copy, paste, Alt+C, Ctrl+K, MRU keys 1-9, Arrow navigation, and 'D' key.
7. `components/AnnotatorToolbar.tsx`:
   - Renders back button, image prev/next buttons, Bbox/Quad toggles, Copy/Paste buttons, Undo/Redo buttons, Copy Previous Labels button, Zoom controls, Filmstrip toggle, Save status indicator, Mark Done button, and Review workflow actions.
8. `components/ClassPickerPanel.tsx`:
   - Renders active class header, class scroll list, swatch colors, MRU badges, custom hotkeys, and bottom help text.
9. `components/AnnotationListPanel.tsx`:
   - Renders annotation count header, scroll list of active box items, shape tags (`◈ 4 điểm` vs `▭ box`), item selection highlight, and item delete triggers.
10. `components/CanvasStage.tsx`:
    - Renders `<div className="canvas-stage">` and `<canvas ref={canvasRef}>`. Calls `draw()` on render or resize. Handles mouse down/move/up and context menu events.
11. `components/Filmstrip.tsx`:
    - Renders bottom carousel, thumbnail images (`loading="lazy"`), status badges (`Chưa gán`, `Đã gán`, `✓ Xong`, `Chờ duyệt`, `✓ Duyệt`, `Từ chối`), and handles auto-scroll to active image.
12. `components/QuickSwitcherModal.tsx`:
    - Renders fixed backdrop modal, search input, fuzzy filtered list, keyboard navigation (Up/Down/Enter/Esc).
13. `components/PrefillBanner.tsx`:
    - Renders prefill loading alert or suggestion box count banner with clear button.

---

### 3.2 Architecture for `client/src/pages/project-detail/`

The target structure will decompose `ProjectDetailPage.tsx` into modular subcomponents and hooks:

```
client/src/pages/project-detail/
├── index.tsx                         # Main ProjectDetailPage component (~100 lines)
├── types.ts                          # StatusFilter, SplitFilter, ReviewFilter, DoneFilter, EditDraft
├── hooks/
│   ├── useProjectDetailData.ts       # Project, classes, images, models fetching & CRUD actions
│   ├── useDatasetFilters.ts          # Search, status, class multi-select, split, review, done filtering
│   ├── useBatchSelection.ts          # Selected image IDs, batch split, batch delete
│   └── useFileUpload.ts              # Drag-and-drop, ZIP & folder upload triggers
└── components/
    ├── ProjectHeader.tsx             # Title, description, action toolbar buttons
    ├── ClassManagerPanel.tsx         # Sidebar section: class list, color picker, name/hotkey edit, add/delete
    ├── ModelManagerPanel.tsx         # Sidebar section: model list, mAP sorting, metadata inline editor, default toggle
    ├── FileDropzone.tsx              # Drag and drop file upload area
    ├── FilterBar.tsx                 # Search input, filter select dropdowns, page size selector
    ├── BatchToolbar.tsx              # Batch selection actions bar (split change, batch delete)
    ├── ImageGrid.tsx                 # Grid of image cards, status/review/split badges, deletion triggers
    └── Pagination.tsx                # Page navigation controls
```

#### Module Breakdown & Responsibilities

1. `types.ts`:
   - Exports `StatusFilter`, `SplitFilter`, `ReviewFilter`, `DoneFilter`, `ModelDraft`.
2. `hooks/useProjectDetailData.ts`:
   - Loads project, classes, images, and models. Handles class add/update/delete, image single delete, image split change, and model metadata update.
3. `hooks/useDatasetFilters.ts`:
   - Manages search text, status filter, multi-select class filter array, split filter, review filter, done filter, and computes `filteredImages`, `pagedImages`, `pageCount`, and `resetFilters()`.
4. `hooks/useBatchSelection.ts`:
   - Manages `selectedIds` set, `toggleSelect()`, `clearSelection()`, `selectPage()`, `batchChangeSplit()`, and `batchDelete()`.
5. `hooks/useFileUpload.ts`:
   - Manages `dragOver`, `uploading`, file input refs, and `handleFiles()` for image, zip, and folder uploads.
6. `components/ProjectHeader.tsx`:
   - Title, description, and action buttons launching StatsPanel, AutoLabelModal, ValidateModal, AssignmentModal, ExportModal, ZIP upload, Folder upload, and File upload.
7. `components/ClassManagerPanel.tsx`:
   - Renders class list, swatch color inputs, name edit inputs, hotkey inputs (with numeric hotkey validation), delete triggers, and add class button.
8. `components/ModelManagerPanel.tsx`:
   - Renders sorted model cards (by mAP desc), best model star, version label badges, default status badge, inline metadata edit form, set default / remove default triggers.
9. `components/FileDropzone.tsx`:
   - Drag-and-drop file upload target with loading state.
10. `components/FilterBar.tsx`:
    - Search input, status select, multi-select class dropdown, split select, review select, done select, clear filters button, page size select, image count indicator.
11. `components/BatchToolbar.tsx`:
    - Appears when items are selected. Shows selected count, select current page button, change split dropdown, batch delete button, clear selection button.
12. `components/ImageGrid.tsx`:
    - Responsive grid of image cards, checkbox selection overlay, thumbnail image, labeled/unlabeled status badge, completed badge, review badge, split toggle badge, single delete button, class dots indicator.
13. `components/Pagination.tsx`:
    - Pagination controls (prev, next, page numbers, ellipsis).

---

## 4. Route Code-Splitting Strategy in `client/src/App.tsx`

### Current Static Import Issue
`client/src/App.tsx` currently imports all page components at bundle startup:
```tsx
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import AnnotatorPage from './pages/AnnotatorPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import DashboardPage from './pages/DashboardPage';
```

### Proposed Refactoring

1. **Replace Static Imports with `React.lazy()`**:
```tsx
import React, { Suspense, lazy } from 'react';

const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/project-detail'));
const AnnotatorPage = lazy(() => import('./pages/annotator'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
```

2. **Introduce `<LoadingFallback />` Component**:
```tsx
function LoadingFallback() {
  return (
    <div className="page-loading-fallback" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 12,
      color: 'var(--text-muted, #666)',
    }}>
      <div className="spinner" style={{
        width: 32,
        height: 32,
        border: '3px solid var(--border-color, #e0e0e0)',
        borderTopColor: 'var(--orange, #F05922)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <span style={{ fontSize: 14 }}>Đang tải trang...</span>
    </div>
  );
}
```

3. **Wrap Route Definitions with `<Suspense>`**:
```tsx
<main className="app-main">
  <Suspense fallback={<LoadingFallback />}>
    <Routes>
      <Route path="/" element={<ProjectsPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/users" element={<UsersPage />} />
      <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
      <Route path="/projects/:projectId/annotate/:imageId" element={<AnnotatorPage />} />
    </Routes>
  </Suspense>
</main>
```

4. **Public Route Code-Splitting**:
In the `App()` root component, also wrap the public routes (`/login`) in `<Suspense>`:
```tsx
export default function App() {
  return (
    <ThemeProvider>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          />
        </Routes>
      </Suspense>
    </ThemeProvider>
  );
}
```

---

## 5. Vite Config & Manual Chunking Optimization

### Current Config (`client/vite.config.ts`)
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
```

### Proposed Vite Configuration with Manual Chunking
To eliminate large bundle chunk size warnings and enable effective vendor caching:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            return 'vendor';
          }
        },
      },
    },
  },
});
```

### Bundle Impact & Chunk Distribution Matrix
| Chunk Name | Included Packages / Modules | Estimated Minified Size | Load Condition |
|------------|-----------------------------|-------------------------|----------------|
| `vendor-react` | `react`, `react-dom`, `react-router-dom` | ~130 KB | Initial page load (cached permanently) |
| `vendor-charts` | `recharts` and D3 dependencies | ~320 KB | Loaded on-demand when visiting `/dashboard` or stats modals |
| `vendor-icons` | `lucide-react` | ~70 KB | Loaded on main layout render |
| `vendor` | `clsx`, minor node_modules | ~15 KB | Loaded on main layout render |
| `AnnotatorPage` chunk | `client/src/pages/annotator/*` | ~45 KB | Loaded on-demand when opening annotator route |
| `ProjectDetailPage` chunk | `client/src/pages/project-detail/*` | ~30 KB | Loaded on-demand when opening project detail route |
| `DashboardPage` chunk | `client/src/pages/DashboardPage.tsx` + components | ~25 KB | Loaded on-demand when opening dashboard route |

---

## 6. Implementation & Verification Roadmap

### Implementation Steps for Subagents

#### Phase 1: Vite & Route Splitting (Implementer 1)
1. Update `client/vite.config.ts` with Rollup `manualChunks`.
2. Update `client/src/App.tsx` with `React.lazy()` and `<Suspense>` fallback.
3. Test build to verify chunk generation and route lazy loading.

#### Phase 2: Annotator Page Modularization (Implementer 1 / 2)
1. Create `client/src/pages/annotator/` directory and `types.ts`, `utils.ts`.
2. Extract custom hooks (`useAnnotatorState`, `useAnnotatorHistory`, `useAnnotatorZoomPan`, `useAnnotatorHotkeys`).
3. Extract subcomponents (`AnnotatorToolbar`, `ClassPickerPanel`, `AnnotationListPanel`, `CanvasStage`, `Filmstrip`, `QuickSwitcherModal`, `PrefillBanner`).
4. Re-export `AnnotatorPage` from `client/src/pages/annotator/index.tsx`.
5. Ensure `client/src/pages/AnnotatorPage.tsx` re-exports default from `./annotator` for backwards compatibility.

#### Phase 3: Project Detail Page Modularization (Implementer 2)
1. Create `client/src/pages/project-detail/` directory and `types.ts`.
2. Extract hooks (`useProjectDetailData`, `useDatasetFilters`, `useBatchSelection`, `useFileUpload`).
3. Extract subcomponents (`ProjectHeader`, `ClassManagerPanel`, `ModelManagerPanel`, `FileDropzone`, `FilterBar`, `BatchToolbar`, `ImageGrid`, `Pagination`).
4. Re-export `ProjectDetailPage` from `client/src/pages/project-detail/index.tsx`.
5. Ensure `client/src/pages/ProjectDetailPage.tsx` re-exports default from `./project-detail` for backwards compatibility.

### Key Caveats & Regression Guardrails
- **Stale Closure in Drag & Zoom Listeners**: Keep `selectRectRef`, `zoomRef`, `boxesRef`, `preDragSnapshotRef` updated in refs so native event handlers read updated values.
- **Non-passive Wheel Event Listener**: Ensure the native `{ passive: false }` wheel listener on `containerRef` is retained in `useAnnotatorZoomPan` to prevent browser default scroll jitter.
- **Hotkey Event Bubbling**: Maintain input target checks (`e.target instanceof HTMLInputElement`) in global hotkey hooks so typing in input fields does not trigger single-key shortcuts.
- **MRU & Quick Switcher**: Ensure `mruClassIds` and `fuzzyMatch` continue to sync with localStorage per project ID.

---

## 7. Verification Method

1. **Static Analysis & Type Checking**:
   - Run `npx tsc -b` inside `client/` to ensure zero TypeScript compilation errors across decomposed modules.
2. **Build Verification**:
   - Run `npx vite build` inside `client/`.
   - Verify output dist files contain `vendor-react.js`, `vendor-charts.js`, `vendor-icons.js`, and separate lazy chunks for each page.
   - Confirm Vite displays **0 large chunk warnings** (>500kB limit).
3. **Runtime & Functional Verification**:
   - Launch application (`npm run dev:server`, `npm run dev:client`).
   - Navigate across `/`, `/dashboard`, `/projects/:projectId`, `/projects/:projectId/annotate/:imageId`.
   - Test canvas drawing (bbox & quad), zoom/pan with wheel/spacebar, undo/redo (Ctrl+Z/Ctrl+Y), copy/paste (Ctrl+C/Ctrl+V), copy previous labels (Alt+C), MRU keys (1-9), quick switcher (Ctrl+K), and filmstrip thumbnail navigation.
   - Test project detail class CRUD, model metadata inline edit, multi-select filters, batch split changes, and drag-and-drop file upload.
