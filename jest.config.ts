import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'], // Note: Ensure .ts is first so ts-jest transforms TypeScript source
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
};

module.exports = config;
