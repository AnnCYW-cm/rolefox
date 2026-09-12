import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256 } from "../lib.mjs";
import {
  canonicalPayloadBytes,
  createTrustPredicate,
  ghVerificationArguments,
  loadTrustPolicy,
  subjectNameFor,
  validateEvidenceProducer,
  validateGhVerificationOutput,
  verifyTrustedProof,
} from "../trust.mjs";
import { validateTrustedWorkflowEnvironment } from "../create-trust-request.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const policy = loadTrustPolicy(root);
const kind = "CATALOG_ACCEPTED";
const payloadBytes = canonicalPayloadBytes({ alpha: 1, beta: "two" });
const payloadDigest = sha256(payloadBytes);
const decisionAt = "2026-09-11T12:00:00.000Z";
const integratedTime = Math.floor(Date.parse(decisionAt) / 1000) + 1;

function fixture() {
  const predicate = createTrustPredicate({
    kind,
    payloadDigest,
    decidedAt: "2026-09-11T12:00:00.987Z",
    policy,
  });
  const bundle = {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    verificationMaterial: {
      tlogEntries: [
        {
          logId: { keyId: "rekor-public-key-id" },
          logIndex: 42,
          integratedTime,
        },
      ],
    },
    content: {
      dsseEnvelope: {
        signatures: [{ sig: "c2lnc3RvcmUtc2lnbmF0dXJl" }],
      },
    },
  };
  const output = [
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
              runInvocationURI: `https://github.com/${policy.repository.name}/actions/runs/123456789`,
            },
          },
        },
        verifiedTimestamps: [
          {
            type: "transparency-log",
            timestamp: new Date(integratedTime * 1000).toISOString(),
          },
        ],
      },
    },
  ];
  return { bundle, output, predicate };
}

test("validates exact GitHub/Sigstore provenance and normalizes predicate time to seconds", () => {
  const { bundle, output, predicate } = fixture();
  assert.equal(predicate.decision.decided_at, decisionAt);
  const verified = validateGhVerificationOutput(output, {
    kind,
    payloadDigest,
    expectedDecision: "ACCEPTED",
    bundle,
    policy,
  });
  assert.equal(verified.actor, "github:AnnCYW-cm");
  assert.equal(verified.signer, policy.signer.workflow_identity);
  assert.equal(verified.anchor.provider, "SIGSTORE_REKOR");
  assert.equal(verified.anchor.reference, "rekor:rekor-public-key-id:42");
});

test("gh wrapper pins the full signer workflow plus repo, main, issuer, runner, and predicate", () => {
  const args = ghVerificationArguments({
    bundlePath: "/tmp/proof.json",
    subjectPath: "/tmp/subject.json",
    policy,
  });
  const valueAfter = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(valueAfter("--repo"), "AnnCYW-cm/rolefox");
  assert.equal(
    valueAfter("--signer-workflow"),
    "github.com/AnnCYW-cm/rolefox/.github/workflows/verification-attest.yml",
  );
  assert.equal(valueAfter("--source-ref"), "refs/heads/main");
  assert.equal(
    valueAfter("--cert-oidc-issuer"),
    "https://token.actions.githubusercontent.com",
  );
  assert.ok(args.includes("--deny-self-hosted-runners"));
  assert.equal(valueAfter("--predicate-type"), policy.predicate_type);
});

test("rejects the wrong human identity and role", () => {
  for (const [field, value] of [
    ["identity", "github:mallory"],
    ["role_version", "untrusted-role-v1"],
  ]) {
    const { bundle, output } = fixture();
    output[0].verificationResult.statement.predicate.decision.actor[field] = value;
    assert.throws(
      () =>
        validateGhVerificationOutput(output, {
          kind,
          payloadDigest,
          expectedDecision: "ACCEPTED",
          bundle,
          policy,
        }),
      /actor or role is not authorized/,
    );
  }
});

test("Evidence producer must exactly match the versioned operator allowlist", () => {
  const producer = {
    identity: "github:AnnCYW-cm",
    identity_kind: "APPROVED_OPERATOR",
    allowlist_version: "rolefox-research-operators-v1",
  };
  assert.deepEqual(validateEvidenceProducer(root, producer), producer);
  for (const [field, value] of [
    ["identity", "github:mallory"],
    ["identity_kind", "CI_WORKLOAD"],
    ["allowlist_version", "untrusted-operators-v1"],
  ]) {
    assert.throws(
      () => validateEvidenceProducer(root, { ...producer, [field]: value }),
      /versioned trust-policy allowlist/,
    );
  }
});

test("rejects wrong repository id, workflow, ref, runner, or predicate digest", () => {
  const mutations = [
    (fixtureValue) => {
      fixtureValue.output[0].verificationResult.statement.predicate.repository.id = "999";
    },
    (fixtureValue) => {
      fixtureValue.output[0].verificationResult.signature.certificate.extensions.buildConfigURI =
        "https://github.com/AnnCYW-cm/rolefox/.github/workflows/evil.yml@refs/heads/main";
      fixtureValue.output[0].verificationResult.signature.certificate.subjectAlternativeName =
        "https://github.com/AnnCYW-cm/rolefox/.github/workflows/evil.yml@refs/heads/main";
    },
    (fixtureValue) => {
      fixtureValue.output[0].verificationResult.signature.certificate.extensions.sourceRepositoryRef =
        "refs/heads/unprotected";
    },
    (fixtureValue) => {
      fixtureValue.output[0].verificationResult.signature.certificate.extensions.runnerEnvironment =
        "self-hosted";
    },
    (fixtureValue) => {
      fixtureValue.output[0].verificationResult.statement.predicate.payload_digest = "b".repeat(64);
    },
  ];
  for (const mutate of mutations) {
    const value = fixture();
    mutate(value);
    assert.throws(() =>
      validateGhVerificationOutput(value.output, {
        kind,
        payloadDigest,
        expectedDecision: "ACCEPTED",
        bundle: value.bundle,
        policy,
      }),
    );
  }
});

test("requires a gh-verified timestamp matching a Rekor integrated time", () => {
  const missing = fixture();
  missing.output[0].verificationResult.verifiedTimestamps = [];
  assert.throws(
    () =>
      validateGhVerificationOutput(missing.output, {
        kind,
        payloadDigest,
        bundle: missing.bundle,
        policy,
      }),
    /verified timestamp/,
  );

  const mismatched = fixture();
  mismatched.output[0].verificationResult.verifiedTimestamps[0].timestamp =
    "2026-09-12T12:00:00.000Z";
  assert.throws(
    () =>
      validateGhVerificationOutput(mismatched.output, {
        kind,
        payloadDigest,
        bundle: mismatched.bundle,
        policy,
      }),
    /matches the Rekor integrated timestamp/,
  );
});

test("verifyTrustedProof checks canonical payload bytes and raw bundle digest before trusting gh", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rolefox-trust-test-"));
  try {
    const value = fixture();
    const bundlePath = path.join(temporaryDirectory, "bundle.json");
    fs.writeFileSync(bundlePath, JSON.stringify(value.bundle));
    let calls = 0;
    const runGh = ({ bundlePath: verificationBundlePath }) => {
      calls += 1;
      assert.notEqual(verificationBundlePath, bundlePath);
      assert.ok(fs.readFileSync(verificationBundlePath).equals(fs.readFileSync(bundlePath)));
      return { stdout: JSON.stringify(value.output) };
    };
    const verified = verifyTrustedProof(
      root,
      { kind, payloadDigest, payloadBytes, bundlePath, expectedDecision: "ACCEPTED" },
      { runGh },
    );
    assert.equal(verified.proofDigest, sha256(fs.readFileSync(bundlePath)));
    assert.equal(calls, 1);
    assert.throws(
      () =>
        verifyTrustedProof(
          root,
          {
            kind,
            payloadDigest,
            payloadBytes: Buffer.from("wrong"),
            bundlePath,
          },
          { runGh },
        ),
      /payload bytes/,
    );
    assert.throws(
      () =>
        verifyTrustedProof(
          root,
          {
            kind,
            payloadDigest,
            payloadBytes,
            proofDigest: "f".repeat(64),
            bundlePath,
          },
          { runGh },
        ),
      /raw-byte digest mismatch/,
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("workflow context rejects a non-Ann actor, unprotected ref, and self-hosted runner", () => {
  const validEnvironment = {
    GITHUB_REPOSITORY: policy.repository.name,
    GITHUB_REPOSITORY_ID: policy.repository.id,
    GITHUB_REPOSITORY_VISIBILITY: policy.repository.visibility,
    GITHUB_ACTOR: policy.maintainer.login,
    GITHUB_ACTOR_ID: policy.maintainer.actor_id,
    GITHUB_TRIGGERING_ACTOR: policy.maintainer.login,
    GITHUB_REF: policy.repository.source_ref,
    GITHUB_REF_PROTECTED: "true",
    GITHUB_EVENT_NAME: policy.signer.event_name,
    GITHUB_WORKFLOW_REF:
      `${policy.repository.name}/${policy.signer.workflow_path}@${policy.repository.source_ref}`,
    ROLEFOX_RUNNER_ENVIRONMENT: policy.signer.runner_environment,
  };
  assert.doesNotThrow(() => validateTrustedWorkflowEnvironment(validEnvironment, policy));
  for (const [key, value] of [
    ["GITHUB_ACTOR", "mallory"],
    ["GITHUB_ACTOR_ID", "999"],
    ["GITHUB_TRIGGERING_ACTOR", "mallory"],
    ["GITHUB_REF_PROTECTED", "false"],
    ["ROLEFOX_RUNNER_ENVIRONMENT", "self-hosted"],
  ]) {
    assert.throws(() =>
      validateTrustedWorkflowEnvironment({ ...validEnvironment, [key]: value }, policy),
    );
  }
});
