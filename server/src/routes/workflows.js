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

export default router;
