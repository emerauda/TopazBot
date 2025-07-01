import { Config } from 'jest';
import { createDefaultPreset } from 'ts-jest';

const tsJestTransformCfg = createDefaultPreset().transform;

const config: Config = {
  testEnvironment: 'node',
  transform: {
    ...tsJestTransformCfg,
  },
  collectCoverageFrom: ['src/**/*.ts'],
};

export default config;
