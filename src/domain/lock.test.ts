import { describe, expect, it } from 'vitest';
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  createLockHash,
  generateSalt,
  hashPin,
  isValidPin,
  parseLockHash,
  verifyPin,
} from './lock';

describe('lock', () => {
  it('isValidPin 只接受 4-6 位纯数字', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('0000')).toBe(true);

    expect(isValidPin('123')).toBe(false); // 短一位
    expect(isValidPin('1234567')).toBe(false); // 长一位
    expect(isValidPin('12a4')).toBe(false);
    expect(isValidPin('12 4')).toBe(false);
    expect(isValidPin('')).toBe(false);
    expect(isValidPin('１２３４')).toBe(false); // 全角数字不算
  });

  it('位数常量与校验逻辑一致', () => {
    expect(isValidPin('1'.repeat(PIN_MIN_LENGTH))).toBe(true);
    expect(isValidPin('1'.repeat(PIN_MAX_LENGTH))).toBe(true);
    expect(isValidPin('1'.repeat(PIN_MIN_LENGTH - 1))).toBe(false);
    expect(isValidPin('1'.repeat(PIN_MAX_LENGTH + 1))).toBe(false);
  });

  it('generateSalt 产出定长十六进制且每次不同', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });

  it('hashPin 对相同输入稳定，对不同盐分离', async () => {
    const salt = 'a'.repeat(32);
    const h1 = await hashPin('1234', salt);
    const h2 = await hashPin('1234', salt);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 → 32 字节 → 64 个 hex

    const h3 = await hashPin('1234', 'b'.repeat(32));
    expect(h3).not.toBe(h1);
  });

  it('createLockHash 产出 sha256$salt$hash 自描述格式', async () => {
    const stored = await createLockHash('1234');
    const parsed = parseLockHash(stored);
    expect(parsed).not.toBeNull();
    expect(parsed?.algo).toBe('sha256');
    expect(parsed?.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(parsed?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('createLockHash 不明文写入原始密码', async () => {
    const stored = await createLockHash('2468');
    expect(stored).not.toContain('2468');
  });

  it('parseLockHash 拒绝损坏或非法格式', () => {
    expect(parseLockHash(null)).toBeNull();
    expect(parseLockHash(undefined)).toBeNull();
    expect(parseLockHash('')).toBeNull();
    expect(parseLockHash('1234')).toBeNull();
    expect(parseLockHash('sha256$onlytwo')).toBeNull();
    expect(parseLockHash('sha256$$deadbeef')).toBeNull();
    expect(parseLockHash('sha256$zz$deadbeef')).toBeNull(); // 盐非十六进制
    expect(parseLockHash('sha256$deadbeef$nothex!')).toBeNull();
  });

  it('verifyPin 正确密码通过、错误密码拒绝', async () => {
    const stored = await createLockHash('1357');
    await expect(verifyPin('1357', stored)).resolves.toBe(true);
    await expect(verifyPin('1358', stored)).resolves.toBe(false);
    await expect(verifyPin('', stored)).resolves.toBe(false);
  });

  it('verifyPin 遇到格式错误一律拒绝，不向「放行」方向失败', async () => {
    await expect(verifyPin('1234', null)).resolves.toBe(false);
    await expect(verifyPin('1234', undefined)).resolves.toBe(false);
    await expect(verifyPin('1234', '')).resolves.toBe(false);
    await expect(verifyPin('1234', 'garbage')).resolves.toBe(false);
    await expect(verifyPin('1234', 'md5$deadbeef$deadbeef')).resolves.toBe(false); // 算法不认识
    await expect(verifyPin('abc', await createLockHash('1234'))).resolves.toBe(false);
  });

  it('相同密码 + 不同盐 → 存储串不同，但都能验证通过', async () => {
    const s1 = await createLockHash('9999');
    const s2 = await createLockHash('9999');
    expect(s1).not.toBe(s2);
    await expect(verifyPin('9999', s1)).resolves.toBe(true);
    await expect(verifyPin('9999', s2)).resolves.toBe(true);
  });
});
