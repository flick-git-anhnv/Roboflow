import { Router } from 'express';
import archiver from 'archiver';
import path from 'node:path';
import fs from 'node:fs';
import { db, UPLOAD_DIR, logActivity } from '../db.js';

const router = Router({ mergeParams: true });

function loadData(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  const classes = db.prepare('SELECT * FROM classes WHERE project_id = ? ORDER BY sort_order ASC').all(projectId);
  const images = db.prepare('SELECT * FROM images WHERE project_id = ? ORDER BY created_at ASC').all(projectId);
  const classIndex = new Map(classes.map((c, i) => [c.id, i]));
  const annotationsByImage = new Map();
  for (const img of images) {
    const anns = db.prepare('SELECT * FROM annotations WHERE image_id = ?').all(img.id)
      .map((a) => ({ ...a, points: a.points ? JSON.parse(a.points) : null }));
    annotationsByImage.set(img.id, anns);
  }
  return { project, classes, images, classIndex, annotationsByImage };
}

function splitOf(img) {
  return ['train', 'valid', 'test'].includes(img.split) ? img.split : 'train';
}

// Multi-label stratified train/valid split: images manually marked 'test' stay
// in test untouched. The rest gets redistributed so every class ends up
// represented in both train and valid at roughly the requested ratio,
// processing rarest classes first (they have the least room for error).
function stratifiedSplit(images, annotationsByImage, trainRatio) {
  const validRatio = 1 - trainRatio;
  const pool = images.filter((img) => img.split !== 'test');

  const classToImages = new Map();
  const imageClasses = new Map();
  for (const img of pool) {
    const classIds = [...new Set((annotationsByImage.get(img.id) || []).map((a) => a.class_id))];
    imageClasses.set(img.id, classIds);
    for (const cid of classIds) {
      if (!classToImages.has(cid)) classToImages.set(cid, []);
      classToImages.get(cid).push(img.id);
    }
  }

  const orderedClasses = [...classToImages.entries()].sort((a, b) => a[1].length - b[1].length);

  const assignment = new Map(); // imageId -> 'train' | 'valid'

  const shuffle = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  for (const [classId, imgIds] of orderedClasses) {
    let curValid = 0, curTrain = 0;
    for (const id of imgIds) {
      const existing = assignment.get(id);
      if (existing === 'valid') curValid++;
      else if (existing === 'train') curTrain++;
    }
    const count = imgIds.length;
    const target = count === 1 ? 0 : Math.max(1, Math.min(count - 1, Math.round(count * validRatio)));

    for (const id of shuffle(imgIds)) {
      if (assignment.has(id)) continue;
      const bucket = curValid < target ? 'valid' : 'train';
      assignment.set(id, bucket);
      if (bucket === 'valid') curValid++; else curTrain++;
    }
  }

  // Images with no annotations at all: split by the plain overall ratio.
  const unlabeledPool = shuffle(pool.filter((img) => !assignment.has(img.id)));
  const targetValidUnlabeled = Math.round(unlabeledPool.length * validRatio);
  unlabeledPool.forEach((img, i) => assignment.set(img.id, i < targetValidUnlabeled ? 'valid' : 'train'));

  return assignment;
}

router.get('/split-preview', (req, res) => {
  const trainRatio = Math.min(0.95, Math.max(0.5, parseFloat(req.query.trainRatio) || 0.8));
  const { project, classes, images, annotationsByImage } = loadData(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });

  const assignment = stratifiedSplit(images, annotationsByImage, trainRatio);
  const getSplit = (img) => (img.split === 'test' ? 'test' : assignment.get(img.id) || 'train');

  let trainCount = 0, validCount = 0, testCount = 0;
  const perClass = classes.map((c) => ({ class_id: c.id, name: c.name, train: 0, valid: 0 }));
  const perClassById = new Map(perClass.map((c) => [c.class_id, c]));

  for (const img of images) {
    const split = getSplit(img);
    if (split === 'train') trainCount++;
    else if (split === 'valid') validCount++;
    else testCount++;
    if (split === 'train' || split === 'valid') {
      const classIds = new Set((annotationsByImage.get(img.id) || []).map((a) => a.class_id));
      for (const cid of classIds) {
        const entry = perClassById.get(cid);
        if (entry) entry[split]++;
      }
    }
  }

  res.json({ trainCount, validCount, testCount, perClass });
});

router.get('/', (req, res) => {
  const format = (req.query.format || 'yolo').toLowerCase();
  const splitMode = (req.query.splitMode || 'manual').toLowerCase();
  const trainRatio = Math.min(0.95, Math.max(0.5, parseFloat(req.query.trainRatio) || 0.8));
  const { project, classes, images, classIndex, annotationsByImage } = loadData(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Không tìm thấy project' });
  if (!images.length) return res.status(400).json({ error: 'Project chưa có ảnh nào để export' });

  const autoAssignment = splitMode === 'auto' ? stratifiedSplit(images, annotationsByImage, trainRatio) : null;
  const getSplit = autoAssignment
    ? (img) => (img.split === 'test' ? 'test' : autoAssignment.get(img.id) || 'train')
    : splitOf;

  res.attachment(`${project.name.replace(/[^a-z0-9_-]+/gi, '_')}-${format}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).end(String(err)));
  archive.pipe(res);

  const imagePath = (img) => path.join(UPLOAD_DIR, project.id, img.filename);

  const labelType = project.label_type || 'bbox';

  if (labelType === 'classify') {
    const metadataRows = ['filename,split,class_name'];
    for (const img of images) {
      const split = getSplit(img);
      const imageFile = imagePath(img);
      const anns = annotationsByImage.get(img.id) || [];
      const classId = anns[0]?.class_id;
      const cls = classes.find((c) => c.id === classId);
      const className = cls ? cls.name : 'unlabeled';

      if (fs.existsSync(imageFile)) {
        archive.file(imageFile, { name: `images/${split}/${className}/${img.filename}` });
      }
      metadataRows.push(`${img.filename},${split},${className}`);
    }
    archive.append(metadataRows.join('\n'), { name: 'metadata.csv' });
    archive.finalize();
    return;
  }

  if (labelType === 'text_rec') {
    const gtBySplit = { train: [], valid: [], test: [] };
    for (const img of images) {
      const split = getSplit(img);
      const imageFile = imagePath(img);
      const anns = annotationsByImage.get(img.id) || [];
      const text = anns[0]?.text_content || '';

      if (fs.existsSync(imageFile)) {
        archive.file(imageFile, { name: `images/${split}/${img.filename}` });
      }
      gtBySplit[split].push(`images/${split}/${img.filename}\t${text}`);
    }
    for (const split of ['train', 'valid', 'test']) {
      if (gtBySplit[split].length > 0) {
        archive.append(gtBySplit[split].join('\n'), { name: `gt_${split}.txt` });
      }
    }
    archive.finalize();
    return;
  }

  if (format === 'yolo') {
    let hasQuad = false;
    for (const img of images) {
      const split = getSplit(img);
      if (fs.existsSync(imagePath(img))) archive.file(imagePath(img), { name: `images/${split}/${img.filename}` });
      const anns = annotationsByImage.get(img.id) || [];
      const lines = anns.map((a) => {
        if (a.type === 'quad' && Array.isArray(a.points) && a.points.length === 4) {
          hasQuad = true;
          const coords = a.points
            .map((p) => `${(p.x / img.width).toFixed(6)} ${(p.y / img.height).toFixed(6)}`)
            .join(' ');
          return `${classIndex.get(a.class_id)} ${coords}`;
        }
        const cx = (a.x + a.w / 2) / img.width;
        const cy = (a.y + a.h / 2) / img.height;
        const w = a.w / img.width;
        const h = a.h / img.height;
        return `${classIndex.get(a.class_id)} ${cx.toFixed(6)} ${cy.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}`;
      });
      const labelName = img.filename.replace(/\.[^.]+$/, '.txt');
      archive.append(lines.join('\n'), { name: `labels/${split}/${labelName}` });
    }
    const yamlLines = [
      `path: .`,
      `train: images/train`,
      `val: images/valid`,
      `test: images/test`,
      `nc: ${classes.length}`,
      `names: [${classes.map((c) => `'${c.name}'`).join(', ')}]`,
    ];
    if (hasQuad) {
      yamlLines.push(
        '',
        '# Ghi chú: một số nhãn được vẽ dạng 4 điểm (quad, dùng cho biển xiên).',
        '# Các dòng đó dùng định dạng YOLO-OBB 8 giá trị: class x1 y1 x2 y2 x3 y3 x4 y4 (toạ độ chuẩn hoá 0-1).',
        '# Nhãn bbox thường vẫn theo định dạng 5 giá trị chuẩn: class cx cy w h.'
      );
    }
    archive.append(yamlLines.join('\n'), { name: 'data.yaml' });
  } else if (format === 'coco') {
    for (const split of ['train', 'valid', 'test']) {
      const splitImages = images.filter((i) => getSplit(i) === split);
      if (!splitImages.length) continue;
      const cocoImages = [];
      const cocoAnnotations = [];
      let annId = 1;
      splitImages.forEach((img, idx) => {
        const cocoId = idx + 1;
        cocoImages.push({ id: cocoId, file_name: img.filename, width: img.width, height: img.height });
        if (fs.existsSync(imagePath(img))) archive.file(imagePath(img), { name: `${split}/${img.filename}` });
        for (const a of annotationsByImage.get(img.id) || []) {
          const segmentation = a.type === 'quad' && Array.isArray(a.points) && a.points.length === 4
            ? [a.points.flatMap((p) => [p.x, p.y])]
            : [];
          cocoAnnotations.push({
            id: annId++,
            image_id: cocoId,
            category_id: classIndex.get(a.class_id) + 1,
            bbox: [a.x, a.y, a.w, a.h],
            area: a.w * a.h,
            iscrowd: 0,
            segmentation,
          });
        }
      });
      const coco = {
        info: { description: project.name, version: '1.0' },
        images: cocoImages,
        annotations: cocoAnnotations,
        categories: classes.map((c, i) => ({ id: i + 1, name: c.name, supercategory: 'none' })),
      };
      archive.append(JSON.stringify(coco, null, 2), { name: `${split}/_annotations.coco.json` });
    }
  } else if (format === 'voc') {
    for (const img of images) {
      const split = getSplit(img);
      if (fs.existsSync(imagePath(img))) archive.file(imagePath(img), { name: `${split}/${img.filename}` });
      const anns = annotationsByImage.get(img.id) || [];
      const objects = anns.map((a) => {
        const cls = classes.find((c) => c.id === a.class_id);
        const xmin = Math.round(a.x);
        const ymin = Math.round(a.y);
        const xmax = Math.round(a.x + a.w);
        const ymax = Math.round(a.y + a.h);
        const polygonTag = a.type === 'quad' && Array.isArray(a.points) && a.points.length === 4
          ? `\n    <polygon>${a.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}</polygon>`
          : '';
        return `  <object>\n    <name>${cls ? cls.name : 'unknown'}</name>\n    <pose>Unspecified</pose>\n    <truncated>0</truncated>\n    <difficult>0</difficult>\n    <bndbox>\n      <xmin>${xmin}</xmin>\n      <ymin>${ymin}</ymin>\n      <xmax>${xmax}</xmax>\n      <ymax>${ymax}</ymax>\n    </bndbox>${polygonTag}\n  </object>`;
      });
      const xml = `<annotation>\n  <folder>${split}</folder>\n  <filename>${img.filename}</filename>\n  <size>\n    <width>${img.width}</width>\n    <height>${img.height}</height>\n    <depth>3</depth>\n  </size>\n  <segmented>0</segmented>\n${objects.join('\n')}\n</annotation>\n`;
      const xmlName = img.filename.replace(/\.[^.]+$/, '.xml');
      archive.append(xml, { name: `${split}/${xmlName}` });
    }
  } else {
    archive.destroy();
    return res.status(400).json({ error: 'Định dạng export không hợp lệ (yolo | coco | voc)' });
  }

  // STEP-3.3: ghi log khi export được thực hiện (format đã validated → không phải error path)
  logActivity(req.params.projectId, req.user?.id ?? null, 'export', {
    format,
    count: images.length,
  });

  archive.finalize();
});

export default router;
