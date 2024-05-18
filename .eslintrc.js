module.exports = {
  root: true,
  env: {
    node: true,
    mocha: true,
  },
  plugins: [
    'chai-friendly',
    'header',
    'import',
    'github-commit-hash',
  ],
  extends: [
    'airbnb-typescript/base',
    'plugin:chai-expect/recommended',
  ],
  overrides: [
    {
      files: ['package.json'],
      extends: ['./.eslintrc.package.json.js'],
    },
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'linebreak-style': process.env.NODE_ENV === 'production' ? ['error', 'windows'] : ['off', 'windows'],
    '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
    '@typescript-eslint/no-unused-expressions': 'off',
    'chai-friendly/no-unused-expressions': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'warn',
    'header/header': [2, 'NOTICE'],
    'class-methods-use-this': 'off',
  },
};
