import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { invariant, isSha256, repositoryRoot, writeJsonAtomic } from "./lib.mjs";
import {
  TRUST_KINDS,
  createTrustPredicate,
  loadTrustPolicy,
  subjectNameFor,
} from "./trust.mjs";

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    invariant(
      ["--kind", "--payload-digest", "--output-directory"].includes(key),
      `Unknown trust-request argument: ${key}`,
    );
    invariant(index + 1 < argv.length, `Missing value for ${key}.`);
    invariant(!values.has(key), `${key} may only be supplied once.`);
    values.set(key, argv[index + 1]);
    index += 1;
  }
  invariant(values.size === 3, "Trust request needs --kind, --payload-digest, and --output-directory.");
  return {
    kind: values.get("--kind"),
    payloadDigest: values.get("--payload-digest"),
    outputDirectory: values.get("--output-directory"),
  };
}

export function validateTrustedWorkflowEnvironment(environment, policy) {
  const expectedWorkflowRef =
    `${policy.repository.name}/${policy.signer.workflow_path}@${policy.repository.source_ref}`;
  invariant(
    environment.GITHUB_REPOSITORY === policy.repository.name,
    "Trust request repository mismatch.",
  );
  invariant(
    String(environment.GITHUB_REPOSITORY_ID) === policy.repository.id,
    "Trust request repository id mismatch.",
  );
  invariant(
    environment.GITHUB_REPOSITORY_VISIBILITY === policy.repository.visibility,
    "Trust request repository visibility mismatch.",
  );
  invariant(
    environment.GITHUB_ACTOR === policy.maintainer.login &&
      String(environment.GITHUB_ACTOR_ID) === policy.maintainer.actor_id &&
      environment.GITHUB_TRIGGERING_ACTOR === policy.maintainer.login,
    "Trust request actor is not the sole maintainer.",
  );
  invariant(
    environment.GITHUB_REF === policy.repository.source_ref &&
      environment.GITHUB_REF_PROTECTED === "true",
    "Trust request must run from protected refs/heads/main.",
  );
  invariant(
    environment.GITHUB_EVENT_NAME === policy.signer.event_name,
    "Trust request event is not workflow_dispatch.",
  );
  invariant(
    environment.GITHUB_WORKFLOW_REF === expectedWorkflowRef,
    "Trust request workflow identity mismatch.",
  );
  invariant(
    environment.ROLEFOX_RUNNER_ENVIRONMENT === policy.signer.runner_environment,
    "Trust request must run on a GitHub-hosted runner.",
  );
}

export function materializeTrustRequest(
  root,
  { kind, payloadDigest, outputDirectory, environment = process.env, decidedAt },
) {
  invariant(Object.hasOwn(TRUST_KINDS, kind), `Unsupported trust kind: ${kind}`);
  invariant(isSha256(payloadDigest), "Trust request payload digest must be SHA-256.");
  const policy = loadTrustPolicy(root);
  validateTrustedWorkflowEnvironment(environment, policy);
  const predicate = createTrustPredicate({
    kind,
    payloadDigest,
    decidedAt: decidedAt ?? new Date().toISOString(),
    policy,
  });
  const subjectName = subjectNameFor(kind, payloadDigest);
  const predicatePath = path.join(outputDirectory, `${subjectName}.predicate.json`);
  writeJsonAtomic(predicatePath, predicate);
  return {
    predicate,
    predicatePath,
    subjectName,
    payloadDigest,
    artifactName: `rolefox-proof-${kind.toLowerCase().replaceAll("_", "-")}-${payloadDigest}`,
  };
}

function appendGitHubOutput(filePath, values) {
  invariant(typeof filePath === "string" && filePath.length > 0, "GITHUB_OUTPUT is required.");
  const lines = Object.entries(values).map(([key, value]) => {
    invariant(
      typeof value === "string" && !value.includes("\n") && !value.includes("\r"),
      `Unsafe GitHub output value for ${key}.`,
    );
    return `${key}=${value}`;
  });
  fs.appendFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const root = repositoryRoot(import.meta.url);
  const request = materializeTrustRequest(root, parseArguments(process.argv.slice(2)));
  appendGitHubOutput(process.env.GITHUB_OUTPUT, {
    predicate_path: request.predicatePath,
    subject_name: request.subjectName,
    payload_digest: request.payloadDigest,
    artifact_name: request.artifactName,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
