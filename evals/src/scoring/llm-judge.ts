/**
 * LLM Message Pattern judge, on the subscription. Binary PASS/FAIL per practice, PASS only with
 * a verbatim evidence quote. The judge defaults to a stronger family than the task to soften
 * single-model self-preference; the structural mitigations (blind + binary + verbatim) do the
 * rest, since on a shared subscription the families overlap.
 */

import { EVAL_JUDGE_MODEL } from "../config.js";
import { runContent } from "../runtime/dispatch.js";

const JUDGE_RUBRIC =
  "You are a strict, blind evaluator. Given an OUTPUT and a list of PRACTICES, judge each " +
  "practice independently.\n" +
  "Rules: (1) exactly PASS or FAIL per practice, no scales. (2) PASS only when a direct " +
  "verbatim quote from the OUTPUT is evidence the practice was met — a keyword is not " +
  "evidence. (3) Reply with ONLY minified JSON:\n" +
  '{"results":[{"practice":"<text>","passed":true,"evidence":"<verbatim quote>"}]}';

export interface Verdict {
  results: { practice: string; passed: boolean; evidence: string }[];
  passed: number;
  total: number;
  score: number;
}

function parseVerdict(text: string): Verdict["results"] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const obj = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(obj.results)) throw new Error("judge JSON missing results[]");
  return obj.results;
}

/**
 * Score the judge's reply against the practices that were ASKED. A practice the judge did not
 * return a verdict for has not been judged, so it counts as a FAIL: otherwise a reply that covers
 * one of three practices, all PASS, would score 1.0. A result is matched by its practice text, or
 * by position when the judge returned exactly as many results as there were practices; `passed`
 * counts only when it is the boolean `true` (the string "false" is not a pass).
 */
export function scoreVerdict(practices: string[], results: Verdict["results"]): Verdict {
  const sameCount = results.length === practices.length;
  const judged: Verdict["results"] = practices.map((practice, i) => {
    const r = results.find((x) => x?.practice === practice) ?? (sameCount ? results[i] : undefined);
    if (!r) return { practice, passed: false, evidence: "(not judged: the judge returned no verdict for this practice)" };
    return { practice, passed: r.passed === true, evidence: typeof r.evidence === "string" ? r.evidence : "" };
  });
  const total = judged.length || 1;
  const passed = judged.filter((r) => r.passed).length;
  return { results: judged, passed, total, score: passed / total };
}

/** Judge an output against a list of practices. Model defaults to the stronger judge family. */
export async function llmJudge(output: string, practices: string[], model = EVAL_JUDGE_MODEL): Promise<Verdict> {
  const listed = practices.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `${JUDGE_RUBRIC}\n\n## PRACTICES\n${listed}\n\n## OUTPUT\n${output}\n\nReturn the JSON now.`;
  const res = await runContent(prompt, { allowedTools: [], maxTurns: 1, model });
  return scoreVerdict(practices, parseVerdict(res.text));
}
