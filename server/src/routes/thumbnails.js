import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { db, UPLOAD_DIR, DATA_DIR } from '../db.js';

const router = Router();

/** Thư mục lưu cache thumbnail — tách biệt hoàn toàn khỏi server/data/images/ */
export const THUMB_DIR = path.join(DATA_DIR, 'thumbnails');
fs.mkdirSync(THUMB_DIR, { recursive: true });

const DEFAULT_SIZE = 300;
const MIN_SIZE = 32;
const MAX_SIZE = 600;

/**
 * GET /api/images/:id/thumb?size=300
 *
 * Trả về thumbnail của ảnh (lazy, on-demand):
 *  1. Nếu file thumb đã cache → serve thẳng (không resize lại).
 *  2. Nếu ảnh gốc nhỏ hơn size → serve ảnh gốc trực tiếp (không lãng phí resize).
 *  3. Nếu chưa có → resize bằng sharp → lưu cache → serve.
 *  4. Nếu resize lỗi → fallback serve ảnh gốc (không crash request).
 */
router.get('/:id/thumb', async (req, res) => {
  const size = Math.min(Math.max(parseInt(req.query.size) || DEFAULT_SIZE, MIN_SIZE), MAX_SIZE);

  const image = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
  if (!image) return res.status(404).json({ error: 'Không tìm thấy ảnh' });

  const thumbFilename = `${image.id}_${size}.jpg`;
  const thumbPath = path.join(THUMB_DIR, thumbFilename);

  // Serve thumbnail đã cache
  if (fs.existsSync(thumbPath)) {
    res.set('Cache-Control', 'public, max-age=86400');
    return res.sendFile(thumbPath);
  }

  const originalPath = path.join(UPLOAD_DIR, image.project_id, image.filename);
  if (!fs.existsSync(originalPath)) {
    return res.status(404).json({ error: 'File ảnh gốc không tìm thấy trên disk' });
  }

  // Nếu ảnh gốc đủ nhỏ → không resize, serve trực tiếp
  if (image.width > 0 && image.height > 0 && image.width <= size && image.height <= size) {
    res.set('Cache-Control', 'public, max-age=86400');
    return res.sendFile(originalPath);
  }

  // Resize và cache
  try {
    await sharp(originalPath)
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(thumbPath);

    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(thumbPath);
  } catch (err) {
    console.error(`[thumbnail] Lỗi tạo thumbnail cho ${image.id}:`, err.message);
    // Fallback: trả ảnh gốc thay vì 500
    res.sendFile(originalPath);
  }
});

export default router;
