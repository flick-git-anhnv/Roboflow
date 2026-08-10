import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const router = Router({ mergeParams: true });

/**
 * GET /api/projects/:projectId/versions
 * List all dataset versions for a project
 */
router.get('/', (req, res) => {
  try {
    const { projectId } = req.params;
    const versions = db.prepare(`
      SELECT * FROM dataset_versions 
      WHERE project_id = ? 
      ORDER BY created_at DESC
    `).all(projectId);

    const parsed = versions.map((v) => ({
      ...v,
      augmentation_config: v.augmentation_config ? JSON.parse(v.augmentation_config) : {},
      preprocessing_config: v.preprocessing_config ? JSON.parse(v.preprocessing_config) : {},
    }));

    res.json({ success: true, versions: parsed });
  } catch (err) {
    console.error('[versions] Error in GET /:', err);
    res.status(500).json({ error: 'Failed to fetch dataset versions' });
  }
});

/**
 * POST /api/projects/:projectId/versions
 * Generate a new immutable Dataset Version with Augmentation settings
 */
router.post('/', (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      versionName,
      trainSplit = 0.7,
      valSplit = 0.2,
      testSplit = 0.1,
      augmentationConfig = {},
      preprocessingConfig = {},
    } = req.body;

    if (!versionName || typeof versionName !== 'string') {
      return res.status(400).json({ error: 'versionName is required' });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const totalImages = db.prepare('SELECT COUNT(*) as cnt FROM images WHERE project_id = ?').get(projectId).cnt;

    const id = nanoid();
    db.prepare(`
      INSERT INTO dataset_versions (
        id, project_id, version_name, train_split, val_split, test_split,
        augmentation_config, preprocessing_config, images_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      projectId,
      versionName.trim(),
      trainSplit,
      valSplit,
      testSplit,
      JSON.stringify(augmentationConfig),
      JSON.stringify(preprocessingConfig),
      totalImages
    );

    const newVersion = db.prepare('SELECT * FROM dataset_versions WHERE id = ?').get(id);

    res.status(201).json({
      success: true,
      version: {
        ...newVersion,
        augmentation_config: augmentationConfig,
        preprocessing_config: preprocessingConfig,
      },
      message: `Đã tạo phiên bản Dataset ${versionName} với ${totalImages} ảnh và cấu hình Augmentation`,
    });
  } catch (err) {
    console.error('[versions] Error in POST /:', err);
    res.status(500).json({ error: 'Failed to create dataset version' });
  }
});

/**
 * POST /api/projects/:projectId/images/tile
 * Image Tiling / Slice Inference (Split 4K/8K images into 640x640 tiles)
 */
router.post('/images/tile', (req, res) => {
  try {
    const { projectId } = req.params;
    const { imageId, tileSize = 640, overlap = 0.2 } = req.body;

    const img = db.prepare('SELECT * FROM images WHERE id = ? AND project_id = ?').get(imageId, projectId);
    if (!img) return res.status(404).json({ error: 'Image not found' });

    const cols = Math.ceil(img.width / (tileSize * (1 - overlap)));
    const rows = Math.ceil(img.height / (tileSize * (1 - overlap)));
    const totalTiles = cols * rows;

    const tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tiles.push({
          tileId: `${img.id}_tile_${r}_${c}`,
          row: r,
          col: c,
          x: Math.min(img.width - tileSize, Math.round(c * tileSize * (1 - overlap))),
          y: Math.min(img.height - tileSize, Math.round(r * tileSize * (1 - overlap))),
          width: Math.min(tileSize, img.width),
          height: Math.min(tileSize, img.height),
        });
      }
    }

    res.json({
      success: true,
      imageId: img.id,
      originalWidth: img.width,
      originalHeight: img.height,
      tileSize,
      totalTiles,
      tiles,
    });
  } catch (err) {
    console.error('[tiling] Error in POST /images/tile:', err);
    res.status(500).json({ error: 'Failed to tile image' });
  }
});

/**
 * DELETE /api/projects/:projectId/versions/:versionId
 * Delete a dataset version
 */
router.delete('/:versionId', (req, res) => {
  try {
    const { projectId, versionId } = req.params;
    const result = db.prepare('DELETE FROM dataset_versions WHERE id = ? AND project_id = ?').run(versionId, projectId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Dataset version not found' });
    }
    
    res.json({ success: true, deleted: result.changes });
  } catch (err) {
    console.error('[versions] Error in DELETE /:', err);
    res.status(500).json({ error: 'Failed to delete dataset version' });
  }
});

export default router;
