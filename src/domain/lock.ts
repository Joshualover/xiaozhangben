/**
 * 本地密码锁 —— 纯函数与加密原语，不依赖 React 与数据库，便于单测。
 *
 * ⚠️ 安全边界（务必在产品文案中如实告知用户）：
 * 这是**界面遮挡**，不是数据加密。账单数据仍以明文存在 IndexedDB 中，
 * 任何人用开发者工具都能直接读到。它的作用是防止别人顺手打开看到账目，
 * 不能抵御有意的攻击者，**更不能当作密码来复用**。
 *
 * 即便如此，密码本身也不该明文落地 —— 因此这里存的是
 * 加盐 SHA-256 摘要（Web Crypto 原生实现，不引入任何依赖）。
 */

/** 允许的密码位数区间（含端点） */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

/** 摘要算法标识，写进存储串里，将来换算法时能识别出旧格式 */
const HASH_ALGO = 'sha256';
const SALT_BYTES = 16;

/**
 * 校验密码格式：只允许 PIN_MIN_LENGTH ~ PIN_MAX_LENGTH 位纯数字。
 * 用数字而非字母，是为了让移动端唤起数字键盘、桌面端也能盲输。
 */
export function isValidPin(pin: string): boolean {
  if (typeof pin !== 'string') return false;
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}

/** 生成随机盐（十六进制字符串） */
export function generateSalt(bytes = SALT_BYTES): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

/** 计算 SHA-256(salt:pin)，返回十六进制字符串 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

/**
 * 生成可存入 Settings.lockHash 的字符串。
 * 格式：`sha256$<salt>$<hash>` —— 自描述，盐随摘要一起存，
 * 这样不必给 Settings 增加额外字段。
 */
export async function createLockHash(pin: string, salt = generateSalt()): Promise<string> {
  const hash = await hashPin(pin, salt);
  return `${HASH_ALGO}$${salt}$${hash}`;
}

export interface ParsedLockHash {
  algo: string;
  salt: string;
  hash: string;
}

/** 解析存储串；格式不合法（含旧版本或被人为改坏）时返回 null */
export function parseLockHash(stored: string | null | undefined): ParsedLockHash | null {
  if (!stored || typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 3) return null;
  const [algo, salt, hash] = parts;
  if (!algo || !salt || !hash) return null;
  if (!/^[0-9a-f]+$/i.test(salt) || !/^[0-9a-f]+$/i.test(hash)) return null;
  return { algo, salt, hash };
}

/**
 * 校验密码是否匹配存储串。
 * 任何异常情况（未设置密码、格式损坏、密码本身不合法）一律返回 false，
 * 不做「出错就放行」的兜底 —— 锁的问题上，失败必须朝着「锁住」的方向失败。
 */
export async function verifyPin(
  pin: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const parsed = parseLockHash(stored);
  if (!parsed || !isValidPin(pin)) return false;
  if (parsed.algo !== HASH_ALGO) return false;
  const actual = await hashPin(pin, parsed.salt);
  return constantTimeEqual(actual, parsed.hash);
}

/**
 * 定长比较，避免按字符提前返回。
 * 本地场景下时序攻击并不现实，但成本几乎为零，没有理由不写对。
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}
