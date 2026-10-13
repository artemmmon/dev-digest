import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// One prompt, shared by `architecture-reviewer` and `architecture-reviewer-lite`. The two evals
// import this module, so the fixture, the prompt, the practices, the threshold and maxTurns are
// the same objects for both; the only thing that differs between the runs is the injected agent
// definition. The diff is inlined because its paths do not exist in the checkout: the prompt
// says so, so the agent reviews the text instead of asking for a base or running git.
const reviewPrompt = (fixture: string) => `mode: diff

The change to review is the unified diff below. It is not a commit in this checkout and its files
are not on disk, so there is no base to compare against and git cannot show it. Read the change
from this message. Return the JSON report your instructions describe.

${fx(fixture)}`;

export const cases: AgentCase[] = [
  {
    name: "finds both violations in the checkout diff, rates them and cites a documented rule",
    kind: "quality",
    prompt: reviewPrompt("checkout-service.diff"),
    practices: [
      // Detection
      "reports a finding for `import type { FastifyReply } from \"fastify\"` in server/src/modules/checkout/domain/checkout.ts: a web-framework type imported into the domain layer",
      "reports a finding for `new PgCheckoutRepository()` in server/src/modules/checkout/service.ts: a concrete repository constructed inside the service instead of being injected from the DI container / composition root",
      // Severity
      "gives the FastifyReply-in-domain finding the severity CRITICAL (a Fastify import in application code is an `onion-layer-violation`, which severity.md lists as CRITICAL)",
      "gives the `new PgCheckoutRepository()` finding a severity of CRITICAL or WARNING, not SUGGESTION",
      // Documented rule
      "the FastifyReply finding has a non-empty `rule` that names a documented rule: `onion-layer-violation`, or the onion-architecture checklist item 'no DB/Fastify/SDK/adapters import in application code'",
      "the `new PgCheckoutRepository()` finding has a non-empty `rule` that names a documented rule: `onion-layer-violation`, or an onion-architecture checklist item about the service taking ports / the composition root assembling it",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  // Recall of a documented placement rule: the service takes a port and imports nothing outer, so
  // there is no layering violation, but the discount arithmetic sits inline in the service. The
  // onion-architecture "Where does X go?" table puts a business rule / calculation in `domain.ts`
  // or a pure helper beside the service, and severity.md rates placement inside a ring WARNING.
  // The diff is also awkward code (boolean flags, magic numbers) that no documented rule covers;
  // reporting that as such would be an opinion, not a finding.
  {
    name: "finds the calculation placed in the service instead of the domain, with its documented rule",
    kind: "quality",
    prompt: reviewPrompt("discounts-service.diff"),
    practices: [
      "reports a finding for the discount arithmetic written inline in `DiscountService.applyDiscount` in server/src/modules/discounts/service.ts, instead of in `domain.ts` or a pure helper beside the service",
      "that finding's `rule` names the documented onion-architecture placement rule: the 'Where does X go?' row for a business rule / calculation (`domain.ts` or a pure helper beside the service)",
      "that finding has the severity WARNING, not CRITICAL (placement inside a ring is WARNING in severity.md)",
      "does not raise a separate finding about the boolean flag parameters or the magic numbers as such: they are code style, not a violation of a documented rule",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
