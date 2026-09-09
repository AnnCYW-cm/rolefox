import type {
  ActionPlanFor,
  CalendarAvailabilityEvidence,
  CandidateProfile,
  CompensationRange,
  EmploymentType,
  JobLocation,
  JobPosting,
  InterviewSlot,
  RiskLevel,
  ScheduleInterviewActionPlan,
  SensitiveTopic,
  WorkMode,
} from "@rolefox/domain";

export const CONNECTOR_CAPABILITIES = [
  "discover",
  "detail",
  "apply",
  "inbox",
  "reply",
  "notify",
  "calendar",
] as const;

export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];

export type ConnectorRuntime = "server" | "local";

export type ConnectorAuthentication =
  | "none"
  | "api_key"
  | "oauth2"
  | "local_session";

export type ConnectorPermission =
  | "read_jobs"
  | "read_messages"
  | "submit_applications"
  | "send_messages"
  | "send_notifications"
  | "read_calendar"
  | "write_calendar";

export interface ConnectorManifest {
  id: string;
  name: string;
  version: string;
  sdkVersion: string;
  configSchemaVersion: string;
  runtime: ConnectorRuntime;
  capabilities: ConnectorCapability[];
  supportedLocales: string[];
  authentication: ConnectorAuthentication;
  permissions: ConnectorPermission[];
  usesLocalCredentials: boolean;
  termsUrl?: string;
  docsUrl?: string;
  rateLimitHint?: {
    requests: number;
    perSeconds: number;
  };
}

export interface DiscoveryQuery {
  campaignId: string;
  keywords: string[];
  locations: JobLocation[];
  workModes: WorkMode[];
  employmentTypes: EmploymentType[];
  minimumCompensation?: CompensationRange;
  preferredLanguages: string[];
  cursor?: string;
}

export interface ExternalJobPosting {
  externalId: string;
  sourceUrl: string;
  title: string;
  company: string;
  locations: JobLocation[];
  workModes: WorkMode[];
  employmentType?: EmploymentType;
  description: string;
  language?: string;
  compensation?: CompensationRange;
  compensationText?: string;
  publishedAt?: string;
}

export interface DiscoveryResult {
  jobs: ExternalJobPosting[];
  nextCursor?: string;
}

export interface ApplyPlanInput {
  workspaceId: string;
  candidate: CandidateProfile;
  job: JobPosting;
  resumeVersionId: string;
  message?: string;
}

export interface ActionDraft {
  target: string;
  riskHints: {
    suggestedLevel: RiskLevel;
    sensitiveTopics: SensitiveTopic[];
  };
  payloadPreview: Record<string, unknown>;
}

export interface InboxQuery {
  workspaceId: string;
  cursor?: string;
  since?: string;
}

export interface InboxMessage {
  externalId: string;
  threadId: string;
  sender: string;
  text: string;
  language?: string;
  receivedAt: string;
}

export interface InboxResult {
  messages: InboxMessage[];
  nextCursor?: string;
}

export interface ReplyPlanInput {
  workspaceId: string;
  message: InboxMessage;
  text: string;
  evidenceIds: string[];
}

export interface NotificationPlanInput {
  workspaceId: string;
  channel: string;
  subject: string;
  body: string;
}

export interface CalendarAvailabilityQuery {
  workspaceId: string;
  calendarAccountId: string;
  slot: InterviewSlot;
}

export type CalendarAvailabilitySnapshot = CalendarAvailabilityEvidence;

export interface ExecuteContext {
  authorizationToken: string;
  expectedPlanId: string;
  expectedOperationIdempotencyKey: string;
  expectedPayloadHash: string;
  signal?: AbortSignal;
}

export interface ExecutionResult {
  ok: boolean;
  externalReference?: string;
  summary: string;
  executedAt: string;
}

export interface ConnectorBase {
  readonly manifest: ConnectorManifest;
}

export interface DiscoveryConnector extends ConnectorBase {
  discover(query: DiscoveryQuery): Promise<DiscoveryResult>;
}

export interface JobDetailConnector extends ConnectorBase {
  getDetail(externalId: string): Promise<ExternalJobPosting>;
}

export interface ApplicationConnector extends ConnectorBase {
  planApplication(input: ApplyPlanInput): Promise<ActionDraft>;
  executeApplication(
    plan: ActionPlanFor<"submit_application">,
    context: ExecuteContext,
  ): Promise<ExecutionResult>;
}

export interface InboxConnector extends ConnectorBase {
  readInbox(query: InboxQuery): Promise<InboxResult>;
}

export interface ReplyConnector extends ConnectorBase {
  planReply(input: ReplyPlanInput): Promise<ActionDraft>;
  executeReply(
    plan: ActionPlanFor<"send_reply">,
    context: ExecuteContext,
  ): Promise<ExecutionResult>;
  executeInterviewConfirmation(
    plan: ScheduleInterviewActionPlan,
    context: ExecuteContext,
  ): Promise<ExecutionResult>;
}

export interface NotificationConnector extends ConnectorBase {
  planNotification(input: NotificationPlanInput): Promise<ActionDraft>;
  executeNotification(
    plan: ActionPlanFor<"send_notification">,
    context: ExecuteContext,
  ): Promise<ExecutionResult>;
}

export interface CalendarConnector extends ConnectorBase {
  checkAvailability(
    query: CalendarAvailabilityQuery,
  ): Promise<CalendarAvailabilitySnapshot>;
  createInterviewEvent(
    plan: ScheduleInterviewActionPlan,
    context: ExecuteContext,
  ): Promise<ExecutionResult>;
}

export function assertCapability(
  connector: ConnectorBase,
  capability: ConnectorCapability,
): void {
  if (!connector.manifest.capabilities.includes(capability)) {
    throw new Error(
      `Connector ${connector.manifest.id} does not declare ${capability}`,
    );
  }

  const methodsByCapability: Record<
    ConnectorCapability,
    readonly string[]
  > = {
    discover: ["discover"],
    detail: ["getDetail"],
    apply: ["planApplication", "executeApplication"],
    inbox: ["readInbox"],
    reply: ["planReply", "executeReply", "executeInterviewConfirmation"],
    notify: ["planNotification", "executeNotification"],
    calendar: ["checkAvailability", "createInterviewEvent"],
  };
  const implementation = connector as unknown as Record<string, unknown>;

  for (const method of methodsByCapability[capability]) {
    if (typeof implementation[method] !== "function") {
      throw new Error(
        `Connector ${connector.manifest.id} declares ${capability} but does not implement ${method}`,
      );
    }
  }
}

export function assertApplicationInputWorkspace(input: ApplyPlanInput): void {
  if (
    input.candidate.workspaceId !== input.workspaceId ||
    input.job.workspaceId !== input.workspaceId
  ) {
    throw new Error(
      "Application input, candidate, and job must belong to one workspace.",
    );
  }
}
