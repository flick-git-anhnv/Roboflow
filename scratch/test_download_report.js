import assert from 'node:assert/strict';

// Mock browser globals
let appendedElements = [];
let removedElements = [];
let clickedElements = [];
let createdObjectUrls = [];
let revokedObjectUrls = [];

global.getToken = () => 'test-jwt-token-123';
global.window = {
  URL: {
    createObjectURL: (blob) => {
      const url = `blob:http://localhost/uuid-${createdObjectUrls.length + 1}`;
      createdObjectUrls.push({ url, blob });
      return url;
    },
    revokeObjectURL: (url) => {
      revokedObjectUrls.push(url);
    },
  },
};

global.document = {
  body: {
    appendChild: (elem) => {
      appendedElements.push(elem);
    },
  },
  createElement: (tagName) => {
    const elem = {
      tagName,
      href: '',
      download: '',
      click: () => {
        clickedElements.push(elem);
      },
      remove: () => {
        removedElements.push(elem);
      },
    };
    return elem;
  },
};

// Define downloadReport as in client/src/api.ts
async function downloadReport(projectId, format = 'csv', projectName = 'project') {
  const token = typeof getToken === 'function' ? getToken() : null;
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`http://localhost:4000/api/projects/${projectId}/reports/export?format=${format}`, {
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let errorMsg = 'Không thể tải file báo cáo';
    try {
      const errData = await res.json();
      if (errData.error) errorMsg = errData.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeProjectName = (projectName || 'project').replace(/[^a-z0-9_-]/gi, '_');
  a.download = `report_${safeProjectName}_${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// Test cases
async function runTests() {
  console.log('Testing downloadReport logic...');

  // Mock global fetch
  let lastFetchUrl = '';
  let lastFetchHeaders = {};

  global.fetch = async (url, opts) => {
    lastFetchUrl = url;
    lastFetchHeaders = opts.headers;
    if (url.includes('error-proj')) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: 'Dự án không tồn tại' }),
      };
    }
    return {
      ok: true,
      status: 200,
      blob: async () => new Blob(['dummy content'], { type: url.includes('json') ? 'application/json' : 'text/csv' }),
    };
  };

  // Test 1: CSV Export
  appendedElements = [];
  removedElements = [];
  clickedElements = [];
  createdObjectUrls = [];
  revokedObjectUrls = [];

  await downloadReport('proj-123', 'csv', 'Roboflow Demo');
  assert.ok(lastFetchUrl.endsWith('?format=csv'), 'Fetch URL must end with ?format=csv');
  assert.equal(lastFetchHeaders['Authorization'], 'Bearer test-jwt-token-123', 'Authorization header must be set');
  assert.equal(appendedElements.length, 1, 'Anchor element appended to body');
  assert.equal(clickedElements.length, 1, 'Anchor element clicked');
  assert.equal(removedElements.length, 1, 'Anchor element removed');
  assert.equal(createdObjectUrls.length, 1, 'ObjectURL created');
  assert.equal(revokedObjectUrls.length, 1, 'ObjectURL revoked');
  assert.ok(appendedElements[0].download.startsWith('report_Roboflow_Demo_'), 'Filename should sanitize spaces');
  assert.ok(appendedElements[0].download.endsWith('.csv'), 'Filename extension should be .csv');
  console.log('✔ Test 1 PASS: CSV export, header, filename & URL cleanup verified');

  // Test 2: JSON Export
  appendedElements = [];
  removedElements = [];
  clickedElements = [];
  createdObjectUrls = [];
  revokedObjectUrls = [];

  await downloadReport('proj-456', 'json', 'Project/Special#Name!');
  assert.ok(lastFetchUrl.endsWith('?format=json'), 'Fetch URL must end with ?format=json');
  assert.ok(appendedElements[0].download.startsWith('report_Project_Special_Name__'), 'Sanitizes special chars');
  assert.ok(appendedElements[0].download.endsWith('.json'), 'Filename extension should be .json');
  console.log('✔ Test 2 PASS: JSON export & special char sanitization verified');

  // Test 3: Default format parameter
  appendedElements = [];
  await downloadReport('proj-789');
  assert.ok(lastFetchUrl.endsWith('?format=csv'), 'Default format parameter must be csv');
  assert.ok(appendedElements[0].download.endsWith('.csv'), 'Default extension must be .csv');
  console.log('✔ Test 3 PASS: Default parameters verified');

  // Test 4: Server Error handling
  try {
    await downloadReport('error-proj', 'csv');
    assert.fail('Should have thrown error on server 404');
  } catch (err) {
    assert.equal(err.message, 'Dự án không tồn tại', 'Throws custom error message from server JSON response');
  }
  console.log('✔ Test 4 PASS: Error handling verified');

  console.log('ALL empirical tests for downloadReport PASSED!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
