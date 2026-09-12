import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PATHS,
  REQUIRED_RELEASE_SCOPE_IDS,
  PRE_W1_RESEARCH_SCOPE_IDS,
  SOLE_MAINTAINER_AUTHORITY,
  VERIFICATION_TOOLCHAIN_FILES,
} from "./config.mjs";
import {
  DIGEST_CONTRACT,
  addressDocument,
  assertRepositoryRelativePath,
  assertSafeRepositoryStorage,
  canonicalDigest,
  canonicalJson,
  decodeUtf8,
  digestFileSet,
  invariant,
  isSha256,
  readJson,
  repositoryRoot,
  resolveRepositoryPath,
  sha256,
  verifyAddressedDocument,
  withVerificationLock,
  writeJsonAtomic,
  writeJsonImmutable,
} from "./lib.mjs";
import { SCHEMA_NAMES, validateSchema } from "./schema.mjs";
import {
  TRUST_KINDS,
  canonicalPayloadBytes,
  importTrustedProof,
  loadTrustPolicy,
  verifyTrustedProof,
} from "./trust.mjs";

export const FOUNDATION_REQUEST_SCHEMA_VERSION =
  "rolefox.foundation-approval-request.v1";

const FOUNDATION_TARGETS = Object.freeze({
  CATALOG_ACCEPTED: Object.freeze({
    cliKind: "catalog",
    schemaName: SCHEMA_NAMES.catalog,
    currentPath: PATHS.catalog,
    snapshotDirectory: PATHS.catalogSnapshotDirectory,
    snapshotPrefix: "catalog",
    digestField: "catalog_digest",
    idField: null,
    envelopeField: "review",
    sourceStatus: "PROPOSED_PENDING_MAINTAINER_DECISION",
    targetStatus: "ACCEPTED",
    sourceCollectionGuard: null,
    targetCollectionGuard: null,
    payloadExclusions: ["catalog_digest", "review"],
  }),
  PROTOCOL_APPROVED: Object.freeze({
    cliKind: "protocol",
    schemaName: SCHEMA_NAMES.protocol,
    currentPath: PATHS.protocol,
    snapshotDirectory: PATHS.protocolSnapshotDirectory,
    snapshotPrefix: "protocol",
    digestField: "protocol_digest",
    idField: null,
    envelopeField: "approval",
    sourceStatus: "DRAFT_PENDING_PRODUCT_OWNER_APPROVAL",
    targetStatus: "APPROVED",
    sourceCollectionGuard: null,
    targetCollectionGuard: null,
    payloadExclusions: ["protocol_digest", "approval"],
  }),
  CANDIDATE_APPROVED: Object.freeze({
    cliKind: "candidate",
    schemaName: SCHEMA_NAMES.candidate,
    currentPath: PATHS.candidateIndex,
    snapshotDirectory: PATHS.candidateDirectory,
    snapshotPrefix: "candidate",
    digestField: "manifest_digest",
    idField: "candidate_scope_manifest_id",
    envelopeField: "approval",
    sourceStatus: "PENDING",
    targetStatus: "APPROVED",
    sourceCollectionGuard: "BLOCKED_UNTIL_APPROVED",
    targetCollectionGuard: "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION",
    payloadExclusions: [
      "candidate_scope_manifest_id",
      "manifest_digest",
      "approval",
    ],
  }),
});

const CLI_KINDS = Object.freeze(
  Object.fromEntries(
    Object.entries(FOUNDATION_TARGETS).map(([kind, target]) => [
      target.cliKind,
      kind,
    ]),
  ),
);

const absolute = (root, relativePath) =>
  path.join(root, ...relativePath.split("/"));

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function exactKeys(value, expected, label) {
  invariant(isObject(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  invariant(
    canonicalJson(actual) === canonicalJson(wanted),
    `${label} must contain exactly: ${wanted.join(", ")}.`,
  );
}

function exactValue(actual, expected, label) {
  invariant(
    canonicalJson(actual) === canonicalJson(expected),
    `${label} does not match the expected value.`,
  );
}

function canonicalTimestamp(value, label) {
  invariant(
    typeof value === "string" && Number.isFinite(Date.parse(value)),
    `${label} must be an ISO-8601 timestamp.`,
  );
  invariant(
    new Date(value).toISOString() === value,
    `${label} must be canonical UTC ISO-8601.`,
  );
  return Date.parse(value);
}

function normalizeKind(kind) {
  const normalized = CLI_KINDS[kind] ?? kind;
  invariant(
    Object.hasOwn(FOUNDATION_TARGETS, normalized),
    `Unsupported foundation approval kind: ${kind}`,
  );
  return normalized;
}

function targetFor(kind) {
  return FOUNDATION_TARGETS[normalizeKind(kind)];
}

function fixedDigestIsCurrent(document, digestField, label) {
  const body = structuredClone(document);
  const actual = body[digestField];
  delete body[digestField];
  invariant(isSha256(actual), `${label}.${digestField} must be SHA-256.`);
  invariant(
    actual === canonicalDigest(body),
    `${label}.${digestField} is stale.`,
  );
}

function addressedOrFixedDocumentIsCurrent(document, target, label) {
  if (target.idField) {
    verifyAddressedDocument(document, {
      prefix: target.snapshotPrefix,
      idField: target.idField,
      digestField: target.digestField,
    });
    return;
  }
  fixedDigestIsCurrent(document, target.digestField, label);
}

function snapshotPathFor(target, digest, documentId = null) {
  invariant(isSha256(digest), "Foundation source digest must be SHA-256.");
  if (target.idField) {
    invariant(
      documentId === `${target.snapshotPrefix}_${digest}`,
      "Candidate source ID and digest do not agree.",
    );
    return `${target.snapshotDirectory}/${documentId}.json`;
  }
  invariant(documentId === null, "Fixed foundation documents do not have an ID.");
  return `${target.snapshotDirectory}/${target.snapshotPrefix}_${digest}.json`;
}

function documentStatus(document, target) {
  return target.idField ? document.approval?.status : document.status;
}

function collectionGuard(document, target) {
  return target.idField ? document.collection_guard : null;
}

function approvalView(document, target) {
  const envelope = document[target.envelopeField];
  if (target.cliKind === "catalog") {
    return {
      signedPayloadDigest: envelope?.signed_payload_digest,
      actor: envelope?.reviewed_by,
      decisionAt: envelope?.reviewed_at,
      roleVersion: envelope?.approver_role_version,
      proofDigest: envelope?.approval_proof_digest,
    };
  }
  return {
    signedPayloadDigest: envelope?.signed_payload_digest,
    actor: envelope?.approved_by,
    decisionAt: envelope?.approved_at,
    roleVersion: envelope?.approver_role_version,
    proofDigest: envelope?.approval_proof_digest,
  };
}

function payloadFor(document, target) {
  const payloadBytes = canonicalPayloadBytes(
    document,
    target.payloadExclusions,
  );
  return { payloadBytes, payloadDigest: sha256(payloadBytes) };
}

function assertPayloadBinding(document, target, label) {
  const approval = approvalView(document, target);
  invariant(
    isSha256(approval.signedPayloadDigest),
    `${label} signed payload digest must be SHA-256.`,
  );
  const payload = payloadFor(document, target);
  invariant(
    approval.signedPayloadDigest === payload.payloadDigest,
    `${label} signed payload digest is stale.`,
  );
  return payload;
}

function assertPendingDocument(document, target, label) {
  invariant(
    documentStatus(document, target) === target.sourceStatus,
    `${label} must be in ${target.sourceStatus} before approval.`,
  );
  invariant(
    collectionGuard(document, target) === target.sourceCollectionGuard,
    `${label} collection guard is not pending.`,
  );
  const approval = approvalView(document, target);
  invariant(approval.actor === null, `${label} actor must be null while pending.`);
  invariant(
    approval.decisionAt === null,
    `${label} decision time must be null while pending.`,
  );
  invariant(
    approval.roleVersion === null,
    `${label} role version must be null while pending.`,
  );
  invariant(
    approval.proofDigest === null,
    `${label} proof digest must be null while pending.`,
  );
  if (target.cliKind === "protocol") {
    invariant(
      document.decision_authority !== undefined &&
        canonicalJson(document.decision_authority) ===
          canonicalJson(SOLE_MAINTAINER_AUTHORITY),
      `${label} must bind the configured sole-maintainer authority.`,
    );
  }
  assertPayloadBinding(document, target, label);
}

function assertApprovedDocument(document, target, label) {
  invariant(
    documentStatus(document, target) === target.targetStatus,
    `${label} must be ${target.targetStatus}.`,
  );
  invariant(
    collectionGuard(document, target) === target.targetCollectionGuard,
    `${label} collection guard is not approved.`,
  );
  const approval = approvalView(document, target);
  invariant(
    approval.actor === SOLE_MAINTAINER_AUTHORITY.identity,
    `${label} actor is not the configured sole maintainer.`,
  );
  invariant(
    approval.roleVersion === SOLE_MAINTAINER_AUTHORITY.role_version,
    `${label} role version is not authorized.`,
  );
  canonicalTimestamp(approval.decisionAt, `${label} decision time`);
  invariant(
    isSha256(approval.proofDigest),
    `${label} proof digest must be SHA-256.`,
  );
  if (target.cliKind === "protocol") {
    invariant(
      document.decision_authority !== undefined &&
        canonicalJson(document.decision_authority) ===
          canonicalJson(SOLE_MAINTAINER_AUTHORITY),
      `${label} must bind the configured sole-maintainer authority.`,
    );
  }
  assertPayloadBinding(document, target, label);
  return approval;
}

function validateDocument(root, document, target, label) {
  validateSchema(root, target.schemaName, document, label);
  addressedOrFixedDocumentIsCurrent(document, target, label);
}

function readSnapshot(root, relativePath, target, label) {
  assertRepositoryRelativePath(relativePath);
  assertSafeRepositoryStorage(root, [relativePath]);
  const filePath = resolveRepositoryPath(root, relativePath);
  const document = readJson(filePath);
  validateDocument(root, document, target, label);
  invariant(
    relativePath ===
      snapshotPathFor(
        target,
        document[target.digestField],
        target.idField ? document[target.idField] : null,
      ),
    `${label} filename is not content-addressed.`,
  );
  return document;
}

function readCandidateIndex(root) {
  const indexPath = absolute(root, PATHS.candidateIndex);
  const index = readJson(indexPath);
  exactKeys(
    index,
    [
      "schema_version",
      "candidate_scope_manifest_id",
      "manifest_digest",
      "path",
      "readiness",
    ],
    "Current Candidate pointer",
  );
  invariant(
    index.schema_version === "rolefox.current-candidate-scope.v1",
    "Current Candidate pointer schema_version is unsupported.",
  );
  invariant(
    isSha256(index.manifest_digest),
    "Current Candidate pointer digest must be SHA-256.",
  );
  invariant(
    index.candidate_scope_manifest_id === `candidate_${index.manifest_digest}`,
    "Current Candidate pointer ID and digest do not agree.",
  );
  invariant(
    index.path ===
      `${PATHS.candidateDirectory}/${index.candidate_scope_manifest_id}.json`,
    "Current Candidate pointer path is not content-addressed.",
  );
  return index;
}

function loadCurrentDocument(root, target) {
  if (target.idField) {
    const index = readCandidateIndex(root);
    const document = readSnapshot(
      root,
      index.path,
      target,
      "Current Candidate Scope Manifest",
    );
    invariant(
      index.candidate_scope_manifest_id === document[target.idField] &&
        index.manifest_digest === document[target.digestField],
      "Current Candidate pointer does not match its immutable target.",
    );
    const expectedReadiness =
      documentStatus(document, target) === target.targetStatus
        ? target.targetCollectionGuard
        : "PENDING_PRODUCT_OWNER_APPROVAL";
    invariant(
      index.readiness === expectedReadiness,
      "Current Candidate pointer readiness is stale.",
    );
    return { document, index, snapshotPath: index.path };
  }

  const document = readJson(absolute(root, target.currentPath));
  validateDocument(
    root,
    document,
    target,
    `Current ${target.cliKind} foundation document`,
  );
  const snapshotPath = snapshotPathFor(
    target,
    document[target.digestField],
  );
  const snapshot = readSnapshot(
    root,
    snapshotPath,
    target,
    `Current ${target.cliKind} snapshot`,
  );
  exactValue(
    document,
    snapshot,
    `Current ${target.cliKind} document and immutable snapshot`,
  );
  return { document, index: null, snapshotPath };
}

function sourceReference(target, document, snapshotPath) {
  return {
    current_path: target.currentPath,
    snapshot_path: snapshotPath,
    document_id: target.idField ? document[target.idField] : null,
    document_digest: document[target.digestField],
    status: documentStatus(document, target),
  };
}

function transitionFor(target) {
  return {
    from_status: target.sourceStatus,
    to_status: target.targetStatus,
    from_collection_guard: target.sourceCollectionGuard,
    to_collection_guard: target.targetCollectionGuard,
  };
}

function targetPayloadFromPending(source, target) {
  const targetDocument = structuredClone(source);
  if (target.idField) {
    targetDocument.collection_guard = target.targetCollectionGuard;
  } else {
    targetDocument.status = target.targetStatus;
  }
  return payloadFor(targetDocument, target);
}

function validateRequest(root, request) {
  exactKeys(
    request,
    [
      "schema_version",
      "canonicalization",
      "kind",
      "trust_policy_version",
      "source",
      "transition",
      "required_signed_payload_digest",
    ],
    "Foundation approval request",
  );
  invariant(
    request.schema_version === FOUNDATION_REQUEST_SCHEMA_VERSION,
    "Foundation approval request schema_version is unsupported.",
  );
  invariant(
    request.canonicalization === DIGEST_CONTRACT,
    "Foundation approval request canonicalization is unsupported.",
  );
  const kind = normalizeKind(request.kind);
  invariant(kind === request.kind, "Foundation approval request kind must be canonical.");
  const target = targetFor(kind);
  const policy = loadTrustPolicy(root);
  invariant(
    request.trust_policy_version === policy.policy_version,
    "Foundation approval request trust policy changed; prepare again.",
  );
  exactKeys(
    request.source,
    [
      "current_path",
      "snapshot_path",
      "document_id",
      "document_digest",
      "status",
    ],
    "Foundation approval request source",
  );
  invariant(
    request.source.current_path === target.currentPath,
    "Foundation approval request current path is invalid.",
  );
  invariant(
    isSha256(request.source.document_digest),
    "Foundation approval request source digest must be SHA-256.",
  );
  invariant(
    request.source.snapshot_path ===
      snapshotPathFor(
        target,
        request.source.document_digest,
        request.source.document_id,
      ),
    "Foundation approval request snapshot path is invalid.",
  );
  invariant(
    request.source.status === target.sourceStatus,
    "Foundation approval request source status is invalid.",
  );
  exactValue(
    request.transition,
    transitionFor(target),
    "Foundation approval request transition",
  );
  invariant(
    isSha256(request.required_signed_payload_digest),
    "Foundation approval request payload digest must be SHA-256.",
  );
  return { kind, target, policy };
}

function sourceFromRequest(root, request, target) {
  const source = readSnapshot(
    root,
    request.source.snapshot_path,
    target,
    `Foundation ${target.cliKind} source snapshot`,
  );
  invariant(
    source[target.digestField] === request.source.document_digest,
    "Foundation approval source digest changed.",
  );
  invariant(
    (target.idField ? source[target.idField] : null) === request.source.document_id,
    "Foundation approval source ID changed.",
  );
  assertPendingDocument(source, target, `Foundation ${target.cliKind} source`);
  return source;
}

function assertVerifiedDecision(verified, target, approval, label) {
  invariant(isObject(verified), `${label} trust verifier returned no result.`);
  invariant(
    verified.decision === target.targetStatus &&
      verified.decision === TRUST_KINDS[targetForKind(target)],
    `${label} trust decision does not match the requested transition.`,
  );
  invariant(
    verified.actor === SOLE_MAINTAINER_AUTHORITY.identity,
    `${label} trust actor is not the configured sole maintainer.`,
  );
  invariant(
    verified.roleVersion === SOLE_MAINTAINER_AUTHORITY.role_version,
    `${label} trust role version is not authorized.`,
  );
  const decisionAt = canonicalTimestamp(
    verified.decisionAt,
    `${label} trust decision time`,
  );
  const attestedAt = canonicalTimestamp(
    verified.attestedAt,
    `${label} trust attestation time`,
  );
  invariant(attestedAt >= decisionAt, `${label} attestation predates its decision.`);
  invariant(isSha256(verified.proofDigest), `${label} proof digest is invalid.`);
  if (approval) {
    invariant(verified.proofDigest === approval.proofDigest, `${label} proof changed.`);
    invariant(verified.actor === approval.actor, `${label} actor changed.`);
    invariant(verified.roleVersion === approval.roleVersion, `${label} role changed.`);
    invariant(verified.decisionAt === approval.decisionAt, `${label} time changed.`);
  }
  return { decisionAt, attestedAt };
}

function targetForKind(target) {
  return Object.entries(FOUNDATION_TARGETS).find(([, value]) => value === target)?.[0];
}

function verifyPersistedApproval(root, document, target, verify) {
  const label = `Persisted ${target.cliKind} approval`;
  const approval = assertApprovedDocument(document, target, label);
  const { payloadBytes, payloadDigest } = payloadFor(document, target);
  const verified = verify(root, {
    kind: targetForKind(target),
    payloadDigest,
    payloadBytes,
    proofDigest: approval.proofDigest,
    expectedDecision: target.targetStatus,
  });
  assertVerifiedDecision(verified, target, approval, label);
  return approval;
}

function bootstrapRequired(condition, message) {
  invariant(condition, `BOOTSTRAP_REQUIRED: ${message}`);
}

function loadCurrentSpecManifest(root) {
  const manifest = readJson(absolute(root, PATHS.specManifest));
  validateSchema(root, SCHEMA_NAMES.specManifest, manifest, "Current Spec Manifest");
  fixedDigestIsCurrent(manifest, "manifest_digest", "Current Spec Manifest");
  const snapshotPath =
    `${PATHS.specManifestSnapshotDirectory}/spec_${manifest.manifest_digest}.json`;
  const snapshot = readSnapshot(
    root,
    snapshotPath,
    {
      schemaName: SCHEMA_NAMES.specManifest,
      snapshotPrefix: "spec",
      snapshotDirectory: PATHS.specManifestSnapshotDirectory,
      digestField: "manifest_digest",
      idField: null,
    },
    "Current Spec Manifest snapshot",
  );
  exactValue(manifest, snapshot, "Current Spec Manifest and immutable snapshot");
  return manifest;
}

function requireCandidateBootstrapReady(root, candidate, dependencies) {
  const catalogTarget = FOUNDATION_TARGETS.CATALOG_ACCEPTED;
  const protocolTarget = FOUNDATION_TARGETS.PROTOCOL_APPROVED;
  const catalog = loadCurrentDocument(root, catalogTarget).document;
  const protocol = loadCurrentDocument(root, protocolTarget).document;
  bootstrapRequired(
    documentStatus(catalog, catalogTarget) === catalogTarget.targetStatus,
    "Required Release Scope Catalog is not accepted.",
  );
  bootstrapRequired(
    documentStatus(protocol, protocolTarget) === protocolTarget.targetStatus,
    "Pre-W1 Research Protocol is not approved.",
  );

  const catalogApproval = verifyPersistedApproval(
    root,
    catalog,
    catalogTarget,
    dependencies.verifyTrustedProof,
  );
  const protocolApproval = verifyPersistedApproval(
    root,
    protocol,
    protocolTarget,
    dependencies.verifyTrustedProof,
  );

  const manifest = loadCurrentSpecManifest(root);
  const currentToolchain = digestFileSet(root, VERIFICATION_TOOLCHAIN_FILES);
  bootstrapRequired(
    canonicalJson(manifest.verification_toolchain) ===
      canonicalJson(currentToolchain),
    "Spec Manifest verification toolchain is stale.",
  );
  bootstrapRequired(
    manifest.generation?.tool === "scripts/verification/bootstrap-pre-w1.mjs" &&
      manifest.generation?.deterministic_inputs === true,
    "Spec Manifest was not generated by the Pre-W1 bootstrap.",
  );
  bootstrapRequired(
    manifest.required_release_scope_catalog_ref?.path === PATHS.catalog &&
      manifest.required_release_scope_catalog_ref?.catalog_digest ===
        catalog.catalog_digest &&
      manifest.required_release_scope_catalog_ref?.authority_status === "ACCEPTED",
    "Spec Manifest does not bind the accepted Catalog.",
  );
  bootstrapRequired(
    manifest.research_protocol_ref?.path === PATHS.protocol &&
      manifest.research_protocol_ref?.protocol_digest === protocol.protocol_digest &&
      manifest.research_protocol_ref?.authority_status === "ACCEPTED",
    "Spec Manifest does not bind the approved Protocol.",
  );
  const catalogEntry = manifest.inventory.find(
    (entry) => entry.path === PATHS.catalog,
  );
  const protocolEntry = manifest.inventory.find(
    (entry) => entry.path === PATHS.protocol,
  );
  bootstrapRequired(
    catalogEntry?.authority_status === "ACCEPTED" &&
      catalogEntry?.included_in_normative_set === true &&
      catalogEntry?.status_source === catalog.status &&
      catalogEntry?.approval_proof_digest === catalogApproval.proofDigest,
    "Spec Manifest Catalog inventory entry is stale.",
  );
  bootstrapRequired(
    protocolEntry?.authority_status === "ACCEPTED" &&
      protocolEntry?.included_in_normative_set === true &&
      protocolEntry?.status_source === protocol.status &&
      protocolEntry?.approval_proof_digest === protocolApproval.proofDigest,
    "Spec Manifest Protocol inventory entry is stale.",
  );

  bootstrapRequired(
    candidate.spec_manifest_ref?.path === PATHS.specManifest &&
      candidate.spec_manifest_ref?.manifest_digest === manifest.manifest_digest &&
      candidate.spec_manifest_ref?.normative_set_digest ===
        manifest.normative_set_digest,
    "Candidate does not bind the current Spec Manifest.",
  );
  bootstrapRequired(
    candidate.required_release_scope_catalog_ref?.path === PATHS.catalog &&
      candidate.required_release_scope_catalog_ref?.catalog_digest ===
        catalog.catalog_digest,
    "Candidate does not bind the accepted Catalog.",
  );
  bootstrapRequired(
    candidate.research_protocol_ref?.path === PATHS.protocol &&
      candidate.research_protocol_ref?.protocol_digest === protocol.protocol_digest,
    "Candidate does not bind the approved Protocol.",
  );
  bootstrapRequired(
    candidate.verification_toolchain_ref?.digest ===
      manifest.verification_toolchain.digest,
    "Candidate verification toolchain is stale.",
  );
  bootstrapRequired(
    canonicalJson([...candidate.release_scope_ids].sort()) ===
      canonicalJson([...REQUIRED_RELEASE_SCOPE_IDS].sort()) &&
      canonicalJson([...candidate.research_scope_ids].sort()) ===
        canonicalJson([...PRE_W1_RESEARCH_SCOPE_IDS].sort()),
    "Candidate scope sets are stale.",
  );
  const expectedArtifactDigest = canonicalDigest({
    kind: "SPEC_OR_EXPERIMENT",
    spec_manifest_digest: manifest.manifest_digest,
    normative_set_digest: manifest.normative_set_digest,
    catalog_digest: catalog.catalog_digest,
    research_protocol_digest: protocol.protocol_digest,
    verification_toolchain_digest: manifest.verification_toolchain.digest,
    release_scope_ids: [...REQUIRED_RELEASE_SCOPE_IDS].sort(),
    research_scope_ids: [...PRE_W1_RESEARCH_SCOPE_IDS].sort(),
  });
  bootstrapRequired(
    candidate.candidate_artifact_digest === expectedArtifactDigest,
    "Candidate artifact digest is stale.",
  );
  const candidateCreatedAt = canonicalTimestamp(
    candidate.created_at,
    "Candidate created_at",
  );
  bootstrapRequired(
    candidateCreatedAt >= Date.parse(catalogApproval.decisionAt) &&
      candidateCreatedAt >= Date.parse(protocolApproval.decisionAt),
    "Candidate predates an authority approval.",
  );
}

function defaultDependencies(overrides = {}) {
  return {
    verifyTrustedProof:
      overrides.verifyTrustedProof ?? verifyTrustedProof,
    importTrustedProof:
      overrides.importTrustedProof ?? importTrustedProof,
  };
}

function prepareUnlocked(root, { kind }, dependencies) {
  const canonicalKind = normalizeKind(kind);
  const target = targetFor(canonicalKind);
  const policy = loadTrustPolicy(root);
  const current = loadCurrentDocument(root, target);
  assertPendingDocument(
    current.document,
    target,
    `Current ${target.cliKind} foundation document`,
  );
  if (target.idField) {
    requireCandidateBootstrapReady(root, current.document, dependencies);
  }
  const payload = targetPayloadFromPending(current.document, target);
  return {
    schema_version: FOUNDATION_REQUEST_SCHEMA_VERSION,
    canonicalization: DIGEST_CONTRACT,
    kind: canonicalKind,
    trust_policy_version: policy.policy_version,
    source: sourceReference(target, current.document, current.snapshotPath),
    transition: transitionFor(target),
    required_signed_payload_digest: payload.payloadDigest,
  };
}

export function prepareFoundationApproval(
  root,
  { kind },
  dependencyOverrides = {},
) {
  const dependencies = defaultDependencies(dependencyOverrides);
  assertSafeRepositoryStorage(root, Object.values(PATHS));
  return withVerificationLock(root, `prepare-foundation-${kind}`, () =>
    prepareUnlocked(root, { kind }, dependencies),
  );
}

function approvedDocumentFrom(source, target, payloadDigest, verified) {
  const approved = structuredClone(source);
  if (target.idField) {
    approved.collection_guard = target.targetCollectionGuard;
    approved.approval = {
      status: target.targetStatus,
      approved_by: verified.actor,
      approved_at: verified.decisionAt,
      approver_role_version: verified.roleVersion,
      approval_proof_digest: verified.proofDigest,
      signed_payload_digest: payloadDigest,
    };
    return addressDocument(approved, {
      prefix: target.snapshotPrefix,
      idField: target.idField,
      digestField: target.digestField,
    });
  }

  approved.status = target.targetStatus;
  if (target.cliKind === "catalog") {
    approved.review = {
      signed_payload_digest: payloadDigest,
      reviewed_by: verified.actor,
      reviewed_at: verified.decisionAt,
      approval_proof_digest: verified.proofDigest,
      approver_role_version: verified.roleVersion,
    };
  } else {
    approved.approval = {
      signed_payload_digest: payloadDigest,
      approved_by: verified.actor,
      approved_at: verified.decisionAt,
      approver_role_version: verified.roleVersion,
      approval_proof_digest: verified.proofDigest,
    };
  }
  const body = structuredClone(approved);
  delete body[target.digestField];
  return { ...body, [target.digestField]: canonicalDigest(body) };
}

function approvedReference(target, document, snapshotPath) {
  return {
    current_path: target.currentPath,
    snapshot_path: snapshotPath,
    document_id: target.idField ? document[target.idField] : null,
    document_digest: document[target.digestField],
    status: documentStatus(document, target),
  };
}

function persistApprovedDocument(root, target, document) {
  const snapshotPath = snapshotPathFor(
    target,
    document[target.digestField],
    target.idField ? document[target.idField] : null,
  );
  assertSafeRepositoryStorage(root, [target.currentPath, snapshotPath]);
  const snapshotDisposition = writeJsonImmutable(
    absolute(root, snapshotPath),
    document,
  );
  if (target.idField) {
    writeJsonAtomic(absolute(root, target.currentPath), {
      schema_version: "rolefox.current-candidate-scope.v1",
      candidate_scope_manifest_id: document.candidate_scope_manifest_id,
      manifest_digest: document.manifest_digest,
      path: snapshotPath,
      readiness: target.targetCollectionGuard,
    });
  } else {
    writeJsonAtomic(absolute(root, target.currentPath), document);
  }
  return { snapshotPath, snapshotDisposition };
}

function approvalStateDisposition(
  root,
  request,
  target,
  source,
  approved,
  phase,
) {
  const sourceNow = sourceFromRequest(root, request, target);
  invariant(
    canonicalJson(sourceNow) === canonicalJson(source),
    `STALE_APPROVAL_REQUEST: source snapshot changed ${phase}.`,
  );
  const current = loadCurrentDocument(root, target);
  if (canonicalJson(current.document) === canonicalJson(source)) return "source";
  invariant(
    canonicalJson(current.document) === canonicalJson(approved),
    `STALE_APPROVAL_REQUEST: current foundation state changed ${phase}.`,
  );
  return "approved";
}

function finalizeUnlocked(
  root,
  { request, proofBundlePath },
  dependencies,
) {
  invariant(
    typeof proofBundlePath === "string" && proofBundlePath.length > 0,
    "Foundation finalize requires a proof bundle path.",
  );
  const { target } = validateRequest(root, request);
  const source = sourceFromRequest(root, request, target);
  if (target.idField) {
    requireCandidateBootstrapReady(root, source, dependencies);
  }
  const payload = targetPayloadFromPending(source, target);
  invariant(
    payload.payloadDigest === request.required_signed_payload_digest,
    "Foundation approval request payload changed; prepare again.",
  );

  const currentBeforeTrust = loadCurrentDocument(root, target);
  const currentIsSource =
    canonicalJson(currentBeforeTrust.document) === canonicalJson(source);

  const verified = dependencies.verifyTrustedProof(root, {
    kind: request.kind,
    payloadDigest: payload.payloadDigest,
    payloadBytes: payload.payloadBytes,
    bundlePath: proofBundlePath,
    expectedDecision: target.targetStatus,
  });
  const verifiedTimes = assertVerifiedDecision(
    verified,
    target,
    null,
    `Foundation ${target.cliKind} approval`,
  );
  if (target.idField) {
    invariant(
      verifiedTimes.decisionAt >= Date.parse(source.created_at),
      "Candidate approval predates Candidate creation.",
    );
  }

  const approved = approvedDocumentFrom(
    source,
    target,
    payload.payloadDigest,
    verified,
  );
  validateDocument(
    root,
    approved,
    target,
    `Approved ${target.cliKind} foundation document`,
  );
  assertApprovedDocument(
    approved,
    target,
    `Approved ${target.cliKind} foundation document`,
  );

  if (!currentIsSource) {
    invariant(
      canonicalJson(currentBeforeTrust.document) === canonicalJson(approved),
      "STALE_APPROVAL_REQUEST: current foundation state changed after prepare.",
    );
  }

  const dispositionBeforeImport = approvalStateDisposition(
    root,
    request,
    target,
    source,
    approved,
    "during trust verification",
  );

  const imported = dependencies.importTrustedProof(
    root,
    proofBundlePath,
    verified.proofDigest,
  );
  invariant(
    imported?.proofDigest === verified.proofDigest,
    "Imported trust proof does not match the verified bundle.",
  );

  const dispositionAfterImport = approvalStateDisposition(
    root,
    request,
    target,
    source,
    approved,
    "during trust proof import",
  );
  if (
    dispositionBeforeImport === "approved" ||
    dispositionAfterImport === "approved"
  ) {
    invariant(
      dispositionAfterImport === "approved",
      "STALE_APPROVAL_REQUEST: an approved foundation state was rolled back during finalize.",
    );
    return {
      schema_version: "rolefox.foundation-approval-result.v1",
      disposition: "unchanged",
      kind: request.kind,
      source: request.source,
      approved: approvedReference(
        target,
        approved,
        snapshotPathFor(
          target,
          approved[target.digestField],
          target.idField ? approved[target.idField] : null,
        ),
      ),
      proof_digest: verified.proofDigest,
      bootstrap_required: true,
    };
  }

  const persisted = persistApprovedDocument(root, target, approved);
  return {
    schema_version: "rolefox.foundation-approval-result.v1",
    disposition: persisted.snapshotDisposition,
    kind: request.kind,
    source: request.source,
    approved: approvedReference(target, approved, persisted.snapshotPath),
    proof_digest: verified.proofDigest,
    bootstrap_required: true,
  };
}

export function finalizeFoundationApproval(
  root,
  { request, proofBundlePath },
  dependencyOverrides = {},
) {
  const dependencies = defaultDependencies(dependencyOverrides);
  assertSafeRepositoryStorage(root, Object.values(PATHS));
  return withVerificationLock(root, `finalize-foundation-${request?.kind ?? "unknown"}`, () =>
    finalizeUnlocked(root, { request, proofBundlePath }, dependencies),
  );
}

function readJsonInput(inputPath) {
  if (inputPath === "-") {
    return JSON.parse(decodeUtf8(fs.readFileSync(0), "stdin"));
  }
  invariant(
    typeof inputPath === "string" && inputPath.length > 0,
    "Foundation approval request path is required.",
  );
  const metadata = fs.lstatSync(inputPath);
  invariant(
    metadata.isFile() && !metadata.isSymbolicLink(),
    "Foundation approval request must be a regular file, not a symbolic link.",
  );
  return readJson(inputPath);
}

export function parseFoundationArguments(argv) {
  const args = [...argv];
  if (args[0] === "--") args.shift();
  let mode;
  let kind;
  let requestPath;
  let proofBundlePath;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--prepare" || argument === "--finalize") {
      invariant(mode === undefined, "Specify exactly one of --prepare or --finalize.");
      mode = argument.slice(2);
    } else if (
      ["--kind", "--request", "--proof-bundle"].includes(argument)
    ) {
      invariant(index + 1 < args.length, `${argument} requires a value.`);
      const value = args[index + 1];
      index += 1;
      if (argument === "--kind") {
        invariant(kind === undefined, "--kind may only be supplied once.");
        kind = value;
      } else if (argument === "--request") {
        invariant(
          requestPath === undefined,
          "--request may only be supplied once.",
        );
        requestPath = value;
      } else {
        invariant(
          proofBundlePath === undefined,
          "--proof-bundle may only be supplied once.",
        );
        proofBundlePath = value;
      }
    } else {
      throw new Error(`Unknown foundation approval argument: ${argument}`);
    }
  }
  invariant(mode, "Specify exactly one of --prepare or --finalize.");
  if (mode === "prepare") {
    invariant(kind !== undefined, "--prepare requires --kind.");
    invariant(
      requestPath === undefined && proofBundlePath === undefined,
      "--prepare does not accept --request or --proof-bundle.",
    );
    normalizeKind(kind);
  } else {
    invariant(
      requestPath !== undefined && proofBundlePath !== undefined,
      "--finalize requires --request and --proof-bundle.",
    );
    invariant(kind === undefined, "--finalize derives kind from its request.");
  }
  return { mode, kind, requestPath, proofBundlePath };
}

export function runFoundationApprovalCli({
  root,
  argv = process.argv.slice(2),
  write = (value) => process.stdout.write(value),
  dependencies = {},
}) {
  const args = parseFoundationArguments(argv);
  const result =
    args.mode === "prepare"
      ? prepareFoundationApproval(root, { kind: args.kind }, dependencies)
      : finalizeFoundationApproval(
          root,
          {
            request: readJsonInput(args.requestPath),
            proofBundlePath: args.proofBundlePath,
          },
          dependencies,
        );
  write(`${JSON.stringify(result)}\n`);
  return result;
}

function main() {
  runFoundationApprovalCli({ root: repositoryRoot(import.meta.url) });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
