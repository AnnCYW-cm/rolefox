import fs from "node:fs";
import path from "node:path";

import {
  createCurrentCheckpoint,
  validateHistoricalBindings,
} from "./checkpoint-lib.mjs";
import {
  ACCEPTED_SPEC_FILES,
  GATE_IDS,
  PATHS,
  PRE_W1_RESEARCH_SCOPE_IDS,
  REQUIRED_RELEASE_SCOPE_IDS,
  TRUST_VERIFICATION_STATUS,
  VERIFICATION_TOOLCHAIN_FILES,
} from "./config.mjs";
import {
  addressDocument,
  appendJsonLine,
  assertRepositoryRelativePath,
  assertSafeRepositoryStorage,
  canonicalDigest,
  canonicalDigestExcluding,
  digestFileSet,
  invariant,
  parseJsonLines,
  readJson,
  repositoryRoot,
  resolveRepositoryPath,
  validateGateChains,
  verifyAddressedDocument,
  withVerificationLock,
  writeJsonAtomic,
  writeJsonImmutable,
} from "./lib.mjs";
import { assertNoSensitivePublicData } from "./privacy.mjs";
import { SCHEMA_NAMES, validateSchema } from "./schema.mjs";

const root = repositoryRoot(import.meta.url);
const absolute = (relativePath) => path.join(root, ...relativePath.split("/"));
const now = () => new Date().toISOString();

const digestFixedDocument = (document, field) => {
  const body = structuredClone(document);
  delete body[field];
  return { ...body, [field]: canonicalDigest(body) };
};

const isApprovedAuthority = (status) =>
  status === "ACCEPTED" || status === "APPROVED";

const normalizeAuthorityDocument = (
  input,
  { digestField, envelopeField, approvedStatus, label },
) => {
  const expectedSignedPayloadDigest = canonicalDigestExcluding(input, [
    digestField,
    envelopeField,
  ]);
  const normalized = digestFixedDocument(
    {
      ...input,
      [envelopeField]: {
        ...input[envelopeField],
        signed_payload_digest: expectedSignedPayloadDigest,
      },
    },
    digestField,
  );
  if (input.status === approvedStatus) {
    invariant(
      input[envelopeField]?.signed_payload_digest === expectedSignedPayloadDigest,
      `${label} approved payload changed; create a new pending version instead of carrying its proof forward.`,
    );
    invariant(
      input[digestField] === normalized[digestField],
      `${label} approved digest is stale; approved documents are immutable.`,
    );
    return input;
  }
  return normalized;
};

const discoverDesignFiles = (directory, prefix = "docs") =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        return discoverDesignFiles(path.join(directory, entry.name), relativePath);
      }
      return entry.isFile() && /\.(?:md|csv)$/.test(entry.name) ? [relativePath] : [];
    });

function bootstrap() {
assertSafeRepositoryStorage(root, Object.values(PATHS));
const catalogPath = absolute(PATHS.catalog);
const catalogInput = readJson(catalogPath);
const catalog = normalizeAuthorityDocument(catalogInput, {
  digestField: "catalog_digest",
  envelopeField: "review",
  approvedStatus: "ACCEPTED",
  label: "Required Release Scope Catalog",
});
validateSchema(root, SCHEMA_NAMES.catalog, catalog, "Required Release Scope Catalog");
assertNoSensitivePublicData(catalog.review, "Required Release Scope Catalog review");
if (catalog.status !== "ACCEPTED") writeJsonAtomic(catalogPath, catalog);
writeJsonImmutable(
  path.join(
    absolute(PATHS.catalogSnapshotDirectory),
    `catalog_${catalog.catalog_digest}.json`,
  ),
  catalog,
);

const protocolPath = absolute(PATHS.protocol);
const protocolInput = readJson(protocolPath);
const protocol = normalizeAuthorityDocument(protocolInput, {
  digestField: "protocol_digest",
  envelopeField: "approval",
  approvedStatus: "APPROVED",
  label: "Pre-W1 Research Protocol",
});
validateSchema(root, SCHEMA_NAMES.protocol, protocol, "Pre-W1 Research Protocol");
assertNoSensitivePublicData(protocol.approval, "Pre-W1 Research Protocol approval");
if (protocol.status !== "APPROVED") writeJsonAtomic(protocolPath, protocol);
writeJsonImmutable(
  path.join(
    absolute(PATHS.protocolSnapshotDirectory),
    `protocol_${protocol.protocol_digest}.json`,
  ),
  protocol,
);

const verificationToolchain = digestFileSet(
  root,
  VERIFICATION_TOOLCHAIN_FILES,
);

const unclassifiedDesignFiles = discoverDesignFiles(absolute("docs")).filter(
  (relativePath) => !ACCEPTED_SPEC_FILES.includes(relativePath),
);
invariant(
  unclassifiedDesignFiles.length === 0,
  `Design files require explicit Spec Manifest classification: ${unclassifiedDesignFiles.join(", ")}`,
);

const catalogAccepted = isApprovedAuthority(catalog.status);
const protocolAccepted = isApprovedAuthority(protocol.status);
const inventoryPaths = [
  ...ACCEPTED_SPEC_FILES,
  PATHS.catalog,
  PATHS.protocol,
];
const inventory = inventoryPaths.map((relativePath) => {
  const file = digestFileSet(root, [relativePath]).files[0];
  const isBaselineAccepted = ACCEPTED_SPEC_FILES.includes(relativePath);
  const isCatalog = relativePath === PATHS.catalog;
  const isProtocol = relativePath === PATHS.protocol;
  const isAccepted =
    isBaselineAccepted || (isCatalog && catalogAccepted) || (isProtocol && protocolAccepted);
  return {
    ...file,
    authority_status: isAccepted ? "ACCEPTED" : "PROPOSED",
    included_in_normative_set: isAccepted,
    status_source: isAccepted
      ? isBaselineAccepted
        ? "Pre-W1 normative classification declared by scripts/verification/config.mjs"
        : isCatalog
          ? catalog.status
          : protocol.status
      : isCatalog
        ? catalog.status
        : protocol.status,
    approval_proof_digest: isCatalog
      ? catalog.review.approval_proof_digest
      : isProtocol
        ? protocol.approval.approval_proof_digest
        : null,
  };
});
const normativePaths = inventory
  .filter((entry) => entry.included_in_normative_set)
  .map((entry) => entry.path);
const normativeSet = digestFileSet(root, normativePaths);
const specManifestBody = {
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
    authority_status: catalogAccepted ? "ACCEPTED" : "PROPOSED",
  },
  research_protocol_ref: {
    path: PATHS.protocol,
    protocol_digest: protocol.protocol_digest,
    authority_status: protocolAccepted ? "ACCEPTED" : "PROPOSED",
  },
  inventory,
  generation: {
    tool: "scripts/verification/bootstrap-pre-w1.mjs",
    deterministic_inputs: true,
  },
};
const specManifest = digestFixedDocument(specManifestBody, "manifest_digest");
validateSchema(root, SCHEMA_NAMES.specManifest, specManifest, "Spec Manifest");
writeJsonImmutable(
  path.join(
    absolute(PATHS.specManifestSnapshotDirectory),
    `spec_${specManifest.manifest_digest}.json`,
  ),
  specManifest,
);
writeJsonAtomic(absolute(PATHS.specManifest), specManifest);

const candidateDirectory = absolute(PATHS.candidateDirectory);
const candidateIndexPath = absolute(PATHS.candidateIndex);
fs.mkdirSync(candidateDirectory, { recursive: true });

const candidateInputs = {
  spec_manifest_digest: specManifest.manifest_digest,
  normative_set_digest: specManifest.normative_set_digest,
  catalog_digest: catalog.catalog_digest,
  research_protocol_digest: protocol.protocol_digest,
  verification_toolchain_digest: verificationToolchain.digest,
  release_scope_ids: [...REQUIRED_RELEASE_SCOPE_IDS].sort(),
  research_scope_ids: [...PRE_W1_RESEARCH_SCOPE_IDS].sort(),
};

let candidate;
if (fs.existsSync(candidateIndexPath)) {
  const current = readJson(candidateIndexPath);
  assertRepositoryRelativePath(current.path);
  invariant(
    current.path.startsWith(`${PATHS.candidateDirectory}/candidate_`),
    "Current candidate pointer must reference the candidate-scopes directory.",
  );
  const currentPath = resolveRepositoryPath(root, current.path);
  invariant(fs.existsSync(currentPath), "Current candidate pointer target does not exist.");
  const existing = readJson(currentPath);
  validateSchema(root, SCHEMA_NAMES.candidate, existing, "Current Candidate Scope Manifest");
  invariant(
    existing.approval.signed_payload_digest ===
      canonicalDigestExcluding(existing, [
        "candidate_scope_manifest_id",
        "manifest_digest",
        "approval",
      ]),
    "Candidate approval payload digest is not reproducible.",
  );
  verifyAddressedDocument(existing, {
    prefix: "candidate",
    idField: "candidate_scope_manifest_id",
    digestField: "manifest_digest",
  });
  invariant(
    current.path ===
        `${PATHS.candidateDirectory}/${existing.candidate_scope_manifest_id}.json` &&
      current.candidate_scope_manifest_id === existing.candidate_scope_manifest_id &&
      current.manifest_digest === existing.manifest_digest,
    "Current candidate pointer ID, digest, path, and target must agree.",
  );
  invariant(
    existing.schema_version === "rolefox.candidate-scope-manifest.v1" &&
      existing.manifest_kind === "SPEC_OR_EXPERIMENT" &&
      existing.candidate_artifact_kind === "SPEC_OR_EXPERIMENT" &&
      Array.isArray(existing.software_capabilities_claimed) &&
      existing.software_capabilities_claimed.length === 0 &&
      existing.cohort_and_criteria_frozen === true,
    "Current Pre-W1 candidate manifest has invalid semantics.",
  );
  invariant(
    (existing.approval.status === "PENDING" &&
      existing.collection_guard === "BLOCKED_UNTIL_APPROVED") ||
      (existing.approval.status === "APPROVED" &&
        existing.collection_guard === "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION"),
    "Candidate approval status and collection guard are inconsistent.",
  );
  {
    const existingInputs = {
      spec_manifest_digest: existing.spec_manifest_ref.manifest_digest,
      normative_set_digest: existing.spec_manifest_ref.normative_set_digest,
      catalog_digest: existing.required_release_scope_catalog_ref.catalog_digest,
      research_protocol_digest: existing.research_protocol_ref.protocol_digest,
      verification_toolchain_digest: existing.verification_toolchain_ref.digest,
      release_scope_ids: existing.release_scope_ids,
      research_scope_ids: existing.research_scope_ids,
    };
    invariant(
      existing.candidate_artifact_digest ===
        canonicalDigest({ kind: "SPEC_OR_EXPERIMENT", ...existingInputs }),
      "Current candidate artifact digest is not reproducible.",
    );
    if (canonicalDigest(existingInputs) === canonicalDigest(candidateInputs)) {
      candidate = existing;
    }
  }
}

if (!candidate) {
  const candidateArtifactDigest = canonicalDigest({
    kind: "SPEC_OR_EXPERIMENT",
    ...candidateInputs,
  });
  const candidateBody = {
      schema_version: "rolefox.candidate-scope-manifest.v1",
      manifest_kind: "SPEC_OR_EXPERIMENT",
      candidate_scope_manifest_id: null,
      manifest_digest: null,
      created_at: now(),
      candidate_artifact_kind: "SPEC_OR_EXPERIMENT",
      candidate_artifact_digest: candidateArtifactDigest,
      verification_toolchain_ref: {
        digest: verificationToolchain.digest,
      },
      spec_manifest_ref: {
        path: PATHS.specManifest,
        manifest_digest: specManifest.manifest_digest,
        normative_set_digest: specManifest.normative_set_digest,
      },
      required_release_scope_catalog_ref: {
        path: PATHS.catalog,
        catalog_digest: catalog.catalog_digest,
      },
      research_protocol_ref: {
        path: PATHS.protocol,
        protocol_digest: protocol.protocol_digest,
      },
      release_scope_ids: candidateInputs.release_scope_ids,
      research_scope_ids: candidateInputs.research_scope_ids,
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
  candidate = addressDocument(
    candidateBody,
    {
      prefix: "candidate",
      idField: "candidate_scope_manifest_id",
      digestField: "manifest_digest",
    },
  );
  validateSchema(root, SCHEMA_NAMES.candidate, candidate, "Candidate Scope Manifest");
  writeJsonImmutable(
    path.join(candidateDirectory, `${candidate.candidate_scope_manifest_id}.json`),
    candidate,
  );
}

validateHistoricalBindings(root, {
  specManifestDigest: specManifest.manifest_digest,
  normativeSetDigest: specManifest.normative_set_digest,
  catalogDigest: catalog.catalog_digest,
  researchProtocolDigest: protocol.protocol_digest,
  candidateScopeManifestId: candidate.candidate_scope_manifest_id,
  candidateScopeManifestDigest: candidate.manifest_digest,
  candidateArtifactDigest: candidate.candidate_artifact_digest,
  verificationToolchainDigest: verificationToolchain.digest,
  label: "Bootstrap current state",
});
assertNoSensitivePublicData(candidate.approval, "Candidate Scope approval");

writeJsonAtomic(candidateIndexPath, {
  schema_version: "rolefox.current-candidate-scope.v1",
  candidate_scope_manifest_id: candidate.candidate_scope_manifest_id,
  manifest_digest: candidate.manifest_digest,
  path: `${PATHS.candidateDirectory}/${candidate.candidate_scope_manifest_id}.json`,
  readiness:
    candidate.approval.status === "APPROVED"
      ? "APPROVED_FOR_PROTOCOL_BOUND_COLLECTION"
      : "PENDING_PRODUCT_OWNER_APPROVAL",
});

const gateRegistryPath = absolute(PATHS.gateRegistry);
let gateRecords = parseJsonLines(gateRegistryPath);
let gateHeads = gateRecords.length > 0 ? validateGateChains(gateRecords) : [];
let preW1Head = gateHeads.find(
  (record) =>
    record.gate_id === GATE_IDS.preW1 &&
    record.scope_id === "pre_w1_problem_and_rules_research",
);
const headMatchesCandidate =
  preW1Head?.candidate_artifact_kind === "SPEC_OR_EXPERIMENT" &&
  preW1Head?.candidate_artifact_digest === candidate.candidate_artifact_digest &&
  preW1Head?.verification_toolchain_digest === verificationToolchain.digest &&
  preW1Head?.candidate_scope_manifest_ref?.candidate_scope_manifest_id ===
    candidate.candidate_scope_manifest_id &&
  preW1Head?.candidate_scope_manifest_ref?.manifest_digest === candidate.manifest_digest &&
  preW1Head?.spec_manifest_ref?.manifest_digest === specManifest.manifest_digest &&
  preW1Head?.spec_manifest_ref?.normative_set_digest === specManifest.normative_set_digest &&
  preW1Head?.required_release_scope_catalog_ref?.catalog_digest === catalog.catalog_digest &&
  preW1Head?.research_protocol_ref?.protocol_digest === protocol.protocol_digest &&
  Array.isArray(preW1Head?.runtime_binding_manifest_refs) &&
  preW1Head.runtime_binding_manifest_refs.length === 0 &&
  (TRUST_VERIFICATION_STATUS === "IMPLEMENTED" ||
    preW1Head?.reason_codes?.includes("TRUST_VERIFICATION_NOT_IMPLEMENTED"));
const passIsPremature =
  ["PASS", "ACCEPTED_FALLBACK"].includes(preW1Head?.result) &&
  (preW1Head.result !== "PASS" ||
    catalog.status !== "ACCEPTED" ||
    protocol.status !== "APPROVED" ||
    candidate.approval.status !== "APPROVED" ||
    preW1Head.evidence_manifest_refs.length < 3 ||
    TRUST_VERIFICATION_STATUS !== "IMPLEMENTED");

if (!headMatchesCandidate || passIsPremature) {
  const previous = preW1Head
    ? {
        record_id: preW1Head.record_id,
        record_digest: preW1Head.record_digest,
      }
    : null;
  const gateTimestamp = now();
  const reasonCodes = [];
  if (catalog.status !== "ACCEPTED") {
    reasonCodes.push("REQUIRED_SCOPE_CATALOG_REVIEW_PENDING");
  }
  if (protocol.status !== "APPROVED") {
    reasonCodes.push("RESEARCH_PROTOCOL_APPROVAL_PENDING");
  }
  if (candidate.approval.status !== "APPROVED") {
    reasonCodes.push("CANDIDATE_SCOPE_APPROVAL_PENDING");
  }
  if (!preW1Head || preW1Head.evidence_manifest_refs.length < 3) {
    reasonCodes.push("RESEARCH_EVIDENCE_NOT_COLLECTED");
  }
  if (TRUST_VERIFICATION_STATUS !== "IMPLEMENTED") {
    reasonCodes.push("TRUST_VERIFICATION_NOT_IMPLEMENTED");
  }
  reasonCodes.push("CHECKPOINT_SIGNATURE_AND_EXTERNAL_ANCHOR_PENDING");
  const gateBody = {
      schema_version: "rolefox.gate-evidence-record.v1",
      record_id: null,
      record_digest: null,
      gate_id: GATE_IDS.preW1,
      scope_id: "pre_w1_problem_and_rules_research",
      previous,
      criteria_version: protocol.protocol_version,
      criterion_refs: [
        "pain_interview_threshold",
        "target_channel_feasibility",
        "rules_replay_coverage",
        "independent_gate_approval",
        "registry_integrity",
      ],
      result: "BLOCKED",
      lifecycle_state: "BLOCKED_NOT_STARTED",
      reason_codes: reasonCodes,
      candidate_artifact_kind: "SPEC_OR_EXPERIMENT",
      candidate_artifact_digest: candidate.candidate_artifact_digest,
      verification_toolchain_digest: verificationToolchain.digest,
      candidate_scope_manifest_ref: {
        candidate_scope_manifest_id: candidate.candidate_scope_manifest_id,
        manifest_digest: candidate.manifest_digest,
      },
      spec_manifest_ref: {
        manifest_digest: specManifest.manifest_digest,
        normative_set_digest: specManifest.normative_set_digest,
      },
      required_release_scope_catalog_ref: {
        catalog_digest: catalog.catalog_digest,
      },
      research_protocol_ref: {
        protocol_digest: protocol.protocol_digest,
      },
      evidence_manifest_refs: [],
      runtime_binding_manifest_refs: [],
      predecessor_gate_refs: [],
      not_before: candidate.created_at,
      submitted_by: "rolefox-verification-bootstrap",
      submitted_at: gateTimestamp,
      decided_at: gateTimestamp,
      approved_by: null,
      approved_at: null,
      approver_role_version: null,
      approval_payload_digest: null,
      approval_proof_digest: null,
    };
  gateBody.approval_payload_digest = canonicalDigestExcluding(gateBody, [
    "record_id",
    "record_digest",
    "approval_payload_digest",
    "approval_proof_digest",
  ]);
  const record = addressDocument(
    gateBody,
    {
      prefix: "gate",
      idField: "record_id",
      digestField: "record_digest",
    },
  );
  validateSchema(root, SCHEMA_NAMES.gate, record, "Bootstrap Gate Evidence Record");
  appendJsonLine(gateRegistryPath, record);
  gateRecords = parseJsonLines(gateRegistryPath);
  gateHeads = validateGateChains(gateRecords);
  preW1Head = record;
}
const checkpointCreatedAt = now();
const { checkpoint: preparedCheckpoint } = createCurrentCheckpoint(root, {
  createdAt: checkpointCreatedAt,
  persist: false,
});
validateSchema(
  root,
  SCHEMA_NAMES.checkpoint,
  preparedCheckpoint,
  "Bootstrap Registry Checkpoint",
);
const { checkpoint } = createCurrentCheckpoint(root, {
  createdAt: checkpointCreatedAt,
});

console.log("RoleFox Pre-W1 verification bootstrap is structurally initialized.");
console.log(`Spec normative files: ${specManifest.normative_file_count}`);
console.log(`Required release scopes: ${catalog.scopes.length}`);
console.log(`Candidate scope: ${candidate.candidate_scope_manifest_id}`);
console.log(`Gate head: ${preW1Head.record_id} (${preW1Head.lifecycle_state})`);
console.log(`Checkpoint: ${checkpoint.checkpoint_id} (sequence ${checkpoint.sequence})`);
console.log("Readiness remains BLOCKED_NOT_STARTED until independent approvals and real research evidence exist.");
}

withVerificationLock(root, "bootstrap-pre-w1", bootstrap);
