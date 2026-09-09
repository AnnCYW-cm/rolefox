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

export const DEFAULT_AUTOMATION_POLICY: Readonly<AutomationPolicy> = {
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
): PolicyDecision {
  if (policy.killSwitch) {
    return decision("deny", "KILL_SWITCH", "The global kill switch is enabled.");
  }

  if (policy.dryRun) {
    return decision(
      "preview_only",
      "DRY_RUN",
      "Dry-run is enabled; no external action may be executed.",
    );
  }

  if (
    policy.allowedConnectorIds.length > 0 &&
    !policy.allowedConnectorIds.includes(plan.connectorId)
  ) {
    return decision(
      "deny",
      "CONNECTOR_NOT_ALLOWED",
      "The connector is not on the configured allowlist.",
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

    if (!policy.autoApply || policy.level === "L0" || policy.level === "L1") {
      return decision(
        "require_approval",
        "AUTO_APPLY_DISABLED",
        "Application submission requires explicit approval.",
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

    if (!policy.autoReply || policy.level !== "L3") {
      return decision(
        "require_approval",
        "AUTO_REPLY_DISABLED",
        "Reply sending requires explicit approval.",
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

  if (policy.requireApproval && plan.kind !== "send_notification") {
    return decision(
      "require_approval",
      "GLOBAL_APPROVAL_REQUIRED",
      "The global approval requirement is enabled.",
    );
  }

  if (policy.level === "L4") {
    return decision(
      "require_approval",
      "L4_NOT_AVAILABLE",
      "Unattended L4 automation is intentionally unavailable.",
    );
  }

  return decision("allow", "POLICY_PASSED", "The action passed all policy checks.");
}
