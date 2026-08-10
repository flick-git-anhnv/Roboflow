import { describe, it, expect } from 'vitest';
import { getToken, clearAuth, api } from './api';

describe('API Empirical Direct Storage Tests', () => {
  it('handles direct storage exceptions and downloadReport cleanup', async () => {
    // 1. Mock window.sessionStorage & globalThis.sessionStorage
    const throwingStorage = {
      getItem: (key: string) => {
        throw new Error('SecurityError: Failed to read sessionStorage');
      },
      removeItem: (key: string) => {
        throw new Error('SecurityError: Failed to write to sessionStorage');
      },
      setItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };

    (globalThis as any).sessionStorage = throwingStorage;
    if (typeof window !== 'undefined') {
      (window as any).sessionStorage = throwingStorage;
    }

    // 2. Test getToken()
    expect(() => {
      const res = getToken();
      expect(res).toBeNull();
    }).not.toThrow();

    // 3. Test clearAuth()
    expect(() => {
      clearAuth();
    }).not.toThrow();

    // 4. Test api.downloadReport()
    let revokeCount = 0;
    (globalThis as any).fetch = (async () => ({
      ok: true,
      blob: async () => new Blob(['test']),
    })) as any;

    (globalThis as any).URL = {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: (url: string) => {
        revokeCount++;
      },
    };

    (globalThis as any).document = {
      createElement: () => ({
        href: '',
        download: '',
        click: () => {
          throw new Error('DOMException: Simulated click error');
        },
        remove: () => {},
      }),
      body: {
        appendChild: (el: any) => el,
      },
    };

    try {
      await api.downloadReport('proj1', 'csv', 'my_project');
    } catch (err: any) {
      expect(err.message).toContain('DOMException');
    }

    expect(revokeCount).toBe(1);
  });
});
