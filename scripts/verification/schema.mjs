import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import path from "node:path";

import { invariant, readJson } from "./lib.mjs";

export const SCHEMA_NAMES = Object.freeze({
  specManifest: "spec-manifest",
  catalog: "required-release-scope-catalog",
  candidate: "candidate-scope-manifest",
  evidence: "evidence-manifest",
  gate: "gate-evidence-record",
  protocol: "pre-w1-research-protocol",
  checkpoint: "registry-checkpoint",
  trustPolicy: "trust-policy",
});

const validatorsByRoot = new Map();

function validatorsFor(root) {
  const cached = validatorsByRoot.get(root);
  if (cached) return cached;

  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    // Conditional branches rely on properties and types declared by their parent.
    strictRequired: false,
    validateFormats: true,
  });
  addFormats(ajv);
  const validators = new Map();
  for (const schemaName of Object.values(SCHEMA_NAMES)) {
    const schemaPath = path.join(
      root,
      "verification",
      "schemas",
      "v1",
      `${schemaName}.schema.json`,
    );
    validators.set(schemaName, ajv.compile(readJson(schemaPath)));
  }
  validatorsByRoot.set(root, validators);
  return validators;
}

export function validateSchema(root, schemaName, document, label = schemaName) {
  const validator = validatorsFor(root).get(schemaName);
  invariant(validator, `Unknown verification schema: ${schemaName}`);
  const valid = validator(document);
  if (valid) return;
  const details = (validator.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  throw new Error(`${label} does not match ${schemaName}.schema.json: ${details}`);
}
