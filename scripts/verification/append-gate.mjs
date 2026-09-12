import fs from "node:fs";
import path from "node:path";

import {
  createCurrentCheckpoint,
  validateHistoricalBindings,
} from "./checkpoint-lib.mjs";
import {
  GATE_IDS,
  PATHS,
  SOLE_MAINTAINER_AUTHORITY,
  TRUST_VERIFICATION_STATUS,
  VERIFICATION_TOOLCHAIN_FILES,
} from "./config.mjs";
import {
  addressDocument,
  appendJsonLine,
  assertRepositoryRelativePath,
  assertSafeRepositoryStorage,
  canonicalDigest,
  digestFileSet,
  invariant,
  isSha256,
  jsonFiles,
  parseJsonLines,
  readJson,
  repositoryRoot,
  resolveRepositoryPath,
  validateGateChains,
  verifyAddressedDocument,
  verifyCheckpointDocument,
  verifyEvidenceDocument,
  withVerificationLock,
} from "./lib.mjs";
import { assertNoSensitivePublicData } from "./privacy.mjs";
import { SCHEMA_NAMES, validateSchema } from "./schema.mjs";
import {
  canonicalPayloadBytes,
  importTrustedProof,
  validateEvidenceProducer,
  verifyTrustedProof,
} from "./trust.mjs";

const PRE_W1_SCOPE_ID = "pre_w1_problem_and_rules_research";
const EVIDENCE_KINDS = new Map([
  ["PAIN_INTERVIEWS", "pain_interviews"],
  ["TARGET_CHANNEL_FEASIBILITY", "target_channel_feasibility"],
  ["RULES_REPLAY", "rules_replay"],
]);
const GATE_RESULTS = new Set(["PASS", "FAIL", "BLOCKED"]);
const PRE_W1_CRITERION_REFS = [
  "pain_interview_threshold",
  "target_channel_feasibility",
  "rules_replay_coverage",
  "maintainer_gate_decision",
  "registry_integrity",
];
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const CRITERION_PATTERN = /^[a-z][a-z0-9_]{2,127}$/;
const ATTESTATION_KEYS = [
  "attested_at",
  "attested_by",
  "proof_digest",
  "signed_payload_digest",
  "status",
];
const DECISION_KEYS = new Set([
  "approval_payload_digest",
  "approval_proof_digest",
  "approved_at",
  "approved_by",
  "approver_role_version",
  "candidate_artifact_digest",
  "candidate_artifact_kind",
  "candidate_scope_manifest_ref",
  "criteria_version",
  "criterion_refs",
  "decided_at",
  "evidence_manifest_refs",
  "gate_id",
  "lifecycle_state",
  "previous",
  "predecessor_gate_refs",
  "reason_codes",
  "record_digest",
  "record_id",
  "required_release_scope_catalog_ref",
  "research_protocol_ref",
  "result",
  "runtime_binding_manifest_refs",
  "schema_version",
  "scope_id",
  "spec_manifest_ref",
  "submitted_at",
  "submitted_by",
  "not_before",
  "verification_toolchain_digest",
]);

const root = repositoryRoot(import.meta.url);
const absolute = (relativePath) => path.join(root, ...relativePath.split("/"));

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
  invariant(IDENTITY_PATTERN.test(value), `${label} must be a stable, whitespace-free identity.`);
  return value;
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

function requireSoleMaintainerProtocol(protocol) {
  invariant(
    canonicalDigest(protocol.decision_authority) ===
      canonicalDigest(SOLE_MAINTAINER_AUTHORITY),
    "Current research protocol decision authority does not match the configured sole maintainer.",
  );
}

function requireDigest(value, label) {
  invariant(isSha256(value), `${label} must be a lowercase SHA-256 digest.`);
  return value;
}

function requireIsoTimestamp(value, label) {
  requireString(value, label);
  const parsed = Date.parse(value);
  invariant(Number.isFinite(parsed), `${label} must be an ISO-8601 timestamp.`);
  invariant(new Date(parsed).toISOString() === value, `${label} must be canonical UTC ISO-8601.`);
  return parsed;
}

function requireInteger(value, label, minimum = 0) {
  invariant(Number.isInteger(value) && value >= minimum, `${label} must be an integer >= ${minimum}.`);
  return value;
}

function uniqueStrings(value, label, pattern) {
  const entries = requireArray(value, label);
  const seen = new Set();
  for (const entry of entries) {
    requireString(entry, `${label} entry`);
    if (pattern) invariant(pattern.test(entry), `${label} contains an invalid value: ${entry}`);
    invariant(!seen.has(entry), `${label} contains a duplicate: ${entry}`);
    seen.add(entry);
  }
  return entries;
}

function fixedDigestIsCurrent(document, digestField, label) {
  const body = structuredClone(document);
  const actual = body[digestField];
  delete body[digestField];
  requireDigest(actual, `${label}.${digestField}`);
  invariant(actual === canonicalDigest(body), `${label}.${digestField} is stale.`);
}

function approvalIsValid(approval, label, status = "APPROVED") {
  requireObject(approval, label);
  invariant(approval.status === status, `${label}.status must be ${status}.`);
  requireIdentity(approval.approved_by, `${label}.approved_by`);
  requireIsoTimestamp(approval.approved_at, `${label}.approved_at`);
  requireString(approval.approver_role_version, `${label}.approver_role_version`);
  requireDigest(approval.approval_proof_digest, `${label}.approval_proof_digest`);
}

function verifyApprovalPayload(document, envelopeField, omittedFields, label) {
  const envelope = requireObject(document[envelopeField], label);
  const body = structuredClone(document);
  delete body[envelopeField];
  for (const field of omittedFields) delete body[field];
  requireDigest(envelope.signed_payload_digest, `${label}.signed_payload_digest`);
  invariant(
    envelope.signed_payload_digest === canonicalDigest(body),
    `${label}.signed_payload_digest does not cover the current approvable body.`,
  );
}

function readCurrentContext() {
  const specManifest = readJson(absolute(PATHS.specManifest));
  const catalog = readJson(absolute(PATHS.catalog));
  const protocol = readJson(absolute(PATHS.protocol));
  const candidateIndex = readJson(absolute(PATHS.candidateIndex));
  assertRepositoryRelativePath(candidateIndex.path);
  invariant(
    candidateIndex.path ===
      `${PATHS.candidateDirectory}/${candidateIndex.candidate_scope_manifest_id}.json`,
    "Current candidate pointer is not content-addressed.",
  );
  const candidate = readJson(resolveRepositoryPath(root, candidateIndex.path));

  invariant(
    canonicalDigest(specManifest.verification_toolchain) ===
      canonicalDigest(digestFileSet(root, VERIFICATION_TOOLCHAIN_FILES)),
    "Spec Manifest verification toolchain is stale.",
  );

  fixedDigestIsCurrent(specManifest, "manifest_digest", "Spec Manifest");
  fixedDigestIsCurrent(catalog, "catalog_digest", "Required Release Scope Catalog");
  fixedDigestIsCurrent(protocol, "protocol_digest", "Research protocol");
  verifyAddressedDocument(candidate, {
    prefix: "candidate",
    idField: "candidate_scope_manifest_id",
    digestField: "manifest_digest",
  });
  invariant(candidateIndex.manifest_digest === candidate.manifest_digest, "Current candidate pointer digest is stale.");
  invariant(candidateIndex.candidate_scope_manifest_id === candidate.candidate_scope_manifest_id, "Current candidate pointer ID is stale.");
  invariant(candidate.manifest_kind === "SPEC_OR_EXPERIMENT", "Pre-W1 Gate requires a SPEC_OR_EXPERIMENT candidate.");
  invariant(candidate.candidate_artifact_kind === "SPEC_OR_EXPERIMENT", "Current candidate artifact kind is not SPEC_OR_EXPERIMENT.");
  invariant(candidate.spec_manifest_ref.manifest_digest === specManifest.manifest_digest, "Current candidate Spec Manifest reference is stale.");
  invariant(candidate.spec_manifest_ref.normative_set_digest === specManifest.normative_set_digest, "Current candidate normative-set reference is stale.");
  invariant(candidate.required_release_scope_catalog_ref.catalog_digest === catalog.catalog_digest, "Current candidate catalog reference is stale.");
  invariant(candidate.research_protocol_ref.protocol_digest === protocol.protocol_digest, "Current candidate protocol reference is stale.");
  invariant(
    candidate.verification_toolchain_ref?.digest ===
      specManifest.verification_toolchain?.digest,
    "Current candidate verification toolchain reference is stale.",
  );
  validateHistoricalBindings(root, {
    specManifestDigest: specManifest.manifest_digest,
    normativeSetDigest: specManifest.normative_set_digest,
    catalogDigest: catalog.catalog_digest,
    researchProtocolDigest: protocol.protocol_digest,
    candidateScopeManifestId: candidate.candidate_scope_manifest_id,
    candidateScopeManifestDigest: candidate.manifest_digest,
    candidateArtifactDigest: candidate.candidate_artifact_digest,
    verificationToolchainDigest: specManifest.verification_toolchain.digest,
    label: "Current Gate input",
  });

  return { specManifest, catalog, protocol, candidateIndex, candidate };
}

function exactOrMissing(input, key, expected) {
  if (input[key] !== undefined) {
    invariant(
      canonicalDigest(input[key]) === canonicalDigest(expected),
      `${key} does not match the current repository state.`,
    );
  }
  return expected;
}

function loadEvidence() {
  const evidenceById = new Map();
  for (const file of jsonFiles(absolute(PATHS.evidenceDirectory))) {
    const evidence = readJson(file);
    validateSchema(root, SCHEMA_NAMES.evidence, evidence, `Evidence ${path.basename(file)}`);
    verifyEvidenceDocument(evidence);
    const historical = validateHistoricalBindings(root, {
      specManifestDigest: evidence.spec_manifest_ref?.manifest_digest,
      normativeSetDigest: evidence.spec_manifest_ref?.normative_set_digest,
      catalogDigest: evidence.required_release_scope_catalog_ref?.catalog_digest,
      researchProtocolDigest: evidence.research_protocol_ref?.protocol_digest,
      candidateScopeManifestId:
        evidence.candidate_scope_manifest_ref?.candidate_scope_manifest_id,
      candidateScopeManifestDigest:
        evidence.candidate_scope_manifest_ref?.manifest_digest,
      candidateArtifactDigest: evidence.candidate_artifact_digest,
      label: `Evidence ${evidence.evidence_id}`,
    });
    assertNoSensitivePublicData(
      evidence,
      `Evidence ${evidence.evidence_id}`,
      historical.protocol.privacy?.forbidden_public_fields ?? [],
    );
    invariant(
      path.basename(file) === `${evidence.evidence_id}.json`,
      `Evidence filename does not match its ID: ${file}`,
    );
    invariant(!evidenceById.has(evidence.evidence_id), `Duplicate evidence ${evidence.evidence_id}.`);
    invariant(evidence.candidate_artifact_kind === "SPEC_OR_EXPERIMENT", `Evidence ${evidence.evidence_id} has the wrong candidate kind.`);
    evidenceById.set(evidence.evidence_id, evidence);
  }
  return evidenceById;
}

function gateMutationStateDigest(context, records, evidenceById) {
  return canonicalDigest({
    current_context: context,
    gate_registry_prefix: records,
    evidence_manifests: [...evidenceById.entries()].map(
      ([evidenceId, document]) => ({ evidence_id: evidenceId, document }),
    ),
  });
}

function assertGateMutationStateUnchanged(expectedDigest, phase) {
  const context = readCurrentContext();
  const registryPath = absolute(PATHS.gateRegistry);
  const records = parseJsonLines(registryPath);
  invariant(records.length > 0, "Gate registry must remain bootstrapped while finalizing a decision.");
  validateGateChains(records);
  const evidenceById = loadEvidence();
  invariant(
    gateMutationStateDigest(context, records, evidenceById) === expectedDigest,
    `STALE_VERIFICATION_STATE: Gate inputs changed ${phase}.`,
  );
}

function normalizeEvidenceReferences(input, evidenceById, context) {
  const references = requireArray(input ?? [], "evidence_manifest_refs");
  const normalized = [];
  const seen = new Set();
  for (const reference of references) {
    requireObject(reference, "evidence reference");
    requireString(reference.evidence_id, "evidence reference.evidence_id");
    invariant(!seen.has(reference.evidence_id), `Duplicate evidence reference ${reference.evidence_id}.`);
    seen.add(reference.evidence_id);
    const evidence = evidenceById.get(reference.evidence_id);
    invariant(evidence, `Evidence ${reference.evidence_id} is not in the immutable evidence directory.`);
    invariant(
      evidence.candidate_artifact_digest === context.candidate.candidate_artifact_digest &&
        evidence.candidate_scope_manifest_ref?.candidate_scope_manifest_id ===
          context.candidate.candidate_scope_manifest_id &&
        evidence.candidate_scope_manifest_ref?.manifest_digest ===
          context.candidate.manifest_digest &&
        evidence.spec_manifest_ref?.manifest_digest ===
          context.specManifest.manifest_digest &&
        evidence.spec_manifest_ref?.normative_set_digest ===
          context.specManifest.normative_set_digest &&
        evidence.required_release_scope_catalog_ref?.catalog_digest ===
          context.catalog.catalog_digest &&
        evidence.research_protocol_ref?.protocol_digest ===
          context.protocol.protocol_digest,
      `Evidence ${reference.evidence_id} belongs to a different frozen candidate.`,
    );
    const expected = {
      evidence_id: evidence.evidence_id,
      manifest_digest: evidence.manifest_digest,
      record_digest: evidence.record_digest,
    };
    invariant(
      canonicalDigest(reference) === canonicalDigest(expected),
      `Evidence reference ${reference.evidence_id} does not match its immutable manifest.`,
    );
    normalized.push(expected);
  }
  return normalized;
}

function validateAttestation(evidence) {
  const attestation = requireObject(evidence.attestation, `Evidence ${evidence.evidence_id} attestation`);
  invariant(
    canonicalDigest(Object.keys(attestation).sort()) === canonicalDigest(ATTESTATION_KEYS),
    `Evidence ${evidence.evidence_id} attestation has an unexpected shape.`,
  );
  invariant(attestation.status === "VERIFIED", `Evidence ${evidence.evidence_id} attestation is not VERIFIED.`);
  requireIdentity(attestation.attested_by, `Evidence ${evidence.evidence_id} attested_by`);
  const attestedAt = requireIsoTimestamp(attestation.attested_at, `Evidence ${evidence.evidence_id} attested_at`);
  requireDigest(attestation.signed_payload_digest, `Evidence ${evidence.evidence_id} signed_payload_digest`);
  requireDigest(attestation.proof_digest, `Evidence ${evidence.evidence_id} proof_digest`);
  invariant(attestation.signed_payload_digest === evidence.manifest_digest, `Evidence ${evidence.evidence_id} attestation does not cover its digest.`);
  const producer = requireObject(evidence.producer, `Evidence ${evidence.evidence_id} producer`);
  requireIdentity(producer.identity, `Evidence ${evidence.evidence_id} producer.identity`);
  invariant(
    ["CI_WORKLOAD_IDENTITY", "APPROVED_OPERATOR"].includes(producer.identity_kind),
    `Evidence ${evidence.evidence_id} producer.identity_kind is invalid.`,
  );
  requireString(producer.allowlist_version, `Evidence ${evidence.evidence_id} producer.allowlist_version`);
  validateEvidenceProducer(root, producer);
  invariant(attestation.attested_by !== producer.identity, `Evidence ${evidence.evidence_id} is self-attested.`);
  invariant(attestedAt >= requireIsoTimestamp(evidence.completed_at, `Evidence ${evidence.evidence_id} completed_at`), `Evidence ${evidence.evidence_id} was attested before completion.`);
  const verified = verifyTrustedProof(root, {
    kind: "EVIDENCE_VERIFIED",
    payloadDigest: evidence.manifest_digest,
    payloadBytes: canonicalPayloadBytes(evidence, [
      "evidence_id",
      "manifest_digest",
      "record_digest",
      "attestation",
      "signature",
    ]),
    proofDigest: attestation.proof_digest,
    expectedDecision: "VERIFIED",
  });
  invariant(
    attestation.attested_by === verified.signer &&
      new Date(attestation.attested_at).toISOString() === verified.attestedAt &&
      producer.identity !== verified.signer,
    `Evidence ${evidence.evidence_id} attestation does not match its verified workload signer and Rekor timestamp.`,
  );
}

function validatePassEvidenceBasics(evidence) {
  invariant(
    evidence.schema_version === "rolefox.evidence-manifest.v1",
    `Evidence ${evidence.evidence_id} schema_version mismatch.`,
  );
  invariant(
    evidence.evidence_type === "USER_RESEARCH",
    `Evidence ${evidence.evidence_id} must be USER_RESEARCH.`,
  );
  requireString(evidence.run_id, `Evidence ${evidence.evidence_id} run_id`);
  const artifacts = requireArray(
    evidence.artifact_refs,
    `Evidence ${evidence.evidence_id} artifact_refs`,
  );
  invariant(artifacts.length > 0, `Evidence ${evidence.evidence_id} has no controlled artifact refs.`);
  const artifactIds = new Set();
  for (const artifact of artifacts) {
    requireObject(artifact, `Evidence ${evidence.evidence_id} artifact ref`);
    const artifactId = requireString(
      artifact.artifact_id,
      `Evidence ${evidence.evidence_id} artifact_id`,
    );
    invariant(!artifactIds.has(artifactId), `Evidence ${evidence.evidence_id} repeats artifact ${artifactId}.`);
    artifactIds.add(artifactId);
    requireDigest(artifact.sha256, `Evidence ${evidence.evidence_id} artifact sha256`);
    requireString(artifact.media_type, `Evidence ${evidence.evidence_id} artifact media_type`);
    requireDigest(
      artifact.controlled_store_locator_digest,
      `Evidence ${evidence.evidence_id} controlled-store locator digest`,
    );
  }
  const deidentification = requireObject(
    evidence.deidentification,
    `Evidence ${evidence.evidence_id} deidentification`,
  );
  invariant(
    ["RANDOM_COHORT_LOCAL_SURROGATE", "DOMAIN_SEPARATED_HMAC_SURROGATE"].includes(
      deidentification.scheme,
    ),
    `Evidence ${evidence.evidence_id} deidentification scheme is invalid.`,
  );
  requireString(
    deidentification.scheme_version,
    `Evidence ${evidence.evidence_id} deidentification scheme_version`,
  );
  invariant(
    deidentification.mapping_location === "CONTROLLED_ARTIFACT_STORE_ONLY",
    `Evidence ${evidence.evidence_id} exposes a deidentification mapping location.`,
  );
  const subjects = requireArray(
    evidence.subject_refs,
    `Evidence ${evidence.evidence_id} subject_refs`,
  );
  invariant(
    subjects.some(
      (subject) =>
        subject?.subject_type === "GATE_CRITERION" &&
        subject?.gate_id === GATE_IDS.preW1 &&
        typeof subject?.criterion_id === "string",
    ),
    `Evidence ${evidence.evidence_id} lacks a typed Pre-W1 criterion subject.`,
  );
}

function oneMeasurement(evidence, measurementType) {
  const measurements = requireArray(evidence.measurements, `Evidence ${evidence.evidence_id} measurements`);
  const matches = measurements.filter((measurement) => measurement?.measurement_type === measurementType);
  invariant(matches.length === 1, `Evidence ${evidence.evidence_id} must contain exactly one ${measurementType} measurement.`);
  return requireObject(matches[0], `${measurementType} measurement`);
}

function validatePainEvidence(evidence, protocol) {
  const measurement = oneMeasurement(evidence, "PAIN_THRESHOLD");
  const denominator = requireInteger(measurement.cohort_denominator, "Pain cohort_denominator", 1);
  const qualified = requireInteger(measurement.qualified_n, "Pain qualified_n", 0);
  invariant(qualified <= denominator, "Pain qualified_n exceeds its denominator.");
  invariant(denominator >= protocol.cohorts.pain_interviews.target_minimum, "Pain cohort is below the frozen minimum.");
  invariant(denominator <= protocol.cohorts.pain_interviews.target_maximum, "Pain cohort exceeds the frozen maximum.");
  invariant(qualified >= protocol.cohorts.pain_interviews.pass_numerator_minimum, "Pain qualified_n is below the PASS threshold.");
  invariant(measurement.opportunities_per_week_minimum === protocol.cohorts.pain_interviews.pass_criteria.opportunities_per_week_minimum, "Pain opportunity threshold is stale.");
  invariant(measurement.repetitive_work_rank_maximum === protocol.cohorts.pain_interviews.pass_criteria.repetitive_work_rank_maximum, "Pain rank threshold is stale.");
  requireDigest(measurement.eligibility_and_exclusion_policy_digest, "Pain eligibility policy digest");
  requireString(measurement.calculation_version, "Pain calculation_version");
  const participants = uniqueStrings(measurement.participant_surrogates, "Pain participant_surrogates");
  invariant(participants.length === denominator, "Pain participant surrogate count differs from the denominator.");
  const qualifiedParticipants = uniqueStrings(
    measurement.qualified_participant_surrogates,
    "Pain qualified_participant_surrogates",
  );
  invariant(qualifiedParticipants.length === qualified, "Pain qualified surrogate count differs from qualified_n.");
  invariant(qualifiedParticipants.every((participant) => participants.includes(participant)), "Pain qualified participant is absent from the cohort denominator.");
  return new Set(qualifiedParticipants);
}

function validateChannelEvidence(evidence, protocol) {
  const measurement = oneMeasurement(evidence, "CHANNEL_ELIGIBILITY");
  const denominator = requireInteger(measurement.cohort_denominator, "Channel cohort_denominator", 1);
  const eligible = requireInteger(measurement.eligible_n, "Channel eligible_n", 0);
  invariant(eligible <= denominator, "Channel eligible_n exceeds its denominator.");
  invariant(eligible >= protocol.cohorts.target_channel_feasibility.eligible_n_minimum, "Channel eligible_n is below the PASS threshold.");
  requireDigest(measurement.eligibility_and_exclusion_policy_digest, "Channel eligibility policy digest");
  requireString(measurement.calculation_version, "Channel calculation_version");
  const participants = uniqueStrings(measurement.participant_surrogates, "Channel participant_surrogates");
  invariant(participants.length === denominator, "Channel participant surrogate count differs from the denominator.");
  const eligibilityRefs = requireArray(measurement.eligibility_refs, "Channel eligibility_refs");
  invariant(eligibilityRefs.length === eligible, "Channel eligibility refs must exactly cover all eligible participants.");
}

function validateReplayEvidence(evidence, protocol, painQualified) {
  const measurement = oneMeasurement(evidence, "RULE_REPLAY");
  const qualified = requireInteger(measurement.qualified_participant_n, "Replay qualified_participant_n", 1);
  invariant(qualified >= protocol.rules_replay.participants_minimum, "Replay participant count is below the PASS threshold.");
  invariant(measurement.jobs_per_participant === protocol.rules_replay.jobs_per_participant, "Replay jobs_per_participant is stale.");
  invariant(measurement.dataset_frozen === true, "Replay dataset is not frozen.");
  invariant(measurement.explicit_rejection_reasons_covered === protocol.rules_replay.pass_criteria.explicit_rejection_reasons_covered, "Replay does not cover all rejection reasons.");
  invariant(measurement.remaining_ambiguity === protocol.rules_replay.pass_criteria.remaining_ambiguity, "Replay ambiguity is not reduced to finite exception categories.");
  requireString(measurement.calculation_version, "Replay calculation_version");
  const refs = requireArray(measurement.participant_dataset_refs, "Replay participant_dataset_refs");
  invariant(refs.length === qualified, "Replay participant dataset count differs from qualified_participant_n.");
  const participants = new Set();
  for (const reference of refs) {
    requireObject(reference, "Replay participant dataset reference");
    const participant = requireString(reference.participant_surrogate, "Replay participant_surrogate");
    invariant(!participants.has(participant), `Replay repeats participant ${participant}.`);
    participants.add(participant);
    invariant(painQualified.has(participant), `Replay participant ${participant} lacks pain-threshold qualification.`);
    requireDigest(reference.dataset_digest, `Replay ${participant} dataset_digest`);
    invariant(reference.jobs_count === protocol.rules_replay.jobs_per_participant, `Replay ${participant} does not bind exactly ${protocol.rules_replay.jobs_per_participant} jobs.`);
  }
}

function validatePassEvidence(evidenceRefs, evidenceById, context, submittedAt) {
  invariant(evidenceRefs.length >= EVIDENCE_KINDS.size, "Pre-W1 PASS must reference all three evidence kinds.");
  const byKind = new Map();
  let latestCompletedAt = 0;
  const candidateApprovedAt = requireIsoTimestamp(context.candidate.approval.approved_at, "candidate.approval.approved_at");
  for (const reference of evidenceRefs) {
    const evidence = evidenceById.get(reference.evidence_id);
    invariant(evidence.result === "PASS", `PASS Gate references non-PASS evidence ${evidence.evidence_id}.`);
    invariant(EVIDENCE_KINDS.has(evidence.evidence_kind), `Unknown evidence kind ${evidence.evidence_kind}.`);
    invariant(evidence.research_scope_id === EVIDENCE_KINDS.get(evidence.evidence_kind), `Evidence ${evidence.evidence_id} research scope mismatch.`);
    validatePassEvidenceBasics(evidence);
    const criteria = requireArray(evidence.criterion_results, `Evidence ${evidence.evidence_id} criterion_results`);
    invariant(criteria.length > 0, `Evidence ${evidence.evidence_id} has no criterion results.`);
    invariant(criteria.every((criterion) => criterion?.result === "PASS"), `Evidence ${evidence.evidence_id} has a non-PASS criterion.`);
    validateAttestation(evidence);
    const startedAt = requireIsoTimestamp(evidence.started_at, `Evidence ${evidence.evidence_id} started_at`);
    invariant(startedAt >= candidateApprovedAt, `Evidence ${evidence.evidence_id} predates Candidate Scope approval.`);
    latestCompletedAt = Math.max(latestCompletedAt, requireIsoTimestamp(evidence.completed_at, `Evidence ${evidence.evidence_id} completed_at`));
    const entries = byKind.get(evidence.evidence_kind) ?? [];
    entries.push(evidence);
    byKind.set(evidence.evidence_kind, entries);
  }
  for (const kind of EVIDENCE_KINDS.keys()) {
    invariant(byKind.has(kind), `Pre-W1 PASS is missing ${kind} evidence.`);
  }
  const painQualified = validatePainEvidence(byKind.get("PAIN_INTERVIEWS").at(-1), context.protocol);
  validateChannelEvidence(byKind.get("TARGET_CHANNEL_FEASIBILITY").at(-1), context.protocol);
  validateReplayEvidence(byKind.get("RULES_REPLAY").at(-1), context.protocol, painQualified);
  invariant(submittedAt >= latestCompletedAt, "Gate submission predates referenced evidence completion.");
}

function validateFailEvidence(evidenceRefs, evidenceById, context, submittedAt) {
  invariant(
    evidenceRefs.length > 0,
    "Pre-W1 FAIL must reference at least one VERIFIED FAIL evidence manifest.",
  );
  let hasFailedEvidence = false;
  let latestCompletedAt = 0;
  const candidateApprovedAt = requireIsoTimestamp(
    context.candidate.approval.approved_at,
    "candidate.approval.approved_at",
  );
  for (const reference of evidenceRefs) {
    const evidence = evidenceById.get(reference.evidence_id);
    invariant(
      ["PASS", "FAIL"].includes(evidence.result),
      `FAIL Gate references inconclusive evidence ${evidence.evidence_id}.`,
    );
    invariant(
      EVIDENCE_KINDS.has(evidence.evidence_kind),
      `Unknown evidence kind ${evidence.evidence_kind}.`,
    );
    invariant(
      evidence.research_scope_id === EVIDENCE_KINDS.get(evidence.evidence_kind),
      `Evidence ${evidence.evidence_id} research scope mismatch.`,
    );
    validatePassEvidenceBasics(evidence);
    const criteria = requireArray(
      evidence.criterion_results,
      `Evidence ${evidence.evidence_id} criterion_results`,
    );
    invariant(criteria.length > 0, `Evidence ${evidence.evidence_id} has no criterion results.`);
    if (evidence.result === "PASS") {
      invariant(
        criteria.every((criterion) => criterion?.result === "PASS"),
        `PASS Evidence ${evidence.evidence_id} has a non-PASS criterion.`,
      );
    } else {
      invariant(
        criteria.some((criterion) => criterion?.result === "FAIL"),
        `FAIL Evidence ${evidence.evidence_id} has no failed criterion.`,
      );
      hasFailedEvidence = true;
    }
    validateAttestation(evidence);
    const startedAt = requireIsoTimestamp(
      evidence.started_at,
      `Evidence ${evidence.evidence_id} started_at`,
    );
    invariant(
      startedAt >= candidateApprovedAt,
      `Evidence ${evidence.evidence_id} predates Candidate Scope approval.`,
    );
    latestCompletedAt = Math.max(
      latestCompletedAt,
      requireIsoTimestamp(
        evidence.completed_at,
        `Evidence ${evidence.evidence_id} completed_at`,
      ),
    );
  }
  invariant(
    hasFailedEvidence,
    "Pre-W1 FAIL must reference at least one VERIFIED FAIL evidence manifest.",
  );
  invariant(submittedAt >= latestCompletedAt, "Gate submission predates referenced evidence completion.");
}

function requireDecisionAuthorities(context) {
  requireSoleMaintainerProtocol(context.protocol);
  invariant(context.catalog.status === "ACCEPTED", "Required Release Scope Catalog is not accepted.");
  approvalIsValid(
    {
      status: context.catalog.status,
      approved_by: context.catalog.review?.reviewed_by,
      approved_at: context.catalog.review?.reviewed_at,
      approver_role_version: context.catalog.review?.approver_role_version,
      approval_proof_digest: context.catalog.review?.approval_proof_digest,
    },
    "catalog.review",
    "ACCEPTED",
  );
  verifyApprovalPayload(
    context.catalog,
    "review",
    ["catalog_digest"],
    "catalog.review",
  );
  requireSoleMaintainerDecision(
    context.catalog.review.reviewed_by,
    context.catalog.review.approver_role_version,
    "catalog.review",
  );
  invariant(context.protocol.status === "APPROVED", "Research protocol is not approved.");
  approvalIsValid({ status: context.protocol.status, ...context.protocol.approval }, "protocol.approval");
  verifyApprovalPayload(
    context.protocol,
    "approval",
    ["protocol_digest"],
    "protocol.approval",
  );
  requireSoleMaintainerDecision(
    context.protocol.approval.approved_by,
    context.protocol.approval.approver_role_version,
    "protocol.approval",
  );
  approvalIsValid(context.candidate.approval, "candidate.approval");
  verifyApprovalPayload(
    context.candidate,
    "approval",
    ["candidate_scope_manifest_id", "manifest_digest"],
    "candidate.approval",
  );
  requireSoleMaintainerDecision(
    context.candidate.approval.approved_by,
    context.candidate.approval.approver_role_version,
    "candidate.approval",
  );
  for (const contract of [
    {
      kind: "CATALOG_ACCEPTED",
      document: context.catalog,
      envelope: context.catalog.review,
      excluded: ["catalog_digest", "review"],
      decision: "ACCEPTED",
      approvedBy: context.catalog.review.reviewed_by,
      approvedAt: context.catalog.review.reviewed_at,
      label: "catalog.review",
    },
    {
      kind: "PROTOCOL_APPROVED",
      document: context.protocol,
      envelope: context.protocol.approval,
      excluded: ["protocol_digest", "approval"],
      decision: "APPROVED",
      approvedBy: context.protocol.approval.approved_by,
      approvedAt: context.protocol.approval.approved_at,
      label: "protocol.approval",
    },
    {
      kind: "CANDIDATE_APPROVED",
      document: context.candidate,
      envelope: context.candidate.approval,
      excluded: ["candidate_scope_manifest_id", "manifest_digest", "approval"],
      decision: "APPROVED",
      approvedBy: context.candidate.approval.approved_by,
      approvedAt: context.candidate.approval.approved_at,
      label: "candidate.approval",
    },
  ]) {
    const verified = verifyTrustedProof(root, {
      kind: contract.kind,
      payloadDigest: contract.envelope.signed_payload_digest,
      payloadBytes: canonicalPayloadBytes(contract.document, contract.excluded),
      proofDigest: contract.envelope.approval_proof_digest,
      expectedDecision: contract.decision,
    });
    invariant(
      contract.approvedBy === verified.actor &&
        contract.envelope.approver_role_version === verified.roleVersion &&
        new Date(contract.approvedAt).toISOString() === verified.decisionAt,
      `${contract.label} does not match its verified maintainer decision.`,
    );
  }
  invariant(
    context.candidate.collection_guard === "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION",
    "Candidate collection guard is not approved and protocol-bound.",
  );
  invariant(
    context.candidateIndex.readiness === "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION",
    "Candidate pointer is not approved for protocol-bound collection.",
  );
}

function bindDecision(input, context, previous, evidenceById, { prepare = false } = {}) {
  requireObject(input, "Gate decision input");
  for (const key of Object.keys(input)) {
    invariant(DECISION_KEYS.has(key), `Unknown Gate decision field: ${key}`);
  }
  invariant(input.schema_version === undefined || input.schema_version === "rolefox.gate-evidence-record.v1", "Gate schema_version mismatch.");
  invariant(input.gate_id === undefined || input.gate_id === GATE_IDS.preW1, `gate_id must be ${GATE_IDS.preW1}.`);
  invariant(input.scope_id === undefined || input.scope_id === PRE_W1_SCOPE_ID, `scope_id must be ${PRE_W1_SCOPE_ID}.`);
  invariant(GATE_RESULTS.has(input.result), "Gate result must be PASS, FAIL, or BLOCKED.");
  invariant(input.criteria_version === undefined || input.criteria_version === context.protocol.protocol_version, "criteria_version does not match the current research protocol.");

  const now = new Date().toISOString();
  const bound = structuredClone(input);
  const originalId = bound.record_id;
  const originalDigest = bound.record_digest;
  delete bound.record_id;
  delete bound.record_digest;
  bound.schema_version = "rolefox.gate-evidence-record.v1";
  bound.gate_id = GATE_IDS.preW1;
  bound.scope_id = PRE_W1_SCOPE_ID;
  bound.criteria_version = context.protocol.protocol_version;
  bound.criterion_refs = bound.criterion_refs ?? [...PRE_W1_CRITERION_REFS];
  uniqueStrings(bound.criterion_refs, "criterion_refs", CRITERION_PATTERN);
  invariant(
    canonicalDigest([...bound.criterion_refs].sort()) ===
      canonicalDigest([...PRE_W1_CRITERION_REFS].sort()),
    "criterion_refs must equal the frozen Pre-W1 criterion set.",
  );
  bound.previous = exactOrMissing(bound, "previous", previous);
  bound.lifecycle_state = bound.lifecycle_state ??
    (["PASS", "FAIL"].includes(bound.result) ? "DECIDED" : "BLOCKED_NOT_STARTED");
  if (["PASS", "FAIL"].includes(bound.result)) {
    invariant(
      bound.lifecycle_state === "DECIDED",
      "PASS/FAIL lifecycle_state must be DECIDED.",
    );
  } else {
    invariant(
      bound.lifecycle_state === "BLOCKED_NOT_STARTED",
      "BLOCKED must leave Pre-W1 fail-closed.",
    );
  }
  bound.reason_codes = uniqueStrings(bound.reason_codes ?? [], "reason_codes", /^[A-Z][A-Z0-9_]{2,127}$/);
  if (bound.result !== "PASS") {
    invariant(bound.reason_codes.length > 0, "FAIL/BLOCKED decisions require at least one reason code.");
  } else {
    invariant(bound.reason_codes.length === 0, "PASS decisions cannot retain failure reason codes.");
  }
  bound.candidate_artifact_kind = exactOrMissing(
    bound,
    "candidate_artifact_kind",
    "SPEC_OR_EXPERIMENT",
  );
  bound.candidate_artifact_digest = exactOrMissing(
    bound,
    "candidate_artifact_digest",
    context.candidate.candidate_artifact_digest,
  );
  bound.verification_toolchain_digest = exactOrMissing(
    bound,
    "verification_toolchain_digest",
    context.specManifest.verification_toolchain.digest,
  );
  bound.candidate_scope_manifest_ref = exactOrMissing(
    bound,
    "candidate_scope_manifest_ref",
    {
      candidate_scope_manifest_id: context.candidate.candidate_scope_manifest_id,
      manifest_digest: context.candidate.manifest_digest,
    },
  );
  bound.spec_manifest_ref = exactOrMissing(bound, "spec_manifest_ref", {
    manifest_digest: context.specManifest.manifest_digest,
    normative_set_digest: context.specManifest.normative_set_digest,
  });
  bound.required_release_scope_catalog_ref = exactOrMissing(
    bound,
    "required_release_scope_catalog_ref",
    { catalog_digest: context.catalog.catalog_digest },
  );
  bound.research_protocol_ref = exactOrMissing(bound, "research_protocol_ref", {
    protocol_digest: context.protocol.protocol_digest,
  });
  bound.evidence_manifest_refs = normalizeEvidenceReferences(
    bound.evidence_manifest_refs,
    evidenceById,
    context,
  );
  bound.runtime_binding_manifest_refs = exactOrMissing(
    bound,
    "runtime_binding_manifest_refs",
    [],
  );
  bound.predecessor_gate_refs = exactOrMissing(
    bound,
    "predecessor_gate_refs",
    [],
  );
  bound.not_before = bound.not_before ?? context.candidate.created_at;
  const notBefore = requireIsoTimestamp(bound.not_before, "not_before");
  invariant(
    notBefore >= requireIsoTimestamp(context.candidate.created_at, "candidate.created_at"),
    "not_before predates the current frozen candidate.",
  );
  bound.submitted_at = bound.submitted_at ?? now;
  bound.decided_at = bound.decided_at ?? now;
  const submittedAt = requireIsoTimestamp(bound.submitted_at, "submitted_at");
  const decidedAt = requireIsoTimestamp(bound.decided_at, "decided_at");
  invariant(decidedAt >= submittedAt, "decided_at predates submitted_at.");
  requireIdentity(bound.submitted_by, "submitted_by");

  bound.approved_by = bound.approved_by ?? null;
  bound.approved_at = bound.approved_at ?? null;
  bound.approver_role_version = bound.approver_role_version ?? null;
  bound.approval_proof_digest = bound.approval_proof_digest ?? null;
  bound.approval_payload_digest = bound.approval_payload_digest ?? null;
  if (["PASS", "FAIL"].includes(bound.result)) {
    if (bound.result === "FAIL") {
      invariant(
        bound.evidence_manifest_refs.length > 0,
        "Pre-W1 FAIL must reference at least one VERIFIED FAIL evidence manifest.",
      );
    }
    requireDecisionAuthorities(context);
    requireIdentity(bound.approved_by, "approved_by");
    const approvedAt = requireIsoTimestamp(bound.approved_at, "approved_at");
    requireString(bound.approver_role_version, "approver_role_version");
    if (prepare) {
      invariant(
        bound.approval_proof_digest === null,
        "Prepared PASS/FAIL must leave approval_proof_digest null for the maintainer decision proof.",
      );
    } else {
      requireDigest(bound.approval_proof_digest, "approval_proof_digest");
    }
    requireSoleMaintainerDecision(
      bound.approved_by,
      bound.approver_role_version,
      "Gate decision",
    );
    invariant(
      bound.submitted_by === bound.approved_by,
      "Sole-maintainer PASS/FAIL must be submitted and decided by the configured maintainer.",
    );
    invariant(approvedAt >= submittedAt, "Gate approval predates submission.");
    invariant(decidedAt >= approvedAt, "decided_at predates Gate approval.");
    if (bound.result === "PASS") {
      validatePassEvidence(bound.evidence_manifest_refs, evidenceById, context, submittedAt);
    } else {
      validateFailEvidence(bound.evidence_manifest_refs, evidenceById, context, submittedAt);
    }
  } else {
    const approvalValues = [
      bound.approved_by,
      bound.approved_at,
      bound.approver_role_version,
      bound.approval_proof_digest,
    ];
    invariant(
      approvalValues.every((value) => value === null),
      "BLOCKED decisions must not claim approval identity, time, role, or proof.",
    );
  }

  const approvalPayload = structuredClone(bound);
  delete approvalPayload.record_id;
  delete approvalPayload.record_digest;
  delete approvalPayload.approval_payload_digest;
  delete approvalPayload.approval_proof_digest;
  const expectedApprovalPayloadDigest = canonicalDigest(approvalPayload);
  if (bound.result === "PASS") {
    if (bound.approval_payload_digest !== null) {
      requireDigest(bound.approval_payload_digest, "approval_payload_digest");
      invariant(
        bound.approval_payload_digest === expectedApprovalPayloadDigest,
        `approval_payload_digest must equal ${expectedApprovalPayloadDigest}.`,
      );
    }
    bound.approval_payload_digest = expectedApprovalPayloadDigest;
  } else {
    if (bound.approval_payload_digest !== null) {
      requireDigest(bound.approval_payload_digest, "approval_payload_digest");
      invariant(
        bound.approval_payload_digest === expectedApprovalPayloadDigest,
        `approval_payload_digest must equal ${expectedApprovalPayloadDigest}.`,
      );
    }
    bound.approval_payload_digest = expectedApprovalPayloadDigest;
  }

  const record = addressDocument(bound, {
    prefix: "gate",
    idField: "record_id",
    digestField: "record_digest",
  });
  assertNoSensitivePublicData(
    record,
    "Gate decision",
    context.protocol.privacy?.forbidden_public_fields ?? [],
  );
  if (originalId !== undefined) {
    invariant(originalId === record.record_id, "Supplied record_id does not match the bound decision.");
  }
  if (originalDigest !== undefined) {
    invariant(originalDigest === record.record_digest, "Supplied record_digest does not match the bound decision.");
  }
  return record;
}

function parseArguments(argv) {
  let inputValue;
  let proofBundlePath;
  let prepare = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--prepare") {
      invariant(!prepare, "--prepare may only be supplied once.");
      prepare = true;
    } else if (argument === "--input") {
      invariant(inputValue === undefined, "--input may only be supplied once.");
      inputValue = argv[index + 1];
      invariant(inputValue !== undefined, "--input requires a JSON file, '-' for stdin, or inline JSON.");
      index += 1;
    } else if (argument === "--proof-bundle") {
      invariant(proofBundlePath === undefined, "--proof-bundle may only be supplied once.");
      proofBundlePath = argv[index + 1];
      invariant(proofBundlePath !== undefined, "--proof-bundle requires a file path.");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  invariant(
    inputValue !== undefined,
    "Usage: append-gate.mjs --input <json-file|inline-json|-> [--prepare | --proof-bundle <bundle.json>]",
  );
  invariant(!prepare || proofBundlePath === undefined, "--prepare cannot be combined with --proof-bundle.");
  return { inputValue, prepare, proofBundlePath };
}

function readInput(inputValue) {
  if (inputValue === "-") return JSON.parse(fs.readFileSync(0, "utf8"));
  if (fs.existsSync(inputValue)) return readJson(inputValue);
  try {
    return JSON.parse(inputValue);
  } catch {
    throw new Error(`--input is neither an existing file nor valid inline JSON: ${inputValue}`);
  }
}

function main() {
  assertSafeRepositoryStorage(root, Object.values(PATHS));
  const argv = process.argv.slice(2);
  if (argv[0] === "--") argv.shift();
  const { inputValue, prepare, proofBundlePath } = parseArguments(argv);
  const input = readInput(inputValue);

  withVerificationLock(root, prepare ? "prepare-gate" : "append-gate", () => {
    const context = readCurrentContext();
    const registryPath = absolute(PATHS.gateRegistry);
    const records = parseJsonLines(registryPath);
    invariant(records.length > 0, "Gate registry must be bootstrapped before appending a decision.");
    const heads = validateGateChains(records);
    const currentHead = heads.find(
      (record) => record.gate_id === GATE_IDS.preW1 && record.scope_id === PRE_W1_SCOPE_ID,
    );
    invariant(currentHead, "Gate registry has no current Pre-W1 head.");
    const previous = {
      record_id: currentHead.record_id,
      record_digest: currentHead.record_digest,
    };
    const evidenceById = loadEvidence();
    const mutationStateDigest = gateMutationStateDigest(context, records, evidenceById);
    invariant(
      !prepare || ["PASS", "FAIL"].includes(input.result),
      "--prepare is only defined for a PASS or FAIL decision.",
    );
    let record = bindDecision(input, context, previous, evidenceById, {
      prepare: prepare || ["PASS", "FAIL"].includes(input.result),
    });
    if (prepare) {
      const preparedDecision = structuredClone(record);
      delete preparedDecision.record_id;
      delete preparedDecision.record_digest;
      process.stdout.write(`${JSON.stringify({
        schema_version: "rolefox.gate-approval-request.v1",
        approval_payload_digest: record.approval_payload_digest,
        required_approval_payload_digest: record.approval_payload_digest,
        prepared_decision: preparedDecision,
      })}\n`);
      return;
    }
    if (["PASS", "FAIL"].includes(record.result)) {
      invariant(
        TRUST_VERIFICATION_STATUS === "IMPLEMENTED",
        `Cannot append ${record.result} while cryptographic trust verification is not implemented.`,
      );
      invariant(
        typeof proofBundlePath === "string" && proofBundlePath.length > 0,
        `Appending ${record.result} requires --proof-bundle.`,
      );
      const kind = record.result === "PASS" ? "GATE_PASS" : "GATE_FAIL";
      const verified = verifyTrustedProof(root, {
        kind,
        payloadDigest: record.approval_payload_digest,
        payloadBytes: canonicalPayloadBytes(record, [
          "record_id",
          "record_digest",
          "approval_payload_digest",
          "approval_proof_digest",
        ]),
        bundlePath: proofBundlePath,
        expectedDecision: record.result,
      });
      invariant(
        record.approved_by === verified.actor &&
          record.approver_role_version === verified.roleVersion,
        "Gate decision identity or role does not match the verified maintainer proof.",
      );
      invariant(
        Date.parse(verified.decisionAt) >=
          Math.max(Date.parse(record.approved_at), Date.parse(record.decided_at)),
        "Gate proof decision time predates the prepared Gate decision.",
      );
      const finalizedDecision = structuredClone(record);
      delete finalizedDecision.record_id;
      delete finalizedDecision.record_digest;
      finalizedDecision.approval_proof_digest = verified.proofDigest;
      record = bindDecision(
        finalizedDecision,
        context,
        previous,
        evidenceById,
        { prepare: false },
      );
      assertGateMutationStateUnchanged(
        mutationStateDigest,
        "during trust verification",
      );
      importTrustedProof(root, proofBundlePath, verified.proofDigest);
      assertGateMutationStateUnchanged(
        mutationStateDigest,
        "during trust proof import",
      );
    } else {
      invariant(
        proofBundlePath === undefined,
        "BLOCKED Gate records cannot attach a trust proof bundle.",
      );
    }
    validateSchema(root, SCHEMA_NAMES.gate, record, "Gate Evidence Record");
    appendJsonLine(registryPath, record);

    const persistedRecords = parseJsonLines(registryPath);
    const persistedHeads = validateGateChains(persistedRecords);
    const persistedHead = persistedHeads.find(
      (entry) => entry.gate_id === GATE_IDS.preW1 && entry.scope_id === PRE_W1_SCOPE_ID,
    );
    invariant(persistedHead?.record_id === record.record_id, "Appended Gate record did not become the unique current head.");
    invariant(persistedHead.record_digest === record.record_digest, "Persisted Gate record digest changed after append.");
    verifyAddressedDocument(persistedHead, {
      prefix: "gate",
      idField: "record_id",
      digestField: "record_digest",
    });

    const { checkpoint, disposition } = createCurrentCheckpoint(root);
    const checkpointPath = path.join(
      absolute(PATHS.checkpointDirectory),
      `${checkpoint.checkpoint_id}.json`,
    );
    const persistedCheckpoint = readJson(checkpointPath);
    verifyCheckpointDocument(persistedCheckpoint);
    invariant(
      persistedCheckpoint.gate_heads.some(
        (head) =>
          head.gate_id === record.gate_id &&
          head.scope_id === record.scope_id &&
          head.record_id === record.record_id &&
          head.record_digest === record.record_digest,
      ),
      "Checkpoint does not cover the appended Gate head.",
    );
    process.stdout.write(
      `Appended ${record.record_id} (${record.result}); ` +
        `${disposition === "created" ? "created" : "reused"} checkpoint ${checkpoint.checkpoint_id}.\n`,
    );
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`append-gate: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
