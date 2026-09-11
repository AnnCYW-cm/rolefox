import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_SPEC_FILES,
  VERIFICATION_TOOLCHAIN_FILES,
} from "../config.mjs";
import {
  addressDocument,
  addressEvidenceDocument,
  canonicalDigest,
  canonicalDigestExcluding,
  parseJsonLines,
} from "../lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

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
  const bootstrap = spawnSync(
    process.execPath,
    [path.join(temporaryRoot, "scripts", "verification", "bootstrap-pre-w1.mjs")],
    { cwd: temporaryRoot, encoding: "utf8" },
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
    reviewed_by: "catalog-reviewer",
    reviewed_at: "2099-01-01T00:01:00.000Z",
    approver_role_version: "catalog-reviewer-v1",
    approval_proof_digest: "1".repeat(64),
  });
  catalog.review.signed_payload_digest = canonicalDigestExcluding(catalog, [
    "catalog_digest",
    "review",
  ]);
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
    approved_by: "product-owner",
    approved_at: "2099-01-01T00:02:00.000Z",
    approver_role_version: "product-owner-v1",
    approval_proof_digest: "2".repeat(64),
  });
  protocol.approval.signed_payload_digest = canonicalDigestExcluding(protocol, [
    "protocol_digest",
    "approval",
  ]);
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
    { cwd: temporaryRoot, encoding: "utf8" },
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
    approved_by: "candidate-owner",
    approved_at: "2099-01-01T00:03:00.000Z",
    approver_role_version: "candidate-owner-v1",
    approval_proof_digest: "3".repeat(64),
    signed_payload_digest: null,
  };
  candidate.collection_guard = "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION";
  candidate.approval.signed_payload_digest = canonicalDigestExcluding(candidate, [
    "candidate_scope_manifest_id",
    "manifest_digest",
    "approval",
  ]);
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
      identity: "research-operator",
      identity_kind: "APPROVED_OPERATOR",
      allowlist_version: "pre-w1-operators-v1",
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
  const evidence = addressEvidenceDocument({
    ...pendingEvidence,
    attestation: {
      status: "VERIFIED",
      attested_by: "research-attestor",
      attested_at: "2099-01-01T00:06:00.000Z",
      signed_payload_digest: pendingEvidence.manifest_digest,
      proof_digest: "7".repeat(64),
    },
  });
  writeJson(
    path.join(verification, "evidence-manifests", `${evidence.evidence_id}.json`),
    evidence,
  );
  return evidence;
};

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
  assert.match(result.stdout, /TRUST_VERIFICATION_NOT_IMPLEMENTED/);
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

const inconclusiveReplay = (producerIdentity = "operator-1") => ({
  evidence_type: "USER_RESEARCH",
  evidence_kind: "RULES_REPLAY",
  research_scope_id: "rules_replay",
  producer: {
    identity: producerIdentity,
    identity_kind: "APPROVED_OPERATOR",
    allowlist_version: "pre-w1-operators-v1",
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
  assert.match(result.stderr, /email-like value/);
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
    { cwd: temporaryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Pre-W1 FAIL must reference at least one VERIFIED FAIL evidence manifest/,
  );
  assert.equal(fs.readFileSync(registryPath, "utf8"), registryBefore);
});

test("Gate CLI prepares an evidenced FAIL and finalize fails closed on trust", (t) => {
  const temporaryRoot = temporaryCliRepository(t);
  const evidence = approveFrozenInputsAndWriteFailedEvidence(temporaryRoot);
  const inputPath = path.join(temporaryRoot, "fail-decision.json");
  writeJson(inputPath, {
    result: "FAIL",
    reason_codes: ["RESEARCH_THRESHOLD_NOT_MET"],
    evidence_manifest_refs: [
      {
        evidence_id: evidence.evidence_id,
        manifest_digest: evidence.manifest_digest,
        record_digest: evidence.record_digest,
      },
    ],
    submitted_by: "gate-submitter",
    submitted_at: "2099-01-01T00:07:00.000Z",
    approved_by: "gate-approver",
    approved_at: "2099-01-01T00:08:00.000Z",
    approver_role_version: "pre-w1-gate-approver-v1",
    approval_proof_digest: null,
    decided_at: "2099-01-01T00:08:00.000Z",
  });
  const gateScript = path.join(
    temporaryRoot,
    "scripts",
    "verification",
    "append-gate.mjs",
  );
  const prepare = spawnSync(
    process.execPath,
    [gateScript, "--", "--input", inputPath, "--prepare"],
    { cwd: temporaryRoot, encoding: "utf8" },
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
  writeJson(finalizedPath, {
    ...request.prepared_decision,
    approval_proof_digest: "8".repeat(64),
  });
  const registryPath = path.join(
    temporaryRoot,
    "verification",
    "gate-evidence-v0.1.jsonl",
  );
  const before = fs.readFileSync(registryPath, "utf8");
  const finalize = spawnSync(
    process.execPath,
    [gateScript, "--", "--input", finalizedPath],
    { cwd: temporaryRoot, encoding: "utf8" },
  );
  assert.equal(finalize.status, 1);
  assert.match(
    finalize.stderr,
    /Cannot append FAIL while cryptographic trust verification is not implemented/,
  );
  assert.equal(fs.readFileSync(registryPath, "utf8"), before);
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
    { cwd: temporaryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const head = parseJsonLines(
    path.join(temporaryRoot, "verification", "gate-evidence-v0.1.jsonl"),
  ).at(-1);
  assert.equal(head.result, "BLOCKED");
  assert.equal(head.lifecycle_state, "BLOCKED_NOT_STARTED");
  assert.equal(head.approved_by, null);
});
