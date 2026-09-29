/**
 * Prints what the five tool definitions and the server instructions cost a client at
 * startup: serialized characters and an estimate of tokens (chars / 4). Run with
 * `pnpm measure:tools`; the numbers go into docs/devdigest-mcp.md.
 */
import { listTools } from '../src/test-support/list-tools.js';

const tokens = (chars: number): number => Math.ceil(chars / 4);

const { tools, instructions } = await listTools();

const rows = tools.map((t) => {
  const total = JSON.stringify(t).length;
  return {
    tool: t.name,
    chars: total,
    tokens: tokens(total),
    description: (t.description ?? '').length,
    input_schema: JSON.stringify(t.inputSchema).length,
    output_schema: t.outputSchema ? JSON.stringify(t.outputSchema).length : 0,
  };
});
const sum = (k: 'chars' | 'tokens') => rows.reduce((n, r) => n + r[k], 0);

const pad = (v: string | number, w: number) => String(v).padStart(w);
const line = (name: string, cols: (string | number)[]) =>
  `${name.padEnd(18)}${cols.map((c, i) => pad(c, i === 0 ? 8 : 10)).join('')}`;

console.log(line('tool', ['chars', '~tokens', 'desc', 'input', 'output']));
for (const r of rows) console.log(line(r.tool, [r.chars, r.tokens, r.description, r.input_schema, r.output_schema]));
console.log(line('tools total', [sum('chars'), sum('tokens')]));
console.log(line('instructions', [instructions.length, tokens(instructions.length)]));
console.log(line('startup total', [sum('chars') + instructions.length, tokens(sum('chars') + instructions.length)]));
