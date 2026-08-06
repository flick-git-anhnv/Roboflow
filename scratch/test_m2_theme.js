import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const themeContextPath = path.join(projectRoot, 'client', 'src', 'context', 'ThemeContext.tsx');
const content = fs.readFileSync(themeContextPath, 'utf8');

console.log('=== EMPIRICAL TEST HARNESS FOR ThemeContext.tsx ===\n');

// 1. Check DOM attribute logic in source code
console.log('--- 1. DOM Attribute Set Verification ---');
const hasSetAttribute = content.includes("root.setAttribute('data-theme', theme)");
const hasClassAddDark = content.includes("root.classList.add('dark')");
const hasClassRemoveDark = content.includes("root.classList.remove('dark')");

console.log(`Attribute set (data-theme): ${hasSetAttribute ? 'PASS' : 'FAIL'}`);
console.log(`Class add dark: ${hasClassAddDark ? 'PASS' : 'FAIL'}`);
console.log(`Class remove dark: ${hasClassRemoveDark ? 'PASS' : 'FAIL'}`);

// 2. Check localStorage error handling in source code
console.log('\n--- 2. localStorage Error Handling Analysis ---');

// Extract getItem and setItem lines
const lines = content.split('\n');
let getItemCount = 0;
let setItemCount = 0;
let getItemInTryCatch = false;
let setItemInTryCatch = false;

lines.forEach((line, index) => {
  if (line.includes('localStorage.getItem')) {
    getItemCount++;
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
  if (line.includes('localStorage.setItem')) {
    setItemCount++;
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});

const hasTryCatch = content.includes('try') && content.includes('catch');
console.log(`\nContains try/catch block: ${hasTryCatch}`);

// 3. Empirical Simulation of Theme Context Logic under Storage Exceptions
console.log('\n--- 3. Empirical Execution Simulation ---');

function simulateThemeProviderInit(mockLocalStorage) {
  try {
    const saved = mockLocalStorage.getItem('kztek_theme');
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    return 'light';
  } catch (err) {
    return `CRASH: ${err.message}`;
  }
}

function simulateSetTheme(newTheme, mockLocalStorage) {
  try {
    mockLocalStorage.setItem('kztek_theme', newTheme);
    return 'SUCCESS';
  } catch (err) {
    return `CRASH: ${err.message}`;
  }
}

// Test Case A: Broken localStorage.getItem (SecurityError)
const brokenGetStorage = {
  getItem: () => { throw new DOMException("Access is denied for this document.", "SecurityError"); },
  setItem: () => {}
};

const initResult = simulateThemeProviderInit(brokenGetStorage);
console.log(`Simulated ThemeProvider init with throwing localStorage.getItem: ${initResult}`);

// Test Case B: Broken localStorage.setItem (QuotaExceededError)
const brokenSetStorage = {
  getItem: () => null,
  setItem: () => { throw new DOMException("Setting the value of 'kztek_theme' exceeded the quota.", "QuotaExceededError"); }
};

const setResult = simulateSetTheme('dark', brokenSetStorage);
console.log(`Simulated setTheme with throwing localStorage.setItem: ${setResult}`);

console.log('\n=== EMPIRICAL EVALUATION SUMMARY ===');
if (!hasTryCatch) {
  console.log('CRITICAL FINDING: ThemeContext.tsx lacks try/catch guards around localStorage calls.');
  console.log('Uncaught localStorage exceptions will crash the application during mount or theme toggle if storage is disabled or quota is exceeded.');
} else {
  console.log('ThemeContext.tsx contains try/catch guards.');
}
