import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from '../db.js';

/**
 * Compute MD5 hash for a file.
 */
export function md5File(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return createHash('md5').update(content).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Asynchronously backfill missing file_hash values for images in a project.
 * Flexible signature: backfillMissingHashes(dbInstance, projectId) or backfillMissingHashes(projectId) or backfillMissingHashes(dbInstance)
 */
export async function backfillMissingHashes(arg1, arg2) {
  let targetDb = db;
  let projectId = null;

  if (typeof arg1 === 'string') {
    projectId = arg1;
    if (arg2 && typeof arg2 === 'object') targetDb = arg2;
  } else if (arg1 && typeof arg1 === 'object') {
    targetDb = arg1;
    if (typeof arg2 === 'string') projectId = arg2;
  }

  const query = projectId
    ? "SELECT id, filename, project_id FROM images WHERE project_id = ? AND (file_hash IS NULL OR file_hash = '') LIMIT 500"
    : "SELECT id, filename, project_id FROM images WHERE (file_hash IS NULL OR file_hash = '') LIMIT 500";

  const params = projectId ? [projectId] : [];
  const updateStmt = targetDb.prepare('UPDATE images SET file_hash = ? WHERE id = ?');
  let totalCount = 0;

  while (true) {
    const unhashed = targetDb.prepare(query).all(...params);
    if (!unhashed.length) break;

    let count = 0;
    for (const img of unhashed) {
      const pId = img.project_id || projectId;
      const filePath = path.join(UPLOAD_DIR, pId, img.filename);
      try {
        if (fs.existsSync(filePath)) {
          const hash = md5File(filePath);
          if (hash) {
            updateStmt.run(hash, img.id);
            count++;
          }
        }
      } catch (e) {
        console.error(`[hashService] Failed to compute hash for image ${img.id}:`, e.message);
      }
    }
    
    // If no hashes were updated in this batch (e.g. files missing), prevent infinite loop
    if (count === 0) break;
    
    totalCount += count;
    // Yield event loop to avoid blocking main thread
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return totalCount;
}
