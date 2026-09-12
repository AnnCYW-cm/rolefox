import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  addressDocument,
  canonicalDigestExcluding,
  canonicalJson,
  parseJsonLines,
} from "../lib.mjs";
import {
  createCheckpointTrustRequest,
  createCurrentCheckpoint,
  finalizeCheckpointTrustEnvelope,
  loadCheckpointChain,
} from "../checkpoint-lib.mjs";
import {
  SOLE_MAINTAINER_AUTHORITY,
  TRUSTED_WORKLOAD_IDENTITY,
  VERIFICATION_TOOLCHAIN_FILES,
} from "../config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const temporaryRepository = (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rolefox-checkpoint-"));
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
  return temporaryRoot;
};

test("the checked-in checkpoint chain covers the current append-only prefix", () => {
  const checkpoints = loadCheckpointChain(root);
  assert.ok(checkpoints.length >= 1);
  assert.equal(checkpoints[0].sequence, 1);
});

test("checkpoint validation detects a truncated Gate log", (t) => {
  const temporaryRoot = temporaryRepository(t);
  fs.writeFileSync(
    path.join(temporaryRoot, "verification", "gate-evidence-v0.1.jsonl"),
    "",
  );
  assert.throws(() => loadCheckpointChain(temporaryRoot), /truncated/);
});

test("checkpoint validation rejects a changed historical authority snapshot", (t) => {
  const temporaryRoot = temporaryRepository(t);
  const snapshotDirectory = path.join(
    temporaryRoot,
    "verification",
    "spec-manifests",
  );
  const snapshotPath = path.join(
    snapshotDirectory,
    fs.readdirSync(snapshotDirectory).find((name) => name.endsWith(".json")),
  );
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  snapshot.manifest_version = `${snapshot.manifest_version}-tampered`;
  fs.chmodSync(snapshotPath, 0o644);
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  assert.throws(() => loadCheckpointChain(temporaryRoot), /manifest_digest is stale/);
});

test("checkpoint creation rejects a changed verification toolchain", (t) => {
  const temporaryRoot = temporaryRepository(t);
  const verifierPath = path.join(
    temporaryRoot,
    "scripts",
    "verification",
    "privacy.mjs",
  );
  fs.appendFileSync(verifierPath, "\n// tampered\n");
  assert.throws(
    () => createCurrentCheckpoint(temporaryRoot, { force: true }),
    /verification toolchain is stale/,
  );
});

test("checkpoint creation rejects a Gate with a missing Evidence triple", (t) => {
  const temporaryRoot = temporaryRepository(t);
  const registryPath = path.join(
    temporaryRoot,
    "verification",
    "gate-evidence-v0.1.jsonl",
  );
  const [source] = parseJsonLines(registryPath);
  const body = structuredClone(source);
  delete body.record_id;
  delete body.record_digest;
  body.evidence_manifest_refs = [
    {
      evidence_id: `ev_${"a".repeat(64)}`,
      manifest_digest: "a".repeat(64),
      record_digest: "b".repeat(64),
    },
  ];
  body.approval_payload_digest = canonicalDigestExcluding(body, [
    "approval_payload_digest",
    "approval_proof_digest",
  ]);
  const record = addressDocument(body, {
    prefix: "gate",
    idField: "record_id",
    digestField: "record_digest",
  });
  fs.writeFileSync(registryPath, `${canonicalJson(record)}\n`);

  assert.throws(
    () => createCurrentCheckpoint(temporaryRoot, { force: true }),
    /missing or stale Evidence reference/,
  );
});

test("checkpoint prepare freezes the timestamp and finalized root", (t) => {
  const temporaryRoot = temporaryRepository(t);

  const createdAt = "2099-01-01T00:00:00.000Z";
  const request = createCheckpointTrustRequest(temporaryRoot, { createdAt });
  const laterRequest = createCheckpointTrustRequest(temporaryRoot, {
    createdAt: "2099-01-01T00:00:01.000Z",
  });
  assert.equal(request.created_at, createdAt);
  assert.notEqual(request.registry_root_digest, laterRequest.registry_root_digest);

  const proofDigest = "d".repeat(64);
  const { checkpoint } = finalizeCheckpointTrustEnvelope(
    temporaryRoot,
    {
      schema_version: "rolefox.checkpoint-trust-envelope.v1",
      prepare_request: request,
      proof_bundle_path: "/controlled/checkpoint-bundle.json",
    },
    {
      verifyTrustedProof: () => ({
        decision: "VERIFIED",
        actor: SOLE_MAINTAINER_AUTHORITY.identity,
        roleVersion: SOLE_MAINTAINER_AUTHORITY.role_version,
        signer: TRUSTED_WORKLOAD_IDENTITY,
        signatureValue: "test-checkpoint-signature",
        proofDigest,
        anchor: {
          provider: "SIGSTORE_REKOR",
          reference: "rekor:test:1",
          anchoredAt: "2099-01-01T00:00:01.000Z",
        },
      }),
      importTrustedProof: (_root, _path, expectedDigest) => ({
        proofDigest: expectedDigest,
        disposition: "created",
      }),
      verifyCheckpointTrust: () => ({ decision: "VERIFIED" }),
    },
  );
  assert.equal(checkpoint.created_at, createdAt);
  assert.equal(checkpoint.sequence, request.sequence);
  assert.deepEqual(checkpoint.previous, request.previous_checkpoint);
  assert.equal(checkpoint.registry_root_digest, request.registry_root_digest);
});

test("checkpoint finalize rejects a request after the chain advances", (t) => {
  const temporaryRoot = temporaryRepository(t);

  const request = createCheckpointTrustRequest(temporaryRoot, {
    createdAt: "2099-01-01T00:00:00.000Z",
  });
  createCurrentCheckpoint(temporaryRoot, {
    force: true,
    createdAt: "2099-01-01T00:00:01.000Z",
  });
  assert.throws(
    () =>
      finalizeCheckpointTrustEnvelope(temporaryRoot, {
        prepare_request: request,
        proof_bundle_path: "/controlled/checkpoint-bundle.json",
      }),
    /sequence no longer follows/,
  );
});
