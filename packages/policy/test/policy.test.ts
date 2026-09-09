import { describe, expect, it } from "vitest";
import type { ActionPlan, AutomationPolicy } from "@rolefox/domain";
import { DEFAULT_AUTOMATION_POLICY, evaluateActionPlan } from "../src";

const basePlan: ActionPlan = {
  id: "plan_demo_001",
  idempotencyKey: "demo:application:001",
  kind: "submit_application",
  connectorId: "fake-job-board",
  target: "job_demo_001",
  risk: "medium",
  sensitiveTopics: [],
  payloadPreview: { resumeVersion: "resume_demo_v1" },
  evidenceIds: ["evidence_demo_001"],
  createdAt: "2026-09-08T00:00:00.000Z",
};

const usage = { applicationsToday: 0, repliesThisHour: 0 };

describe("automation policy", () => {
  it("prevents execution in the safe default dry-run mode", () => {
    expect(
      evaluateActionPlan(basePlan, { ...DEFAULT_AUTOMATION_POLICY }, usage),
    ).toMatchObject({ outcome: "preview_only", reasonCode: "DRY_RUN" });
  });

  it("denies every action when the kill switch is enabled", () => {
    expect(
      evaluateActionPlan(
        basePlan,
        { ...DEFAULT_AUTOMATION_POLICY, dryRun: false, killSwitch: true },
        usage,
      ),
    ).toMatchObject({ outcome: "deny", reasonCode: "KILL_SWITCH" });
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

    expect(evaluateActionPlan(replyPlan, policy, usage)).toMatchObject({
      outcome: "require_approval",
      reasonCode: "SENSITIVE_OR_HIGH_RISK",
    });
  });

  it("allows a low-risk notification when dry-run is disabled", () => {
    const notification: ActionPlan = {
      ...basePlan,
      kind: "send_notification",
      risk: "low",
    };

    expect(
      evaluateActionPlan(
        notification,
        { ...DEFAULT_AUTOMATION_POLICY, dryRun: false },
        usage,
      ),
    ).toMatchObject({ outcome: "allow", reasonCode: "POLICY_PASSED" });
  });
});
