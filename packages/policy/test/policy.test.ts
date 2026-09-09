import { describe, expect, it } from "vitest";
import type {
  ActionKind,
  ActionPlan,
  AutomationLevel,
  AutomationPolicy,
  UsageSnapshot,
} from "@rolefox/domain";
import { DEFAULT_AUTOMATION_POLICY, evaluateActionPlan } from "../src";

const basePlan: ActionPlan = {
  id: "plan_demo_001",
  workspaceId: "workspace_local",
  schemaVersion: 1,
  idempotencyKey: "demo:application:001",
  kind: "submit_application",
  connectorId: "fake-job-board",
  connectorVersion: "0.1.0",
  target: "job_demo_001",
  risk: "medium",
  sensitiveTopics: [],
  payloadPreview: { resumeVersion: "resume_demo_v1" },
  payloadHash: "sha256:synthetic-demo-payload",
  evidenceIds: ["evidence_demo_001"],
  policyVersion: "1",
  createdAt: "2026-09-08T00:00:00.000Z",
  expiresAt: "2026-09-08T00:15:00.000Z",
};

const usage: UsageSnapshot = {
  workspaceId: "workspace_local",
  applicationsToday: 0,
  repliesThisHour: 0,
};

const evaluationContext = { now: "2026-09-08T00:05:00.000Z" };

const evaluate = (
  plan: ActionPlan,
  policy: AutomationPolicy,
  usageSnapshot: UsageSnapshot = usage,
) => evaluateActionPlan(plan, policy, usageSnapshot, evaluationContext);

describe("automation policy", () => {
  it("prevents execution in the safe default dry-run mode", () => {
    expect(evaluate(basePlan, { ...DEFAULT_AUTOMATION_POLICY })).toMatchObject({
      outcome: "preview_only",
      reasonCode: "DRY_RUN",
    });
  });

  it("prioritizes the kill switch even when dry-run is enabled", () => {
    expect(
      evaluate(basePlan, {
        ...DEFAULT_AUTOMATION_POLICY,
        killSwitch: true,
      }),
    ).toMatchObject({ outcome: "deny", reasonCode: "KILL_SWITCH" });
  });

  it("denies action data from a different workspace", () => {
    expect(
      evaluate(
        { ...basePlan, workspaceId: "workspace_other" },
        { ...DEFAULT_AUTOMATION_POLICY },
      ),
    ).toMatchObject({ outcome: "deny", reasonCode: "WORKSPACE_MISMATCH" });
  });

  it("denies plans created under a stale policy", () => {
    expect(
      evaluate(
        { ...basePlan, policyVersion: "0" },
        { ...DEFAULT_AUTOMATION_POLICY },
      ),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "POLICY_VERSION_MISMATCH",
    });
  });

  it("denies expired plans", () => {
    expect(
      evaluate(
        { ...basePlan, expiresAt: "2026-09-08T00:04:00.000Z" },
        { ...DEFAULT_AUTOMATION_POLICY },
      ),
    ).toMatchObject({ outcome: "deny", reasonCode: "PLAN_EXPIRED" });
  });

  it("requires approval for sensitive replies even at L3", () => {
    const policy: AutomationPolicy = {
      ...DEFAULT_AUTOMATION_POLICY,
      level: "L3",
      dryRun: false,
      requireApproval: false,
      autoReply: true,
      allowedConnectorIds: ["fake-job-board"],
    };
    const replyPlan: ActionPlan = {
      ...basePlan,
      kind: "send_reply",
      risk: "high",
      sensitiveTopics: ["compensation"],
    };

    expect(evaluate(replyPlan, policy)).toMatchObject({
      outcome: "require_approval",
      reasonCode: "SENSITIVE_OR_HIGH_RISK",
    });
  });

  it("requires an explicit connector allowlist for L3 automation", () => {
    expect(
      evaluate(basePlan, {
        ...DEFAULT_AUTOMATION_POLICY,
        level: "L3",
        dryRun: false,
        requireApproval: false,
        autoApply: true,
        allowedConnectorIds: [],
      }),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "CONNECTOR_NOT_ALLOWED",
    });
  });

  it("enforces the complete level and action matrix", () => {
    const actions: ActionKind[] = [
      "create_material",
      "submit_application",
      "send_reply",
      "schedule_interview",
      "send_notification",
    ];
    const levels: AutomationLevel[] = ["L0", "L1", "L2", "L3", "L4"];
    const expected = {
      L0: [
        "preview_only",
        "preview_only",
        "preview_only",
        "preview_only",
        "preview_only",
      ],
      L1: ["allow", "deny", "deny", "deny", "allow"],
      L2: [
        "allow",
        "require_approval",
        "require_approval",
        "require_approval",
        "allow",
      ],
      L3: ["allow", "allow", "allow", "require_approval", "allow"],
      L4: ["deny", "deny", "deny", "deny", "deny"],
    } as const;

    for (const level of levels) {
      actions.forEach((kind, index) => {
        const result = evaluate(
          { ...basePlan, kind, risk: "low", sensitiveTopics: [] },
          {
            ...DEFAULT_AUTOMATION_POLICY,
            level,
            dryRun: false,
            requireApproval: false,
            autoApply: true,
            autoReply: true,
            allowedConnectorIds: ["fake-job-board"],
          },
        );

        expect(result.outcome, `${level} ${kind}`).toBe(
          expected[level][index],
        );
      });
    }
  });
});
