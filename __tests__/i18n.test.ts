import { afterEach, describe, expect, it } from '@jest/globals';
import {
  getActiveLanguage,
  getActivityLabel,
  getLocaleTag,
  getTranslations,
  setActiveLanguage,
  TRANSLATIONS,
} from '@/constants/i18n';

function collectLeafEntries(
  obj: Record<string, unknown>,
  prefix: string = ''
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = collectLeafEntries(value as Record<string, unknown>, path);
      nested.forEach((v, k) => result.set(k, v));
    } else {
      result.set(path, typeof value);
    }
  }
  return result;
}

describe('constants/i18n', () => {
  const initialLanguage = getActiveLanguage();

  afterEach(() => {
    setActiveLanguage(initialLanguage);
  });

  it('maintains 100% key and leaf-type parity between Indonesian and English dictionaries', () => {
    const idLeaves = collectLeafEntries(
      TRANSLATIONS.id as unknown as Record<string, unknown>
    );
    const enLeaves = collectLeafEntries(
      TRANSLATIONS.en as unknown as Record<string, unknown>
    );

    expect(Array.from(idLeaves.keys()).sort()).toEqual(
      Array.from(enLeaves.keys()).sort()
    );

    for (const [key, idType] of idLeaves.entries()) {
      expect(enLeaves.get(key)).toBe(idType);
    }

    // Verify new offline basemap badge key exists cleanly and dead template route keys were removed
    expect(typeof TRANSLATIONS.id.map.offlineBadge).toBe('string');
    expect(typeof TRANSLATIONS.en.map.offlineBadge).toBe('string');
    expect(
      (TRANSLATIONS.id.routes as Record<string, unknown>).infoKicker
    ).toBeUndefined();
  });

  it('switches active language, locale tag, and activity labels cleanly', () => {
    setActiveLanguage('en');
    expect(getActiveLanguage()).toBe('en');
    expect(getLocaleTag('en')).toBe('en-US');
    expect(getActivityLabel('run', getTranslations(), true)).toBe('RUN');

    setActiveLanguage('id');
    expect(getActiveLanguage()).toBe('id');
    expect(getLocaleTag('id')).toBe('id-ID');
    expect(getActivityLabel('walk', getTranslations(), false)).toBe(
      TRANSLATIONS.id.activityTypes.walk
    );
  });
});

