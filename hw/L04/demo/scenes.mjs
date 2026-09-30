// L04 demo (HW4 Blast Radius) — one function per scene, filmed by the `demo-film` skill's director.
//
//   node <screencast-demo-maker plugin>/skills/demo-film/scripts/director.mjs hw/L04/demo [--dry] [--scenes=s4,s5]
//
// Filming order differs from playback: s7 (Terminal, real Claude Code) is filmed first so the Terminal is
// minimised before Chrome starts; playback order is `config.order` (s1…s8).
// Never clicked: Run Review, Accept, Reject, Delete run, Resync index (hovered only in s6).
// Two repositories appear: artemmmon/dev-digest (s1–s5, s8) and artemmmon/cs2-lineups (s6, the real `partial` index).
export const order = ['s7', 's1', 's2', 's3', 's4', 's5', 's6', 's8'];
export const browser = ['s1', 's2', 's3', 's4', 's5', 's6', 's8'];

const FIXTURE_PR = { id: '8f6ba605-f003-47f3-b858-957b67e5acdb', number: 15 };
const DOCS_PR = { number: 3 };
const CS2 = { repoId: '12e3f5b1-6c8d-45a9-9fca-1801eb6c2b32', number: 5 };
// What the narration says about PR #15; checked against the API before every scene that quotes it.
const EXPECTED = { symbols: 2, callers: 12, endpoints: 19, crons: 0 };
const CLAUDE_CMD =
  'claude -p "Show the blast radius of PR 15 in artemmmon/dev-digest: use the devdigest get_blast_radius tool and summarize the counts." ' +
  '--mcp-config .mcp.json --strict-mcp-config --allowedTools mcp__devdigest__get_blast_radius --max-turns 4';

export default function scenes(stage) {
  const { sleep, record, stop, cue, shot, term, web, config, dry } = stage;
  const { baseUrl, apiUrl, repoId } = config.web;
  const p = () => web.page;
  const still = name => { if (dry) shot(name); };
  const prUrl = (repo, n) => `${baseUrl}/repos/${repo}/pulls/${n}`;

  // ---------- data guard (off camera) ----------
  const assertNumbers = async () => {
    await fetch(`${apiUrl}/pulls/${FIXTURE_PR.id}`);   // fills pr_files, refreshes head_sha
    const r = await fetch(`${apiUrl}/pulls/${FIXTURE_PR.id}/blast`);
    const b = await r.json();
    const c = b.counts;
    const same = c.symbols === EXPECTED.symbols && c.callers === EXPECTED.callers &&
      c.endpoints === EXPECTED.endpoints && c.crons === EXPECTED.crons;
    if (!same || b.index.degraded) {
      throw new Error(`PR #15 no longer matches the narration: ${JSON.stringify(c)} degraded=${b.index.degraded}; fix cues.json or re-index`);
    }
    return b;
  };

  // ---------- page helpers ----------
  // The shell falls back to the seeded demo repo on pages without a :repoId, and remembers the last repo in
  // localStorage: set it before every scene so acme/payments-api never shows.
  const open = async (repo, n) => {
    await web.up();
    await p().goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await p().evaluate(id => { try { localStorage.setItem('dd-repo', id); } catch {} }, repo);
    await web.open(prUrl(repo, n));
  };
  const card = () => p().getByText('Blast radius', { exact: true }).first();
  const stats = () => p().getByText(/^\d+ callers$/).first();
  const callerLinks = () => p().getByRole('link', { name: /routes\.ts:\d+$/ });
  const endpoints = () => p().getByRole('group', { name: 'Endpoints affected' });
  const btn = name => p().getByRole('button', { name, exact: true });

  // Park an element at `frac` of the viewport height inside its scroll container.
  const park = async (loc, frac = 0.3) => {
    await loc.evaluate((e, f) => {
      let s = e.parentElement;
      while (s && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
      const z = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const top = e.getBoundingClientRect().top / z;
      const h = innerHeight / z;
      (s ?? document.scrollingElement).scrollBy({ top: top - h * f, behavior: 'smooth' });
    }, frac);
    await sleep(800);
  };
  const toTop = async () => {
    await p().evaluate(() => {
      for (const el of [document.scrollingElement, ...document.querySelectorAll('main, main *')]) {
        if (el && el.scrollTop > 0) el.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    await sleep(800);
  };

  return {
    // ---- 1. the block and its summary ----
    async s1() {
      await assertNumbers();
      await open(repoId, FIXTURE_PR.number);
      await card().waitFor();
      await stats().waitFor();
      await toTop();
      await web.glide(1100, 560, 300);
      still('dry-s1-top');
      await record('s1');
      await cue('s1-01', async ms => {
        await sleep(ms * 0.3);
        await web.glideTo(p().getByRole('tab', { name: /^Overview/ }).or(p().getByText('Overview', { exact: true })).first(), 900);
        await sleep(ms * 0.15);
        await web.glideTo(card(), 1100);
      });
      await cue('s1-02', async ms => {
        await sleep(ms * 0.2);
        await web.glideTo(stats(), 1200);
        await sleep(ms * 0.2);
        const [x, y] = web.pos; await web.glide(x + 330, y, 1500);   // across the row: endpoints, cron/jobs
      });
      still('dry-s1-summary');
      await sleep(600);
      await stop();
    },

    // ---- 2. callers and endpoint chips ----
    async s2() {
      await assertNumbers();
      await open(repoId, FIXTURE_PR.number);
      await callerLinks().first().waitFor();
      await toTop();
      await web.glide(1000, 500, 300);
      await record('s2');
      await cue('s2-01', async ms => {
        await sleep(ms * 0.1);
        const n = await callerLinks().count();
        const picks = [0, 3, 6, n - 1];
        for (const i of picks) {
          const l = callerLinks().nth(i);
          const b = await l.boundingBox();
          const h = await p().evaluate(() => innerHeight);
          if (!b || b.y > h * 0.78) await park(l, 0.55);
          await web.glideTo(l, 900);
          await sleep(ms * 0.1);
        }
      });
      still('dry-s2-callers');
      await cue('s2-02', async ms => {
        await park(endpoints(), 0.4);
        await web.glideTo(endpoints().getByText('DELETE /agents/:id'), 1000);
        await sleep(ms * 0.2);
        const [x, y] = web.pos; await web.glide(x + 380, y + 90, 1600);
      });
      still('dry-s2-chips');
      await sleep(600);
      await stop();
    },

    // ---- 3. a click opens the line on GitHub ----
    async s3() {
      await assertNumbers();
      await open(repoId, FIXTURE_PR.number);
      const link = p().getByRole('link', { name: /pulls\/routes\.ts:\d+$/ });
      await link.waitFor();
      await toTop();
      await park(link, 0.4);
      await web.glide(1000, 300, 300);
      await record('s3');
      let gh;
      await cue('s3-01', async ms => {
        await sleep(300);
        [gh] = await Promise.all([
          p().context().waitForEvent('page'),
          web.clickOn(link, 900),
        ]);
        await gh.waitForLoadState('domcontentloaded');
        await gh.evaluate(z => { document.documentElement.style.zoom = String(z); }, config.video?.zoom ?? 1.25).catch(() => {});
        await sleep(400);
        if (dry) shot('dry-s3-github');
        await sleep(Math.max(0, ms - 2600));
      });
      await cue('s3-02', async ms => { await sleep(ms); });
      await sleep(400);
      await stop();
      await gh?.close();
      await p().bringToFront();
    },

    // ---- 4. graph and back ----
    async s4() {
      await assertNumbers();
      await open(repoId, FIXTURE_PR.number);
      await btn('graph').waitFor();
      await toTop();
      await web.glide(1000, 500, 300);
      await record('s4');
      await cue('s4-01', async ms => {
        await sleep(ms * 0.1);
        await web.clickOn(btn('graph'), 800);
        await p().getByRole('img', { name: /graph/i }).first().waitFor({ timeout: 5000 }).catch(() => {});
        if (dry) shot('dry-s4-graph');
        // the graph is tall (19 endpoints): scroll so the whole SVG shows, then back up to the switcher
        await park(p().getByRole('img', { name: /graph/i }).first(), 0.42);
        if (dry) shot('dry-s4-graph-parked');
        await sleep(ms * 0.2);
        await toTop();
        await web.clickOn(btn('tree'), 800);
      });
      await sleep(700);
      await stop();
    },

    // ---- 5. no callers ----
    async s5() {
      await open(repoId, DOCS_PR.number);
      await p().getByText(/no downstream callers found/).waitFor();
      await toTop();
      await web.glide(1000, 560, 300);
      await record('s5');
      await cue('s5-01', async ms => {
        await sleep(ms * 0.25);
        await web.glideTo(card(), 1000);
        await sleep(ms * 0.1);
        await web.glideTo(p().getByText(/no downstream callers found/), 1200);
      });
      still('dry-s5');
      await sleep(600);
      await stop();
    },

    // ---- 6. incomplete index (cs2-lineups, real partial) ----
    async s6() {
      await open(CS2.repoId, CS2.number);
      const notice = p().getByText('Blast radius may be incomplete');
      await notice.waitFor();
      await toTop();
      await web.glide(1000, 560, 300);
      await record('s6');
      await cue('s6-01', async ms => {
        await sleep(ms * 0.15);
        await web.glideTo(notice, 1100);
        await sleep(ms * 0.3);
        await web.glideTo(p().getByText(/The index is partial/), 1200);
      });
      still('dry-s6-notice');
      await cue('s6-02', async ms => {
        await sleep(ms * 0.15);
        await web.glideTo(btn('Resync index'), 900);   // hover only — never click
      });
      still('dry-s6-resync');
      await sleep(600);
      await stop();
    },

    // ---- 7. the same map in Claude Code ----
    async s7() {
      await assertNumbers();
      term.show(); term.front();
      await sleep(800);
      term.run('clear');
      await sleep(1200);
      await record('s7');
      await cue('s7-01', async ms => {
        await sleep(600);
        term.run(dry ? "echo dry-run: claude skipped" : CLAUDE_CMD);
        await sleep(ms - 600);
      });
      // the answer takes ~10 s; the line describes it while it arrives
      await cue('s7-02', async ms => { await sleep(ms); });
      await cue('s7-03', async ms => { await sleep(ms); });
      await sleep(2500);
      await stop();
    },

    // ---- 8. why: no model, no re-parse ----
    async s8() {
      await assertNumbers();
      await open(repoId, FIXTURE_PR.number);
      await card().waitFor();
      await stats().waitFor();
      await toTop();
      await web.glide(1000, 560, 300);
      await record('s8');
      await cue('s8-01', async ms => {
        await sleep(ms * 0.15);
        await web.glideTo(card(), 1000);
        await sleep(ms * 0.25);
        await web.glideTo(stats(), 1200);
      });
      await sleep(800);
      await stop();
    },
  };
}
