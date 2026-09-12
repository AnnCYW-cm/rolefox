import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_SPEC_FILES,
  SOLE_MAINTAINER_AUTHORITY,
  TRUSTED_WORKLOAD_IDENTITY,
  VERIFICATION_TOOLCHAIN_FILES,
} from "../config.mjs";
import {
  addressDocument,
  addressEvidenceDocument,
  canonicalDigest,
  canonicalDigestExcluding,
  canonicalJson,
  parseJsonLines,
  sha256,
} from "../lib.mjs";
import {
  createTrustPredicate,
  loadTrustPolicy,
  subjectNameFor,
} from "../trust.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const commandOptions = (commandRoot, extraEnv = {}) => ({
  cwd: commandRoot,
  encoding: "utf8",
  env: {
    ...process.env,
    PATH: `${path.join(commandRoot, ".test-bin")}${path.delimiter}${process.env.PATH}`,
    ...extraEnv,
  },
});

const installTestGh = (temporaryRoot) => {
  const executable = path.join(temporaryRoot, ".test-bin", "gh");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(
    executable,
    `#!/usr/bin/env node
import fs from "node:fs";
const index = process.argv.indexOf("--bundle");
if (index === -1 || !process.argv[index + 1]) process.exit(2);
const bundlePath = process.argv[index + 1];
const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
if (!bundle.__test_verification_output) process.exit(3);
if (
  process.env.ROLEFOX_TEST_GH_MUTATION &&
  bundle.__test_verification_output?.[0]?.verificationResult?.statement?.predicate?.kind ===
    process.env.ROLEFOX_TEST_GH_MUTATION_KIND
) {
  const mutation = JSON.parse(
    fs.readFileSync(process.env.ROLEFOX_TEST_GH_MUTATION, "utf8"),
  );
  if (mutation.mode === "append") {
    fs.appendFileSync(mutation.path, mutation.contents);
  } else if (mutation.mode === "write") {
    fs.writeFileSync(mutation.path, mutation.contents);
  } else {
    process.exit(4);
  }
}
process.stdout.write(JSON.stringify(bundle.__test_verification_output));
`,
    { mode: 0o755 },
  );
};

const writeTestTrustProof = (
  temporaryRoot,
  { kind, payloadDigest, decisionAt, checkedIn = true },
) => {
  const policy = loadTrustPolicy(temporaryRoot);
  const normalizedDecisionAt = new Date(
    Math.floor(Date.parse(decisionAt) / 1000) * 1000,
  ).toISOString();
  const integratedTime = Math.floor(Date.parse(normalizedDecisionAt) / 1000) + 1;
  const predicate = createTrustPredicate({
    kind,
    payloadDigest,
    decidedAt: normalizedDecisionAt,
    policy,
  });
  const bundle = {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    verificationMaterial: {
      tlogEntries: [
        {
          logId: { keyId: "test-rekor-key" },
          logIndex: integratedTime,
          integratedTime,
        },
      ],
    },
    content: {
      dsseEnvelope: {
        signatures: [{ sig: "dGVzdC1zaWdzdG9yZS1zaWduYXR1cmU=" }],
      },
    },
  };
  bundle.__test_verification_output = [
    {
      verificationResult: {
        statement: {
          _type: "https://in-toto.io/Statement/v1",
          subject: [
            {
              name: subjectNameFor(kind, payloadDigest),
              digest: { sha256: payloadDigest },
            },
          ],
          predicateType: policy.predicate_type,
          predicate,
        },
        signature: {
          certificate: {
            subjectAlternativeName: policy.signer.workflow_uri,
            extensions: {
              issuer: policy.signer.oidc_issuer,
              sourceRepositoryURI: `https://github.com/${policy.repository.name}`,
              sourceRepositoryIdentifier: policy.repository.id,
              sourceRepositoryOwnerIdentifier: policy.repository.owner_id,
              sourceRepositoryRef: policy.repository.source_ref,
              sourceRepositoryDigest: `sha1:${"a".repeat(40)}`,
              sourceRepositoryVisibilityAtSigning: policy.repository.visibility,
              runnerEnvironment: policy.signer.runner_environment,
              buildTrigger: policy.signer.event_name,
              buildConfigURI: policy.signer.workflow_uri,
              runInvocationURI: `https://github.com/${policy.repository.name}/actions/runs/1`,
            },
          },
        },
        verifiedTimestamps: [
          { timestamp: new Date(integratedTime * 1000).toISOString() },
        ],
      },
    },
  ];
  const bytes = Buffer.from(JSON.stringify(bundle));
  const proofDigest = sha256(bytes);
  const proofPath = checkedIn
    ? path.join(
        temporaryRoot,
        "verification",
        "trust-proofs",
        `proof_${proofDigest}.json`,
      )
    : path.join(temporaryRoot, `${kind.toLowerCase()}.bundle.json`);
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, bytes);
  return {
    proofDigest,
    proofPath,
    attestedAt: new Date(integratedTime * 1000).toISOString(),
  };
};

const fixedDigestDocument = (document, digestField) => {
  const body = structuredClone(document);
  delete body[digestField];
  body[digestField] = canonicalDigest(body);
  return body;
};

const temporaryCliRepository = (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rolefox-cli-repo-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.cpSync(path.join(root, "verification"), path.join(temporaryRoot, "verification"), {
    recursive: true,
  });
  for (const relativePath of VERIFICATION_TOOLCHAIN_FILES) {
    if (relativePath.startsWith("verification/")) continue;
    const source = path.join(root, ...relativePath.split("/"));
    const target = path.join(temporaryRoot, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  for (const relativePath of ACCEPTED_SPEC_FILES) {
    const source = path.join(root, ...relativePath.split("/"));
    const target = path.join(temporaryRoot, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(temporaryRoot, "node_modules"));
  installTestGh(temporaryRoot);
  const bootstrap = spawnSync(
    process.execPath,
    [path.join(temporaryRoot, "scripts", "verification", "bootstrap-pre-w1.mjs")],
    commandOptions(temporaryRoot),
  );
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  return temporaryRoot;
};

const approveFrozenInputsAndWriteFailedEvidence = (temporaryRoot) => {
  const verification = path.join(temporaryRoot, "verification");
  const catalogPath = path.join(verification, "required-release-scopes-v0.1.json");
  let catalog = readJson(catalogPath);
  catalog.status = "ACCEPTED";
  Object.assign(catalog.review, {
    reviewed_by: SOLE_MAINTAINER_AUTHORITY.identity,
    reviewed_at: "2099-01-01T00:01:00.000Z",
    approver_role_version: SOLE_MAINTAINER_AUTHORITY.role_version,
    approval_proof_digest: null,
  });
  catalog.review.signed_payload_digest = canonicalDigestExcluding(catalog, [
    "catalog_digest",
    "review",
  ]);
  catalog.review.approval_proof_digest = writeTestTrustProof(temporaryRoot, {
    kind: "CATALOG_ACCEPTED",
    payloadDigest: catalog.review.signed_payload_digest,
    decisionAt: catalog.review.reviewed_at,
  }).proofDigest;
  catalog = fixedDigestDocument(catalog, "catalog_digest");
  writeJson(catalogPath, catalog);
  writeJson(
    path.join(
      verification,
      "release-scope-catalogs",
      `catalog_${catalog.catalog_digest}.json`,
    ),
    catalog,
  );

  const protocolPath = path.join(
    verification,
    "research",
    "pre-w1-protocol-v0.1.json",
  );
  let protocol = readJson(protocolPath);
  protocol.status = "APPROVED";
  Object.assign(protocol.approval, {
    approved_by: SOLE_MAINTAINER_AUTHORITY.identity,
    approved_at: "2099-01-01T00:02:00.000Z",
    approver_role_version: SOLE_MAINTAINER_AUTHORITY.role_version,
    approval_proof_digest: null,
  });
  protocol.approval.signed_payload_digest = canonicalDigestExcluding(protocol, [
    "protocol_digest",
    "approval",
  ]);
  protocol.approval.approval_proof_digest = writeTestTrustProof(temporaryRoot, {
    kind: "PROTOCOL_APPROVED",
    payloadDigest: protocol.approval.signed_payload_digest,
    decisionAt: protocol.approval.approved_at,
  }).proofDigest;
  protocol = fixedDigestDocument(protocol, "protocol_digest");
  writeJson(protocolPath, protocol);
  writeJson(
    path.join(
      verification,
      "research",
      "protocols",
      `protocol_${protocol.protocol_digest}.json`,
    ),
    protocol,
  );

  const rebootstrap = spawnSync(
    process.execPath,
    [path.join(temporaryRoot, "scripts", "verification", "bootstrap-pre-w1.mjs")],
    commandOptions(temporaryRoot),
  );
  assert.equal(rebootstrap.status, 0, rebootstrap.stderr);

  const candidateIndexPath = path.join(
    verification,
    "candidate-scopes",
    "current-pre-w1.json",
  );
  const candidateIndex = readJson(candidateIndexPath);
  let candidate = readJson(path.join(temporaryRoot, ...candidateIndex.path.split("/")));
  candidate.required_release_scope_catalog_ref.catalog_digest = catalog.catalog_digest;
  candidate.research_protocol_ref.protocol_digest = protocol.protocol_digest;
  candidate.candidate_artifact_digest = canonicalDigest({
    kind: "SPEC_OR_EXPERIMENT",
    spec_manifest_digest: candidate.spec_manifest_ref.manifest_digest,
    normative_set_digest: candidate.spec_manifest_ref.normative_set_digest,
    catalog_digest: catalog.catalog_digest,
    research_protocol_digest: protocol.protocol_digest,
    verification_toolchain_digest: candidate.verification_toolchain_ref.digest,
    release_scope_ids: candidate.release_scope_ids,
    research_scope_ids: candidate.research_scope_ids,
  });
  candidate.approval = {
    status: "APPROVED",
    approved_by: SOLE_MAINTAINER_AUTHORITY.identity,
    approved_at: "2099-01-01T00:03:00.000Z",
    approver_role_version: SOLE_MAINTAINER_AUTHORITY.role_version,
    approval_proof_digest: null,
    signed_payload_digest: null,
  };
  candidate.collection_guard = "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION";
  candidate.approval.signed_payload_digest = canonicalDigestExcluding(candidate, [
    "candidate_scope_manifest_id",
    "manifest_digest",
    "approval",
  ]);
  candidate.approval.approval_proof_digest = writeTestTrustProof(temporaryRoot, {
    kind: "CANDIDATE_APPROVED",
    payloadDigest: candidate.approval.signed_payload_digest,
    decisionAt: candidate.approval.approved_at,
  }).proofDigest;
  candidate = addressDocument(candidate, {
    prefix: "candidate",
    idField: "candidate_scope_manifest_id",
    digestField: "manifest_digest",
  });
  const candidatePath = path.join(
    verification,
    "candidate-scopes",
    `${candidate.candidate_scope_manifest_id}.json`,
  );
  writeJson(candidatePath, candidate);
  writeJson(candidateIndexPath, {
    schema_version: "rolefox.current-candidate-scope.v1",
    candidate_scope_manifest_id: candidate.candidate_scope_manifest_id,
    manifest_digest: candidate.manifest_digest,
    path: `verification/candidate-scopes/${candidate.candidate_scope_manifest_id}.json`,
    readiness: "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION",
  });

  const participants = Array.from(
    { length: 6 },
    (_, index) => `participant_${String(index + 1).padStart(12, "0")}`,
  );
  const evidenceBody = {
    schema_version: "rolefox.evidence-manifest.v1",
    evidence_id: null,
    manifest_digest: null,
    record_digest: null,
    evidence_type: "USER_RESEARCH",
    evidence_kind: "PAIN_INTERVIEWS",
    research_scope_id: "pain_interviews",
    producer: {
      identity: "github:AnnCYW-cm",
      identity_kind: "APPROVED_OPERATOR",
      allowlist_version: "rolefox-research-operators-v1",
    },
    attestation: {
      status: "PENDING",
      attested_by: null,
      attested_at: null,
      signed_payload_digest: null,
      proof_digest: null,
    },
    run_id: "pain-run-0001",
    started_at: "2099-01-01T00:04:00.000Z",
    completed_at: "2099-01-01T00:05:00.000Z",
    result: "FAIL",
    candidate_artifact_kind: "SPEC_OR_EXPERIMENT",
    candidate_artifact_digest: candidate.candidate_artifact_digest,
    candidate_scope_manifest_ref: {
      candidate_scope_manifest_id: candidate.candidate_scope_manifest_id,
      manifest_digest: candidate.manifest_digest,
    },
    spec_manifest_ref: {
      manifest_digest: candidate.spec_manifest_ref.manifest_digest,
      normative_set_digest: candidate.spec_manifest_ref.normative_set_digest,
    },
    required_release_scope_catalog_ref: { catalog_digest: catalog.catalog_digest },
    research_protocol_ref: { protocol_digest: protocol.protocol_digest },
    deidentification: {
      scheme: "RANDOM_COHORT_LOCAL_SURROGATE",
      scheme_version: "pre-w1-surrogates-v1",
      mapping_location: "CONTROLLED_ARTIFACT_STORE_ONLY",
    },
    artifact_refs: [
      {
        artifact_id: "artifact_pain_0001",
        controlled_store_locator_digest: "4".repeat(64),
        media_type: "application/json",
        sha256: "5".repeat(64),
      },
    ],
    subject_refs: ["pain_interview_cohort_size", "pain_threshold_qualified_n"].map(
      (criterion_id) => ({
        subject_type: "GATE_CRITERION",
        gate_id: "PRE_W1_PROBLEM_RULES",
        criterion_id,
      }),
    ),
    measurements: [
      {
        measurement_id: "pre_w1_pain_threshold",
        measurement_type: "PAIN_THRESHOLD",
        cohort_denominator: 6,
        qualified_n: 4,
        opportunities_per_week_minimum: 10,
        repetitive_work_rank_maximum: 3,
        participant_surrogates: participants,
        qualified_participant_surrogates: participants.slice(0, 4),
        eligibility_and_exclusion_policy_digest: "6".repeat(64),
        calculation_version: "pre-w1-pain-calculation-v1",
      },
    ],
    criterion_results: [
      {
        criterion_id: "pain_interview_cohort_size",
        comparator: "COMPOSITE",
        expected: { minimum: 6, maximum: 8 },
        actual_or_measurement_refs: ["pre_w1_pain_threshold"],
        result: "PASS",
        calculation_version: "pre-w1-pain-calculation-v1",
      },
      {
        criterion_id: "pain_threshold_qualified_n",
        comparator: "GTE",
        expected: 5,
        actual_or_measurement_refs: ["pre_w1_pain_threshold"],
        result: "FAIL",
        calculation_version: "pre-w1-pain-calculation-v1",
      },
    ],
  };
  const pendingEvidence = addressEvidenceDocument(evidenceBody);
  const evidenceProof = writeTestTrustProof(temporaryRoot, {
    kind: "EVIDENCE_VERIFIED",
    payloadDigest: pendingEvidence.manifest_digest,
    decisionAt: "2099-01-01T00:06:00.000Z",
  });
  const evidence = addressEvidenceDocument({
    ...pendingEvidence,
    attestation: {
      status: "VERIFIED",
      attested_by: TRUSTED_WORKLOAD_IDENTITY,
      attested_at: evidenceProof.attestedAt,
      signed_payload_digest: pendingEvidence.manifest_digest,
      proof_digest: evidenceProof.proofDigest,
    },
  });
  writeJson(
    path.join(verification, "evidence-manifests", `${evidence.evidence_id}.json`),
    evidence,
  );
  return evidence;
};

const failedGateDecision = (evidence, overrides = {}) => ({
  result: "FAIL",
  reason_codes: ["RESEARCH_THRESHOLD_NOT_MET"],
  evidence_manifest_refs: [
    {
      evidence_id: evidence.evidence_id,
      manifest_digest: evidence.manifest_digest,
      record_digest: evidence.record_digest,
    },
  ],
  submitted_by: SOLE_MAINTAINER_AUTHORITY.identity,
  submitted_at: "2099-01-01T00:07:00.000Z",
  approved_by: SOLE_MAINTAINER_AUTHORITY.identity,
  approved_at: "2099-01-01T00:08:00.000Z",
  approver_role_version: SOLE_MAINTAINER_AUTHORITY.role_version,
  approval_proof_digest: null,
  decided_at: "2099-01-01T00:08:00.000Z",
  ...overrides,
});

test("the W1 readiness command fails closed on the checked-in blockers", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "verification", "check-pre-w1.mjs"),
      "--require-pre-w1-pass",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Readiness: BLOCKED_NOT_STARTED/);
  assert.match(result.stdout, /CANDIDATE_SCOPE_APPROVAL_PENDING/);
  assert.doesNotMatch(result.stdout, /TRUST_VERIFICATION_NOT_IMPLEMENTED/);
});

test("documented pnpm separator form prepares a checkpoint without persisting it", () => {
  const checkpointDirectory = path.join(root, "verification", "registry-checkpoints");
  const before = fs.readdirSync(checkpointDirectory).sort();
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "verification", "write-checkpoint.mjs"),
      "--",
      "--prepare-trust-envelope",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const request = JSON.parse(result.stdout);
  assert.equal(request.schema_version, "rolefox.checkpoint-trust-request.v1");
  assert.equal(request.required_signature_payload_digest, request.registry_root_digest);
  assert.deepEqual(fs.readdirSync(checkpointDirectory).sort(), before);
});

test("documented separator form reaches Evidence validation", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "verification", "append-evidence.mjs"),
      "--",
      "--input",
      path.join(
        root,
        "verification",
        "research",
        "templates",
        "pain-interviews.template.json",
      ),
      "--prepare",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown Evidence field: _template_notice/);
  assert.doesNotMatch(result.stderr, /Unknown argument: --/);
});

test("research Evidence templates use canonical kind, scope, and measurement types", () => {
  const contracts = [
    {
      file: "pain-interviews.template.json",
      evidenceKind: "PAIN_INTERVIEWS",
      researchScopeId: "pain_interviews",
      measurementType: "PAIN_THRESHOLD",
    },
    {
      file: "target-channel-feasibility.template.json",
      evidenceKind: "TARGET_CHANNEL_FEASIBILITY",
      researchScopeId: "target_channel_feasibility",
      measurementType: "CHANNEL_ELIGIBILITY",
    },
    {
      file: "rules-replay.template.json",
      evidenceKind: "RULES_REPLAY",
      researchScopeId: "rules_replay",
      measurementType: "RULE_REPLAY",
    },
  ];
  for (const contract of contracts) {
    const template = readJson(
      path.join(root, "verification", "research", "templates", contract.file),
    );
    assert.equal(template.evidence_kind, contract.evidenceKind);
    assert.equal(template.research_scope_id, contract.researchScopeId);
    assert.equal(template.measurements.length, 1);
    assert.equal(
      template.measurements[0].measurement_type,
      contract.measurementType,
    );
  }
});

const inconclusiveReplay = (producerIdentity = "github:AnnCYW-cm") => ({
  evidence_type: "USER_RESEARCH",
  evidence_kind: "RULES_REPLAY",
  research_scope_id: "rules_replay",
  producer: {
    identity: producerIdentity,
    identity_kind: "APPROVED_OPERATOR",
    allowlist_version: "rolefox-research-operators-v1",
  },
  attestation: {
    status: "PENDING",
    attested_by: null,
    attested_at: null,
    signed_payload_digest: null,
    proof_digest: null,
  },
  run_id: "rules-run-0001",
  started_at: "2026-09-11T00:00:00.000Z",
  completed_at: "2026-09-11T00:10:00.000Z",
  result: "INCONCLUSIVE",
  deidentification: {
    scheme: "RANDOM_COHORT_LOCAL_SURROGATE",
    scheme_version: "pre-w1-surrogates-v1",
    mapping_location: "CONTROLLED_ARTIFACT_STORE_ONLY",
  },
  artifact_refs: [
    {
      artifact_id: "artifact_rules_0001",
      controlled_store_locator_digest: "a".repeat(64),
      media_type: "application/json",
      sha256: "b".repeat(64),
    },
  ],
  subject_refs: [
    "rules_replay_participant_and_job_floor",
    "rules_replay_rejection_coverage",
    "rules_replay_ambiguity_finite",
  ].map((criterion_id) => ({
    subject_type: "GATE_CRITERION",
    gate_id: "PRE_W1_PROBLEM_RULES",
    criterion_id,
  })),
  measurements: [
    {
      measurement_id: "pre_w1_rules_replay",
      measurement_type: "RULE_REPLAY",
      qualified_participant_n: 0,
      jobs_per_participant: 20,
      dataset_frozen: false,
      participant_dataset_refs: [],
      explicit_rejection_reasons_covered: "UNKNOWN",
      remaining_ambiguity: "UNKNOWN",
      calculation_version: "pre-w1-rules-calculation-v1",
    },
  ],
  criterion_results: [
    {
      criterion_id: "rules_replay_participant_and_job_floor",
      comparator: "COMPOSITE",
      expected: {
        qualified_participant_n_minimum: 5,
        jobs_per_participant: 20,
        dataset_frozen: true,
      },
      actual_or_measurement_refs: ["pre_w1_rules_replay"],
      result: "INCONCLUSIVE",
      calculation_version: "pre-w1-rules-calculation-v1",
    },
    {
      criterion_id: "rules_replay_rejection_coverage",
      comparator: "EQ",
      expected: "ALL",
      actual_or_measurement_refs: ["pre_w1_rules_replay"],
      result: "INCONCLUSIVE",
      calculation_version: "pre-w1-rules-calculation-v1",
    },
    {
      criterion_id: "rules_replay_ambiguity_finite",
      comparator: "EQ",
      expected: "FINITE_EXCEPTION_CATEGORIES",
      actual_or_measurement_refs: ["pre_w1_rules_replay"],
      result: "INCONCLUSIVE",
      calculation_version: "pre-w1-rules-calculation-v1",
    },
  ],
});

const participantSurrogates = (count, offset = 0) =>
  Array.from(
    { length: count },
    (_, index) =>
      `participant_${String(index + offset + 1).padStart(12, "0")}`,
  );

const passingResearchEvidence = (evidenceKind) => {
  const contracts = {
    PAIN_INTERVIEWS: {
      researchScopeId: "pain_interviews",
      runId: "pain-pass-run-0001",
      artifactId: "artifact_pain_pass_0001",
      subjectIds: [
        "pain_interview_cohort_size",
        "pain_threshold_qualified_n",
      ],
      measurement: {
        measurement_id: "pre_w1_pain_threshold",
        measurement_type: "PAIN_THRESHOLD",
        cohort_denominator: 6,
        qualified_n: 5,
        opportunities_per_week_minimum: 10,
        repetitive_work_rank_maximum: 3,
        participant_surrogates: participantSurrogates(6),
        qualified_participant_surrogates: participantSurrogates(5),
        eligibility_and_exclusion_policy_digest: "c".repeat(64),
        calculation_version: "pre-w1-pain-calculation-v1",
      },
      criterionResults: [
        {
          criterion_id: "pain_interview_cohort_size",
          comparator: "COMPOSITE",
          expected: { minimum: 6, maximum: 8 },
          actual_or_measurement_refs: ["pre_w1_pain_threshold"],
          result: "PASS",
          calculation_version: "pre-w1-pain-calculation-v1",
        },
        {
          criterion_id: "pain_threshold_qualified_n",
          comparator: "GTE",
          expected: 5,
          actual_or_measurement_refs: ["pre_w1_pain_threshold"],
          result: "PASS",
          calculation_version: "pre-w1-pain-calculation-v1",
        },
      ],
    },
    TARGET_CHANNEL_FEASIBILITY: {
      researchScopeId: "target_channel_feasibility",
      runId: "channel-pass-run-0001",
      artifactId: "artifact_channel_pass_0001",
      subjectIds: ["target_channel_eligible_n"],
      measurement: {
        measurement_id: "pre_w1_target_channel_eligibility",
        measurement_type: "CHANNEL_ELIGIBILITY",
        cohort_denominator: 5,
        eligible_n: 5,
        participant_surrogates: participantSurrogates(5, 100),
        eligibility_refs: participantSurrogates(5, 100).map(
          (participant_surrogate, index) => ({
            participant_surrogate,
            observation_digest: String((index % 6) + 4).repeat(64),
          }),
        ),
        eligibility_and_exclusion_policy_digest: "d".repeat(64),
        calculation_version: "pre-w1-channel-calculation-v1",
      },
      criterionResults: [
        {
          criterion_id: "target_channel_eligible_n",
          comparator: "GTE",
          expected: 5,
          actual_or_measurement_refs: [
            "pre_w1_target_channel_eligibility",
          ],
          result: "PASS",
          calculation_version: "pre-w1-channel-calculation-v1",
        },
      ],
    },
    RULES_REPLAY: {
      researchScopeId: "rules_replay",
      runId: "rules-pass-run-0001",
      artifactId: "artifact_rules_pass_0001",
      subjectIds: [
        "rules_replay_participant_and_job_floor",
        "rules_replay_rejection_coverage",
        "rules_replay_ambiguity_finite",
      ],
      measurement: {
        measurement_id: "pre_w1_rules_replay",
        measurement_type: "RULE_REPLAY",
        qualified_participant_n: 5,
        jobs_per_participant: 20,
        dataset_frozen: true,
        participant_dataset_refs: participantSurrogates(5).map(
          (participant_surrogate, index) => ({
            participant_surrogate,
            dataset_digest: String((index % 6) + 4).repeat(64),
            jobs_count: 20,
          }),
        ),
        explicit_rejection_reasons_covered: "ALL",
        remaining_ambiguity: "FINITE_EXCEPTION_CATEGORIES",
        calculation_version: "pre-w1-rules-calculation-v1",
      },
      criterionResults: [
        {
          criterion_id: "rules_replay_participant_and_job_floor",
          comparator: "COMPOSITE",
          expected: {
            qualified_participant_n_minimum: 5,
            jobs_per_participant: 20,
            dataset_frozen: true,
          },
          actual_or_measurement_refs: ["pre_w1_rules_replay"],
          result: "PASS",
          calculation_version: "pre-w1-rules-calculation-v1",
        },
        {
          criterion_id: "rules_replay_rejection_coverage",
          comparator: "EQ",
          expected: "ALL",
          actual_or_measurement_refs: ["pre_w1_rules_replay"],
          result: "PASS",
          calculation_version: "pre-w1-rules-calculation-v1",
        },
        {
          criterion_id: "rules_replay_ambiguity_finite",
          comparator: "EQ",
          expected: "FINITE_EXCEPTION_CATEGORIES",
          actual_or_measurement_refs: ["pre_w1_rules_replay"],
          result: "PASS",
          calculation_version: "pre-w1-rules-calculation-v1",
        },
      ],
    },
  };
  const contract = contracts[evidenceKind];
  assert.ok(contract, `unknown passing Evidence kind: ${evidenceKind}`);
  return {
    evidence_type: "USER_RESEARCH",
    evidence_kind: evidenceKind,
    research_scope_id: contract.researchScopeId,
    producer: {
      identity: "github:AnnCYW-cm",
      identity_kind: "APPROVED_OPERATOR",
      allowlist_version: "rolefox-research-operators-v1",
    },
    attestation: {
      status: "PENDING",
      attested_by: null,
      attested_at: null,
      signed_payload_digest: null,
      proof_digest: null,
    },
    run_id: contract.runId,
    started_at: "2099-01-01T00:04:00.000Z",
    completed_at: "2099-01-01T00:05:00.000Z",
    result: "PASS",
    deidentification: {
      scheme: "RANDOM_COHORT_LOCAL_SURROGATE",
      scheme_version: "pre-w1-surrogates-v1",
      mapping_location: "CONTROLLED_ARTIFACT_STORE_ONLY",
    },
    artifact_refs: [
      {
        artifact_id: contract.artifactId,
        controlled_store_locator_digest: "a".repeat(64),
        media_type: "application/json",
        sha256: "b".repeat(64),
      },
    ],
    subject_refs: contract.subjectIds.map((criterion_id) => ({
      subject_type: "GATE_CRITERION",
      gate_id: "PRE_W1_PROBLEM_RULES",
      criterion_id,
    })),
    measurements: [contract.measurement],
    criterion_results: contract.criterionResults,
  };
};

for (const evidenceKind of [
  "PAIN_INTERVIEWS",
  "TARGET_CHANNEL_FEASIBILITY",
  "RULES_REPLAY",
]) {
  test(`Evidence prepare accepts a pending-attestation PASS ${evidenceKind}`, (t) => {
    const temporaryRoot = temporaryCliRepository(t);
    approveFrozenInputsAndWriteFailedEvidence(temporaryRoot);
    const inputPath = path.join(
      temporaryRoot,
      `${evidenceKind.toLowerCase()}-pass-evidence.json`,
    );
    writeJson(inputPath, passingResearchEvidence(evidenceKind));
    const evidenceDirectory = path.join(
      temporaryRoot,
      "verification",
      "evidence-manifests",
    );
    const before = fs.readdirSync(evidenceDirectory).sort();
    const result = spawnSync(
      process.execPath,
      [
        path.join(
          temporaryRoot,
          "scripts",
          "verification",
          "append-evidence.mjs",
        ),
        "--",
        "--input",
        inputPath,
        "--prepare",
      ],
      commandOptions(temporaryRoot),
    );
    assert.equal(result.status, 0, result.stderr);
    const request = JSON.parse(result.stdout);
    assert.equal(
      request.schema_version,
      "rolefox.evidence-attestation-request.v1",
    );
    assert.match(request.evidence_id, /^ev_[0-9a-f]{64}$/);
    assert.equal(request.manifest_digest, request.required_signed_payload_digest);
    assert.deepEqual(fs.readdirSync(evidenceDirectory).sort(), before);
  });
}

test("Evidence finalize refuses to persist without a valid proof bundle", (t) => {
  const temporaryRoot = temporaryCliRepository(t);
  approveFrozenInputsAndWriteFailedEvidence(temporaryRoot);
  const inputPath = path.join(temporaryRoot, "pending-pass-evidence.json");
  writeJson(inputPath, passingResearchEvidence("PAIN_INTERVIEWS"));
  const evidenceDirectory = path.join(
    temporaryRoot,
    "verification",
    "evidence-manifests",
  );
  const before = fs.readdirSync(evidenceDirectory).sort();
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        temporaryRoot,
        "scripts",
        "verification",
        "append-evidence.mjs",
      ),
      "--",
      "--input",
      inputPath,
      "--proof-bundle",
      path.join(temporaryRoot, "missing-evidence.bundle.json"),
    ],
    commandOptions(temporaryRoot),
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT|no such file or directory/i);
  assert.deepEqual(fs.readdirSync(evidenceDirectory).sort(), before);
});

test("Evidence finalize fails closed when its approval context changes during trust verification", (t) => {
  const temporaryRoot = temporaryCliRepository(t);
  approveFrozenInputsAndWriteFailedEvidence(temporaryRoot);
  const inputPath = path.join(temporaryRoot, "pending-racy-evidence.json");
  writeJson(inputPath, passingResearchEvidence("PAIN_INTERVIEWS"));
  const evidenceScript = path.join(
    temporaryRoot,
    "scripts",
    "verification",
    "append-evidence.mjs",
  );
  const prepare = spawnSync(
    process.execPath,
    [evidenceScript, "--", "--input", inputPath, "--prepare"],
    commandOptions(temporaryRoot),
  );
  assert.equal(prepare.status, 0, prepare.stderr);
  const request = JSON.parse(prepare.stdout);
  const candidateIndexPath = path.join(
    temporaryRoot,
    "verification",
    "candidate-scopes",
    "current-pre-w1.json",
  );
  const changedIndex = readJson(candidateIndexPath);
  changedIndex.readiness = "PENDING_PRODUCT_OWNER_APPROVAL";
  const mutationPath = path.join(temporaryRoot, "evidence-race-mutation.json");
  writeJson(mutationPath, {
    mode: "write",
    path: candidateIndexPath,
    contents: `${JSON.stringify(changedIndex, null, 2)}\n`,
  });
  const proof = writeTestTrustProof(temporaryRoot, {
    kind: "EVIDENCE_VERIFIED",
    payloadDigest: request.required_signed_payload_digest,
    decisionAt: "2099-01-01T00:06:00.000Z",
    checkedIn: false,
  });
  const evidenceDirectory = path.join(
    temporaryRoot,
    "verification",
    "evidence-manifests",
  );
  const before = fs.readdirSync(evidenceDirectory).sort();
  const result = spawnSync(
    process.execPath,
    [
      evidenceScript,
      "--",
      "--input",
      inputPath,
      "--proof-bundle",
      proof.proofPath,
    ],
    commandOptions(temporaryRoot, {
      ROLEFOX_TEST_GH_MUTATION: mutationPath,
      ROLEFOX_TEST_GH_MUTATION_KIND: "EVIDENCE_VERIFIED",
    }),
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /candidate pointer is not approved|STALE_VERIFICATION_STATE/i,
  );
  assert.deepEqual(fs.readdirSync(evidenceDirectory).sort(), before);
  assert.equal(
    fs.existsSync(
      path.join(
        temporaryRoot,
        "verification",
        "trust-proofs",
        `proof_${proof.proofDigest}.json`,
      ),
    ),
    false,
  );
});

test("Evidence prepare refuses collection before frozen inputs are approved", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rolefox-cli-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "replay.json");
  fs.writeFileSync(inputPath, `${JSON.stringify(inconclusiveReplay())}\n`);
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "verification", "append-evidence.mjs"),
      "--",
      "--input",
      inputPath,
      "--prepare",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required Release Scope Catalog is not accepted/i);
});

test("Evidence prepare rejects an email-like producer identity before writing", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rolefox-cli-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "replay-with-pii.json");
  fs.writeFileSync(
    inputPath,
    `${JSON.stringify(inconclusiveReplay("person@example.com"))}\n`,
  );
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "verification", "append-evidence.mjs"),
      "--",
      "--input",
      inputPath,
      "--prepare",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /email-like value|not present in the versioned trust-policy allowlist/,
  );
});

test("Gate CLI rejects an unevidenced FAIL without appending it", (t) => {
  const temporaryRoot = temporaryCliRepository(t);
  const inputPath = path.join(temporaryRoot, "fail-decision.json");
  const registryPath = path.join(
    temporaryRoot,
    "verification",
    "gate-evidence-v0.1.jsonl",
  );
  const registryBefore = fs.readFileSync(registryPath, "utf8");
  fs.writeFileSync(
    inputPath,
    `${JSON.stringify({
      result: "FAIL",
      reason_codes: ["RESEARCH_THRESHOLD_NOT_MET"],
      submitted_by: "ci-workload-test",
    })}\n`,
  );
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        temporaryRoot,
        "scripts",
        "verification",
        "append-gate.mjs",
      ),
      "--",
      "--input",
      inputPath,
    ],
    commandOptions(temporaryRoot),
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Pre-W1 FAIL must reference at least one VERIFIED FAIL evidence manifest/,
  );
  assert.equal(fs.readFileSync(registryPath, "utf8"), registryBefore);
});

test("Gate CLI requires a verified proof bundle and accepts a later signed decision time", (t) => {
  const temporaryRoot = temporaryCliRepository(t);
  const evidence = approveFrozenInputsAndWriteFailedEvidence(temporaryRoot);
  const inputPath = path.join(temporaryRoot, "fail-decision.json");
  writeJson(inputPath, failedGateDecision(evidence));
  const gateScript = path.join(
    temporaryRoot,
    "scripts",
    "verification",
    "append-gate.mjs",
  );
  const prepare = spawnSync(
    process.execPath,
    [gateScript, "--", "--input", inputPath, "--prepare"],
    commandOptions(temporaryRoot),
  );
  assert.equal(prepare.status, 0, prepare.stderr);
  const request = JSON.parse(prepare.stdout);
  assert.equal(request.schema_version, "rolefox.gate-approval-request.v1");
  assert.equal(request.prepared_decision.result, "FAIL");
  assert.equal(request.prepared_decision.lifecycle_state, "DECIDED");
  assert.equal(request.prepared_decision.approval_proof_digest, null);
  assert.equal(
    request.required_approval_payload_digest,
    request.prepared_decision.approval_payload_digest,
  );

  const finalizedPath = path.join(temporaryRoot, "finalized-fail-decision.json");
  writeJson(finalizedPath, request.prepared_decision);
  const registryPath = path.join(
    temporaryRoot,
    "verification",
    "gate-evidence-v0.1.jsonl",
  );
  const before = fs.readFileSync(registryPath, "utf8");
  const finalize = spawnSync(
    process.execPath,
    [gateScript, "--", "--input", finalizedPath],
    commandOptions(temporaryRoot),
  );
  assert.equal(finalize.status, 1);
  assert.match(
    finalize.stderr,
    /Appending FAIL requires --proof-bundle/,
  );
  assert.equal(fs.readFileSync(registryPath, "utf8"), before);

  const proof = writeTestTrustProof(temporaryRoot, {
    kind: "GATE_FAIL",
    payloadDigest: request.required_approval_payload_digest,
    decisionAt: "2099-01-01T00:09:00.000Z",
    checkedIn: false,
  });
  const accepted = spawnSync(
    process.execPath,
    [
      gateScript,
      "--",
      "--input",
      finalizedPath,
      "--proof-bundle",
      proof.proofPath,
    ],
    commandOptions(temporaryRoot),
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  const head = parseJsonLines(registryPath).at(-1);
  assert.equal(head.result, "FAIL");
  assert.equal(head.approval_proof_digest, proof.proofDigest);
});

test("Gate finalize fails closed when the registry head changes during trust verification", (t) => {
  const temporaryRoot = temporaryCliRepository(t);
  const evidence = approveFrozenInputsAndWriteFailedEvidence(temporaryRoot);
  const inputPath = path.join(temporaryRoot, "racy-fail-decision.json");
  writeJson(inputPath, failedGateDecision(evidence));
  const gateScript = path.join(
    temporaryRoot,
    "scripts",
    "verification",
    "append-gate.mjs",
  );
  const prepare = spawnSync(
    process.execPath,
    [gateScript, "--", "--input", inputPath, "--prepare"],
    commandOptions(temporaryRoot),
  );
  assert.equal(prepare.status, 0, prepare.stderr);
  const request = JSON.parse(prepare.stdout);
  const finalizedPath = path.join(temporaryRoot, "racy-finalized-fail.json");
  writeJson(finalizedPath, request.prepared_decision);
  const registryPath = path.join(
    temporaryRoot,
    "verification",
    "gate-evidence-v0.1.jsonl",
  );
  const records = parseJsonLines(registryPath);
  const currentHead = records.at(-1);
  const concurrentBody = structuredClone(currentHead);
  delete concurrentBody.record_id;
  delete concurrentBody.record_digest;
  concurrentBody.previous = {
    record_id: currentHead.record_id,
    record_digest: currentHead.record_digest,
  };
  concurrentBody.result = "BLOCKED";
  concurrentBody.lifecycle_state = "BLOCKED_NOT_STARTED";
  concurrentBody.reason_codes = ["CONCURRENT_TEST_UPDATE"];
  concurrentBody.evidence_manifest_refs = [];
  concurrentBody.submitted_by = "rolefox-concurrent-test";
  concurrentBody.submitted_at = "2099-01-01T00:08:30.000Z";
  concurrentBody.decided_at = "2099-01-01T00:08:30.000Z";
  concurrentBody.approved_by = null;
  concurrentBody.approved_at = null;
  concurrentBody.approver_role_version = null;
  concurrentBody.approval_proof_digest = null;
  concurrentBody.approval_payload_digest = canonicalDigestExcluding(
    concurrentBody,
    [
      "record_id",
      "record_digest",
      "approval_payload_digest",
      "approval_proof_digest",
    ],
  );
  const concurrentRecord = addressDocument(concurrentBody, {
    prefix: "gate",
    idField: "record_id",
    digestField: "record_digest",
  });
  const mutationPath = path.join(temporaryRoot, "gate-race-mutation.json");
  writeJson(mutationPath, {
    mode: "append",
    path: registryPath,
    contents: `${canonicalJson(concurrentRecord)}\n`,
  });
  const proof = writeTestTrustProof(temporaryRoot, {
    kind: "GATE_FAIL",
    payloadDigest: request.required_approval_payload_digest,
    decisionAt: "2099-01-01T00:09:00.000Z",
    checkedIn: false,
  });
  const result = spawnSync(
    process.execPath,
    [
      gateScript,
      "--",
      "--input",
      finalizedPath,
      "--proof-bundle",
      proof.proofPath,
    ],
    commandOptions(temporaryRoot, {
      ROLEFOX_TEST_GH_MUTATION: mutationPath,
      ROLEFOX_TEST_GH_MUTATION_KIND: "GATE_FAIL",
    }),
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /STALE_VERIFICATION_STATE: Gate inputs changed during trust verification/,
  );
  const persistedRecords = parseJsonLines(registryPath);
  assert.equal(persistedRecords.length, records.length + 1);
  assert.equal(persistedRecords.at(-1).record_id, concurrentRecord.record_id);
  assert.equal(
    fs.existsSync(
      path.join(
        temporaryRoot,
        "verification",
        "trust-proofs",
        `proof_${proof.proofDigest}.json`,
      ),
    ),
    false,
  );
});

test("Gate CLI rejects a non-maintainer identity and an unapproved maintainer role", (t) => {
  const temporaryRoot = temporaryCliRepository(t);
  const evidence = approveFrozenInputsAndWriteFailedEvidence(temporaryRoot);
  const inputPath = path.join(temporaryRoot, "invalid-maintainer-decision.json");
  const gateScript = path.join(
    temporaryRoot,
    "scripts",
    "verification",
    "append-gate.mjs",
  );
  const registryPath = path.join(
    temporaryRoot,
    "verification",
    "gate-evidence-v0.1.jsonl",
  );
  const registryBefore = fs.readFileSync(registryPath, "utf8");

  writeJson(
    inputPath,
    failedGateDecision(evidence, { approved_by: "github:not-the-maintainer" }),
  );
  const wrongIdentity = spawnSync(
    process.execPath,
    [gateScript, "--", "--input", inputPath, "--prepare"],
    commandOptions(temporaryRoot),
  );
  assert.equal(wrongIdentity.status, 1);
  assert.match(
    wrongIdentity.stderr,
    /Gate decision must use the configured sole-maintainer identity/,
  );

  writeJson(
    inputPath,
    failedGateDecision(evidence, { approver_role_version: "unapproved-role-v1" }),
  );
  const wrongRole = spawnSync(
    process.execPath,
    [gateScript, "--", "--input", inputPath, "--prepare"],
    commandOptions(temporaryRoot),
  );
  assert.equal(wrongRole.status, 1);
  assert.match(
    wrongRole.stderr,
    /Gate decision must use the configured sole-maintainer role version/,
  );
  assert.equal(fs.readFileSync(registryPath, "utf8"), registryBefore);
});

test("Gate CLI still appends BLOCKED as BLOCKED_NOT_STARTED without approval", (t) => {
  const temporaryRoot = temporaryCliRepository(t);
  const inputPath = path.join(temporaryRoot, "blocked-decision.json");
  writeJson(inputPath, {
    result: "BLOCKED",
    reason_codes: ["RESEARCH_NOT_STARTED"],
    submitted_by: "ci-workload-test",
  });
  const result = spawnSync(
    process.execPath,
    [
      path.join(temporaryRoot, "scripts", "verification", "append-gate.mjs"),
      "--",
      "--input",
      inputPath,
    ],
    commandOptions(temporaryRoot),
  );
  assert.equal(result.status, 0, result.stderr);
  const head = parseJsonLines(
    path.join(temporaryRoot, "verification", "gate-evidence-v0.1.jsonl"),
  ).at(-1);
  assert.equal(head.result, "BLOCKED");
  assert.equal(head.lifecycle_state, "BLOCKED_NOT_STARTED");
  assert.equal(head.approved_by, null);
});
