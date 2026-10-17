const MAX_SLUG = 40;

/**
 * Lowercase ASCII letters, digits and single hyphens, at most 40 characters (AC-21).
 * A name with no ASCII letter or digit yields `fallback` (AC-22).
 */
export function slugify(name: string, fallback: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return slug.length > 0 ? slug : fallback;
}

/**
 * Slugs for a list of names in order. A repeated slug gets `-2`, `-3`, … on the
 * later ones (AC-23); the base is shortened so the suffix still fits in 40 characters.
 */
export function uniqueSlugs(names: readonly string[], fallback: string): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base = slugify(name, fallback);
    let slug = base;
    for (let n = 2; used.has(slug); n++) {
      const suffix = `-${n}`;
      slug = `${base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, '')}${suffix}`;
    }
    used.add(slug);
    return slug;
  });
}

export const agentSlug = (name: string): string => slugify(name, 'agent');
export const skillSlugs = (names: readonly string[]): string[] => uniqueSlugs(names, 'skill');
