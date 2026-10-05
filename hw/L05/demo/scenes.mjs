// L05 demo (HW5 PR Brief) — one function per scene, filmed by the `demo-film` skill's director.
//
//   node <screencast-demo-maker plugin>/skills/demo-film/scripts/director.mjs hw/L05/demo [--dry] [--scenes=s3,s4]
//
// s1 clicks "Generate brief" for real: one paid deepseek-v4-flash call per take (the user's decision, 2026-10-05).
// Its pre-roll deletes the stored brief of the test PR so the empty state is back; every other scene needs the
// brief that s1 left behind, so film s1 first. A --dry run neither deletes nor clicks.
// Never clicked: Run Review, Accept, Reject, Delete run, Resync index, Re-derive intent.
// s5 opens GitHub and needs `config.web.prUrl` + `config.web.prBranch` (the HW5 pull request).
import { execFileSync } from 'node:child_process';

export const order = ['s1', 's2', 's3', 's4', 's6', 's5'];
export const browser = ['s1', 's2', 's3', 's4', 's5', 's6'];

const TEST_PR = { id: '959c2ba2-7d4d-41a7-9bec-9298c8cfa603', number: 11 };
// A PR with no stored brief: the dry run of s1 reads the empty state here instead of deleting anything.
const EMPTY_PR = { number: 12 };
const FOCUS_FILE = /run-duration\.ts:\d+/;
const DOCS = ['specs/12-pr-brief.md', 'docs/plans/08-pr-brief.md', 'docs/plans/08-pr-brief.verification.md'];

export default function scenes(stage) {
  const { sleep, record, stop, cue, shot, web, config, dry } = stage;
  const { baseUrl, apiUrl, repoId, prUrl, prBranch } = config.web;
  const p = () => web.page;
  const still = name => { if (dry) shot(name); };
  const pageUrl = n => `${baseUrl}/repos/${repoId}/pulls/${n}`;

  // ---------- data (off camera) ----------
  const readBrief = async () => (await (await fetch(`${apiUrl}/pulls/${TEST_PR.id}/brief`)).json()).brief;
  const dropBrief = () => execFileSync('docker', ['exec', 'devdigest-postgres', 'psql', '-U', 'devdigest', '-d', 'devdigest',
    '-c', `delete from pr_brief where pr_id = '${TEST_PR.id}'`], { stdio: 'ignore' });
  // What the narration needs from the brief: at least one risk and a Review focus item in the PR's diff.
  const assertBrief = async () => {
    const b = await readBrief();
    if (!b) throw new Error('PR #11 has no stored brief: film s1 first');
    if (!b.risks.length || !b.review_focus.length) {
      throw new Error(`the brief no longer matches the narration: ${b.risks.length} risks, ${b.review_focus.length} focus items; re-take s1`);
    }
    return b;
  };

  // ---------- page helpers ----------
  // The shell remembers the last repo in localStorage and falls back to the seeded one: set it before every scene.
  const open = async url => {
    await web.up();
    await p().goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await p().evaluate(id => { try { localStorage.setItem('dd-repo', id); } catch {} }, repoId);
    await web.open(url);
  };
  const btn = name => p().getByRole('button', { name, exact: true });
  const label = () => p().getByText('PR Brief', { exact: true }).first();
  const generate = () => btn('Generate brief');
  const notice = () => p().getByText(/^Generated without/);
  const footer = () => p().getByText(/deepseek-v4-flash/).first();
  const risks = () => p().getByRole('region', { name: 'Risk areas' });
  const focus = () => p().getByRole('region', { name: /^Review focus/ });
  const focusItem = () => focus().getByRole('button', { name: FOCUS_FILE }).or(focus().getByRole('button').first()).first();

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
  const openBrief = async () => {
    await assertBrief();
    await open(pageUrl(TEST_PR.number));
    await focus().waitFor();
    await toTop();
  };

  return {
    // ---- 1. empty state → Generate brief (real call) ----
    async s1() {
      if (!dry) dropBrief();
      await open(pageUrl(dry ? EMPTY_PR.number : TEST_PR.number));
      await generate().waitFor();
      await toTop();
      await web.glide(1100, 620, 300);
      still('dry-s1-empty');
      await record('s1');
      await cue('s1-01', async ms => {
        await sleep(ms * 0.3);
        await web.glideTo(btn(/^Overview/).or(p().getByRole('button', { name: /^Overview/ })).first(), 900);
        await sleep(ms * 0.15);
        await web.glideTo(p().getByText('No brief yet'), 900);
        await sleep(ms * 0.1);
        await web.glideTo(generate(), 900);
      });
      await cue('s1-02', async () => {
        await sleep(500);
        if (dry) return;                      // a dry run never spends a model call
        await web.clickOn(generate(), 500);
      });
      await cue('s1-03', async ms => {
        await sleep(ms * 0.3);
        const [x, y] = web.pos; await web.glide(x - 420, y, 1200);   // over the skeleton
      });
      if (!dry) await focus().waitFor({ timeout: 120000 });           // the brief has arrived
      still('dry-s1-end');
      await sleep(1500);
      await stop();
      if (!dry) await assertBrief();
    },

    // ---- 2. the finished brief ----
    async s2() {
      await openBrief();
      await web.glide(1100, 620, 300);
      still('dry-s2-top');
      await record('s2');
      await cue('s2-01', async ms => {
        await sleep(ms * 0.1);
        await web.glideTo(label(), 900);
        await sleep(ms * 0.3);
        await web.glideTo(p().getByText('PR SCORE'), 1200);
      });
      await cue('s2-02', async ms => {
        await sleep(ms * 0.1);
        await web.glideTo(notice(), 900);
        await sleep(ms * 0.3);
        await web.glideTo(footer(), 900);
      });
      await cue('s2-03', async ms => {
        await park(p().getByText('Intent', { exact: true }).first(), 0.3);
        await web.glideTo(p().getByText('Intent', { exact: true }).first(), 900);
        await sleep(ms * 0.25);
        await web.glideTo(p().getByText('No indexed symbols in the changed files.'), 1200);
      });
      still('dry-s2-cards');
      await cue('s2-04', async ms => {
        await park(risks(), 0.25);
        await web.glideTo(risks().getByRole('button').first(), 1000);
        await sleep(ms * 0.3);
        await web.glideTo(focusItem(), 1100);
      });
      still('dry-s2-lists');
      await sleep(600);
      await stop();
    },

    // ---- 3. a Review focus item opens Files changed ----
    async s3() {
      await openBrief();
      await park(focus(), 0.35);
      await web.glide(1000, 300, 300);
      await record('s3');
      await cue('s3-01', async ms => {
        await sleep(ms * 0.12);
        await web.clickOn(focusItem(), 900);
        await p().waitForURL(/tab=diff/, { timeout: 10000 });
        await web.prep();
        if (dry) { await sleep(700); shot('dry-s3-diff'); }
        await sleep(ms * 0.25);
        await web.glideTo(p().getByRole('button', { name: /run-duration\.ts/ }).first(), 1000).catch(() => {});
      });
      await sleep(800);
      await stop();
    },

    // ---- 4. reload: the stored brief, no new generation ----
    async s4() {
      const before = await assertBrief();
      await openBrief();
      await web.glide(1100, 620, 300);
      await record('s4');
      await cue('s4-01', async ms => {
        await sleep(ms * 0.12);
        await p().reload({ waitUntil: 'domcontentloaded' });
        await web.prep();
        await focus().waitFor();
        if (dry) shot('dry-s4-reloaded');
        await sleep(ms * 0.2);
        await web.glideTo(label(), 900);
        await sleep(ms * 0.2);
        await web.glideTo(footer(), 1100);
      });
      await sleep(600);
      await stop();
      const after = await readBrief();
      if (after?.generated_at !== before.generated_at) throw new Error('the brief was regenerated during s4: the narration is wrong');
    },

    // ---- 5. spec, plan and the verification report in the HW5 pull request (GitHub) ----
    async s5() {
      if (!prUrl || !prBranch) throw new Error('s5 needs config.web.prUrl and config.web.prBranch (the HW5 pull request)');
      const blob = f => `${prUrl.replace(/\/pull\/\d+.*$/, '')}/blob/${prBranch}/${f}`;
      await web.up();
      await web.open(blob(DOCS[0]));
      await web.glide(1000, 400, 300);
      still('dry-s5-spec');
      await record('s5');
      await cue('s5-01', async ms => {
        await sleep(ms * 0.45);
        await web.wheel(900, 60, ms * 0.4);
      });
      await cue('s5-02', async ms => {
        await web.open(blob(DOCS[1]));
        if (dry) shot('dry-s5-plan');
        await sleep(ms * 0.2);
        await web.wheel(900, 60, ms * 0.45);
      });
      await cue('s5-03', async ms => {
        await web.open(blob(DOCS[2]));
        if (dry) shot('dry-s5-verification');
        await sleep(ms * 0.3);
        await web.wheel(500, 50, ms * 0.4);
      });
      await sleep(800);
      await stop();
    },

    // ---- 6. why facts and not the diff ----
    async s6() {
      await openBrief();
      await web.glide(1100, 620, 300);
      await record('s6');
      await cue('s6-01', async ms => {
        await sleep(ms * 0.15);
        await web.glideTo(footer(), 1100);                 // tokens and cost of the request
        await sleep(ms * 0.25);
        await park(focus(), 0.4);
        await web.glideTo(focusItem(), 1100);              // file and line the server checked
      });
      await sleep(800);
      await stop();
    },
  };
}
