import { z } from 'zod';

/**
 * Project context (SPEC-10): repository markdown documents (`specs/`, `docs/`,
 * `insights/` directories) that agents and skills attach to a review run.
 * Wire fields are snake_case.
 */

export const ProjectDocType = z.enum(['specs', 'docs', 'insights']);
export type ProjectDocType = z.infer<typeof ProjectDocType>;

/** One discovered document. `tokens` is 0 for a document that cannot be read. */
export const ProjectDocument = z.object({
  path: z.string(),
  type: ProjectDocType,
  tokens: z.number().int(),
  used_by: z.number().int(),
});
export type ProjectDocument = z.infer<typeof ProjectDocument>;

export const ProjectDocumentList = z.object({
  /** The discovery pattern, shown in the page header and the empty state. */
  pattern: z.string(),
  /** False when the repository has no local clone yet. */
  cloned: z.boolean(),
  documents: z.array(ProjectDocument),
});
export type ProjectDocumentList = z.infer<typeof ProjectDocumentList>;

export const ContextDocStatus = z.enum(['read', 'missing', 'too_large', 'unreadable']);
export type ContextDocStatus = z.infer<typeof ContextDocStatus>;

export const ProjectDocumentContent = z.object({
  path: z.string(),
  status: ContextDocStatus,
  content: z.string().nullable(),
});
export type ProjectDocumentContent = z.infer<typeof ProjectDocumentContent>;

/** What a run did with one attached document (stored in the trace). */
export const ContextDocRecord = z.object({
  path: z.string(),
  status: ContextDocStatus,
  tokens: z.number().int(),
});
export type ContextDocRecord = z.infer<typeof ContextDocRecord>;

/** The whole ordered attachment list of one agent or skill for one repository. */
export const ContextAttachmentInput = z.object({
  repo_id: z.string().uuid(),
  paths: z.array(z.string().min(1).max(4096)),
});
export type ContextAttachmentInput = z.infer<typeof ContextAttachmentInput>;

export const AgentContext = z.object({
  paths: z.array(z.string()),
  /** Documents reached through the agent's enabled skills (read-only). */
  inherited: z.array(
    z.object({
      path: z.string(),
      skill_id: z.string(),
      skill_name: z.string(),
    }),
  ),
});
export type AgentContext = z.infer<typeof AgentContext>;

export const SkillContext = z.object({
  paths: z.array(z.string()),
});
export type SkillContext = z.infer<typeof SkillContext>;
