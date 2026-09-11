import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  addressDocument,
  addressEvidenceDocument,
  assertSafeRepositoryStorage,
  canonicalDigest,
  canonicalDigestExcluding,
  canonicalJson,
  digestFileMetadataSet,
  digestFileSet,
  validateGateChains,
  verifyEvidenceDocument,
  withVerificationLock,
  writeJsonImmutable,
} from "../lib.mjs";
import { assertNoSensitivePublicData } from "../privacy.mjs";

const temporaryDirectory = (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rolefox-verification-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
};

const gateRecord = ({ previous = null, scopeId = "scope", result = "BLOCKED" } = {}) => {
  const body = {
      schema_version: "rolefox.gate-evidence-record.v1",
      record_id: null,
      record_digest: null,
      gate_id: "PRE_W1_PROBLEM_RULES",
      scope_id: scopeId,
      previous,
      criteria_version: "pre-w1-v0.1",
      criterion_refs: ["criterion"],
      result,
      lifecycle_state: ["PASS", "FAIL"].includes(result)
        ? "DECIDED"
        : "BLOCKED_NOT_STARTED",
      candidate_artifact_kind: "SPEC_OR_EXPERIMENT",
      candidate_artifact_digest: "a".repeat(64),
      verification_toolchain_digest: "b".repeat(64),
      evidence_manifest_refs: [],
      runtime_binding_manifest_refs: [],
      submitted_at: "2026-09-11T00:00:00.000Z",
      decided_at: "2026-09-11T00:00:00.000Z",
      submitted_by: "test-producer",
      approval_payload_digest: null,
      approval_proof_digest: null,
    };
  body.approval_payload_digest = canonicalDigestExcluding(body, [
    "record_id",
    "record_digest",
    "approval_payload_digest",
    "approval_proof_digest",
  ]);
  return addressDocument(
    body,
    { prefix: "gate", idField: "record_id", digestField: "record_digest" },
  );
};

test("canonical JSON is insertion-order independent and rejects lone surrogates", () => {
  assert.equal(canonicalJson({ z: 1, a: 2 }), canonicalJson({ a: 2, z: 1 }));
  assert.equal(canonicalDigest({ z: 1, a: 2 }), canonicalDigest({ a: 2, z: 1 }));
  assert.throws(() => canonicalJson({ ["\ud800"]: 1 }), /unpaired high surrogate/);
  assert.throws(() => canonicalJson("\udc00"), /unpaired low surrogate/);
});

test("file-set digest normalizes LF and rejects invalid UTF-8", (t) => {
  const root = temporaryDirectory(t);
  fs.writeFileSync(path.join(root, "lf.md"), "a\nb\n");
  fs.writeFileSync(path.join(root, "crlf.md"), "a\r\nb\r\n");
  const lfSet = digestFileSet(root, ["lf.md"]);
  const lf = lfSet.files[0].sha256;
  const crlf = digestFileSet(root, ["crlf.md"]).files[0].sha256;
  assert.equal(lf, crlf);
  assert.equal(lfSet.digest, digestFileMetadataSet(lfSet.files));

  fs.writeFileSync(path.join(root, "invalid.md"), Buffer.from([0xc3, 0x28]));
  assert.throws(() => digestFileSet(root, ["invalid.md"]), /not valid UTF-8/);
  assert.throws(() => digestFileSet(root, ["../outside.md"]), /Unsafe/);
  assert.throws(() => digestFileSet(root, ["nested\\file.md"]), /POSIX separators/);
});

test("evidence uses a full digest and excludes only the top-level attestation envelope", (t) => {
  const body = {
    schema_version: "rolefox.evidence-manifest.v1",
    evidence_id: null,
    manifest_digest: null,
    evidence_type: "USER_RESEARCH",
    result: "PASS",
    producer: { identity: "operator-1" },
    attestation: { status: "PENDING" },
  };
  const first = addressEvidenceDocument(body);
  const second = addressEvidenceDocument({
    ...body,
    attestation: {
      status: "VERIFIED",
      signed_payload_digest: first.manifest_digest,
    },
  });
  assert.equal(first.evidence_id, `ev_${first.manifest_digest}`);
  assert.equal(first.evidence_id.length, 67);
  assert.equal(first.manifest_digest, second.manifest_digest);
  assert.notEqual(first.record_digest, second.record_digest);
  verifyEvidenceDocument(second);
  const tampered = structuredClone(second);
  tampered.attestation.status = "INVALID";
  assert.throws(() => verifyEvidenceDocument(tampered), /record_digest/);

  const directory = temporaryDirectory(t);
  const file = path.join(directory, `${first.evidence_id}.json`);
  assert.equal(writeJsonImmutable(file, first), "created");
  assert.equal(writeJsonImmutable(file, first), "unchanged");
  assert.throws(() => writeJsonImmutable(file, second), /rewrite attempt/);
});

test("gate chains require ordered parents and reject forks", () => {
  const genesis = gateRecord();
  const previous = {
    record_id: genesis.record_id,
    record_digest: genesis.record_digest,
  };
  const child = gateRecord({ previous, result: "PASS" });
  assert.equal(validateGateChains([genesis, child])[0].record_id, child.record_id);
  assert.throws(() => validateGateChains([child, genesis]), /must precede/);

  const sibling = gateRecord({ previous, result: "FAIL" });
  assert.equal(sibling.lifecycle_state, "DECIDED");
  assert.throws(() => validateGateChains([genesis, child, sibling]), /Forked/);

  const missingFields = addressDocument(
    {
      schema_version: "rolefox.gate-evidence-record.v1",
      record_id: null,
      record_digest: null,
      previous: null,
      result: "BLOCKED",
      evidence_manifest_refs: [],
      runtime_binding_manifest_refs: [],
      submitted_at: "2026-09-11T00:00:00.000Z",
      decided_at: "2026-09-11T00:00:00.000Z",
      approval_payload_digest: "a".repeat(64),
    },
    { prefix: "gate", idField: "record_id", digestField: "record_digest" },
  );
  assert.throws(() => validateGateChains([missingFields]), /gate_id/);
});

test("the shared verification lock serializes registry mutations and is released", (t) => {
  const root = temporaryDirectory(t);
  assert.equal(
    withVerificationLock(root, "outer-test", () => {
      assert.throws(
        () => withVerificationLock(root, "inner-test", () => undefined),
        /lock already exists/,
      );
      return "done";
    }),
    "done",
  );
  assert.equal(fs.existsSync(path.join(root, "verification", ".append.lock")), false);
});

test("repository storage rejects symlinked registry paths and file-set inputs", (t) => {
  const root = temporaryDirectory(t);
  const outside = temporaryDirectory(t);
  fs.mkdirSync(path.join(root, "verification"));
  fs.symlinkSync(outside, path.join(root, "verification", "evidence-manifests"));
  assert.throws(
    () =>
      assertSafeRepositoryStorage(root, [
        "verification/evidence-manifests/evidence.json",
      ]),
    /must not contain symbolic links/,
  );

  fs.writeFileSync(path.join(outside, "spec.md"), "outside\n");
  fs.symlinkSync(path.join(outside, "spec.md"), path.join(root, "spec.md"));
  assert.throws(
    () => digestFileSet(root, ["spec.md"]),
    /must not contain symbolic links/,
  );
});

test("shared public-data screening rejects prefixed PII fields and raw job text", () => {
  assert.doesNotThrow(() =>
    assertNoSensitivePublicData(
      { participant_surrogate: "participant_0123456789ab" },
      "Evidence",
    ),
  );
  assert.throws(
    () => assertNoSensitivePublicData({ email_address: "redacted" }, "Evidence"),
    /forbidden public field email_address/,
  );
  assert.throws(
    () => assertNoSensitivePublicData({ source_jd_text: "redacted" }, "Evidence"),
    /forbidden public field source_jd_text/,
  );
});
