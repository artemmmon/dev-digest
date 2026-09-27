import type { FindingRecord, PrFile, SmartDiff, SmartDiffRole } from "@devdigest/shared";

export interface RoleFiles {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Groups a PR's files by Smart Diff role, in the server's role order
 * (`smartDiff.groups`), with each group's files kept in GitHub's own `PrFile[]`
 * order (not the server's, which is unordered — see plan Risks). A path the
 * smart-diff response doesn't know about (e.g. `GET /pulls/:id` refreshed the
 * file list after the smart-diff fetch) falls back to "core" so it is never
 * dropped from the tab.
 */
export function buildRoleGroups(smartDiff: SmartDiff, files: PrFile[]): RoleFiles[] {
  const roleByPath = new Map<string, SmartDiffRole>();
  for (const group of smartDiff.groups) {
    for (const f of group.files) roleByPath.set(f.path, group.role);
  }
  const filesByRole = new Map<SmartDiffRole, PrFile[]>();
  for (const file of files) {
    const role = roleByPath.get(file.path) ?? "core";
    const list = filesByRole.get(role);
    if (list) list.push(file);
    else filesByRole.set(role, [file]);
  }
  return smartDiff.groups.map((g) => ({ role: g.role, files: filesByRole.get(g.role) ?? [] }));
}

/** How many of a group's files have at least one finding (a file count, not a finding count). */
export function countFilesWithFindings(groupFiles: PrFile[], findings: FindingRecord[]): number {
  const pathsWithFindings = new Set(findings.map((f) => f.file));
  return groupFiles.filter((f) => pathsWithFindings.has(f.path)).length;
}
