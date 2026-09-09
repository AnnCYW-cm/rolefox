export const AUTOMATION_LEVELS = ["L0", "L1", "L2", "L3", "L4"] as const;

export const ACTION_PLAN_STATUSES = [
  "DRAFT",
  "AWAITING_APPROVAL",
  "AUTHORIZED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
] as const;

export const SCHEMA_VERSION = 1 as const;

export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

export type ActionPlanStatus = (typeof ACTION_PLAN_STATUSES)[number];

export type ActionAuthorizationSource = "policy" | "human";

export type SchemaVersion = typeof SCHEMA_VERSION;

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type WorkMode = "onsite" | "hybrid" | "remote" | "flexible";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "internship"
  | "temporary"
  | "other";

export type CompensationPeriod = "hour" | "day" | "month" | "year";

export type SensitiveTopic =
  | "compensation"
  | "start_date"
  | "work_location"
  | "travel"
  | "visa"
  | "legal_declaration"
  | "identity"
  | "education"
  | "work_history"
  | "skills"
  | "offer_decision"
  | "interview_conflict";

export type ActionKind =
  | "create_material"
  | "submit_application"
  | "send_reply"
  | "schedule_interview"
  | "send_notification";

export type StandardActionKind = Exclude<ActionKind, "schedule_interview">;

export interface Workspace {
  id: string;
  schemaVersion: SchemaVersion;
  name: string;
  locale: string;
  timeZone: string;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompensationRange {
  currency: string;
  period: CompensationPeriod;
  minimum?: number;
  maximum?: number;
}

export interface JobLocation {
  label: string;
  countryCode?: string;
  region?: string;
  city?: string;
}

export interface CandidateProfile {
  id: string;
  workspaceId: string;
  schemaVersion: SchemaVersion;
  displayName: string;
  headline?: string;
  preferredLanguages: string[];
  evidenceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileEvidence {
  id: string;
  workspaceId: string;
  schemaVersion: SchemaVersion;
  kind: "employment" | "education" | "project" | "skill";
  claim: string;
  source: string;
  language?: string;
  verifiedAt: string;
}

export interface SearchCampaign {
  id: string;
  workspaceId: string;
  schemaVersion: SchemaVersion;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  targetRoles: string[];
  keywords: string[];
  excludedKeywords: string[];
  locations: JobLocation[];
  workModes: WorkMode[];
  employmentTypes: EmploymentType[];
  minimumCompensation?: CompensationRange;
  preferredLanguages: string[];
  connectorIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JobPosting {
  id: string;
  workspaceId: string;
  schemaVersion: SchemaVersion;
  source: string;
  sourceUrl: string;
  externalId?: string;
  title: string;
  company: string;
  locations: JobLocation[];
  workModes: WorkMode[];
  employmentType?: EmploymentType;
  description: string;
  language?: string;
  compensation?: CompensationRange;
  compensationText?: string;
  discoveredAt: string;
}

export interface JobScore {
  workspaceId: string;
  schemaVersion: SchemaVersion;
  campaignId: string;
  jobId: string;
  total: number;
  hardFilterPassed: boolean;
  components?: Record<string, number>;
  reasons: string[];
  concerns: string[];
  scorerVersion: string;
  scoredAt: string;
}

export interface InterviewSlot {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timeZone: string;
}

export interface ConnectorOperationBinding {
  readonly connectorId: string;
  readonly connectorVersion: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
}

export interface CalendarOperationBinding extends ConnectorOperationBinding {
  readonly calendarAccountId: string;
}

export interface CalendarAvailabilityEvidence {
  readonly id: string;
  readonly workspaceId: string;
  readonly calendarConnectorId: string;
  readonly calendarConnectorVersion: string;
  readonly calendarAccountId: string;
  readonly slot: InterviewSlot;
  readonly availability: "free" | "conflict" | "unknown";
  readonly checkedAt: string;
}

export interface InterviewScheduleReadiness {
  readonly interviewId: string;
  readonly replyOperation: ConnectorOperationBinding;
  readonly calendarOperation: CalendarOperationBinding;
  readonly slot: InterviewSlot;
  readonly timeInterpretation: "exact" | "ambiguous";
  readonly preauthorizationId: string;
  readonly preauthorizationVersion: string;
  readonly preauthorizationExpiresAt: string;
  readonly availabilitySnapshot: CalendarAvailabilityEvidence;
  readonly unresolvedQuestionIds: readonly string[];
}

export interface ActionPlanBase {
  readonly id: string;
  readonly workspaceId: string;
  readonly schemaVersion: SchemaVersion;
  readonly idempotencyKey: string;
  readonly connectorId: string;
  readonly connectorVersion: string;
  readonly target: string;
  readonly risk: RiskLevel;
  readonly sensitiveTopics: readonly SensitiveTopic[];
  readonly payloadPreview: Readonly<Record<string, unknown>>;
  readonly payloadHash: string;
  readonly evidenceIds: readonly string[];
  readonly policyVersion: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface ActionAuthorization {
  readonly actionPlanId: string;
  readonly workspaceId: string;
  readonly source: ActionAuthorizationSource;
  readonly policyVersion: string;
  readonly payloadHash: string;
  readonly authorizedAt: string;
  readonly expiresAt: string;
}

export interface StandardActionPlan<
  Kind extends StandardActionKind = StandardActionKind,
> extends ActionPlanBase {
  readonly kind: Kind;
}

export interface ScheduleInterviewActionPlan extends ActionPlanBase {
  readonly kind: "schedule_interview";
  readonly scheduleReadiness: InterviewScheduleReadiness;
}

export type ActionPlan = StandardActionPlan | ScheduleInterviewActionPlan;

export type ActionPlanFor<Kind extends ActionKind> =
  Kind extends "schedule_interview"
    ? ScheduleInterviewActionPlan
    : StandardActionPlan<Extract<Kind, StandardActionKind>>;

export interface SchedulePreauthorizationRef {
  readonly id: string;
  readonly workspaceId: string;
  readonly version: string;
  readonly expiresAt: string;
  readonly calendarConnectorId: string;
  readonly calendarConnectorVersion: string;
  readonly calendarAccountId: string;
  readonly allowedWindows: readonly InterviewSlot[];
}

export interface AutomationPolicy {
  workspaceId: string;
  policyVersion: string;
  level: AutomationLevel;
  dryRun: boolean;
  killSwitch: boolean;
  requireApproval: boolean;
  autoApply: boolean;
  autoReply: boolean;
  autoScheduleInterviews: boolean;
  maxApplicationsPerDay: number;
  maxRepliesPerHour: number;
  maxInterviewSchedulesPerDay: number;
  maxAvailabilityAgeMinutes: number;
  allowedConnectorIds: string[];
  allowedCalendarConnectorIds: string[];
  schedulePreauthorizations: SchedulePreauthorizationRef[];
}

export interface UsageSnapshot {
  workspaceId: string;
  applicationsToday: number;
  repliesThisHour: number;
  interviewSchedulesToday: number;
}
