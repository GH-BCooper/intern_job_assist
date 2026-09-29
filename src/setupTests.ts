import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Unmount between tests.
 *
 * Testing Library registers this itself only when Vitest runs with `globals`
 * enabled, and this project does not — without it, every render stacks up in the
 * same document and queries start finding several matches.
 */
afterEach(() => {
  cleanup();
});
