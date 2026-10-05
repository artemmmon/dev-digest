import { z } from 'zod';
import { TourComplexity } from '@devdigest/shared';

/**
 * What the model returns: ONE flat object keyed by the five section kinds. Every key is
 * required (`nullable`, never `optional`) and nothing is length-bounded here — the server
 * trims to the limits, so a model that writes a long body or a ninth item never fails
 * validation (and the request is never repeated, SPEC-11 AC-16).
 */
export const TourDraft = z.object({
  architecture_overview: z.object({
    body: z.string(),
    diagram: z.string().nullable(),
  }),
  critical_paths: z.object({
    files: z.array(z.object({ path: z.string(), note: z.string() })),
  }),
  how_to_run: z.object({
    steps: z.array(z.object({ command: z.string(), source: z.string() })),
  }),
  guided_reading: z.object({
    reading: z.array(z.object({ path: z.string(), why: z.string() })),
  }),
  first_tasks: z.object({
    tasks: z.array(
      z.object({ title: z.string(), scope: z.string(), complexity: TourComplexity }),
    ),
  }),
});
export type TourDraft = z.infer<typeof TourDraft>;
