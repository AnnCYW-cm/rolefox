import fs from "node:fs";

import {
  createCheckpointTrustRequest,
  createCurrentCheckpoint,
  finalizeCheckpointTrustEnvelope,
} from "./checkpoint-lib.mjs";
import { PATHS } from "./config.mjs";
import {
  assertSafeRepositoryStorage,
  readJson,
  repositoryRoot,
  withVerificationLock,
} from "./lib.mjs";

const root = repositoryRoot(import.meta.url);
assertSafeRepositoryStorage(root, Object.values(PATHS));
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const force = args.includes("--force");
const prepareTrustEnvelope = args.includes("--prepare-trust-envelope");
const envelopeIndex = args.indexOf("--trust-envelope");

const consumedArguments = new Set(["--force", "--prepare-trust-envelope"]);
if (envelopeIndex !== -1) {
  consumedArguments.add("--trust-envelope");
  consumedArguments.add(args[envelopeIndex + 1]);
}
const unknownArguments = args.filter((argument) => !consumedArguments.has(argument));
if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}`);
}
if (prepareTrustEnvelope && envelopeIndex !== -1) {
  throw new Error("--prepare-trust-envelope and --trust-envelope are mutually exclusive.");
}

let trustEnvelope;
if (envelopeIndex !== -1) {
  const inputPath = args[envelopeIndex + 1];
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error("--trust-envelope requires an existing JSON file.");
  }
  trustEnvelope = readJson(inputPath);
}

const result = withVerificationLock(
  root,
  prepareTrustEnvelope ? "prepare-checkpoint-trust" : "write-checkpoint",
  () => {
    if (prepareTrustEnvelope) {
      return { trustRequest: createCheckpointTrustRequest(root) };
    }
    return trustEnvelope
      ? finalizeCheckpointTrustEnvelope(root, trustEnvelope)
      : createCurrentCheckpoint(root, { force });
  },
);

if (result.trustRequest) {
  console.log(JSON.stringify(result.trustRequest));
  process.exit(0);
}

const { checkpoint, disposition } = result;

console.log(
  `${disposition === "created" ? "Created" : "Reused"} checkpoint ${checkpoint.checkpoint_id} ` +
    `(sequence ${checkpoint.sequence}, root ${checkpoint.registry_root_digest}).`,
);
if (checkpoint.signature.status !== "VERIFIED_TRUSTED_SIGNER") {
  console.log("Checkpoint is not release-trusted: trusted signature is pending.");
}
if (checkpoint.external_anchor.status !== "VERIFIED_EXTERNAL_ANCHOR") {
  console.log("Checkpoint is not rollback-resistant: external anchor is pending.");
}
