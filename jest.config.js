/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  /**
   * Which files are suites: every `*.test.ts` and `*.test.tsx` under
   * `__tests__`.
   *
   * Written as a root plus a relative glob rather than as
   * `<rootDir>/__tests__/**`, on purpose. Jest pastes the absolute rootDir into
   * a glob and, on Windows, turns each backslash into a forward slash *unless
   * the next character is one a glob treats as special* — and a dot is one. So
   * a checkout inside a folder whose name starts with a dot (`<parent>\.deploys\<repo>`)
   * became the glob `<parent>\.deploys/<repo>/…`: an escaped dot with no slash
   * before it, which matches no path at all, and `npm test` found no suites. A
   * relative glob never has the rootDir in it, so where the repository sits
   * cannot change what it matches; `roots` keeps it to this repository's own
   * `__tests__`, as before.
   */
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
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
