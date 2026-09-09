import { describe, expect, it } from "vitest";
import type {
  ActionKind,
  ActionPlan,
  AutomationLevel,
  AutomationPolicy,
  InterviewScheduleReadiness,
  ScheduleInterviewActionPlan,
  StandardActionPlan,
  UsageSnapshot,
} from "@rolefox/domain";
import { DEFAULT_AUTOMATION_POLICY, evaluateActionPlan } from "../src";

const basePlan: StandardActionPlan = {
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

const interviewSlot = {
  startsAt: "2026-09-10T14:00:00.000Z",
  endsAt: "2026-09-10T15:00:00.000Z",
  timeZone: "UTC",
} as const;

const scheduleReadiness: InterviewScheduleReadiness = {
  interviewId: "interview_demo_001",
  replyOperation: {
    connectorId: "fake-job-board",
    connectorVersion: "0.1.0",
    idempotencyKey: "demo:interview-reply:001",
    payloadHash: "sha256:synthetic-interview-reply",
  },
  calendarOperation: {
    connectorId: "fake-calendar",
    connectorVersion: "0.1.0",
    calendarAccountId: "calendar-account-demo",
    idempotencyKey: "demo:calendar-event:001",
    payloadHash: "sha256:synthetic-calendar-event",
  },
  slot: interviewSlot,
  timeInterpretation: "exact",
  preauthorizationId: "schedule_auth_demo",
  preauthorizationVersion: "1",
  preauthorizationExpiresAt: "2026-10-08T00:00:00.000Z",
  availabilitySnapshot: {
    id: "availability_demo_001",
    workspaceId: "workspace_local",
    calendarConnectorId: "fake-calendar",
    calendarConnectorVersion: "0.1.0",
    calendarAccountId: "calendar-account-demo",
    slot: interviewSlot,
    availability: "free",
    checkedAt: "2026-09-08T00:03:00.000Z",
  },
  unresolvedQuestionIds: [],
};

const schedulePlan: ScheduleInterviewActionPlan = {
  ...basePlan,
  kind: "schedule_interview",
  scheduleReadiness,
};

const schedulePreauthorization = {
  id: "schedule_auth_demo",
  workspaceId: "workspace_local",
  version: "1",
  expiresAt: "2026-10-08T00:00:00.000Z",
  calendarConnectorId: "fake-calendar",
  calendarConnectorVersion: "0.1.0",
  calendarAccountId: "calendar-account-demo",
  allowedWindows: [
    {
      startsAt: "2026-09-10T13:00:00.000Z",
      endsAt: "2026-09-10T17:00:00.000Z",
      timeZone: "UTC",
    },
  ],
};

const l3SchedulePolicy: AutomationPolicy = {
  ...DEFAULT_AUTOMATION_POLICY,
  level: "L3",
  dryRun: false,
  requireApproval: false,
  autoScheduleInterviews: true,
  allowedConnectorIds: ["fake-job-board"],
  allowedCalendarConnectorIds: ["fake-calendar"],
  schedulePreauthorizations: [schedulePreauthorization],
};

const planFor = (kind: ActionKind): ActionPlan => {
  if (kind === "schedule_interview") {
    return schedulePlan;
  }

  return { ...basePlan, kind };
};

const usage: UsageSnapshot = {
  workspaceId: "workspace_local",
  applicationsToday: 0,
  repliesThisHour: 0,
  interviewSchedulesToday: 0,
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

  it("requires approval for high-risk sensitive replies at L3", () => {
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

  it("allows L3 interview scheduling inside a fresh preauthorized window", () => {
    expect(evaluate(schedulePlan, l3SchedulePolicy)).toMatchObject({
      outcome: "allow",
      reasonCode: "POLICY_PASSED",
    });
  });

  it("escalates unsafe scheduling conditions instead of confirming them", () => {
    const outsideSlot = {
      startsAt: "2026-09-10T18:00:00.000Z",
      endsAt: "2026-09-10T19:00:00.000Z",
      timeZone: "UTC",
    };
    const cases: Array<{
      name: string;
      plan: ScheduleInterviewActionPlan;
      outcome?: "require_approval" | "deny";
      reasonCode: string;
    }> = [
      {
        name: "calendar conflict",
        plan: {
          ...schedulePlan,
          scheduleReadiness: {
            ...scheduleReadiness,
            availabilitySnapshot: {
              ...scheduleReadiness.availabilitySnapshot,
              availability: "conflict",
            },
          },
        },
        reasonCode: "CALENDAR_CONFLICT",
      },
      {
        name: "unknown availability",
        plan: {
          ...schedulePlan,
          scheduleReadiness: {
            ...scheduleReadiness,
            availabilitySnapshot: {
              ...scheduleReadiness.availabilitySnapshot,
              availability: "unknown",
            },
          },
        },
        reasonCode: "CALENDAR_AVAILABILITY_UNKNOWN",
      },
      {
        name: "ambiguous time",
        plan: {
          ...schedulePlan,
          scheduleReadiness: {
            ...scheduleReadiness,
            timeInterpretation: "ambiguous",
          },
        },
        reasonCode: "AMBIGUOUS_INTERVIEW_TIME",
      },
      {
        name: "outside authorization",
        plan: {
          ...schedulePlan,
          scheduleReadiness: {
            ...scheduleReadiness,
            slot: outsideSlot,
            availabilitySnapshot: {
              ...scheduleReadiness.availabilitySnapshot,
              slot: outsideSlot,
            },
          },
        },
        reasonCode: "OUTSIDE_AUTHORIZED_WINDOW",
      },
      {
        name: "stale availability",
        plan: {
          ...schedulePlan,
          scheduleReadiness: {
            ...scheduleReadiness,
            availabilitySnapshot: {
              ...scheduleReadiness.availabilitySnapshot,
              checkedAt: "2026-09-07T23:00:00.000Z",
            },
          },
        },
        reasonCode: "STALE_AVAILABILITY",
      },
      {
        name: "unresolved recruiter question",
        plan: {
          ...schedulePlan,
          scheduleReadiness: {
            ...scheduleReadiness,
            unresolvedQuestionIds: ["question_demo_001"],
          },
        },
        reasonCode: "UNRESOLVED_RECRUITER_QUESTIONS",
      },
      {
        name: "timestamp without offset",
        plan: {
          ...schedulePlan,
          scheduleReadiness: {
            ...scheduleReadiness,
            slot: {
              ...scheduleReadiness.slot,
              startsAt: "2026-09-10T14:00:00",
            },
          },
        },
        outcome: "deny",
        reasonCode: "INVALID_INTERVIEW_SLOT",
      },
      {
        name: "invalid IANA time zone",
        plan: {
          ...schedulePlan,
          scheduleReadiness: {
            ...scheduleReadiness,
            slot: {
              ...scheduleReadiness.slot,
              timeZone: "Mars/Olympus_Mons",
            },
          },
        },
        outcome: "deny",
        reasonCode: "INVALID_INTERVIEW_SLOT",
      },
    ];

    for (const testCase of cases) {
      expect(
        evaluate(testCase.plan, l3SchedulePolicy),
        testCase.name,
      ).toMatchObject({
        outcome: testCase.outcome ?? "require_approval",
        reasonCode: testCase.reasonCode,
      });
    }
  });

  it("denies scheduling evidence bound to another calendar slot", () => {
    expect(
      evaluate(
        {
          ...schedulePlan,
          scheduleReadiness: {
            ...scheduleReadiness,
            availabilitySnapshot: {
              ...scheduleReadiness.availabilitySnapshot,
              slot: {
                ...scheduleReadiness.slot,
                startsAt: "2026-09-10T15:00:00.000Z",
              },
            },
          },
        },
        l3SchedulePolicy,
      ),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "CALENDAR_SNAPSHOT_MISMATCH",
    });
  });

  it("runs hard schedule integrity checks before any approval path", () => {
    const mismatchedSnapshotPlan: ScheduleInterviewActionPlan = {
      ...schedulePlan,
      scheduleReadiness: {
        ...scheduleReadiness,
        availabilitySnapshot: {
          ...scheduleReadiness.availabilitySnapshot,
          calendarAccountId: "calendar-account-other",
        },
      },
    };
    const invalidSlotPlan: ScheduleInterviewActionPlan = {
      ...schedulePlan,
      scheduleReadiness: {
        ...scheduleReadiness,
        slot: {
          ...scheduleReadiness.slot,
          startsAt: "2026-09-10T14:00:00",
        },
      },
    };
    const unallowedCalendarPlan: ScheduleInterviewActionPlan = {
      ...schedulePlan,
      risk: "high",
      sensitiveTopics: ["compensation"],
      scheduleReadiness: {
        ...scheduleReadiness,
        calendarOperation: {
          ...scheduleReadiness.calendarOperation,
          connectorId: "unallowed-calendar",
        },
      },
    };
    const l2Policy: AutomationPolicy = {
      ...DEFAULT_AUTOMATION_POLICY,
      dryRun: false,
      allowedConnectorIds: ["fake-job-board"],
      allowedCalendarConnectorIds: ["fake-calendar"],
    };

    expect(evaluate(mismatchedSnapshotPlan, l2Policy)).toMatchObject({
      outcome: "deny",
      reasonCode: "CALENDAR_SNAPSHOT_MISMATCH",
    });
    expect(evaluate(invalidSlotPlan, l2Policy)).toMatchObject({
      outcome: "deny",
      reasonCode: "INVALID_INTERVIEW_SLOT",
    });
    expect(evaluate(unallowedCalendarPlan, l3SchedulePolicy)).toMatchObject({
      outcome: "deny",
      reasonCode: "CALENDAR_CONNECTOR_NOT_ALLOWED",
    });
  });

  it("requires a current schedule authorization and enabled Autopilot", () => {
    expect(
      evaluate(schedulePlan, {
        ...l3SchedulePolicy,
        autoScheduleInterviews: false,
      }),
    ).toMatchObject({
      outcome: "require_approval",
      reasonCode: "AUTO_SCHEDULING_DISABLED",
    });
    expect(
      evaluate(schedulePlan, {
        ...l3SchedulePolicy,
        schedulePreauthorizations: [],
      }),
    ).toMatchObject({
      outcome: "require_approval",
      reasonCode: "CALENDAR_AUTHORIZATION_REQUIRED",
    });
  });

  it("applies reply and schedule limits to automatic confirmations", () => {
    expect(
      evaluate(schedulePlan, l3SchedulePolicy, {
        ...usage,
        repliesThisHour: l3SchedulePolicy.maxRepliesPerHour,
      }),
    ).toMatchObject({ outcome: "deny", reasonCode: "REPLY_LIMIT_REACHED" });
    expect(
      evaluate(schedulePlan, l3SchedulePolicy, {
        ...usage,
        interviewSchedulesToday:
          l3SchedulePolicy.maxInterviewSchedulesPerDay,
      }),
    ).toMatchObject({
      outcome: "deny",
      reasonCode: "INTERVIEW_SCHEDULE_LIMIT_REACHED",
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
      L3: ["allow", "allow", "allow", "allow", "allow"],
      L4: ["deny", "deny", "deny", "deny", "deny"],
    } as const;

    for (const level of levels) {
      actions.forEach((kind, index) => {
        const result = evaluate(
          { ...planFor(kind), risk: "low", sensitiveTopics: [] },
          {
            ...DEFAULT_AUTOMATION_POLICY,
            level,
            dryRun: false,
            requireApproval: false,
            autoApply: true,
            autoReply: true,
            autoScheduleInterviews: true,
            allowedConnectorIds: ["fake-job-board"],
            allowedCalendarConnectorIds: ["fake-calendar"],
            schedulePreauthorizations: [schedulePreauthorization],
          },
        );

        expect(result.outcome, `${level} ${kind}`).toBe(
          expected[level][index],
        );
      });
    }
  });
});
