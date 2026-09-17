// L01 demo — one function per scene, filmed by the `demo-film` skill's director.
// Reference implementation: read this before writing scenes for another lesson.
//
//   node ~/.claude/skills/demo-film/scripts/director.mjs hw/L01/demo [--dry] [--scenes=s4,s5]
//
// Rules that keep the shot honest: never click a mutating control (config.neverClick),
// and start the narration while the action is still moving, so there is no dead air.

// FILMING order — file scenes first so Chrome starts once, before s1. The video plays
// in `config.order`, which is what assembly concatenates.
export const order = ['s2', 's3', 's4', 's5', 's1', 's6', 's7', 's8', 's9'];
export const browser = ['s1', 's6', 's7', 's8', 's9'];

export default function scenes(stage) {
  const { sleep, record, stop, cue, shot, code, term, web, config, dry } = stage;
  const { baseUrl, repoId, prUrl } = config.web;
  const pulls = `${baseUrl}/repos/${repoId}/pulls`;
  const p = () => web.page;

  // The PR list, with the row title as the anchor every browser scene starts from.
  const openList = async () => { await web.open(pulls); await p().mouse.click(700, 700); await sleep(800); };
  const prRow = () => p().locator('text=L01: run cost badge').first();

  return {
    // ---- files: the agent's working environment ----
    async s2() {
      code.open('CLAUDE.md', 1); await sleep(1500);
      await record('s2');
      await cue('s2-01', () => code.open('CLAUDE.md', 7));    // Stack
      await cue('s2-02', () => code.open('CLAUDE.md', 13));   // Packages
      await cue('s2-03', () => code.open('CLAUDE.md', 24));   // Commands
      await cue('s2-04', () => code.open('CLAUDE.md', 40));   // Naming
      await cue('s2-05', () => code.open('CLAUDE.md', 64));   // Do not touch
      await cue('s2-06', () => code.open('server/CLAUDE.md', 1));
      await stop();
    },

    async s3() {
      code.open('.claude/skills/engineering-insights/SKILL.md', 1); await sleep(1500);
      await record('s3');
      await cue('s3-01', async ms => { await sleep(ms * 0.5); code.open('.claude/skills/engineering-insights/SKILL.md', 28); });
      await cue('s3-02', () => code.open('client/INSIGHTS.md', 69));   // the margin-gap entry
      await cue('s3-03', async ms => { code.open('server/INSIGHTS.md', 1); await sleep(ms * 0.5); code.open('e2e/INSIGHTS.md', 1); });
      await stop();
    },

    async s4() {
      code.open('specs/01-run-cost-badge.md', 2); await sleep(1500);
      await record('s4');
      // `code.open` lands ~1.3 s after it is called, so a 2.6 s line has room for exactly one
      // jump and it has to be fired immediately: "Status: done" is already on screen.
      await cue('s4-01', () => code.open('specs/01-run-cost-badge.md', 62));
      await sleep(1400);
      await cue('s4-02', async ms => {
        code.open('server/docs/0001-latest-review-is-a-batch.md', 1);
        await sleep(ms * 0.4);
        code.open('server/docs/0001-latest-review-is-a-batch.md', 52);   // Alternatives rejected
        // Start the package tour under the tail of this line, so the gap before the next
        // one stays short: three jumps cannot fit inside 2.2 s of speech.
        await sleep(ms * 0.42);
        code.open('client/docs/overlay-ui-without-a-kit-primitive.md', 1);
      });
      // `code.open` blocks for its own ~1.5 s round-trip, so it is most of the pacing here.
      await sleep(300);
      code.open('reviewer-core/docs/usage-and-cost.md', 1); await sleep(500);
      await cue('s4-03', () => code.open('e2e/docs/authoring-a-flow.md', 1));
      await sleep(1800);
      await stop();
    },

    // ---- terminal: the three gates ----
    async s5() {
      // Pre-open the config behind the Terminal: when VS Code is raised mid-line it must
      // already show the right file, or the previous scene's file flashes first.
      code.open('client/eslint.config.mjs', 1); await sleep(1500);
      term.run(`cd ${config.projectRoot} && clear`); term.front(); await sleep(1500);
      await record('s5');
      term.run('cd client && pnpm typecheck && pnpm lint && pnpm test');
      // Hold on the terminal until the run has printed its green summary (~7 s), then raise
      // the editor for the part of the line that talks about the lint config.
      await cue('s5-01', async ms => { await sleep(ms * 0.55); code.open('client/eslint.config.mjs', 1); });
      await sleep(1200);
      await stop();
      term.run(`cd ${config.projectRoot} && clear`);
    },

    // ---- browser ----
    async s1() {
      await openList();
      await record('s1');
      await cue('s1-01', async ms => { await sleep(ms * 0.45); await web.glideTo(prRow(), 1200); });
      await stop();
    },

    async s6() {
      await openList(); await web.glide(900, 620, 300);
      await record('s6');
      await cue('s6-01', async () => { await sleep(600); await web.glideTo(p().getByText('$0.013').first(), 1300); });
      await cue('s6-02', async ms => {
        // Straight, slow approach: a diagonal dash closes the popover before it can be entered.
        await web.hoverInto(p().locator('span[style*="cursor: help"]').first(), { hold: ms * 0.5 });
        await web.wheel(240, 8);
      });
      if (dry) shot('dry-s6');
      await stop();
      await web.glide(900, 700, 400);
    },

    async s7() {
      // Navigation happens before recording: the first line describes what the Agent runs
      // tab contains, so the tab has to be open when it starts, and five seconds of silent
      // clicking at the head of the scene is worse than a cut.
      await openList();
      await web.clickOn(prRow(), 700);
      await p().waitForURL(/pulls\/1/); await sleep(500);
      await web.clickOn(p().getByRole('button', { name: /^Agent runs/ }), 600);
      await p().getByText('Timeline', { exact: false }).first().waitFor();
      await sleep(900);
      await record('s7');
      await cue('s7-01', async () => {
        await sleep(600);
        await web.glideTo(p().getByText('Timeline', { exact: false }).first(), 900);
      });
      const genTl = p().getByRole('button', { name: 'General Reviewer', exact: true }).first();
      await cue('s7-02', async ms => {
        await web.scrollIntoCenter(genTl); await sleep(900);
        await web.glideTo(p().getByText('$0.0053').first(), 1100); await sleep(ms * 0.3);
        const b = await genTl.boundingBox();
        await web.glide(b.x + 190, b.y + b.height + 14, 1000);   // the severity icons under the agent name
      });
      const perf = p().getByRole('button', { name: /^Performance Reviewer approve 0 findings 100 16\/09\/2026, 17:00/ });
      const gen = p().getByRole('button', { name: /^General Reviewer request changes/ });
      await cue('s7-03', async () => {
        await web.scrollIntoCenter(perf); await sleep(1400);
        let b = await perf.boundingBox();                        // collapse the default-open card
        await web.glide(b.x + 260, b.y + 22, 800); await p().mouse.down(); await p().mouse.up();
        await sleep(900);
        b = await gen.boundingBox();
        await web.glide(b.x + 260, b.y + 22, 800); await sleep(200); await p().mouse.down(); await p().mouse.up();
        await sleep(900);
        await web.scrollIntoCenter(p().getByRole('group', { name: 'Filter findings by severity' })); await sleep(1300);
        for (const n of ['1 Critical', '2 Warning', '1 Suggestion']) {
          await web.glideTo(p().getByRole('button', { name: n }), 800); await sleep(700);
        }
      });
      // The filter is the claim of this scene, so assert it actually applied rather than
      // trusting the click: `aria-pressed` is the pill's own state.
      const crit = () => p().getByRole('button', { name: '1 Critical' });
      const pressed = async v => await crit().getAttribute('aria-pressed') === v;
      if (!await web.clickUntil(crit(), () => pressed('true'), 700)) throw new Error('s7: CRITICAL filter did not apply');
      await cue('s7-04', async () => { await sleep(1500); await web.glideTo(p().getByText('Server-side cost tracking implementation').first(), 1000); });
      if (dry) shot('dry-s7-filtered');
      if (!await web.clickUntil(crit(), () => pressed('false'), 800)) throw new Error('s7: CRITICAL filter did not clear');
      await cue('s7-05', async () => { await sleep(2500); await web.scrollBy('main', 260); });
      await cue('s7-06', async () => {
        const acc = p().getByRole('button', { name: 'Accept' }).first();
        await web.scrollIntoCenter(acc); await sleep(1200);
        await web.glideTo(acc, 1000); await sleep(1200);
        await web.glideTo(p().getByRole('button', { name: 'Reject' }).first(), 700);   // hover only — never click
      });
      if (dry) shot('dry-s7-accept');
      await stop();
    },

    async s8() {
      await web.open(`${baseUrl}/repos/${repoId}/pulls/1?tab=findings`);
      const trace = p().getByRole('button', { name: 'Open run trace & logs' }).nth(2);
      await web.scrollIntoCenter(trace); await sleep(1000);
      await record('s8');
      await web.clickOn(trace, 800); await sleep(600);
      await cue('s8-01', async ms => {
        const dlg = p().getByRole('dialog');
        await web.glideTo(dlg.getByText('COST', { exact: true }), 1100); await sleep(ms * 0.35);
        await web.scrollIntoStart(dlg.getByText('Findings', { exact: true }).first());
        await sleep(1500);
        const [x, y] = web.pos; await web.glide(x - 80, y + 120, 900);
      });
      if (dry) shot('dry-s8');
      await sleep(1200);
      await stop();
    },

    async s9() {
      await web.open(prUrl, { wait: 'domcontentloaded', settle: 2000 });
      await record('s9');
      await cue('s9-01', async ms => { await sleep(1500); await web.wheel(Math.max(0, ms / 45 - 40) * 4, 4); });
      await cue('s9-02', async () => {
        await p().evaluate(() => scrollTo({ top: 0, behavior: 'smooth' })); await sleep(900);
        await web.clickOn(p().getByRole('link', { name: /Commits/ }).first(), 900);
        await p().waitForLoadState('domcontentloaded'); await sleep(800);
        await web.prep();
        await web.wheel(300, 5);
      });
      await sleep(800);
      await stop();
    },
  };
}
