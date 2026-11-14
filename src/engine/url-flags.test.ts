import { describe, expect, it } from 'vitest';
import { hashFlags } from './url-flags';

describe('hashFlags', () => {
  it('reads single and combined flags', () => {
    expect([...hashFlags('#test')]).toEqual(['test']);
    expect(hashFlags('#test&dev').has('dev')).toBe(true);
    expect(hashFlags('#DEV').has('dev')).toBe(true);
  });

  it('is empty without a hash', () => {
    expect(hashFlags('').size).toBe(0);
    expect(hashFlags('#').size).toBe(0);
  });
});
