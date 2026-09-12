import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_SPEC_FILES,
  PATHS,
  PRE_W1_RESEARCH_SCOPE_IDS,
  REQUIRED_RELEASE_SCOPE_IDS,
  SOLE_MAINTAINER_AUTHORITY,
  VERIFICATION_TOOLCHAIN_FILES,
} from "../config.mjs";
import {
  finalizeFoundationApproval,
  parseFoundationArguments,
  prepareFoundationApproval,
  runFoundationApprovalCli,
} from "../approve-foundation.mjs";
import {
  addressDocument,
  canonicalDigest,
  canonicalDigestExcluding,
  digestFileSet,
  readJson,
  sha256,
} from "../lib.mjs";
import { SCHEMA_NAMES, validateSchema } from "../schema.mjs";
import { TRUST_KINDS, canonicalPayloadBytes } from "../trust.mjs";

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const PROOF_DIGESTS = Object.freeze({
  CATALOG_ACCEPTED: "a".repeat(64),
  PROTOCOL_APPROVED: "b".repeat(64),
  CANDIDATE_APPROVED: "c".repeat(64),
});

const DECISION_TIMES = Object.freeze({
  CATALOG_ACCEPTED: "2020-01-01T00:00:00.000Z",
  PROTOCOL_APPROVED: "2020-01-01T00:01:00.000Z",
  CANDIDATE_APPROVED: "2099-01-01T00:00:00.000Z",
});

const absolute = (root, relativePath) =>
  path.join(root, ...relativePath.split("/"));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyRelative(root, relativePath) {
  const source = absolute(sourceRoot, relativePath);
  const destination = absolute(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function pendingSnapshot(
  directory,
  status,
  statusOf = (document) => document.status,
  matches = () => true,
) {
  const match = fs
    .readdirSync(absolute(sourceRoot, directory))
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      name,
      document: readJson(absolute(sourceRoot, `${directory}/${name}`)),
    }))
    .find(
      ({ document }) => statusOf(document) === status && matches(document),
    );
  assert.ok(match, `Missing pending fixture in ${directory}`);
  return match;
}

function bootstrap(root) {
  const result = spawnSync(
    process.execPath,
    [absolute(root, "scripts/verification/bootstrap-pre-w1.mjs")],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function rebuildFoundationProjection(root) {
  // A successful production bootstrap re-verifies checked-in Sigstore bundles.
  // These tests keep trust injected and rebuild only its deterministic outputs,
  // so no proof-shaped fixture can be mistaken for formal evidence.
  const catalog = readJson(absolute(root, PATHS.catalog));
  const protocol = readJson(absolute(root, PATHS.protocol));
  const verificationToolchain = digestFileSet(
    root,
    VERIFICATION_TOOLCHAIN_FILES,
  );
  const inventory = [
    ...ACCEPTED_SPEC_FILES,
    PATHS.catalog,
    PATHS.protocol,
  ].map((relativePath) => {
    const file = digestFileSet(root, [relativePath]).files[0];
    const isCatalog = relativePath === PATHS.catalog;
    const isProtocol = relativePath === PATHS.protocol;
    return {
      ...file,
      authority_status: "ACCEPTED",
      included_in_normative_set: true,
      status_source: isCatalog
        ? catalog.status
        : isProtocol
          ? protocol.status
          : "Pre-W1 normative classification declared by scripts/verification/config.mjs",
      approval_proof_digest: isCatalog
        ? catalog.review.approval_proof_digest
        : isProtocol
          ? protocol.approval.approval_proof_digest
          : null,
    };
  });
  const normativeSet = digestFileSet(
    root,
    inventory.map(({ path: relativePath }) => relativePath),
  );
  const specBody = {
    schema_version: "rolefox.spec-manifest.v1",
    manifest_version: "v0.1-bootstrap-1",
    canonicalization: normativeSet.canonicalization,
    algorithm: normativeSet.algorithm,
    manifest_digest: null,
    normative_set_digest: normativeSet.digest,
    normative_file_count: normativeSet.files.length,
    verification_toolchain: verificationToolchain,
    required_release_scope_catalog_ref: {
      path: PATHS.catalog,
      catalog_digest: catalog.catalog_digest,
      authority_status: "ACCEPTED",
    },
    research_protocol_ref: {
      path: PATHS.protocol,
      protocol_digest: protocol.protocol_digest,
      authority_status: "ACCEPTED",
    },
    inventory,
    generation: {
      tool: "scripts/verification/bootstrap-pre-w1.mjs",
      deterministic_inputs: true,
    },
  };
  const specWithoutDigest = structuredClone(specBody);
  delete specWithoutDigest.manifest_digest;
  const spec = {
    ...specWithoutDigest,
    manifest_digest: canonicalDigest(specWithoutDigest),
  };
  validateSchema(root, SCHEMA_NAMES.specManifest, spec, "test Spec Manifest");
  writeJson(
    absolute(
      root,
      `${PATHS.specManifestSnapshotDirectory}/spec_${spec.manifest_digest}.json`,
    ),
    spec,
  );
  writeJson(absolute(root, PATHS.specManifest), spec);

  const releaseScopeIds = [...REQUIRED_RELEASE_SCOPE_IDS].sort();
  const researchScopeIds = [...PRE_W1_RESEARCH_SCOPE_IDS].sort();
  const candidateArtifactDigest = canonicalDigest({
    kind: "SPEC_OR_EXPERIMENT",
    spec_manifest_digest: spec.manifest_digest,
    normative_set_digest: spec.normative_set_digest,
    catalog_digest: catalog.catalog_digest,
    research_protocol_digest: protocol.protocol_digest,
    verification_toolchain_digest: verificationToolchain.digest,
    release_scope_ids: releaseScopeIds,
    research_scope_ids: researchScopeIds,
  });
  const candidateBody = {
    schema_version: "rolefox.candidate-scope-manifest.v1",
    manifest_kind: "SPEC_OR_EXPERIMENT",
    candidate_scope_manifest_id: null,
    manifest_digest: null,
    created_at: "2030-01-01T00:00:00.000Z",
    candidate_artifact_kind: "SPEC_OR_EXPERIMENT",
    candidate_artifact_digest: candidateArtifactDigest,
    verification_toolchain_ref: { digest: verificationToolchain.digest },
    spec_manifest_ref: {
      path: PATHS.specManifest,
      manifest_digest: spec.manifest_digest,
      normative_set_digest: spec.normative_set_digest,
    },
    required_release_scope_catalog_ref: {
      path: PATHS.catalog,
      catalog_digest: catalog.catalog_digest,
    },
    research_protocol_ref: {
      path: PATHS.protocol,
      protocol_digest: protocol.protocol_digest,
    },
    release_scope_ids: releaseScopeIds,
    research_scope_ids: researchScopeIds,
    software_capabilities_claimed: [],
    cohort_and_criteria_frozen: true,
    approval: {
      status: "PENDING",
      approved_by: null,
      approved_at: null,
      approver_role_version: null,
      approval_proof_digest: null,
      signed_payload_digest: null,
    },
    collection_guard: "BLOCKED_UNTIL_APPROVED",
  };
  candidateBody.approval.signed_payload_digest = canonicalDigestExcluding(
    candidateBody,
    ["candidate_scope_manifest_id", "manifest_digest", "approval"],
  );
  const candidate = addressDocument(candidateBody, {
    prefix: "candidate",
    idField: "candidate_scope_manifest_id",
    digestField: "manifest_digest",
  });
  validateSchema(root, SCHEMA_NAMES.candidate, candidate, "test Candidate");
  const candidatePath =
    `${PATHS.candidateDirectory}/${candidate.candidate_scope_manifest_id}.json`;
  writeJson(absolute(root, candidatePath), candidate);
  writeJson(absolute(root, PATHS.candidateIndex), {
    schema_version: "rolefox.current-candidate-scope.v1",
    candidate_scope_manifest_id: candidate.candidate_scope_manifest_id,
    manifest_digest: candidate.manifest_digest,
    path: candidatePath,
    readiness: "PENDING_PRODUCT_OWNER_APPROVAL",
  });
}

function temporaryFoundationRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rolefox-foundation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const relativePath of new Set([
    ...ACCEPTED_SPEC_FILES,
    ...VERIFICATION_TOOLCHAIN_FILES,
    PATHS.trustPolicy,
  ])) {
    copyRelative(root, relativePath);
  }

  const catalog = pendingSnapshot(
    PATHS.catalogSnapshotDirectory,
    "PROPOSED_PENDING_MAINTAINER_DECISION",
  );
  const protocol = pendingSnapshot(
    PATHS.protocolSnapshotDirectory,
    "DRAFT_PENDING_PRODUCT_OWNER_APPROVAL",
    (document) => document.status,
    (document) =>
      document.decision_authority?.identity ===
      SOLE_MAINTAINER_AUTHORITY.identity,
  );
  writeJson(absolute(root, PATHS.catalog), catalog.document);
  writeJson(absolute(root, PATHS.protocol), protocol.document);

  fs.symlinkSync(
    path.join(sourceRoot, "node_modules"),
    path.join(root, "node_modules"),
  );
  bootstrap(root);
  return root;
}

function trustDouble(overrides = {}) {
  const calls = { verify: [], import: [] };
  const proofDigests = { ...PROOF_DIGESTS, ...overrides.proofDigests };
  const decisionTimes = { ...DECISION_TIMES, ...overrides.decisionTimes };
  return {
    calls,
    dependencies: {
      verifyTrustedProof(root, input) {
        calls.verify.push({ root, input });
        overrides.onVerify?.({ root, input, calls });
        if (overrides.verifyError) throw overrides.verifyError;
        const proofDigest = input.proofDigest ?? proofDigests[input.kind];
        return {
          proofDigest,
          decision: TRUST_KINDS[input.kind],
          decisionAt: decisionTimes[input.kind],
          attestedAt: decisionTimes[input.kind],
          actor:
            overrides.actor ?? SOLE_MAINTAINER_AUTHORITY.identity,
          roleVersion:
            overrides.roleVersion ?? SOLE_MAINTAINER_AUTHORITY.role_version,
          signer: "github-actions:test",
          signatureValue: "test-signature",
          sourceCommit: "1".repeat(40),
          runInvocation: "https://github.com/AnnCYW-cm/rolefox/actions/runs/1",
          anchor: {
            provider: "SIGSTORE_REKOR",
            reference: "rekor:test:1",
            anchoredAt: decisionTimes[input.kind],
          },
          bundleBytes: Buffer.from("test-only verified bundle"),
        };
      },
      importTrustedProof(root, bundlePath, expectedDigest) {
        calls.import.push({ root, bundlePath, expectedDigest });
        if (overrides.importError) throw overrides.importError;
        return {
          proofDigest: expectedDigest,
          path: absolute(
            root,
            `${PATHS.trustProofDirectory}/proof_${expectedDigest}.json`,
          ),
          disposition: "created",
        };
      },
    },
  };
}

function approveAuthorities(root, trust) {
  for (const kind of ["catalog", "protocol"]) {
    const request = prepareFoundationApproval(root, { kind }, trust.dependencies);
    finalizeFoundationApproval(
      root,
      { request, proofBundlePath: `/controlled/${kind}.bundle.json` },
      trust.dependencies,
    );
  }
}

function approvedCatalogFor(request, source, proofDigest, decisionAt) {
  const document = structuredClone(source);
  document.status = "ACCEPTED";
  document.review = {
    signed_payload_digest: request.required_signed_payload_digest,
    reviewed_by: SOLE_MAINTAINER_AUTHORITY.identity,
    reviewed_at: decisionAt,
    approval_proof_digest: proofDigest,
    approver_role_version: SOLE_MAINTAINER_AUTHORITY.role_version,
  };
  const body = structuredClone(document);
  delete body.catalog_digest;
  return { ...body, catalog_digest: canonicalDigest(body) };
}

test("prepare derives target-state payloads without creating half-approved documents", (t) => {
  const root = temporaryFoundationRepository(t);
  const trust = trustDouble();
  const gateBefore = fs.readFileSync(absolute(root, PATHS.gateRegistry), "utf8");

  for (const [kind, currentPath, statusField, exclusions] of [
    ["catalog", PATHS.catalog, "ACCEPTED", ["catalog_digest", "review"]],
    ["protocol", PATHS.protocol, "APPROVED", ["protocol_digest", "approval"]],
  ]) {
    const source = readJson(absolute(root, currentPath));
    const request = prepareFoundationApproval(root, { kind }, trust.dependencies);
    const target = structuredClone(source);
    target.status = statusField;
    const expected = sha256(canonicalPayloadBytes(target, exclusions));
    assert.equal(request.required_signed_payload_digest, expected);
    const sourceDigest =
      kind === "catalog"
        ? source.review.signed_payload_digest
        : source.approval.signed_payload_digest;
    assert.notEqual(request.required_signed_payload_digest, sourceDigest);
    assert.equal(readJson(absolute(root, currentPath)).status, source.status);
    assert.equal(request.source.status, source.status);
    assert.equal(request.bootstrap_required, undefined);
  }

  assert.equal(
    fs.readFileSync(absolute(root, PATHS.gateRegistry), "utf8"),
    gateBefore,
  );
  assert.equal(fs.existsSync(absolute(root, "verification/.append.lock")), false);

  const invalid = readJson(absolute(root, PATHS.catalog));
  invalid.status = "ACCEPTED";
  invalid.review.signed_payload_digest = canonicalDigestExcluding(invalid, [
    "catalog_digest",
    "review",
  ]);
  invalid.review.reviewed_by = SOLE_MAINTAINER_AUTHORITY.identity;
  invalid.review.reviewed_at = DECISION_TIMES.CATALOG_ACCEPTED;
  invalid.review.approver_role_version =
    SOLE_MAINTAINER_AUTHORITY.role_version;
  invalid.review.approval_proof_digest = null;
  const invalidBody = structuredClone(invalid);
  delete invalidBody.catalog_digest;
  invalid.catalog_digest = canonicalDigest(invalidBody);
  assert.throws(
    () => validateSchema(root, SCHEMA_NAMES.catalog, invalid, "half-approved catalog"),
    /approval_proof_digest/,
  );
});

test("prepare rejects a legacy Protocol that does not bind sole-maintainer governance", (t) => {
  const root = temporaryFoundationRepository(t);
  const legacy = pendingSnapshot(
    PATHS.protocolSnapshotDirectory,
    "DRAFT_PENDING_PRODUCT_OWNER_APPROVAL",
    (document) => document.status,
    (document) => document.decision_authority === undefined,
  ).document;
  const legacyPath =
    `${PATHS.protocolSnapshotDirectory}/protocol_${legacy.protocol_digest}.json`;
  writeJson(absolute(root, PATHS.protocol), legacy);
  writeJson(absolute(root, legacyPath), legacy);

  assert.throws(
    () =>
      prepareFoundationApproval(
        root,
        { kind: "protocol" },
        trustDouble().dependencies,
      ),
    /must bind the configured sole-maintainer authority/,
  );
});

test("catalog and protocol finalize into new immutable snapshots and leave bootstrap mandatory", (t) => {
  const root = temporaryFoundationRepository(t);
  const trust = trustDouble();

  for (const [kind, currentPath, digestField, envelopeField, targetStatus] of [
    ["catalog", PATHS.catalog, "catalog_digest", "review", "ACCEPTED"],
    ["protocol", PATHS.protocol, "protocol_digest", "approval", "APPROVED"],
  ]) {
    const request = prepareFoundationApproval(root, { kind }, trust.dependencies);
    const pendingBytes = fs.readFileSync(
      absolute(root, request.source.snapshot_path),
    );
    const result = finalizeFoundationApproval(
      root,
      { request, proofBundlePath: `/controlled/${kind}.bundle.json` },
      trust.dependencies,
    );
    const approved = readJson(absolute(root, currentPath));
    assert.equal(approved.status, targetStatus);
    assert.equal(result.bootstrap_required, true);
    assert.notEqual(approved[digestField], request.source.document_digest);
    assert.equal(
      fs.readFileSync(absolute(root, request.source.snapshot_path)).equals(pendingBytes),
      true,
    );
    assert.deepEqual(
      readJson(absolute(root, result.approved.snapshot_path)),
      approved,
    );
    assert.equal(
      approved[envelopeField].approval_proof_digest,
      PROOF_DIGESTS[result.kind],
    );
    validateSchema(root, result.kind === "CATALOG_ACCEPTED" ? SCHEMA_NAMES.catalog : SCHEMA_NAMES.protocol, approved);
  }

  const catalogVerification = trust.calls.verify.find(
    ({ input }) => input.kind === "CATALOG_ACCEPTED" && input.bundlePath,
  );
  assert.ok(catalogVerification);
  assert.equal(
    sha256(catalogVerification.input.payloadBytes),
    catalogVerification.input.payloadDigest,
  );
  assert.equal(catalogVerification.input.expectedDecision, "ACCEPTED");
  assert.equal(trust.calls.import.length, 2);
  assert.throws(
    () => prepareFoundationApproval(root, { kind: "candidate" }, trust.dependencies),
    /BOOTSTRAP_REQUIRED/,
  );
});

test("a fresh post-approval bootstrap projection produces an approvable Candidate", (t) => {
  const root = temporaryFoundationRepository(t);
  const trust = trustDouble();
  approveAuthorities(root, trust);
  rebuildFoundationProjection(root);

  const request = prepareFoundationApproval(
    root,
    { kind: "candidate" },
    trust.dependencies,
  );
  const pending = readJson(absolute(root, request.source.snapshot_path));
  const target = structuredClone(pending);
  target.collection_guard = "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION";
  const expectedDigest = sha256(
    canonicalPayloadBytes(target, [
      "candidate_scope_manifest_id",
      "manifest_digest",
      "approval",
    ]),
  );
  assert.equal(request.required_signed_payload_digest, expectedDigest);
  assert.equal(request.kind, "CANDIDATE_APPROVED");
});

test("Candidate finalize creates a new addressed manifest, updates only the pointer, and is idempotent", (t) => {
  const root = temporaryFoundationRepository(t);
  const trust = trustDouble();
  approveAuthorities(root, trust);
  rebuildFoundationProjection(root);
  const request = prepareFoundationApproval(
    root,
    { kind: "candidate" },
    trust.dependencies,
  );
  const pendingBytes = fs.readFileSync(absolute(root, request.source.snapshot_path));

  const result = finalizeFoundationApproval(
    root,
    { request, proofBundlePath: "/controlled/candidate.bundle.json" },
    trust.dependencies,
  );
  assert.equal(result.disposition, "created");
  assert.equal(result.bootstrap_required, true);
  assert.notEqual(result.approved.document_id, request.source.document_id);
  assert.equal(
    fs.readFileSync(absolute(root, request.source.snapshot_path)).equals(pendingBytes),
    true,
  );
  const index = readJson(absolute(root, PATHS.candidateIndex));
  assert.equal(index.candidate_scope_manifest_id, result.approved.document_id);
  assert.equal(index.manifest_digest, result.approved.document_digest);
  assert.equal(index.readiness, "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION");
  const approved = readJson(absolute(root, index.path));
  assert.equal(approved.approval.status, "APPROVED");
  assert.equal(
    approved.approval.approval_proof_digest,
    PROOF_DIGESTS.CANDIDATE_APPROVED,
  );
  validateSchema(root, SCHEMA_NAMES.candidate, approved, "approved Candidate");

  const retry = finalizeFoundationApproval(
    root,
    { request, proofBundlePath: "/controlled/candidate.bundle.json" },
    trust.dependencies,
  );
  assert.equal(retry.disposition, "unchanged");
  assert.equal(retry.approved.document_id, result.approved.document_id);

  const replacementTrust = trustDouble({
    proofDigests: { CANDIDATE_APPROVED: "d".repeat(64) },
    decisionTimes: { CANDIDATE_APPROVED: "2099-01-01T00:00:01.000Z" },
  });
  assert.throws(
    () =>
      finalizeFoundationApproval(
        root,
        { request, proofBundlePath: "/controlled/replacement.bundle.json" },
        replacementTrust.dependencies,
      ),
    /STALE_APPROVAL_REQUEST/,
  );
  assert.equal(replacementTrust.calls.import.length, 0);
  assert.deepEqual(readJson(absolute(root, PATHS.candidateIndex)), index);
});

test("trust failure leaves current documents, snapshots, and lock untouched", (t) => {
  const root = temporaryFoundationRepository(t);
  const goodTrust = trustDouble();
  const request = prepareFoundationApproval(
    root,
    { kind: "catalog" },
    goodTrust.dependencies,
  );
  const currentBefore = fs.readFileSync(absolute(root, PATHS.catalog));
  const snapshotsBefore = fs.readdirSync(
    absolute(root, PATHS.catalogSnapshotDirectory),
  );
  const failingTrust = trustDouble({ verifyError: new Error("untrusted bundle") });

  assert.throws(
    () =>
      finalizeFoundationApproval(
        root,
        { request, proofBundlePath: "/controlled/untrusted.bundle.json" },
        failingTrust.dependencies,
      ),
    /untrusted bundle/,
  );
  assert.equal(
    fs.readFileSync(absolute(root, PATHS.catalog)).equals(currentBefore),
    true,
  );
  assert.deepEqual(
    fs.readdirSync(absolute(root, PATHS.catalogSnapshotDirectory)),
    snapshotsBefore,
  );
  assert.equal(failingTrust.calls.import.length, 0);
  assert.equal(fs.existsSync(absolute(root, "verification/.append.lock")), false);
});

test("finalize rejects a stale source after prepare before importing its proof", (t) => {
  const root = temporaryFoundationRepository(t);
  const trust = trustDouble();
  const request = prepareFoundationApproval(root, { kind: "catalog" }, trust.dependencies);
  const changed = readJson(absolute(root, PATHS.catalog));
  changed.catalog_version = `${changed.catalog_version}-changed`;
  changed.review.signed_payload_digest = canonicalDigestExcluding(changed, [
    "catalog_digest",
    "review",
  ]);
  const changedBody = structuredClone(changed);
  delete changedBody.catalog_digest;
  changed.catalog_digest = canonicalDigest(changedBody);
  writeJson(absolute(root, PATHS.catalog), changed);
  writeJson(
    absolute(
      root,
      `${PATHS.catalogSnapshotDirectory}/catalog_${changed.catalog_digest}.json`,
    ),
    changed,
  );

  assert.throws(
    () =>
      finalizeFoundationApproval(
        root,
        { request, proofBundlePath: "/controlled/catalog.bundle.json" },
        trust.dependencies,
      ),
    /STALE_APPROVAL_REQUEST/,
  );
  assert.equal(trust.calls.import.length, 0);
  assert.equal(readJson(absolute(root, PATHS.catalog)).catalog_digest, changed.catalog_digest);
});

test("finalize fails closed when current changes during trust verification", (t) => {
  const root = temporaryFoundationRepository(t);
  const preparationTrust = trustDouble();
  const request = prepareFoundationApproval(
    root,
    { kind: "catalog" },
    preparationTrust.dependencies,
  );
  let concurrentCatalog;
  const racingTrust = trustDouble({
    onVerify: () => {
      concurrentCatalog = readJson(absolute(root, PATHS.catalog));
      concurrentCatalog.catalog_version =
        `${concurrentCatalog.catalog_version}-concurrent`;
      concurrentCatalog.review.signed_payload_digest = canonicalDigestExcluding(
        concurrentCatalog,
        ["catalog_digest", "review"],
      );
      const body = structuredClone(concurrentCatalog);
      delete body.catalog_digest;
      concurrentCatalog.catalog_digest = canonicalDigest(body);
      writeJson(absolute(root, PATHS.catalog), concurrentCatalog);
      writeJson(
        absolute(
          root,
          `${PATHS.catalogSnapshotDirectory}/catalog_${concurrentCatalog.catalog_digest}.json`,
        ),
        concurrentCatalog,
      );
    },
  });

  assert.throws(
    () =>
      finalizeFoundationApproval(
        root,
        { request, proofBundlePath: "/controlled/catalog.bundle.json" },
        racingTrust.dependencies,
      ),
    /STALE_APPROVAL_REQUEST: current foundation state changed during trust verification/,
  );
  assert.equal(racingTrust.calls.import.length, 0);
  assert.equal(
    readJson(absolute(root, PATHS.catalog)).catalog_digest,
    concurrentCatalog.catalog_digest,
  );
});

test("immutable target collisions fail before the mutable current file changes", (t) => {
  const root = temporaryFoundationRepository(t);
  const trust = trustDouble();
  const request = prepareFoundationApproval(root, { kind: "catalog" }, trust.dependencies);
  const source = readJson(absolute(root, request.source.snapshot_path));
  const expected = approvedCatalogFor(
    request,
    source,
    PROOF_DIGESTS.CATALOG_ACCEPTED,
    DECISION_TIMES.CATALOG_ACCEPTED,
  );
  const collisionPath = absolute(
    root,
    `${PATHS.catalogSnapshotDirectory}/catalog_${expected.catalog_digest}.json`,
  );
  writeJson(collisionPath, { collision: true });
  const currentBefore = fs.readFileSync(absolute(root, PATHS.catalog));

  assert.throws(
    () =>
      finalizeFoundationApproval(
        root,
        { request, proofBundlePath: "/controlled/catalog.bundle.json" },
        trust.dependencies,
      ),
    /Immutable document collision or rewrite attempt/,
  );
  assert.equal(
    fs.readFileSync(absolute(root, PATHS.catalog)).equals(currentBefore),
    true,
  );
});

test("CLI contract is strict and emits the same prepare request", (t) => {
  const root = temporaryFoundationRepository(t);
  const trust = trustDouble();
  let output = "";
  const request = runFoundationApprovalCli({
    root,
    argv: ["--prepare", "--kind", "catalog"],
    write: (value) => {
      output += value;
    },
    dependencies: trust.dependencies,
  });
  assert.deepEqual(JSON.parse(output), request);
  assert.equal(request.kind, "CATALOG_ACCEPTED");

  assert.deepEqual(parseFoundationArguments(["--", "--prepare", "--kind", "protocol"]), {
    mode: "prepare",
    kind: "protocol",
    requestPath: undefined,
    proofBundlePath: undefined,
  });
  assert.throws(
    () => parseFoundationArguments(["--finalize", "--kind", "catalog"]),
    /requires --request and --proof-bundle/,
  );
  assert.throws(
    () => parseFoundationArguments(["--prepare", "--kind", "catalog", "--unknown"]),
    /Unknown foundation approval argument/,
  );
});
