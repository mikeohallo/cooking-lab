/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],
  /**
   * How long one test may take, sized for the CI runner rather than for a
   * developer's desktop.
   *
   * Jest's default is five seconds. A screen test here mounts a real component
   * tree, writes through the real services to real SQLite and reads the rows
   * back; the first test in such a file also pays for loading the whole module
   * graph. On this desktop that is a few hundred milliseconds, and on the
   * GitHub runner — forty-odd suites at once on four cores — it crossed five
   * seconds and failed three tests for being slow rather than for being wrong.
   * That has happened once before in this repository, to the end-to-end
   * core-loop test, which has carried its own explicit thirty-second budget
   * since.
   *
   * This is a budget, not a weakening: every test still asserts exactly what it
   * asserted before. The cost is that a genuinely hung test now takes twenty
   * seconds to say so instead of five, which is the right trade for a suite
   * that is green or red for the right reasons.
   */
  testTimeout: 20_000,
};
