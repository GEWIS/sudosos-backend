module.exports = {
  root: true,
  env: {
    node: true,
    mocha: true
  },
  plugins: [
    'chai-friendly',
    'header',
  ],
  extends: [
    'airbnb-typescript/base',
    'plugin:chai-expect/recommended',
  ],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'linebreak-style': process.env.NODE_ENV === 'production' ? ['error', 'windows'] : ['off', 'windows'],
    '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
    '@typescript-eslint/no-unused-expressions': 'off',
    'chai-friendly/no-unused-expressions': 'error',
    "header/header": [2, 'NOTICE']
  },
  parserOptions: {
    project: './tsconfig.json',
  },
};
