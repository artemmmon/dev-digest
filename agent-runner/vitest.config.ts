import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // The shared contracts live outside this package; make them resolve the same
      // zod copy as the runner (a clean checkout has no server/node_modules).
      zod: path.resolve(__dirname, 'node_modules/zod'),
      // Mirror tsconfig.json path aliases — both packages are consumed as raw
      // TypeScript source, never as built artifacts.
      '@devdigest/reviewer-core': path.resolve(__dirname, '../reviewer-core/src/index.ts'),
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
