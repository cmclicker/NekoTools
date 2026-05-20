// jsdom + testing-library setup for Phase 1.1f UI tests.
//
// Imported by vitest via the `setupFiles` entry in `vite.config.ts`.
// `@testing-library/jest-dom/vitest` registers the dom matchers (e.g.
// `toBeInTheDocument`, `toHaveTextContent`) onto vitest's `expect`.
//
// `cleanup()` after each test is required because we run vitest with
// `globals: false`. Without it, each test's `render()` leaves its
// nodes attached to document.body, and the next test's queries match
// elements from previous renders ("multiple elements found").
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
