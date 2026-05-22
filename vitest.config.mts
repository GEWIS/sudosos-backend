import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
          dynamicImport: true,
        },
        target: 'es2021',
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          useDefineForClassFields: false,
        },
        keepClassNames: true,
      },
      sourceMaps: true,
    }),
  ],
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.ts'],
    exclude: [
      'test/setup.ts',
      'test/root-hooks.ts',
      'test/vitest.d.ts',
      'test/seed/**',
      'test/helpers/**',
      'test/static/**',
      'test/unit/validators.ts',
      'test/unit/entity/transformer/test-model.ts',
      'node_modules/**',
      'out/**',
    ],
    testTimeout: 50000,
    hookTimeout: 50000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    reporters: ['default'],
    onConsoleLog(log) {
      if (log.includes('ECONNREFUSED') && log.includes('6379')) return false;
      if (log.startsWith('[Config] ENABLE_LDAP is true')) return false;
      return undefined;
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'cobertura', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './reports/coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/declaration/**',
        'src/migrations/**',
        // Pure interface/type files; no runtime code, but v8 lists them as 0%.
        'src/controller/request/*.ts',
        'src/controller/response/**',
        'src/gewis/controller/request/**',
        'src/controller/policy.ts',
        'src/gewis/gewisweb-token.ts',
        'src/rbac/role-definitions.ts',
        'src/rbac/permission-rule.ts',
        // CLI entry points; exercised by the deployed app, not the unit-test suite.
        'src/cron.ts',
        'src/maintenance.ts',
        'src/database/schema.ts',
        'src/database/migrate.ts',
      ],
    },
  },
});
