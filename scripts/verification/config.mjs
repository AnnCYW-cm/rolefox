export const ACCEPTED_SPEC_FILES = [
  "README.en.md",
  "README.md",
  "docs/adr/0001-pre-interview-autopilot.md",
  "docs/adr/0002-v0.1-product-decision-baseline.md",
  "docs/adr/0003-shadow-safety-control-exceptions.md",
  "docs/adr/0004-jd-raw-retention-and-preparation-pack.md",
  "docs/adr/0005-sole-maintainer-governance.md",
  "docs/architecture.md",
  "docs/automation-safety.md",
  "docs/open-source-strategy.md",
  "docs/product-scope.md",
  "docs/product/README.md",
  "docs/product/delivery-plan-v0.1.md",
  "docs/product/implementation-verification-v0.1.md",
  "docs/product/p0-case-baseline-v0.1.md",
  "docs/product/prd-v0.1.md",
  "docs/product/uml/01-context-use-cases.md",
  "docs/product/uml/02-domain-model.md",
  "docs/product/uml/03-state-machines.md",
  "docs/product/uml/04-activity-flows.md",
  "docs/product/uml/05-sequence-flows.md",
  "docs/product/uml/06-architecture-deployment-security.md",
  "docs/product/uml/07-traceability.md",
  "docs/product/uml/README.md",
  "docs/product/uml/case-to-uml-v0.1.csv",
  "docs/product/user-experience-v0.1.md",
  "docs/product/validation-plan-v0.1.md",
  "docs/roadmap.md",
];

export const REQUIRED_RELEASE_SCOPE_IDS = [
  "application_submit_l2",
  "calendar_busy_read",
  "calendar_tentative_cancel",
  "calendar_tentative_create",
  "calendar_tentative_update",
  "credential_revocation",
  "default_email_notification",
  "job_source_read",
  "mailbox_read",
  "mailbox_reply_l2",
  "release_v01_real_provider_joined",
  "safety_liveness_heartbeat",
  "safety_stop_alert",
];

export const PRE_W1_RESEARCH_SCOPE_IDS = [
  "pain_interviews",
  "rules_replay",
  "target_channel_feasibility",
];

export const SOLE_MAINTAINER_AUTHORITY = Object.freeze({
  governance_mode: "SOLE_MAINTAINER",
  identity: "github:AnnCYW-cm",
  role_version: "rolefox-sole-maintainer-v1",
  gate_submitter_may_decide: true,
  trusted_signer_policy: "GITHUB_ACTIONS_OIDC_PROTECTED_MAIN",
});

// This closed file set defines the verifier whose semantics are bound into the
// Spec Manifest, Candidate artifact, Gate records, and registry checkpoints.
// Generated registry data and tests are intentionally excluded.
export const VERIFICATION_TOOLCHAIN_FILES = [
  ".github/workflows/ci.yml",
  "package.json",
  "pnpm-lock.yaml",
  "scripts/verification/append-evidence.mjs",
  "scripts/verification/append-gate.mjs",
  "scripts/verification/bootstrap-pre-w1.mjs",
  "scripts/verification/check-pre-w1.mjs",
  "scripts/verification/checkpoint-lib.mjs",
  "scripts/verification/config.mjs",
  "scripts/verification/lib.mjs",
  "scripts/verification/privacy.mjs",
  "scripts/verification/schema.mjs",
  "scripts/verification/write-checkpoint.mjs",
  "verification/schemas/v1/candidate-scope-manifest.schema.json",
  "verification/schemas/v1/evidence-manifest.schema.json",
  "verification/schemas/v1/gate-evidence-record.schema.json",
  "verification/schemas/v1/pre-w1-research-protocol.schema.json",
  "verification/schemas/v1/registry-checkpoint.schema.json",
  "verification/schemas/v1/required-release-scope-catalog.schema.json",
  "verification/schemas/v1/spec-manifest.schema.json",
];

export const EVIDENCE_TYPES = [
  "UNIT",
  "CONTRACT",
  "INTEGRATION",
  "E2E",
  "FAULT_INJECTION",
  "CHAOS",
  "DR",
  "MIGRATION",
  "SECURITY",
  "ACCESSIBILITY",
  "OBSERVABILITY",
  "SUPPLY_CHAIN",
  "UI_REVIEW",
  "MANUAL_REVIEW",
  "USER_RESEARCH",
  "REAL_PROVIDER_E2E",
];

export const EVIDENCE_TYPE_ALIASES = Object.freeze({
  UT: "UNIT",
  CT: "CONTRACT",
  contract: "CONTRACT",
  IT: "INTEGRATION",
  FIT: "FAULT_INJECTION",
  FI: "FAULT_INJECTION",
  MIG: "MIGRATION",
  SEC: "SECURITY",
  A11Y: "ACCESSIBILITY",
  OBS: "OBSERVABILITY",
  SBOM: "SUPPLY_CHAIN",
  CI: "SUPPLY_CHAIN",
  UI: "UI_REVIEW",
  UX: "USER_RESEARCH",
  E2E: "E2E",
  CHAOS: "CHAOS",
  DR: "DR",
});

export const GATE_IDS = {
  preW1: "PRE_W1_PROBLEM_RULES",
};

// This may be changed to IMPLEMENTED only after the checker verifies signatures,
// signer/producer allowlists, CI provenance, and external anchors against trusted
// roots. Proof-shaped strings and status labels are not trust verification.
export const TRUST_VERIFICATION_STATUS = "NOT_IMPLEMENTED";

export const PATHS = {
  catalog: "verification/required-release-scopes-v0.1.json",
  catalogSnapshotDirectory: "verification/release-scope-catalogs",
  candidateIndex: "verification/candidate-scopes/current-pre-w1.json",
  candidateDirectory: "verification/candidate-scopes",
  checkpointDirectory: "verification/registry-checkpoints",
  evidenceDirectory: "verification/evidence-manifests",
  gateRegistry: "verification/gate-evidence-v0.1.jsonl",
  protocol: "verification/research/pre-w1-protocol-v0.1.json",
  protocolSnapshotDirectory: "verification/research/protocols",
  specManifest: "verification/spec-manifest-v0.1.json",
  specManifestSnapshotDirectory: "verification/spec-manifests",
};
