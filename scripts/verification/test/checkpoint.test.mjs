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
  sha256,
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

const offlineProofVerifier = (verificationRoot, request) => {
  const proofPath = request.bundlePath ?? path.join(
    verificationRoot,
    "verification",
    "trust-proofs",
    `proof_${request.proofDigest}.json`,
  );
  const bytes = fs.readFileSync(proofPath);
  const proofDigest = sha256(bytes);
  if (request.proofDigest !== undefined) assert.equal(proofDigest, request.proofDigest);
  const bundle = JSON.parse(bytes.toString("utf8"));
  assert.equal(
    bundle.mediaType,
    "application/vnd.dev.sigstore.bundle.v0.3+json",
  );
  const statement = JSON.parse(
    Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"),
  );
  assert.equal(statement.subject?.[0]?.digest?.sha256, request.payloadDigest);
  assert.equal(sha256(request.payloadBytes), request.payloadDigest);
  assert.equal(statement.predicate?.decision?.status, request.expectedDecision);
  const entry = bundle.verificationMaterial.tlogEntries.find(
    (candidate) => /^\d+$/.test(String(candidate.integratedTime)),
  );
  assert.ok(entry);
  const anchoredAt = new Date(Number(entry.integratedTime) * 1000).toISOString();
  return {
    decision: request.expectedDecision,
    decisionAt: statement.predicate.decision.decided_at,
    attestedAt: anchoredAt,
    actor: statement.predicate.decision.actor.identity,
    roleVersion: statement.predicate.decision.actor.role_version,
    signer: TRUSTED_WORKLOAD_IDENTITY,
    signatureValue: bundle.dsseEnvelope.signatures[0].sig,
    proofDigest,
    anchor: {
      provider: "SIGSTORE_REKOR",
      reference: `rekor:test:${entry.logIndex}`,
      anchoredAt,
    },
  };
};

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
  const checkpoints = loadCheckpointChain(root, {
    proofVerifier: offlineProofVerifier,
  });
  assert.ok(checkpoints.length >= 1);
  assert.equal(checkpoints[0].sequence, 1);
});

test("checkpoint validation detects a truncated Gate log", (t) => {
  const temporaryRoot = temporaryRepository(t);
  fs.writeFileSync(
    path.join(temporaryRoot, "verification", "gate-evidence-v0.1.jsonl"),
    "",
  );
  assert.throws(
    () => loadCheckpointChain(temporaryRoot, { proofVerifier: offlineProofVerifier }),
    /truncated/,
  );
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
  assert.throws(
    () => loadCheckpointChain(temporaryRoot, { proofVerifier: offlineProofVerifier }),
    /manifest_digest is stale/,
  );
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
    () => createCurrentCheckpoint(temporaryRoot, {
      force: true,
      proofVerifier: offlineProofVerifier,
    }),
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
    () => createCurrentCheckpoint(temporaryRoot, {
      force: true,
      proofVerifier: offlineProofVerifier,
    }),
    /missing or stale Evidence reference/,
  );
});

test("checkpoint prepare freezes the timestamp and finalized root", (t) => {
  const temporaryRoot = temporaryRepository(t);

  const createdAt = "2099-01-01T00:00:00.000Z";
  const request = createCheckpointTrustRequest(temporaryRoot, {
    createdAt,
    proofVerifier: offlineProofVerifier,
  });
  const laterRequest = createCheckpointTrustRequest(temporaryRoot, {
    createdAt: "2099-01-01T00:00:01.000Z",
    proofVerifier: offlineProofVerifier,
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
      historicalProofVerifier: offlineProofVerifier,
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
    proofVerifier: offlineProofVerifier,
  });
  createCurrentCheckpoint(temporaryRoot, {
    force: true,
    createdAt: "2099-01-01T00:00:01.000Z",
    proofVerifier: offlineProofVerifier,
  });
  assert.throws(
    () =>
      finalizeCheckpointTrustEnvelope(
        temporaryRoot,
        {
          prepare_request: request,
          proof_bundle_path: "/controlled/checkpoint-bundle.json",
        },
        { historicalProofVerifier: offlineProofVerifier },
      ),
    /sequence no longer follows/,
  );
});
