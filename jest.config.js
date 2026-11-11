module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.(ts|tsx|js)'],
  collectCoverageFrom: [
    'services/**/*.{ts,tsx}',
    'constants/**/*.{ts,tsx}',
    'context/**/*.{ts,tsx}',
    '!**/leafletInlineAssets.ts',
  ],
};

