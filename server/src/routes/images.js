import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { nanoid } from 'nanoid';
import { db, UPLOAD_DIR, logActivity } from '../db.js';
import { requireRole } from '../middleware/roles.js';

const router = Router({ mergeParams: true });

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|bmp)$/i;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB / ảnh
const MAX_ZIP_SIZE = 2 * 1024 * 1024 * 1024; // 2GB / file zip
const MAX_FILES_PER_UPLOAD = 20000;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.params.projectId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${nanoid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_UPLOAD },
  fileFilter: (req, file, cb) => {
    const ok = IMAGE_EXT_RE.test(file.originalname);
    cb(ok ? null : new Error('Chỉ hỗ trợ file ảnh JPG, PNG, WEBP, BMP'), ok);
  },
});

const zipUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `${nanoid()}.zip`),
  }),
  limits: { fileSize: MAX_ZIP_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok = /\.zip$/i.test(file.originalname);
    cb(ok ? null : new Error('Chỉ chấp nhận file .zip'), ok);
  },
});

router.get('/', (req, res) => {
  const { projectId } = req.params;

  // Phân công % công việc: nếu project ĐANG dùng tính năng gán việc (có ≥1 user
  // percent > 0), annotator CHỈ thấy ảnh được gán cho chính mình — admin/reviewer
  // luôn thấy toàn bộ (cần để duyệt/quản lý). Project chưa cấu hình phân công thì
  // hành vi giữ nguyên như cũ (không lọc gì) — tương thích ngược 100%.
  let assignmentFilter = '';
  const params = [projectId];
  if (req.user?.role === 'annotator') {
    const usingAssignment = db.prepare(
      'SELECT 1 FROM project_assignments WHERE project_id = ? AND percent > 0 LIMIT 1'
    ).get(projectId);
    if (usingAssignment) {
      assignmentFilter = ' AND i.assigned_to = ?';
      params.push(req.user.id);
    }
  }

  const images = db.prepare(`
    SELECT i.*,
      (SELECT GROUP_CONCAT(DISTINCT a.class_id) FROM annotations a WHERE a.image_id = i.id) AS class_ids_raw
    FROM images i WHERE i.project_id = ?${assignmentFilter} ORDER BY i.created_at ASC
  `).all(...params);
  res.json(images.map((i) => ({
    ...i,
    class_ids_raw: undefined,
    class_ids: i.class_ids_raw ? i.class_ids_raw.split(',') : [],
    thumbnail_url: `/api/images/${i.id}/thumb`,
  })));
});

router.get('/:imageId', (req, res) => {
  const image = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
    .get(req.params.imageId, req.params.projectId);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });
  const annotations = db.prepare('SELECT * FROM annotations WHERE image_id = ?').all(image.id)
    .map((a) => ({ ...a, points: a.points ? JSON.parse(a.points) : null }));
  // STEP-3.4: Trả annotationVersion để client biết expectedVersion cho optimistic locking
  const { annotationVersion } = db.prepare(
    'SELECT COALESCE(MAX(version), 0) AS annotationVersion FROM annotation_history WHERE image_id = ?'
  ).get(image.id);
  res.json({ ...image, annotations, annotationVersion });
});

router.post('/upload', upload.array('images', MAX_FILES_PER_UPLOAD), async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const uploaderId = req.user?.id ?? null; // AD-A5: ghi người upload để enforce owner-delete
  const created = [];
  const insert = db.prepare(`
    INSERT INTO images (id, project_id, filename, original_name, width, height, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const file of req.files || []) {
    try {
      const meta = await sharp(file.path).metadata();
      const id = nanoid();
      insert.run(id, req.params.projectId, file.filename, file.originalname, meta.width || 0, meta.height || 0, uploaderId);
      created.push(db.prepare('SELECT * FROM images WHERE id = ?').get(id));
    } catch (e) {
      fs.unlink(file.path, () => {});
    }
  }
  // STEP-3.3: ghi activity log sau khi upload thành công
  if (created.length > 0) {
    logActivity(req.params.projectId, req.user?.id ?? null, 'image_upload', {
      count: created.length,
      names: created.map((i) => i.original_name),
    });
  }

  res.status(201).json(created);
});

router.post('/upload-zip', zipUpload.single('zip'), async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });
  if (!req.file) return res.status(400).json({ error: 'Không nhận được file zip' });

  const destDir = path.join(UPLOAD_DIR, req.params.projectId);
  fs.mkdirSync(destDir, { recursive: true });

  const uploaderId = req.user?.id ?? null;
  const created = [];
  let skipped = 0;
  const insert = db.prepare(`
    INSERT INTO images (id, project_id, filename, original_name, width, height, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries().filter((e) => !e.isDirectory && IMAGE_EXT_RE.test(e.entryName));
    if (!entries.length) {
      return res.status(400).json({ error: 'File zip không chứa ảnh hợp lệ (JPG, PNG, WEBP, BMP)' });
    }
    if (entries.length > MAX_FILES_PER_UPLOAD) {
      return res.status(400).json({ error: `File zip chứa quá nhiều ảnh (tối đa ${MAX_FILES_PER_UPLOAD})` });
    }

    for (const entry of entries) {
      try {
        const buffer = entry.getData();
        const meta = await sharp(buffer).metadata();
        const ext = path.extname(entry.entryName).toLowerCase() || '.jpg';
        const filename = `${nanoid()}${ext}`;
        fs.writeFileSync(path.join(destDir, filename), buffer);
        const id = nanoid();
        insert.run(id, req.params.projectId, filename, path.basename(entry.entryName), meta.width || 0, meta.height || 0, uploaderId);
        created.push(db.prepare('SELECT * FROM images WHERE id = ?').get(id));
      } catch {
        skipped++;
      }
    }
  } catch (e) {
    return res.status(400).json({ error: 'Không đọc được file zip: ' + e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }

  // STEP-3.3: ghi activity log sau khi upload zip thành công
  if (created.length > 0) {
    logActivity(req.params.projectId, req.user?.id ?? null, 'image_upload', {
      count: created.length,
      names: [req.file.originalname],
      source: 'zip',
    });
  }

  res.status(201).json({ created, skipped });
});

// ── PATCH /batch — đổi split hàng loạt ─────────────────────────────────────
// STEP-5.3 Body: { imageIds: string[], split: 'train' | 'valid' | 'test' }
// Role: tất cả role đều được đổi split (cùng pattern PATCH /:imageId — không hạn chế split).
// batch-assign-class: KHÔNG implement — class gắn với annotation, không phải image;
// "gán class cho ảnh" sẽ tạo ra annotation không có bbox → vô nghĩa về mặt dữ liệu.
router.patch('/batch', (req, res) => {
  const { imageIds, split } = req.body;
  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    return res.status(400).json({ error: 'imageIds phải là mảng không rỗng' });
  }
  if (split !== undefined && !['train', 'valid', 'test'].includes(split)) {
    return res.status(400).json({ error: 'split phải là train, valid hoặc test' });
  }

  const placeholders = imageIds.map(() => '?').join(',');
  const found = db.prepare(
    `SELECT * FROM images WHERE id IN (${placeholders}) AND project_id = ?`
  ).all(...imageIds, req.params.projectId);

  if (found.length !== imageIds.length) {
    const foundSet = new Set(found.map((i) => i.id));
    const missing = imageIds.filter((id) => !foundSet.has(id));
    return res.status(404).json({ error: `Không tìm thấy ảnh: ${missing.join(', ')}` });
  }

  if (split !== undefined) {
    db.prepare(`UPDATE images SET split = ? WHERE id IN (${placeholders})`)
      .run(split, ...imageIds);
    logActivity(req.params.projectId, req.user?.id ?? null, 'batch_split_change', {
      count: imageIds.length,
      to: split,
    });
  }

  const updated = db.prepare(`SELECT * FROM images WHERE id IN (${placeholders})`).all(...imageIds);
  res.json(updated);
});

// ── DELETE /batch — xoá nhiều ảnh ────────────────────────────────────────────
// STEP-5.3 Body: { imageIds: string[] }
// Role: annotator chỉ xoá ảnh mình upload; reviewer/admin xoá bất kỳ.
//       Nếu 1 ảnh trong batch không đủ quyền → 403 toàn batch (không xoá 1 phần).
router.delete('/batch', (req, res) => {
  const { imageIds } = req.body;
  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    return res.status(400).json({ error: 'imageIds phải là mảng không rỗng' });
  }

  const placeholders = imageIds.map(() => '?').join(',');
  const found = db.prepare(
    `SELECT * FROM images WHERE id IN (${placeholders}) AND project_id = ?`
  ).all(...imageIds, req.params.projectId);

  if (found.length !== imageIds.length) {
    const foundSet = new Set(found.map((i) => i.id));
    const missing = imageIds.filter((id) => !foundSet.has(id));
    return res.status(404).json({ error: `Không tìm thấy ảnh: ${missing.join(', ')}` });
  }

  // Role check: annotator chỉ xoá ảnh mình upload; nếu 1 ảnh không đủ quyền → từ chối cả batch
  if (req.user?.role === 'annotator') {
    const unauthorized = found.filter(
      (img) => img.uploaded_by === null || img.uploaded_by !== req.user.id
    );
    if (unauthorized.length > 0) {
      return res.status(403).json({
        error: 'AUTH_FORBIDDEN',
        detail: `Annotator chỉ được xoá ảnh của mình. Có ${unauthorized.length} ảnh trong batch không thuộc quyền sở hữu.`,
        unauthorizedIds: unauthorized.map((i) => i.id),
      });
    }
  }

  // Xoá file vật lý
  for (const img of found) {
    fs.unlink(path.join(UPLOAD_DIR, req.params.projectId, img.filename), () => {});
  }

  // Xoá DB — CASCADE tự xoá annotations + annotation_history liên quan
  db.prepare(`DELETE FROM images WHERE id IN (${placeholders})`).run(...imageIds);

  logActivity(req.params.projectId, req.user?.id ?? null, 'batch_image_delete', {
    count: found.length,
    filenames: found.map((i) => i.original_name),
  });

  res.status(204).end();
});

router.patch('/:imageId', (req, res) => {
  const existing = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
    .get(req.params.imageId, req.params.projectId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  const { split, status } = req.body;

  // AD-A5: Bỏ đánh dấu "Xong" (status='unlabeled') của người khác → annotator không được
  if (status === 'unlabeled' && req.user?.role === 'annotator') {
    const isOwner = existing.uploaded_by !== null && existing.uploaded_by === req.user.id;
    if (!isOwner) {
      return res.status(403).json({ error: 'AUTH_FORBIDDEN', detail: 'Annotator chỉ được bỏ done ảnh của mình' });
    }
  }

  db.prepare('UPDATE images SET split = ?, status = ? WHERE id = ?')
    .run(split ?? existing.split, status ?? existing.status, req.params.imageId);

  // STEP-3.3: ghi log khi split thực sự thay đổi
  if (split !== undefined && split !== null && split !== existing.split) {
    logActivity(req.params.projectId, req.user?.id ?? null, 'split_change', {
      image_id: req.params.imageId,
      from: existing.split,
      to: split,
    });
  }

  res.json(db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.imageId));
});

// ── POST /:imageId/mark-done ──────────────────────────────────────────────────
// STEP-3.5: Đánh dấu ảnh đã hoàn thành label (tất cả role được phép).
// Body: {} (không cần field nào)
// Response: ImageItem với completed_at và completed_by đã cập nhật.
router.post('/:imageId/mark-done', (req, res) => {
  const existing = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
    .get(req.params.imageId, req.params.projectId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  const now = new Date().toISOString();
  db.prepare('UPDATE images SET completed_at = ?, completed_by = ? WHERE id = ?')
    .run(now, req.user.id, req.params.imageId);

  logActivity(req.params.projectId, req.user.id, 'image_marked_done', {
    image_id: req.params.imageId,
    filename: existing.original_name,
  });

  res.json(db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.imageId));
});

// ── DELETE /:imageId/mark-done ────────────────────────────────────────────────
// STEP-3.5: Bỏ đánh dấu "Xong".
// annotator: chỉ được bỏ done ảnh MÌnh đã mark (completed_by === req.user.id)
// reviewer/admin: được bỏ done bất kỳ ảnh
router.delete('/:imageId/mark-done', (req, res) => {
  const existing = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
    .get(req.params.imageId, req.params.projectId);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  if (!existing.completed_at) {
    return res.status(409).json({
      error: 'IMAGE_NOT_DONE',
      detail: 'Ảnh chưa được đánh dấu "Xong" — không có gì để bỏ.',
    });
  }

  // Role check: annotator chỉ được bỏ done của chính mình
  if (req.user?.role === 'annotator' && existing.completed_by !== req.user.id) {
    return res.status(403).json({
      error: 'AUTH_FORBIDDEN',
      detail: 'Annotator chỉ được bỏ đánh dấu "Xong" ảnh do mình đánh dấu.',
    });
  }

  db.prepare('UPDATE images SET completed_at = NULL, completed_by = NULL WHERE id = ?')
    .run(req.params.imageId);

  logActivity(req.params.projectId, req.user.id, 'image_unmarked_done', {
    image_id: req.params.imageId,
    filename: existing.original_name,
  });

  res.json(db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.imageId));
});

// AD-A5: Xoá ảnh MÌNH upload (annotator = self only; reviewer/admin = any)
router.delete('/:imageId', (req, res) => {
  const existing = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
    .get(req.params.imageId, req.params.projectId);
  if (!existing) return res.status(204).end(); // idempotent

  if (req.user?.role === 'annotator') {
    const isOwner = existing.uploaded_by !== null && existing.uploaded_by === req.user.id;
    if (!isOwner) {
      return res.status(403).json({ error: 'AUTH_FORBIDDEN', detail: 'Annotator chỉ được xoá ảnh mình upload' });
    }
  }

  fs.unlink(path.join(UPLOAD_DIR, req.params.projectId, existing.filename), () => {});
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.imageId);

  // STEP-3.3: ghi log sau khi xoá ảnh thành công
  logActivity(req.params.projectId, req.user?.id ?? null, 'image_delete', {
    image_id: req.params.imageId,
    filename: existing.original_name,
  });

  res.status(204).end();
});

export default router;
