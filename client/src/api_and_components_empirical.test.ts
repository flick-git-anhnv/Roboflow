import { describe, it, expect } from 'vitest';
import { getToken, clearAuth, api } from './api';

describe('API and Components Empirical Tests', () => {
  it('operates safely when sessionStorage throws during getToken and clearAuth', () => {
    const throwingStorage = {
      getItem: (key: string) => {
        throw new Error('SecurityError: Blocked storage access');
      },
      removeItem: (key: string) => {
        throw new Error('SecurityError: Blocked storage access');
      },
      setItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };

    const origStorage = globalThis.sessionStorage;
    (globalThis as any).sessionStorage = throwingStorage;

    try {
      const token = getToken();
      expect(token).toBeNull();

      expect(() => clearAuth()).not.toThrow();
    } finally {
      (globalThis as any).sessionStorage = origStorage;
    }
  });

  it('revokes object URLs in try...finally during downloadReport', async () => {
    let urlRevoked = false;
    let revokedUrlVal = '';

    const mockWindow = {
      URL: {
        createObjectURL: () => 'blob:http://localhost/report-blob-uuid',
        revokeObjectURL: (url: string) => {
          urlRevoked = true;
          revokedUrlVal = url;
        },
      },
      location: { pathname: '/' },
    };

    const mockDoc = {
      createElement: () => ({
        href: '',
        download: '',
        click: () => {
          throw new Error('Simulated DOM Exception inside click()');
        },
        remove: () => {},
      }),
      body: {
        appendChild: (el: any) => el,
      },
    };

    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;
    const origFetch = (globalThis as any).fetch;

    (globalThis as any).window = mockWindow;
    (globalThis as any).document = mockDoc;
    (globalThis as any).fetch = (async () => ({
      ok: true,
      blob: async () => new Blob(['col1,col2\nval1,val2']),
    })) as any;

    try {
      await expect(api.downloadReport('p123', 'csv', 'test_proj')).rejects.toThrow('Simulated DOM Exception inside click()');
      expect(urlRevoked).toBe(true);
      expect(revokedUrlVal).toBe('blob:http://localhost/report-blob-uuid');
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
      (globalThis as any).fetch = origFetch;
    }
  });
});
