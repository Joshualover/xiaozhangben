import { useMemo, useState } from 'react';
import { parseAmountExpression } from '@/domain/money';

interface Props {
  value: string;
  onChange: (v: string) => void;
  symbol?: string;
  autoFocus?: boolean;
  error?: boolean;
  onSubmit?: () => void;
  placeholder?: string;
}

/**
 * 金额输入。
 * 支持简单算式（28+15），实时展示解析结果 —— 减少一次心算，录入更快。
 */
export function AmountInput({
  value,
  onChange,
  symbol = '¥',
  autoFocus,
  error,
  onSubmit,
  placeholder = '0.00',
}: Props) {
  const [touched, setTouched] = useState(false);

  const parsed = useMemo(() => parseAmountExpression(value), [value]);
  const showPreview = touched && /[+-]/.test(value) && parsed !== null;

  return (
    <div>
      <div className={`amount-input-wrap${error ? ' is-error' : ''}`}>
        <span className="amount-symbol">{symbol}</span>
        <input
          className="amount-input num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          aria-label="金额"
          onChange={(e) => onChange(e.target.value.replace(/[^\d.+\-]/g, ''))}
          onFocus={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onSubmit) onSubmit();
          }}
        />
      </div>
      <div className="amount-preview">
        {showPreview ? `= ${symbol}${(parsed / 100).toFixed(2)}` : ''}
      </div>
    </div>
  );
}
