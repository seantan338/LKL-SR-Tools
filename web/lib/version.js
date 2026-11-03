/**
 * TALENT FLOW - Global System Version & Build Metadata
 * 
 * Provides centralized versioning information across Web UI, Header badges,
 * Settings dashboard, and telemetry.
 */

export const APP_VERSION = 'v1.7.56';
export const BUILD_DATE = '2026-11-03';
export const RELEASE_CODENAME = 'CV Autofill Mobile Responsive Stacking & Grid Optimization';

export const APP_METADATA = {
  name: 'TALENT FLOW',
  version: APP_VERSION,
  buildDate: BUILD_DATE,
  codename: RELEASE_CODENAME,
  environment: process.env.NODE_ENV || 'production',
};

export default APP_METADATA;
