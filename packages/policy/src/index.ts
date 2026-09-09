import type {
  ActionPlan,
  AutomationPolicy,
  ScheduleInterviewActionPlan,
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
    autoScheduleInterviews: false,
    maxApplicationsPerDay: 10,
    maxRepliesPerHour: 8,
    maxInterviewSchedulesPerDay: 8,
    maxAvailabilityAgeMinutes: 5,
    allowedConnectorIds: [],
    allowedCalendarConnectorIds: [],
    schedulePreauthorizations: [],
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

const RFC3339_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const parseInstant = (value: string): number =>
  RFC3339_INSTANT.test(value) ? Date.parse(value) : Number.NaN;

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
};

const slotsMatch = (
  left: ScheduleInterviewActionPlan["scheduleReadiness"]["slot"],
  right: ScheduleInterviewActionPlan["scheduleReadiness"]["slot"],
): boolean =>
  left.startsAt === right.startsAt &&
  left.endsAt === right.endsAt &&
  left.timeZone === right.timeZone;

const hasCompleteOperationBinding = (operation: {
  connectorId: string;
  connectorVersion: string;
  idempotencyKey: string;
  payloadHash: string;
}): boolean =>
  Boolean(
    operation.connectorId &&
      operation.connectorVersion &&
      operation.idempotencyKey &&
      operation.payloadHash,
  );

function validateInterviewScheduleIntegrity(
  plan: ScheduleInterviewActionPlan,
  policy: AutomationPolicy,
  evaluatedAt: number,
): PolicyDecision | undefined {
  const readiness = plan.scheduleReadiness;
  const replyOperation = readiness.replyOperation;
  const calendarOperation = readiness.calendarOperation;
  const availabilitySnapshot = readiness.availabilitySnapshot;

  if (
    !hasCompleteOperationBinding(replyOperation) ||
    replyOperation.connectorId !== plan.connectorId ||
    replyOperation.connectorVersion !== plan.connectorVersion
  ) {
    return decision(
      "deny",
      "REPLY_CONNECTOR_MISMATCH",
      "The interview confirmation operation does not match the action connector.",
    );
  }

  if (
    !hasCompleteOperationBinding(calendarOperation) ||
    !calendarOperation.calendarAccountId
  ) {
    return decision(
      "deny",
      "INVALID_CALENDAR_OPERATION",
      "The calendar operation binding is incomplete.",
    );
  }

  if (
    !policy.allowedCalendarConnectorIds.includes(
      calendarOperation.connectorId,
    )
  ) {
    return decision(
      "deny",
      "CALENDAR_CONNECTOR_NOT_ALLOWED",
      "The calendar connector is not on the configured allowlist.",
    );
  }

  const startsAt = parseInstant(readiness.slot.startsAt);
  const endsAt = parseInstant(readiness.slot.endsAt);
  const availabilityCheckedAt = parseInstant(availabilitySnapshot.checkedAt);

  if (
    !readiness.interviewId ||
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    !isValidTimeZone(readiness.slot.timeZone) ||
    startsAt <= evaluatedAt ||
    endsAt <= startsAt
  ) {
    return decision(
      "deny",
      "INVALID_INTERVIEW_SLOT",
      "The proposed interview slot must use future RFC 3339 instants and a valid IANA time zone.",
    );
  }

  if (
    !availabilitySnapshot.id ||
    !Number.isFinite(availabilityCheckedAt) ||
    availabilitySnapshot.workspaceId !== plan.workspaceId ||
    availabilitySnapshot.calendarConnectorId !== calendarOperation.connectorId ||
    availabilitySnapshot.calendarConnectorVersion !==
      calendarOperation.connectorVersion ||
    availabilitySnapshot.calendarAccountId !==
      calendarOperation.calendarAccountId ||
    !slotsMatch(availabilitySnapshot.slot, readiness.slot)
  ) {
    return decision(
      "deny",
      "CALENDAR_SNAPSHOT_MISMATCH",
      "The availability snapshot is not bound to this workspace, calendar, and interview slot.",
    );
  }

  return undefined;
}

function evaluateInterviewScheduleEligibility(
  plan: ScheduleInterviewActionPlan,
  policy: AutomationPolicy,
  evaluatedAt: number,
): PolicyDecision | undefined {
  const readiness = plan.scheduleReadiness;
  const calendarOperation = readiness.calendarOperation;
  const availabilitySnapshot = readiness.availabilitySnapshot;

  if (policy.level === "L2") {
    return decision(
      "require_approval",
      "L2_INTERVIEW_SCHEDULING_REQUIRES_APPROVAL",
      "L2 requires explicit approval for interview scheduling.",
    );
  }

  if (!policy.autoScheduleInterviews) {
    return decision(
      "require_approval",
      "AUTO_SCHEDULING_DISABLED",
      "Automatic interview scheduling is disabled.",
    );
  }

  const authorization = policy.schedulePreauthorizations.find(
    (candidate) => candidate.id === readiness.preauthorizationId,
  );
  const authorizationExpiresAt = authorization
    ? parseInstant(authorization.expiresAt)
    : Number.NaN;
  const snapshotAuthorizationExpiresAt = parseInstant(
    readiness.preauthorizationExpiresAt,
  );

  if (
    !authorization ||
    authorization.workspaceId !== policy.workspaceId ||
    authorization.version !== readiness.preauthorizationVersion ||
    authorization.calendarConnectorId !== calendarOperation.connectorId ||
    authorization.calendarConnectorVersion !==
      calendarOperation.connectorVersion ||
    authorization.calendarAccountId !== calendarOperation.calendarAccountId ||
    !Number.isFinite(authorizationExpiresAt) ||
    authorizationExpiresAt <= evaluatedAt ||
    snapshotAuthorizationExpiresAt !== authorizationExpiresAt
  ) {
    return decision(
      "require_approval",
      "CALENDAR_AUTHORIZATION_REQUIRED",
      "A current matching schedule preauthorization is required.",
    );
  }

  if (readiness.timeInterpretation !== "exact") {
    return decision(
      "require_approval",
      "AMBIGUOUS_INTERVIEW_TIME",
      "The proposed interview time or time zone is ambiguous.",
    );
  }

  const startsAt = parseInstant(readiness.slot.startsAt);
  const endsAt = parseInstant(readiness.slot.endsAt);

  const isInsideAuthorizedWindow = authorization.allowedWindows.some(
    (window) => {
      const windowStartsAt = parseInstant(window.startsAt);
      const windowEndsAt = parseInstant(window.endsAt);

      return (
        window.timeZone === readiness.slot.timeZone &&
        isValidTimeZone(window.timeZone) &&
        Number.isFinite(windowStartsAt) &&
        Number.isFinite(windowEndsAt) &&
        windowStartsAt <= startsAt &&
        windowEndsAt >= endsAt
      );
    },
  );

  if (!isInsideAuthorizedWindow) {
    return decision(
      "require_approval",
      "OUTSIDE_AUTHORIZED_WINDOW",
      "The proposed interview is outside the preauthorized availability window.",
    );
  }

  if (availabilitySnapshot.availability === "conflict") {
    return decision(
      "require_approval",
      "CALENDAR_CONFLICT",
      "The proposed interview conflicts with the latest calendar snapshot.",
    );
  }

  if (availabilitySnapshot.availability !== "free") {
    return decision(
      "require_approval",
      "CALENDAR_AVAILABILITY_UNKNOWN",
      "Calendar availability could not be confirmed.",
    );
  }

  if (readiness.unresolvedQuestionIds.length > 0) {
    return decision(
      "require_approval",
      "UNRESOLVED_RECRUITER_QUESTIONS",
      "Recruiter questions must be resolved before confirming the interview.",
    );
  }

  const availabilityCheckedAt = parseInstant(availabilitySnapshot.checkedAt);
  const availabilityAge = evaluatedAt - availabilityCheckedAt;
  const maximumAvailabilityAge =
    policy.maxAvailabilityAgeMinutes * 60 * 1_000;

  if (
    !Number.isFinite(availabilityCheckedAt) ||
    !Number.isFinite(maximumAvailabilityAge) ||
    maximumAvailabilityAge <= 0 ||
    availabilityAge < 0 ||
    availabilityAge > maximumAvailabilityAge
  ) {
    return decision(
      "require_approval",
      "STALE_AVAILABILITY",
      "Calendar availability must be checked again before automatic scheduling.",
    );
  }

  return undefined;
}

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

  if (plan.kind === "schedule_interview") {
    const integrityDecision = validateInterviewScheduleIntegrity(
      plan,
      policy,
      evaluatedAt,
    );

    if (integrityDecision) {
      return integrityDecision;
    }
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

  if (plan.kind === "send_reply" || plan.kind === "schedule_interview") {
    if (usage.repliesThisHour >= policy.maxRepliesPerHour) {
      return decision(
        "deny",
        "REPLY_LIMIT_REACHED",
        "The hourly reply limit has been reached.",
      );
    }
  }

  if (
    plan.kind === "schedule_interview" &&
    usage.interviewSchedulesToday >= policy.maxInterviewSchedulesPerDay
  ) {
    return decision(
      "deny",
      "INTERVIEW_SCHEDULE_LIMIT_REACHED",
      "The daily interview scheduling limit has been reached.",
    );
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
    const scheduleDecision = evaluateInterviewScheduleEligibility(
      plan,
      policy,
      evaluatedAt,
    );

    if (scheduleDecision) {
      return scheduleDecision;
    }
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
