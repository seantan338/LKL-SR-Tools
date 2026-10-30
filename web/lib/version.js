/**
 * TALENT FLOW - Global System Version & Build Metadata
 * 
 * Provides centralized versioning information across Web UI, Header badges,
 * Settings dashboard, and telemetry.
 */

export const APP_VERSION = 'v1.7.28';
export const BUILD_DATE = '2026-10-30';
export const RELEASE_CODENAME = 'Global Quick FAB Pass-through & Dual Attribution Controller';

export const APP_METADATA = {
  name: 'TALENT FLOW',
  version: APP_VERSION,
  buildDate: BUILD_DATE,
  codename: RELEASE_CODENAME,
  environment: process.env.NODE_ENV || 'production',
};

export default APP_METADATA;
