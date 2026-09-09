export const AUTOMATION_LEVELS = ["L0", "L1", "L2", "L3", "L4"] as const;

export type AutomationLevel = (typeof AUTOMATION_LEVELS)[number];

export type RiskLevel = "low" | "medium" | "high" | "critical";

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

export interface CandidateProfile {
  id: string;
  displayName: string;
  targetRoles: string[];
  preferredLocations: string[];
  minimumCompensation?: number;
  evidenceIds: string[];
}

export interface ProfileEvidence {
  id: string;
  kind: "employment" | "education" | "project" | "skill" | "preference";
  claim: string;
  source: string;
  verifiedAt: string;
}

export interface JobPosting {
  id: string;
  source: string;
  sourceUrl: string;
  externalId?: string;
  title: string;
  company: string;
  locations: string[];
  description: string;
  compensationText?: string;
  discoveredAt: string;
}

export interface JobScore {
  jobId: string;
  total: number;
  hardFilterPassed: boolean;
  reasons: string[];
  concerns: string[];
  scoredAt: string;
}

export interface ActionPlan {
  id: string;
  idempotencyKey: string;
  kind: ActionKind;
  connectorId: string;
  target: string;
  risk: RiskLevel;
  sensitiveTopics: SensitiveTopic[];
  payloadPreview: Record<string, unknown>;
  evidenceIds: string[];
  createdAt: string;
}

export interface AutomationPolicy {
  level: AutomationLevel;
  dryRun: boolean;
  killSwitch: boolean;
  requireApproval: boolean;
  autoApply: boolean;
  autoReply: boolean;
  maxApplicationsPerDay: number;
  maxRepliesPerHour: number;
  allowedConnectorIds: string[];
}

export interface UsageSnapshot {
  applicationsToday: number;
  repliesThisHour: number;
}
