// L03 demo (Smart Diff) — one function per scene, filmed by the `demo-film` skill's director.
//
//   node <screencast-demo-maker plugin>/skills/demo-film/scripts/director.mjs hw/L03/demo [--dry] [--scenes=s4,s5]
//
// Unlike the devdigest-demo default, this video clicks Run Review on camera (the user's call:
// HW3 asks to run the review and show the counters it produces). Only on the fixture PR #11.
// Still never clicked: Accept, Reject, Delete run, Delete this review run.
//
// s1–s3 start from a PR with no runs: their pre-roll deletes every run of PR #11 through the API.
// s3 → s4 must be filmed in one director run: s4 proves the tab refreshed itself on the very page
// that clicked Run Review. s4–s7 alone fall back to a fresh page load when a finished round exists.
export const order = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
export const browser = order;

const PR_ID = '959c2ba2-7d4d-41a7-9bec-9298c8cfa603';
const PR_NUMBER = 11;
const GROUPS = ['Core logic', 'Tests', 'Wiring', 'Docs', 'Boilerplate'];

export default function scenes(stage) {
  const { sleep, record, stop, cue, shot, web, config, dry } = stage;
  const { baseUrl, apiUrl, repoId } = config.web;
  const diffUrl = `${baseUrl}/repos/${repoId}/pulls/${PR_NUMBER}?tab=diff`;
  const p = () => web.page;
  const still = name => { if (dry) shot(name); };

  // ---------- data helpers (off camera) ----------
  const api = async (method, path) => {
    const r = await fetch(`${apiUrl}${path}`, { method });
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json().catch(() => null);
  };
  const runs = () => api('GET', `/pulls/${PR_ID}/runs`);
  const busy = r => ['running', 'queued', 'pending'].includes(r.status);
  const deleteRuns = async () => { for (const r of await runs()) await api('DELETE', `/runs/${r.run_id}`); };
  const waitForRound = async () => {
    for (let i = 0; i < 200; i++) {
      const all = await runs();
      if (all.length && !all.some(busy)) {
        const failed = all.filter(r => r.status !== 'done');
        if (failed.length) throw new Error(`review failed: ${failed.map(r => `${r.agent_name}: ${r.error}`).join('; ').slice(0, 400)}`);
        return;
      }
      if (i % 10 === 0) console.log('  waiting for the review round (1–2 min)…');
      await sleep(2000);
    }
    throw new Error('the review did not finish in ~7 minutes');
  };

  // ---------- page helpers ----------
  let seeded = false;
  // The shell falls back to the first repo (the seeded demo repo) on pages without a :repoId.
  const open = async (url, opts) => {
    await web.up();
    if (!seeded) { await p().context().addInitScript(id => { try { localStorage.setItem('dd-repo', id); } catch {} }, repoId); seeded = true; }
    await web.open(url, opts);
  };
  const openDiff = async () => {
    await open(diffUrl);
    await p().getByRole('group', { name: 'File order' }).waitFor();
    await sleep(500);
  };
  const group = name => p().getByRole('button', { name: new RegExp(`^${name} `) });
  const fileCard = path => p().getByRole('button', { name: new RegExp(`${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} `) });
  const counter = () => p().getByLabel(/files? with findings$/).first();
  const dot = () => p().getByRole('img', { name: 'This file has review findings' }).first();
  const lineLabel = () => p().getByText(/^(blocker|warning|suggestion|info)$/).first();
  const btn = name => p().getByRole('button', { name, exact: true });

  // Park an element at `frac` of the viewport height inside its scroll container (the diff tab
  // has a sticky header, so "start" hides things under it).
  const park = async (loc, frac = 0.3) => {
    await loc.evaluate((e, f) => {
      let s = e.parentElement;
      while (s && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
      const z = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const top = e.getBoundingClientRect().top / z;
      const h = innerHeight / z;
      const target = s ?? document.scrollingElement;
      target.scrollBy({ top: top - h * f, behavior: 'smooth' });
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
  const tap = async (loc, ms) => { await web.clickOn(loc, ms); };

  return {
    // ---- 1. five groups before any review ----
    async s1() {
      await deleteRuns();
      await openDiff();
      await web.glide(1200, 520, 300);
      await record('s1');
      await cue('s1-01', async ms => {
        await sleep(ms * 0.25);
        await web.glideTo(p().getByText(/^6 files · \+56 −0$/).first(), 1000);
        await sleep(ms * 0.2);
        await web.glideTo(p().getByText('Run a review to see findings inline in Files changed.'), 1000);
        await sleep(ms * 0.12);
        await web.glideTo(group('Core logic'), 900);
      });
      still('dry-s1-top');
      await cue('s1-02', async ms => {
        const step = ms / 6;
        for (const name of GROUPS) {
          const g = group(name);
          const b = await g.boundingBox();
          const h = await p().evaluate(() => innerHeight);
          if (!b || b.y > h * 0.75) await park(g, 0.45);
          await web.glideTo(g, 700);
          await sleep(Math.max(200, step - 1500));
        }
        await web.glideTo(group('Boilerplate').getByText('1 file'), 600);
      });
      still('dry-s1-groups');
      await cue('s1-03', async ms => {
        await web.glideTo(group('Docs'), 700);
        await sleep(ms * 0.3);
        await web.glideTo(group('Boilerplate'), 700);
      });
      await sleep(500);
      await stop();
    },

    // ---- 2. the lock file sits in Boilerplate ----
    async s2() {
      await deleteRuns();
      await openDiff();
      await park(group('Boilerplate'), 0.5);
      await web.glide(1200, 300, 300);
      await record('s2');
      await cue('s2-01', async ms => {
        await sleep(400);
        await tap(group('Boilerplate'), 900);
        const lock = fileCard('server/pnpm-lock.yaml');
        await lock.waitFor();
        await sleep(600);
        await web.glideTo(lock.getByText('server/pnpm-lock.yaml'), 900);
        await sleep(ms * 0.35);
        const [x, y] = web.pos; await web.glide(x + 260, y + 90, 1400);
      });
      still('dry-s2');
      await sleep(600);
      await stop();
    },

    // ---- 3. Run Review on camera ----
    async s3() {
      await deleteRuns();
      await openDiff();
      await toTop();
      await web.glide(1100, 560, 300);
      await record('s3');
      // Starting a run switches the page to Agent runs (onRunStart); Files changed is one tab
      // click away — a client-side switch, not a reload.
      await cue('s3-01', async () => {
        await tap(btn('Run Review'), 700);
        const all = btn('Run all enabled agents');
        await all.waitFor();
        await sleep(350);
        still('dry-s3-menu');
        await tap(all, 500);
        await sleep(1300);
        still('dry-s3-running');
        await tap(p().getByRole('button', { name: /^Files changed/ }), 700);
        await group('Core logic').waitFor();
        await sleep(300);
        await web.glideTo(group('Core logic'), 800);
      });
      still('dry-s3-groups');
      await cue('s3-02', async () => { await web.glideTo(group('Wiring'), 1000); });
      await sleep(400);
      await stop();
      await waitForRound();   // off camera; s4 continues on this very page
    },

    // ---- 4. counters on groups, dots on file cards ----
    async s4() {
      const live = p() && p().url().includes(`/pulls/${PR_NUMBER}`) && p().url().includes('tab=diff');
      if (!live) {
        console.log('  s4: not continuing from s3 — loading the page (the "no reload" claim is not proven by this take)');
        await waitForRound();
        await openDiff();
      }
      // The tab must refresh itself; give the settle refresh time, never reload here.
      await counter().waitFor({ timeout: 60000 });
      await toTop();
      await web.glide(1100, 600, 300);
      await record('s4');
      await cue('s4-01', async ms => {
        await sleep(ms * 0.45);
        await web.glideTo(counter(), 1200);
      });
      still('dry-s4-counter');
      await cue('s4-02', async ms => {
        await sleep(ms * 0.35);
        const d = dot();
        const b = await d.boundingBox();
        const h = await p().evaluate(() => innerHeight);
        if (!b || b.y > h * 0.8) await park(d, 0.5);
        await web.glideTo(d, 1100);
      });
      still('dry-s4-dot');
      await sleep(700);
      await stop();
    },

    // ---- 5. the finding under its line ----
    async s5() {
      if (!p() || !p().url().includes('tab=diff')) { await waitForRound(); await openDiff(); }
      await dot().waitFor({ timeout: 60000 });
      const header = p().getByRole('button').filter({ has: dot() }).first();
      if (await header.getAttribute('aria-expanded') === 'true') { await header.click(); await sleep(500); }
      await park(header, 0.5);
      await web.glide(1150, 640, 300);
      await record('s5');
      await cue('s5-01', async ms => {
        await sleep(300);
        await tap(header, 900);
        const label = lineLabel();
        await label.waitFor();
        await sleep(400);
        await park(label, 0.46);
        const lb = await label.boundingBox();
        const hb = await header.boundingBox();
        await web.glide(hb.x + 24, lb.y + lb.height / 2, 1000);   // the stripe and line number
        await sleep(ms * 0.25);
        await web.glideTo(label, 1000);
      });
      still('dry-s5-line');
      await cue('s5-02', async ms => {
        const step = ms / 7;
        const [, y] = web.pos;
        const hb = await header.boundingBox();
        await web.glide(hb.x + 200, y + 50, 900);              // severity + title
        still('dry-s5-title');
        await sleep(step);
        await web.glide(hb.x + 300, y + 150, 800);             // rationale
        still('dry-s5-rationale');
        await sleep(step);
        const fix = p().getByText('Suggested fix').first();
        if (await fix.count()) {
          const fb = await fix.boundingBox();
          const h = await p().evaluate(() => innerHeight);
          if (!fb || fb.y > h * 0.8) await web.wheel(Math.min(260, fb ? fb.y - h * 0.5 : 200), 6, 40);
          await web.glideTo(fix, 800);
          await sleep(step * 0.8);
        }
        const accept = btn('Accept').first();
        const ab = await accept.boundingBox();
        const h = await p().evaluate(() => innerHeight);
        if (!ab || ab.y > h * 0.85) { await park(accept, 0.7); }
        await web.glideTo(accept, 800);          // hover only — never click
        await sleep(step * 0.6);
        await web.glideTo(btn('Reject').first(), 600);   // hover only — never click
      });
      still('dry-s5-card');
      await cue('s5-03', async ms => {
        await sleep(ms * 0.3);
        const [x, y] = web.pos; await web.glide(x - 300, y - 120, 1400);
      });
      await sleep(400);
      await stop();
    },

    // ---- 6. Original order and back ----
    async s6() {
      if (!p() || !p().url().includes('tab=diff')) { await openDiff(); }
      await toTop();
      const smart = btn('Smart order'), original = btn('Original order');
      if (await original.getAttribute('aria-pressed') === 'true') { await smart.click(); await sleep(500); }
      await web.glide(1000, 560, 300);
      await record('s6');
      await cue('s6-01', async ms => {
        await tap(original, 800);
        await sleep(600);
        still('dry-s6-original');
        const [x, y] = web.pos; await web.glide(x - 250, y + 220, 1000);
        await sleep(Math.max(300, ms * 0.62 - 2400));
        await tap(smart, 900);
      });
      await sleep(900);
      still('dry-s6-smart');
      await stop();
    },

    // ---- 7. why grouping calls no model ----
    async s7() {
      if (!p() || !p().url().includes('tab=diff')) { await openDiff(); }
      await toTop();
      if (await btn('Original order').getAttribute('aria-pressed') === 'true') { await btn('Smart order').click(); await sleep(500); }
      await web.glide(1150, 480, 300);
      await record('s7');
      await cue('s7-01', async ms => {
        await sleep(ms * 0.15);
        await web.glideTo(p().getByText('Reviewer-ordered diff'), 1000);
        await sleep(ms * 0.2);
        await web.glideTo(group('Core logic'), 900);
        // glideTo does not scroll: park each header in view before the pointer goes there.
        for (const name of ['Tests', 'Wiring', 'Docs']) {
          await sleep(ms * 0.06);
          await park(group(name), 0.5);
          await web.glideTo(group(name), 700);
        }
      });
      still('dry-s7');
      await sleep(900);
      await stop();
    },
  };
}
