import fs from "node:fs";
import path from "node:path";

import {
  PATHS,
  SOLE_MAINTAINER_AUTHORITY,
  TRUSTED_WORKLOAD_IDENTITY,
  TRUST_VERIFICATION_STATUS,
  VERIFICATION_TOOLCHAIN_FILES,
} from "./config.mjs";
import {
  addressDocument,
  assertRepositoryRelativePath,
  assertSafeRepositoryStorage,
  canonicalDigest,
  canonicalDigestExcluding,
  digestFileSet,
  digestFileMetadataSet,
  digestJsonl,
  digestJsonlPrefix,
  invariant,
  isSha256,
  jsonFiles,
  parseJsonLines,
  readJson,
  resolveRepositoryPath,
  validateGateChains,
  verifyAddressedDocument,
  verifyCheckpointDocument,
  verifyEvidenceDocument,
  writeJsonImmutable,
} from "./lib.mjs";
import { assertNoSensitivePublicData } from "./privacy.mjs";
import { SCHEMA_NAMES, validateSchema } from "./schema.mjs";
import {
  canonicalPayloadBytes,
  importTrustedProof,
  validateEvidenceProducer,
  verifyTrustedProof,
} from "./trust.mjs";

const absolute = (root, relativePath) =>
  path.join(root, ...relativePath.split("/"));

const compareText = (left, right) =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

const verifyFixedDigest = (document, digestField, label) => {
  const body = structuredClone(document);
  const actual = body[digestField];
  delete body[digestField];
  invariant(isSha256(actual), `${label}.${digestField} is not a SHA-256 digest.`);
  invariant(actual === canonicalDigest(body), `${label}.${digestField} is stale.`);
};

const readSnapshot = (
  root,
  { directory, prefix, digest, digestField, schemaName, label },
) => {
  invariant(isSha256(digest), `${label} digest is invalid.`);
  const relativePath = `${directory}/${prefix}_${digest}.json`;
  assertSafeRepositoryStorage(root, [relativePath]);
  const filePath = absolute(root, relativePath);
  invariant(fs.existsSync(filePath), `${label} snapshot is missing: ${relativePath}`);
  const document = readJson(filePath);
  if (schemaName) validateSchema(root, schemaName, document, `${label} snapshot`);
  verifyFixedDigest(document, digestField, `${label} snapshot`);
  invariant(document[digestField] === digest, `${label} snapshot digest mismatch.`);
  return document;
};

export const validateHistoricalBindings = (
  root,
  {
    specManifestDigest,
    normativeSetDigest,
    catalogDigest,
    researchProtocolDigest,
    candidateScopeManifestId,
    candidateScopeManifestDigest,
    candidateArtifactDigest,
    verificationToolchainDigest,
    label,
  },
) => {
  const specManifest = readSnapshot(root, {
    directory: PATHS.specManifestSnapshotDirectory,
    prefix: "spec",
    digest: specManifestDigest,
    digestField: "manifest_digest",
    schemaName: SCHEMA_NAMES.specManifest,
    label: `${label} Spec Manifest`,
  });
  const catalog = readSnapshot(root, {
    directory: PATHS.catalogSnapshotDirectory,
    prefix: "catalog",
    digest: catalogDigest,
    digestField: "catalog_digest",
    schemaName: SCHEMA_NAMES.catalog,
    label: `${label} release-scope catalog`,
  });
  const protocol = readSnapshot(root, {
    directory: PATHS.protocolSnapshotDirectory,
    prefix: "protocol",
    digest: researchProtocolDigest,
    digestField: "protocol_digest",
    schemaName: SCHEMA_NAMES.protocol,
    label: `${label} research protocol`,
  });
  const candidateRelativePath =
    `${PATHS.candidateDirectory}/candidate_${candidateScopeManifestDigest}.json`;
  assertSafeRepositoryStorage(root, [candidateRelativePath]);
  const candidatePath = absolute(root, candidateRelativePath);
  invariant(
    fs.existsSync(candidatePath),
    `${label} Candidate Scope Manifest is missing: ${candidateRelativePath}`,
  );
  const candidate = readJson(candidatePath);
  validateSchema(root, SCHEMA_NAMES.candidate, candidate, `${label} Candidate Scope Manifest`);
  verifyAddressedDocument(candidate, {
    prefix: "candidate",
    idField: "candidate_scope_manifest_id",
    digestField: "manifest_digest",
  });
  const boundToolchainDigest =
    verificationToolchainDigest ?? specManifest.verification_toolchain?.digest;

  invariant(
    specManifest.verification_toolchain?.digest ===
      digestFileMetadataSet(specManifest.verification_toolchain?.files),
    `${label} Spec Manifest toolchain file-set digest is not reproducible.`,
  );
  const normativeEntries = specManifest.inventory.filter(
    (entry) => entry.included_in_normative_set,
  );
  invariant(
    normativeEntries.length === specManifest.normative_file_count &&
      specManifest.normative_set_digest ===
        digestFileMetadataSet(normativeEntries),
    `${label} Spec Manifest normative file-set digest is not reproducible.`,
  );

  invariant(
    specManifest.normative_set_digest === normativeSetDigest,
    `${label} normative-set digest does not match its Spec Manifest snapshot.`,
  );
  invariant(
    specManifest.required_release_scope_catalog_ref?.catalog_digest === catalog.catalog_digest &&
      specManifest.research_protocol_ref?.protocol_digest === protocol.protocol_digest,
    `${label} Spec Manifest authority references do not match their snapshots.`,
  );
  invariant(
    specManifest.verification_toolchain?.digest === boundToolchainDigest,
    `${label} verification toolchain does not match its Spec Manifest snapshot.`,
  );
  invariant(
    candidate.manifest_digest === candidateScopeManifestDigest &&
      (candidateScopeManifestId === undefined ||
        candidate.candidate_scope_manifest_id === candidateScopeManifestId) &&
      candidate.spec_manifest_ref?.manifest_digest === specManifest.manifest_digest &&
      candidate.spec_manifest_ref?.normative_set_digest === specManifest.normative_set_digest &&
      candidate.required_release_scope_catalog_ref?.catalog_digest === catalog.catalog_digest &&
      candidate.research_protocol_ref?.protocol_digest === protocol.protocol_digest &&
      candidate.verification_toolchain_ref?.digest === boundToolchainDigest &&
      candidate.candidate_artifact_digest === candidateArtifactDigest,
    `${label} Candidate Scope Manifest references do not reproduce the historical binding.`,
  );
  invariant(
    candidate.approval?.signed_payload_digest ===
      canonicalDigestExcluding(candidate, [
        "candidate_scope_manifest_id",
        "manifest_digest",
        "approval",
      ]),
    `${label} Candidate Scope approval payload digest is not reproducible.`,
  );
  if (candidate.candidate_artifact_kind === "SPEC_OR_EXPERIMENT") {
    invariant(
      candidate.candidate_artifact_digest ===
        canonicalDigest({
          kind: "SPEC_OR_EXPERIMENT",
          spec_manifest_digest: candidate.spec_manifest_ref.manifest_digest,
          normative_set_digest: candidate.spec_manifest_ref.normative_set_digest,
          catalog_digest:
            candidate.required_release_scope_catalog_ref.catalog_digest,
          research_protocol_digest: candidate.research_protocol_ref.protocol_digest,
          verification_toolchain_digest: candidate.verification_toolchain_ref.digest,
          release_scope_ids: [...candidate.release_scope_ids].sort(),
          research_scope_ids: [...candidate.research_scope_ids].sort(),
        }),
      `${label} Candidate artifact digest is not reproducible.`,
    );
  }
  const forbiddenFields = protocol.privacy?.forbidden_public_fields ?? [];
  assertNoSensitivePublicData(catalog.review, `${label} catalog review`, forbiddenFields);
  assertNoSensitivePublicData(protocol.approval, `${label} protocol approval`, forbiddenFields);
  assertNoSensitivePublicData(candidate.approval, `${label} candidate approval`, forbiddenFields);

  const soleMaintainerProtocol =
    protocol.decision_authority !== undefined &&
    canonicalDigest(protocol.decision_authority) ===
      canonicalDigest(SOLE_MAINTAINER_AUTHORITY);
  if (soleMaintainerProtocol) {
    for (const contract of [
      {
        active: catalog.status === "ACCEPTED",
        kind: "CATALOG_ACCEPTED",
        document: catalog,
        envelope: catalog.review,
        excluded: ["catalog_digest", "review"],
        decision: "ACCEPTED",
        approvedBy: catalog.review?.reviewed_by,
        approvedAt: catalog.review?.reviewed_at,
        label: `${label} catalog approval`,
      },
      {
        active: protocol.status === "APPROVED",
        kind: "PROTOCOL_APPROVED",
        document: protocol,
        envelope: protocol.approval,
        excluded: ["protocol_digest", "approval"],
        decision: "APPROVED",
        approvedBy: protocol.approval?.approved_by,
        approvedAt: protocol.approval?.approved_at,
        label: `${label} protocol approval`,
      },
      {
        active: candidate.approval?.status === "APPROVED",
        kind: "CANDIDATE_APPROVED",
        document: candidate,
        envelope: candidate.approval,
        excluded: ["candidate_scope_manifest_id", "manifest_digest", "approval"],
        decision: "APPROVED",
        approvedBy: candidate.approval?.approved_by,
        approvedAt: candidate.approval?.approved_at,
        label: `${label} candidate approval`,
      },
    ]) {
      if (!contract.active) continue;
      invariant(
        isSha256(contract.envelope?.signed_payload_digest) &&
          isSha256(contract.envelope?.approval_proof_digest),
        `${contract.label} proof fields are incomplete.`,
      );
      const verified = verifyTrustedProof(root, {
        kind: contract.kind,
        payloadDigest: contract.envelope.signed_payload_digest,
        payloadBytes: canonicalPayloadBytes(contract.document, contract.excluded),
        proofDigest: contract.envelope.approval_proof_digest,
        expectedDecision: contract.decision,
      });
      invariant(
        contract.approvedBy === verified.actor &&
          contract.envelope.approver_role_version === verified.roleVersion &&
          new Date(contract.approvedAt).toISOString() === verified.decisionAt,
        `${contract.label} does not match its verified maintainer decision.`,
      );
    }
  }

  return { specManifest, catalog, protocol, candidate };
};

export const checkpointStateFromDocument = (checkpoint) => ({
  spec_manifest_digest: checkpoint.spec_manifest_digest,
  normative_set_digest: checkpoint.normative_set_digest,
  catalog_digest: checkpoint.catalog_digest,
  research_protocol_digest: checkpoint.research_protocol_digest,
  candidate_scope_manifest_digest: checkpoint.candidate_scope_manifest_digest,
  candidate_artifact_digest: checkpoint.candidate_artifact_digest,
  verification_toolchain_digest: checkpoint.verification_toolchain_digest,
  gate_registry_digest: checkpoint.gate_registry_digest,
  gate_head_set_digest: checkpoint.gate_head_set_digest,
  evidence_manifest_set_digest: checkpoint.evidence_manifest_set_digest,
  registry_digests: checkpoint.registry_digests,
  record_counts: checkpoint.record_counts,
});

const checkpointRootPayload = (checkpoint) => ({
  sequence: checkpoint.sequence,
  created_at: checkpoint.created_at,
  previous: checkpoint.previous,
  ...checkpointStateFromDocument(checkpoint),
});

const verifyCheckpointTrust = (root, checkpoint, { bundlePath } = {}) => {
  const verified = verifyTrustedProof(root, {
    kind: "CHECKPOINT_ROOT",
    payloadDigest: checkpoint.registry_root_digest,
    payloadBytes: canonicalPayloadBytes(checkpointRootPayload(checkpoint)),
    proofDigest: checkpoint.signature?.proof_digest,
    bundlePath,
    expectedDecision: "VERIFIED",
  });
  invariant(
    checkpoint.signature?.signer === verified.signer &&
      checkpoint.signature?.signature === verified.signatureValue,
    "Checkpoint signature envelope does not match the verified Sigstore bundle.",
  );
  invariant(
    checkpoint.external_anchor?.provider === verified.anchor.provider &&
      checkpoint.external_anchor?.reference === verified.anchor.reference &&
      new Date(checkpoint.external_anchor?.anchored_at).toISOString() ===
        verified.anchor.anchoredAt,
    "Checkpoint external anchor does not match the verified Rekor entry.",
  );
  return verified;
};

const previousCheckpointReference = (checkpoint) =>
  checkpoint
    ? {
        checkpoint_id: checkpoint.checkpoint_id,
        checkpoint_digest: checkpoint.checkpoint_digest,
        registry_root_digest: checkpoint.registry_root_digest,
        record_counts: checkpoint.record_counts,
      }
    : null;

export const checkpointTrustRequestFromDocument = (checkpoint) => ({
  schema_version: "rolefox.checkpoint-trust-request.v1",
  created_at: checkpoint.created_at,
  sequence: checkpoint.sequence,
  previous_checkpoint: checkpoint.previous,
  ...checkpointStateFromDocument(checkpoint),
  gate_heads: checkpoint.gate_heads,
  evidence_manifest_refs: checkpoint.evidence_manifest_refs,
  registry_root_digest: checkpoint.registry_root_digest,
  required_signature_payload_digest: checkpoint.registry_root_digest,
  required_external_anchor_payload_digest: checkpoint.registry_root_digest,
});

const validateCheckpointTrustRequest = (
  request,
  { previousCheckpoint, state, gateHeadRefs, evidenceRefs },
) => {
  invariant(
    request && typeof request === "object" && !Array.isArray(request),
    "Trust envelope must contain a checkpoint prepare_request object.",
  );
  invariant(
    request.schema_version === "rolefox.checkpoint-trust-request.v1",
    "Unsupported checkpoint prepare request schema.",
  );
  invariant(
    typeof request.created_at === "string" &&
      Number.isFinite(Date.parse(request.created_at)),
    "Checkpoint prepare request created_at is invalid.",
  );

  const expectedSequence = (previousCheckpoint?.sequence ?? 0) + 1;
  const expectedPrevious = previousCheckpointReference(previousCheckpoint);
  invariant(
    request.sequence === expectedSequence,
    "Checkpoint prepare request sequence no longer follows the checkpoint chain.",
  );
  invariant(
    canonicalDigest(request.previous_checkpoint) === canonicalDigest(expectedPrevious),
    "Checkpoint prepare request previous_checkpoint no longer matches the checkpoint chain.",
  );
  if (previousCheckpoint) {
    invariant(
      Date.parse(request.created_at) >= Date.parse(previousCheckpoint.created_at),
      "Checkpoint prepare request predates its predecessor.",
    );
  }

  const requestState = checkpointStateFromDocument(request);
  invariant(
    canonicalDigest(requestState) === canonicalDigest(state),
    "Registry state changed after the checkpoint prepare request was created.",
  );
  invariant(
    canonicalDigest(request.gate_heads) === canonicalDigest(gateHeadRefs) &&
      canonicalDigest(request.evidence_manifest_refs) === canonicalDigest(evidenceRefs),
    "Registry sets changed after the checkpoint prepare request was created.",
  );

  const expectedRootDigest = canonicalDigest({
    sequence: request.sequence,
    created_at: request.created_at,
    previous: request.previous_checkpoint,
    ...requestState,
  });
  invariant(
    request.registry_root_digest === expectedRootDigest,
    "Checkpoint prepare request registry root digest is invalid.",
  );
  invariant(
    request.required_signature_payload_digest === expectedRootDigest &&
      request.required_external_anchor_payload_digest === expectedRootDigest,
    "Checkpoint prepare request trust payload digests are invalid.",
  );
};

export function loadCheckpointChain(root) {
  assertSafeRepositoryStorage(root, Object.values(PATHS));
  const checkpointDirectory = absolute(root, PATHS.checkpointDirectory);
  const gateRegistryPath = absolute(root, PATHS.gateRegistry);
  const currentGateRecords = parseJsonLines(gateRegistryPath);
  const currentEvidenceRefs = new Map(
    jsonFiles(absolute(root, PATHS.evidenceDirectory)).map((file) => {
      const evidence = readJson(file);
      validateSchema(root, SCHEMA_NAMES.evidence, evidence, `Evidence ${path.basename(file)}`);
      verifyEvidenceDocument(evidence);
      invariant(
        path.basename(file) === `${evidence.evidence_id}.json`,
        `Evidence filename does not match its ID: ${file}`,
      );
      const historical = validateHistoricalBindings(root, {
        specManifestDigest: evidence.spec_manifest_ref?.manifest_digest,
        normativeSetDigest: evidence.spec_manifest_ref?.normative_set_digest,
        catalogDigest: evidence.required_release_scope_catalog_ref?.catalog_digest,
        researchProtocolDigest: evidence.research_protocol_ref?.protocol_digest,
        candidateScopeManifestId:
          evidence.candidate_scope_manifest_ref?.candidate_scope_manifest_id,
        candidateScopeManifestDigest:
          evidence.candidate_scope_manifest_ref?.manifest_digest,
        candidateArtifactDigest: evidence.candidate_artifact_digest,
        label: `Evidence ${evidence.evidence_id}`,
      });
      assertNoSensitivePublicData(
        evidence,
        `Evidence ${evidence.evidence_id}`,
        historical.protocol.privacy?.forbidden_public_fields ?? [],
      );
      validateEvidenceProducer(root, evidence.producer);
      invariant(
        evidence.attestation?.status === "VERIFIED" &&
          evidence.attestation?.signed_payload_digest === evidence.manifest_digest &&
          isSha256(evidence.attestation?.proof_digest),
        `Evidence ${evidence.evidence_id} is not cryptographically attested.`,
      );
      const verifiedEvidence = verifyTrustedProof(root, {
        kind: "EVIDENCE_VERIFIED",
        payloadDigest: evidence.manifest_digest,
        payloadBytes: canonicalPayloadBytes(evidence, [
          "evidence_id",
          "manifest_digest",
          "record_digest",
          "attestation",
          "signature",
        ]),
        proofDigest: evidence.attestation.proof_digest,
        expectedDecision: "VERIFIED",
      });
      invariant(
        evidence.attestation.attested_by === verifiedEvidence.signer &&
          new Date(evidence.attestation.attested_at).toISOString() ===
            verifiedEvidence.attestedAt &&
          evidence.producer.identity !== verifiedEvidence.signer,
        `Evidence ${evidence.evidence_id} attestation envelope does not match its verified proof.`,
      );
      return [
        evidence.evidence_id,
        {
          manifest_digest: evidence.manifest_digest,
          record_digest: evidence.record_digest,
          document: evidence,
        },
      ];
    }),
  );
  for (const record of currentGateRecords) {
    validateSchema(root, SCHEMA_NAMES.gate, record, `Gate ${record.record_id ?? "record"}`);
    const historical = validateHistoricalBindings(root, {
      specManifestDigest: record.spec_manifest_ref?.manifest_digest,
      normativeSetDigest: record.spec_manifest_ref?.normative_set_digest,
      catalogDigest: record.required_release_scope_catalog_ref?.catalog_digest,
      researchProtocolDigest: record.research_protocol_ref?.protocol_digest,
      candidateScopeManifestId:
        record.candidate_scope_manifest_ref?.candidate_scope_manifest_id,
      candidateScopeManifestDigest:
        record.candidate_scope_manifest_ref?.manifest_digest,
      candidateArtifactDigest: record.candidate_artifact_digest,
      verificationToolchainDigest: record.verification_toolchain_digest,
      label: `Gate ${record.record_id ?? "record"}`,
    });
    assertNoSensitivePublicData(
      record,
      `Gate ${record.record_id ?? "record"}`,
      historical.protocol.privacy?.forbidden_public_fields ?? [],
    );
    if (["PASS", "ACCEPTED_FALLBACK", "FAIL"].includes(record.result)) {
      const kind = {
        PASS: "GATE_PASS",
        ACCEPTED_FALLBACK: "GATE_ACCEPTED_FALLBACK",
        FAIL: "GATE_FAIL",
      }[record.result];
      invariant(
        isSha256(record.approval_payload_digest) &&
          isSha256(record.approval_proof_digest),
        `Gate ${record.record_id ?? "record"} trust proof fields are incomplete.`,
      );
      const verifiedGate = verifyTrustedProof(root, {
        kind,
        payloadDigest: record.approval_payload_digest,
        payloadBytes: canonicalPayloadBytes(record, [
          "record_id",
          "record_digest",
          "approval_payload_digest",
          "approval_proof_digest",
        ]),
        proofDigest: record.approval_proof_digest,
        expectedDecision: record.result,
      });
      invariant(
        record.approved_by === verifiedGate.actor &&
          record.approver_role_version === verifiedGate.roleVersion &&
          Date.parse(verifiedGate.decisionAt) >=
            Math.max(Date.parse(record.approved_at), Date.parse(record.decided_at)),
        `Gate ${record.record_id ?? "record"} decision does not match its verified maintainer proof.`,
      );
    }
    invariant(
      record.criteria_version === historical.protocol.protocol_version,
      `Gate ${record.record_id ?? "record"} criteria version does not match its protocol snapshot.`,
    );
    const evidenceReferences = Array.isArray(record.evidence_manifest_refs)
      ? record.evidence_manifest_refs
      : [];
    const referencedEvidence = evidenceReferences.map((reference) => {
      const current = currentEvidenceRefs.get(reference?.evidence_id);
      invariant(
        current &&
          current.manifest_digest === reference.manifest_digest &&
          current.record_digest === reference.record_digest,
        `Gate ${record.record_id ?? "record"} has a missing or stale Evidence reference.`,
      );
      const evidence = current.document;
      invariant(
        evidence.candidate_artifact_digest === record.candidate_artifact_digest &&
          evidence.candidate_scope_manifest_ref?.candidate_scope_manifest_id ===
            record.candidate_scope_manifest_ref?.candidate_scope_manifest_id &&
          evidence.candidate_scope_manifest_ref?.manifest_digest ===
            record.candidate_scope_manifest_ref?.manifest_digest &&
          evidence.spec_manifest_ref?.manifest_digest ===
            record.spec_manifest_ref?.manifest_digest &&
          evidence.spec_manifest_ref?.normative_set_digest ===
            record.spec_manifest_ref?.normative_set_digest &&
          evidence.required_release_scope_catalog_ref?.catalog_digest ===
            record.required_release_scope_catalog_ref?.catalog_digest &&
          evidence.research_protocol_ref?.protocol_digest ===
            record.research_protocol_ref?.protocol_digest,
        `Gate ${record.record_id ?? "record"} references Evidence from another frozen candidate.`,
      );
      return evidence;
    });
    if (["PASS", "ACCEPTED_FALLBACK", "FAIL"].includes(record.result)) {
      invariant(
        referencedEvidence.length > 0,
        `Decided Gate ${record.record_id ?? "record"} must reference Evidence.`,
      );
      for (const evidence of referencedEvidence) {
        invariant(
          evidence.attestation?.status === "VERIFIED" &&
            evidence.attestation?.signed_payload_digest === evidence.manifest_digest &&
            isSha256(evidence.attestation?.proof_digest),
          `Decided Gate ${record.record_id ?? "record"} references formally unattested Evidence ${evidence.evidence_id}.`,
        );
        invariant(
          Date.parse(record.submitted_at) >= Date.parse(evidence.completed_at),
          `Gate ${record.record_id ?? "record"} predates Evidence ${evidence.evidence_id} completion.`,
        );
      }
      if (["PASS", "ACCEPTED_FALLBACK"].includes(record.result)) {
        invariant(
          referencedEvidence.every((evidence) => evidence.result === "PASS"),
          `Successful Gate ${record.record_id ?? "record"} references non-PASS Evidence.`,
        );
        invariant(
          new Set(referencedEvidence.map((evidence) => evidence.evidence_kind)).size >= 3,
          `Successful Gate ${record.record_id ?? "record"} does not reference all three Pre-W1 Evidence kinds.`,
        );
      } else {
        invariant(
          referencedEvidence.every((evidence) => ["PASS", "FAIL"].includes(evidence.result)) &&
            referencedEvidence.some((evidence) => evidence.result === "FAIL"),
          `FAIL Gate ${record.record_id ?? "record"} must reference at least one failed, non-inconclusive Evidence manifest.`,
        );
      }
    }
  }
  const checkpoints = jsonFiles(checkpointDirectory).map((file) => {
    const checkpoint = readJson(file);
    invariant(
      checkpoint.schema_version === "rolefox.registry-checkpoint.v1",
      `Unexpected JSON file in checkpoint directory: ${file}`,
    );
    validateSchema(root, SCHEMA_NAMES.checkpoint, checkpoint, `Checkpoint ${path.basename(file)}`);
    verifyCheckpointDocument(checkpoint);
    invariant(
      path.basename(file) === `${checkpoint.checkpoint_id}.json`,
      `Checkpoint filename does not match its ID: ${file}`,
    );
    return checkpoint;
  });
  checkpoints.sort((left, right) => left.sequence - right.sequence);

  checkpoints.forEach((checkpoint, index) => {
    invariant(
      typeof checkpoint.created_at === "string" &&
        Number.isFinite(Date.parse(checkpoint.created_at)),
      `Invalid checkpoint timestamp at ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      [
        checkpoint.spec_manifest_digest,
        checkpoint.normative_set_digest,
        checkpoint.catalog_digest,
        checkpoint.research_protocol_digest,
        checkpoint.candidate_scope_manifest_digest,
        checkpoint.candidate_artifact_digest,
        checkpoint.verification_toolchain_digest,
        checkpoint.gate_registry_digest,
        checkpoint.gate_head_set_digest,
        checkpoint.evidence_manifest_set_digest,
        checkpoint.registry_root_digest,
      ].every(isSha256),
      `Invalid digest field at ${checkpoint.checkpoint_id}.`,
    );
    const historical = validateHistoricalBindings(root, {
      specManifestDigest: checkpoint.spec_manifest_digest,
      normativeSetDigest: checkpoint.normative_set_digest,
      catalogDigest: checkpoint.catalog_digest,
      researchProtocolDigest: checkpoint.research_protocol_digest,
      candidateScopeManifestDigest: checkpoint.candidate_scope_manifest_digest,
      candidateArtifactDigest: checkpoint.candidate_artifact_digest,
      verificationToolchainDigest: checkpoint.verification_toolchain_digest,
      label: `Checkpoint ${checkpoint.checkpoint_id}`,
    });
    assertNoSensitivePublicData(
      {
        signature: checkpoint.signature,
        external_anchor: checkpoint.external_anchor,
      },
      `Checkpoint ${checkpoint.checkpoint_id} trust envelope`,
      historical.protocol.privacy?.forbidden_public_fields ?? [],
    );
    invariant(
      checkpoint.record_counts &&
        Object.values(checkpoint.record_counts).every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        ) &&
        Array.isArray(checkpoint.gate_heads) &&
        Array.isArray(checkpoint.evidence_manifest_refs),
      `Invalid checkpoint counts or sets at ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      checkpoint.sequence === index + 1,
      `Checkpoint sequence must be contiguous at ${checkpoint.checkpoint_id}.`,
    );
    const previous = checkpoints[index - 1];
    if (!previous) {
      invariant(checkpoint.previous === null, "Genesis checkpoint must have previous=null.");
    } else {
      invariant(
        checkpoint.previous?.checkpoint_id === previous.checkpoint_id &&
          checkpoint.previous?.checkpoint_digest === previous.checkpoint_digest &&
          checkpoint.previous?.registry_root_digest === previous.registry_root_digest &&
          canonicalDigest(checkpoint.previous?.record_counts) ===
            canonicalDigest(previous.record_counts),
        `Broken checkpoint link at ${checkpoint.checkpoint_id}.`,
      );
      invariant(
        Date.parse(checkpoint.created_at) >= Date.parse(previous.created_at),
        `Checkpoint time moved backwards at ${checkpoint.checkpoint_id}.`,
      );
      invariant(
        checkpoint.record_counts.gate_records >= previous.record_counts.gate_records &&
          checkpoint.record_counts.evidence_manifests >=
            previous.record_counts.evidence_manifests,
        `Checkpoint counts rolled back at ${checkpoint.checkpoint_id}.`,
      );
      const priorEvidence = new Set(
        previous.evidence_manifest_refs.map((entry) =>
          `${entry.evidence_id}\u0000${entry.manifest_digest}\u0000${entry.record_digest}`,
        ),
      );
      const currentEvidence = new Set(
        checkpoint.evidence_manifest_refs.map((entry) =>
          `${entry.evidence_id}\u0000${entry.manifest_digest}\u0000${entry.record_digest}`,
        ),
      );
      invariant(
        [...priorEvidence].every((entry) => currentEvidence.has(entry)),
        `Checkpoint evidence set rolled back at ${checkpoint.checkpoint_id}.`,
      );
    }

    invariant(
      checkpoint.record_counts.gate_records <= currentGateRecords.length,
      `Gate registry was truncated before ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      checkpoint.record_counts.evidence_manifests ===
        checkpoint.evidence_manifest_refs.length,
      `Evidence count mismatch at ${checkpoint.checkpoint_id}.`,
    );
    const evidenceRefKeys = checkpoint.evidence_manifest_refs.map(
      (entry) =>
        `${entry.evidence_id}\u0000${entry.manifest_digest}\u0000${entry.record_digest}`,
    );
    invariant(
      new Set(evidenceRefKeys).size === evidenceRefKeys.length,
      `Duplicate evidence ref at ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      checkpoint.evidence_manifest_refs.every(
        (entry) => {
          const current = currentEvidenceRefs.get(entry.evidence_id);
          return (
            current?.manifest_digest === entry.manifest_digest &&
            current?.record_digest === entry.record_digest
          );
        },
      ),
      `Checkpoint evidence is missing or changed at ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      checkpoint.evidence_manifest_set_digest ===
        canonicalDigest(checkpoint.evidence_manifest_refs),
      `Evidence set digest mismatch at ${checkpoint.checkpoint_id}.`,
    );

    const gatePrefix = currentGateRecords.slice(0, checkpoint.record_counts.gate_records);
    const expectedHeads = validateGateChains(gatePrefix).map((record) => ({
      gate_id: record.gate_id,
      scope_id: record.scope_id,
      record_id: record.record_id,
      record_digest: record.record_digest,
      result: record.result,
    }));
    invariant(
      checkpoint.record_counts.gate_records === gatePrefix.length &&
        checkpoint.gate_registry_digest ===
          digestJsonlPrefix(gateRegistryPath, checkpoint.record_counts.gate_records),
      `Gate registry prefix mismatch at ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      canonicalDigest(checkpoint.gate_heads) === canonicalDigest(expectedHeads) &&
        checkpoint.gate_head_set_digest === canonicalDigest(checkpoint.gate_heads),
      `Gate head set mismatch at ${checkpoint.checkpoint_id}.`,
    );

    invariant(
      checkpoint.registry_root_digest ===
        canonicalDigest({
          sequence: checkpoint.sequence,
          created_at: checkpoint.created_at,
          previous: checkpoint.previous,
          ...checkpointStateFromDocument(checkpoint),
        }),
      `Registry root digest mismatch at ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      checkpoint.signature?.signed_payload_digest === checkpoint.registry_root_digest,
      `Checkpoint signature payload mismatch at ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      ["PENDING_TRUSTED_SIGNER", "VERIFIED_TRUSTED_SIGNER"].includes(
        checkpoint.signature?.status,
      ),
      `Invalid checkpoint signature status at ${checkpoint.checkpoint_id}.`,
    );
    if (checkpoint.signature.status === "VERIFIED_TRUSTED_SIGNER") {
      invariant(
        typeof checkpoint.signature.signer === "string" &&
          checkpoint.signature.signer.length > 0 &&
          typeof checkpoint.signature.signature === "string" &&
          checkpoint.signature.signature.length > 0 &&
          isSha256(checkpoint.signature.proof_digest),
        `Verified checkpoint signature is incomplete at ${checkpoint.checkpoint_id}.`,
      );
    }
    invariant(
      checkpoint.external_anchor?.anchored_payload_digest ===
        checkpoint.registry_root_digest,
      `Checkpoint anchor payload mismatch at ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      ["NOT_CONFIGURED", "PENDING_EXTERNAL_ANCHOR", "VERIFIED_EXTERNAL_ANCHOR"].includes(
        checkpoint.external_anchor?.status,
      ),
      `Invalid checkpoint anchor status at ${checkpoint.checkpoint_id}.`,
    );
    invariant(
      (checkpoint.signature.status === "VERIFIED_TRUSTED_SIGNER") ===
        (checkpoint.external_anchor.status === "VERIFIED_EXTERNAL_ANCHOR"),
      `Checkpoint signature and external anchor must be verified together at ${checkpoint.checkpoint_id}.`,
    );
    if (checkpoint.external_anchor.status === "VERIFIED_EXTERNAL_ANCHOR") {
      invariant(
        typeof checkpoint.external_anchor.provider === "string" &&
          checkpoint.external_anchor.provider.length > 0 &&
          typeof checkpoint.external_anchor.reference === "string" &&
          checkpoint.external_anchor.reference.length > 0 &&
          typeof checkpoint.external_anchor.anchored_at === "string" &&
          Number.isFinite(Date.parse(checkpoint.external_anchor.anchored_at)),
        `Verified checkpoint anchor is incomplete at ${checkpoint.checkpoint_id}.`,
      );
      invariant(
        Date.parse(checkpoint.external_anchor.anchored_at) >=
          Date.parse(checkpoint.created_at),
        `Checkpoint was anchored before creation at ${checkpoint.checkpoint_id}.`,
      );
      invariant(
        checkpoint.signature.status === "VERIFIED_TRUSTED_SIGNER",
        `Checkpoint anchor cannot be verified without its matching signature at ${checkpoint.checkpoint_id}.`,
      );
      verifyCheckpointTrust(root, checkpoint);
    }
  });
  return checkpoints;
}

export function collectRegistryState(root) {
  assertSafeRepositoryStorage(root, Object.values(PATHS));
  const specManifest = readJson(absolute(root, PATHS.specManifest));
  const catalog = readJson(absolute(root, PATHS.catalog));
  const protocol = readJson(absolute(root, PATHS.protocol));
  validateSchema(root, SCHEMA_NAMES.specManifest, specManifest, "Current Spec Manifest");
  validateSchema(root, SCHEMA_NAMES.catalog, catalog, "Current release-scope catalog");
  validateSchema(root, SCHEMA_NAMES.protocol, protocol, "Current research protocol");
  verifyFixedDigest(specManifest, "manifest_digest", "Current Spec Manifest");
  verifyFixedDigest(catalog, "catalog_digest", "Current release-scope catalog");
  verifyFixedDigest(protocol, "protocol_digest", "Current research protocol");
  const archivedSpecManifest = readSnapshot(root, {
    directory: PATHS.specManifestSnapshotDirectory,
    prefix: "spec",
    digest: specManifest.manifest_digest,
    digestField: "manifest_digest",
    schemaName: SCHEMA_NAMES.specManifest,
    label: "Current Spec Manifest",
  });
  const archivedCatalog = readSnapshot(root, {
    directory: PATHS.catalogSnapshotDirectory,
    prefix: "catalog",
    digest: catalog.catalog_digest,
    digestField: "catalog_digest",
    schemaName: SCHEMA_NAMES.catalog,
    label: "Current release-scope catalog",
  });
  const archivedProtocol = readSnapshot(root, {
    directory: PATHS.protocolSnapshotDirectory,
    prefix: "protocol",
    digest: protocol.protocol_digest,
    digestField: "protocol_digest",
    schemaName: SCHEMA_NAMES.protocol,
    label: "Current research protocol",
  });
  invariant(
    canonicalDigest(archivedSpecManifest) === canonicalDigest(specManifest) &&
      canonicalDigest(archivedCatalog) === canonicalDigest(catalog) &&
      canonicalDigest(archivedProtocol) === canonicalDigest(protocol),
    "Current authority documents do not exactly match their immutable snapshots.",
  );
  const candidateIndex = readJson(absolute(root, PATHS.candidateIndex));
  assertRepositoryRelativePath(candidateIndex.path);
  invariant(
    candidateIndex.path.startsWith(`${PATHS.candidateDirectory}/candidate_`),
    "Current candidate pointer must reference the candidate-scopes directory.",
  );
  const candidatePath = resolveRepositoryPath(root, candidateIndex.path);
  const candidate = readJson(candidatePath);
  validateSchema(root, SCHEMA_NAMES.candidate, candidate, "Current Candidate Scope Manifest");
  invariant(
    canonicalDigest(specManifest.verification_toolchain) ===
      canonicalDigest(digestFileSet(root, VERIFICATION_TOOLCHAIN_FILES)),
    "Spec Manifest verification toolchain is stale.",
  );
  verifyAddressedDocument(candidate, {
    prefix: "candidate",
    idField: "candidate_scope_manifest_id",
    digestField: "manifest_digest",
  });
  invariant(
    path.basename(candidatePath) === `${candidate.candidate_scope_manifest_id}.json` &&
      candidateIndex.candidate_scope_manifest_id === candidate.candidate_scope_manifest_id &&
      candidateIndex.manifest_digest === candidate.manifest_digest,
    "Current candidate pointer does not match its target.",
  );
  invariant(
    candidate.verification_toolchain_ref?.digest ===
      specManifest.verification_toolchain?.digest,
    "Current candidate is not bound to the current verification toolchain.",
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
    label: "Current registry state",
  });

  const gateRegistryPath = absolute(root, PATHS.gateRegistry);
  const gateRecords = parseJsonLines(gateRegistryPath);
  const gateHeads = validateGateChains(gateRecords);
  const gateHeadRefs = gateHeads.map((record) => ({
    gate_id: record.gate_id,
    scope_id: record.scope_id,
    record_id: record.record_id,
    record_digest: record.record_digest,
    result: record.result,
  }));

  const evidenceFiles = jsonFiles(absolute(root, PATHS.evidenceDirectory));
  const evidenceRefs = evidenceFiles.map((file) => {
    const evidence = readJson(file);
    verifyEvidenceDocument(evidence);
    invariant(
      path.basename(file) === `${evidence.evidence_id}.json`,
      `Evidence filename does not match its ID: ${file}`,
    );
    return {
      evidence_id: evidence.evidence_id,
      manifest_digest: evidence.manifest_digest,
      record_digest: evidence.record_digest,
    };
  });
  evidenceRefs.sort((left, right) => compareText(left.evidence_id, right.evidence_id));

  const registryDigests = {
    case_evidence_requirements: null,
    case_verification: null,
    journey_invariant_verification: null,
    lifecycle_state: "NOT_CREATED_PRE_W1",
  };

  return {
    context: {
      specManifest,
      catalog,
      protocol,
      candidateIndex,
      candidate,
      gateRecords,
      gateHeads,
      evidenceRefs,
    },
    state: {
      spec_manifest_digest: specManifest.manifest_digest,
      normative_set_digest: specManifest.normative_set_digest,
      catalog_digest: catalog.catalog_digest,
      research_protocol_digest: protocol.protocol_digest,
      candidate_scope_manifest_digest: candidate.manifest_digest,
      candidate_artifact_digest: candidate.candidate_artifact_digest,
      verification_toolchain_digest: specManifest.verification_toolchain.digest,
      gate_registry_digest: digestJsonl(gateRegistryPath),
      gate_head_set_digest: canonicalDigest(gateHeadRefs),
      evidence_manifest_set_digest: canonicalDigest(evidenceRefs),
      registry_digests: registryDigests,
      record_counts: {
        gate_records: gateRecords.length,
        evidence_manifests: evidenceRefs.length,
        case_evidence_requirements: 0,
        case_verification: 0,
        journey_invariant_verification: 0,
      },
    },
    gateHeadRefs,
    evidenceRefs,
  };
}

export function createCurrentCheckpoint(
  root,
  {
    force = false,
    signature,
    externalAnchor,
    createdAt = new Date().toISOString(),
    persist = true,
    trustRequest,
    trustVerifier = verifyCheckpointTrust,
  } = {},
) {
  const checkpoints = loadCheckpointChain(root);
  const previousCheckpoint = checkpoints.at(-1);
  const { state, gateHeadRefs, evidenceRefs } = collectRegistryState(root);

  if (trustRequest) {
    validateCheckpointTrustRequest(trustRequest, {
      previousCheckpoint,
      state,
      gateHeadRefs,
      evidenceRefs,
    });
    createdAt = trustRequest.created_at;
  }

  if (
    !force &&
    previousCheckpoint &&
    canonicalDigest(checkpointStateFromDocument(previousCheckpoint)) ===
      canonicalDigest(state)
  ) {
    return { checkpoint: previousCheckpoint, disposition: "unchanged" };
  }

  invariant(
    typeof createdAt === "string" && Number.isFinite(Date.parse(createdAt)),
    "Checkpoint created_at is invalid.",
  );
  invariant(
    !previousCheckpoint ||
      Date.parse(createdAt) >= Date.parse(previousCheckpoint.created_at),
    "Checkpoint cannot predate its predecessor.",
  );

  const sequence = (previousCheckpoint?.sequence ?? 0) + 1;
  const previous = previousCheckpointReference(previousCheckpoint);
  const registryRootDigest = canonicalDigest({
    sequence,
    created_at: createdAt,
    previous,
    ...state,
  });
  if (trustRequest) {
    invariant(
      sequence === trustRequest.sequence &&
        canonicalDigest(previous) ===
          canonicalDigest(trustRequest.previous_checkpoint) &&
        registryRootDigest === trustRequest.registry_root_digest,
      "Checkpoint prepare request does not reproduce the finalized checkpoint root.",
    );
  }
  const normalizedSignature = signature ?? {
    status: "PENDING_TRUSTED_SIGNER",
    signer: null,
    signed_payload_digest: registryRootDigest,
    signature: null,
  };
  const normalizedExternalAnchor = externalAnchor ?? {
    status: "NOT_CONFIGURED",
    provider: null,
    reference: null,
    anchored_at: null,
    anchored_payload_digest: registryRootDigest,
  };

  invariant(
    normalizedSignature.signed_payload_digest === registryRootDigest,
    "Checkpoint signature must cover the current registry root digest.",
  );
  invariant(
    ["PENDING_TRUSTED_SIGNER", "VERIFIED_TRUSTED_SIGNER"].includes(
      normalizedSignature.status,
    ),
    "Checkpoint signature status is invalid.",
  );
  if (normalizedSignature.status === "VERIFIED_TRUSTED_SIGNER") {
    invariant(
      TRUST_VERIFICATION_STATUS === "IMPLEMENTED",
      "Cannot mark a checkpoint signature verified while trust verification is not implemented.",
    );
    invariant(
      typeof normalizedSignature.signer === "string" &&
        normalizedSignature.signer.length > 0 &&
        typeof normalizedSignature.signature === "string" &&
        normalizedSignature.signature.length > 0 &&
        isSha256(normalizedSignature.proof_digest),
      "Verified checkpoint signature is incomplete.",
    );
  }
  invariant(
    normalizedExternalAnchor.anchored_payload_digest === registryRootDigest,
    "Checkpoint external anchor must cover the current registry root digest.",
  );
  invariant(
    ["NOT_CONFIGURED", "PENDING_EXTERNAL_ANCHOR", "VERIFIED_EXTERNAL_ANCHOR"].includes(
      normalizedExternalAnchor.status,
    ),
    "Checkpoint external anchor status is invalid.",
  );
  if (normalizedExternalAnchor.status === "VERIFIED_EXTERNAL_ANCHOR") {
    invariant(
      TRUST_VERIFICATION_STATUS === "IMPLEMENTED",
      "Cannot mark an external anchor verified while trust verification is not implemented.",
    );
    invariant(
      typeof normalizedExternalAnchor.provider === "string" &&
        normalizedExternalAnchor.provider.length > 0 &&
        typeof normalizedExternalAnchor.reference === "string" &&
        normalizedExternalAnchor.reference.length > 0 &&
        typeof normalizedExternalAnchor.anchored_at === "string" &&
        Number.isFinite(Date.parse(normalizedExternalAnchor.anchored_at)),
      "Verified checkpoint external anchor is incomplete.",
    );
    invariant(
      Date.parse(normalizedExternalAnchor.anchored_at) >= Date.parse(createdAt),
      "Checkpoint external anchor cannot predate checkpoint creation.",
    );
  }
  invariant(
    (normalizedSignature.status === "VERIFIED_TRUSTED_SIGNER") ===
      (normalizedExternalAnchor.status === "VERIFIED_EXTERNAL_ANCHOR"),
    "Checkpoint signature and external anchor must be verified together.",
  );

  if (normalizedSignature.status === "VERIFIED_TRUSTED_SIGNER") {
    trustVerifier(root, {
      sequence,
      created_at: createdAt,
      previous,
      ...state,
      registry_root_digest: registryRootDigest,
      signature: normalizedSignature,
      external_anchor: normalizedExternalAnchor,
    });
  }

  const checkpoint = addressDocument(
    {
      schema_version: "rolefox.registry-checkpoint.v1",
      checkpoint_id: null,
      checkpoint_digest: null,
      sequence,
      created_at: createdAt,
      previous,
      ...state,
      gate_heads: gateHeadRefs,
      evidence_manifest_refs: evidenceRefs,
      registry_root_digest: registryRootDigest,
      signature: normalizedSignature,
      external_anchor: normalizedExternalAnchor,
    },
    {
      prefix: "checkpoint",
      idField: "checkpoint_id",
      digestField: "checkpoint_digest",
    },
  );
  const checkpointPath = path.join(
    absolute(root, PATHS.checkpointDirectory),
    `${checkpoint.checkpoint_id}.json`,
  );
  validateSchema(root, SCHEMA_NAMES.checkpoint, checkpoint, "Registry Checkpoint");
  const disposition = persist
    ? writeJsonImmutable(checkpointPath, checkpoint)
    : "prepared";
  return { checkpoint, disposition };
}

export function createCheckpointTrustRequest(
  root,
  { createdAt = new Date().toISOString() } = {},
) {
  const { checkpoint } = createCurrentCheckpoint(root, {
    force: true,
    createdAt,
    persist: false,
  });
  return checkpointTrustRequestFromDocument(checkpoint);
}

export function finalizeCheckpointTrustEnvelope(
  root,
  trustEnvelope,
  dependencyOverrides = {},
) {
  const verify = dependencyOverrides.verifyTrustedProof ?? verifyTrustedProof;
  const importProof = dependencyOverrides.importTrustedProof ?? importTrustedProof;
  invariant(
    trustEnvelope && typeof trustEnvelope === "object" && !Array.isArray(trustEnvelope),
    "Checkpoint trust envelope must be an object.",
  );
  if (trustEnvelope.schema_version !== undefined) {
    invariant(
      trustEnvelope.schema_version === "rolefox.checkpoint-trust-envelope.v1",
      "Unsupported checkpoint trust envelope schema.",
    );
  }
  invariant(
    trustEnvelope.prepare_request,
    "Checkpoint trust envelope must include the original prepare_request.",
  );
  invariant(
    typeof trustEnvelope.proof_bundle_path === "string" &&
      trustEnvelope.proof_bundle_path.length > 0,
    "Checkpoint trust envelope must include proof_bundle_path.",
  );
  invariant(
    trustEnvelope.signature === undefined && trustEnvelope.external_anchor === undefined,
    "Checkpoint trust envelope cannot supply self-asserted signature or anchor fields.",
  );

  const { checkpoint: preparedCheckpoint } = createCurrentCheckpoint(root, {
    force: true,
    createdAt: trustEnvelope.prepare_request.created_at,
    persist: false,
    trustRequest: trustEnvelope.prepare_request,
  });
  const verified = verify(root, {
    kind: "CHECKPOINT_ROOT",
    payloadDigest: preparedCheckpoint.registry_root_digest,
    payloadBytes: canonicalPayloadBytes(checkpointRootPayload(preparedCheckpoint)),
    bundlePath: trustEnvelope.proof_bundle_path,
    expectedDecision: "VERIFIED",
  });
  invariant(
    verified?.decision === "VERIFIED" &&
      verified.actor === SOLE_MAINTAINER_AUTHORITY.identity &&
      verified.roleVersion === SOLE_MAINTAINER_AUTHORITY.role_version &&
      verified.signer === TRUSTED_WORKLOAD_IDENTITY &&
      typeof verified.signatureValue === "string" &&
      verified.signatureValue.length >= 16 &&
      isSha256(verified.proofDigest) &&
      typeof verified.anchor?.provider === "string" &&
      verified.anchor.provider.length > 0 &&
      typeof verified.anchor.reference === "string" &&
      verified.anchor.reference.length > 0 &&
      typeof verified.anchor.anchoredAt === "string" &&
      Number.isFinite(Date.parse(verified.anchor.anchoredAt)),
    "Checkpoint trust verifier returned an incomplete or unauthorized result.",
  );
  const imported = importProof(
    root,
    trustEnvelope.proof_bundle_path,
    verified.proofDigest,
  );
  invariant(
    imported?.proofDigest === verified.proofDigest,
    "Imported checkpoint trust proof does not match the verified bundle.",
  );

  return createCurrentCheckpoint(root, {
    force: true,
    signature: {
      status: "VERIFIED_TRUSTED_SIGNER",
      signer: verified.signer,
      signed_payload_digest: preparedCheckpoint.registry_root_digest,
      signature: verified.signatureValue,
      proof_digest: verified.proofDigest,
    },
    externalAnchor: {
      status: "VERIFIED_EXTERNAL_ANCHOR",
      provider: verified.anchor.provider,
      reference: verified.anchor.reference,
      anchored_at: verified.anchor.anchoredAt,
      anchored_payload_digest: preparedCheckpoint.registry_root_digest,
    },
    createdAt: trustEnvelope.prepare_request.created_at,
    persist: true,
    trustRequest: trustEnvelope.prepare_request,
    trustVerifier:
      dependencyOverrides.verifyCheckpointTrust ?? verifyCheckpointTrust,
  });
}
