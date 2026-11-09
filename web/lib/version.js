/**
 * TALENT FLOW - Global System Version & Build Metadata
 * 
 * Provides centralized versioning information across Web UI, Header badges,
 * Settings dashboard, and telemetry.
 */

export const APP_VERSION = 'v1.7.79';
export const BUILD_DATE = '2026-11-09';
export const RELEASE_CODENAME = 'Candidate AI Image Resume Import & Vision OCR Ingestion';

export const APP_METADATA = {
  name: 'TALENT FLOW',
  version: APP_VERSION,
  buildDate: BUILD_DATE,
  codename: RELEASE_CODENAME,
  environment: process.env.NODE_ENV || 'production',
};

export default APP_METADATA;
