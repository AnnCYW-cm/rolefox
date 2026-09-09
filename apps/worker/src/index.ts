import { DEFAULT_AUTOMATION_POLICY } from "@rolefox/policy";

console.log(
  JSON.stringify(
    {
      service: "rolefox-worker",
      status: "ready",
      mode: DEFAULT_AUTOMATION_POLICY.dryRun ? "dry-run" : "live",
      message: "No real job-source tasks are configured in M0.",
    },
    null,
    2,
  ),
);
