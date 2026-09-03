import {
  APP_VARIANTS,
  DEFAULT_APP_VARIANT,
  isAppVariant,
  normaliseVariantName,
  resolveAppVariant,
  variantIdentity,
} from '../src/config/variants';

describe('application variants', () => {
  it('defaults to production when no variant is requested', () => {
    expect(DEFAULT_APP_VARIANT).toBe('production');
    expect(resolveAppVariant(undefined)).toBe('production');
    expect(resolveAppVariant(null)).toBe('production');
    expect(resolveAppVariant('')).toBe('production');
  });

  it('selects the test variant only when explicitly requested', () => {
    expect(resolveAppVariant('test')).toBe('test');
    expect(resolveAppVariant('  TEST ')).toBe('test');
  });

  it('refuses to guess at an unknown variant', () => {
    expect(() => resolveAppVariant('staging')).toThrow(/Unknown APP_VARIANT/);
    expect(() => resolveAppVariant('prod')).toThrow(/Unknown APP_VARIANT/);
  });

  it('normalises variant names consistently', () => {
    expect(normaliseVariantName(undefined)).toBe('production');
    expect(normaliseVariantName('  ')).toBe('production');
    expect(normaliseVariantName(' Test ')).toBe('test');
    expect(normaliseVariantName('Staging')).toBe('staging');
  });

  it('reserves the controlled Android identities', () => {
    expect(variantIdentity('production')).toMatchObject({
      name: 'Cooking Lab',
      androidPackage: 'com.cookinglab.personal',
    });
    expect(variantIdentity('test')).toMatchObject({
      name: 'Cooking Lab Test',
      androidPackage: 'com.cookinglab.personal.test',
    });
  });

  it('gives production and test separate Android sandboxes', () => {
    expect(APP_VARIANTS.production.androidPackage).not.toBe(
      APP_VARIANTS.test.androidPackage,
    );
  });

  it('enables the TEST indicator on the test variant only', () => {
    expect(APP_VARIANTS.test.showsTestIndicator).toBe(true);
    expect(APP_VARIANTS.production.showsTestIndicator).toBe(false);
  });

  it('narrows unknown values', () => {
    expect(isAppVariant('test')).toBe(true);
    expect(isAppVariant('production')).toBe(true);
    expect(isAppVariant('other')).toBe(false);
    expect(isAppVariant(undefined)).toBe(false);
  });
});
