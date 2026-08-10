# Changes Log — Milestone 2

## Installed Dependencies
- `lucide-react`: React icons component package.
- `clsx`: Utility for constructing `className` strings conditionally.

## Code Modifications & Features Implemented

### 1. `client/src/context/ThemeContext.tsx` (New File)
- Implemented `ThemeProvider` context and custom hook `useTheme()`.
- Supports `'light'` and `'dark'` themes.
- State persists in `localStorage.setItem('kztek_theme', theme)`.
- System color preference detection (`window.matchMedia('(prefers-color-scheme: dark)')`) with automatic listener.
- Updates document root attributes: `document.documentElement.setAttribute('data-theme', theme)` and toggles `.dark` class on `document.documentElement`.

### 2. `client/src/App.tsx`
- Wrapped the entire router/app shell inside `ThemeProvider`.
- Added `ThemeToggleBtn` in the topbar with `Sun` / `Moon` Lucide icons and smooth animations.
- Replaced inline hardcoded link colors with CSS variables for dark mode compatibility.
- Added responsive mobile navigation drawer with hamburger menu button (`Menu` / `X` Lucide icons) for mobile viewports (< 768px).

### 3. `client/src/styles.css` (Overhauled)
- Added dark theme CSS variable definitions under `[data-theme="dark"]` and `.dark`:
  - `--bg-primary`, `--bg-secondary`, `--bg-card`, `--text-primary`, `--text-secondary`, `--border-color`, `--accent-color`, `--shadow-sm`, `--shadow-md`.
- Maintained backward compatibility with existing variables (`--navy`, `--navy-light`, `--navy-pale`, `--orange`, `--orange-pale`, `--border`, `--white`, `--bg`, `--text`, `--danger`, `--success`).
- Added smooth CSS transitions (`transition: background-color 0.2s, color 0.2s, transform 0.15s, opacity 0.2s, box-shadow 0.2s, border-color 0.2s`) across buttons, inputs, selects, textareas, cards, modals, and toolbars.
- Added `@media (max-width: 768px)` media queries:
  - Mobile topbar hamburger menu and collapsible navigation drawer.
  - Converted desktop grid widths (`260px 1fr`, `220px 1fr 240px`) in `ProjectDetailPage` and `AnnotatorPage` into responsive flex/stacked layouts (`grid-template-columns: 1fr` on mobile).
  - Responsive image grid (`grid-template-columns: repeat(auto-fill, minmax(130px, 1fr))`).
  - Mobile dialog styling (`width: 95vw; max-width: 95vw; margin: 10px`).
  - Mobile filter bar and stat tiles stacking to avoid horizontal scrolling.

### 4. `client/src/pages/ProjectsPage.tsx`
- Integrated Lucide icons: `FolderKanban`, `Plus`, `Image`, `Tag`, `CheckCircle2`, `FolderPlus`, `ArrowRight`.
- Enhanced project card header and empty state visuals.

### 5. `client/src/pages/ProjectDetailPage.tsx`
- Integrated Lucide icons for toolbar actions: `BarChart2`, `Sparkles`, `ShieldCheck`, `Users`, `Download`, `Archive`, `FolderPlus`, `UploadCloud`, `Plus`, `Trash2`, `Filter`, `Search`, `ArrowLeft`.
- Replaced emoji buttons with styled Lucide icon buttons.

### 6. `client/src/pages/LoginPage.tsx`
- Updated page background, form container, labels, and buttons to use design system CSS variables (`var(--bg-primary)`, `var(--bg-card)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--border-color)`).
- Added Lucide icons: `User`, `Lock`.

### 7. `client/src/pages/UsersPage.tsx`
- Updated user management table, form inputs, status badges, and action buttons to use design system CSS variables and Lucide icons: `Users`, `UserPlus`, `Trash2`, `CheckCircle2`, `XCircle`, `ShieldCheck`, `User`.
