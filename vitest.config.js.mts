import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./out/test/setup.js'],
    include: ['out/test/**/*.js'],
    exclude: [
      'out/test/setup.js',
      'out/test/root-hooks.js',
      'out/test/vitest.d.js',
      'out/test/seed/**',
      'out/test/helpers/**',
      'out/test/static/**',
      'out/test/unit/validators.js',
      'out/test/unit/entity/transformer/test-model.js',
      'node_modules/**',
    ],
    testTimeout: 50000,
    hookTimeout: 50000,
    pool: 'forks',
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    reporters: ['default'],
    onConsoleLog(log) {
      if (log.includes('ECONNREFUSED') && log.includes('6379')) return false;
      if (log.startsWith('[Config] ENABLE_LDAP is true')) return false;
      return undefined;
    },
  },
});
