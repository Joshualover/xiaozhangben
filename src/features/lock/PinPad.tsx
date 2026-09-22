import { Delete } from 'lucide-react';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/domain/lock';

/**
 * 密码圆点。槽位数从最小值起步、随输入增长到上限，
 * 既不会一开始就暴露上限，也不会在输到第 5 位时突然换行。
 */
export function PinDots({
  length,
  tone = 'default',
  shake = false,
}: {
  length: number;
  tone?: 'default' | 'danger';
  shake?: boolean;
}) {
  const slots = Math.max(PIN_MIN_LENGTH, Math.min(length, PIN_MAX_LENGTH));
  return (
    <div
      className={`pin-dots is-${tone}${shake ? ' is-shake' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`已输入 ${length} 位密码`}
    >
      {Array.from({ length: slots }, (_, i) => (
        <span key={i} className={`pin-dot${i < length ? ' is-filled' : ''}`} aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * 数字键盘。移动端是主要输入方式，桌面端同时支持物理键盘，
 * 两条路径都由父组件统一收口到同一组回调。
 */
export function PinPad({
  onDigit,
  onBackspace,
  onClear,
  disabled = false,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="pinpad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button
          key={d}
          type="button"
          className="pinpad-key"
          onClick={() => onDigit(d)}
          disabled={disabled}
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        className="pinpad-key is-aux"
        onClick={onClear}
        disabled={disabled}
        aria-label="清空已输入"
      >
        清空
      </button>
      <button
        type="button"
        className="pinpad-key"
        onClick={() => onDigit('0')}
        disabled={disabled}
      >
        0
      </button>
      <button
        type="button"
        className="pinpad-key is-aux"
        onClick={onBackspace}
        disabled={disabled}
        aria-label="退格"
      >
        <Delete size={19} />
      </button>
    </div>
  );
}
