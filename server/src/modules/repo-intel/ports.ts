import type { CodeIndex, GitClient } from '@devdigest/shared';
import type { JobQueue } from '../_shared/ports.js';

/**
 * Ports of the repo-intel module (onion-architecture: core declares, outer ring
 * implements). The indexer and the facade reach parsing, the file system, the
 * import graph and token counting only through these; `platform/container.ts`
 * wires the ast-grep / fs / dependency-cruiser / tiktoken adapters behind them.
 */

// ---- token counting --------------------------------------------------------

export interface Tokenizer {
  count(text: string): number;
}

// ---- import graph ----------------------------------------------------------

export interface FileEdge {
  from: string;
  to: string;
}

export interface DepGraph {
  /**
   * Resolve the local import edges among `files` (repo-relative) under `root`.
   * Never throws — returns `[]` on any failure.
   */
  buildEdges(root: string, files: string[]): Promise<FileEdge[]>;
}

// ---- source parsing --------------------------------------------------------

export interface ExtractedSymbol {
  name: string;
  kind: string;
  line: number;
}

export interface ExtractedReference {
  toSymbol: string;
  line: number;
}

export interface ParsedSymbol extends ExtractedSymbol {
  /** True when the declaration is reached through an `export` form. */
  exported: boolean;
  /** Declaration head trimmed to MAX_SIGNATURE_CHARS; null for kinds without one. */
  signature: string | null;
  /** 1-based line of the closing token of the declaration body. */
  endLine: number;
}

export interface ParsedReference extends ExtractedReference {
  /** Path passed in by the caller — surfaced so consumers can fan-out. */
  refFile: string;
}

export interface ParsedImport {
  name: string;
  source: string;
  isType: boolean;
}

export interface ParsedInvocationHead {
  /** The bare identifier being invoked (callee name, ctor name, or JSX tag). */
  name: string;
  /** 1-based line of the invocation. */
  line: number;
  kind: 'call' | 'new' | 'jsx';
}

/** AST + regex extraction over one source file. Pure; never throws for a parseable language. */
export interface SourceParser {
  /** Whether the file's extension is a language this parser handles. */
  canParse(file: string): boolean;
  parseSymbols(file: string, source: string): ParsedSymbol[];
  parseReferences(file: string, source: string): ParsedReference[];
  parseImports(file: string, source: string): ParsedImport[];
  parseInvocationHeads(file: string, source: string): ParsedInvocationHead[];
  extractEndpoints(source: string): string[];
  extractCrons(source: string): string[];
}

// ---- file system -----------------------------------------------------------

export interface WalkStats {
  /** Files seen on disk with a SUPPORTED_EXT extension (before size + bound filters). */
  totalCandidates: number;
  /** Candidates dropped because their size exceeded MAX_FILE_SIZE. */
  skippedTooLarge: number;
  /** Candidates dropped because the file list exceeded MAX_INDEXED_FILES. */
  bounded: number;
}

export interface WalkResult {
  /** Paths relative to `root`, separator-normalized to forward slashes. */
  files: string[];
  stats: WalkStats;
}

/** Read access to a repo's clone directory. */
export interface RepoFiles {
  /** The files the parse phase should process, plus walk stats. */
  walk(root: string): Promise<WalkResult>;
  /** UTF-8 contents of `relPath` under `root`; rejects when unreadable. */
  read(root: string, relPath: string): Promise<string>;
}

// ---- collaborators ---------------------------------------------------------

/** What the indexing pipeline (full + incremental) needs. */
export interface IndexDeps {
  git: GitClient;
  parser: SourceParser;
  files: RepoFiles;
  depgraph: DepGraph;
  tokenizer: Tokenizer;
  /** How many files to parse at once. */
  parseConcurrency: number;
}

/** Everything RepoIntelService collaborates with (the repository is injected too). */
export interface RepoIntelDeps extends IndexDeps {
  jobs: JobQueue;
  codeIndex: CodeIndex;
  /** REPO_INTEL_ENABLED; off → every facade method degrades to an empty result. */
  enabled: boolean;
}
