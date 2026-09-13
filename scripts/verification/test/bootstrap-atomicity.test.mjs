import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_SPEC_FILES,
  VERIFICATION_TOOLCHAIN_FILES,
} from "../config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const copyRepositoryFile = (temporaryRoot, relativePath) => {
  const source = path.join(root, ...relativePath.split("/"));
  const target = path.join(temporaryRoot, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
};

const installTestGh = (temporaryRoot) => {
  const executable = path.join(temporaryRoot, ".test-bin", "gh");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(
    executable,
    `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const bundleIndex = process.argv.indexOf("--bundle");
if (bundleIndex === -1 || !process.argv[bundleIndex + 1]) process.exit(2);
const bundle = JSON.parse(fs.readFileSync(process.argv[bundleIndex + 1], "utf8"));
const statement = JSON.parse(
  Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"),
);
if (statement.predicate.kind === process.env.ROLEFOX_TEST_GH_FAIL_KIND) {
  process.stderr.write("ROLEFOX_TEST_FORCED_GH_FAILURE\\n");
  process.exit(17);
}
const policy = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "verification/trust/policy-v1.json"), "utf8"),
);
const entry = bundle.verificationMaterial.tlogEntries[0];
const integratedTime = Number(entry.integratedTime);
const output = [{
  verificationResult: {
    statement,
    signature: {
      certificate: {
        subjectAlternativeName: policy.signer.workflow_uri,
        extensions: {
          issuer: policy.signer.oidc_issuer,
          sourceRepositoryURI: \`https://github.com/\${policy.repository.name}\`,
          sourceRepositoryIdentifier: policy.repository.id,
          sourceRepositoryOwnerIdentifier: policy.repository.owner_id,
          sourceRepositoryRef: policy.repository.source_ref,
          sourceRepositoryDigest: \`sha1:\${"a".repeat(40)}\`,
          sourceRepositoryVisibilityAtSigning: policy.repository.visibility,
          runnerEnvironment: policy.signer.runner_environment,
          buildTrigger: policy.signer.event_name,
          buildConfigURI: policy.signer.workflow_uri,
          runInvocationURI: \`https://github.com/\${policy.repository.name}/actions/runs/1\`,
        },
      },
    },
    verifiedTimestamps: [{
      type: "transparency-log",
      timestamp: new Date(integratedTime * 1000).toISOString(),
    }],
  },
}];
process.stdout.write(JSON.stringify(output));
`,
    { mode: 0o755 },
  );
};

const temporaryRepository = (t) => {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "rolefox-bootstrap-atomicity-"),
  );
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  fs.cpSync(
    path.join(root, "verification"),
    path.join(temporaryRoot, "verification"),
    { recursive: true },
  );
  for (const relativePath of new Set([
    ...VERIFICATION_TOOLCHAIN_FILES,
    ...ACCEPTED_SPEC_FILES,
  ])) {
    if (relativePath.startsWith("verification/")) continue;
    copyRepositoryFile(temporaryRoot, relativePath);
  }
  fs.rmSync(path.join(temporaryRoot, "verification", ".append.lock"), {
    force: true,
  });
  fs.symlinkSync(path.join(root, "node_modules"), path.join(temporaryRoot, "node_modules"));
  installTestGh(temporaryRoot);
  return temporaryRoot;
};

const runBootstrap = (temporaryRoot, extraEnv = {}) =>
  spawnSync(
    process.execPath,
    [path.join(temporaryRoot, "scripts/verification/bootstrap-pre-w1.mjs")],
    {
      cwd: temporaryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${path.join(temporaryRoot, ".test-bin")}${path.delimiter}${process.env.PATH}`,
        ...extraEnv,
      },
    },
  );

const snapshotTree = (directory, prefix = "") => {
  const snapshot = [];
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      snapshot.push({ type: "directory", path: relativePath });
      snapshot.push(...snapshotTree(absolutePath, relativePath));
    } else {
      assert.equal(entry.isFile(), true, `unexpected non-file: ${relativePath}`);
      snapshot.push({
        type: "file",
        path: relativePath,
        bytes: fs.readFileSync(absolutePath).toString("base64"),
      });
    }
  }
  return snapshot;
};

test("bootstrap proof failure leaves every persistent verification artifact unchanged", (t) => {
  const temporaryRoot = temporaryRepository(t);
  const baseline = runBootstrap(temporaryRoot);
  assert.equal(baseline.status, 0, baseline.stderr);

  const readmePath = path.join(temporaryRoot, "README.md");
  fs.appendFileSync(
    readmePath,
    "\n<!-- bootstrap atomicity regression input -->\n",
  );
  const verificationRoot = path.join(temporaryRoot, "verification");
  const before = snapshotTree(verificationRoot);

  const failed = runBootstrap(temporaryRoot, {
    ROLEFOX_TEST_GH_FAIL_KIND: "PROTOCOL_APPROVED",
  });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /ROLEFOX_TEST_FORCED_GH_FAILURE/);
  assert.deepEqual(snapshotTree(verificationRoot), before);
  assert.equal(
    fs.existsSync(path.join(verificationRoot, ".append.lock")),
    false,
  );
});
