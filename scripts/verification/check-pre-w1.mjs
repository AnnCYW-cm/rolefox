import fs from "node:fs";
import path from "node:path";

import {
  ACCEPTED_SPEC_FILES,
  EVIDENCE_TYPES,
  GATE_IDS,
  PATHS,
  PRE_W1_RESEARCH_SCOPE_IDS,
  REQUIRED_RELEASE_SCOPE_IDS,
  SOLE_MAINTAINER_AUTHORITY,
  TRUST_VERIFICATION_STATUS,
  VERIFICATION_TOOLCHAIN_FILES,
} from "./config.mjs";
import {
  DIGEST_CONTRACT,
  assertSafeRepositoryStorage,
  canonicalDigest,
  canonicalDigestExcluding,
  canonicalJson,
  digestFileSet,
  digestFileMetadataSet,
  digestJsonl,
  invariant,
  jsonFiles,
  normalizeText,
  parseJsonLines,
  readJson,
  repositoryRoot,
  sha256,
  validateGateChains,
  verifyAddressedDocument,
  verifyCheckpointDocument,
  verifyEvidenceDocument,
} from "./lib.mjs";
import {
  assertNoSensitivePublicData,
  normalizePublicKey,
} from "./privacy.mjs";
import { SCHEMA_NAMES, validateSchema } from "./schema.mjs";

const PRE_W1_SCOPE_ID = "pre_w1_problem_and_rules_research";
const EVIDENCE_KINDS = new Map([
  ["PAIN_INTERVIEWS", "pain_interviews"],
  ["TARGET_CHANNEL_FEASIBILITY", "target_channel_feasibility"],
  ["RULES_REPLAY", "rules_replay"],
]);
const EVIDENCE_RESULTS = new Set(["PASS", "FAIL", "INCONCLUSIVE"]);
const GATE_RESULTS = new Set(["PASS", "ACCEPTED_FALLBACK", "FAIL", "BLOCKED"]);
const LEGACY_PRE_W1_CRITERION_REFS = [
  "pain_interview_threshold",
  "target_channel_feasibility",
  "rules_replay_coverage",
  "independent_gate_approval",
  "registry_integrity",
];
const PRE_W1_CRITERION_REFS = [
  "pain_interview_threshold",
  "target_channel_feasibility",
  "rules_replay_coverage",
  "maintainer_gate_decision",
  "registry_integrity",
];
const COMMON_PROTOCOL_OUTPUTS = [
  "DEIDENTIFIED_PAIN_INTERVIEW_EVIDENCE",
  "DEIDENTIFIED_TARGET_CHANNEL_ELIGIBILITY_EVIDENCE",
  "FROZEN_PER_PARTICIPANT_JOB_DATASET_DIGESTS",
  "RULE_REPLAY_MEASUREMENTS",
  "COHORT_DENOMINATOR_AND_EXCLUSION_SUMMARY",
];
const LEGACY_GATE_DECISION_OUTPUT =
  "INDEPENDENT_GATE_DECISION_AND_APPROVAL_PROOF";
const MAINTAINER_GATE_DECISION_OUTPUT =
  "MAINTAINER_GATE_DECISION_AND_APPROVAL_PROOF";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const PARTICIPANT_SURROGATE_PATTERN = /^participant_[a-z0-9]{12,64}$/;
const root = repositoryRoot(import.meta.url);
const absolute = (relativePath) => path.join(root, ...relativePath.split("/"));
const requirePass = process.argv.includes("--require-pre-w1-pass");
const unknownArguments = process.argv.slice(2).filter(
  (argument) => argument !== "--require-pre-w1-pass",
);
const readinessBlockers = new Set();

function blocker(code) {
  readinessBlockers.add(code);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label) {
  invariant(isPlainObject(value), `${label} must be an object.`);
  return value;
}

function requireArray(value, label) {
  invariant(Array.isArray(value), `${label} must be an array.`);
  return value;
}

function requireString(value, label) {
  invariant(typeof value === "string" && value.trim().length > 0, `${label} is required.`);
  return value;
}

function requireIdentity(value, label) {
  requireString(value, label);
  invariant(IDENTIFIER_PATTERN.test(value), `${label} is not a stable identity.`);
  return value;
}

function isSoleMaintainerProtocol(protocol) {
  return protocol?.decision_authority?.governance_mode === "SOLE_MAINTAINER";
}

function requireSoleMaintainerProtocol(protocol, label = "protocol") {
  invariant(
    canonicalDigest(protocol.decision_authority) ===
      canonicalDigest(SOLE_MAINTAINER_AUTHORITY),
    `${label}.decision_authority does not match the configured sole maintainer.`,
  );
}

function requireSoleMaintainerDecision(identity, roleVersion, label) {
  invariant(
    identity === SOLE_MAINTAINER_AUTHORITY.identity,
    `${label} must use the configured sole-maintainer identity.`,
  );
  invariant(
    roleVersion === SOLE_MAINTAINER_AUTHORITY.role_version,
    `${label} must use the configured sole-maintainer role version.`,
  );
}

function criterionRefsForProtocol(protocol) {
  return isSoleMaintainerProtocol(protocol)
    ? PRE_W1_CRITERION_REFS
    : LEGACY_PRE_W1_CRITERION_REFS;
}

function validateGateDecisionAuthority(record, protocol, label) {
  if (isSoleMaintainerProtocol(protocol)) {
    requireSoleMaintainerProtocol(protocol, `${label} protocol`);
    requireSoleMaintainerDecision(
      record.approved_by,
      record.approver_role_version,
      label,
    );
    invariant(
      record.submitted_by === record.approved_by,
      `${label} must be submitted and decided by the configured sole maintainer.`,
    );
    return;
  }
  invariant(
    record.approved_by !== record.submitted_by,
    `${label} legacy decision cannot be self-approved.`,
  );
}

function requireSha256(value, label) {
  invariant(
    typeof value === "string" && SHA256_PATTERN.test(value),
    `${label} must be a lowercase SHA-256 digest.`,
  );
  return value;
}

function requireIsoTimestamp(value, label) {
  requireString(value, label);
  const parsed = Date.parse(value);
  invariant(Number.isFinite(parsed), `${label} must be an ISO-8601 timestamp.`);
  invariant(new Date(parsed).toISOString() === value, `${label} must be canonical UTC ISO-8601.`);
  return parsed;
}

function requireInteger(value, label, { minimum = 0 } = {}) {
  invariant(Number.isInteger(value) && value >= minimum, `${label} must be an integer >= ${minimum}.`);
  return value;
}

function requireParticipantSurrogate(value, label) {
  requireString(value, label);
  invariant(PARTICIPANT_SURROGATE_PATTERN.test(value), `${label} is not a cohort-local participant surrogate.`);
  return value;
}

function exactStringSet(actual, expected, label) {
  requireArray(actual, label);
  for (const [index, value] of actual.entries()) {
    requireString(value, `${label}[${index}]`);
  }
  invariant(new Set(actual).size === actual.length, `${label} must not contain duplicates.`);
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  invariant(
    canonicalDigest(actualSorted) === canonicalDigest(expectedSorted),
    `${label} differs from the required closed-world set.`,
  );
}

function exactValue(actual, expected, label) {
  invariant(
    canonicalDigest(actual) === canonicalDigest(expected),
    `${label} does not match the canonical expected value.`,
  );
}

function validateFixedDigest(document, digestField, label) {
  requireSha256(document[digestField], `${label}.${digestField}`);
  const body = structuredClone(document);
  delete body[digestField];
  invariant(
    document[digestField] === canonicalDigest(body),
    `${label}.${digestField} does not match its canonical body.`,
  );
}

function readRequiredJson(relativePath, label) {
  const filePath = absolute(relativePath);
  invariant(fs.existsSync(filePath), `${label} is missing at ${relativePath}.`);
  const document = readJson(filePath);
  requireObject(document, label);
  return document;
}

function loadSnapshotArchive(
  directory,
  prefix,
  digestField,
  label,
  schemaName,
) {
  const snapshots = new Map();
  for (const file of jsonFiles(absolute(directory))) {
    const snapshot = readJson(file);
    requireObject(snapshot, `${label} snapshot`);
    if (schemaName) {
      validateSchema(root, schemaName, snapshot, `${label} snapshot ${path.basename(file)}`);
    }
    validateFixedDigest(snapshot, digestField, `${label} snapshot`);
    const digest = snapshot[digestField];
    invariant(
      path.basename(file) === `${prefix}_${digest}.json`,
      `${label} snapshot filename does not match ${digestField}: ${file}`,
    );
    invariant(!snapshots.has(digest), `Duplicate ${label} snapshot ${digest}.`);
    snapshots.set(digest, snapshot);
  }
  invariant(snapshots.size > 0, `${label} snapshot archive is empty.`);
  return snapshots;
}

function validateSnapshotArchives(catalog, protocol, manifest) {
  const archives = {
    catalogs: loadSnapshotArchive(
      PATHS.catalogSnapshotDirectory,
      "catalog",
      "catalog_digest",
      "release-scope catalog",
      SCHEMA_NAMES.catalog,
    ),
    protocols: loadSnapshotArchive(
      PATHS.protocolSnapshotDirectory,
      "protocol",
      "protocol_digest",
      "research protocol",
      SCHEMA_NAMES.protocol,
    ),
    specs: loadSnapshotArchive(
      PATHS.specManifestSnapshotDirectory,
      "spec",
      "manifest_digest",
      "Spec Manifest",
      SCHEMA_NAMES.specManifest,
    ),
  };
  for (const [digest, snapshot] of archives.specs) {
    invariant(
      snapshot.verification_toolchain.digest ===
        digestFileMetadataSet(snapshot.verification_toolchain.files),
      `Spec Manifest snapshot ${digest} toolchain digest is not reproducible.`,
    );
    const normativeEntries = snapshot.inventory.filter(
      (entry) => entry.included_in_normative_set,
    );
    invariant(
      normativeEntries.length === snapshot.normative_file_count &&
        snapshot.normative_set_digest ===
          digestFileMetadataSet(normativeEntries),
      `Spec Manifest snapshot ${digest} normative digest is not reproducible.`,
    );
  }
  invariant(
    archives.catalogs.has(catalog.catalog_digest),
    "Current release-scope catalog has no immutable snapshot.",
  );
  invariant(
    archives.protocols.has(protocol.protocol_digest),
    "Current research protocol has no immutable snapshot.",
  );
  invariant(
    archives.specs.has(manifest.manifest_digest),
    "Current Spec Manifest has no immutable snapshot.",
  );
  exactValue(
    archives.catalogs.get(catalog.catalog_digest),
    catalog,
    "current catalog snapshot",
  );
  exactValue(
    archives.protocols.get(protocol.protocol_digest),
    protocol,
    "current protocol snapshot",
  );
  exactValue(
    archives.specs.get(manifest.manifest_digest),
    manifest,
    "current Spec Manifest snapshot",
  );
  return archives;
}

function assertReference(reference, fields, label) {
  requireObject(reference, label);
  for (const field of fields) {
    if (field.endsWith("_digest")) requireSha256(reference[field], `${label}.${field}`);
    else requireString(reference[field], `${label}.${field}`);
  }
}

function approvalReady(approval, label, acceptedStatuses = new Set(["APPROVED"])) {
  requireObject(approval, label);
  requireString(approval.status, `${label}.status`);
  requireSha256(approval.signed_payload_digest, `${label}.signed_payload_digest`);
  if (!acceptedStatuses.has(approval.status)) return false;

  requireIdentity(approval.approved_by, `${label}.approved_by`);
  requireIsoTimestamp(approval.approved_at, `${label}.approved_at`);
  requireString(approval.approver_role_version, `${label}.approver_role_version`);
  requireSha256(approval.approval_proof_digest, `${label}.approval_proof_digest`);
  return true;
}

function validatePendingApprovalFields(approval, label) {
  requireObject(approval, label);
  requireSha256(approval.signed_payload_digest, `${label}.signed_payload_digest`);
  for (const field of [
    "approved_by",
    "approved_at",
    "approver_role_version",
    "approval_proof_digest",
  ]) {
    invariant(approval[field] === null, `${label}.${field} must be null while approval is pending.`);
  }
}

function validateCatalog() {
  const catalog = readRequiredJson(PATHS.catalog, "Required Release Scope Catalog");
  validateSchema(root, SCHEMA_NAMES.catalog, catalog, "Required Release Scope Catalog");
  invariant(
    catalog.schema_version === "rolefox.required-release-scopes.v1",
    "Unexpected Required Release Scope Catalog schema_version.",
  );
  invariant(catalog.canonicalization === DIGEST_CONTRACT, "Catalog canonicalization mismatch.");
  requireString(catalog.catalog_version, "catalog.catalog_version");
  validateFixedDigest(catalog, "catalog_digest", "catalog");

  exactStringSet(catalog.compiled_from, [
    "docs/adr/0002-v0.1-product-decision-baseline.md",
    "docs/adr/0003-shadow-safety-control-exceptions.md",
    "docs/adr/0004-jd-raw-retention-and-preparation-pack.md",
    "docs/adr/0005-sole-maintainer-governance.md",
    "docs/product/implementation-verification-v0.1.md",
  ], "catalog.compiled_from");

  const scopes = requireArray(catalog.scopes, "catalog.scopes");
  exactStringSet(scopes.map((scope) => requireObject(scope, "catalog scope").scope_id), REQUIRED_RELEASE_SCOPE_IDS, "catalog scope IDs");

  const readScopes = new Set(["job_source_read", "mailbox_read", "calendar_busy_read"]);
  const businessScopes = new Set([
    "mailbox_reply_l2",
    "default_email_notification",
    "calendar_tentative_create",
    "calendar_tentative_cancel",
    "calendar_tentative_update",
    "application_submit_l2",
  ]);
  const safetyScopes = new Set([
    "safety_liveness_heartbeat",
    "safety_stop_alert",
    "credential_revocation",
  ]);
  const readGateIds = [
    "CAPABILITY_G0",
    "PROJECT_C_PLATFORM_PREFLIGHT",
    "PROJECT_C_PLATFORM_REAL_READ",
  ];
  const businessGateIds = [
    "CAPABILITY_G0",
    "PROJECT_A_GENERALITY",
    "PROJECT_B_SYNTHETIC_SAFETY",
    "VALIDATION_OUTBOUND_CALIBRATION",
    "PROJECT_C_PLATFORM_PREFLIGHT",
    "CAPABILITY_G1",
    "PROJECT_C_PLATFORM_LIVE",
  ];
  const safetyGateIds = [
    "CAPABILITY_G0",
    "PROJECT_C_PLATFORM_PREFLIGHT",
    "PROJECT_B_SYNTHETIC_SAFETY",
    "SAFETY_CONTROL_GUARD",
    "PROJECT_C_PLATFORM_LIVE",
  ];

  for (const scope of scopes) {
    const label = `catalog scope ${scope.scope_id}`;
    requireString(scope.capability, `${label}.capability`);
    requireString(scope.channel_role, `${label}.channel_role`);
    requireString(scope.release_requirement, `${label}.release_requirement`);
    invariant(typeof scope.reads_real_data === "boolean", `${label}.reads_real_data must be boolean.`);
    invariant(typeof scope.performs_real_mutation === "boolean", `${label}.performs_real_mutation must be boolean.`);
    invariant(typeof scope.fallback_allowed === "boolean", `${label}.fallback_allowed must be boolean.`);
    const gateIds = requireArray(scope.required_gate_ids, `${label}.required_gate_ids`);
    invariant(gateIds.length > 0, `${label}.required_gate_ids must not be empty.`);
    exactStringSet(gateIds, gateIds, `${label}.required_gate_ids`);

    if (readScopes.has(scope.scope_id)) {
      invariant(scope.scope_effect === "READ", `${label} must have READ effect.`);
      invariant(scope.execution_class === "READ_ONLY", `${label} must be READ_ONLY.`);
      invariant(scope.minimum_mode === "READ_ONLY" && scope.maximum_mode === "READ_ONLY", `${label} mode bounds must be READ_ONLY.`);
      invariant(scope.reads_real_data && !scope.performs_real_mutation, `${label} real-data/mutation flags are invalid.`);
      exactStringSet(scope.required_gate_ids, readGateIds, `${label}.required_gate_ids`);
      invariant(scope.release_requirement === "REQUIRED", `${label} must remain REQUIRED.`);
    } else if (businessScopes.has(scope.scope_id)) {
      invariant(scope.scope_effect === "BUSINESS_OUTBOUND_MUTATION", `${label} must be a business outbound mutation.`);
      invariant(scope.execution_class === "BUSINESS_MODE", `${label} must use BUSINESS_MODE.`);
      invariant(scope.minimum_mode === "L2" && scope.maximum_mode === "L3", `${label} mode bounds must be L2..L3.`);
      invariant(scope.performs_real_mutation, `${label} must declare real mutation.`);
      exactStringSet(scope.required_gate_ids, businessGateIds, `${label}.required_gate_ids`);
      if (scope.scope_id === "calendar_tentative_update") {
        invariant(scope.release_requirement === "CONDITIONAL_IF_ENABLED_OR_L3", `${label} release condition mismatch.`);
      } else if (scope.scope_id === "application_submit_l2") {
        invariant(scope.release_requirement === "REQUIRED_LIVE_OR_ACCEPTED_FALLBACK", `${label} release condition mismatch.`);
      } else {
        invariant(scope.release_requirement === "REQUIRED", `${label} must remain REQUIRED.`);
      }
    } else if (safetyScopes.has(scope.scope_id)) {
      invariant(scope.scope_effect === "SAFETY_CONTROL_MUTATION", `${label} must be a safety-control mutation.`);
      invariant(scope.execution_class === "SAFETY_CONTROL_ONLY", `${label} must use SAFETY_CONTROL_ONLY.`);
      invariant(scope.minimum_mode === null && scope.maximum_mode === null, `${label} must not claim a business mode.`);
      invariant(scope.performs_real_mutation, `${label} must declare real mutation.`);
      exactStringSet(scope.required_gate_ids, safetyGateIds, `${label}.required_gate_ids`);
      if (scope.scope_id === "credential_revocation") {
        invariant(scope.release_requirement === "CONDITIONAL_IF_SUPPORTED_AND_DELETION_REQUESTED", `${label} release condition mismatch.`);
      } else {
        invariant(scope.release_requirement === "REQUIRED", `${label} must remain REQUIRED.`);
      }
    } else {
      invariant(scope.scope_id === "release_v01_real_provider_joined", `Unknown scope ${scope.scope_id}.`);
      invariant(scope.scope_effect === "JOINED_RELEASE", `${label} must have JOINED_RELEASE effect.`);
      invariant(scope.execution_class === "JOINED_RELEASE", `${label} must use JOINED_RELEASE.`);
      invariant(scope.minimum_mode === null && scope.maximum_mode === null, `${label} must not claim a mode.`);
      invariant(scope.reads_real_data && scope.performs_real_mutation, `${label} must bind real read and mutation evidence.`);
      invariant(scope.release_requirement === "REQUIRED", `${label} must remain REQUIRED.`);
      exactStringSet(scope.required_gate_ids, ["RELEASE_G3_OSS_STABILITY", "RELEASE_V01_REAL_PROVIDER"], `${label}.required_gate_ids`);
    }

    if (scope.scope_id === "application_submit_l2") {
      invariant(scope.fallback_allowed === true, `${label} must retain its accepted scoped fallback.`);
      invariant(
        scope.fallback_policy === "ACCEPTED_FALLBACK_READ_EXPORT_PREFILL_DEEPLINK_ZERO_OUTBOUND",
        `${label}.fallback_policy mismatch.`,
      );
    } else {
      invariant(scope.fallback_allowed === false, `${label} must not allow fallback.`);
      invariant(scope.fallback_policy === undefined, `${label} must not define a fallback policy.`);
    }
  }

  invariant(
    ["PROPOSED_PENDING_MAINTAINER_DECISION", "ACCEPTED"].includes(catalog.status),
    "catalog.status is invalid.",
  );
  const review = requireObject(catalog.review, "catalog.review");
  assertNoSensitivePublicData(review, "catalog.review");
  requireSha256(review.signed_payload_digest, "catalog.review.signed_payload_digest");
  invariant(
    review.signed_payload_digest ===
      canonicalDigestExcluding(catalog, ["catalog_digest", "review"]),
    "Catalog review signed_payload_digest mismatch.",
  );
  if (catalog.status !== "ACCEPTED") {
    invariant(review.reviewed_by === null, "catalog.review.reviewed_by must be null while pending.");
    invariant(review.reviewed_at === null, "catalog.review.reviewed_at must be null while pending.");
    invariant(review.approver_role_version === null, "catalog.review.approver_role_version must be null while pending.");
    invariant(review.approval_proof_digest === null, "catalog.review.approval_proof_digest must be null while pending.");
  }
  const reviewIsReady = catalog.status === "ACCEPTED" && approvalReady(
    {
      status: catalog.status,
      signed_payload_digest: review.signed_payload_digest,
      approved_by: review.reviewed_by,
      approved_at: review.reviewed_at,
      approver_role_version: review.approver_role_version,
      approval_proof_digest: review.approval_proof_digest,
    },
    "catalog.review",
    new Set(["ACCEPTED"]),
  );
  if (reviewIsReady) {
    requireSoleMaintainerDecision(
      review.reviewed_by,
      review.approver_role_version,
      "catalog.review",
    );
  } else {
    blocker("REQUIRED_SCOPE_CATALOG_MAINTAINER_DECISION_PENDING");
  }
  return catalog;
}

function validateProtocol() {
  const protocol = readRequiredJson(PATHS.protocol, "Pre-W1 research protocol");
  validateSchema(root, SCHEMA_NAMES.protocol, protocol, "Pre-W1 research protocol");
  invariant(
    protocol.schema_version === "rolefox.pre-w1-research-protocol.v1",
    "Unexpected Pre-W1 protocol schema_version.",
  );
  invariant(protocol.canonicalization === DIGEST_CONTRACT, "Protocol canonicalization mismatch.");
  requireString(protocol.protocol_version, "protocol.protocol_version");
  validateFixedDigest(protocol, "protocol_digest", "protocol");
  invariant(protocol.gate_id === GATE_IDS.preW1, "Protocol gate_id mismatch.");
  invariant(protocol.failure_state === "BLOCKED_NOT_STARTED", "Protocol failure_state must fail closed.");
  requireSoleMaintainerProtocol(protocol, "protocol");
  invariant(
    protocol.collection_guard === "NO_RECRUITMENT_OR_EVIDENCE_COLLECTION_BEFORE_APPROVAL",
    "Protocol collection_guard mismatch.",
  );

  const privacy = requireObject(protocol.privacy, "protocol.privacy");
  invariant(
    privacy.public_repository_content === "DEIDENTIFIED_MANIFESTS_AND_DIGESTS_ONLY",
    "Protocol public-repository privacy policy mismatch.",
  );
  invariant(
    privacy.raw_interviews_and_mappings === "CONTROLLED_ARTIFACT_STORE_ONLY",
    "Protocol raw-artifact policy mismatch.",
  );
  invariant(
    privacy.participant_identifier === "RANDOM_COHORT_LOCAL_SURROGATE",
    "Protocol participant-identifier policy mismatch.",
  );
  exactStringSet(privacy.forbidden_public_fields, [
    "name",
    "email",
    "resume_text",
    "message_text",
    "calendar_content",
    "credential",
    "direct_external_id",
  ], "protocol.privacy.forbidden_public_fields");

  const cohorts = requireObject(protocol.cohorts, "protocol.cohorts");
  const pain = requireObject(cohorts.pain_interviews, "protocol.cohorts.pain_interviews");
  invariant(pain.target_minimum === 6 && pain.target_maximum === 8, "Pain interview cohort must remain 6..8.");
  invariant(pain.pass_numerator_minimum === 5, "Pain threshold numerator must remain >=5.");
  invariant(
    pain.qualification_window === "ACTIVE_JOB_SEARCH_WITHIN_PREVIOUS_3_MONTHS",
    "Pain qualification window mismatch.",
  );
  invariant(
    pain.pass_criteria?.opportunities_per_week_minimum === 10 &&
      pain.pass_criteria?.repetitive_work_rank_maximum === 3,
    "Pain threshold criteria mismatch.",
  );
  const channel = requireObject(
    cohorts.target_channel_feasibility,
    "protocol.cohorts.target_channel_feasibility",
  );
  invariant(channel.eligible_n_minimum === 5, "Target-channel eligibleN must remain >=5.");
  invariant(
    channel.counting_rule === "SEPARATE_DENOMINATOR_FROM_PAIN_INTERVIEWS",
    "Target-channel denominator must remain independent.",
  );
  exactStringSet(channel.eligibility_all_of, [
    "CURRENTLY_JOB_SEARCHING",
    "APPLICATIONS_PRIMARILY_ONLINE",
    "RECRUITING_COMMUNICATION_CAN_REACH_EMAIL",
    "WILLING_TO_CONNECT_REAL_MAILBOX",
    "WILLING_TO_CONNECT_ONE_REAL_CALENDAR_PROVIDER",
  ], "channel eligibility criteria");

  const replay = requireObject(protocol.rules_replay, "protocol.rules_replay");
  invariant(replay.participants_minimum === 5, "Rules replay must retain at least five qualified participants.");
  invariant(replay.participant_must_pass_pain_threshold === true, "Rules replay participants must pass the pain threshold.");
  invariant(replay.jobs_per_participant === 20, "Rules replay must retain 20 jobs per participant.");
  invariant(replay.dataset_freeze_before_replay === true, "Rules replay dataset must be frozen before replay.");
  invariant(replay.pass_criteria?.explicit_rejection_reasons_covered === "ALL", "Rules replay must cover all explicit rejection reasons.");
  invariant(replay.pass_criteria?.remaining_ambiguity === "FINITE_EXCEPTION_CATEGORIES", "Rules replay ambiguity must reduce to finite exception categories.");
  exactStringSet(
    protocol.required_outputs,
    [...COMMON_PROTOCOL_OUTPUTS, MAINTAINER_GATE_DECISION_OUTPUT],
    "protocol.required_outputs",
  );

  invariant(
    ["DRAFT_PENDING_PRODUCT_OWNER_APPROVAL", "APPROVED"].includes(protocol.status),
    "protocol.status is invalid.",
  );
  requireObject(protocol.approval, "protocol.approval");
  assertNoSensitivePublicData(protocol.approval, "protocol.approval");
  requireSha256(
    protocol.approval.signed_payload_digest,
    "protocol.approval.signed_payload_digest",
  );
  invariant(
    protocol.approval.signed_payload_digest ===
      canonicalDigestExcluding(protocol, ["protocol_digest", "approval"]),
    "Protocol approval signed_payload_digest mismatch.",
  );
  if (protocol.status !== "APPROVED") {
    validatePendingApprovalFields(protocol.approval, "protocol.approval");
  }
  const approved = protocol.status === "APPROVED" && approvalReady(
    { status: protocol.status, ...protocol.approval },
    "protocol.approval",
  );
  if (approved) {
    requireSoleMaintainerDecision(
      protocol.approval.approved_by,
      protocol.approval.approver_role_version,
      "protocol.approval",
    );
  } else {
    blocker("RESEARCH_PROTOCOL_APPROVAL_PENDING");
  }
  return protocol;
}

function validateSpecManifest(catalog, protocol) {
  const manifest = readRequiredJson(PATHS.specManifest, "Spec Manifest");
  validateSchema(root, SCHEMA_NAMES.specManifest, manifest, "Spec Manifest");
  invariant(manifest.schema_version === "rolefox.spec-manifest.v1", "Unexpected Spec Manifest schema_version.");
  invariant(manifest.canonicalization === DIGEST_CONTRACT, "Spec Manifest canonicalization mismatch.");
  invariant(manifest.algorithm === "sha256", "Spec Manifest algorithm must be sha256.");
  requireString(manifest.manifest_version, "spec manifest version");
  validateFixedDigest(manifest, "manifest_digest", "spec manifest");
  const currentToolchain = digestFileSet(root, VERIFICATION_TOOLCHAIN_FILES);
  exactValue(
    manifest.verification_toolchain,
    currentToolchain,
    "Spec Manifest verification toolchain",
  );

  const expectedInventoryPaths = [...ACCEPTED_SPEC_FILES, PATHS.catalog, PATHS.protocol];
  const inventory = requireArray(manifest.inventory, "spec manifest inventory");
  exactStringSet(inventory.map((entry) => requireObject(entry, "spec inventory entry").path), expectedInventoryPaths, "spec manifest inventory paths");

  const includedPaths = [];
  for (const entry of inventory) {
    const label = `spec inventory ${entry.path}`;
    invariant(["ACCEPTED", "DRAFT", "PROPOSED", "INFORMATIONAL"].includes(entry.authority_status), `${label}.authority_status is invalid.`);
    invariant(typeof entry.included_in_normative_set === "boolean", `${label}.included_in_normative_set must be boolean.`);
    requireString(entry.status_source, `${label}.status_source`);
    const diskFile = digestFileSet(root, [entry.path]).files[0];
    invariant(entry.bytes === diskFile.bytes, `${label}.bytes mismatch.`);
    invariant(entry.sha256 === diskFile.sha256, `${label}.sha256 mismatch.`);
    if (entry.included_in_normative_set) {
      invariant(entry.authority_status === "ACCEPTED", `${label} cannot be normative unless ACCEPTED.`);
      includedPaths.push(entry.path);
    }
    if (ACCEPTED_SPEC_FILES.includes(entry.path)) {
      invariant(entry.authority_status === "ACCEPTED", `${label} must remain ACCEPTED.`);
      invariant(entry.included_in_normative_set === true, `${label} must remain in the normative set.`);
    }
  }

  const normative = digestFileSet(root, includedPaths);
  invariant(manifest.normative_file_count === includedPaths.length, "Spec Manifest normative_file_count mismatch.");
  invariant(manifest.normative_set_digest === normative.digest, "Spec Manifest normative_set_digest mismatch.");
  invariant(manifest.normative_file_count >= ACCEPTED_SPEC_FILES.length, "Spec Manifest omitted an accepted baseline file.");
  invariant(
    manifest.generation?.tool === "scripts/verification/bootstrap-pre-w1.mjs" &&
      manifest.generation?.deterministic_inputs === true,
    "Spec Manifest generation provenance is invalid.",
  );

  const catalogEntry = inventory.find((entry) => entry.path === PATHS.catalog);
  const protocolEntry = inventory.find((entry) => entry.path === PATHS.protocol);
  const catalogRef = requireObject(
    manifest.required_release_scope_catalog_ref,
    "spec manifest catalog reference",
  );
  invariant(catalogRef.path === PATHS.catalog, "Spec Manifest catalog reference path mismatch.");
  invariant(catalogRef.catalog_digest === catalog.catalog_digest, "Spec Manifest catalog reference digest mismatch.");
  invariant(
    catalogRef.authority_status === catalogEntry.authority_status,
    "Spec Manifest catalog authority reference mismatch.",
  );
  const protocolRef = requireObject(
    manifest.research_protocol_ref,
    "spec manifest research-protocol reference",
  );
  invariant(protocolRef.path === PATHS.protocol, "Spec Manifest protocol reference path mismatch.");
  invariant(protocolRef.protocol_digest === protocol.protocol_digest, "Spec Manifest protocol reference digest mismatch.");
  invariant(
    protocolRef.authority_status === protocolEntry.authority_status,
    "Spec Manifest protocol authority reference mismatch.",
  );
  invariant(catalogEntry.status_source === catalog.status, "Catalog status_source is stale in Spec Manifest.");
  invariant(protocolEntry.status_source === protocol.status, "Protocol status_source is stale in Spec Manifest.");
  const expectedCatalogAuthority = catalog.status === "ACCEPTED" ? "ACCEPTED" : "PROPOSED";
  const expectedProtocolAuthority = protocol.status === "APPROVED" ? "ACCEPTED" : "PROPOSED";
  invariant(
    catalogEntry.authority_status === expectedCatalogAuthority &&
      catalogEntry.included_in_normative_set === (expectedCatalogAuthority === "ACCEPTED"),
    "Catalog authority/inclusion state is inconsistent with its review status.",
  );
  invariant(
    protocolEntry.authority_status === expectedProtocolAuthority &&
      protocolEntry.included_in_normative_set === (expectedProtocolAuthority === "ACCEPTED"),
    "Protocol authority/inclusion state is inconsistent with its approval status.",
  );
  if (
    catalog.status === "ACCEPTED" &&
    !(catalogEntry.authority_status === "ACCEPTED" && catalogEntry.included_in_normative_set)
  ) {
    blocker("ACCEPTED_CATALOG_NOT_IN_NORMATIVE_SPEC_SET");
  }
  if (
    protocol.status === "APPROVED" &&
    !(protocolEntry.authority_status === "ACCEPTED" && protocolEntry.included_in_normative_set)
  ) {
    blocker("APPROVED_PROTOCOL_NOT_IN_NORMATIVE_SPEC_SET");
  }
  invariant(
    catalogEntry.approval_proof_digest === catalog.review.approval_proof_digest,
    "Spec Manifest catalog approval proof mismatch.",
  );
  invariant(
    protocolEntry.approval_proof_digest === protocol.approval.approval_proof_digest,
    "Spec Manifest protocol approval proof mismatch.",
  );
  return manifest;
}

function validateCandidate(manifest, catalog, protocol, archives) {
  const index = readRequiredJson(PATHS.candidateIndex, "Current Pre-W1 candidate pointer");
  invariant(index.schema_version === "rolefox.current-candidate-scope.v1", "Unexpected candidate pointer schema_version.");
  requireString(index.candidate_scope_manifest_id, "candidate pointer ID");
  requireSha256(index.manifest_digest, "candidate pointer digest");
  requireString(index.path, "candidate pointer path");
  invariant(
    index.path === `${PATHS.candidateDirectory}/${index.candidate_scope_manifest_id}.json`,
    "Candidate pointer path is not content-addressed by its ID.",
  );

  const candidateFiles = jsonFiles(absolute(PATHS.candidateDirectory)).filter(
    (file) => path.basename(file) !== path.basename(PATHS.candidateIndex),
  );
  invariant(candidateFiles.length > 0, "No immutable Candidate Scope Manifest exists.");
  const candidates = new Map();
  for (const file of candidateFiles) {
    const candidate = readJson(file);
    validateSchema(
      root,
      SCHEMA_NAMES.candidate,
      candidate,
      `Candidate Scope Manifest ${path.basename(file)}`,
    );
    invariant(candidate.schema_version === "rolefox.candidate-scope-manifest.v1", `Unexpected candidate schema in ${file}.`);
    verifyAddressedDocument(candidate, {
      prefix: "candidate",
      idField: "candidate_scope_manifest_id",
      digestField: "manifest_digest",
    });
    invariant(path.basename(file) === `${candidate.candidate_scope_manifest_id}.json`, `Candidate filename mismatch: ${file}.`);
    invariant(!candidates.has(candidate.candidate_scope_manifest_id), `Duplicate candidate ${candidate.candidate_scope_manifest_id}.`);
    const candidateSpec = archives.specs.get(candidate.spec_manifest_ref?.manifest_digest);
    const candidateCatalog = archives.catalogs.get(
      candidate.required_release_scope_catalog_ref?.catalog_digest,
    );
    const candidateProtocol = archives.protocols.get(
      candidate.research_protocol_ref?.protocol_digest,
    );
    invariant(candidateSpec, `Candidate ${candidate.candidate_scope_manifest_id} references a missing Spec Manifest snapshot.`);
    invariant(
      candidateCatalog,
      `Candidate ${candidate.candidate_scope_manifest_id} references a missing catalog snapshot.`,
    );
    invariant(
      candidateProtocol,
      `Candidate ${candidate.candidate_scope_manifest_id} references a missing protocol snapshot.`,
    );
    invariant(
      candidate.verification_toolchain_ref?.digest ===
        candidateSpec.verification_toolchain?.digest,
      `Candidate ${candidate.candidate_scope_manifest_id} toolchain does not match its Spec Manifest snapshot.`,
    );
    invariant(
      candidate.spec_manifest_ref?.normative_set_digest ===
          candidateSpec.normative_set_digest &&
        candidateSpec.required_release_scope_catalog_ref?.catalog_digest ===
          candidateCatalog.catalog_digest &&
        candidateSpec.research_protocol_ref?.protocol_digest ===
          candidateProtocol.protocol_digest,
      `Candidate ${candidate.candidate_scope_manifest_id} authority references do not match its historical snapshots.`,
    );
    invariant(
      candidate.approval?.signed_payload_digest ===
        canonicalDigestExcluding(candidate, [
          "candidate_scope_manifest_id",
          "manifest_digest",
          "approval",
        ]),
      `Candidate ${candidate.candidate_scope_manifest_id} approval payload digest is not reproducible.`,
    );
    assertNoSensitivePublicData(
      candidate.approval,
      `Candidate ${candidate.candidate_scope_manifest_id} approval`,
      candidateProtocol.privacy?.forbidden_public_fields ?? [],
    );
    if (candidate.candidate_artifact_kind === "SPEC_OR_EXPERIMENT") {
      invariant(
        candidate.candidate_artifact_digest ===
          canonicalDigest({
            kind: "SPEC_OR_EXPERIMENT",
            spec_manifest_digest: candidate.spec_manifest_ref.manifest_digest,
            normative_set_digest: candidate.spec_manifest_ref.normative_set_digest,
            catalog_digest:
              candidate.required_release_scope_catalog_ref.catalog_digest,
            research_protocol_digest: candidate.research_protocol_ref.protocol_digest,
            verification_toolchain_digest: candidate.verification_toolchain_ref.digest,
            release_scope_ids: [...candidate.release_scope_ids].sort(),
            research_scope_ids: [...candidate.research_scope_ids].sort(),
          }),
        `Candidate ${candidate.candidate_scope_manifest_id} artifact digest is not reproducible.`,
      );
    }
    candidates.set(candidate.candidate_scope_manifest_id, candidate);
  }

  const candidate = candidates.get(index.candidate_scope_manifest_id);
  invariant(candidate, "Current candidate pointer does not resolve to an immutable manifest.");
  invariant(index.manifest_digest === candidate.manifest_digest, "Current candidate pointer digest mismatch.");
  invariant(candidate.manifest_kind === "SPEC_OR_EXPERIMENT", "Pre-W1 candidate must be SPEC_OR_EXPERIMENT.");
  invariant(candidate.candidate_artifact_kind === "SPEC_OR_EXPERIMENT", "Pre-W1 candidate artifact kind mismatch.");
  requireSha256(candidate.candidate_artifact_digest, "candidate.candidate_artifact_digest");
  assertReference(
    candidate.verification_toolchain_ref,
    ["digest"],
    "candidate.verification_toolchain_ref",
  );
  invariant(
    candidate.verification_toolchain_ref.digest ===
      manifest.verification_toolchain.digest,
    "Candidate verification toolchain reference is stale.",
  );
  const candidateCreatedAt = requireIsoTimestamp(candidate.created_at, "candidate.created_at");
  invariant(candidate.cohort_and_criteria_frozen === true, "Candidate cohort and criteria must be frozen.");
  requireObject(candidate.approval, "candidate.approval");
  requireSha256(
    candidate.approval.signed_payload_digest,
    "candidate.approval.signed_payload_digest",
  );
  invariant(
    candidate.approval.signed_payload_digest ===
      canonicalDigestExcluding(candidate, [
        "candidate_scope_manifest_id",
        "manifest_digest",
        "approval",
      ]),
    "Candidate approval signed_payload_digest mismatch.",
  );
  exactStringSet(candidate.release_scope_ids, REQUIRED_RELEASE_SCOPE_IDS, "candidate.release_scope_ids");
  exactStringSet(candidate.research_scope_ids, PRE_W1_RESEARCH_SCOPE_IDS, "candidate.research_scope_ids");
  exactValue(candidate.software_capabilities_claimed, [], "candidate.software_capabilities_claimed");

  assertReference(candidate.spec_manifest_ref, ["path", "manifest_digest", "normative_set_digest"], "candidate.spec_manifest_ref");
  invariant(candidate.spec_manifest_ref.path === PATHS.specManifest, "Candidate Spec Manifest path mismatch.");
  invariant(candidate.spec_manifest_ref.manifest_digest === manifest.manifest_digest, "Candidate Spec Manifest digest is stale.");
  invariant(candidate.spec_manifest_ref.normative_set_digest === manifest.normative_set_digest, "Candidate normative-set digest is stale.");
  assertReference(candidate.required_release_scope_catalog_ref, ["path", "catalog_digest"], "candidate.catalog_ref");
  invariant(candidate.required_release_scope_catalog_ref.path === PATHS.catalog, "Candidate catalog path mismatch.");
  invariant(candidate.required_release_scope_catalog_ref.catalog_digest === catalog.catalog_digest, "Candidate catalog digest is stale.");
  assertReference(candidate.research_protocol_ref, ["path", "protocol_digest"], "candidate.protocol_ref");
  invariant(candidate.research_protocol_ref.path === PATHS.protocol, "Candidate protocol path mismatch.");
  invariant(candidate.research_protocol_ref.protocol_digest === protocol.protocol_digest, "Candidate protocol digest is stale.");

  const expectedArtifactDigest = canonicalDigest({
    kind: "SPEC_OR_EXPERIMENT",
    spec_manifest_digest: manifest.manifest_digest,
    normative_set_digest: manifest.normative_set_digest,
    catalog_digest: catalog.catalog_digest,
    research_protocol_digest: protocol.protocol_digest,
    verification_toolchain_digest: manifest.verification_toolchain.digest,
    release_scope_ids: [...REQUIRED_RELEASE_SCOPE_IDS].sort(),
    research_scope_ids: [...PRE_W1_RESEARCH_SCOPE_IDS].sort(),
  });
  invariant(candidate.candidate_artifact_digest === expectedArtifactDigest, "Candidate artifact digest does not bind its frozen inputs.");

  invariant(["PENDING", "APPROVED"].includes(candidate.approval?.status), "candidate.approval.status is invalid.");
  if (candidate.approval.status === "PENDING") {
    validatePendingApprovalFields(candidate.approval, "candidate.approval");
  }
  const approved = approvalReady(candidate.approval, "candidate.approval");
  if (approved) {
    requireSoleMaintainerDecision(
      candidate.approval.approved_by,
      candidate.approval.approver_role_version,
      "candidate.approval",
    );
    const approvedAt = requireIsoTimestamp(candidate.approval.approved_at, "candidate.approval.approved_at");
    invariant(approvedAt >= candidateCreatedAt, "Candidate approval predates candidate creation.");
    invariant(
      candidate.collection_guard === "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION",
      "Approved candidate must open only protocol-bound collection.",
    );
    invariant(
      index.readiness === "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION",
      "Candidate pointer readiness is stale.",
    );
  } else {
    invariant(candidate.collection_guard === "BLOCKED_UNTIL_APPROVED", "Unapproved candidate must block collection.");
    invariant(
      index.readiness === "PENDING_PRODUCT_OWNER_APPROVAL",
      "Unapproved candidate pointer must remain pending.",
    );
    blocker("CANDIDATE_SCOPE_APPROVAL_PENDING");
  }
  return { candidate, candidateCreatedAt, candidates };
}

function validateEvidence(archives, candidates) {
  const evidenceDirectory = absolute(PATHS.evidenceDirectory);
  const files = jsonFiles(evidenceDirectory);
  const evidenceById = new Map();

  for (const file of files) {
    const evidence = readJson(file);
    const label = `evidence ${path.basename(file)}`;
    requireObject(evidence, label);
    validateSchema(root, SCHEMA_NAMES.evidence, evidence, label);
    invariant(evidence.schema_version === "rolefox.evidence-manifest.v1", `${label} schema_version mismatch.`);
    verifyEvidenceDocument(evidence);
    invariant(path.basename(file) === `${evidence.evidence_id}.json`, `${label} filename does not match evidence_id.`);
    invariant(!evidenceById.has(evidence.evidence_id), `Duplicate evidence ID ${evidence.evidence_id}.`);
    evidenceById.set(evidence.evidence_id, evidence);
    assertReference(evidence.candidate_scope_manifest_ref, ["candidate_scope_manifest_id", "manifest_digest"], `${label}.candidate_scope_manifest_ref`);
    assertReference(evidence.spec_manifest_ref, ["manifest_digest", "normative_set_digest"], `${label}.spec_manifest_ref`);
    assertReference(evidence.required_release_scope_catalog_ref, ["catalog_digest"], `${label}.catalog_ref`);
    assertReference(evidence.research_protocol_ref, ["protocol_digest"], `${label}.protocol_ref`);
    const historicalCandidate = candidates.get(
      evidence.candidate_scope_manifest_ref.candidate_scope_manifest_id,
    );
    const historicalSpec = archives.specs.get(
      evidence.spec_manifest_ref.manifest_digest,
    );
    const historicalCatalog = archives.catalogs.get(
      evidence.required_release_scope_catalog_ref.catalog_digest,
    );
    const historicalProtocol = archives.protocols.get(
      evidence.research_protocol_ref.protocol_digest,
    );
    invariant(historicalCandidate, `${label} references a missing Candidate Scope Manifest.`);
    invariant(historicalSpec, `${label} references a missing Spec Manifest snapshot.`);
    invariant(historicalCatalog, `${label} references a missing release-scope catalog snapshot.`);
    invariant(historicalProtocol, `${label} references a missing research protocol snapshot.`);
    invariant(
      evidence.candidate_scope_manifest_ref.manifest_digest ===
        historicalCandidate.manifest_digest,
      `${label} candidate digest mismatch.`,
    );
    invariant(
      evidence.spec_manifest_ref.normative_set_digest ===
          historicalSpec.normative_set_digest &&
        historicalCandidate.spec_manifest_ref.manifest_digest ===
          historicalSpec.manifest_digest &&
        historicalCandidate.required_release_scope_catalog_ref.catalog_digest ===
          historicalCatalog.catalog_digest &&
        historicalCandidate.research_protocol_ref.protocol_digest ===
          historicalProtocol.protocol_digest,
      `${label} historical authority binding mismatch.`,
    );
    const forbiddenFields = historicalProtocol.privacy.forbidden_public_fields.map(
      normalizePublicKey,
    );
    assertNoSensitivePublicData(evidence, label, forbiddenFields);

    invariant(EVIDENCE_KINDS.has(evidence.evidence_kind), `${label}.evidence_kind is not a Pre-W1 kind.`);
    invariant(evidence.research_scope_id === EVIDENCE_KINDS.get(evidence.evidence_kind), `${label}.research_scope_id mismatch.`);
    invariant(EVIDENCE_TYPES.includes(evidence.evidence_type), `${label}.evidence_type is not canonical.`);
    invariant(evidence.evidence_type === "USER_RESEARCH", `${label}.evidence_type must be USER_RESEARCH.`);
    invariant(EVIDENCE_RESULTS.has(evidence.result), `${label}.result is invalid.`);
    requireString(evidence.run_id, `${label}.run_id`);
    const startedAt = requireIsoTimestamp(evidence.started_at, `${label}.started_at`);
    const completedAt = requireIsoTimestamp(evidence.completed_at, `${label}.completed_at`);
    invariant(completedAt >= startedAt, `${label} completed before it started.`);
    invariant(historicalCatalog.status === "ACCEPTED", `${label} was created before the release-scope catalog was accepted.`);
    invariant(historicalProtocol.status === "APPROVED", `${label} was created before the research protocol was approved.`);
    invariant(historicalCandidate.approval.status === "APPROVED", `${label} was created before the Candidate Scope was approved.`);
    const collectionNotBefore = Math.max(
      requireIsoTimestamp(historicalCatalog.review.reviewed_at, "catalog.review.reviewed_at"),
      requireIsoTimestamp(historicalProtocol.approval.approved_at, "protocol.approval.approved_at"),
      requireIsoTimestamp(historicalCandidate.approval.approved_at, "candidate.approval.approved_at"),
    );
    invariant(startedAt >= collectionNotBefore, `${label} predates a required frozen-input approval.`);
    const producer = requireObject(evidence.producer, `${label}.producer`);
    requireIdentity(producer.identity, `${label}.producer.identity`);
    invariant(
      ["CI_WORKLOAD_IDENTITY", "APPROVED_OPERATOR"].includes(producer.identity_kind),
      `${label}.producer.identity_kind is invalid.`,
    );
    requireString(producer.allowlist_version, `${label}.producer.allowlist_version`);
    invariant(evidence.candidate_artifact_kind === "SPEC_OR_EXPERIMENT", `${label} candidate kind mismatch.`);
    invariant(evidence.candidate_artifact_digest === historicalCandidate.candidate_artifact_digest, `${label} candidate artifact digest mismatch.`);

    const subjectRefs = requireArray(evidence.subject_refs, `${label}.subject_refs`);
    invariant(subjectRefs.length > 0, `${label}.subject_refs must not be empty.`);
    const subjectCriterionIds = [];
    for (const reference of subjectRefs) {
      invariant(reference?.subject_type === "GATE_CRITERION", `${label} has an invalid subject_type.`);
      invariant(reference.gate_id === GATE_IDS.preW1, `${label} subject gate_id mismatch.`);
      requireString(reference.criterion_id, `${label} subject criterion_id`);
      subjectCriterionIds.push(reference.criterion_id);
    }
    exactStringSet(subjectCriterionIds, subjectCriterionIds, `${label} subject criterion IDs`);
    const measurements = requireArray(evidence.measurements, `${label}.measurements`);
    const expectedMeasurementType = {
      PAIN_INTERVIEWS: "PAIN_THRESHOLD",
      TARGET_CHANNEL_FEASIBILITY: "CHANNEL_ELIGIBILITY",
      RULES_REPLAY: "RULE_REPLAY",
    }[evidence.evidence_kind];
    invariant(
      measurements.length === 1 && measurements[0]?.measurement_type === expectedMeasurementType,
      `${label} must contain exactly its matching ${expectedMeasurementType} measurement.`,
    );
    if (evidence.evidence_kind === "PAIN_INTERVIEWS") {
      validatePainMeasurement(evidence, historicalProtocol, { requirePassingThreshold: evidence.result === "PASS" });
    } else if (evidence.evidence_kind === "TARGET_CHANNEL_FEASIBILITY") {
      validateChannelMeasurement(evidence, historicalProtocol, { requirePassingThreshold: evidence.result === "PASS" });
    } else {
      validateReplayMeasurement(evidence, historicalProtocol, { requirePassingThreshold: evidence.result === "PASS" });
    }
    const criteria = requireArray(evidence.criterion_results, `${label}.criterion_results`);
    invariant(criteria.length > 0, `${label}.criterion_results must not be empty.`);
    const criterionIds = [];
    for (const criterion of criteria) {
      requireString(criterion.criterion_id, `${label} criterion_id`);
      criterionIds.push(criterion.criterion_id);
      invariant(EVIDENCE_RESULTS.has(criterion.result), `${label} criterion result is invalid.`);
      requireString(criterion.comparator, `${label} criterion comparator`);
      invariant(criterion.expected !== undefined, `${label} criterion expected value is required.`);
      invariant(
        requireArray(
          criterion.actual_or_measurement_refs,
          `${label} criterion actual_or_measurement_refs`,
        ).length > 0,
        `${label} criterion must reference its measurement.`,
      );
      requireString(criterion.calculation_version, `${label} criterion calculation_version`);
    }
    exactStringSet(criterionIds, criterionIds, `${label} criterion IDs`);
    if (evidence.result === "PASS") {
      invariant(criteria.every((criterion) => criterion.result === "PASS"), `${label} PASS conflicts with a non-PASS criterion.`);
    } else if (evidence.result === "FAIL") {
      invariant(criteria.some((criterion) => criterion.result === "FAIL"), `${label} FAIL lacks a failed criterion.`);
    } else {
      invariant(criteria.some((criterion) => criterion.result === "INCONCLUSIVE"), `${label} INCONCLUSIVE lacks an inconclusive criterion.`);
    }
    validateCriterionContract(evidence, historicalProtocol);

    const artifacts = requireArray(evidence.artifact_refs, `${label}.artifact_refs`);
    invariant(artifacts.length > 0, `${label} must bind controlled artifacts.`);
    const artifactIds = [];
    for (const artifact of artifacts) {
      requireString(artifact.artifact_id, `${label} artifact ID`);
      artifactIds.push(artifact.artifact_id);
      requireSha256(artifact.sha256, `${label} controlled artifact digest`);
      requireString(artifact.media_type, `${label} artifact media type`);
      requireSha256(
        artifact.controlled_store_locator_digest,
        `${label} controlled-store locator digest`,
      );
    }
    exactStringSet(artifactIds, artifactIds, `${label} artifact IDs`);
    requireObject(evidence.deidentification, `${label}.deidentification`);
    requireString(evidence.deidentification.scheme, `${label}.deidentification.scheme`);
    invariant(
      ["RANDOM_COHORT_LOCAL_SURROGATE", "DOMAIN_SEPARATED_HMAC_SURROGATE"].includes(
        evidence.deidentification?.scheme,
      ),
      `${label}.deidentification.scheme is invalid.`,
    );
    requireString(
      evidence.deidentification?.scheme_version,
      `${label}.deidentification.scheme_version`,
    );
    invariant(
      evidence.deidentification?.mapping_location === "CONTROLLED_ARTIFACT_STORE_ONLY",
      `${label}.deidentification.mapping_location is unsafe.`,
    );
    const attestation = requireObject(evidence.attestation, `${label}.attestation`);
    invariant(["PENDING", "VERIFIED", "INVALID"].includes(attestation.status), `${label}.attestation.status is invalid.`);
    invariant(
      attestation.status === "VERIFIED",
      `${label} is persisted without a verified attestation.`,
    );
    if (attestation.status === "VERIFIED") {
      requireIdentity(attestation.attested_by, `${label}.attestation.attested_by`);
      invariant(
        requireIsoTimestamp(attestation.attested_at, `${label}.attestation.attested_at`) >=
          completedAt,
        `${label} was attested before completion.`,
      );
      invariant(attestation.signed_payload_digest === evidence.manifest_digest, `${label} attestation covers the wrong digest.`);
      requireSha256(attestation.proof_digest, `${label}.attestation.proof_digest`);
      invariant(
        attestation.attested_by !== producer.identity,
        `${label} cannot be self-attested by its producer.`,
      );
    } else {
      invariant(attestation.attested_by === null, `${label} unverified attestation cannot name an attester.`);
      invariant(attestation.attested_at === null, `${label} unverified attestation cannot have a timestamp.`);
      invariant(attestation.signed_payload_digest === null, `${label} unverified attestation cannot claim a signed payload.`);
      invariant(attestation.proof_digest === null, `${label} unverified attestation cannot claim a proof.`);
    }
    invariant(evidence.result !== "PASS" || attestation.status === "VERIFIED", `${label} cannot claim PASS without verified attestation.`);
  }
  return evidenceById;
}

function measurementFor(evidence, measurementType) {
  const matches = evidence.measurements.filter((measurement) => measurement?.measurement_type === measurementType);
  invariant(matches.length === 1, `Evidence ${evidence.evidence_id} must contain exactly one ${measurementType} measurement.`);
  return matches[0];
}

function validateCriterionContract(evidence, protocol) {
  const measurementId = evidence.measurements[0].measurement_id;
  const expectedByKind = {
    PAIN_INTERVIEWS: [
      {
        criterion_id: "pain_interview_cohort_size",
        comparator: "COMPOSITE",
        expected: {
          minimum: protocol.cohorts.pain_interviews.target_minimum,
          maximum: protocol.cohorts.pain_interviews.target_maximum,
        },
      },
      {
        criterion_id: "pain_threshold_qualified_n",
        comparator: "GTE",
        expected: protocol.cohorts.pain_interviews.pass_numerator_minimum,
      },
    ],
    TARGET_CHANNEL_FEASIBILITY: [
      {
        criterion_id: "target_channel_eligible_n",
        comparator: "GTE",
        expected: protocol.cohorts.target_channel_feasibility.eligible_n_minimum,
      },
    ],
    RULES_REPLAY: [
      {
        criterion_id: "rules_replay_participant_and_job_floor",
        comparator: "COMPOSITE",
        expected: {
          qualified_participant_n_minimum: protocol.rules_replay.participants_minimum,
          jobs_per_participant: protocol.rules_replay.jobs_per_participant,
          dataset_frozen: protocol.rules_replay.dataset_freeze_before_replay,
        },
      },
      {
        criterion_id: "rules_replay_rejection_coverage",
        comparator: "EQ",
        expected: protocol.rules_replay.pass_criteria.explicit_rejection_reasons_covered,
      },
      {
        criterion_id: "rules_replay_ambiguity_finite",
        comparator: "EQ",
        expected: protocol.rules_replay.pass_criteria.remaining_ambiguity,
      },
    ],
  };
  const expectedCriteria = expectedByKind[evidence.evidence_kind];
  exactStringSet(
    evidence.subject_refs.map((reference) => reference.criterion_id),
    expectedCriteria.map((criterion) => criterion.criterion_id),
    `evidence ${evidence.evidence_id} subject criterion set`,
  );
  exactStringSet(
    evidence.criterion_results.map((criterion) => criterion.criterion_id),
    expectedCriteria.map((criterion) => criterion.criterion_id),
    `evidence ${evidence.evidence_id} criterion set`,
  );
  for (const expected of expectedCriteria) {
    const actual = evidence.criterion_results.find(
      (criterion) => criterion.criterion_id === expected.criterion_id,
    );
    invariant(actual.comparator === expected.comparator, `${expected.criterion_id} comparator mismatch.`);
    exactValue(actual.expected, expected.expected, `${expected.criterion_id} expected value`);
    exactStringSet(
      actual.actual_or_measurement_refs,
      [measurementId],
      `${expected.criterion_id} measurement refs`,
    );
    invariant(
      actual.calculation_version === evidence.measurements[0].calculation_version,
      `${expected.criterion_id} calculation version does not match its measurement.`,
    );
  }
}

function evidenceAttestationReady(evidence) {
  const attestation = evidence.attestation;
  if (attestation?.status !== "VERIFIED") return false;
  requireIdentity(attestation.attested_by, `evidence ${evidence.evidence_id} attested_by`);
  requireIsoTimestamp(attestation.attested_at, `evidence ${evidence.evidence_id} attested_at`);
  invariant(attestation.signed_payload_digest === evidence.manifest_digest, `Evidence ${evidence.evidence_id} attestation payload mismatch.`);
  requireSha256(attestation.proof_digest, `evidence ${evidence.evidence_id} attestation proof`);
  return true;
}

function validatePainMeasurement(
  evidence,
  protocol,
  { requirePassingThreshold = true } = {},
) {
  const measurement = measurementFor(evidence, "PAIN_THRESHOLD");
  requireString(measurement.measurement_id, "PAIN_THRESHOLD.measurement_id");
  const denominator = requireInteger(measurement.cohort_denominator, "PAIN_THRESHOLD.cohort_denominator");
  const qualified = requireInteger(measurement.qualified_n, "PAIN_THRESHOLD.qualified_n", { minimum: 0 });
  invariant(qualified <= denominator, "Pain qualified_n cannot exceed its denominator.");
  if (requirePassingThreshold) {
    invariant(denominator >= protocol.cohorts.pain_interviews.target_minimum && denominator <= protocol.cohorts.pain_interviews.target_maximum, "Pain cohort denominator is outside the frozen 6..8 range.");
    invariant(qualified >= protocol.cohorts.pain_interviews.pass_numerator_minimum, "Pain threshold has fewer than five qualified participants.");
  }
  invariant(measurement.opportunities_per_week_minimum === 10, "Pain measurement opportunity threshold mismatch.");
  invariant(measurement.repetitive_work_rank_maximum === 3, "Pain measurement rank threshold mismatch.");
  requireSha256(measurement.eligibility_and_exclusion_policy_digest, "Pain eligibility/exclusion policy digest");
  requireString(measurement.calculation_version, "Pain calculation_version");
  const participants = requireArray(measurement.participant_surrogates, "Pain participant surrogates");
  participants.forEach((participant, index) => requireParticipantSurrogate(participant, `Pain participant_surrogates[${index}]`));
  exactStringSet(participants, participants, "Pain participant surrogates");
  invariant(participants.length === denominator, "Pain participant surrogate count must equal its denominator.");
  return measurement;
}

function validateChannelMeasurement(
  evidence,
  protocol,
  { requirePassingThreshold = true } = {},
) {
  const measurement = measurementFor(evidence, "CHANNEL_ELIGIBILITY");
  requireString(measurement.measurement_id, "CHANNEL_ELIGIBILITY.measurement_id");
  const denominator = requireInteger(measurement.cohort_denominator, "CHANNEL_ELIGIBILITY.cohort_denominator");
  const eligible = requireInteger(measurement.eligible_n, "CHANNEL_ELIGIBILITY.eligible_n", { minimum: 0 });
  invariant(eligible <= denominator, "Channel eligible_n cannot exceed its denominator.");
  if (requirePassingThreshold) {
    invariant(eligible >= protocol.cohorts.target_channel_feasibility.eligible_n_minimum, "Target-channel eligibleN is below five.");
  }
  requireSha256(measurement.eligibility_and_exclusion_policy_digest, "Channel eligibility/exclusion policy digest");
  requireString(measurement.calculation_version, "Channel calculation_version");
  const participants = requireArray(measurement.participant_surrogates, "Channel participant surrogates");
  participants.forEach((participant, index) => requireParticipantSurrogate(participant, `Channel participant_surrogates[${index}]`));
  exactStringSet(participants, participants, "Channel participant surrogates");
  invariant(participants.length === denominator, "Channel participant surrogate count must equal its denominator.");
  const eligibilityRefs = requireArray(measurement.eligibility_refs, "Channel eligibility_refs");
  invariant(eligibilityRefs.length === eligible, "Channel eligibility refs must cover exactly every eligible participant.");
  const eligibleParticipants = [];
  for (const reference of eligibilityRefs) {
    requireParticipantSurrogate(reference.participant_surrogate, "Channel eligibility participant surrogate");
    requireSha256(reference.observation_digest, "Channel eligibility observation digest");
    invariant(participants.includes(reference.participant_surrogate), "Channel eligibility reference is outside its cohort denominator.");
    eligibleParticipants.push(reference.participant_surrogate);
  }
  exactStringSet(eligibleParticipants, eligibleParticipants, "Channel eligible participant surrogates");
  return measurement;
}

function validateReplayMeasurement(
  evidence,
  protocol,
  { requirePassingThreshold = true } = {},
) {
  const measurement = measurementFor(evidence, "RULE_REPLAY");
  requireString(measurement.measurement_id, "RULE_REPLAY.measurement_id");
  const qualifiedParticipants = requireInteger(measurement.qualified_participant_n, "RULE_REPLAY.qualified_participant_n");
  if (requirePassingThreshold) {
    invariant(qualifiedParticipants >= protocol.rules_replay.participants_minimum, "Rules replay has fewer than five pain-qualified participants.");
  }
  invariant(measurement.jobs_per_participant === protocol.rules_replay.jobs_per_participant, "Rules replay jobs-per-participant mismatch.");
  invariant(typeof measurement.dataset_frozen === "boolean", "Rules replay dataset_frozen must be boolean.");
  if (requirePassingThreshold) {
    invariant(measurement.dataset_frozen === true, "Rules replay dataset was not frozen.");
  }
  invariant(
    ["ALL", "PARTIAL", "NONE", "UNKNOWN"].includes(
      measurement.explicit_rejection_reasons_covered,
    ),
    "Rules replay rejection coverage value is invalid.",
  );
  invariant(
    ["FINITE_EXCEPTION_CATEGORIES", "UNBOUNDED", "UNKNOWN"].includes(
      measurement.remaining_ambiguity,
    ),
    "Rules replay ambiguity value is invalid.",
  );
  if (requirePassingThreshold) {
    invariant(measurement.explicit_rejection_reasons_covered === "ALL", "Rules replay did not cover every explicit rejection reason.");
    invariant(measurement.remaining_ambiguity === "FINITE_EXCEPTION_CATEGORIES", "Rules replay ambiguity is not a finite exception set.");
  }
  requireString(measurement.calculation_version, "Rules replay calculation_version");
  const refs = requireArray(measurement.participant_dataset_refs, "Rules replay participant_dataset_refs");
  invariant(refs.length === qualifiedParticipants, "Rules replay participant dataset count mismatch.");
  const participantIds = [];
  for (const reference of refs) {
    requireParticipantSurrogate(reference.participant_surrogate, "Rules replay participant surrogate");
    requireSha256(reference.dataset_digest, "Rules replay dataset digest");
    invariant(reference.jobs_count === protocol.rules_replay.jobs_per_participant, "Each rules replay dataset must contain exactly 20 jobs.");
    participantIds.push(reference.participant_surrogate);
  }
  exactStringSet(participantIds, participantIds, "Rules replay participant surrogates");
  return measurement;
}

function validateGateRecords(
  manifest,
  catalog,
  protocol,
  candidate,
  evidenceById,
  archives,
) {
  const registryPath = absolute(PATHS.gateRegistry);
  invariant(fs.existsSync(registryPath), `Gate registry is missing at ${PATHS.gateRegistry}.`);
  const registryBytes = fs.readFileSync(registryPath, "utf8");
  invariant(registryBytes === normalizeText(registryBytes), "Gate registry must use LF line endings.");
  const records = parseJsonLines(registryPath);
  invariant(records.length > 0, "Gate registry must contain a fail-closed Pre-W1 genesis record.");
  invariant(
    registryBytes === `${records.map((record) => canonicalJson(record)).join("\n")}\n`,
    "Gate registry must contain one canonical JSON record per line with a final LF.",
  );
  const heads = validateGateChains(records);
  invariant(
    heads.length === 1 &&
      heads[0].gate_id === GATE_IDS.preW1 &&
      heads[0].scope_id === PRE_W1_SCOPE_ID,
    "Pre-W1 Gate registry head set contains an undeclared scope.",
  );

  for (const record of records) {
    validateSchema(
      root,
      SCHEMA_NAMES.gate,
      record,
      `Gate Evidence Record ${record.record_id ?? "<missing-id>"}`,
    );
    invariant(record.schema_version === "rolefox.gate-evidence-record.v1", `Gate ${record.record_id} schema_version mismatch.`);
    requireString(record.gate_id, `gate ${record.record_id}.gate_id`);
    requireString(record.scope_id, `gate ${record.record_id}.scope_id`);
    invariant(
      record.gate_id === GATE_IDS.preW1 && record.scope_id === PRE_W1_SCOPE_ID,
      `Gate ${record.record_id} is outside the frozen Pre-W1 scope.`,
    );
    requireString(record.criteria_version, `gate ${record.record_id}.criteria_version`);
    const criterionRefs = requireArray(record.criterion_refs, `gate ${record.record_id}.criterion_refs`);
    exactStringSet(criterionRefs, criterionRefs, `gate ${record.record_id}.criterion_refs`);
    invariant(GATE_RESULTS.has(record.result), `Gate ${record.record_id} result is invalid.`);
    requireSha256(
      record.approval_payload_digest,
      `gate ${record.record_id}.approval_payload_digest`,
    );
    invariant(
      record.approval_payload_digest ===
        canonicalDigestExcluding(record, [
          "record_id",
          "record_digest",
          "approval_payload_digest",
          "approval_proof_digest",
        ]),
      `Gate ${record.record_id} approval payload digest mismatch.`,
    );
    invariant(
      ["BLOCKED_NOT_STARTED", "READY_FOR_REVIEW", "DECIDED", "INVALIDATED"].includes(
        record.lifecycle_state,
      ),
      `Gate ${record.record_id} lifecycle_state is invalid.`,
    );
    requireIdentity(record.submitted_by, `gate ${record.record_id}.submitted_by`);
    const submittedAt = requireIsoTimestamp(record.submitted_at, `gate ${record.record_id}.submitted_at`);
    const decidedAt = requireIsoTimestamp(record.decided_at, `gate ${record.record_id}.decided_at`);
    invariant(decidedAt >= submittedAt, `Gate ${record.record_id} decision predates submission.`);
    requireArray(record.evidence_manifest_refs, `gate ${record.record_id}.evidence_manifest_refs`);
    const seenEvidence = new Set();
    for (const reference of record.evidence_manifest_refs) {
      assertReference(reference, ["evidence_id", "manifest_digest", "record_digest"], `gate ${record.record_id} evidence ref`);
      invariant(!seenEvidence.has(reference.evidence_id), `Gate ${record.record_id} repeats evidence ${reference.evidence_id}.`);
      seenEvidence.add(reference.evidence_id);
      const evidence = evidenceById.get(reference.evidence_id);
      invariant(evidence, `Gate ${record.record_id} references missing evidence ${reference.evidence_id}.`);
      invariant(evidence.manifest_digest === reference.manifest_digest, `Gate ${record.record_id} evidence digest mismatch.`);
      invariant(evidence.record_digest === reference.record_digest, `Gate ${record.record_id} final Evidence record digest mismatch.`);
    }
    const reasonCodes = requireArray(record.reason_codes, `gate ${record.record_id}.reason_codes`);
    exactStringSet(reasonCodes, reasonCodes, `gate ${record.record_id}.reason_codes`);
    if (record.result === "BLOCKED") {
      invariant(reasonCodes.length > 0, `Blocked gate ${record.record_id} needs reason codes.`);
      invariant(record.lifecycle_state === "BLOCKED_NOT_STARTED", `Blocked Pre-W1 gate ${record.record_id} must remain not started.`);
      invariant(record.approved_by === null, `Blocked gate ${record.record_id} cannot claim an approver.`);
      invariant(record.approved_at === null, `Blocked gate ${record.record_id} cannot claim approval time.`);
      invariant(record.approver_role_version === null, `Blocked gate ${record.record_id} cannot claim an approver role.`);
      invariant(record.approval_proof_digest === null, `Blocked gate ${record.record_id} cannot claim approval proof.`);
    } else if (["PASS", "ACCEPTED_FALLBACK", "FAIL"].includes(record.result)) {
      invariant(record.lifecycle_state === "DECIDED", `Decided gate ${record.record_id} must be DECIDED.`);
      if (record.result === "FAIL") {
        invariant(reasonCodes.length > 0, `Failed gate ${record.record_id} needs reason codes.`);
      } else {
        invariant(reasonCodes.length === 0, `Successful gate ${record.record_id} cannot retain failure reason codes.`);
      }
      const approvedAt = requireIsoTimestamp(record.approved_at, `gate ${record.record_id}.approved_at`);
      requireIdentity(record.approved_by, `gate ${record.record_id}.approved_by`);
      requireString(record.approver_role_version, `gate ${record.record_id}.approver_role_version`);
      requireSha256(record.approval_proof_digest, `gate ${record.record_id}.approval_proof_digest`);
      invariant(approvedAt >= submittedAt && decidedAt >= approvedAt, `Gate ${record.record_id} approval/decision chronology is invalid.`);
    }
    invariant(record.candidate_artifact_kind === "SPEC_OR_EXPERIMENT", `Pre-W1 gate ${record.record_id} candidate kind mismatch.`);
    requireSha256(record.candidate_artifact_digest, `gate ${record.record_id}.candidate_artifact_digest`);
    requireSha256(
      record.verification_toolchain_digest,
      `gate ${record.record_id}.verification_toolchain_digest`,
    );
    assertReference(record.candidate_scope_manifest_ref, ["candidate_scope_manifest_id", "manifest_digest"], `gate ${record.record_id}.candidate_scope_manifest_ref`);
    assertReference(record.spec_manifest_ref, ["manifest_digest", "normative_set_digest"], `gate ${record.record_id}.spec_manifest_ref`);
    assertReference(record.required_release_scope_catalog_ref, ["catalog_digest"], `gate ${record.record_id}.catalog_ref`);
    assertReference(record.research_protocol_ref, ["protocol_digest"], `gate ${record.record_id}.protocol_ref`);
    const historicalSpec = archives.specs.get(record.spec_manifest_ref.manifest_digest);
    const historicalCatalog = archives.catalogs.get(
      record.required_release_scope_catalog_ref.catalog_digest,
    );
    const historicalProtocol = archives.protocols.get(
      record.research_protocol_ref.protocol_digest,
    );
    invariant(historicalSpec, `Gate ${record.record_id} references a missing Spec Manifest snapshot.`);
    invariant(
      historicalSpec.normative_set_digest === record.spec_manifest_ref.normative_set_digest,
      `Gate ${record.record_id} historical normative-set digest mismatch.`,
    );
    invariant(
      historicalCatalog,
      `Gate ${record.record_id} references a missing catalog snapshot.`,
    );
    invariant(
      historicalProtocol,
      `Gate ${record.record_id} references a missing protocol snapshot.`,
    );
    const historicalDecisionOutput = isSoleMaintainerProtocol(historicalProtocol)
      ? MAINTAINER_GATE_DECISION_OUTPUT
      : LEGACY_GATE_DECISION_OUTPUT;
    exactStringSet(
      historicalProtocol.required_outputs,
      [...COMMON_PROTOCOL_OUTPUTS, historicalDecisionOutput],
      `Gate ${record.record_id} historical protocol outputs`,
    );
    assertNoSensitivePublicData(
      record,
      `Gate ${record.record_id}`,
      historicalProtocol.privacy?.forbidden_public_fields ?? [],
    );
    invariant(
      record.criteria_version === historicalProtocol.protocol_version,
      `Gate ${record.record_id} criteria version does not match its protocol snapshot.`,
    );
    invariant(
      record.verification_toolchain_digest ===
        historicalSpec.verification_toolchain.digest,
      `Gate ${record.record_id} toolchain does not match its Spec Manifest snapshot.`,
    );
    invariant(
      historicalSpec.required_release_scope_catalog_ref.catalog_digest ===
          historicalCatalog.catalog_digest &&
        historicalSpec.research_protocol_ref.protocol_digest ===
          historicalProtocol.protocol_digest,
      `Gate ${record.record_id} authority snapshots do not match its Spec Manifest.`,
    );
    const historicalCandidatePath = absolute(
      `${PATHS.candidateDirectory}/${record.candidate_scope_manifest_ref.candidate_scope_manifest_id}.json`,
    );
    invariant(fs.existsSync(historicalCandidatePath), `Gate ${record.record_id} references a missing Candidate Scope Manifest.`);
    const historicalCandidate = readJson(historicalCandidatePath);
    verifyAddressedDocument(historicalCandidate, {
      prefix: "candidate",
      idField: "candidate_scope_manifest_id",
      digestField: "manifest_digest",
    });
    invariant(
      historicalCandidate.manifest_digest ===
          record.candidate_scope_manifest_ref.manifest_digest &&
        historicalCandidate.candidate_artifact_digest ===
          record.candidate_artifact_digest &&
        historicalCandidate.verification_toolchain_ref.digest ===
          record.verification_toolchain_digest &&
        historicalCandidate.spec_manifest_ref.manifest_digest ===
          historicalSpec.manifest_digest &&
        historicalCandidate.required_release_scope_catalog_ref.catalog_digest ===
          historicalCatalog.catalog_digest &&
        historicalCandidate.research_protocol_ref.protocol_digest ===
          historicalProtocol.protocol_digest,
      `Gate ${record.record_id} historical candidate binding mismatch.`,
    );
    if (["PASS", "ACCEPTED_FALLBACK", "FAIL"].includes(record.result)) {
      validateGateDecisionAuthority(
        record,
        historicalProtocol,
        `Gate ${record.record_id}`,
      );
      if (isSoleMaintainerProtocol(historicalProtocol)) {
        invariant(
          historicalCatalog.status === "ACCEPTED" &&
            historicalProtocol.status === "APPROVED" &&
            historicalCandidate.approval?.status === "APPROVED",
          `Gate ${record.record_id} sole-maintainer authorities are not approved.`,
        );
        requireSoleMaintainerDecision(
          historicalCatalog.review?.reviewed_by,
          historicalCatalog.review?.approver_role_version,
          `Gate ${record.record_id} catalog decision`,
        );
        requireSoleMaintainerDecision(
          historicalProtocol.approval?.approved_by,
          historicalProtocol.approval?.approver_role_version,
          `Gate ${record.record_id} protocol decision`,
        );
        requireSoleMaintainerDecision(
          historicalCandidate.approval?.approved_by,
          historicalCandidate.approval?.approver_role_version,
          `Gate ${record.record_id} candidate decision`,
        );
      }
      invariant(
        record.evidence_manifest_refs.length > 0,
        `Decided gate ${record.record_id} must reference completed Evidence.`,
      );
      const candidateApprovedAt = requireIsoTimestamp(
        historicalCandidate.approval?.approved_at,
        `Gate ${record.record_id} historical candidate approval`,
      );
      let containsFailedEvidence = false;
      for (const reference of record.evidence_manifest_refs) {
        const evidence = evidenceById.get(reference.evidence_id);
        invariant(
          evidenceAttestationReady(evidence),
          `Gate ${record.record_id} evidence ${reference.evidence_id} lacks a verified trusted attestation.`,
        );
        invariant(
          requireIsoTimestamp(
            evidence.started_at,
            `evidence ${reference.evidence_id}.started_at`,
          ) >= candidateApprovedAt,
          `Gate ${record.record_id} evidence ${reference.evidence_id} predates Candidate Scope approval.`,
        );
        invariant(
          submittedAt >=
            requireIsoTimestamp(
              evidence.completed_at,
              `evidence ${reference.evidence_id}.completed_at`,
            ),
          `Gate ${record.record_id} was submitted before evidence ${reference.evidence_id} completed.`,
        );
        if (record.result === "FAIL") {
          invariant(
            ["PASS", "FAIL"].includes(evidence.result),
            `FAIL Gate ${record.record_id} references inconclusive evidence ${reference.evidence_id}.`,
          );
          containsFailedEvidence ||= evidence.result === "FAIL";
        }
      }
      if (record.result === "FAIL") {
        invariant(
          containsFailedEvidence,
          `FAIL Gate ${record.record_id} must reference at least one failed Evidence manifest.`,
        );
      }
    }
    for (const reference of record.evidence_manifest_refs) {
      const evidence = evidenceById.get(reference.evidence_id);
      invariant(
        evidence.candidate_artifact_digest === record.candidate_artifact_digest &&
          evidence.candidate_scope_manifest_ref.candidate_scope_manifest_id ===
            record.candidate_scope_manifest_ref.candidate_scope_manifest_id &&
          evidence.candidate_scope_manifest_ref.manifest_digest ===
            record.candidate_scope_manifest_ref.manifest_digest &&
          evidence.spec_manifest_ref.manifest_digest ===
            record.spec_manifest_ref.manifest_digest &&
          evidence.spec_manifest_ref.normative_set_digest ===
            record.spec_manifest_ref.normative_set_digest &&
          evidence.required_release_scope_catalog_ref.catalog_digest ===
            record.required_release_scope_catalog_ref.catalog_digest &&
          evidence.research_protocol_ref.protocol_digest ===
            record.research_protocol_ref.protocol_digest,
        `Gate ${record.record_id} evidence ${reference.evidence_id} belongs to a different frozen candidate.`,
      );
    }
    exactValue(record.runtime_binding_manifest_refs, [], `gate ${record.record_id}.runtime_binding_manifest_refs`);
    exactValue(record.predecessor_gate_refs, [], `gate ${record.record_id}.predecessor_gate_refs`);
    invariant(
      submittedAt >= requireIsoTimestamp(record.not_before, `gate ${record.record_id}.not_before`),
      `Gate ${record.record_id} was submitted before not_before.`,
    );
    if (record.gate_id === GATE_IDS.preW1) {
      exactStringSet(
        record.criterion_refs,
        criterionRefsForProtocol(historicalProtocol),
        `gate ${record.record_id}.criterion_refs`,
      );
      invariant(record.result !== "ACCEPTED_FALLBACK", "Pre-W1 never allows ACCEPTED_FALLBACK.");
    }
  }

  const head = heads.find((record) => record.gate_id === GATE_IDS.preW1 && record.scope_id === PRE_W1_SCOPE_ID);
  invariant(head, "Gate registry has no current Pre-W1 problem/rules head.");
  invariant(head.candidate_artifact_digest === candidate.candidate_artifact_digest, "Pre-W1 head candidate artifact digest is stale.");
  invariant(
    head.verification_toolchain_digest === manifest.verification_toolchain.digest,
    "Pre-W1 head verification toolchain digest is stale.",
  );
  invariant(head.candidate_scope_manifest_ref.candidate_scope_manifest_id === candidate.candidate_scope_manifest_id, "Pre-W1 head candidate ID is stale.");
  invariant(head.candidate_scope_manifest_ref.manifest_digest === candidate.manifest_digest, "Pre-W1 head candidate digest is stale.");
  invariant(head.spec_manifest_ref.manifest_digest === manifest.manifest_digest, "Pre-W1 head Spec Manifest digest is stale.");
  invariant(head.spec_manifest_ref.normative_set_digest === manifest.normative_set_digest, "Pre-W1 head normative digest is stale.");
  invariant(head.required_release_scope_catalog_ref.catalog_digest === catalog.catalog_digest, "Pre-W1 head catalog digest is stale.");
  invariant(head.research_protocol_ref.protocol_digest === protocol.protocol_digest, "Pre-W1 head protocol digest is stale.");
  invariant(head.criteria_version === protocol.protocol_version, "Pre-W1 head criteria_version is stale.");
  invariant(
    requireIsoTimestamp(head.not_before, "Pre-W1 head not_before") >=
      requireIsoTimestamp(candidate.created_at, "candidate.created_at"),
    "Pre-W1 head not_before predates the current frozen candidate.",
  );

  if (head.result !== "PASS") {
    blocker("PRE_W1_GATE_HEAD_NOT_PASS");
    if (
      (head.result === "BLOCKED" && head.lifecycle_state !== "BLOCKED_NOT_STARTED") ||
      (head.result === "FAIL" && head.lifecycle_state !== "DECIDED")
    ) {
      blocker("PRE_W1_LIFECYCLE_NOT_FAIL_CLOSED");
    }
  }
  return { records, heads, head, registryPath };
}

function validatePassPrerequisites(head, evidenceById, protocol, candidate, candidateCreatedAt) {
  if (head.result !== "PASS") {
    if (evidenceById.size === 0) blocker("RESEARCH_EVIDENCE_NOT_COLLECTED");
    return;
  }

  invariant(head.criteria_version === protocol.protocol_version, "Pre-W1 PASS criteria_version does not match the frozen protocol.");
  exactValue(head.runtime_binding_manifest_refs, [], "Pre-W1 PASS runtime binding refs");
  requireIdentity(head.approved_by, "Pre-W1 PASS approved_by");
  requireIsoTimestamp(head.approved_at, "Pre-W1 PASS approved_at");
  requireString(head.approver_role_version, "Pre-W1 PASS approver_role_version");
  requireSha256(head.approval_proof_digest, "Pre-W1 PASS approval_proof_digest");
  validateGateDecisionAuthority(head, protocol, "Pre-W1 PASS");

  const candidateApprovedAt = requireIsoTimestamp(candidate.approval.approved_at, "candidate.approval.approved_at");
  invariant(candidateApprovedAt >= candidateCreatedAt, "Candidate approval predates its immutable manifest.");
  const referenced = head.evidence_manifest_refs.map((reference) => evidenceById.get(reference.evidence_id));
  invariant(referenced.length >= 3, "Pre-W1 PASS must reference all three research evidence kinds.");

  const selectedByKind = new Map();
  for (const evidence of referenced) {
    invariant(evidence.result === "PASS", `Pre-W1 PASS references non-PASS evidence ${evidence.evidence_id}.`);
    invariant(evidenceAttestationReady(evidence), `Evidence ${evidence.evidence_id} lacks a verified trusted attestation.`);
    const startedAt = requireIsoTimestamp(evidence.started_at, `evidence ${evidence.evidence_id}.started_at`);
    invariant(startedAt >= candidateApprovedAt, `Evidence ${evidence.evidence_id} was collected before Candidate Scope approval.`);
    const entries = selectedByKind.get(evidence.evidence_kind) ?? [];
    entries.push(evidence);
    selectedByKind.set(evidence.evidence_kind, entries);
  }
  for (const kind of EVIDENCE_KINDS.keys()) {
    invariant(selectedByKind.has(kind), `Pre-W1 PASS is missing ${kind} evidence.`);
  }

  const painEvidence = selectedByKind.get("PAIN_INTERVIEWS").at(-1);
  const channelEvidence = selectedByKind.get("TARGET_CHANNEL_FEASIBILITY").at(-1);
  const replayEvidence = selectedByKind.get("RULES_REPLAY").at(-1);
  const pain = validatePainMeasurement(painEvidence, protocol);
  validateChannelMeasurement(channelEvidence, protocol);
  const replay = validateReplayMeasurement(replayEvidence, protocol);

  const painQualified = requireArray(
    pain.qualified_participant_surrogates,
    "Pain-qualified participant surrogates",
  );
  painQualified.forEach((participant, index) => requireParticipantSurrogate(participant, `Pain qualified participant[${index}]`));
  exactStringSet(painQualified, painQualified, "Pain-qualified participant surrogates");
  invariant(painQualified.length === pain.qualified_n, "Pain-qualified surrogate count mismatch.");
  for (const participant of painQualified) {
    invariant(pain.participant_surrogates.includes(participant), `Pain-qualified participant ${participant} is outside the pain cohort.`);
  }
  for (const reference of replay.participant_dataset_refs) {
    invariant(painQualified.includes(reference.participant_surrogate), `Rules replay participant ${reference.participant_surrogate} lacks pain-threshold evidence.`);
  }

  const latestEvidenceCompletedAt = Math.max(...referenced.map((evidence) => requireIsoTimestamp(evidence.completed_at, `evidence ${evidence.evidence_id}.completed_at`)));
  const submittedAt = requireIsoTimestamp(head.submitted_at, "Pre-W1 PASS submitted_at");
  const approvedAt = requireIsoTimestamp(head.approved_at, "Pre-W1 PASS approved_at");
  invariant(submittedAt >= latestEvidenceCompletedAt, "Pre-W1 PASS was submitted before its evidence completed.");
  invariant(approvedAt >= submittedAt, "Pre-W1 PASS approval predates submission.");
}

function checkpointState(checkpoint) {
  return {
    spec_manifest_digest: checkpoint.spec_manifest_digest,
    normative_set_digest: checkpoint.normative_set_digest,
    catalog_digest: checkpoint.catalog_digest,
    research_protocol_digest: checkpoint.research_protocol_digest,
    candidate_scope_manifest_digest: checkpoint.candidate_scope_manifest_digest,
    candidate_artifact_digest: checkpoint.candidate_artifact_digest,
    verification_toolchain_digest: checkpoint.verification_toolchain_digest,
    gate_registry_digest: checkpoint.gate_registry_digest,
    gate_head_set_digest: checkpoint.gate_head_set_digest,
    evidence_manifest_set_digest: checkpoint.evidence_manifest_set_digest,
    registry_digests: checkpoint.registry_digests,
    record_counts: checkpoint.record_counts,
  };
}

function validateCheckpoints(
  manifest,
  catalog,
  candidate,
  evidenceById,
  gateData,
  archives,
) {
  const files = jsonFiles(absolute(PATHS.checkpointDirectory));
  invariant(files.length > 0, "Registry Integrity Checkpoint is missing.");
  const checkpoints = files.map((file) => {
    const checkpoint = readJson(file);
    validateSchema(
      root,
      SCHEMA_NAMES.checkpoint,
      checkpoint,
      `Registry Checkpoint ${path.basename(file)}`,
    );
    invariant(checkpoint.schema_version === "rolefox.registry-checkpoint.v1", `Unexpected checkpoint schema in ${file}.`);
    verifyCheckpointDocument(checkpoint);
    invariant(path.basename(file) === `${checkpoint.checkpoint_id}.json`, `Checkpoint filename mismatch: ${file}.`);
    requireInteger(checkpoint.sequence, `checkpoint ${checkpoint.checkpoint_id}.sequence`, { minimum: 1 });
    requireIsoTimestamp(checkpoint.created_at, `checkpoint ${checkpoint.checkpoint_id}.created_at`);
    requireSha256(checkpoint.registry_root_digest, `checkpoint ${checkpoint.checkpoint_id}.registry_root_digest`);
    const historicalSpec = archives.specs.get(checkpoint.spec_manifest_digest);
    const historicalProtocol = archives.protocols.get(
      checkpoint.research_protocol_digest,
    );
    invariant(historicalSpec, `Checkpoint ${checkpoint.checkpoint_id} references a missing Spec Manifest snapshot.`);
    invariant(
      archives.catalogs.has(checkpoint.catalog_digest),
      `Checkpoint ${checkpoint.checkpoint_id} references a missing catalog snapshot.`,
    );
    invariant(
      historicalProtocol,
      `Checkpoint ${checkpoint.checkpoint_id} references a missing protocol snapshot.`,
    );
    assertNoSensitivePublicData(
      {
        signature: checkpoint.signature,
        external_anchor: checkpoint.external_anchor,
      },
      `Checkpoint ${checkpoint.checkpoint_id} trust envelope`,
      historicalProtocol.privacy?.forbidden_public_fields ?? [],
    );
    invariant(
      checkpoint.verification_toolchain_digest ===
        historicalSpec.verification_toolchain.digest,
      `Checkpoint ${checkpoint.checkpoint_id} toolchain does not match its Spec Manifest snapshot.`,
    );
    const historicalCandidatePath = absolute(
      `${PATHS.candidateDirectory}/candidate_${checkpoint.candidate_scope_manifest_digest}.json`,
    );
    invariant(
      fs.existsSync(historicalCandidatePath),
      `Checkpoint ${checkpoint.checkpoint_id} references a missing Candidate Scope Manifest.`,
    );
    const historicalCandidate = readJson(historicalCandidatePath);
    validateSchema(
      root,
      SCHEMA_NAMES.candidate,
      historicalCandidate,
      `Checkpoint ${checkpoint.checkpoint_id} Candidate Scope Manifest`,
    );
    verifyAddressedDocument(historicalCandidate, {
      prefix: "candidate",
      idField: "candidate_scope_manifest_id",
      digestField: "manifest_digest",
    });
    invariant(
      historicalCandidate.candidate_artifact_digest ===
          checkpoint.candidate_artifact_digest &&
        historicalCandidate.spec_manifest_ref.manifest_digest ===
          historicalSpec.manifest_digest &&
        historicalCandidate.spec_manifest_ref.normative_set_digest ===
          checkpoint.normative_set_digest &&
        historicalCandidate.required_release_scope_catalog_ref.catalog_digest ===
          checkpoint.catalog_digest &&
        historicalCandidate.research_protocol_ref.protocol_digest ===
          checkpoint.research_protocol_digest &&
        historicalCandidate.verification_toolchain_ref.digest ===
          checkpoint.verification_toolchain_digest,
      `Checkpoint ${checkpoint.checkpoint_id} historical Candidate binding mismatch.`,
    );
    requireObject(checkpoint.record_counts, `checkpoint ${checkpoint.checkpoint_id}.record_counts`);
    requireInteger(checkpoint.record_counts.gate_records, `checkpoint ${checkpoint.checkpoint_id} gate count`);
    requireInteger(checkpoint.record_counts.evidence_manifests, `checkpoint ${checkpoint.checkpoint_id} evidence count`);
    invariant(
      checkpoint.registry_root_digest === canonicalDigest({
        sequence: checkpoint.sequence,
        created_at: checkpoint.created_at,
        previous: checkpoint.previous,
        ...checkpointState(checkpoint),
      }),
      `Checkpoint ${checkpoint.checkpoint_id} registry root mismatch.`,
    );
    invariant(requireArray(checkpoint.gate_heads, `checkpoint ${checkpoint.checkpoint_id}.gate_heads`).length <= checkpoint.record_counts.gate_records, `Checkpoint ${checkpoint.checkpoint_id} has more heads than records.`);
    invariant(requireArray(checkpoint.evidence_manifest_refs, `checkpoint ${checkpoint.checkpoint_id}.evidence_manifest_refs`).length === checkpoint.record_counts.evidence_manifests, `Checkpoint ${checkpoint.checkpoint_id} evidence ref count mismatch.`);
    return checkpoint;
  }).sort((left, right) => left.sequence - right.sequence);

  const seenIds = new Set();
  for (const [index, checkpoint] of checkpoints.entries()) {
    invariant(!seenIds.has(checkpoint.checkpoint_id), `Duplicate checkpoint ${checkpoint.checkpoint_id}.`);
    seenIds.add(checkpoint.checkpoint_id);
    invariant(checkpoint.sequence === index + 1, "Checkpoint sequences must be gap-free and begin at one.");
    if (index === 0) {
      invariant(checkpoint.previous === null, "Checkpoint genesis must have previous=null.");
    } else {
      const previous = checkpoints[index - 1];
      assertReference(checkpoint.previous, ["checkpoint_id", "checkpoint_digest"], `checkpoint ${checkpoint.checkpoint_id}.previous`);
      invariant(checkpoint.previous.checkpoint_id === previous.checkpoint_id, `Checkpoint ${checkpoint.checkpoint_id} skips or forks its predecessor.`);
      invariant(checkpoint.previous.checkpoint_digest === previous.checkpoint_digest, `Checkpoint ${checkpoint.checkpoint_id} predecessor digest mismatch.`);
      invariant(checkpoint.previous.registry_root_digest === previous.registry_root_digest, `Checkpoint ${checkpoint.checkpoint_id} predecessor root mismatch.`);
      exactValue(checkpoint.previous.record_counts, previous.record_counts, `checkpoint ${checkpoint.checkpoint_id} predecessor record counts`);
      invariant(
        requireIsoTimestamp(checkpoint.created_at, `checkpoint ${checkpoint.checkpoint_id}.created_at`) >=
          requireIsoTimestamp(previous.created_at, `checkpoint ${previous.checkpoint_id}.created_at`),
        `Checkpoint ${checkpoint.checkpoint_id} predates its predecessor.`,
      );
      invariant(checkpoint.record_counts.gate_records >= previous.record_counts.gate_records, `Checkpoint ${checkpoint.checkpoint_id} rolls back the gate count.`);
      invariant(checkpoint.record_counts.evidence_manifests >= previous.record_counts.evidence_manifests, `Checkpoint ${checkpoint.checkpoint_id} rolls back the evidence count.`);
    }
  }

  const evidenceRefs = [...evidenceById.values()]
    .map((evidence) => ({
      evidence_id: evidence.evidence_id,
      manifest_digest: evidence.manifest_digest,
      record_digest: evidence.record_digest,
    }))
    .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
  const gateHeadRefs = gateData.heads.map((record) => ({
    gate_id: record.gate_id,
    scope_id: record.scope_id,
    record_id: record.record_id,
    record_digest: record.record_digest,
    result: record.result,
  }));
  const evidenceRefById = new Map(
    evidenceRefs.map((reference) => [reference.evidence_id, reference]),
  );
  let previousEvidenceIds = new Set();
  for (const checkpoint of checkpoints) {
    invariant(
      checkpoint.record_counts.gate_records <= gateData.records.length,
      `Checkpoint ${checkpoint.checkpoint_id} claims a missing Gate prefix.`,
    );
    const gatePrefix = gateData.records.slice(0, checkpoint.record_counts.gate_records);
    invariant(gatePrefix.length > 0, `Checkpoint ${checkpoint.checkpoint_id} omits the Pre-W1 genesis Gate.`);
    const gatePrefixBytes = `${gatePrefix.map((record) => canonicalJson(record)).join("\n")}\n`;
    invariant(
      checkpoint.gate_registry_digest === sha256(Buffer.from(gatePrefixBytes, "utf8")),
      `Checkpoint ${checkpoint.checkpoint_id} Gate-prefix digest mismatch.`,
    );
    const prefixHeadRefs = validateGateChains(gatePrefix).map((record) => ({
      gate_id: record.gate_id,
      scope_id: record.scope_id,
      record_id: record.record_id,
      record_digest: record.record_digest,
      result: record.result,
    }));
    exactValue(checkpoint.gate_heads, prefixHeadRefs, `checkpoint ${checkpoint.checkpoint_id} Gate heads`);
    invariant(
      checkpoint.gate_head_set_digest === canonicalDigest(prefixHeadRefs),
      `Checkpoint ${checkpoint.checkpoint_id} Gate head-set digest mismatch.`,
    );

    const historicalEvidenceRefs = checkpoint.evidence_manifest_refs;
    const historicalEvidenceIds = new Set();
    for (const reference of historicalEvidenceRefs) {
      assertReference(reference, ["evidence_id", "manifest_digest", "record_digest"], `checkpoint ${checkpoint.checkpoint_id} evidence ref`);
      invariant(!historicalEvidenceIds.has(reference.evidence_id), `Checkpoint ${checkpoint.checkpoint_id} repeats evidence ${reference.evidence_id}.`);
      historicalEvidenceIds.add(reference.evidence_id);
      const currentReference = evidenceRefById.get(reference.evidence_id);
      invariant(currentReference, `Checkpoint ${checkpoint.checkpoint_id} references deleted evidence ${reference.evidence_id}.`);
      exactValue(reference, currentReference, `checkpoint ${checkpoint.checkpoint_id} evidence ${reference.evidence_id}`);
    }
    invariant(
      [...previousEvidenceIds].every((evidenceId) => historicalEvidenceIds.has(evidenceId)),
      `Checkpoint ${checkpoint.checkpoint_id} rolls back the evidence set.`,
    );
    const sortedHistoricalEvidenceRefs = [...historicalEvidenceRefs].sort((left, right) =>
      left.evidence_id.localeCompare(right.evidence_id),
    );
    exactValue(historicalEvidenceRefs, sortedHistoricalEvidenceRefs, `checkpoint ${checkpoint.checkpoint_id} evidence ordering`);
    invariant(
      checkpoint.evidence_manifest_set_digest === canonicalDigest(historicalEvidenceRefs),
      `Checkpoint ${checkpoint.checkpoint_id} evidence set digest mismatch.`,
    );
    previousEvidenceIds = historicalEvidenceIds;
  }
  const expectedState = {
    spec_manifest_digest: manifest.manifest_digest,
    normative_set_digest: manifest.normative_set_digest,
    catalog_digest: catalog.catalog_digest,
    research_protocol_digest: candidate.research_protocol_ref.protocol_digest,
    candidate_scope_manifest_digest: candidate.manifest_digest,
    candidate_artifact_digest: candidate.candidate_artifact_digest,
    verification_toolchain_digest: manifest.verification_toolchain.digest,
    gate_registry_digest: digestJsonl(gateData.registryPath),
    gate_head_set_digest: canonicalDigest(gateHeadRefs),
    evidence_manifest_set_digest: canonicalDigest(evidenceRefs),
    registry_digests: {
      case_evidence_requirements: null,
      case_verification: null,
      journey_invariant_verification: null,
      lifecycle_state: "NOT_CREATED_PRE_W1",
    },
    record_counts: {
      gate_records: gateData.records.length,
      evidence_manifests: evidenceRefs.length,
      case_evidence_requirements: 0,
      case_verification: 0,
      journey_invariant_verification: 0,
    },
  };
  const latest = checkpoints.at(-1);
  exactValue(checkpointState(latest), expectedState, "latest checkpoint state");
  exactValue(latest.gate_heads, gateHeadRefs, "latest checkpoint gate head set");
  exactValue(latest.evidence_manifest_refs, evidenceRefs, "latest checkpoint evidence set");

  for (const checkpoint of checkpoints) {
    requireObject(checkpoint.signature, `checkpoint ${checkpoint.checkpoint_id}.signature`);
    requireObject(checkpoint.external_anchor, `checkpoint ${checkpoint.checkpoint_id}.external_anchor`);
    invariant(
      ["PENDING_TRUSTED_SIGNER", "VERIFIED_TRUSTED_SIGNER"].includes(
        checkpoint.signature.status,
      ),
      `Checkpoint ${checkpoint.checkpoint_id} signature status is invalid.`,
    );
    invariant(
      [
        "NOT_CONFIGURED",
        "PENDING_EXTERNAL_ANCHOR",
        "VERIFIED_EXTERNAL_ANCHOR",
      ].includes(checkpoint.external_anchor.status),
      `Checkpoint ${checkpoint.checkpoint_id} external-anchor status is invalid.`,
    );
    const signed = checkpoint.signature.status === "VERIFIED_TRUSTED_SIGNER";
    const anchored = checkpoint.external_anchor.status === "VERIFIED_EXTERNAL_ANCHOR";
    invariant(
      checkpoint.signature.signed_payload_digest === checkpoint.registry_root_digest,
      `Checkpoint ${checkpoint.checkpoint_id} signature payload mismatch.`,
    );
    invariant(
      checkpoint.external_anchor.anchored_payload_digest === checkpoint.registry_root_digest,
      `Checkpoint ${checkpoint.checkpoint_id} anchor payload mismatch.`,
    );
    if (signed) {
      requireIdentity(checkpoint.signature.signer, `checkpoint ${checkpoint.checkpoint_id}.signature.signer`);
      requireString(checkpoint.signature.signature, `checkpoint ${checkpoint.checkpoint_id}.signature.signature`);
    } else {
      if (checkpoint.signature.signer !== null) {
        requireIdentity(checkpoint.signature.signer, `checkpoint ${checkpoint.checkpoint_id}.signature.signer`);
      }
      if (checkpoint.signature.signature !== null) {
        requireString(checkpoint.signature.signature, `checkpoint ${checkpoint.checkpoint_id}.signature.signature`);
      }
    }
    if (anchored) {
      requireString(checkpoint.external_anchor.provider, `checkpoint ${checkpoint.checkpoint_id}.anchor.provider`);
      requireString(checkpoint.external_anchor.reference, `checkpoint ${checkpoint.checkpoint_id}.anchor.reference`);
      invariant(
        requireIsoTimestamp(checkpoint.external_anchor.anchored_at, `checkpoint ${checkpoint.checkpoint_id}.anchor.anchored_at`) >=
          requireIsoTimestamp(checkpoint.created_at, `checkpoint ${checkpoint.checkpoint_id}.created_at`),
        `Checkpoint ${checkpoint.checkpoint_id} was anchored before creation.`,
      );
    } else {
      if (checkpoint.external_anchor.provider !== null) {
        requireString(checkpoint.external_anchor.provider, `checkpoint ${checkpoint.checkpoint_id}.anchor.provider`);
      }
      if (checkpoint.external_anchor.reference !== null) {
        requireString(checkpoint.external_anchor.reference, `checkpoint ${checkpoint.checkpoint_id}.anchor.reference`);
      }
      if (checkpoint.external_anchor.anchored_at !== null) {
        requireIsoTimestamp(checkpoint.external_anchor.anchored_at, `checkpoint ${checkpoint.checkpoint_id}.anchor.anchored_at`);
      }
    }
  }
  if (
    latest.signature.status !== "VERIFIED_TRUSTED_SIGNER" ||
    latest.external_anchor.status !== "VERIFIED_EXTERNAL_ANCHOR"
  ) {
    blocker("CHECKPOINT_SIGNATURE_AND_EXTERNAL_ANCHOR_PENDING");
  }
  return latest;
}

function main() {
  assertSafeRepositoryStorage(root, Object.values(PATHS));
  invariant(unknownArguments.length === 0, `Unknown argument(s): ${unknownArguments.join(", ")}`);
  invariant(
    ["NOT_IMPLEMENTED", "IMPLEMENTED"].includes(TRUST_VERIFICATION_STATUS),
    `Unknown TRUST_VERIFICATION_STATUS: ${TRUST_VERIFICATION_STATUS}`,
  );
  if (TRUST_VERIFICATION_STATUS !== "IMPLEMENTED") {
    blocker("TRUST_VERIFICATION_NOT_IMPLEMENTED");
  }
  const catalog = validateCatalog();
  const protocol = validateProtocol();
  const manifest = validateSpecManifest(catalog, protocol);
  const archives = validateSnapshotArchives(catalog, protocol, manifest);
  const { candidate, candidateCreatedAt, candidates } = validateCandidate(
    manifest,
    catalog,
    protocol,
    archives,
  );
  const evidenceById = validateEvidence(archives, candidates);
  const gateData = validateGateRecords(
    manifest,
    catalog,
    protocol,
    candidate,
    evidenceById,
    archives,
  );
  validatePassPrerequisites(gateData.head, evidenceById, protocol, candidate, candidateCreatedAt);
  const checkpoint = validateCheckpoints(
    manifest,
    catalog,
    candidate,
    evidenceById,
    gateData,
    archives,
  );

  if (readinessBlockers.size === 0) {
    console.log("RoleFox Pre-W1 verification: PASS.");
    console.log(`Gate head: ${gateData.head.record_id}`);
    console.log(`Checkpoint: ${checkpoint.checkpoint_id} (sequence ${checkpoint.sequence})`);
    return;
  }

  console.log("RoleFox Pre-W1 verification structure: PASS.");
  console.log("Readiness: BLOCKED_NOT_STARTED.");
  console.log(`Gate head: ${gateData.head.record_id} (${gateData.head.result})`);
  console.log(`Checkpoint: ${checkpoint.checkpoint_id} (sequence ${checkpoint.sequence})`);
  console.log("Blockers:");
  for (const code of [...readinessBlockers].sort()) console.log(`- ${code}`);
  if (requirePass) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`RoleFox Pre-W1 verification failed closed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
