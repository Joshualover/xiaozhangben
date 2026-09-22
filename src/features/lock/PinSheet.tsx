import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLedger } from '@/store/useLedgerStore';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, isValidPin } from '@/domain/lock';
import { Sheet } from '@/components/UI';
import { PinDots, PinPad } from './PinPad';

export type PinSheetMode = 'enable' | 'change' | 'disable';

type Step = 'current' | 'new' | 'confirm';

const STEP_TITLE: Record<Step, string> = {
  current: '请输入当前密码',
  new: `设置新密码（${PIN_MIN_LENGTH}-${PIN_MAX_LENGTH} 位数字）`,
  confirm: '再输入一次确认',
};

const SHEET_TITLE: Record<PinSheetMode, string> = {
  enable: '开启密码锁',
  change: '修改密码',
  disable: '关闭密码锁',
};

const DONE_MESSAGE: Record<PinSheetMode, string> = {
  enable: '密码锁已开启',
  change: '密码已修改',
  disable: '密码锁已关闭',
};

/**
 * 密码设置向导，三种用途共用一个流程：
 * 开启（设新码 → 确认）、修改（当前码 → 新码 → 确认）、关闭（当前码）。
 */
export function PinSheet({
  open,
  mode,
  onClose,
}: {
  open: boolean;
  mode: PinSheetMode;
  onClose: () => void;
}) {
  const enableLock = useLedger((s) => s.enableLock);
  const disableLock = useLedger((s) => s.disableLock);
  const changeLockPin = useLedger((s) => s.changeLockPin);
  const pushToast = useLedger((s) => s.pushToast);

  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);

  const steps = useMemo<Step[]>(() => {
    if (mode === 'enable') return ['new', 'confirm'];
    if (mode === 'disable') return ['current'];
    return ['current', 'new', 'confirm'];
  }, [mode]);

  const step = steps[Math.min(stepIndex, steps.length - 1)];

  // 每次重新打开都从头来过，避免上次的残留状态串味
  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setInput('');
    setCurrentPin('');
    setNextPin('');
    setError('');
    setAttempts(0);
    setBusy(false);
  }, [open]);

  const fail = useCallback((message: string) => {
    setInput('');
    setError(message);
    setAttempts((n) => n + 1);
  }, []);

  const submit = useCallback(
    async (value: string) => {
      if (busy || !isValidPin(value)) return;

      if (step === 'current') {
        if (mode === 'disable') {
          setBusy(true);
          const ok = await disableLock(value);
          setBusy(false);
          if (!ok) return fail('当前密码不对');
          pushToast({ message: DONE_MESSAGE.disable, tone: 'success' });
          onClose();
          return;
        }
        setCurrentPin(value);
        setInput('');
        setError('');
        setStepIndex((i) => i + 1);
        return;
      }

      if (step === 'new') {
        setNextPin(value);
        setInput('');
        setError('');
        setStepIndex((i) => i + 1);
        return;
      }

      // confirm：两次不一致就退回重设，不保留半截状态
      if (value !== nextPin) {
        setNextPin('');
        setInput('');
        setAttempts((n) => n + 1);
        setError('两次输入不一致，请重新设置');
        setStepIndex(steps.indexOf('new'));
        return;
      }

      setBusy(true);
      try {
        if (mode === 'enable') {
          await enableLock(value);
        } else {
          const ok = await changeLockPin(currentPin, value);
          if (!ok) {
            setBusy(false);
            fail('当前密码不对');
            return;
          }
        }
        setBusy(false);
        pushToast({ message: DONE_MESSAGE[mode], tone: 'success' });
        onClose();
      } catch (e) {
        setBusy(false);
        fail(e instanceof Error ? e.message : '设置失败，请重试');
      }
    },
    [busy, step, mode, disableLock, currentPin, nextPin, steps, enableLock, changeLockPin, pushToast, onClose, fail],
  );

  // 输满上限自动提交，省掉一次点击
  useEffect(() => {
    if (input.length === PIN_MAX_LENGTH && !busy) void submit(input);
  }, [input, busy, submit]);

  const appendDigit = useCallback((d: string) => {
    setError('');
    setInput((prev) => (prev.length >= PIN_MAX_LENGTH ? prev : prev + d));
  }, []);

  const backspace = useCallback(() => {
    setError('');
    setInput((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setError('');
    setInput('');
  }, []);

  return (
    <Sheet
      open={open}
      title={SHEET_TITLE[mode]}
      onClose={onClose}
      labelledBy="pin-sheet-title"
      footer={
        <div className="pin-sheet-foot">
          <span className="field-hint">
            第 {Math.min(stepIndex + 1, steps.length)} / {steps.length} 步
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void submit(input)}
            disabled={busy || input.length < PIN_MIN_LENGTH}
          >
            下一步
          </button>
        </div>
      }
    >
      <div className="pin-sheet">
        <p className="pin-sheet-title">{STEP_TITLE[step]}</p>

        <PinDots
          key={attempts}
          length={input.length}
          tone={error ? 'danger' : 'default'}
          shake={attempts > 0}
        />

        <div className={`lock-msg${error ? ' is-error' : ''}`} role="alert">
          {busy ? '处理中…' : error}
        </div>

        <PinPad onDigit={appendDigit} onBackspace={backspace} onClear={clear} disabled={busy} />

        <p className="lock-note">
          只做界面遮挡，数据未加密存储。请勿使用银行卡、支付类等重要密码。
        </p>
      </div>
    </Sheet>
  );
}
