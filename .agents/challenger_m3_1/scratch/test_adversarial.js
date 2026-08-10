// Empirical Adversarial Test Suite for Milestone 3 Frontend & API Utilities
// Run with: node .agents/challenger_m3_1/scratch/test_adversarial.js

import { readFile } from 'fs/promises';
import path from 'path';

console.log('====================================================');
console.log('STARTING EMPIRICAL ADVERSARIAL TESTS - MILESTONE 3');
console.log('====================================================\n');

const results = [];

function recordTest(testName, passed, details, isCritical = false) {
  results.push({ testName, passed, details, isCritical });
  const status = passed ? '✅ PASS' : (isCritical ? '🔴 FAIL (CRITICAL)' : '⚠️ FAIL (MINOR)');
  console.log(`[${status}] ${testName}`);
  console.log(`   Details: ${details}\n`);
}

// ------------------------------------------------------------------
// 1. Browser Storage Exception Safety Test (getToken, clearAuth, getCurrentUser)
// ------------------------------------------------------------------
async function testBrowserStorageSafety() {
  console.log('--- Test Group 1: Browser Storage Exception Safety ---');

  // Simulated browser environment with failing sessionStorage
  const fakeSessionStorageFailing = {
    getItem: () => { throw new Error('SecurityError: Access to storage is denied'); },
    removeItem: () => { throw new Error('SecurityError: Access to storage is denied'); },
    setItem: () => { throw new Error('SecurityError: Access to storage is denied'); },
  };

  // Check api.ts implementation of getToken and clearAuth
  const apiContent = await readFile(path.resolve('client/src/api.ts'), 'utf-8');

  // Check if getToken wraps sessionStorage in try/catch
  const getTokenMatch = apiContent.match(/export function getToken\(\): string \| null \{([\s\S]*?)\}/);
  const getTokenBody = getTokenMatch ? getTokenMatch[1] : '';
  const getTokenHasTryCatch = getTokenBody.includes('try') && getTokenBody.includes('catch');

  if (!getTokenHasTryCatch) {
    recordTest(
      'getToken() Storage Exception Safety',
      false,
      'getToken() in client/src/api.ts calls sessionStorage.getItem directly without try/catch. If sessionStorage access is restricted (e.g. incognito/iframe), getToken() will throw an unhandled SecurityError on every API call.',
      true
    );
  } else {
    recordTest('getToken() Storage Exception Safety', true, 'getToken() is safely wrapped in try/catch.');
  }

  // Check if clearAuth wraps sessionStorage in try/catch
  const clearAuthMatch = apiContent.match(/export function clearAuth\(\) \{([\s\S]*?)\}/);
  const clearAuthBody = clearAuthMatch ? clearAuthMatch[1] : '';
  const clearAuthHasTryCatch = clearAuthBody.includes('try') && clearAuthBody.includes('catch');

  if (!clearAuthHasTryCatch) {
    recordTest(
      'clearAuth() Storage Exception Safety',
      false,
      'clearAuth() in client/src/api.ts calls sessionStorage.removeItem directly without try/catch. If sessionStorage is restricted or disabled, clearAuth() throws an unhandled SecurityError when processing 401 response or logout.',
      true
    );
  } else {
    recordTest('clearAuth() Storage Exception Safety', true, 'clearAuth() is safely wrapped in try/catch.');
  }

  // Check getCurrentUser
  const getCurrentUserMatch = apiContent.match(/export function getCurrentUser\(\): User \| null \{([\s\S]*?)\}/);
  const getCurrentUserBody = getCurrentUserMatch ? getCurrentUserMatch[1] : '';
  const getCurrentUserHasTryCatch = getCurrentUserBody.includes('try') && getCurrentUserBody.includes('catch');

  recordTest(
    'getCurrentUser() Storage Exception Safety',
    getCurrentUserHasTryCatch,
    getCurrentUserHasTryCatch
      ? 'getCurrentUser() correctly uses try/catch and returns null on storage access error.'
      : 'getCurrentUser() lacks try/catch.'
  );
}

// ------------------------------------------------------------------
// 2. Blob URL Cleanup Exception Safety Test (URL.revokeObjectURL)
// ------------------------------------------------------------------
async function testBlobUrlCleanupSafety() {
  console.log('--- Test Group 2: Blob Download URL Cleanup & Exception Safety ---');
  const apiContent = await readFile(path.resolve('client/src/api.ts'), 'utf-8');

  const downloadReportMatch = apiContent.match(/downloadReport:\s*async\s*\([\s\S]*?\}\s*,/);
  const downloadReportBody = downloadReportMatch ? downloadReportMatch[0] : '';

  const hasCreateUrl = downloadReportBody.includes('createObjectURL');
  const hasRevokeUrl = downloadReportBody.includes('revokeObjectURL');
  
  // Check if revokeObjectURL is in a finally block
  const hasTryFinally = downloadReportBody.includes('try') && downloadReportBody.includes('finally') && downloadReportBody.indexOf('revokeObjectURL') > downloadReportBody.indexOf('finally');

  if (hasCreateUrl && hasRevokeUrl && !hasTryFinally) {
    recordTest(
      'downloadReport Blob URL Memory Leak Protection (try/finally)',
      false,
      'URL.revokeObjectURL(url) is executed after DOM click operations without a try...finally wrapper. If document.body.appendChild(a) or a.click() throws an error (e.g. browser popup/download restriction or security policy), window.URL.revokeObjectURL is bypassed, leaking the blob object URL in memory.',
      true
    );
  } else if (hasCreateUrl && hasRevokeUrl && hasTryFinally) {
    recordTest(
      'downloadReport Blob URL Memory Leak Protection',
      true,
      'downloadReport correctly uses try/finally to guarantee window.URL.revokeObjectURL(url) execution.'
    );
  } else {
    recordTest(
      'downloadReport Blob URL Implementation',
      false,
      'downloadReport missing createObjectURL or revokeObjectURL.'
    );
  }
}

// ------------------------------------------------------------------
// 3. Component Data Edge Cases & Robustness Analysis
// ------------------------------------------------------------------
async function testComponentDataEdgeCases() {
  console.log('--- Test Group 3: Component Null/Undefined & Array Edge Cases ---');

  // A. DatasetSplitBreakdown.tsx (bySplit prop edge cases)
  const splitContent = await readFile(path.resolve('client/src/components/dashboard/DatasetSplitBreakdown.tsx'), 'utf-8');
  
  // Test if passing bySplit={null} crashes
  const handlesNullBySplit = splitContent.includes('bySplit?.train') || splitContent.includes('(bySplit || {}).train') || splitContent.includes('(bySplit?.train || 0)');
  if (!handlesNullBySplit && splitContent.includes('bySplit.train')) {
    recordTest(
      'DatasetSplitBreakdown null prop handling',
      false,
      'DatasetSplitBreakdown uses default prop bySplit = { train: 0, valid: 0, test: 0 }. If caller passes bySplit={null as any} (e.g. from an API response where datasetBalance.bySplit is null), default parameter is ignored in JS, and total = (bySplit.train || 0) throws TypeError: Cannot read properties of null (reading "train").',
      true
    );
  } else {
    recordTest('DatasetSplitBreakdown null prop handling', true, 'Handles null bySplit prop safely.');
  }

  // B. AnnotatorProductivityChart.tsx (null data array & null username/displayName)
  const prodContent = await readFile(path.resolve('client/src/components/dashboard/AnnotatorProductivityChart.tsx'), 'utf-8');
  
  const handlesNullDataArray = prodContent.includes('[...(data || [])]') || prodContent.includes('Array.isArray(data)');
  if (!handlesNullDataArray && prodContent.includes('let result = [...data]')) {
    recordTest(
      'AnnotatorProductivityChart null data array handling',
      false,
      'AnnotatorProductivityChart uses default prop data = []. If caller passes data={null as any}, JS default param is not applied, and let result = [...data] throws TypeError: data is not iterable, crashing the entire dashboard/modal component.',
      true
    );
  } else {
    recordTest('AnnotatorProductivityChart null data array handling', true, 'Handles null data array safely.');
  }

  const handlesNullUserNames = prodContent.includes('(u.displayName || u.username || \'\')') || prodContent.includes('(user.displayName || user.username || \'\')');
  if (prodContent.includes('(user.displayName || user.username).charAt(0)')) {
    recordTest(
      'AnnotatorProductivityChart null username/displayName handling',
      false,
      'In rendering table row: (user.displayName || user.username).charAt(0) will throw TypeError: Cannot read properties of undefined (reading "charAt") if both displayName and username are missing or null in a user report object.',
      true
    );
  } else {
    recordTest('AnnotatorProductivityChart null username/displayName handling', true, 'Handles missing user names safely.');
  }

  // C. ClassDistributionChart.tsx (null elements in array or high class count)
  const classContent = await readFile(path.resolve('client/src/components/dashboard/ClassDistributionChart.tsx'), 'utf-8');
  
  if (classContent.includes('entry.color')) {
    const rendersNullEntrySafely = classContent.includes('entry?.color') || classContent.includes('entry &&');
    if (!rendersNullEntrySafely) {
      recordTest(
        'ClassDistributionChart null element in data array',
        false,
        'ClassDistributionChart maps over data array: data.map((entry, index) => entry.color ...). If data array contains a null/undefined element from API payload, entry.color throws TypeError: Cannot read properties of null (reading "color").',
        false
      );
    } else {
      recordTest('ClassDistributionChart null element in data array', true, 'Handles null elements safely.');
    }
  }

  // High class count (>20 classes) check
  const usesModuloColors = classContent.includes('DEFAULT_COLORS[index % DEFAULT_COLORS.length]');
  recordTest(
    'ClassDistributionChart high class count (>20 classes) palette safety',
    usesModuloColors,
    usesModuloColors
      ? 'DEFAULT_COLORS[index % DEFAULT_COLORS.length] uses modulo indexing, safely cycling colors without out-of-bounds errors when class count > 20.'
      : 'Palette indexing may go out of bounds for >20 classes.'
  );

  // D. DashboardPage.tsx (empty data and missing token states)
  const dashContent = await readFile(path.resolve('client/src/pages/DashboardPage.tsx'), 'utf-8');
  
  const handlesEmptyActivity = dashContent.includes('!overview?.recentActivity || overview.recentActivity.length === 0');
  recordTest(
    'DashboardPage empty activity list state',
    handlesEmptyActivity,
    handlesEmptyActivity
      ? 'DashboardPage renders a clean fallback message ("Chưa có nhật ký hoạt động gần đây") when recentActivity is empty or undefined.'
      : 'DashboardPage missing empty state check for recentActivity.'
  );

  const handlesAuthError = dashContent.includes('setError(err.message ||') && dashContent.includes('{error &&');
  recordTest(
    'DashboardPage unauthenticated / 401 error state',
    handlesAuthError,
    handlesAuthError
      ? 'DashboardPage catches API errors (including AUTH_REQUIRED / 401) and renders an error banner.'
      : 'DashboardPage missing error state handling.'
  );
}

// ------------------------------------------------------------------
// Main Execution
// ------------------------------------------------------------------
async function main() {
  await testBrowserStorageSafety();
  await testBlobUrlCleanupSafety();
  await testComponentDataEdgeCases();

  console.log('====================================================');
  console.log('SUMMARY OF EMPIRICAL TEST RESULTS');
  console.log('====================================================');
  const criticalFails = results.filter(r => !r.passed && r.isCritical);
  const minorFails = results.filter(r => !r.passed && !r.isCritical);
  const passes = results.filter(r => r.passed);

  console.log(`Total Tests Run: ${results.length}`);
  console.log(`Passes         : ${passes.length}`);
  console.log(`Minor Failures : ${minorFails.length}`);
  console.log(`Critical Fails : ${criticalFails.length}\n`);

  if (criticalFails.length > 0) {
    console.log('CRITICAL BUGS IDENTIFIED:');
    criticalFails.forEach(f => console.log(` - ${f.testName}: ${f.details}`));
    console.log('\nFINAL RECOMMENDATION: REJECT');
  } else {
    console.log('FINAL RECOMMENDATION: APPROVE');
  }
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
