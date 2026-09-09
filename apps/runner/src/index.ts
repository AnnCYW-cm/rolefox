import { DEFAULT_AUTOMATION_POLICY } from "@rolefox/policy";

if (DEFAULT_AUTOMATION_POLICY.dryRun !== true) {
  throw new Error("M0 runner must start in dry-run mode.");
}

console.log(
  JSON.stringify(
    {
      service: "rolefox-runner",
      status: "ready",
      mode: "dry-run",
      message: "Browser execution is intentionally disabled in M0.",
    },
    null,
    2,
  ),
);
