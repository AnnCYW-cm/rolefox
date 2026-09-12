import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PATHS, TRUSTED_WORKLOAD_IDENTITY } from "./config.mjs";
import {
  assertSafeRepositoryStorage,
  canonicalJson,
  decodeUtf8,
  invariant,
  isSha256,
  readJson,
  sha256,
  writeBytesImmutable,
} from "./lib.mjs";
import { SCHEMA_NAMES, validateSchema } from "./schema.mjs";

export const TRUST_PREDICATE_SCHEMA_VERSION =
  "rolefox.github-actions-verification-attestation.v1";

export const TRUST_KINDS = Object.freeze({
  CATALOG_ACCEPTED: "ACCEPTED",
  PROTOCOL_APPROVED: "APPROVED",
  CANDIDATE_APPROVED: "APPROVED",
  EVIDENCE_VERIFIED: "VERIFIED",
  GATE_PASS: "PASS",
  GATE_ACCEPTED_FALLBACK: "ACCEPTED_FALLBACK",
  GATE_FAIL: "FAIL",
  CHECKPOINT_ROOT: "VERIFIED",
});

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, expected, label) => {
  invariant(isObject(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  invariant(
    canonicalJson(actual) === canonicalJson(wanted),
    `${label} must contain exactly: ${wanted.join(", ")}.`,
  );
};

const parseTimestamp = (value, label) => {
  invariant(
    typeof value === "string" && Number.isFinite(Date.parse(value)),
    `${label} must be an ISO timestamp.`,
  );
  return new Date(value).toISOString();
};

export function loadTrustPolicy(root) {
  assertSafeRepositoryStorage(root, [PATHS.trustPolicy]);
  const policyPath = path.join(root, ...PATHS.trustPolicy.split("/"));
  const policy = readJson(policyPath);
  validateSchema(root, SCHEMA_NAMES.trustPolicy, policy, "Trust policy");
  invariant(
    policy.signer.workflow_identity === TRUSTED_WORKLOAD_IDENTITY,
    "Trust policy workload identity does not match the verifier configuration.",
  );
  invariant(
    policy.proof_directory === PATHS.trustProofDirectory,
    "Trust policy proof directory does not match the verifier configuration.",
  );
  return policy;
}

export function subjectNameFor(kind, payloadDigest) {
  invariant(Object.hasOwn(TRUST_KINDS, kind), `Unsupported trust kind: ${kind}`);
  invariant(isSha256(payloadDigest), "Trust payload digest must be SHA-256.");
  return `rolefox-${kind.toLowerCase().replaceAll("_", "-")}-${payloadDigest}.json`;
}

export function validateEvidenceProducer(root, producer) {
  const policy = loadTrustPolicy(root);
  exactKeys(
    producer,
    ["identity", "identity_kind", "allowlist_version"],
    "Evidence producer",
  );
  invariant(
    policy.evidence_producers.some(
      (allowed) => canonicalJson(allowed) === canonicalJson(producer),
    ),
    "Evidence producer is not present in the versioned trust-policy allowlist.",
  );
  return producer;
}

export function createTrustPredicate({
  kind,
  payloadDigest,
  decidedAt,
  policy,
}) {
  invariant(Object.hasOwn(TRUST_KINDS, kind), `Unsupported trust kind: ${kind}`);
  invariant(isSha256(payloadDigest), "Trust payload digest must be SHA-256.");
  const parsedTime = parseTimestamp(decidedAt, "Trust decision decided_at");
  const normalizedTime = new Date(
    Math.floor(Date.parse(parsedTime) / 1000) * 1000,
  ).toISOString();
  return {
    schema_version: TRUST_PREDICATE_SCHEMA_VERSION,
    kind,
    payload_digest: payloadDigest,
    decision: {
      status: TRUST_KINDS[kind],
      decided_at: normalizedTime,
      actor: {
        identity: policy.maintainer.identity,
        login: policy.maintainer.login,
        id: policy.maintainer.actor_id,
        role_version: policy.maintainer.role_version,
      },
    },
    repository: {
      name: policy.repository.name,
      id: policy.repository.id,
      visibility: policy.repository.visibility,
    },
    workflow: {
      path: policy.signer.workflow_path,
      ref: policy.repository.source_ref,
      runner_environment: policy.signer.runner_environment,
    },
  };
}

function validatePredicate(predicate, { kind, payloadDigest, expectedDecision, policy }) {
  exactKeys(
    predicate,
    ["schema_version", "kind", "payload_digest", "decision", "repository", "workflow"],
    "Attestation predicate",
  );
  invariant(
    predicate.schema_version === TRUST_PREDICATE_SCHEMA_VERSION,
    "Attestation predicate schema_version mismatch.",
  );
  invariant(predicate.kind === kind, "Attestation predicate kind mismatch.");
  invariant(
    predicate.payload_digest === payloadDigest,
    "Attestation predicate payload digest mismatch.",
  );

  exactKeys(predicate.decision, ["status", "decided_at", "actor"], "Predicate decision");
  const wantedDecision = expectedDecision ?? TRUST_KINDS[kind];
  invariant(
    predicate.decision.status === wantedDecision && wantedDecision === TRUST_KINDS[kind],
    "Attestation predicate decision mismatch.",
  );
  const decisionAt = parseTimestamp(
    predicate.decision.decided_at,
    "Predicate decision decided_at",
  );
  exactKeys(
    predicate.decision.actor,
    ["identity", "login", "id", "role_version"],
    "Predicate decision actor",
  );
  invariant(
    predicate.decision.actor.identity === policy.maintainer.identity &&
      predicate.decision.actor.login === policy.maintainer.login &&
      String(predicate.decision.actor.id) === policy.maintainer.actor_id &&
      predicate.decision.actor.role_version === policy.maintainer.role_version,
    "Attestation predicate decision actor or role is not authorized.",
  );

  exactKeys(predicate.repository, ["name", "id", "visibility"], "Predicate repository");
  invariant(
    predicate.repository.name === policy.repository.name &&
      String(predicate.repository.id) === policy.repository.id &&
      predicate.repository.visibility === policy.repository.visibility,
    "Attestation predicate repository mismatch.",
  );

  exactKeys(
    predicate.workflow,
    ["path", "ref", "runner_environment"],
    "Predicate workflow",
  );
  invariant(
    predicate.workflow.path === policy.signer.workflow_path &&
      predicate.workflow.ref === policy.repository.source_ref &&
      predicate.workflow.runner_environment === policy.signer.runner_environment,
    "Attestation predicate workflow provenance mismatch.",
  );
  return decisionAt;
}

const normalizedKey = (key) => key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");

function valuesForKeys(value, names) {
  const wanted = new Set(names.map(normalizedKey));
  const values = [];
  const visit = (current) => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isObject(current)) return;
    for (const [key, entry] of Object.entries(current)) {
      if (wanted.has(normalizedKey(key)) && ["string", "number"].includes(typeof entry)) {
        values.push(String(entry));
      }
      if (isObject(entry) || Array.isArray(entry)) visit(entry);
    }
  };
  visit(value);
  return [...new Set(values)];
}

function requireClaim(value, names, expected, label) {
  const values = valuesForKeys(value, names);
  invariant(values.includes(String(expected)), `${label} mismatch.`);
}

function statementFrom(result) {
  let statement =
    result.verificationResult?.statement ??
    result.verification_result?.statement ??
    result.statement ??
    result.attestation;
  if (typeof statement === "string") {
    try {
      statement = JSON.parse(statement);
    } catch {
      throw new Error("gh attestation verify returned a non-JSON statement.");
    }
  }
  invariant(isObject(statement), "gh attestation verify did not return a statement.");
  return statement;
}

function certificateFrom(result) {
  const verification = result.verificationResult ?? result.verification_result;
  const certificate =
    verification?.signature?.certificate ?? verification?.certificate;
  invariant(isObject(certificate), "gh attestation verify did not return a certificate.");
  return certificate;
}

function verifiedTimestampsFrom(result) {
  const verification = result.verificationResult ?? result.verification_result;
  const timestamps =
    verification?.verifiedTimestamps ?? verification?.verified_timestamps;
  invariant(Array.isArray(timestamps), "gh attestation verify omitted verified timestamps.");
  return timestamps;
}

function rawBundleParts(bundle) {
  invariant(isObject(bundle), "Attestation bundle must be one JSON object.");
  const verificationMaterial = bundle.verificationMaterial ?? bundle.verification_material;
  invariant(isObject(verificationMaterial), "Attestation bundle verificationMaterial is missing.");
  const tlogEntries =
    verificationMaterial.tlogEntries ?? verificationMaterial.tlog_entries;
  invariant(Array.isArray(tlogEntries), "Attestation bundle tlogEntries is missing.");
  const envelope = bundle.content?.dsseEnvelope ?? bundle.content?.dsse_envelope;
  invariant(isObject(envelope), "Attestation bundle DSSE envelope is missing.");
  invariant(
    Array.isArray(envelope.signatures) && envelope.signatures.length === 1,
    "Attestation bundle must contain exactly one DSSE signature.",
  );
  const signature = envelope.signatures[0]?.sig ?? envelope.signatures[0]?.signature;
  invariant(
    typeof signature === "string" && signature.length >= 16,
    "Attestation bundle DSSE signature is missing.",
  );
  return { tlogEntries, signature };
}

function tlogTimestamp(entry) {
  const raw = entry.integratedTime ?? entry.integrated_time;
  if (typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw))) {
    const timestamp = Number(raw) * 1000;
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

function timestampValue(entry) {
  if (typeof entry === "string") return parseTimestamp(entry, "Verified timestamp");
  invariant(isObject(entry), "Verified timestamp entry must be an object.");
  const value =
    entry.timestamp ?? entry.time ?? entry.verifiedAt ?? entry.verified_at;
  return parseTimestamp(value, "Verified timestamp");
}

function verifyRekorAnchor(bundle, verifiedTimestamps, policy, decisionAt) {
  const { tlogEntries, signature } = rawBundleParts(bundle);
  invariant(
    tlogEntries.length >= policy.sigstore.minimum_transparency_log_entries,
    "Attestation bundle has no required Rekor transparency-log entry.",
  );
  invariant(
    verifiedTimestamps.length >= policy.sigstore.minimum_verified_rekor_timestamps,
    "Attestation has no required verified timestamp.",
  );
  const tlogTimes = tlogEntries.map(tlogTimestamp).filter(Boolean);
  invariant(tlogTimes.length > 0, "Rekor entry has no integrated timestamp.");
  const verifiedTimes = verifiedTimestamps.map(timestampValue);
  const anchoredAt = tlogTimes.find((time) =>
    verifiedTimes.some(
      (verified) => Math.abs(Date.parse(verified) - Date.parse(time)) <= 1000,
    ),
  );
  invariant(anchoredAt, "No gh-verified timestamp matches the Rekor integrated timestamp.");
  invariant(
    Date.parse(anchoredAt) + 999 >= Date.parse(decisionAt),
    "Rekor timestamp predates the signed maintainer decision.",
  );
  const entry = tlogEntries[tlogTimes.indexOf(anchoredAt)] ?? tlogEntries[0];
  const logId =
    entry.logId?.keyId ?? entry.log_id?.key_id ?? entry.logId ?? entry.log_id;
  const logIndex = entry.logIndex ?? entry.log_index;
  invariant(
    (typeof logId === "string" && logId.length > 0) ||
      (Number.isSafeInteger(logIndex) && logIndex >= 0) ||
      (typeof logIndex === "string" && /^\d+$/.test(logIndex)),
    "Rekor entry has no stable log identifier.",
  );
  const reference = `rekor:${String(logId ?? "unknown")}:${String(logIndex ?? "unknown")}`;
  return { anchoredAt, reference, signature };
}

function validateCertificate(certificate, policy) {
  requireClaim(certificate, ["issuer"], policy.signer.oidc_issuer, "OIDC issuer");
  requireClaim(
    certificate,
    ["sourceRepositoryURI"],
    `https://github.com/${policy.repository.name}`,
    "Source repository URI",
  );
  requireClaim(
    certificate,
    ["sourceRepositoryIdentifier"],
    policy.repository.id,
    "Source repository id",
  );
  requireClaim(
    certificate,
    ["sourceRepositoryOwnerIdentifier"],
    policy.repository.owner_id,
    "Source repository owner id",
  );
  requireClaim(
    certificate,
    ["sourceRepositoryRef"],
    policy.repository.source_ref,
    "Source repository ref",
  );
  requireClaim(
    certificate,
    ["runnerEnvironment"],
    policy.signer.runner_environment,
    "Runner environment",
  );
  requireClaim(
    certificate,
    ["sourceRepositoryVisibilityAtSigning", "sourceRepositoryVisibility"],
    policy.repository.visibility,
    "Repository visibility at signing",
  );
  requireClaim(
    certificate,
    ["buildTrigger", "githubWorkflowTrigger"],
    policy.signer.event_name,
    "Workflow trigger",
  );
  const workflowUris = valuesForKeys(certificate, [
    "subjectAlternativeName",
    "buildConfigURI",
    "buildSignerURI",
  ]);
  invariant(
    workflowUris.includes(policy.signer.workflow_uri),
    "Trusted signer workflow URI mismatch.",
  );
  const sourceDigests = valuesForKeys(certificate, ["sourceRepositoryDigest"]);
  invariant(
    sourceDigests.some((value) => /^(?:sha1:|sha256:)?[a-f0-9]{40,64}$/i.test(value)),
    "Verified certificate has no source commit digest.",
  );
  const invocations = valuesForKeys(certificate, [
    "runInvocationURI",
    "runnerInvocationURI",
  ]);
  invariant(
    invocations.some((value) =>
      value.startsWith(`https://github.com/${policy.repository.name}/actions/runs/`),
    ),
    "Workflow run invocation URI mismatch.",
  );
  return {
    sourceCommit: sourceDigests.find((value) =>
      /^(?:sha1:|sha256:)?[a-f0-9]{40,64}$/i.test(value),
    ),
    runInvocation: invocations.find((value) =>
      value.startsWith(`https://github.com/${policy.repository.name}/actions/runs/`),
    ),
  };
}

export function validateGhVerificationOutput(
  output,
  { kind, payloadDigest, expectedDecision, bundle, policy },
) {
  let decoded = output;
  if (Buffer.isBuffer(decoded)) decoded = decodeUtf8(decoded, "gh verification output");
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded);
    } catch {
      throw new Error("gh attestation verify did not return JSON.");
    }
  }
  invariant(
    Array.isArray(decoded) && decoded.length === 1,
    "gh attestation verify must return exactly one verified attestation.",
  );
  const result = decoded[0];
  invariant(isObject(result), "gh attestation verification result is invalid.");
  const statement = statementFrom(result);
  invariant(
    statement.predicateType === policy.predicate_type,
    "Verified statement predicate type mismatch.",
  );
  invariant(
    Array.isArray(statement.subject) && statement.subject.length === 1,
    "Verified statement must contain exactly one subject.",
  );
  const subject = statement.subject[0];
  invariant(isObject(subject), "Verified statement subject is invalid.");
  invariant(
    subject.name === subjectNameFor(kind, payloadDigest) &&
      subject.digest?.sha256 === payloadDigest,
    "Verified statement subject does not match the canonical payload.",
  );
  const decisionAt = validatePredicate(statement.predicate, {
    kind,
    payloadDigest,
    expectedDecision,
    policy,
  });
  const certificateResult = validateCertificate(certificateFrom(result), policy);
  const anchor = verifyRekorAnchor(
    bundle,
    verifiedTimestampsFrom(result),
    policy,
    decisionAt,
  );
  return {
    decision: TRUST_KINDS[kind],
    decisionAt,
    attestedAt: anchor.anchoredAt,
    actor: policy.maintainer.identity,
    roleVersion: policy.maintainer.role_version,
    signer: policy.signer.workflow_identity,
    signatureValue: anchor.signature,
    sourceCommit: certificateResult.sourceCommit,
    runInvocation: certificateResult.runInvocation,
    anchor: {
      provider: policy.sigstore.external_anchor_provider,
      reference: anchor.reference,
      anchoredAt: anchor.anchoredAt,
    },
  };
}

function readBundle(bundlePath) {
  const metadata = fs.lstatSync(bundlePath);
  invariant(
    metadata.isFile() && !metadata.isSymbolicLink(),
    "Trust proof bundle must be a regular file, not a symbolic link.",
  );
  const bytes = fs.readFileSync(bundlePath);
  let bundle;
  try {
    bundle = JSON.parse(decodeUtf8(bytes, bundlePath));
  } catch (error) {
    throw new Error(`Trust proof bundle is not one valid JSON object: ${String(error)}`);
  }
  invariant(isObject(bundle), "Trust proof bundle must be one JSON object.");
  return { bytes, bundle, digest: sha256(bytes) };
}

export function proofPathFor(root, proofDigest) {
  invariant(isSha256(proofDigest), "Trust proof digest must be SHA-256.");
  const relativePath = `${PATHS.trustProofDirectory}/proof_${proofDigest}.json`;
  assertSafeRepositoryStorage(root, [PATHS.trustProofDirectory, relativePath]);
  return path.join(root, ...relativePath.split("/"));
}

export function ghVerificationArguments({ bundlePath, subjectPath, policy }) {
  return [
    "attestation",
    "verify",
    subjectPath,
    "--bundle",
    bundlePath,
    "--repo",
    policy.repository.name,
    "--signer-workflow",
    policy.signer.signer_workflow,
    "--source-ref",
    policy.repository.source_ref,
    "--cert-oidc-issuer",
    policy.signer.oidc_issuer,
    "--deny-self-hosted-runners",
    "--predicate-type",
    policy.predicate_type,
    "--format",
    "json",
  ];
}

export function runGhVerification({ bundlePath, subjectPath, policy }) {
  const args = ghVerificationArguments({ bundlePath, subjectPath, policy });
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 8 * 1024 * 1024,
  });
  invariant(!result.error, `Failed to execute gh attestation verify: ${result.error}`);
  invariant(
    result.status === 0,
    `gh attestation verify rejected the proof: ${(result.stderr || result.stdout).trim()}`,
  );
  return { stdout: result.stdout, args };
}

export function verifyTrustedProof(
  root,
  {
    kind,
    payloadDigest,
    payloadBytes,
    proofDigest,
    bundlePath,
    expectedDecision,
  },
  { runGh = runGhVerification } = {},
) {
  invariant(Object.hasOwn(TRUST_KINDS, kind), `Unsupported trust kind: ${kind}`);
  invariant(Buffer.isBuffer(payloadBytes), "Trusted payloadBytes must be a Buffer.");
  invariant(
    isSha256(payloadDigest) && sha256(payloadBytes) === payloadDigest,
    "Trusted payload bytes do not match payloadDigest.",
  );
  invariant(
    bundlePath !== undefined || isSha256(proofDigest),
    "A proof bundle path or checked-in proof digest is required.",
  );
  const policy = loadTrustPolicy(root);
  const resolvedBundlePath = bundlePath ?? proofPathFor(root, proofDigest);
  const { bytes, bundle, digest } = readBundle(resolvedBundlePath);
  if (proofDigest !== undefined) {
    invariant(isSha256(proofDigest), "Trust proof digest must be SHA-256.");
    invariant(digest === proofDigest, "Trust proof raw-byte digest mismatch.");
  }

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rolefox-trust-"));
  const subjectPath = path.join(temporaryDirectory, subjectNameFor(kind, payloadDigest));
  const verificationBundlePath = path.join(temporaryDirectory, "bundle.json");
  try {
    fs.writeFileSync(subjectPath, payloadBytes, { flag: "wx", mode: 0o444 });
    // Verify the exact raw bytes hashed above. Passing the caller-owned path to
    // gh would leave a substitution window between readBundle() and spawn.
    fs.writeFileSync(verificationBundlePath, bytes, { flag: "wx", mode: 0o444 });
    const ghResult = runGh({
      bundlePath: verificationBundlePath,
      subjectPath,
      policy,
    });
    const stdout = typeof ghResult === "string" ? ghResult : ghResult?.stdout;
    const verification = validateGhVerificationOutput(stdout, {
      kind,
      payloadDigest,
      expectedDecision,
      bundle,
      policy,
    });
    return { ...verification, proofDigest: digest, bundleBytes: bytes };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function importTrustedProof(root, bundlePath, expectedDigest) {
  const { bytes, digest } = readBundle(bundlePath);
  if (expectedDigest !== undefined) {
    invariant(digest === expectedDigest, "Imported trust proof digest changed after verification.");
  }
  const destination = proofPathFor(root, digest);
  const disposition = writeBytesImmutable(destination, bytes);
  return { proofDigest: digest, path: destination, disposition };
}

export function canonicalPayloadBytes(document, excludedTopLevelFields = []) {
  const body = structuredClone(document);
  for (const field of excludedTopLevelFields) delete body[field];
  return Buffer.from(canonicalJson(body), "utf8");
}
