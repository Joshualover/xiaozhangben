import { useLedger } from '@/store/useLedgerStore';

export function Toasts() {
  const toasts = useLedger((s) => s.toasts);
  const dismiss = useLedger((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast${t.tone === 'success' ? ' is-success' : t.tone === 'danger' ? ' is-danger' : ''}`}
        >
          <span>{t.message}</span>
          {t.actionLabel && t.onAction ? (
            <button
              className="toast-action"
              onClick={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
