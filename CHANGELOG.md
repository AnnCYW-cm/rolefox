# Changelog

All notable public changes to RoleFox are recorded here. RoleFox is still at
M0 / pre-alpha; entries under `Unreleased` describe repository progress and do
not claim a production release, Gate pass, or usable end-to-end product.

## Unreleased

### 2026-09-11

#### Added

- Added the fail-closed Pre-W1 verification control plane: a content-addressed
  Spec Manifest, closed-world Required Release Scope Catalog, frozen Candidate
  Scope, research protocol and templates, two-layer Evidence contracts, an
  append-only Gate Registry, continuous checkpoints, schemas, writers,
  validators, and verification tests.
- Added accepted ADRs for business Shadow versus isolated safety controls and
  for raw-JD retention versus interview preparation-pack behavior.
- Added the implementation-evidence and release-closure contract for the 254
  P0 product, security, and technical cases.

#### Changed

- Hardened the v0.1 product, safety, architecture, delivery, and UML baselines
  to bind authorization, external effects, recovery, retention, and release
  evidence more precisely.
- Clarified throughout the public documentation that the current application
  is an M0 static/dry-run foundation, not an implemented or released Autopilot.

#### Security

- Pre-W1 readiness now fails closed while approvals, real research Evidence,
  cryptographic trust verification, a trusted checkpoint signature, or an
  external anchor are missing.
- Real outbound actions remain disabled; the repository contains no real
  recruiting-platform, mailbox, calendar, or AI-provider integration.

### 2026-09-09

- Accepted the v0.1 product and UML design baseline.
- Established 254 traceable P0 cases and the complete Mermaid design set. These
  are accepted design inputs; their implementation status remains unverified.

### 2026-09-08

- Bootstrapped the Apache-2.0 pnpm monorepo, contribution and security policies,
  synthetic Web dashboard, domain state-machine foundations, policy rules,
  Connector SDK contracts, AI Provider contracts, and Worker/Runner safety
  stubs.
- Adopted the candidate-controlled pre-interview Autopilot as the product north
  star while keeping real external execution disabled by default.
