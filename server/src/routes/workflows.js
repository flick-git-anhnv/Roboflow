import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';

const router = Router({ mergeParams: true });

/**
 * GET /api/projects/:projectId/workflows
 * Fetch all visual CV workflows for a project
 */
router.get('/', (req, res) => {
  try {
    const { projectId } = req.params;
    const workflows = db.prepare(`
      SELECT * FROM cv_workflows 
      WHERE project_id = ? 
      ORDER BY created_at DESC
    `).all(projectId);

    const parsed = workflows.map((w) => ({
      ...w,
      graph_nodes: JSON.parse(w.graph_nodes || '[]'),
      graph_edges: JSON.parse(w.graph_edges || '[]'),
    }));

    res.json({ success: true, workflows: parsed });
  } catch (err) {
    console.error('[workflows] Error in GET /:', err);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

/**
 * POST /api/projects/:projectId/workflows
 * Create a new visual node graph workflow
 */
router.post('/', (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, graphNodes = [], graphEdges = [], isActive = 0 } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Workflow name is required' });
    }

    const id = nanoid();
    db.prepare(`
      INSERT INTO cv_workflows (id, project_id, name, graph_nodes, graph_edges, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      projectId,
      name.trim(),
      JSON.stringify(graphNodes),
      JSON.stringify(graphEdges),
      isActive ? 1 : 0
    );

    const workflow = db.prepare('SELECT * FROM cv_workflows WHERE id = ?').get(id);

    res.status(201).json({
      success: true,
      workflow: {
        ...workflow,
        graph_nodes: graphNodes,
        graph_edges: graphEdges,
      },
      message: `Đã tạo quy trình đồ họa "${name}" thành công!`,
    });
  } catch (err) {
    console.error('[workflows] Error in POST /:', err);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

/**
 * PUT /api/projects/:projectId/workflows/:workflowId
 * Update an existing visual node workflow
 */
router.put('/:workflowId', (req, res) => {
  try {
    const { projectId, workflowId } = req.params;
    const { name, graphNodes, graphEdges, isActive } = req.body;

    const existing = db.prepare('SELECT * FROM cv_workflows WHERE id = ? AND project_id = ?').get(workflowId, projectId);
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    db.prepare(`
      UPDATE cv_workflows SET
        name = COALESCE(?, name),
        graph_nodes = COALESCE(?, graph_nodes),
        graph_edges = COALESCE(?, graph_edges),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      name ? name.trim() : null,
      graphNodes ? JSON.stringify(graphNodes) : null,
      graphEdges ? JSON.stringify(graphEdges) : null,
      typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null,
      workflowId
    );

    const updated = db.prepare('SELECT * FROM cv_workflows WHERE id = ?').get(workflowId);

    res.json({
      success: true,
      workflow: {
        ...updated,
        graph_nodes: JSON.parse(updated.graph_nodes),
        graph_edges: JSON.parse(updated.graph_edges),
      },
    });
  } catch (err) {
    console.error('[workflows] Error in PUT /:', err);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

/**
 * DELETE /api/projects/:projectId/workflows/:workflowId
 */
router.delete('/:workflowId', (req, res) => {
  try {
    const { projectId, workflowId } = req.params;
    const result = db.prepare('DELETE FROM cv_workflows WHERE id = ? AND project_id = ?').run(workflowId, projectId);
    if (result.changes === 0) return res.status(404).json({ error: 'Workflow not found' });

    res.json({ success: true, deleted: result.changes });
  } catch (err) {
    console.error('[workflows] Error in DELETE /:', err);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

import net from 'net';

function checkPortOpen(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.on('connect', () => {
      status = true;
      socket.destroy();
    });

    socket.setTimeout(timeout);
    socket.on('timeout', () => {
      socket.destroy();
    });

    socket.on('error', () => {});

    socket.on('close', () => {
      resolve(status);
    });

    socket.connect(port || 554, host);
  });
}

/**
 * POST /api/projects/:projectId/workflows/test
 * Simulate a test run of the pipeline on a random image in the project
 */
router.post('/test', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { graphNodes } = req.body;
    
    if (!graphNodes || !Array.isArray(graphNodes)) {
      return res.status(400).json({ error: 'graphNodes is required' });
    }

    const img = db.prepare('SELECT id, filename FROM images WHERE project_id = ? ORDER BY RANDOM() LIMIT 1').get(projectId);
    const targetImage = img ? img.filename : 'camera_stream_01.jpg';
    
    const logs = [];
    logs.push(`[PIPELINE] Khởi tạo luồng thực thi Node Graph trên Server...`);
    logs.push(`[TARGET] Đang xử lý ảnh đầu vào: ${targetImage}`);

    let hasError = false;
    let execTime = 0;

    for (let i = 0; i < graphNodes.length; i++) {
      const n = graphNodes[i];
      const stepTime = 15 + Math.floor(Math.random() * 40);
      execTime += stepTime;
      
      switch (n.type) {
        case 'cameraInput': {
          const urlStr = n.config.url;
          if (!urlStr || !urlStr.startsWith('rtsp://')) {
            logs.push(`[ERROR NODE ${i+1}] RTSP URL không hợp lệ: ${urlStr}`);
            hasError = true;
            break;
          }
          try {
            const urlObj = new URL(urlStr);
            const isOpen = await checkPortOpen(urlObj.hostname, urlObj.port || 554);
            if (!isOpen) {
              logs.push(`[ERROR NODE ${i+1}] Không thể kết nối tới RTSP host: ${urlObj.host}. Connection timeout or refused. (Failed after 2000ms)`);
              hasError = true;
              break;
            }
            logs.push(`[NODE ${i+1}] Đã kết nối nguồn RTSP Stream (${urlStr}) - 30fps, 1080p (${stepTime}ms)`);
          } catch (err) {
            logs.push(`[ERROR NODE ${i+1}] RTSP URL Parse Error: ${err.message}`);
            hasError = true;
          }
          break;
        }
        case 'yoloModel':
          logs.push(`[NODE ${i+1}] Thực thi YOLO Detector (${n.config.model || 'yolov8s'}) với độ tin cậy >= ${n.config.confidence || 0.5}. Phát hiện 2 đối tượng. (${stepTime}ms)`);
          break;
        case 'cropRegion':
          logs.push(`[NODE ${i+1}] Cắt vùng Bounding Box (padding=${n.config.padding || 0}px). Sinh ra 2 sub-images. (${stepTime}ms)`);
          break;
        case 'ocrModel':
          logs.push(`[NODE ${i+1}] Chạy OCR Engine (lang=${n.config.lang || 'eng'}). Nhận diện được đoạn chữ: "30F-123.45" (conf=97.5%). (${stepTime}ms)`);
          break;
        case 'actionAlert':
          logs.push(`[NODE ${i+1}] Kích hoạt Webhook POST tới ${n.config.endpoint || 'API'}. Trạng thái HTTP 200 OK. (${stepTime}ms)`);
          break;
        default:
          logs.push(`[NODE ${i+1}] Đã chạy node tùy chỉnh: ${n.label} (${stepTime}ms)`);
      }
      
      if (hasError) break;
    }

    if (!hasError) {
      logs.push(`[SUCCESS] Hoàn tất quá trình test pipeline trong ${execTime}ms ✓`);
    } else {
      logs.push(`[FAILED] Quá trình test pipeline bị hủy do lỗi kết nối.`);
    }

    res.json({ success: true, logs });
  } catch (err) {
    console.error('[workflows] Error in POST /test:', err);
    res.status(500).json({ error: 'Failed to test workflow' });
  }
});

export default router;
