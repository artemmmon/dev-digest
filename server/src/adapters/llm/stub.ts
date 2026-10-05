import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { ConfigError, ExternalServiceError } from '../../platform/errors.js';

const STUB_TOKENS_IN = 1200;
const STUB_TOKENS_OUT = 640;
const STUB_COST_USD = 0.0042;

const FixtureFile = z.record(z.string(), z.unknown());

/**
 * Test-only LLMProvider: answers `completeStructured` from a JSON fixture
 * (`{ "<schemaName>": <response> }`) so the hermetic e2e run makes no network call.
 * Selected by `DEVDIGEST_LLM_STUB` (`AppConfig.llmStubPath`) — never reachable from a
 * request, and `loadConfig` refuses it in production. This adapter is the only place that
 * reads the file; the JSON is parsed with zod and each answer is validated against the
 * caller's schema, exactly like a real provider's output.
 */
export class StubLLMProvider implements LLMProvider {
  private constructor(
    readonly id: 'openai' | 'anthropic' | 'openrouter',
    private readonly fixtures: Record<string, unknown>,
  ) {}

  static fromFile(path: string, id: 'openai' | 'anthropic' | 'openrouter'): StubLLMProvider {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      throw new ConfigError('DEVDIGEST_LLM_STUB is not a readable JSON file');
    }
    const parsed = FixtureFile.safeParse(json);
    if (!parsed.success) {
      throw new ConfigError('DEVDIGEST_LLM_STUB must be a JSON object of schemaName → fixture');
    }
    return new StubLLMProvider(id, parsed.data);
  }

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new ExternalServiceError('The stub LLM provider only answers structured requests');
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (!Object.prototype.hasOwnProperty.call(this.fixtures, req.schemaName)) {
      throw new ExternalServiceError(`No stub fixture for schema '${req.schemaName}'`);
    }
    const raw = this.fixtures[req.schemaName];
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) {
      throw new ExternalServiceError(`Stub fixture for '${req.schemaName}' does not match the schema`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: STUB_TOKENS_IN,
      tokensOut: STUB_TOKENS_OUT,
      costUsd: STUB_COST_USD,
      raw: JSON.stringify(raw),
      attempts: 1,
    };
  }

  async embed(_texts: string[]): Promise<number[][]> {
    throw new ExternalServiceError('The stub LLM provider does not embed');
  }
}
