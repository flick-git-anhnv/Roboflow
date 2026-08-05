import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { nanoid } from 'nanoid';
import { db, UPLOAD_DIR } from '../db.js';
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
  const images = db.prepare(`
    SELECT i.*,
      (SELECT GROUP_CONCAT(DISTINCT a.class_id) FROM annotations a WHERE a.image_id = i.id) AS class_ids_raw
    FROM images i WHERE i.project_id = ? ORDER BY i.created_at ASC
  `).all(req.params.projectId);
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
  res.json({ ...image, annotations });
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

  res.status(201).json({ created, skipped });
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
  res.status(204).end();
});

export default router;
