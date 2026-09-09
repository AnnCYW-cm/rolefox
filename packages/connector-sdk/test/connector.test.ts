import { describe, expect, it } from "vitest";
import type { ApplyPlanInput, ConnectorBase } from "../src";
import { assertApplicationInputWorkspace, assertCapability } from "../src";

const input: ApplyPlanInput = {
  workspaceId: "workspace_demo",
  candidate: {
    id: "candidate_demo",
    workspaceId: "workspace_demo",
    schemaVersion: 1,
    displayName: "Demo Candidate",
    preferredLanguages: ["en"],
    evidenceIds: [],
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  },
  job: {
    id: "job_demo",
    workspaceId: "workspace_demo",
    schemaVersion: 1,
    source: "fake-job-board",
    sourceUrl: "https://example.invalid/jobs/demo",
    externalId: "external_demo",
    title: "Demo Role",
    company: "Example Company",
    locations: [{ label: "Remote" }],
    workModes: ["remote"],
    description: "Synthetic job description.",
    discoveredAt: "2026-09-08T00:00:00.000Z",
  },
  resumeVersionId: "resume_demo",
};

describe("connector workspace boundary", () => {
  it("accepts application data from one workspace", () => {
    expect(() => assertApplicationInputWorkspace(input)).not.toThrow();
  });

  it("rejects a job from a different workspace", () => {
    expect(() =>
      assertApplicationInputWorkspace({
        ...input,
        job: { ...input.job, workspaceId: "workspace_other" },
      }),
    ).toThrow(/one workspace/);
  });
});

describe("connector capability contract", () => {
  it("rejects a declared capability without its methods", () => {
    const connector: ConnectorBase = {
      manifest: {
        id: "broken-demo",
        name: "Broken Demo",
        version: "0.1.0",
        sdkVersion: "0.1.0",
        configSchemaVersion: "1",
        runtime: "server",
        capabilities: ["discover"],
        supportedLocales: ["en"],
        authentication: "none",
        permissions: ["read_jobs"],
        usesLocalCredentials: false,
      },
    };

    expect(() => assertCapability(connector, "discover")).toThrow(
      /does not implement discover/,
    );
  });
});
