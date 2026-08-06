import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

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
  db.prepare('INSERT INTO classes (id, project_id, name, color, sort_order, hotkey) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.projectId, name.trim(), color || '#F05922', maxOrder + 1, normalizeHotkey(hotkey));
  res.status(201).json(db.prepare('SELECT * FROM classes WHERE id = ?').get(id));
});

router.patch('/:classId', (req, res) => {
  const existing = db.prepare('SELECT * FROM classes WHERE id = ? AND project_id = ?')
    .get(req.params.classId, req.params.projectId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy nhãn' });
  const { name, color, hotkey } = req.body;
  db.prepare('UPDATE classes SET name = ?, color = ?, hotkey = ? WHERE id = ?')
    .run(
      name ?? existing.name,
      color ?? existing.color,
      hotkey === undefined ? existing.hotkey : normalizeHotkey(hotkey),
      req.params.classId
    );
  res.json(db.prepare('SELECT * FROM classes WHERE id = ?').get(req.params.classId));
});

router.delete('/:classId', (req, res) => {
  db.prepare('DELETE FROM classes WHERE id = ? AND project_id = ?')
    .run(req.params.classId, req.params.projectId);
  res.status(204).end();
});

export default router;
