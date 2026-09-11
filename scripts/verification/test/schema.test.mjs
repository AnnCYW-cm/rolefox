import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PATHS, SOLE_MAINTAINER_AUTHORITY } from "../config.mjs";
import {
  addressDocument,
  canonicalDigestExcluding,
  jsonFiles,
  parseJsonLines,
  readJson,
} from "../lib.mjs";
import { SCHEMA_NAMES, validateSchema } from "../schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const absolute = (relativePath) => path.join(root, ...relativePath.split("/"));

test("all seven schemas compile and every checked-in registry artifact validates", () => {
  validateSchema(
    root,
    SCHEMA_NAMES.catalog,
    readJson(absolute(PATHS.catalog)),
    "catalog",
  );
  validateSchema(
    root,
    SCHEMA_NAMES.specManifest,
    readJson(absolute(PATHS.specManifest)),
    "spec manifest",
  );
  validateSchema(
    root,
    SCHEMA_NAMES.protocol,
    readJson(absolute(PATHS.protocol)),
    "research protocol",
  );
  for (const file of jsonFiles(absolute(PATHS.catalogSnapshotDirectory))) {
    validateSchema(root, SCHEMA_NAMES.catalog, readJson(file), path.basename(file));
  }
  for (const file of jsonFiles(absolute(PATHS.specManifestSnapshotDirectory))) {
    validateSchema(
      root,
      SCHEMA_NAMES.specManifest,
      readJson(file),
      path.basename(file),
    );
  }
  for (const file of jsonFiles(absolute(PATHS.protocolSnapshotDirectory))) {
    validateSchema(root, SCHEMA_NAMES.protocol, readJson(file), path.basename(file));
  }
  for (const file of jsonFiles(absolute(PATHS.candidateDirectory))) {
    if (path.basename(file) === "current-pre-w1.json") continue;
    validateSchema(root, SCHEMA_NAMES.candidate, readJson(file), path.basename(file));
  }
  for (const file of jsonFiles(absolute(PATHS.evidenceDirectory))) {
    validateSchema(root, SCHEMA_NAMES.evidence, readJson(file), path.basename(file));
  }
  for (const [index, record] of parseJsonLines(absolute(PATHS.gateRegistry)).entries()) {
    validateSchema(root, SCHEMA_NAMES.gate, record, `gate record ${index + 1}`);
  }
  for (const file of jsonFiles(absolute(PATHS.checkpointDirectory))) {
    validateSchema(root, SCHEMA_NAMES.checkpoint, readJson(file), path.basename(file));
  }
  assert.ok(true);
});

test("maintainer Gate output requires an explicit decision authority without breaking legacy protocols", () => {
  const current = readJson(absolute(PATHS.protocol));
  const withoutAuthority = structuredClone(current);
  delete withoutAuthority.decision_authority;
  assert.throws(
    () =>
      validateSchema(
        root,
        SCHEMA_NAMES.protocol,
        withoutAuthority,
        "maintainer protocol without decision authority",
      ),
    /must have required property 'decision_authority'/,
  );

  const legacy = jsonFiles(absolute(PATHS.protocolSnapshotDirectory))
    .map((file) => readJson(file))
    .find((protocol) => protocol.decision_authority === undefined);
  assert.ok(legacy, "a legacy protocol snapshot must remain available");
  validateSchema(
    root,
    SCHEMA_NAMES.protocol,
    legacy,
    "legacy independent protocol",
  );
});

test("FAIL is a decided, evidenced, maintainer-approved Gate result", () => {
  const [source] = parseJsonLines(absolute(PATHS.gateRegistry));
  const body = structuredClone(source);
  delete body.record_id;
  delete body.record_digest;
  body.result = "FAIL";
  body.lifecycle_state = "DECIDED";
  body.reason_codes = ["RESEARCH_THRESHOLD_NOT_MET"];
  body.evidence_manifest_refs = [
    {
      evidence_id: `ev_${"a".repeat(64)}`,
      manifest_digest: "a".repeat(64),
      record_digest: "b".repeat(64),
    },
  ];
  body.submitted_by = SOLE_MAINTAINER_AUTHORITY.identity;
  body.approved_by = SOLE_MAINTAINER_AUTHORITY.identity;
  body.approved_at = body.decided_at;
  body.approver_role_version = SOLE_MAINTAINER_AUTHORITY.role_version;
  body.approval_proof_digest = "c".repeat(64);
  body.approval_payload_digest = canonicalDigestExcluding(body, [
    "approval_payload_digest",
    "approval_proof_digest",
  ]);
  const record = addressDocument(body, {
    prefix: "gate",
    idField: "record_id",
    digestField: "record_digest",
  });
  validateSchema(root, SCHEMA_NAMES.gate, record, "FAIL Gate record");

  const invalid = { ...record, lifecycle_state: "BLOCKED_NOT_STARTED" };
  assert.throws(
    () => validateSchema(root, SCHEMA_NAMES.gate, invalid, "invalid FAIL Gate record"),
    /must be equal to constant/,
  );
});
