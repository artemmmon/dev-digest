// L02 demo — one function per scene, filmed by the `demo-film` skill's director.
//
//   node <screencast-demo-maker plugin>/skills/demo-film/scripts/director.mjs hw/L02/demo [--dry] [--scenes=s4,s5]
//
// Unlike L01 this video clicks mutating controls (Run Scan, Accept, Reject, Edit, Create skill):
// HW2 is about them. Every scene's pre-roll puts the data back, so a retake starts clean.
// Still never clicked: Run Review, Delete run, Delete this review run, and the confirm
// button of the skill Delete dialog. Reviews are triggered through the API, off camera.
//
// s3 → s4 must be filmed in one director run: the scan report only exists on the page that
// ran the scan. s5 reads <cache>/triage.json ({ accept: [id], reject: id, edit: id,
// editAppend }) so a human picks the weak rule; without it the lowest confidence is rejected.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export const order = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'];
export const browser = order;

const SKILL = 'repo-conventions';
const S6_LINE = 'When a rule and the diff disagree, quote the rule in the finding.';
const S7_LINE = 'Report each violation once, at the first line where it appears.';

export default function scenes(stage) {
  const { sleep, record, stop, cue, shot, web, config, dry } = stage;
  const { baseUrl, apiUrl, repoId, prUrl } = config.web;
  const repo = `${baseUrl}/repos/${repoId}`;
  const conventionsUrl = `${repo}/conventions`;
  const p = () => web.page;
  const still = name => { if (dry) shot(name); };

  // ---------- data helpers (off camera) ----------
  const api = async (method, path, body) => {
    const r = await fetch(`${apiUrl}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json().catch(() => null);
  };
  const sql = q => execFileSync('docker', ['exec', 'devdigest-postgres', 'psql', '-U', 'devdigest', '-d', 'devdigest', '-At', '-c', q]).toString().trim();
  const skill = async () => (await api('GET', '/skills')).find(s => s.name === SKILL) ?? null;
  const dropSkill = async () => { const s = await skill(); if (s) await api('DELETE', `/skills/${s.id}`); };
  const agentId = async name => (await api('GET', '/agents')).find(a => a.name === name).id;
  const prId = async number => (await api('GET', `/repos/${repoId}/pulls`)).find(x => x.number === number).id;
  const candidates = async () => (await api('GET', `/repos/${repoId}/conventions`)).candidates;
  const wipeConventions = async () => { sql(`DELETE FROM conventions WHERE repo_id='${repoId}'`); await dropSkill(); };

  const editMemo = stage.path('s5-edit.json');
  const allPending = async () => {
    if (fs.existsSync(editMemo)) {
      const { id, rule } = JSON.parse(fs.readFileSync(editMemo, 'utf8'));
      sql(`UPDATE conventions SET rule=$r$${rule}$r$ WHERE id='${id}'`);
      fs.rmSync(editMemo);
    }
    sql(`UPDATE conventions SET status='pending' WHERE repo_id='${repoId}'`);
    await dropSkill();
  };

  // The skill at v1, linked to General Reviewer — what s6 leaves behind.
  const ensureSkill = async ({ fresh = false } = {}) => {
    let s = await skill();
    if (s && (!fresh || s.version === 1)) return s;
    if (s) await api('DELETE', `/skills/${s.id}`);
    const ids = (await candidates()).filter(c => c.status === 'accepted').map(c => c.id);
    if (!ids.length) throw new Error('no accepted conventions — film s5 first');
    const draft = await api('POST', `/repos/${repoId}/conventions/skill-draft`, { convention_ids: ids });
    await api('POST', `/repos/${repoId}/conventions/skills`, {
      convention_ids: ids, name: draft.name, description: draft.description, body: draft.body,
      agent_id: await agentId('General Reviewer'),
    });
    return skill();
  };

  // A finished General Reviewer run on PR #1 that was made with the current skill version.
  const ensureReview = async s => {
    const memo = stage.path('s8-run.json');
    const pr = await prId(1);
    const runs = () => api('GET', `/pulls/${pr}/runs`);
    if (fs.existsSync(memo)) {
      const m = JSON.parse(fs.readFileSync(memo, 'utf8'));
      if (m.skillId === s.id && m.version === s.version && (await runs()).some(r => r.run_id === m.runId)) return;
    }
    const before = new Set((await runs()).map(r => r.run_id));
    console.log('  s8 pre-roll: running General Reviewer on PR #1 through the API…');
    await api('POST', `/pulls/${pr}/review`, { agentId: await agentId('General Reviewer') });
    for (let i = 0; i < 150; i++) {
      const fresh = (await runs()).find(r => !before.has(r.run_id) && r.agent_name === 'General Reviewer');
      if (fresh && fresh.status !== 'running' && fresh.status !== 'queued' && fresh.status !== 'pending') {
        if (fresh.status !== 'done') throw new Error(`s8: review ended as ${fresh.status}: ${fresh.error}`);
        fs.writeFileSync(memo, JSON.stringify({ skillId: s.id, version: s.version, runId: fresh.run_id }));
        return;
      }
      await sleep(2000);
    }
    throw new Error('s8: review did not finish in 5 minutes');
  };

  // ---------- page helpers ----------
  let seeded = false;
  // The shell falls back to the first repo (the seeded acme/payments-api) on pages without a
  // :repoId. Pin the filmed repo so it never shows up in the sidebar.
  const open = async (url, opts) => {
    await web.up();
    if (!seeded) { await p().context().addInitScript(id => { try { localStorage.setItem('dd-repo', id); } catch {} }, repoId); seeded = true; }
    await web.open(url, opts);
  };
  // Scroll only when the target is outside the comfortable part of the viewport, or clipped
  // by a scroll container (a modal body): the pointer must never press where the target is not.
  const hit = loc => loc.evaluate(e => {
    const r = e.getBoundingClientRect();
    const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!t && (e.contains(t) || t.contains(e) && t.tagName !== 'BODY' && t.tagName !== 'HTML' && t.tagName !== 'MAIN');
  });
  const bring = async (loc, pause = 750) => {
    const b = await loc.boundingBox();
    const h = await p().evaluate(() => innerHeight);
    if (!b || b.y < 110 || b.y + b.height > h - 60 || !await hit(loc)) { await web.scrollIntoCenter(loc); await sleep(pause); }
  };
  const tap = async (loc, ms) => { await bring(loc, 500); await web.clickOn(loc, ms); };
  const toTop = async () => { await p().evaluate(() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(700); };
  const glideLeft = async (loc, ms, dx = 40) => { const b = await loc.boundingBox(); await web.glide(b.x + dx, b.y + b.height / 2, ms); };
  const card = rule => p().getByRole('article', { name: rule, exact: true });
  const btn = (scope, name) => scope.getByRole('button', { name, exact: true });
  const dlg = () => p().getByRole('dialog');
  const traceBtn = n => p().getByRole('button', { name: 'Open run trace & logs' }).nth(n);
  const closeTrace = async () => { await tap(btn(dlg(), 'Close'), 600); await dlg().waitFor({ state: 'hidden' }).catch(() => {}); };
  const runScanOffCamera = async () => {
    await wipeConventions();
    await open(conventionsUrl);
    await p().getByRole('button', { name: 'Run Scan' }).click();
    await waitForScan();
  };
  // The model's structured output fails schema validation now and then; the retry happens
  // off camera, like the wait itself.
  const waitForScan = async (retries = 3) => {
    const report = p().getByRole('button', { name: /^Scan report/ });
    const failed = p().getByText('Scan failed');
    for (let i = 0; ; i++) {
      console.log('  waiting for the scan to finish (1–3 min)…');
      await Promise.race([report.waitFor({ timeout: 420000 }), failed.waitFor({ timeout: 420000 })]);
      if (!await failed.count()) break;
      const why = (await p().getByRole('alert').allInnerTexts()).join(' ').replace(/\s+/g, ' ').slice(0, 160);
      if (i >= retries) throw new Error(`the scan failed ${i + 1} times: ${why}`);
      console.log(`  scan failed (${why}) — retrying off camera`);
      await p().getByRole('button', { name: 'Run Scan' }).click();
      await p().getByText('Scanning the repository…').waitFor();
    }
    await sleep(800);
  };

  return {
    // ---- 1. intro: the empty Conventions page ----
    async s1() {
      await wipeConventions();
      await open(conventionsUrl);
      await web.glide(1100, 640, 300);
      await record('s1');
      await cue('s1-01', async ms => {
        await sleep(ms * 0.3);
        await web.glideTo(p().getByRole('heading', { name: /^Conventions in/ }), 1200);
        await sleep(ms * 0.3);
        await web.glideTo(p().getByText('No conventions extracted yet'), 1200);
      });
      await cue('s1-02', async () => {
        await sleep(500);
        await web.glideTo(p().getByRole('complementary').getByText('artemmmon/cs2-lineups'), 1300);
      });
      still('dry-s1');
      await stop();
    },

    // ---- 2. Settings → Feature Models → Conventions ----
    async s2() {
      await open(`${baseUrl}/settings/models`);
      const row = p().locator('label', { hasText: 'Conventions' }).locator('xpath=../..');
      await web.scrollIntoStart(p().locator('label', { hasText: 'Conformance' })); await sleep(700);
      await web.glide(1000, 300, 300);
      await record('s2');
      await cue('s2-01', async ms => {
        await sleep(900);
        await web.glideTo(row.locator('label'), 1100);
        await sleep(ms * 0.12);
        await tap(row.locator('span.mono').first(), 800);
        await p().getByPlaceholder('Search models…').waitFor();
        await sleep(700);
        await p().keyboard.type('deepseek', { delay: 110 });
        await sleep(900);
        still('dry-s2-open');
        const first = p().getByRole('button', { name: /^deepseek\/deepseek-v4-flash — / }).first();
        await web.glideTo(first, 900);
        await sleep(Math.max(600, ms * 0.2));
        await p().keyboard.press('Escape');   // close without choosing anything
        await sleep(500);
      });
      still('dry-s2');
      await stop();
    },

    // ---- 3. Run Scan ----
    async s3() {
      await wipeConventions();
      await open(conventionsUrl);
      await web.glide(900, 560, 300);
      await record('s3');
      const side = p().getByRole('complementary');
      await cue('s3-01', async ms => {
        await web.glideTo(side.getByText('SKILLS LAB'), 1100);
        await sleep(500);
        await web.glideTo(side.getByRole('link', { name: 'Conventions' }), 700);
        await sleep(ms * 0.2);
        await web.glideTo(p().getByRole('button', { name: 'Run Scan' }), 1200);
      });
      await cue('s3-02', async ms => {
        await tap(p().getByRole('button', { name: 'Run Scan' }), 300);
        await p().getByText('Scanning the repository…').waitFor();
        await sleep(ms * 0.35);
        await web.glideTo(p().getByText('Scanning the repository…'), 1300);
      });
      still('dry-s3');
      await cue('s3-03', async ms => { await sleep(ms * 0.3); const [x, y] = web.pos; await web.glide(x + 260, y + 170, 1800); });
      await cue('s3-04', async ms => { await sleep(ms * 0.35); const [x, y] = web.pos; await web.glide(x - 120, y + 190, 1800); });
      await stop();
      await waitForScan();   // off camera; s4 continues on this very page
    },

    // ---- 4. candidates, evidence link, scan report ----
    async s4() {
      const report = () => p().getByRole('button', { name: /^Scan report/ });
      if (!p() || !p().url().endsWith('/conventions') || !await report().count()) await runScanOffCamera();
      await toTop();
      const first = p().getByRole('article').first();
      await bring(first);
      await web.glide(1150, 300, 300);
      await record('s4');
      await cue('s4-01', async ms => {
        const step = ms / 6;
        await sleep(step * 0.6);
        await glideLeft(first, 800, 45);                                  // category chip
        await sleep(step * 0.5);
        await glideLeft(first.locator('p').first(), 800, 160);            // the rule
        await sleep(step * 0.5);
        await web.glideTo(first.getByRole('link').first(), 800);          // path:line
        await sleep(step * 0.5);
        await glideLeft(first.locator('pre'), 800, 220);                  // snippet
        await sleep(step * 0.5);
        await web.glideTo(first.getByText(/^\d+%$/), 800);                // confidence
      });
      still('dry-s4-card');
      await cue('s4-02', async ms => {
        await glideLeft(first.locator('pre'), 900, 260);
        await sleep(ms * 0.35);
        await web.wheel(330, 6);
      });
      // The evidence link opens GitHub in a new tab, on the exact lines of the scanned commit.
      const link = p().getByRole('article').nth(1).getByRole('link').first();
      await bring(link, 600);
      await cue('s4-03', async ms => {
        const t0 = Date.now();
        const [gh] = await Promise.all([p().context().waitForEvent('page', { timeout: 15000 }), tap(link, 800)]);
        await gh.waitForLoadState('domcontentloaded').catch(() => {});
        await gh.evaluate(() => { document.documentElement.style.zoom = '1.2'; }).catch(() => {});
        still('dry-s4-github');
        await sleep(Math.max(2500, ms - (Date.now() - t0) - 300));
        await gh.close();
        await p().bringToFront();
      });
      await toTop();
      await cue('s4-04', async ms => {
        await tap(report(), 800);
        await sleep(900);
        const dd = p().locator('dl').first();
        for (const term of ['Kept', 'Dropped', 'Model', 'Cost']) {
          await web.glideTo(dd.getByText(term, { exact: true }).first(), 800);
          await sleep(ms * 0.09);
        }
      });
      still('dry-s4-report');
      await stop();
    },

    // ---- 5. triage: accept, reject, inline edit, reload, ReScan ----
    async s5() {
      await allPending();
      const all = (await candidates()).filter(c => c.status === 'pending');
      if (all.length < 5) throw new Error(`s5 needs 5 pending candidates, has ${all.length}`);
      let plan = null;
      try { plan = JSON.parse(fs.readFileSync(stage.path('triage.json'), 'utf8')); } catch {}
      const known = id => all.find(c => c.id === id);
      if (!plan?.accept?.length || ![...plan.accept, plan.reject, plan.edit].every(known)) {
        console.log('  s5: no usable triage.json — rejecting the lowest confidence');
        const byConf = [...all].sort((a, b) => a.confidence - b.confidence);
        const rest = all.filter(c => c.id !== byConf[0].id);
        plan = { reject: byConf[0].id, accept: rest.slice(0, 3).map(c => c.id), edit: rest[3].id };
      }
      const append = plan.editAppend ?? ' Applies to new code; legacy files are migrated as they are touched.';
      const edited = known(plan.edit);
      fs.writeFileSync(editMemo, JSON.stringify({ id: edited.id, rule: edited.rule }));

      await open(conventionsUrl);
      await bring(card(known(plan.accept[0]).rule));
      await web.glide(1100, 640, 300);
      await record('s5');
      await cue('s5-01', async ms => {
        const t0 = Date.now();
        for (const id of plan.accept) {
          const c = card(known(id).rule);
          await bring(c, 600);
          await tap(btn(c, 'Accept'), 700);
          await sleep(650);
        }
        const weak = card(known(plan.reject).rule);
        await bring(weak, 600);
        await glideLeft(weak.locator('p').first(), 800, 200);
        await sleep(Math.max(900, ms * 0.82 - (Date.now() - t0)));
        still('dry-s5-reject');
        await tap(btn(weak, 'Reject'), 700);
      });
      await cue('s5-02', async () => {
        const c = card(edited.rule);
        await bring(c, 600);
        await tap(btn(c, 'Edit'), 700);
        const area = c.locator('textarea');
        await area.waitFor();
        await area.press('Meta+ArrowDown');
        await p().keyboard.type(append, { delay: 22 });
        await sleep(400);
        still('dry-s5-edit');
        await tap(btn(c, 'Save'), 600);
        const saved = p().getByRole('article').filter({ hasText: append.trim() });
        await btn(saved, 'Accept').waitFor();
        await sleep(500);
        await tap(btn(saved, 'Accept'), 600);
      });
      await sleep(400);
      // The reload itself eats 2–3 s of this line while ffmpeg is running, so the pauses are
      // short: the Accepted section has to be on screen for the second half of the sentence.
      await cue('s5-03', async () => {
        await open(conventionsUrl, { settle: 200 });
        await web.glideTo(p().getByText('Pending review'), 700);
        await sleep(500);
        const accepted = p().getByText('Accepted', { exact: true }).first();
        await web.scrollIntoStart(accepted);
        await sleep(1000);
        await web.glideTo(accepted, 700);
      });
      still('dry-s5-reloaded');
      await cue('s5-04', async ms => {
        await toTop();
        await web.glideTo(p().getByRole('button', { name: 'ReScan' }), 1200);   // hover only
        await sleep(ms * 0.4);
      });
      await stop();
    },

    // ---- 6. Create skill ----
    async s6() {
      await dropSkill();
      if (!(await candidates()).some(c => c.status === 'accepted')) throw new Error('s6 needs accepted conventions — film s5 first');
      await open(conventionsUrl);
      await web.glide(1000, 560, 300);
      const create = p().getByRole('button', { name: 'Create skill' });
      await record('s6');
      await cue('s6-01', async ms => {
        await sleep(600);
        await web.glideTo(create, 1200);
        await sleep(Math.max(300, ms * 0.35));
        await tap(create, 200);
      });
      const modal = dlg();
      const name = modal.getByRole('textbox', { name: 'Name' });
      await name.waitFor();
      await cue('s6-02', async ms => {
        await web.glideTo(modal.getByText(/^Created from \d+ accepted/), 1000);
        await sleep(ms * 0.3);
        await web.glideTo(name, 900);
        await sleep(ms * 0.2);
        await web.glideTo(modal.getByRole('textbox', { name: 'Description' }), 900);
      });
      still('dry-s6-modal');
      const body = modal.getByRole('group', { name: 'Body (Markdown)' }).locator('textarea');
      await cue('s6-03', async () => {
        await bring(body, 500);
        await web.glideTo(body, 900);
        await web.wheel(240, 8, 30);
        await body.press('Meta+ArrowDown');
        await p().keyboard.type(`\n\n${S6_LINE}`, { delay: 18 });
        await sleep(500);
        still('dry-s6-body');
        await tap(btn(modal, 'Preview'), 700);
        await sleep(400);
        if (await btn(modal, 'Preview').getAttribute('aria-pressed') !== 'true') throw new Error('s6: Preview did not open');
        await sleep(600);
        const type = modal.getByText('convention', { exact: true });
        await bring(type, 500);
        await web.glideTo(type, 800);
        await sleep(500);
        await web.glideTo(modal.getByText('extracted', { exact: true }), 600);
      });
      still('dry-s6-preview');
      const agent = modal.getByRole('group', { name: 'Link to an agent' }).locator('select');
      await cue('s6-04', async ms => {
        await bring(agent, 500);
        await web.glideTo(agent, 900);
        await sleep(400);
        await agent.selectOption({ label: 'General Reviewer' });   // no OS popup on camera
        await sleep(ms * 0.45);
        still('dry-s6-agent');
        await tap(btn(modal, 'Create skill'), 1000);
      });
      await p().getByText(`Skill “${SKILL}” created.`).first().waitFor({ timeout: 15000 });
      await sleep(1600);
      still('dry-s6-created');
      await stop();
    },

    // ---- 7. Skills Lab: card, preview drawer, versions, delete confirm ----
    async s7() {
      const s = await ensureSkill({ fresh: true });
      await open(`${baseUrl}/skills`);
      const item = () => p().getByRole('listitem').filter({ has: btn(p(), SKILL) });
      await bring(item());
      await web.glide(1200, 300, 300);
      await record('s7');
      await cue('s7-01', async ms => {
        await sleep(500);
        await web.glideTo(btn(item(), SKILL), 1000);
        await sleep(ms * 0.2);
        await web.glideTo(item().getByRole('switch'), 900);
        await sleep(ms * 0.12);
        await web.glideTo(item().getByText(/v1/).last(), 900);
      });
      still('dry-s7-card');
      await cue('s7-02', async ms => {
        await tap(btn(item(), SKILL), 600);
        await dlg().getByRole('heading', { name: 'Body' }).waitFor();
        await sleep(500);
        await web.glideTo(dlg().getByRole('heading', { name: 'Body' }), 700);
        await sleep(Math.max(300, ms * 0.25));
        still('dry-s7-drawer');
        const openLink = dlg().getByRole('link', { name: `Open skill ${SKILL}` });
        await bring(openLink, 500);
        await tap(openLink, 800);
      });
      await p().waitForURL(new RegExp(`/skills/${s.id}`));
      await p().getByRole('textbox', { name: 'Body (Markdown)' }).waitFor();
      await web.prep();
      await sleep(400);
      const save = btn(p(), 'Save');
      await cue('s7-03', async () => {
        await web.glideTo(btn(p(), 'Config'), 500);
        await web.glideTo(btn(p(), 'Versioning'), 900);
        await web.scrollIntoCenter(save);
        const area = p().getByRole('textbox', { name: 'Body (Markdown)' });
        await area.press('Meta+ArrowDown');
        await p().keyboard.type(`\n\n${S7_LINE}`, { delay: 22 });
        await sleep(300);
        still('dry-s7-edit');
        await tap(save, 800);
        await p().getByText('v2').first().waitFor({ timeout: 10000 });
        await toTop();
      });
      await tap(btn(p(), 'Versioning'), 600);
      await p().getByRole('heading', { name: 'Version history' }).waitFor();
      await sleep(500);
      still('dry-s7-versions');
      await cue('s7-04', async () => {
        await tap(p().getByRole('button', { name: 'Show changes of v1' }), 700);
        const changes = p().getByRole('list', { name: 'Show changes of v1' });
        await changes.waitFor();
        await web.scrollIntoCenter(changes.getByRole('listitem').last());   // the added line is the last one
        await sleep(1100);
        still('dry-s7-diff');
        const restore = p().getByRole('button', { name: 'Restore v1' });
        await web.scrollIntoCenter(restore); await sleep(450);
        await web.glideTo(restore, 600);   // hover only
      });
      await tap(p().getByRole('main').getByRole('link', { name: 'Skills' }), 600);
      await btn(item(), SKILL).waitFor();
      await bring(item(), 500);
      await cue('s7-05', async () => {
        await tap(p().getByRole('button', { name: `Delete skill ${SKILL}` }), 700);
        await btn(dlg(), 'Cancel').waitFor();
        await sleep(600);
        still('dry-s7-delete');
        await tap(btn(dlg(), 'Cancel'), 700);   // never the confirm button
      });
      await sleep(600);
      await stop();
    },

    // ---- 8. the generated skill inside a real review ----
    async s8() {
      const s = await ensureSkill();
      await ensureReview(s);
      await open(`${baseUrl}/agents/${await agentId('General Reviewer')}?tab=skills`);
      const rowSwitch = p().getByRole('switch', { name: `Use ${SKILL} in this agent` });
      await bring(rowSwitch);
      await web.glide(1000, 300, 300);
      await record('s8');
      await cue('s8-01', async ms => {
        await sleep(500);
        await web.glideTo(p().getByRole('listitem').filter({ hasText: SKILL }).getByText(SKILL), 1100);
        await sleep(ms * 0.2);
        await web.glideTo(rowSwitch, 900);
      });
      still('dry-s8-agent');
      await open(`${repo}/pulls/1?tab=findings`, { settle: 400 });
      await cue('s8-02', async () => {
        await web.glideTo(p().getByRole('button', { name: 'Run Review' }), 900);   // hover only — never click
        await sleep(500);
        await tap(traceBtn(0), 900);
        const assembly = btn(dlg(), 'Prompt assembly');
        await assembly.waitFor();
        await sleep(500);
        await web.scrollIntoCenter(assembly); await sleep(500);
        await tap(assembly, 600);
        const blocks = dlg().getByRole('list', { name: 'Skill blocks in the prompt' });
        await blocks.waitFor();
        await web.scrollIntoCenter(blocks); await sleep(600);
        await web.glideTo(blocks.getByRole('listitem').filter({ hasText: SKILL }), 800);
      });
      still('dry-s8-trace');
      await cue('s8-03', async () => { await sleep(600); await web.glideTo(dlg().getByText(/^Skills add \d+ tokens/), 1000); });
      await sleep(500);
      await stop();
    },

    // ---- 9. the four API Contract skills ----
    async s9() {
      await open(`${baseUrl}/skills`);
      const item = name => p().getByRole('listitem').filter({ has: btn(p(), name) });
      await bring(item('breaking-change'));
      await web.glide(1200, 640, 300);
      await record('s9');
      await cue('s9-01', async ms => {
        for (const n of ['breaking-change', 'response-schema', 'semver-discipline', 'deprecation-policy']) {
          await bring(btn(item(n), n), 450);
          await web.glideTo(btn(item(n), n), 750);
          await sleep(ms * 0.07);
        }
      });
      await bring(item('breaking-change'), 500);
      await cue('s9-02', async ms => {
        await tap(btn(item('breaking-change'), 'breaking-change'), 700);
        await dlg().getByRole('heading', { name: 'Body' }).waitFor();
        await web.glideTo(dlg().getByText(/^Apply when a diff changes an HTTP route/).first(), 800);
        await sleep(ms * 0.2);
        const examples = dlg().getByRole('heading', { name: 'Good and bad examples' });
        await web.scrollIntoStart(examples);
        await sleep(900);
        await web.glideTo(examples, 700);
        await web.wheel(160, 5);
      });
      still('dry-s9-drawer');
      await tap(btn(dlg(), 'Close'), 500);
      await bring(item('deprecation-policy'), 500);
      await cue('s9-03', async ms => {
        await sleep(ms * 0.3);
        await web.glideTo(btn(item('deprecation-policy'), 'deprecation-policy'), 900);
        await sleep(ms * 0.2);
        await web.glideTo(item('deprecation-policy').getByText('Imported file'), 800);
      });
      still('dry-s9-imported');
      await open(`${baseUrl}/agents/${await agentId('API Contract Reviewer')}?tab=skills`, { settle: 400 });
      const filter = p().getByPlaceholder('Filter skills…');
      await bring(filter, 500);
      await cue('s9-04', async ms => {
        await tap(filter, 700);
        await p().keyboard.type('semver', { delay: 90 });
        await sleep(1100);
        still('dry-s9-filter');
        await filter.fill('');
        await sleep(500);
        const grip = p().getByRole('button', { name: 'Move breaking-change' });
        await bring(grip, 400);
        await web.glideTo(grip, 800);
        await sleep(ms * 0.15);
        await glideLeft(p().getByRole('listitem').filter({ hasText: 'boundary-cases' }), 1000, 14);   // no grip there
      });
      still('dry-s9-grip');
      await sleep(500);
      await stop();
    },

    // ---- 10. the API Contract experiment on PR #6 ----
    async s10() {
      await open(`${repo}/pulls/6?tab=diff`);
      await web.glide(1250, 320, 300);
      await record('s10');
      await cue('s10-01', async ms => {
        await sleep(ms * 0.4);
        await web.glideTo(p().getByText('throwStyle').first(), 1000);
        await sleep(ms * 0.13);
        await web.glideTo(p().getByText(/'steps'/).last(), 900);
        await sleep(ms * 0.1);
        await web.glideTo(p().getByText(/expert/).first(), 900);
      });
      still('dry-s10-diff');
      await tap(p().getByRole('button', { name: /^Agent runs/ }), 600);
      await p().getByText('Timeline', { exact: false }).first().waitFor();
      await sleep(700);
      const tok = n => p().getByText(new RegExp(`${n} tok`)).first();
      await cue('s10-02', async ms => {
        await sleep(ms * 0.35);
        for (const n of ['1,958', '4,527', '4,050']) { await web.glideTo(tok(n), 800); await sleep(450); }
        for (const n of ['9,287', '11,568']) { await web.glideTo(tok(n), 700); await sleep(400); }
      });
      still('dry-s10-timeline');
      await cue('s10-03', async () => {
        await tap(traceBtn(5), 800);                     // 8:35 PM, no skills, 2 findings
        await btn(dlg(), 'log').waitFor();
        await sleep(400);
        await tap(btn(dlg(), 'log'), 600);
        const none = dlg().getByText(/skills: none attached/).first();
        await none.waitFor();
        await web.glideTo(none, 700);
        await sleep(1500);
        still('dry-s10-log');
        await tap(btn(dlg(), 'trace'), 600);
        await web.glideTo(dlg().getByRole('button', { name: /^Findings 2/ }), 800);
        await sleep(1200);
      });
      await closeTrace();
      await cue('s10-04', async ms => {
        await tap(traceBtn(4), 700);                     // 8:36 PM, four skills, 5 findings
        const assembly = btn(dlg(), 'Prompt assembly');
        await assembly.waitFor();
        await web.scrollIntoCenter(assembly); await sleep(500);
        await tap(assembly, 500);
        const blocks = dlg().getByRole('list', { name: 'Skill blocks in the prompt' });
        await blocks.waitFor();
        await web.scrollIntoCenter(blocks); await sleep(500);
        for (const li of await blocks.getByRole('listitem').all()) { await web.glideTo(li, 450); await sleep(150); }
        still('dry-s10-blocks');
        await sleep(Math.max(0, ms * 0.08));
        // Park the Findings header at the top so the first finding keeps its title in frame.
        await web.scrollIntoStart(dlg().getByRole('button', { name: /^Findings \d/ })); await sleep(800);
        await glideLeft(dlg().getByText('CRITICAL', { exact: true }).first(), 800, 190);
      });
      still('dry-s10-findings');
      await closeTrace();
      await cue('s10-05', async ms => {
        const rows = p().getByText(/\d finding\(s\)/);
        const n = Math.min(6, await rows.count());
        await sleep(ms * 0.1);
        for (let i = n - 1; i >= 0; i--) { await web.glideTo(rows.nth(i), 900); await sleep(ms * 0.07); }
      });
      await stop();
    },

    // ---- 11. control: Test Quality Reviewer on PR #1 ----
    async s11() {
      const pr = await prId(1);
      const runs = await api('GET', `/pulls/${pr}/runs`);
      const idx = id => { const i = runs.findIndex(r => r.run_id.startsWith(id)); if (i < 0) throw new Error(`s11: run ${id} is gone`); return i; };
      const withSkills = idx('ff52c401'), without = idx('d7c2b910');
      await open(`${repo}/pulls/1?tab=findings`);
      await bring(traceBtn(without));
      await web.glide(1200, 300, 300);
      await record('s11');
      await cue('s11-01', async ms => {
        await sleep(ms * 0.3);
        await web.glideTo(p().getByRole('button', { name: 'Test Quality Reviewer', exact: true }).nth(0), 1100);
        await sleep(ms * 0.15);
        await web.glideTo(traceBtn(withSkills), 1000);
      });
      await cue('s11-02', async ms => {
        await tap(traceBtn(withSkills), 300);
        const head = () => dlg().getByRole('button', { name: /^Findings \d/ });
        await head().waitFor();
        await web.glideTo(head(), 700);
        const [x, y] = web.pos; await web.glide(x + 120, y + 110, 1100);
        still('dry-s11-with');
        await sleep(Math.max(500, ms * 0.12));
        await closeTrace();
        await tap(traceBtn(without), 700);
        await head().waitFor();
        await web.glideTo(head(), 700);
        const [x2, y2] = web.pos; await web.glide(x2 + 120, y2 + 110, 1100);
        still('dry-s11-without');
      });
      await sleep(900);
      await stop();
    },

    // ---- 12. wrap-up: the pull request ----
    async s12() {
      await open(prUrl, { wait: 'domcontentloaded', settle: 2500 });
      // GitHub keeps a sticky PR header: park the heading below it, not at the very top.
      const park = name => p().getByRole('heading', { name }).first().evaluate(e => {
        const z = Number(getComputedStyle(document.documentElement).zoom) || 1;
        scrollTo({ top: scrollY + e.getBoundingClientRect().top / z - 130, behavior: 'smooth' });
      });
      await web.glide(760, 560, 300);
      await record('s12');
      await cue('s12-01', async ms => {
        await sleep(ms * 0.2);
        await park(/Extractor quality report/);
        await sleep(ms * 0.35);
        await web.wheel(70, 3, 60);
      });
      still('dry-s12-report');
      await cue('s12-02', async ms => {
        await park(/Self-review/);
        await sleep(ms * 0.4);
        await web.wheel(50, 3, 60);
      });
      still('dry-s12-selfreview');
      await sleep(800);
      await stop();
    },
  };
}
