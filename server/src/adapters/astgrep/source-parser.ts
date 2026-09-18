import { extractCrons, extractEndpoints } from '../codeindex/extract.js';
import {
  langForFile,
  parseImports,
  parseInvocationHeads,
  parseReferences,
  parseSymbols,
} from './index.js';

/** The repo-intel SourceParser over ast-grep (symbols/refs/imports) + the regex extractors. */
export class AstGrepSourceParser {
  canParse(file: string): boolean {
    return langForFile(file) !== null;
  }
  parseSymbols = parseSymbols;
  parseReferences = parseReferences;
  parseImports = parseImports;
  parseInvocationHeads = parseInvocationHeads;
  extractEndpoints = extractEndpoints;
  extractCrons = extractCrons;
}
