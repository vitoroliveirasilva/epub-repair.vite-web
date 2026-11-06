import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Módulos centrais, com testes adversariais de caminhos, EPUB, navegação,
      // sanitização e preservação editorial.
      include: [
        'src/epub/utils/pathUtils.ts',
        'src/epub/reader/rawZipInspector.ts',
        'src/epub/validation/validateNavigation.ts',
        'src/epub/sanitize/sanitizeActiveContent.ts',
        'src/epub/repair/preservationAudit.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        perFile: true,
        lines: 45,
        statements: 45,
        branches: 25,
        functions: 45,
      },
    },
  },
});
