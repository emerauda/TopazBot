import type { Config } from '@jest/types';
import { createDefaultPreset } from 'ts-jest';

const tsJestTransformCfg = createDefaultPreset().transform;

const config: Config.InitialOptions = {
  testEnvironment: 'node',
  transform: {
    ...tsJestTransformCfg,
  },
  collectCoverageFrom: ['src/**/*.ts'],
  testPathIgnorePatterns: ['/node_modules/', 'coverage\\.test\\.ts$'],
};

export default config;
