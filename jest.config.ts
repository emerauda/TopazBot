import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'], // Note: Ensure .ts is first so ts-jest transforms TypeScript source
  transform: {
    // Use the test-aware tsconfig so jest globals resolve under TypeScript 6+
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.eslint.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
};

export default config;
