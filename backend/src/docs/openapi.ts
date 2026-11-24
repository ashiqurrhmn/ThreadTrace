export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ThreadTrace API — Garment Supply-Chain Traceability & Digital Product Passports',
    version: '1.0.0',
    description:
      'Enterprise Textile & Garment Supply-Chain REST API: Multi-tier lot lineage tracing, mass balance enforcement, automated certificate expiry claim protection, environmental footprint roll-up, versioned QR Digital Product Passports with high-availability cache resilience, role-based audience isolation, bulk CSV/Excel ingestion, and SHA-256 cryptographic event verification.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    '/health': { get: { summary: 'System, Database & Cache Health Check', responses: { '200': { description: 'OK' } } } },
    '/auth/login': { post: { summary: 'Authenticate with email & password', responses: { '200': { description: 'JWT Token' } } } },
    '/auth/demo-switch': { post: { summary: 'Switch active role view (AUDITOR, FACTORY_ADMIN, BRAND_NW, BRAND_ES)', responses: { '200': { description: 'JWT Token' } } } },
    '/parties': { get: { summary: 'List suppliers & facilities (audience-filtered)', responses: { '200': { description: 'Paginated parties' } } }, post: { summary: 'Register supplier or factory', responses: { '201': { description: 'Created' } } } },
    '/lots': { get: { summary: 'List material & garment lots (brand-scoped)', responses: { '200': { description: 'Paginated lots' } } }, post: { summary: 'Create material lot', responses: { '201': { description: 'Created' } } } },
    '/lots/{id}/events': { post: { summary: 'Record immutable hash-chained production event with mass balance check', responses: { '201': { description: 'Recorded' }, '422': { description: 'Mass balance violation (RFC 9457)' } } } },
    '/lots/{id}/split': { post: { summary: 'Split 1 parent lot into N child lots', responses: { '201': { description: 'Split created' } } } },
    '/lots/merge': { post: { summary: 'Merge N parent lots into 1 child lot', responses: { '201': { description: 'Merged lot created' } } } },
    '/lots/{id}/footprint': { get: { summary: 'Calculate water, energy, CO2e per garment (MASS or PIECE_COUNT)', responses: { '200': { description: 'Footprint roll-up' } } } },
    '/lots/{id}/verify': { get: { summary: 'Verify per-lot SHA-256 hash chain', responses: { '200': { description: 'Verification report' } } } },
    '/trace/backward/{identifier}': { get: { summary: 'Backward multi-tier lineage trace (carton/style to source mills)', responses: { '200': { description: 'Trace graph & latency ms' } } } },
    '/trace/forward/{identifier}': { get: { summary: 'Forward multi-tier lineage trace (raw lot to shipments & buyers)', responses: { '200': { description: 'Trace graph & latency ms' } } } },
    '/evidences': { get: { summary: 'List certificates & lab test reports', responses: { '200': { description: 'Paginated evidences' } } }, post: { summary: 'Upload certificate or test report', responses: { '201': { description: 'Created' } } } },
    '/evidences/{id}/simulate-expire': { post: { summary: 'Mark certificate expired & revoke dependent passport claims', responses: { '200': { description: 'Expired & recalculated' } } } },
    '/public/passports/{code}': { get: { summary: 'Public QR Passport JSON (ETag + resilience cache fallback)', responses: { '200': { description: 'Sanitized public passport' } } } },
    '/passports/{code}': { get: { summary: 'Audience-scoped passport view (Public/Brand/Auditor)', responses: { '200': { description: 'Passport DTO' }, '403': { description: 'Cross-brand refused' } } } },
    '/passports/{code}/verify': { get: { summary: 'Verify full lineage hash chain behind passport', responses: { '200': { description: 'Integrity report' } } } },
    '/imports/upload': { post: { summary: 'Bulk CSV/Excel import with per-row validation report', responses: { '201': { description: 'Import job summary' } } } },
    '/audit/defects': { get: { summary: 'Run compliance & unsupported claims audit', responses: { '200': { description: 'Compliance audit report' } } } },
    '/audit/confidentiality': { get: { summary: 'Scan all public endpoints & cache snapshots for confidential leaks', responses: { '200': { description: 'Zero-leak report' } } } },
    '/config': { get: { summary: 'Retrieve dynamic process, certificate & passport field configuration', responses: { '200': { description: 'Config object' } } } },
  },
};
