import { Router } from 'express';
import { nanoid } from 'nanoid';
import fs from 'fs';
import { db, logActivity } from '../db.js';

const router = Router({ mergeParams: true });

// BUGFIX: Phím số 1-9 LUÔN được AnnotatorPage xử lý như "chọn nhãn theo MRU"
// (xem client onKey: nhánh `e.key >= '1' && e.key <= '9'` return ngay, không
// bao giờ tới đoạn so khớp custom hotkey). Nếu cho phép lưu hotkey chỉ gồm
// chữ số, người dùng gõ đúng phím đó nhưng KHÔNG BAO GIỜ áp dụng được nhãn
// tương ứng — trông như "bấm phím không ăn". Chặn ngay tại DB để tránh lưu
// hotkey vô dụng, dù client đã validate trước.
function normalizeHotkey(hotkey) {
  if (typeof hotkey !== 'string') return null;
  const trimmed = hotkey.trim().slice(0, 2);
  if (!trimmed) return null;
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) return null;
  return trimmed;
}

// Helper: auto-generate unique hotkey based on class name
function autoGenerateHotkey(projectId, name) {
  if (!name || typeof name !== 'string') return null;
  const existing = db.prepare('SELECT hotkey FROM classes WHERE project_id = ?').all(projectId);
  const used = new Set(existing.map(e => e.hotkey).filter(Boolean).map(h => h.toLowerCase()));

  // Normalize string: bỏ dấu tiếng Việt/diacritics, chuyển lowercase, giữ lại alphanumeric
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

  if (!normalized) return null;

  // 1. Thử dùng chính tên nhãn nếu dài 1-2 ký tự
  if (normalized.length >= 1 && normalized.length <= 2) {
    if (!used.has(normalized)) return normalized;
  }

  // 2. Thử dùng chữ cái đầu tiên
  const firstChar = normalized.charAt(0);
  if (!used.has(firstChar)) return firstChar;

  // 3. Thử dùng 2 chữ cái đầu tiên
  if (normalized.length >= 2) {
    const firstTwo = normalized.slice(0, 2);
    if (!used.has(firstTwo)) return firstTwo;
  }

  return null;
}

router.get('/', (req, res) => {
  const classes = db.prepare('SELECT * FROM classes WHERE project_id = ? ORDER BY sort_order ASC')
    .all(req.params.projectId);
  res.json(classes);
});

router.post('/', (req, res) => {
  const { name, color, hotkey } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tên nhãn không được để trống' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM classes WHERE project_id = ?')
    .get(req.params.projectId).m;
  const id = nanoid();

  // Auto-generate hotkey if not provided
  let resolvedHotkey = normalizeHotkey(hotkey);
  if (!resolvedHotkey) {
    resolvedHotkey = autoGenerateHotkey(req.params.projectId, name.trim());
  }

  db.prepare('INSERT INTO classes (id, project_id, name, color, sort_order, hotkey) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.projectId, name.trim(), color || '#F05922', maxOrder + 1, resolvedHotkey);
  res.status(201).json(db.prepare('SELECT * FROM classes WHERE id = ?').get(id));
});

router.patch('/:classId', (req, res) => {
  const existing = db.prepare('SELECT * FROM classes WHERE id = ? AND project_id = ?')
    .get(req.params.classId, req.params.projectId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy nhãn' });
  const { name, color, hotkey } = req.body;

  let resolvedHotkey = hotkey === undefined ? existing.hotkey : normalizeHotkey(hotkey);
  
  // Auto-generate hotkey on name update if it's currently empty
  const newName = name ?? existing.name;
  if (newName && newName.trim() !== existing.name && !resolvedHotkey) {
    resolvedHotkey = autoGenerateHotkey(req.params.projectId, newName.trim());
  }

  db.prepare('UPDATE classes SET name = ?, color = ?, hotkey = ? WHERE id = ?')
    .run(
      newName,
      color ?? existing.color,
      resolvedHotkey,
      req.params.classId
    );
  res.json(db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.classId));
});

router.delete('/:classId', (req, res) => {
  db.prepare('DELETE FROM classes WHERE id = ? AND project_id = ?')
    .run(req.params.classId, req.params.projectId);
  res.status(204).end();
});

// DELETE /api/projects/:projectId/classes (xoá tất cả nhãn)
router.delete('/', (req, res) => {
  try {
    const projectId = req.params.projectId;
    db.transaction(() => {
      db.prepare('DELETE FROM classes WHERE project_id = ?').run(projectId);
      logActivity(projectId, req.user?.id, 'delete_all_classes', {});
    })();
    res.status(204).end();
  } catch (err) {
    console.error('[delete-all-classes] Error:', err);
    res.status(500).json({ error: `Lỗi khi xoá toàn bộ nhãn: ${err.message}` });
  }
});

// Helper: parse YOLO data.yaml
function parseYoloYaml(content) {
  const lines = content.split(/\r?\n/);
  let inNames = false;
  const names = [];

  // Match inline: names: ['a', 'b'] hoặc names: [a, b]
  const inlineArrayMatch = content.match(/names\s*:\s*\[([^\]]+)\]/);
  if (inlineArrayMatch) {
    return inlineArrayMatch[1]
      .split(',')
      .map(n => n.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^names\s*:\s*$/.test(trimmed) || /^names\s*:\s*#/.test(trimmed)) {
      inNames = true;
      continue;
    }

    if (inNames) {
      if (line.length > 0 && !/^\s/.test(line)) {
        inNames = false;
        continue;
      }

      const listMatch = trimmed.match(/^(?:-\s*|['"]?\d+['"]?\s*:\s*)\s*(.*)$/);
      if (listMatch) {
        const val = listMatch[1].trim().replace(/^['"]|['"]$/g, '');
        if (val) names.push(val);
      } else if (trimmed && !trimmed.startsWith('#')) {
        const val = trimmed.replace(/^['"]|['"]$/g, '');
        if (val) names.push(val);
      }
    }
  }
  return names;
}

// POST /api/projects/:projectId/classes/import-local-yaml
router.post('/import-local-yaml', (req, res) => {
  const { filePath } = req.body;
  if (!filePath || !filePath.trim()) {
    return res.status(400).json({ error: 'Đường dẫn file không được để trống' });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Không tìm thấy file tại đường dẫn: ${filePath}` });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const classNames = parseYoloYaml(content);

    if (classNames.length === 0) {
      return res.status(400).json({ error: 'Không tìm thấy danh sách class trong file YAML hoặc định dạng không đúng (hỗ trợ YOLO format).' });
    }

    const projectId = req.params.projectId;
    const existingClasses = db.prepare('SELECT name FROM classes WHERE project_id = ?').all(projectId);
    const existingNamesLower = new Set(existingClasses.map(c => c.name.toLowerCase()));

    const colorsPalette = ['#F05922', '#251C53', '#4A3F8C', '#2E9E6C', '#C0392B', '#1B9CFC', '#9B59B6', '#E7A83E'];
    let currentCount = db.prepare('SELECT COUNT(*) AS n FROM classes WHERE project_id = ?').get(projectId).n;
    let maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM classes WHERE project_id = ?').get(projectId).m;

    const added = [];
    const insertStmt = db.prepare('INSERT INTO classes (id, project_id, name, color, sort_order, hotkey) VALUES (?, ?, ?, ?, ?, ?)');

    const insertTransaction = db.transaction((namesToInsert) => {
      // Load current hotkeys inside transaction
      const existing = db.prepare('SELECT hotkey FROM classes WHERE project_id = ?').all(projectId);
      const used = new Set(existing.map(e => e.hotkey).filter(Boolean).map(h => h.toLowerCase()));

      for (const name of namesToInsert) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        if (existingNamesLower.has(trimmed.toLowerCase())) continue;

        // Auto-generate unique hotkey inside transaction
        const normalized = trimmed
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]/g, "")
          .toLowerCase();

        let generatedHotkey = null;
        if (normalized) {
          if (normalized.length >= 1 && normalized.length <= 2 && !used.has(normalized)) {
            generatedHotkey = normalized;
          } else {
            const firstChar = normalized.charAt(0);
            if (!used.has(firstChar)) {
              generatedHotkey = firstChar;
            } else if (normalized.length >= 2) {
              const firstTwo = normalized.slice(0, 2);
              if (!used.has(firstTwo)) {
                generatedHotkey = firstTwo;
              }
            }
          }
        }

        if (generatedHotkey) {
          used.add(generatedHotkey);
        }

        const id = nanoid();
        const color = colorsPalette[currentCount % colorsPalette.length];
        insertStmt.run(id, projectId, trimmed, color, maxOrder + 1, generatedHotkey);

        currentCount++;
        maxOrder++;
        existingNamesLower.add(trimmed.toLowerCase());
        added.push(trimmed);
      }
    });

    insertTransaction(classNames);

    logActivity(projectId, req.user?.id, 'import_classes', { method: 'yaml_local', count: added.length, path: filePath, added });

    const classes = db.prepare('SELECT * FROM classes WHERE project_id = ? ORDER BY sort_order ASC').all(projectId);
    res.json(classes);
  } catch (err) {
    console.error('[import-local-yaml] Error:', err);
    res.status(500).json({ error: `Lỗi đọc file hoặc import: ${err.message}` });
  }
});

// POST /api/projects/:projectId/classes/import-bulk
router.post('/import-bulk', (req, res) => {
  const { names } = req.body;
  if (!names || !Array.isArray(names)) {
    return res.status(400).json({ error: 'Danh sách nhãn không hợp lệ' });
  }

  try {
    const projectId = req.params.projectId;
    const existingClasses = db.prepare('SELECT name FROM classes WHERE project_id = ?').all(projectId);
    const existingNamesLower = new Set(existingClasses.map(c => c.name.toLowerCase()));

    const colorsPalette = ['#F05922', '#251C53', '#4A3F8C', '#2E9E6C', '#C0392B', '#1B9CFC', '#9B59B6', '#E7A83E'];
    let currentCount = db.prepare('SELECT COUNT(*) AS n FROM classes WHERE project_id = ?').get(projectId).n;
    let maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM classes WHERE project_id = ?').get(projectId).m;

    const added = [];
    const insertStmt = db.prepare('INSERT INTO classes (id, project_id, name, color, sort_order, hotkey) VALUES (?, ?, ?, ?, ?, ?)');

    const insertTransaction = db.transaction((namesToInsert) => {
      // Load current hotkeys inside transaction
      const existing = db.prepare('SELECT hotkey FROM classes WHERE project_id = ?').all(projectId);
      const used = new Set(existing.map(e => e.hotkey).filter(Boolean).map(h => h.toLowerCase()));

      for (const name of namesToInsert) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        if (existingNamesLower.has(trimmed.toLowerCase())) continue;

        // Auto-generate unique hotkey inside transaction
        const normalized = trimmed
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]/g, "")
          .toLowerCase();

        let generatedHotkey = null;
        if (normalized) {
          if (normalized.length >= 1 && normalized.length <= 2 && !used.has(normalized)) {
            generatedHotkey = normalized;
          } else {
            const firstChar = normalized.charAt(0);
            if (!used.has(firstChar)) {
              generatedHotkey = firstChar;
            } else if (normalized.length >= 2) {
              const firstTwo = normalized.slice(0, 2);
              if (!used.has(firstTwo)) {
                generatedHotkey = firstTwo;
              }
            }
          }
        }

        if (generatedHotkey) {
          used.add(generatedHotkey);
        }

        const id = nanoid();
        const color = colorsPalette[currentCount % colorsPalette.length];
        insertStmt.run(id, projectId, trimmed, color, maxOrder + 1, generatedHotkey);

        currentCount++;
        maxOrder++;
        existingNamesLower.add(trimmed.toLowerCase());
        added.push(trimmed);
      }
    });

    insertTransaction(names);

    logActivity(projectId, req.user?.id, 'import_classes', { method: 'bulk', count: added.length, added });

    const classes = db.prepare('SELECT * FROM classes WHERE project_id = ? ORDER BY sort_order ASC').all(projectId);
    res.json(classes);
  } catch (err) {
    console.error('[import-bulk] Error:', err);
    res.status(500).json({ error: `Lỗi import nhãn: ${err.message}` });
  }
});

export default router;
