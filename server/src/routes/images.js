import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { db, UPLOAD_DIR, logActivity } from '../db.js';

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

// GET /api/projects/:projectId/images - Paginated & Filtered images API
router.get('/', (req, res) => {
  const { projectId } = req.params;
  const { status, split, classId, search, q, assignedTo, completed, page: pageParam, limit: limitParam } = req.query;

  const isPaginated = pageParam !== undefined || limitParam !== undefined;

  let page = parseInt(pageParam, 10);
  if (isNaN(page) || page < 1) {
    page = 1;
  }

  let limit;
  if (isPaginated) {
    limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1) {
      limit = 50;
    } else if (limit > 200) {
      limit = 200;
    }
  } else {
    limit = null;
  }

  const offset = isPaginated ? (page - 1) * limit : 0;

  const searchQuery = search || q;

  const conditions = ['i.project_id = ?'];
  const params = [projectId];

  // Phân công % công việc rule
  if (req.user?.role === 'annotator') {
    const usingAssignment = db.prepare(
      'SELECT 1 FROM project_assignments WHERE project_id = ? AND percent > 0 LIMIT 1'
    ).get(projectId);
    if (usingAssignment) {
      conditions.push('i.assigned_to = ?');
      params.push(req.user.id);
    }
  }

  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }

  if (split) {
    conditions.push('i.split = ?');
    params.push(split);
  }

  if (assignedTo) {
    const targetUid = assignedTo === 'me' ? req.user?.id : parseInt(assignedTo, 10);
    if (targetUid) {
      conditions.push('i.assigned_to = ?');
      params.push(targetUid);
    }
  }

  if (completed === 'true') {
    conditions.push('i.completed_at IS NOT NULL');
  } else if (completed === 'false') {
    conditions.push('i.completed_at IS NULL');
  }

  if (searchQuery && searchQuery.trim()) {
    conditions.push('(i.filename LIKE ? OR i.original_name LIKE ?)');
    const pattern = `%${searchQuery.trim()}%`;
    params.push(pattern, pattern);
  }

  if (classId) {
    conditions.push('EXISTS (SELECT 1 FROM annotations a WHERE a.image_id = i.id AND a.class_id = ?)');
    params.push(classId);
  }

  const whereClause = conditions.join(' AND ');

  const countRow = db.prepare(`SELECT COUNT(*) AS total FROM images i WHERE ${whereClause}`).get(...params);
  const total = countRow ? countRow.total : 0;
  const totalPages = isPaginated ? (Math.ceil(total / limit) || 1) : 1;

  let querySql = `
    SELECT i.*,
      (SELECT GROUP_CONCAT(DISTINCT a.class_id) FROM annotations a WHERE a.image_id = i.id) AS class_ids_raw
    FROM images i
    WHERE ${whereClause}
    ORDER BY i.created_at ASC
  `;

  const queryParams = [...params];
  if (isPaginated) {
    querySql += ' LIMIT ? OFFSET ?';
    queryParams.push(limit, offset);
  }

  const images = db.prepare(querySql).all(...queryParams);

  const formattedImages = images.map((i) => ({
    ...i,
    class_ids_raw: undefined,
    class_ids: i.class_ids_raw ? i.class_ids_raw.split(',') : [],
    thumbnail_url: `/api/images/${i.id}/thumb`,
  }));

  if (isPaginated) {
    return res.json({
      images: formattedImages,
      total,
      page,
      limit,
      totalPages,
    });
  }

  res.json(formattedImages);
});

router.get('/:imageId', (req, res) => {
  const image = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
    .get(req.params.imageId, req.params.projectId);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });
  const annotations = db.prepare('SELECT * FROM annotations WHERE image_id = ?').all(image.id)
    .map((a) => ({ ...a, points: a.points ? JSON.parse(a.points) : null }));
  const { annotationVersion } = db.prepare(
    'SELECT COALESCE(MAX(version), 0) AS annotationVersion FROM annotation_history WHERE image_id = ?'
  ).get(image.id);
  res.json({ ...image, annotations, annotationVersion });
});

router.post('/upload', upload.array('images', MAX_FILES_PER_UPLOAD), async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const checkDuplicate = req.query.checkDuplicate === 'true' || req.body.checkDuplicate === 'true';
  const uploaderId = req.user?.id ?? null;
  const files = req.files || [];
  let duplicated = 0;

  // 1. Process files in parallel (hashing & sharp metadata extraction)
  const processedFiles = await Promise.all(
    files.map(async (file) => {
      try {
        const fileBuffer = fs.readFileSync(file.path);
        const fileHash = createHash('md5').update(fileBuffer).digest('hex');

        if (checkDuplicate) {
          const existing = db.prepare('SELECT 1 FROM images WHERE project_id = ? AND file_hash = ? LIMIT 1')
            .get(req.params.projectId, fileHash);
          if (existing) {
            fs.unlink(file.path, () => {});
            return { type: 'duplicate' };
          }
        }

        const meta = await sharp(file.path).metadata();
        return {
          type: 'valid',
          item: {
            id: nanoid(),
            projectId: req.params.projectId,
            filename: file.filename,
            originalname: file.originalname,
            width: meta.width || 0,
            height: meta.height || 0,
            uploaderId,
            fileHash,
            tempPath: file.path,
          }
        };
      } catch (e) {
        fs.unlink(file.path, () => {});
        return { type: 'error' };
      }
    })
  );

  const validItems = [];
  for (const r of processedFiles) {
    if (r.type === 'valid') validItems.push(r.item);
    else if (r.type === 'duplicate') duplicated++;
  }

  const created = [];
  if (validItems.length > 0) {
    const insert = db.prepare(`
      INSERT INTO images (id, project_id, filename, original_name, width, height, uploaded_by, file_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 2. Perform all database insertions in a single transaction
    const insertTx = db.transaction((items) => {
      for (const item of items) {
        insert.run(
          item.id,
          item.projectId,
          item.filename,
          item.originalname,
          item.width,
          item.height,
          item.uploaderId,
          item.fileHash
        );
      }
    });

    try {
      insertTx(validItems);

      // 3. Batch query the inserted items back from the database
      const placeholders = validItems.map(() => '?').join(',');
      const inserted = db.prepare(`SELECT * FROM images WHERE id IN (${placeholders})`)
        .all(...validItems.map((item) => item.id));
      created.push(...inserted);

      logActivity(req.params.projectId, req.user?.id ?? null, 'image_upload', {
        count: created.length,
        names: created.map((i) => i.original_name),
      });
    } catch (err) {
      // Cleanup temp files if transaction fails
      for (const item of validItems) {
        fs.unlink(item.tempPath, () => {});
      }
      return res.status(500).json({ error: 'Lỗi lưu trữ cơ sở dữ liệu: ' + err.message });
    }
  }

  if (checkDuplicate) {
    res.status(201).json({ created, duplicated });
  } else {
    res.status(201).json(created);
  }
});

router.post('/upload-zip', zipUpload.single('zip'), async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });
  if (!req.file) return res.status(400).json({ error: 'Không nhận được file zip' });

  const checkDuplicate = req.query.checkDuplicate === 'true' || req.body.checkDuplicate === 'true';
  const destDir = path.join(UPLOAD_DIR, req.params.projectId);
  fs.mkdirSync(destDir, { recursive: true });

  const uploaderId = req.user?.id ?? null;
  let skipped = 0;
  let duplicated = 0;

  try {
    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries().filter((e) => !e.isDirectory && IMAGE_EXT_RE.test(e.entryName));
    if (!entries.length) {
      return res.status(400).json({ error: 'File zip không chứa ảnh hợp lệ (JPG, PNG, WEBP, BMP)' });
    }
    if (entries.length > MAX_FILES_PER_UPLOAD) {
      return res.status(400).json({ error: `File zip chứa quá nhiều ảnh (tối đa ${MAX_FILES_PER_UPLOAD})` });
    }

    // 1. Process entries in parallel
    const processedEntries = await Promise.all(
      entries.map(async (entry) => {
        try {
          const buffer = entry.getData();
          const fileHash = createHash('md5').update(buffer).digest('hex');

          if (checkDuplicate) {
            const existing = db.prepare('SELECT 1 FROM images WHERE project_id = ? AND file_hash = ? LIMIT 1')
              .get(req.params.projectId, fileHash);
            if (existing) {
              return { type: 'duplicate' };
            }
          }

          const meta = await sharp(buffer).metadata();
          const ext = path.extname(entry.entryName).toLowerCase() || '.jpg';
          const filename = `${nanoid()}${ext}`;
          
          fs.writeFileSync(path.join(destDir, filename), buffer);

          return {
            type: 'valid',
            item: {
              id: nanoid(),
              projectId: req.params.projectId,
              filename,
              originalname: path.basename(entry.entryName),
              width: meta.width || 0,
              height: meta.height || 0,
              uploaderId,
              fileHash,
            }
          };
        } catch (err) {
          return { type: 'error' };
        }
      })
    );

    const validItems = [];
    for (const r of processedEntries) {
      if (r.type === 'valid') validItems.push(r.item);
      else if (r.type === 'duplicate') duplicated++;
      else if (r.type === 'error') skipped++;
    }

    const created = [];
    if (validItems.length > 0) {
      const insert = db.prepare(`
        INSERT INTO images (id, project_id, filename, original_name, width, height, uploaded_by, file_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // 2. Perform all database insertions in a single transaction
      const insertTx = db.transaction((items) => {
        for (const item of items) {
          insert.run(
            item.id,
            item.projectId,
            item.filename,
            item.originalname,
            item.width,
            item.height,
            item.uploaderId,
            item.fileHash
          );
        }
      });

      insertTx(validItems);

      // 3. Batch query the inserted items back
      const placeholders = validItems.map(() => '?').join(',');
      const inserted = db.prepare(`SELECT * FROM images WHERE id IN (${placeholders})`)
        .all(...validItems.map((item) => item.id));
      created.push(...inserted);
    }

    if (created.length > 0) {
      logActivity(req.params.projectId, req.user?.id ?? null, 'image_upload', {
        count: created.length,
        names: [req.file.originalname],
        source: 'zip',
      });
    }

    if (checkDuplicate) {
      res.status(201).json({ created, skipped, duplicated });
    } else {
      res.status(201).json({ created, skipped });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Không đọc được file zip: ' + e.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

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

  for (const img of found) {
    fs.unlink(path.join(UPLOAD_DIR, req.params.projectId, img.filename), () => {});
  }

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

  if (status === 'unlabeled' && req.user?.role === 'annotator') {
    const isOwner = existing.uploaded_by !== null && existing.uploaded_by === req.user.id;
    if (!isOwner) {
      return res.status(403).json({ error: 'AUTH_FORBIDDEN', detail: 'Annotator chỉ được bỏ done ảnh của mình' });
    }
  }

  db.prepare('UPDATE images SET split = ?, status = ? WHERE id = ?')
    .run(split ?? existing.split, status ?? existing.status, req.params.imageId);

  if (split !== undefined && split !== null && split !== existing.split) {
    logActivity(req.params.projectId, req.user?.id ?? null, 'split_change', {
      image_id: req.params.imageId,
      from: existing.split,
      to: split,
    });
  }

  res.json(db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.imageId));
});

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

router.delete('/:imageId', (req, res) => {
  const existing = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?')
    .get(req.params.imageId, req.params.projectId);
  if (!existing) return res.status(204).end();

  if (req.user?.role === 'annotator') {
    const isOwner = existing.uploaded_by !== null && existing.uploaded_by === req.user.id;
    if (!isOwner) {
      return res.status(403).json({ error: 'AUTH_FORBIDDEN', detail: 'Annotator chỉ được xoá ảnh mình upload' });
    }
  }

  fs.unlink(path.join(UPLOAD_DIR, req.params.projectId, existing.filename), () => {});
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.imageId);

  logActivity(req.params.projectId, req.user?.id ?? null, 'image_delete', {
    image_id: req.params.imageId,
    filename: existing.original_name,
  });

  res.status(204).end();
});

export default router;
