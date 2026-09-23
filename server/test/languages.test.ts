/**
 * `@devdigest/shared` language table (`contracts/languages.ts`) — shared by the client
 * diff-viewer chip and the server repo-stack detector.
 */
import { describe, it, expect } from 'vitest';
import { languageOf, isGeneratedPath } from '@devdigest/shared';

describe('languageOf', () => {
  it('resolves by extension', () => {
    expect(languageOf('lib/main.dart')).toEqual({ label: 'dart', name: 'Dart', kind: 'code' });
    expect(languageOf('src/app.tsx')).toMatchObject({ label: 'tsx', kind: 'code' });
    expect(languageOf('README.md')).toMatchObject({ label: 'md', kind: 'doc' });
  });

  it('prefers an exact filename match over the extension', () => {
    expect(languageOf('pubspec.yaml')).toMatchObject({ label: 'pubspec', kind: 'config' });
    expect(languageOf('android/app/pubspec.yaml')).toMatchObject({ label: 'pubspec' });
    // A file that merely ends in .yaml but isn't `pubspec.yaml` falls back to the generic type.
    expect(languageOf('config/pubspec.yaml.bak')).toBeNull();
    expect(languageOf('config/other.yaml')).toMatchObject({ label: 'yaml', kind: 'config' });
  });

  it('returns null for an extensionless or unrecognised file', () => {
    expect(languageOf('LICENSE')).toBeNull();
    expect(languageOf('src/weird.zzz')).toBeNull();
  });
});

describe('isGeneratedPath', () => {
  it('flags Dart/Flutter build_runner and protobuf output', () => {
    expect(isGeneratedPath('lib/models/user.g.dart')).toBe(true);
    expect(isGeneratedPath('lib/models/user.freezed.dart')).toBe(true);
    expect(isGeneratedPath('lib/api/routes.pbenum.dart')).toBe(true);
    expect(isGeneratedPath('lib/models/user.dart')).toBe(false);
  });
});
