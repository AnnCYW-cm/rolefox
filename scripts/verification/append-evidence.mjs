import fs from "node:fs";
import path from "node:path";

import {
  createCurrentCheckpoint,
  validateHistoricalBindings,
} from "./checkpoint-lib.mjs";
import {
  EVIDENCE_TYPES,
  PATHS,
  SOLE_MAINTAINER_AUTHORITY,
  TRUST_VERIFICATION_STATUS,
  VERIFICATION_TOOLCHAIN_FILES,
} from "./config.mjs";
import {
  addressEvidenceDocument,
  assertRepositoryRelativePath,
  assertSafeRepositoryStorage,
  canonicalDigest,
  digestFileSet,
  invariant,
  isSha256,
  readJson,
  repositoryRoot,
  resolveRepositoryPath,
  verifyAddressedDocument,
  verifyEvidenceDocument,
  withVerificationLock,
  writeJsonImmutable,
} from "./lib.mjs";
import { assertNoSensitivePublicData } from "./privacy.mjs";
import { SCHEMA_NAMES, validateSchema } from "./schema.mjs";

const EVIDENCE_KINDS = new Map([
  ["PAIN_INTERVIEWS", "pain_interviews"],
  ["TARGET_CHANNEL_FEASIBILITY", "target_channel_feasibility"],
  ["RULES_REPLAY", "rules_replay"],
]);
const EVIDENCE_RESULTS = new Set(["PASS", "FAIL", "INCONCLUSIVE"]);
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const ATTESTATION_KEYS = [
  "attested_at",
  "attested_by",
  "proof_digest",
  "signed_payload_digest",
  "status",
];
const EVIDENCE_KEYS = new Set([
  "artifact_refs",
  "attestation",
  "candidate_artifact_digest",
  "candidate_artifact_kind",
  "candidate_scope_manifest_ref",
  "completed_at",
  "criterion_results",
  "deidentification",
  "evidence_id",
  "evidence_kind",
  "evidence_type",
  "manifest_digest",
  "measurements",
  "producer",
  "record_digest",
  "required_release_scope_catalog_ref",
  "research_protocol_ref",
  "research_scope_id",
  "result",
  "run_id",
  "schema_version",
  "spec_manifest_ref",
  "started_at",
  "subject_refs",
]);
const PRODUCER_KEYS = ["allowlist_version", "identity", "identity_kind"];
const ARTIFACT_REF_KEYS = [
  "artifact_id",
  "controlled_store_locator_digest",
  "media_type",
  "sha256",
];
const DEIDENTIFICATION_KEYS = ["mapping_location", "scheme", "scheme_version"];
const SUBJECT_REF_KEYS = ["criterion_id", "gate_id", "subject_type"];
const CRITERION_RESULT_KEYS = [
  "actual_or_measurement_refs",
  "calculation_version",
  "comparator",
  "criterion_id",
  "expected",
  "result",
];
const PARTICIPANT_PATTERN = /^participant_[a-z0-9]{12,64}$/;

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

function requireExactKeys(value, expected, label) {
  requireObject(value, label);
  invariant(
    canonicalDigest(Object.keys(value).sort()) === canonicalDigest([...expected].sort()),
    `${label} must contain exactly: ${[...expected].sort().join(", ")}.`,
  );
}

function requirePattern(value, pattern, label) {
  requireString(value, label);
  invariant(pattern.test(value), `${label} has an invalid format.`);
  return value;
}

function fixedDigestIsCurrent(document, digestField, label) {
  const body = structuredClone(document);
  const actual = body[digestField];
  delete body[digestField];
  requireDigest(actual, `${label}.${digestField}`);
  invariant(actual === canonicalDigest(body), `${label}.${digestField} is stale.`);
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
  invariant(candidate.manifest_kind === "SPEC_OR_EXPERIMENT", "Pre-W1 evidence requires a SPEC_OR_EXPERIMENT candidate.");
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
    label: "Current Evidence input",
  });

  return { specManifest, catalog, protocol, candidateIndex, candidate };
}

function exactOrMissing(input, key, expected) {
  const provided = input[key];
  const placeholder =
    provided === null ||
    (isPlainObject(provided) &&
      Object.keys(provided).length > 0 &&
      Object.values(provided).every((value) => value === null));
  if (provided !== undefined && !placeholder) {
    invariant(
      canonicalDigest(provided) === canonicalDigest(expected),
      `${key} does not match the current repository state.`,
    );
  }
  return expected;
}

function bindCurrentReferences(input, context) {
  const { specManifest, catalog, protocol, candidate } = context;
  const bound = structuredClone(input);
  invariant(
    bound.schema_version === undefined || bound.schema_version === "rolefox.evidence-manifest.v1",
    "Evidence schema_version must be rolefox.evidence-manifest.v1.",
  );
  invariant(
    bound.candidate_artifact_kind === undefined ||
      bound.candidate_artifact_kind === "SPEC_OR_EXPERIMENT",
    "Pre-W1 evidence candidate_artifact_kind must be SPEC_OR_EXPERIMENT.",
  );

  bound.schema_version = "rolefox.evidence-manifest.v1";
  bound.candidate_artifact_kind = "SPEC_OR_EXPERIMENT";
  bound.candidate_artifact_digest = exactOrMissing(
    bound,
    "candidate_artifact_digest",
    candidate.candidate_artifact_digest,
  );
  bound.candidate_scope_manifest_ref = exactOrMissing(
    bound,
    "candidate_scope_manifest_ref",
    {
      candidate_scope_manifest_id: candidate.candidate_scope_manifest_id,
      manifest_digest: candidate.manifest_digest,
    },
  );
  bound.spec_manifest_ref = exactOrMissing(bound, "spec_manifest_ref", {
    manifest_digest: specManifest.manifest_digest,
    normative_set_digest: specManifest.normative_set_digest,
  });
  bound.required_release_scope_catalog_ref = exactOrMissing(
    bound,
    "required_release_scope_catalog_ref",
    { catalog_digest: catalog.catalog_digest },
  );
  bound.research_protocol_ref = exactOrMissing(bound, "research_protocol_ref", {
    protocol_digest: protocol.protocol_digest,
  });
  return bound;
}

function validateEvidenceBody(evidence, protocol) {
  invariant(evidence.schema_version === "rolefox.evidence-manifest.v1", "Unexpected evidence schema_version.");
  invariant(EVIDENCE_KINDS.has(evidence.evidence_kind), "Unknown Pre-W1 evidence_kind.");
  invariant(
    evidence.research_scope_id === EVIDENCE_KINDS.get(evidence.evidence_kind),
    "research_scope_id does not match evidence_kind.",
  );
  invariant(EVIDENCE_TYPES.includes(evidence.evidence_type), "evidence_type is not canonical.");
  invariant(evidence.evidence_type === "USER_RESEARCH", "evidence_type must be USER_RESEARCH.");
  invariant(EVIDENCE_RESULTS.has(evidence.result), "Evidence result must be PASS, FAIL, or INCONCLUSIVE.");
  requirePattern(evidence.run_id, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/, "run_id");
  const startedAt = requireIsoTimestamp(evidence.started_at, "started_at");
  const completedAt = requireIsoTimestamp(evidence.completed_at, "completed_at");
  invariant(completedAt >= startedAt, "Evidence completed_at predates started_at.");
  requireExactKeys(evidence.producer, PRODUCER_KEYS, "producer");
  requireIdentity(evidence.producer.identity, "producer.identity");
  invariant(
    ["CI_WORKLOAD_IDENTITY", "APPROVED_OPERATOR"].includes(
      evidence.producer.identity_kind,
    ),
    "producer.identity_kind is invalid.",
  );
  requireString(evidence.producer.allowlist_version, "producer.allowlist_version");

  const subjectRefs = requireArray(evidence.subject_refs, "subject_refs");
  invariant(subjectRefs.length > 0, "subject_refs must not be empty.");
  const subjectCriteria = new Set();
  for (const reference of subjectRefs) {
    requireExactKeys(reference, SUBJECT_REF_KEYS, "subject reference");
    invariant(reference.subject_type === "GATE_CRITERION", "subject_type must be GATE_CRITERION.");
    invariant(reference.gate_id === "PRE_W1_PROBLEM_RULES", "subject reference gate_id mismatch.");
    requirePattern(reference.criterion_id, /^[a-z][a-z0-9_]{2,127}$/, "subject criterion_id");
    invariant(!subjectCriteria.has(reference.criterion_id), `Duplicate subject criterion ${reference.criterion_id}.`);
    subjectCriteria.add(reference.criterion_id);
  }

  requireArray(evidence.measurements, "measurements");
  const criteria = requireArray(evidence.criterion_results, "criterion_results");
  invariant(criteria.length > 0, "criterion_results must not be empty.");
  const criterionIds = new Set();
  for (const criterion of criteria) {
    requireExactKeys(criterion, CRITERION_RESULT_KEYS, "criterion result");
    requirePattern(criterion.criterion_id, /^[a-z][a-z0-9_]{2,127}$/, "criterion_result.criterion_id");
    invariant(!criterionIds.has(criterion.criterion_id), `Duplicate criterion ${criterion.criterion_id}.`);
    criterionIds.add(criterion.criterion_id);
    invariant(EVIDENCE_RESULTS.has(criterion.result), `Invalid result for ${criterion.criterion_id}.`);
    invariant(
      ["EQ", "GTE", "LTE", "ALL", "FINITE_CATEGORIES", "COMPOSITE"].includes(
        criterion.comparator,
      ),
      `Invalid comparator for ${criterion.criterion_id}.`,
    );
    const measurementRefs = requireArray(
      criterion.actual_or_measurement_refs,
      `criterion ${criterion.criterion_id}.actual_or_measurement_refs`,
    );
    invariant(measurementRefs.length > 0, `criterion ${criterion.criterion_id} needs a measurement reference.`);
    invariant(new Set(measurementRefs).size === measurementRefs.length, `criterion ${criterion.criterion_id} repeats a measurement reference.`);
    measurementRefs.forEach((reference) =>
      requirePattern(reference, /^[a-z][a-z0-9_]{2,127}$/, "measurement reference"),
    );
    requireString(criterion.calculation_version, `criterion ${criterion.criterion_id}.calculation_version`);
    invariant(subjectCriteria.has(criterion.criterion_id), `Criterion ${criterion.criterion_id} lacks a typed subject reference.`);
  }
  if (evidence.result === "PASS") {
    invariant(
      criteria.every((criterion) => criterion.result === "PASS"),
      "PASS evidence contains a non-PASS criterion.",
    );
  } else if (evidence.result === "FAIL") {
    invariant(
      criteria.some((criterion) => criterion.result === "FAIL"),
      "FAIL evidence lacks a failed criterion.",
    );
  } else {
    invariant(
      criteria.some((criterion) => criterion.result === "INCONCLUSIVE"),
      "INCONCLUSIVE evidence lacks an inconclusive criterion.",
    );
  }

  const artifactRefs = requireArray(evidence.artifact_refs, "artifact_refs");
  invariant(artifactRefs.length > 0, "artifact_refs must not be empty.");
  const artifactIds = new Set();
  for (const artifact of artifactRefs) {
    requireExactKeys(artifact, ARTIFACT_REF_KEYS, "artifact reference");
    requirePattern(artifact.artifact_id, /^artifact_[a-z0-9][a-z0-9_-]{2,127}$/, "artifact reference.artifact_id");
    invariant(!artifactIds.has(artifact.artifact_id), `Duplicate artifact ${artifact.artifact_id}.`);
    artifactIds.add(artifact.artifact_id);
    requireDigest(artifact.sha256, "artifact reference.sha256");
    requirePattern(artifact.media_type, /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/, "artifact reference.media_type");
    requireDigest(
      artifact.controlled_store_locator_digest,
      "artifact reference.controlled_store_locator_digest",
    );
  }
  requireExactKeys(evidence.deidentification, DEIDENTIFICATION_KEYS, "deidentification");
  invariant(
    ["RANDOM_COHORT_LOCAL_SURROGATE", "DOMAIN_SEPARATED_HMAC_SURROGATE"].includes(
      evidence.deidentification.scheme,
    ),
    "deidentification.scheme is invalid.",
  );
  requireString(evidence.deidentification.scheme_version, "deidentification.scheme_version");
  invariant(
    evidence.deidentification.mapping_location === "CONTROLLED_ARTIFACT_STORE_ONLY",
    "deidentification.mapping_location must be CONTROLLED_ARTIFACT_STORE_ONLY.",
  );

  validateMeasurement(evidence, protocol);
  validateCriterionContract(evidence, protocol);
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
        expected:
          protocol.rules_replay.pass_criteria.explicit_rejection_reasons_covered,
      },
      {
        criterion_id: "rules_replay_ambiguity_finite",
        comparator: "EQ",
        expected: protocol.rules_replay.pass_criteria.remaining_ambiguity,
      },
    ],
  };
  const expectedCriteria = expectedByKind[evidence.evidence_kind];
  const expectedIds = expectedCriteria.map((criterion) => criterion.criterion_id).sort();
  const subjectIds = evidence.subject_refs.map((reference) => reference.criterion_id).sort();
  const resultIds = evidence.criterion_results.map((criterion) => criterion.criterion_id).sort();
  invariant(
    canonicalDigest(subjectIds) === canonicalDigest(expectedIds),
    "Evidence subject_refs do not equal the frozen criterion set.",
  );
  invariant(
    canonicalDigest(resultIds) === canonicalDigest(expectedIds),
    "Evidence criterion_results do not equal the frozen criterion set.",
  );
  for (const expected of expectedCriteria) {
    const actual = evidence.criterion_results.find(
      (criterion) => criterion.criterion_id === expected.criterion_id,
    );
    invariant(
      actual.comparator === expected.comparator,
      `${expected.criterion_id} comparator mismatch.`,
    );
    invariant(
      canonicalDigest(actual.expected) === canonicalDigest(expected.expected),
      `${expected.criterion_id} expected value is stale.`,
    );
    invariant(
      canonicalDigest(actual.actual_or_measurement_refs) ===
        canonicalDigest([measurementId]),
      `${expected.criterion_id} must reference only ${measurementId}.`,
    );
    invariant(
      actual.calculation_version === evidence.measurements[0].calculation_version,
      `${expected.criterion_id} calculation version differs from its measurement.`,
    );
  }
}

function validateParticipantList(value, label) {
  const participants = requireArray(value, label);
  const seen = new Set();
  for (const participant of participants) {
    requirePattern(participant, PARTICIPANT_PATTERN, `${label} participant`);
    invariant(!seen.has(participant), `${label} repeats ${participant}.`);
    seen.add(participant);
  }
  return participants;
}

function validateMeasurement(evidence, protocol) {
  const measurements = requireArray(evidence.measurements, "measurements");
  invariant(measurements.length === 1, "Evidence must contain exactly one measurement.");
  const measurement = requireObject(measurements[0], "measurement");
  requirePattern(measurement.measurement_id, /^[a-z][a-z0-9_]{2,127}$/, "measurement_id");
  requireString(measurement.calculation_version, "measurement.calculation_version");

  if (evidence.evidence_kind === "PAIN_INTERVIEWS") {
    const allowed = [
      "calculation_version",
      "cohort_denominator",
      "eligibility_and_exclusion_policy_digest",
      "measurement_id",
      "measurement_type",
      "opportunities_per_week_minimum",
      "participant_surrogates",
      "qualified_n",
      ...(measurement.qualified_participant_surrogates === undefined
        ? []
        : ["qualified_participant_surrogates"]),
      "repetitive_work_rank_maximum",
    ];
    requireExactKeys(measurement, allowed, "pain measurement");
    invariant(measurement.measurement_type === "PAIN_THRESHOLD", "Pain measurement_type mismatch.");
    requireInteger(measurement.cohort_denominator, "pain cohort_denominator");
    requireInteger(measurement.qualified_n, "pain qualified_n");
    invariant(measurement.qualified_n <= measurement.cohort_denominator, "pain qualified_n exceeds denominator.");
    invariant(measurement.opportunities_per_week_minimum === 10, "Pain opportunity threshold must be 10.");
    invariant(measurement.repetitive_work_rank_maximum === 3, "Pain repetitive-work rank must be 3.");
    requireDigest(
      measurement.eligibility_and_exclusion_policy_digest,
      "pain eligibility_and_exclusion_policy_digest",
    );
    const participants = validateParticipantList(measurement.participant_surrogates, "pain participant_surrogates");
    invariant(participants.length === measurement.cohort_denominator, "Pain participant count differs from denominator.");
    if (measurement.qualified_participant_surrogates !== undefined) {
      const qualified = validateParticipantList(
        measurement.qualified_participant_surrogates,
        "pain qualified_participant_surrogates",
      );
      invariant(qualified.length === measurement.qualified_n, "Pain qualified participant count differs from qualified_n.");
      invariant(qualified.every((entry) => participants.includes(entry)), "Pain qualified participant is not in the cohort.");
    }
    if (evidence.result === "PASS") {
      invariant(
        measurement.cohort_denominator >= protocol.cohorts.pain_interviews.target_minimum &&
          measurement.cohort_denominator <= protocol.cohorts.pain_interviews.target_maximum,
        "PASS pain evidence has a denominator outside the frozen cohort range.",
      );
      invariant(
        measurement.qualified_n >= protocol.cohorts.pain_interviews.pass_numerator_minimum,
        "PASS pain evidence is below the qualified-participant threshold.",
      );
    }
    return;
  }

  if (evidence.evidence_kind === "TARGET_CHANNEL_FEASIBILITY") {
    requireExactKeys(measurement, [
      "calculation_version",
      "cohort_denominator",
      "eligibility_and_exclusion_policy_digest",
      "eligibility_refs",
      "eligible_n",
      "measurement_id",
      "measurement_type",
      "participant_surrogates",
    ], "channel measurement");
    invariant(measurement.measurement_type === "CHANNEL_ELIGIBILITY", "Channel measurement_type mismatch.");
    requireInteger(measurement.cohort_denominator, "channel cohort_denominator");
    requireInteger(measurement.eligible_n, "channel eligible_n");
    invariant(measurement.eligible_n <= measurement.cohort_denominator, "channel eligible_n exceeds denominator.");
    requireDigest(
      measurement.eligibility_and_exclusion_policy_digest,
      "channel eligibility_and_exclusion_policy_digest",
    );
    const participants = validateParticipantList(measurement.participant_surrogates, "channel participant_surrogates");
    invariant(participants.length === measurement.cohort_denominator, "Channel participant count differs from denominator.");
    const refs = requireArray(measurement.eligibility_refs, "channel eligibility_refs");
    const refParticipants = new Set();
    for (const reference of refs) {
      requireExactKeys(reference, ["observation_digest", "participant_surrogate"], "channel eligibility ref");
      const participant = requirePattern(reference.participant_surrogate, PARTICIPANT_PATTERN, "channel eligibility participant");
      invariant(participants.includes(participant), `Channel eligibility ref ${participant} is outside the denominator.`);
      invariant(!refParticipants.has(participant), `Channel eligibility refs repeat ${participant}.`);
      refParticipants.add(participant);
      requireDigest(reference.observation_digest, "channel eligibility observation_digest");
    }
    invariant(refs.length === measurement.eligible_n, "Channel eligibility refs must exactly cover eligible_n.");
    if (evidence.result === "PASS") {
      invariant(
        measurement.eligible_n >=
          protocol.cohorts.target_channel_feasibility.eligible_n_minimum,
        "PASS channel evidence is below the eligible-participant threshold.",
      );
    }
    return;
  }

  requireExactKeys(measurement, [
    "calculation_version",
    "dataset_frozen",
    "explicit_rejection_reasons_covered",
    "jobs_per_participant",
    "measurement_id",
    "measurement_type",
    "participant_dataset_refs",
    "qualified_participant_n",
    "remaining_ambiguity",
  ], "rules replay measurement");
  invariant(measurement.measurement_type === "RULE_REPLAY", "Rules replay measurement_type mismatch.");
  requireInteger(measurement.qualified_participant_n, "replay qualified_participant_n");
  invariant(measurement.jobs_per_participant === 20, "Rules replay jobs_per_participant must be 20.");
  invariant(typeof measurement.dataset_frozen === "boolean", "Rules replay dataset_frozen must be boolean.");
  invariant(
    ["ALL", "PARTIAL", "NONE", "UNKNOWN"].includes(
      measurement.explicit_rejection_reasons_covered,
    ),
    "Rules replay coverage value is invalid.",
  );
  invariant(
    ["FINITE_EXCEPTION_CATEGORIES", "UNBOUNDED", "UNKNOWN"].includes(
      measurement.remaining_ambiguity,
    ),
    "Rules replay ambiguity value is invalid.",
  );
  const refs = requireArray(measurement.participant_dataset_refs, "replay participant_dataset_refs");
  invariant(refs.length === measurement.qualified_participant_n, "Replay dataset count differs from qualified participant count.");
  const participants = new Set();
  for (const reference of refs) {
    requireExactKeys(reference, ["dataset_digest", "jobs_count", "participant_surrogate"], "replay participant dataset ref");
    const participant = requirePattern(reference.participant_surrogate, PARTICIPANT_PATTERN, "replay participant_surrogate");
    invariant(!participants.has(participant), `Replay dataset refs repeat ${participant}.`);
    participants.add(participant);
    requireDigest(reference.dataset_digest, "replay dataset_digest");
    invariant(reference.jobs_count === 20, "Each replay dataset must contain 20 jobs.");
  }
  if (evidence.result === "PASS") {
    invariant(
      measurement.qualified_participant_n >= protocol.rules_replay.participants_minimum,
      "PASS replay evidence is below the qualified-participant threshold.",
    );
    invariant(measurement.dataset_frozen === true, "PASS replay evidence must use a frozen dataset.");
    invariant(measurement.explicit_rejection_reasons_covered === "ALL", "PASS replay evidence must cover all explicit rejection reasons.");
    invariant(measurement.remaining_ambiguity === "FINITE_EXCEPTION_CATEGORIES", "PASS replay evidence must reduce ambiguity to finite exception categories.");
  }
}

function validateFormalAttestation(evidence) {
  invariant(
    TRUST_VERIFICATION_STATUS === "IMPLEMENTED",
    "Cannot finalize Evidence while cryptographic trust verification is not implemented.",
  );
  const attestation = requireObject(evidence.attestation, "attestation");
  invariant(
    canonicalDigest(Object.keys(attestation).sort()) === canonicalDigest(ATTESTATION_KEYS),
    `attestation must contain exactly: ${ATTESTATION_KEYS.join(", ")}.`,
  );
  invariant(attestation.status === "VERIFIED", "attestation.status must be VERIFIED.");
  requireIdentity(attestation.attested_by, "attestation.attested_by");
  const attestedAt = requireIsoTimestamp(attestation.attested_at, "attestation.attested_at");
  requireDigest(attestation.signed_payload_digest, "attestation.signed_payload_digest");
  requireDigest(attestation.proof_digest, "attestation.proof_digest");
  invariant(
    attestation.signed_payload_digest === evidence.manifest_digest,
    "attestation.signed_payload_digest must equal manifest_digest.",
  );
  invariant(
    attestation.attested_by !== evidence.producer.identity,
    "Evidence producer cannot self-attest.",
  );
  invariant(
    attestedAt >= Date.parse(evidence.completed_at),
    "Evidence attestation predates evidence completion.",
  );
}

function requireCollectionApprovals(context) {
  invariant(
    canonicalDigest(context.protocol.decision_authority) ===
      canonicalDigest(SOLE_MAINTAINER_AUTHORITY),
    "Research protocol decision authority does not match the configured sole maintainer.",
  );
  invariant(context.catalog.status === "ACCEPTED", "Required Release Scope Catalog is not accepted.");
  invariant(context.protocol.status === "APPROVED", "Research protocol is not approved.");
  invariant(context.candidate.approval?.status === "APPROVED", "Current Candidate Scope Manifest is not approved.");
  requireIdentity(context.catalog.review?.reviewed_by, "catalog.review.reviewed_by");
  requireIsoTimestamp(context.catalog.review?.reviewed_at, "catalog.review.reviewed_at");
  requireString(
    context.catalog.review?.approver_role_version,
    "catalog.review.approver_role_version",
  );
  requireSoleMaintainerDecision(
    context.catalog.review.reviewed_by,
    context.catalog.review.approver_role_version,
    "catalog.review",
  );
  for (const [approval, label] of [
    [context.protocol.approval, "protocol.approval"],
    [context.candidate.approval, "candidate.approval"],
  ]) {
    requireIdentity(approval?.approved_by, `${label}.approved_by`);
    requireIsoTimestamp(approval?.approved_at, `${label}.approved_at`);
    requireString(approval?.approver_role_version, `${label}.approver_role_version`);
    requireSoleMaintainerDecision(
      approval.approved_by,
      approval.approver_role_version,
      label,
    );
  }
  const approvalContracts = [
    {
      document: context.catalog,
      envelope: context.catalog.review,
      envelopeField: "review",
      omittedFields: ["catalog_digest"],
      label: "catalog.review",
    },
    {
      document: context.protocol,
      envelope: context.protocol.approval,
      envelopeField: "approval",
      omittedFields: ["protocol_digest"],
      label: "protocol.approval",
    },
    {
      document: context.candidate,
      envelope: context.candidate.approval,
      envelopeField: "approval",
      omittedFields: ["candidate_scope_manifest_id", "manifest_digest"],
      label: "candidate.approval",
    },
  ];
  for (const contract of approvalContracts) {
    const body = structuredClone(contract.document);
    delete body[contract.envelopeField];
    contract.omittedFields.forEach((field) => delete body[field]);
    requireDigest(
      contract.envelope?.signed_payload_digest,
      `${contract.label}.signed_payload_digest`,
    );
    invariant(
      contract.envelope.signed_payload_digest === canonicalDigest(body),
      `${contract.label}.signed_payload_digest does not cover the current approvable body.`,
    );
    requireDigest(
      contract.envelope?.approval_proof_digest,
      `${contract.label}.approval_proof_digest`,
    );
  }
  invariant(
    context.candidate.collection_guard === "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION",
    "Current candidate has not opened approved protocol-bound evidence collection.",
  );
  invariant(
    context.candidateIndex.readiness === "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION",
    "Current candidate pointer is not approved for protocol-bound collection.",
  );
}

function parseArguments(argv) {
  let inputValue;
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
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  invariant(inputValue !== undefined, "Usage: append-evidence.mjs --input <json-file|inline-json|-> [--prepare]");
  return { inputValue, prepare };
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

function prepareEvidence(input, context) {
  requireObject(input, "Evidence input");
  for (const key of Object.keys(input)) {
    invariant(EVIDENCE_KEYS.has(key), `Unknown Evidence field: ${key}`);
  }
  invariant(input.signature === undefined, "Evidence input must not contain a detached signature field.");
  const bound = bindCurrentReferences(input, context);
  const originalId = bound.evidence_id;
  const originalDigest = bound.manifest_digest;
  const originalRecordDigest = bound.record_digest;
  delete bound.evidence_id;
  delete bound.manifest_digest;
  delete bound.record_digest;
  const evidence = addressEvidenceDocument(bound);
  if (originalId !== undefined && originalId !== null) {
    invariant(originalId === evidence.evidence_id, "Supplied evidence_id does not match the canonical evidence body.");
  }
  if (originalDigest !== undefined && originalDigest !== null) {
    invariant(originalDigest === evidence.manifest_digest, "Supplied manifest_digest does not match the canonical evidence body.");
  }
  if (originalRecordDigest !== undefined && originalRecordDigest !== null) {
    invariant(
      originalRecordDigest === evidence.record_digest,
      "Supplied record_digest does not match the final Evidence Manifest.",
    );
  }
  validateEvidenceBody(evidence, context.protocol);
  const protocolTerms = context.protocol.privacy?.forbidden_public_fields ?? [];
  assertNoSensitivePublicData(evidence, "Evidence", protocolTerms);
  validateSchema(root, SCHEMA_NAMES.evidence, evidence, "Prepared Evidence Manifest");
  return evidence;
}

function main() {
  assertSafeRepositoryStorage(root, Object.values(PATHS));
  const argv = process.argv.slice(2);
  if (argv[0] === "--") argv.shift();
  const { inputValue, prepare } = parseArguments(argv);
  const input = readInput(inputValue);

  if (prepare) {
    const context = readCurrentContext();
    const evidence = prepareEvidence(input, context);
    requireCollectionApprovals(context);
    process.stdout.write(`${JSON.stringify({
      schema_version: "rolefox.evidence-attestation-request.v1",
      evidence_id: evidence.evidence_id,
      manifest_digest: evidence.manifest_digest,
      required_signed_payload_digest: evidence.manifest_digest,
    })}\n`);
    return;
  }

  withVerificationLock(root, "append-evidence", () => {
    const context = readCurrentContext();
    requireCollectionApprovals(context);
    const evidence = prepareEvidence(input, context);
    validateFormalAttestation(evidence);

    const filePath = path.join(
      absolute(PATHS.evidenceDirectory),
      `${evidence.evidence_id}.json`,
    );
    const disposition = writeJsonImmutable(filePath, evidence);
    const persisted = readJson(filePath);
    verifyEvidenceDocument(persisted);
    invariant(
      canonicalDigest(persisted) === canonicalDigest(evidence),
      `Persisted evidence bytes do not represent ${evidence.evidence_id}.`,
    );
    validateEvidenceBody(persisted, context.protocol);
    validateFormalAttestation(persisted);
    validateSchema(root, SCHEMA_NAMES.evidence, persisted, "Persisted Evidence Manifest");

    const { checkpoint, disposition: checkpointDisposition } = createCurrentCheckpoint(root);
    process.stdout.write(
      `${disposition === "created" ? "Created" : "Reused"} ${evidence.evidence_id}; ` +
        `${checkpointDisposition === "created" ? "created" : "reused"} checkpoint ${checkpoint.checkpoint_id}.\n`,
    );
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`append-evidence: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
