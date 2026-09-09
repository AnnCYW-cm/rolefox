export const AI_PROVIDER_CAPABILITIES = [
  "structured_generation",
  "embedding",
] as const;

export type AIProviderCapability =
  (typeof AI_PROVIDER_CAPABILITIES)[number];

export interface AIProviderManifest {
  id: string;
  name: string;
  version: string;
  capabilities: AIProviderCapability[];
  models: string[];
  supportsCustomBaseUrl: boolean;
}

export interface AITaskContext {
  workspaceId: string;
  taskId: string;
  taskType: "job_scoring" | "material_draft" | "reply_draft" | "embedding";
  schemaVersion: number;
}

export interface StructuredGenerationRequest {
  context: AITaskContext;
  input: string;
  outputSchema: Record<string, unknown>;
  model?: string;
  systemInstruction?: string;
  temperature?: number;
}

export interface StructuredGenerationResult {
  data: unknown;
  providerId: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface EmbeddingRequest {
  context: AITaskContext;
  inputs: string[];
  model?: string;
}

export interface EmbeddingResult {
  vectors: number[][];
  providerId: string;
  model: string;
}

export interface AIProvider {
  readonly manifest: AIProviderManifest;
  probe(): Promise<{ available: boolean; details?: string }>;
  generateStructured?(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult>;
  embed?(request: EmbeddingRequest): Promise<EmbeddingResult>;
}

export type StructuredGenerationProvider = AIProvider & {
  generateStructured(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult>;
};

export type EmbeddingProvider = AIProvider & {
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
};

export function assertAIProviderCapability(
  provider: AIProvider,
  capability: "structured_generation",
): asserts provider is StructuredGenerationProvider;
export function assertAIProviderCapability(
  provider: AIProvider,
  capability: "embedding",
): asserts provider is EmbeddingProvider;
export function assertAIProviderCapability(
  provider: AIProvider,
  capability: AIProviderCapability,
): void {
  if (!provider.manifest.capabilities.includes(capability)) {
    throw new Error(
      `AI provider ${provider.manifest.id} does not declare ${capability}`,
    );
  }

  const implementation =
    capability === "structured_generation"
      ? provider.generateStructured
      : provider.embed;

  if (typeof implementation !== "function") {
    throw new Error(
      `AI provider ${provider.manifest.id} declares ${capability} but does not implement it`,
    );
  }
}

export interface ValidatedStructuredGenerationResult<T>
  extends Omit<StructuredGenerationResult, "data"> {
  data: T;
}

export function validateStructuredGenerationResult<T>(
  result: StructuredGenerationResult,
  parse: (value: unknown) => T,
): ValidatedStructuredGenerationResult<T> {
  return {
    ...result,
    data: parse(result.data),
  };
}
