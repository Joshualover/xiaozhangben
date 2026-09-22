import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { useLedger } from '@/store/useLedgerStore';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, isValidPin } from '@/domain/lock';
import { Dialog } from '@/components/UI';
import { PinDots, PinPad } from './PinPad';

/**
 * 全屏解锁页。启用密码锁后，应用在渲染任何账目之前先经过这里。
 *
 * 关于「为什么这里没有找回密码」：密码以加盐摘要保存在本机，
 * 没有服务器、没有邮箱，机制上就没有找回的可能。因此留了一条
 * 代价明确的出路（清空本机数据），而不是给一个做不到的承诺。
 */
export function LockScreen() {
  const unlock = useLedger((s) => s.unlock);
  const factoryReset = useLedger((s) => s.factoryReset);

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const [helpOpen, setHelpOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetting, setResetting] = useState(false);

  // 物理键盘回调挂一次就够，靠 ref 读当前输入，避免每次按键都重绑监听
  const pinRef = useRef(pin);
  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  const submit = useCallback(
    async (value: string) => {
      if (busy || !isValidPin(value)) return;
      setBusy(true);
      const ok = await unlock(value);
      setBusy(false);
      if (ok) return;

      const next = attempts + 1;
      setPin('');
      setAttempts(next);
      setError(
        next >= 3
          ? '密码不对。密码只存在本机，无法找回，请仔细回忆。'
          : '密码不对，再试一次。',
      );
    },
    [attempts, busy, unlock],
  );

  const appendDigit = useCallback((d: string) => {
    setError('');
    setPin((prev) => (prev.length >= PIN_MAX_LENGTH ? prev : prev + d));
  }, []);

  const backspace = useCallback(() => {
    setError('');
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setError('');
    setPin('');
  }, []);

  // 输满上限自动提交；4-5 位密码则靠「解锁」按钮或回车
  useEffect(() => {
    if (pin.length === PIN_MAX_LENGTH && !busy) void submit(pin);
  }, [pin, busy, submit]);

  // 物理键盘：桌面端不必去点屏幕键盘
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (helpOpen) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void submit(pinRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [appendDigit, backspace, submit, helpOpen]);

  const closeHelp = () => {
    setHelpOpen(false);
    setResetText('');
  };

  const doReset = async () => {
    setResetting(true);
    await factoryReset();
    setResetting(false);
  };

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="lock-brand">
          <span className="lock-brand-mark" aria-hidden="true">
            <Lock size={18} />
          </span>
          <span className="lock-brand-name">小账本</span>
        </div>

        <div className="lock-head">
          <h1 className="lock-title">输入密码</h1>
          <p className="lock-sub">
            请输入 {PIN_MIN_LENGTH}-{PIN_MAX_LENGTH} 位数字密码
          </p>
        </div>

        <PinDots
          key={attempts}
          length={pin.length}
          tone={error ? 'danger' : 'default'}
          shake={attempts > 0}
        />

        <div className={`lock-msg${error ? ' is-error' : ''}`} role="alert">
          {busy ? '正在校验…' : error}
        </div>

        <PinPad onDigit={appendDigit} onBackspace={backspace} onClear={clear} disabled={busy} />

        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => void submit(pin)}
          disabled={busy || pin.length < PIN_MIN_LENGTH}
        >
          解锁
        </button>

        <button type="button" className="lock-help" onClick={() => setHelpOpen(true)}>
          忘记密码？
        </button>

        <p className="lock-note">
          <ShieldAlert size={13} aria-hidden="true" />
          仅界面遮挡：账单数据未加密存储在本机，请勿使用重要密码。
        </p>
      </div>

      <Dialog
        open={helpOpen}
        title="忘记密码"
        onClose={closeHelp}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={closeHelp}>
              再想想
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={resetText.trim() !== '清除' || resetting}
              onClick={() => void doReset()}
            >
              {resetting ? '正在清除…' : '清除本机数据并重来'}
            </button>
          </>
        }
      >
        <p className="dialog-text">
          密码以加盐摘要保存在这台设备上 —— 没有服务器、没有邮箱，
          <strong>没有任何找回的办法</strong>。
        </p>
        <p className="dialog-text">
          唯一的出路是清除本机数据后重新开始。账单会一并清除且无法恢复，
          清除后请勿关闭页面。
        </p>
        <div className="field">
          <label className="field-label" htmlFor="lock-reset-confirm">
            输入「清除」两个字以确认
          </label>
          <input
            id="lock-reset-confirm"
            className="input"
            value={resetText}
            onChange={(e) => setResetText(e.target.value)}
            placeholder="清除"
            autoComplete="off"
          />
        </div>
      </Dialog>
    </div>
  );
}
