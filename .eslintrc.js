module.exports = {
  root: true,
  env: {
    node: true,
    mocha: true
  },
  extends: [
    "airbnb-typescript/base",
  ],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'linebreak-style': process.env.NODE_ENV === 'production' ? ['error', 'windows'] : ['off', 'windows'],
  },
  parserOptions: {
    project: './tsconfig.json',
  },
};
