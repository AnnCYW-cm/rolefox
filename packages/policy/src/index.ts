import type {
  ActionPlan,
  AutomationPolicy,
  SensitiveTopic,
  UsageSnapshot,
} from "@rolefox/domain";

export type PolicyOutcome =
  | "allow"
  | "require_approval"
  | "preview_only"
  | "deny";

export interface PolicyDecision {
  outcome: PolicyOutcome;
  reasonCode: string;
  explanation: string;
}

export interface PolicyEvaluationContext {
  now?: string;
}

export function createDefaultAutomationPolicy(
  workspaceId: string,
): AutomationPolicy {
  return {
    workspaceId,
    policyVersion: "1",
    level: "L2",
    dryRun: true,
    killSwitch: false,
    requireApproval: true,
    autoApply: false,
    autoReply: false,
    maxApplicationsPerDay: 10,
    maxRepliesPerHour: 8,
    allowedConnectorIds: [],
  };
}

export const DEFAULT_AUTOMATION_POLICY: Readonly<AutomationPolicy> =
  createDefaultAutomationPolicy("workspace_local");

const MANUAL_TOPICS = new Set<SensitiveTopic>([
  "compensation",
  "start_date",
  "work_location",
  "travel",
  "visa",
  "legal_declaration",
  "identity",
  "education",
  "work_history",
  "skills",
  "offer_decision",
  "interview_conflict",
]);

const decision = (
  outcome: PolicyOutcome,
  reasonCode: string,
  explanation: string,
): PolicyDecision => ({ outcome, reasonCode, explanation });

export function evaluateActionPlan(
  plan: ActionPlan,
  policy: AutomationPolicy,
  usage: UsageSnapshot,
  context: PolicyEvaluationContext = {},
): PolicyDecision {
  if (policy.killSwitch) {
    return decision("deny", "KILL_SWITCH", "The global kill switch is enabled.");
  }

  if (
    plan.workspaceId !== policy.workspaceId ||
    usage.workspaceId !== policy.workspaceId
  ) {
    return decision(
      "deny",
      "WORKSPACE_MISMATCH",
      "The action, policy, and usage snapshot must belong to one workspace.",
    );
  }

  if (plan.policyVersion !== policy.policyVersion) {
    return decision(
      "deny",
      "POLICY_VERSION_MISMATCH",
      "The action was created under a different policy version.",
    );
  }

  const createdAt = Date.parse(plan.createdAt);
  const expiresAt = Date.parse(plan.expiresAt);
  const evaluatedAt = context.now ? Date.parse(context.now) : Date.now();

  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(evaluatedAt) ||
    expiresAt <= createdAt
  ) {
    return decision(
      "deny",
      "INVALID_PLAN_TIME",
      "The action plan has invalid creation, expiration, or evaluation time.",
    );
  }

  if (expiresAt <= evaluatedAt) {
    return decision(
      "deny",
      "PLAN_EXPIRED",
      "The action plan has expired and must be regenerated.",
    );
  }

  if (policy.dryRun) {
    return decision(
      "preview_only",
      "DRY_RUN",
      "Dry-run is enabled; no external action may be executed.",
    );
  }

  if (policy.level === "L4") {
    return decision(
      "deny",
      "L4_NOT_AVAILABLE",
      "Unattended L4 automation is intentionally unavailable.",
    );
  }

  if (policy.level === "L0") {
    return decision(
      "preview_only",
      "L0_OBSERVE_ONLY",
      "L0 can inspect plans but cannot execute actions.",
    );
  }

  if (
    plan.kind !== "create_material" &&
    !policy.allowedConnectorIds.includes(plan.connectorId)
  ) {
    return decision(
      "deny",
      "CONNECTOR_NOT_ALLOWED",
      "The connector is not on the configured allowlist.",
    );
  }

  const isExternalCommitment =
    plan.kind === "submit_application" ||
    plan.kind === "send_reply" ||
    plan.kind === "schedule_interview";

  if (policy.level === "L1" && isExternalCommitment) {
    return decision(
      "deny",
      "L1_INTERNAL_ASSISTANCE_ONLY",
      "L1 may prepare internal assistance but cannot execute external commitments.",
    );
  }

  if (plan.kind === "submit_application") {
    if (usage.applicationsToday >= policy.maxApplicationsPerDay) {
      return decision(
        "deny",
        "APPLICATION_LIMIT_REACHED",
        "The daily application limit has been reached.",
      );
    }
  }

  if (plan.kind === "send_reply") {
    if (usage.repliesThisHour >= policy.maxRepliesPerHour) {
      return decision(
        "deny",
        "REPLY_LIMIT_REACHED",
        "The hourly reply limit has been reached.",
      );
    }
  }

  if (
    plan.risk === "high" ||
    plan.risk === "critical" ||
    plan.sensitiveTopics.some((topic) => MANUAL_TOPICS.has(topic))
  ) {
    return decision(
      "require_approval",
      "SENSITIVE_OR_HIGH_RISK",
      "This action contains a sensitive commitment or elevated risk.",
    );
  }

  if (plan.kind === "schedule_interview") {
    return decision(
      "require_approval",
      "INTERVIEW_SCHEDULING_REQUIRES_APPROVAL",
      "Interview scheduling always requires explicit approval.",
    );
  }

  if (plan.kind === "submit_application") {
    if (policy.level === "L2") {
      return decision(
        "require_approval",
        "L2_APPLICATION_REQUIRES_APPROVAL",
        "L2 requires explicit approval for every application.",
      );
    }

    if (!policy.autoApply) {
      return decision(
        "require_approval",
        "AUTO_APPLY_DISABLED",
        "Automatic application submission is disabled.",
      );
    }
  }

  if (plan.kind === "send_reply") {
    if (policy.level === "L2") {
      return decision(
        "require_approval",
        "L2_REPLY_REQUIRES_APPROVAL",
        "L2 requires explicit approval for every external reply.",
      );
    }

    if (!policy.autoReply) {
      return decision(
        "require_approval",
        "AUTO_REPLY_DISABLED",
        "Automatic external replies are disabled.",
      );
    }
  }

  if (policy.requireApproval && plan.kind !== "send_notification") {
    return decision(
      "require_approval",
      "GLOBAL_APPROVAL_REQUIRED",
      "The global approval requirement is enabled.",
    );
  }

  return decision("allow", "POLICY_PASSED", "The action passed all policy checks.");
}
