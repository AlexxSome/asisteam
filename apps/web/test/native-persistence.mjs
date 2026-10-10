import {afterAll} from 'vitest';
import {closeNativeIntegration} from './native-persistence-implementation.mjs';
export * from './native-persistence-implementation.mjs';
afterAll(closeNativeIntegration);
