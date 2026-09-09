import type { ActionPlan, CandidateProfile, JobPosting } from "@rolefox/domain";

export const CONNECTOR_CAPABILITIES = [
  "discover",
  "detail",
  "apply",
  "inbox",
  "reply",
  "notify",
] as const;

export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];

export interface ConnectorManifest {
  id: string;
  name: string;
  version: string;
  capabilities: ConnectorCapability[];
  usesLocalCredentials: boolean;
  termsUrl?: string;
}

export interface DiscoveryQuery {
  keywords: string[];
  locations: string[];
  remote?: boolean;
  cursor?: string;
}

export interface DiscoveryResult {
  jobs: JobPosting[];
  nextCursor?: string;
}

export interface ApplyPlanInput {
  candidate: CandidateProfile;
  job: JobPosting;
  resumeVersionId: string;
  message?: string;
}

export interface ExecuteContext {
  approvalToken: string;
  expectedPlanId: string;
  signal?: AbortSignal;
}

export interface ExecutionResult {
  ok: boolean;
  externalReference?: string;
  summary: string;
  executedAt: string;
}

export interface JobConnector {
  readonly manifest: ConnectorManifest;
  discover?(query: DiscoveryQuery): Promise<DiscoveryResult>;
  getDetail?(externalId: string): Promise<JobPosting>;
  planApplication?(input: ApplyPlanInput): Promise<ActionPlan>;
  execute?(plan: ActionPlan, context: ExecuteContext): Promise<ExecutionResult>;
}

export function assertCapability(
  connector: JobConnector,
  capability: ConnectorCapability,
): void {
  if (!connector.manifest.capabilities.includes(capability)) {
    throw new Error(
      `Connector ${connector.manifest.id} does not declare ${capability}`,
    );
  }
}
