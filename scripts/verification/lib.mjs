import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIGEST_CONTRACT = "rolefox-canonical-digest-v1";

export function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeText(value) {
  return value.replace(/\r\n?/g, "\n");
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function decodeUtf8(value, label = "input") {
  try {
    return utf8Decoder.decode(value);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${String(error)}`);
  }
}

const assertUnicodeScalarString = (value, label) => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      invariant(
        next >= 0xdc00 && next <= 0xdfff,
        `${label} contains an unpaired high surrogate.`,
      );
      index += 1;
    } else {
      invariant(
        codeUnit < 0xdc00 || codeUnit > 0xdfff,
        `${label} contains an unpaired low surrogate.`,
      );
    }
  }
};

const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

export function canonicalJson(value) {
  if (value === null) return "null";

  if (typeof value === "string") {
    assertUnicodeScalarString(value, "Canonical JSON string");
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") return JSON.stringify(value);

  if (typeof value === "number") {
    invariant(Number.isFinite(value), "Canonical JSON does not allow non-finite numbers.");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }

  invariant(
    typeof value === "object" && value !== undefined,
    `Unsupported canonical JSON value: ${typeof value}`,
  );

  const keys = Object.keys(value);
  for (const key of keys) {
    assertUnicodeScalarString(key, "Canonical JSON object key");
    invariant(value[key] !== undefined, `Undefined value at key ${key}.`);
  }
  keys.sort(compareUtf8);

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function canonicalDigest(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

export function canonicalDigestExcluding(document, topLevelFields) {
  const body = structuredClone(document);
  for (const field of topLevelFields) delete body[field];
  return canonicalDigest(body);
}

export function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

const uint64 = (value) => {
  invariant(Number.isSafeInteger(value) && value >= 0, `Invalid frame length: ${value}`);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(value));
  return buffer;
};

export function assertRepositoryRelativePath(relativePath) {
  invariant(typeof relativePath === "string" && relativePath.length > 0, "Path is required.");
  invariant(!relativePath.includes("\\"), `Path must use POSIX separators: ${relativePath}`);
  invariant(!relativePath.includes("\0"), "Path must not contain NUL bytes.");
  invariant(!path.isAbsolute(relativePath), `Path must be repository-relative: ${relativePath}`);
  const normalized = path.posix.normalize(relativePath);
  invariant(
    normalized === relativePath &&
      normalized !== "." &&
      normalized !== ".." &&
      !normalized.startsWith("../") &&
      !normalized.includes("/../"),
    `Unsafe or non-canonical repository path: ${relativePath}`,
  );
}

export function assertSafeRepositoryStorage(root, relativePaths) {
  invariant(Array.isArray(relativePaths), "Repository storage paths must be an array.");
  const rootRealPath = fs.realpathSync(root);

  for (const relativePath of relativePaths) {
    assertRepositoryRelativePath(relativePath);
    const components = relativePath.split("/");
    let currentPath = rootRealPath;

    for (const [index, component] of components.entries()) {
      currentPath = path.join(currentPath, component);
      let metadata;
      try {
        metadata = fs.lstatSync(currentPath);
      } catch (error) {
        if (error?.code === "ENOENT") break;
        throw error;
      }

      invariant(
        !metadata.isSymbolicLink(),
        `Verification storage path must not contain symbolic links: ${relativePath}`,
      );
      if (index < components.length - 1) {
        invariant(
          metadata.isDirectory(),
          `Verification storage parent is not a directory: ${relativePath}`,
        );
      }
      const realPath = fs.realpathSync(currentPath);
      invariant(
        realPath === rootRealPath || realPath.startsWith(`${rootRealPath}${path.sep}`),
        `Verification storage path resolves outside repository root: ${relativePath}`,
      );
    }
  }
}

export function resolveRepositoryPath(root, relativePath) {
  assertRepositoryRelativePath(relativePath);
  const rootRealPath = fs.realpathSync(root);
  assertSafeRepositoryStorage(rootRealPath, [relativePath]);
  const candidatePath = path.resolve(rootRealPath, ...relativePath.split("/"));
  invariant(
    candidatePath.startsWith(`${rootRealPath}${path.sep}`),
    `Path resolves outside repository root: ${relativePath}`,
  );
  const realPath = fs.realpathSync(candidatePath);
  invariant(
    realPath.startsWith(`${rootRealPath}${path.sep}`),
    `Path follows a link outside repository root: ${relativePath}`,
  );
  return realPath;
}

export function digestFileSet(root, relativePaths) {
  const uniquePaths = [...new Set(relativePaths)];
  invariant(uniquePaths.length === relativePaths.length, "File-set paths must be unique.");
  uniquePaths.forEach(assertRepositoryRelativePath);
  uniquePaths.sort(compareUtf8);

  const rootRealPath = fs.realpathSync(root);
  const files = [];

  for (const relativePath of uniquePaths) {
    const realPath = resolveRepositoryPath(rootRealPath, relativePath);
    invariant(fs.statSync(realPath).isFile(), `Not a regular file: ${relativePath}`);

    const normalizedContent = Buffer.from(
      normalizeText(decodeUtf8(fs.readFileSync(realPath), relativePath)),
      "utf8",
    );
    const contentHash = createHash("sha256").update(normalizedContent).digest();
    files.push({
      path: relativePath,
      bytes: normalizedContent.length,
      sha256: contentHash.toString("hex"),
    });
  }

  return {
    algorithm: "sha256",
    canonicalization: DIGEST_CONTRACT,
    digest: digestFileMetadataSet(files),
    files,
  };
}

export function digestFileMetadataSet(fileEntries) {
  invariant(Array.isArray(fileEntries), "File metadata set must be an array.");
  const entries = fileEntries.map((entry, index) => {
    invariant(
      entry && typeof entry === "object" && !Array.isArray(entry),
      `Invalid file metadata entry at index ${index}.`,
    );
    assertRepositoryRelativePath(entry.path);
    invariant(
      Number.isSafeInteger(entry.bytes) && entry.bytes >= 0,
      `Invalid byte length for ${entry.path}.`,
    );
    invariant(isSha256(entry.sha256), `Invalid file digest for ${entry.path}.`);
    return {
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256,
    };
  });
  invariant(
    new Set(entries.map((entry) => entry.path)).size === entries.length,
    "File metadata paths must be unique.",
  );
  entries.sort((left, right) => compareUtf8(left.path, right.path));

  const framed = [];
  for (const entry of entries) {
    const pathBytes = Buffer.from(entry.path, "utf8");
    framed.push(uint64(pathBytes.length), pathBytes);
    framed.push(uint64(entry.bytes), Buffer.from(entry.sha256, "hex"));
  }
  return sha256(Buffer.concat(framed));
}

export function addressDocument(
  document,
  {
    prefix,
    idField = "id",
    digestField = "digest",
  },
) {
  const body = structuredClone(document);
  delete body[idField];
  delete body[digestField];
  const digest = canonicalDigest(body);
  return {
    ...body,
    [idField]: `${prefix}_${digest}`,
    [digestField]: digest,
  };
}

export function verifyAddressedDocument(
  document,
  {
    prefix,
    idField = "id",
    digestField = "digest",
  },
) {
  const expected = addressDocument(document, { prefix, idField, digestField });
  invariant(
    document[idField] === expected[idField],
    `Invalid ${idField}: expected ${expected[idField]}, found ${document[idField]}.`,
  );
  invariant(
    document[digestField] === expected[digestField],
    `Invalid ${digestField} for ${document[idField]}.`,
  );
  return expected;
}

const evidenceDigestBody = (document) => {
  const body = structuredClone(document);
  delete body.evidence_id;
  delete body.manifest_digest;
  delete body.record_digest;
  delete body.attestation;
  delete body.signature;
  return body;
};

export function addressEvidenceDocument(document) {
  const digest = canonicalDigest(evidenceDigestBody(document));
  const addressed = {
    ...document,
    evidence_id: `ev_${digest}`,
    manifest_digest: digest,
  };
  delete addressed.record_digest;
  return {
    ...addressed,
    record_digest: canonicalDigest(addressed),
  };
}

export function verifyEvidenceDocument(document) {
  const expected = addressEvidenceDocument(document);
  invariant(
    document.evidence_id === expected.evidence_id,
    `Invalid evidence_id: expected ${expected.evidence_id}, found ${document.evidence_id}.`,
  );
  invariant(
    document.manifest_digest === expected.manifest_digest,
    `Invalid manifest_digest for ${document.evidence_id}.`,
  );
  invariant(
    document.record_digest === expected.record_digest,
    `Invalid record_digest for ${document.evidence_id}.`,
  );
  return expected;
}

export function verifyCheckpointDocument(document) {
  return verifyAddressedDocument(document, {
    prefix: "checkpoint",
    idField: "checkpoint_id",
    digestField: "checkpoint_digest",
  });
}

export function readJson(filePath) {
  return JSON.parse(decodeUtf8(fs.readFileSync(filePath), filePath));
}

function fsyncParentDirectory(filePath) {
  const descriptor = fs.openSync(path.dirname(filePath), fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  if (fs.existsSync(filePath)) {
    const metadata = fs.lstatSync(filePath);
    invariant(
      metadata.isFile() && !metadata.isSymbolicLink(),
      `Atomic JSON target is not a regular file: ${filePath}`,
    );
  }
  let descriptor;
  let temporaryCreated = false;
  try {
    descriptor = fs.openSync(
      temporaryPath,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        (fs.constants.O_NOFOLLOW ?? 0),
      0o644,
    );
    temporaryCreated = true;
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, filePath);
    temporaryCreated = false;
    fsyncParentDirectory(filePath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (temporaryCreated) {
      try {
        fs.unlinkSync(temporaryPath);
        fsyncParentDirectory(temporaryPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
}

export function writeJsonImmutable(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, "wx", 0o444);
    fs.writeFileSync(descriptor, serialized, { encoding: "utf8" });
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fsyncParentDirectory(filePath);
    return "created";
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (error?.code !== "EEXIST") throw error;
    const metadata = fs.lstatSync(filePath);
    invariant(
      metadata.isFile() && !metadata.isSymbolicLink(),
      `Immutable document target is not a regular file: ${filePath}`,
    );
    invariant(
      decodeUtf8(fs.readFileSync(filePath), filePath) === serialized,
      `Immutable document collision or rewrite attempt: ${filePath}`,
    );
    return "unchanged";
  }
}

export function parseJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = normalizeText(decodeUtf8(fs.readFileSync(filePath), filePath));
  if (content.length === 0) return [];
  invariant(content.endsWith("\n"), `${filePath} must end with LF.`);
  const lines = content.slice(0, -1).split("\n");
  return lines.map((line, index) => {
      invariant(line.length > 0, `${filePath}:${index + 1}: blank JSONL lines are forbidden.`);
      try {
        const value = JSON.parse(line);
        invariant(
          line === canonicalJson(value),
          `${filePath}:${index + 1}: JSONL record is not canonical JSON.`,
        );
        return value;
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: invalid JSON: ${String(error)}`);
      }
    });
}

export function appendJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_APPEND |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o644,
  );
  try {
    fs.writeFileSync(descriptor, `${canonicalJson(value)}\n`, { encoding: "utf8" });
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fsyncParentDirectory(filePath);
}

export function withVerificationLock(root, command, operation) {
  const lockPath = path.join(root, "verification", ".append.lock");
  assertSafeRepositoryStorage(root, ["verification", "verification/.append.lock"]);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let descriptor;
  try {
    descriptor = fs.openSync(
      lockPath,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Verification registry lock already exists: ${lockPath}`);
    }
    throw error;
  }

  try {
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify({
        pid: process.pid,
        command,
        acquired_at: new Date().toISOString(),
      })}\n`,
      "utf8",
    );
    fs.fsyncSync(descriptor);
    fsyncParentDirectory(lockPath);
    return operation();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lockPath);
    fsyncParentDirectory(lockPath);
  }
}

export function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  invariant(
    entries.every((entry) => !entry.isSymbolicLink()),
    `JSON registry directory must not contain symbolic links: ${directory}`,
  );
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort(compareUtf8);
}

export function digestJsonl(filePath) {
  const content = fs.existsSync(filePath)
    ? normalizeText(decodeUtf8(fs.readFileSync(filePath), filePath))
    : "";
  return sha256(Buffer.from(content, "utf8"));
}

export function digestJsonlPrefix(filePath, recordCount) {
  invariant(Number.isSafeInteger(recordCount) && recordCount >= 0, "Invalid JSONL record count.");
  if (recordCount === 0) return sha256(Buffer.alloc(0));
  const content = normalizeText(decodeUtf8(fs.readFileSync(filePath), filePath));
  invariant(content.endsWith("\n"), `${filePath} must end with LF.`);
  const lines = content.slice(0, -1).split("\n");
  invariant(recordCount <= lines.length, `${filePath} has fewer than ${recordCount} records.`);
  const prefix = `${lines.slice(0, recordCount).join("\n")}\n`;
  return sha256(Buffer.from(prefix, "utf8"));
}

const chainKey = (record) => canonicalJson([record.gate_id, record.scope_id]);

const assertNonemptyIdentifier = (value, label) => {
  invariant(typeof value === "string" && value.length > 0, `${label} is required.`);
  invariant(!value.includes("\0"), `${label} must not contain NUL bytes.`);
};

export function validateGateChains(records) {
  const byId = new Map();
  const children = new Map();
  const chains = new Map();

  invariant(Array.isArray(records), "Gate records must be an array.");
  for (const [index, record] of records.entries()) {
    invariant(record && typeof record === "object" && !Array.isArray(record), `Invalid gate record at index ${index}.`);
    invariant(record.schema_version === "rolefox.gate-evidence-record.v1", `Unsupported gate schema at index ${index}.`);
    assertNonemptyIdentifier(record.gate_id, `gate_id at index ${index}`);
    assertNonemptyIdentifier(record.scope_id, `scope_id at index ${index}`);
    assertNonemptyIdentifier(record.record_id, `record_id at index ${index}`);
    assertNonemptyIdentifier(record.criteria_version, `criteria_version at index ${index}`);
    invariant(
      ["PASS", "ACCEPTED_FALLBACK", "FAIL", "BLOCKED"].includes(record.result),
      `Invalid gate result at index ${index}.`,
    );
    invariant(
      Array.isArray(record.criterion_refs) &&
        record.criterion_refs.length > 0 &&
        record.criterion_refs.every(
          (entry) => typeof entry === "string" && entry.length > 0 && !entry.includes("\0"),
        ) &&
        new Set(record.criterion_refs).size === record.criterion_refs.length,
      `Invalid criterion_refs at index ${index}.`,
    );
    invariant(Array.isArray(record.evidence_manifest_refs), `evidence_manifest_refs must be an array at index ${index}.`);
    invariant(Array.isArray(record.runtime_binding_manifest_refs), `runtime_binding_manifest_refs must be an array at index ${index}.`);
    invariant(
      record.evidence_manifest_refs.every(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          /^ev_[a-f0-9]{64}$/.test(entry.evidence_id) &&
          isSha256(entry.manifest_digest) &&
          isSha256(entry.record_digest),
      ),
      `Invalid evidence manifest ref at index ${index}.`,
    );
    invariant(
      ["SPEC_OR_EXPERIMENT", "BUILD"].includes(record.candidate_artifact_kind) &&
        isSha256(record.candidate_artifact_digest) &&
        isSha256(record.verification_toolchain_digest),
      `Invalid candidate artifact at index ${index}.`,
    );
    assertNonemptyIdentifier(record.submitted_by, `submitted_by at index ${index}`);
    invariant(
      typeof record.submitted_at === "string" &&
        Number.isFinite(Date.parse(record.submitted_at)) &&
        typeof record.decided_at === "string" &&
        Number.isFinite(Date.parse(record.decided_at)),
      `Invalid Gate timestamps at index ${index}.`,
    );
    invariant(
      isSha256(record.approval_payload_digest) &&
        record.approval_payload_digest ===
          canonicalDigestExcluding(record, [
            "record_id",
            "record_digest",
            "approval_payload_digest",
            "approval_proof_digest",
          ]),
      `Invalid approval payload digest at index ${index}.`,
    );
    invariant(
      record.previous === null ||
        (record.previous &&
          typeof record.previous === "object" &&
          !Array.isArray(record.previous) &&
          Object.keys(record.previous).sort().join(",") === "record_digest,record_id" &&
          typeof record.previous.record_id === "string" &&
          isSha256(record.previous.record_digest)),
      `Invalid previous gate reference at index ${index}.`,
    );
    verifyAddressedDocument(record, {
      prefix: "gate",
      idField: "record_id",
      digestField: "record_digest",
    });
    invariant(!byId.has(record.record_id), `Duplicate gate record: ${record.record_id}`);
    byId.set(record.record_id, { record, index });
    const key = chainKey(record);
    const entries = chains.get(key) ?? [];
    entries.push(record);
    chains.set(key, entries);
  }

  const heads = [];
  for (const [key, entries] of chains) {
    const genesis = entries.filter((record) => record.previous === null);
    invariant(genesis.length === 1, `Gate chain ${key} must have exactly one genesis record.`);

    for (const record of entries) {
      if (record.previous === null) continue;
      const parentEntry = byId.get(record.previous.record_id);
      invariant(parentEntry, `Missing or out-of-order previous gate record ${record.previous.record_id}.`);
      const parent = parentEntry.record;
      const childIndex = byId.get(record.record_id).index;
      invariant(parentEntry.index < childIndex, `Gate parent must precede child ${record.record_id}.`);
      invariant(
        parent.record_digest === record.previous.record_digest,
        `Previous digest mismatch for ${record.record_id}.`,
      );
      invariant(chainKey(parent) === key, `Cross-scope gate link at ${record.record_id}.`);
      invariant(!children.has(parent.record_id), `Forked gate chain at ${parent.record_id}.`);
      children.set(parent.record_id, record.record_id);
    }

    const chainHeads = entries.filter((record) => !children.has(record.record_id));
    invariant(chainHeads.length === 1, `Gate chain ${key} must have exactly one head.`);
    heads.push(chainHeads[0]);

    const visited = new Set();
    let cursor = chainHeads[0];
    while (cursor) {
      invariant(!visited.has(cursor.record_id), `Cycle in gate chain ${key}.`);
      visited.add(cursor.record_id);
      cursor = cursor.previous ? byId.get(cursor.previous.record_id)?.record : undefined;
    }
    invariant(visited.size === entries.length, `Disconnected gate records in chain ${key}.`);
  }

  heads.sort((left, right) => compareUtf8(chainKey(left), chainKey(right)));
  return heads;
}

export function repositoryRoot(importMetaUrl) {
  const scriptDirectory = path.dirname(fileURLToPath(importMetaUrl));
  return path.resolve(scriptDirectory, "../..");
}
