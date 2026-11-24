export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ThreadTrace API — Garment Supply-Chain Traceability & Digital Product Passports',
    version: '1.0.0',
    description:
      'CSE 444 Project 4 REST API: Lot lineage tracing (WITH RECURSIVE), mass balance, certificate expiry auto-drop, environmental footprint roll-up, versioned QR passports with DB-down cache resilience, audience isolation, bulk CSV/Excel import, and SHA-256 hash-chain verification.',
  },
  servers: [{ url: 'http://localhost:4000/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    '/health': { get: { summary: 'System, PostgreSQL & Cache Health Check', responses: { '200': { description: 'OK' } } } },
    '/auth/login': { post: { summary: 'Authenticate with email & password', responses: { '200': { description: 'JWT Token' } } } },
    '/auth/demo-switch': { post: { summary: 'Switch demo persona (AUDITOR, FACTORY_ADMIN, BRAND_NW, BRAND_ES)', responses: { '200': { description: 'JWT Token' } } } },
    '/parties': { get: { summary: 'FR1: List parties (audience-filtered)', responses: { '200': { description: 'Paginated parties' } } }, post: { summary: 'FR1: Register supplier or factory', responses: { '201': { description: 'Created' } } } },
    '/lots': { get: { summary: 'FR2: List lots (brand-scoped)', responses: { '200': { description: 'Paginated lots' } } }, post: { summary: 'FR2: Create lot', responses: { '201': { description: 'Created' } } } },
    '/lots/{id}/events': { post: { summary: 'FR2/FR4/FR10: Record immutable hash-chained event with mass balance check', responses: { '201': { description: 'Recorded' }, '422': { description: 'Mass balance violation (RFC 9457)' } } } },
    '/lots/{id}/split': { post: { summary: 'FR2: Split 1 lot into N child lots', responses: { '201': { description: 'Split created' } } } },
    '/lots/merge': { post: { summary: 'FR2: Merge N parent lots into 1 child lot', responses: { '201': { description: 'Merged lot created' } } } },
    '/lots/{id}/footprint': { get: { summary: 'FR6: Calculate water, energy, CO2e per piece (MASS or PIECE_COUNT)', responses: { '200': { description: 'Footprint roll-up' } } } },
    '/lots/{id}/verify': { get: { summary: 'FR10: Verify per-lot SHA-256 hash chain', responses: { '200': { description: 'Verification report' } } } },
    '/trace/backward/{identifier}': { get: { summary: 'FR3/QA1: Backward 6+ level lineage trace (WITH RECURSIVE)', responses: { '200': { description: 'Trace graph & latency ms' } } } },
    '/trace/forward/{identifier}': { get: { summary: 'FR3/QA1: Forward 6+ level lineage trace (WITH RECURSIVE)', responses: { '200': { description: 'Trace graph & latency ms' } } } },
    '/evidences': { get: { summary: 'FR5: List certificates & test reports', responses: { '200': { description: 'Paginated evidences' } } }, post: { summary: 'FR5: Upload certificate/test report', responses: { '201': { description: 'Created' } } } },
    '/evidences/{id}/simulate-expire': { post: { summary: 'FR5/QA2: Expire certificate now & auto-drop claims from passports', responses: { '200': { description: 'Expired & recalculated' } } } },
    '/public/passports/{code}': { get: { summary: 'FR7/QA3/QA4: Public QR Passport JSON (ETag + works when PostgreSQL is down!)', responses: { '200': { description: 'Sanitized public passport' } } } },
    '/passports/{code}': { get: { summary: 'FR7/FR8: Audience-scoped passport view (Public/Brand/Auditor)', responses: { '200': { description: 'Passport DTO' }, '403': { description: 'Cross-brand refused' } } } },
    '/passports/{code}/verify': { get: { summary: 'FR10: Verify full lineage hash chain behind passport', responses: { '200': { description: 'Integrity report' } } } },
    '/imports/upload': { post: { summary: 'FR9: Bulk CSV/Excel import with per-row validation report', responses: { '201': { description: 'Import job summary' } } } },
    '/audit/defects': { get: { summary: 'QA2: Run planted defects & unsupported claims audit', responses: { '200': { description: 'Defect report' } } } },
    '/audit/confidentiality': { get: { summary: 'QA3: Scan all public endpoints & snapshots for confidential leaks', responses: { '200': { description: 'Zero-leak report' } } } },
    '/config': { get: { summary: 'QA5: Retrieve dynamic process, certificate & passport field configuration', responses: { '200': { description: 'Config object' } } } },
  },
};
