/**
 * Canonical User Manual & Demo Playbook registry (documentation only).
 *
 * Consumed by:
 *   - the in-app manual at /help/user-manual,
 *   - scripts/generate-user-manual.ts (portable markdown),
 *   - scripts/verify-user-manual.mjs (permanent coverage gate).
 */
export * from './types';
export * from './meta';
export * from './personas';
export * from './sections';
export * from './entity360';
export * from './aiSurfaces';
export * from './journeys';
export * from './demoPlaybook';
export * from './screenshotManifest';
export * from './helpLinks';
