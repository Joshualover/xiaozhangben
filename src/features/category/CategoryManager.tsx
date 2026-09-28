import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLedger } from '@/store/useLedgerStore';
import { Icon, IconTile } from '@/components/Icon';
import { Dialog, Empty, Segmented, Sheet, Switch } from '@/components/UI';
import { COLOR_OPTIONS, ICON_KEYS } from '@/lib/icons';
import type { Category, TxType } from '@/types';

/** 分类管理：新增 / 编辑 / 隐藏 / 删除（带账单转移） */
export function CategoryManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useLedger((s) => s.categories);
  const transactions = useLedger((s) => s.transactions);
  const updateCategory = useLedger((s) => s.updateCategory);
  const removeCategory = useLedger((s) => s.removeCategory);
  const pushToast = useLedger((s) => s.pushToast);

  const [type, setType] = useState<TxType>('expense');
  const [editing, setEditing] = useState<Category | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [parentFor, setParentFor] = useState<Category | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  const list = useMemo(
    () => categories.filter((c) => c.type === type && c.parentId === null).sort((a, b) => a.sort - b.sort),
    [categories, type],
  );

  const usageCount = (id: string) => {
    const ids = [id, ...categories.filter((c) => c.parentId === id).map((c) => c.id)];
    return transactions.filter((t) => ids.includes(t.categoryId) || (t.subCategoryId && ids.includes(t.subCategoryId)))
      .length;
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const count = usageCount(pendingDelete.id);
    try {
      if (count > 0 && !reassignTo) {
        pushToast({ message: '请先选择账单转移目标', tone: 'danger' });
        return;
      }
      await removeCategory(pendingDelete.id, reassignTo || undefined);
      pushToast({ message: `已删除分类「${pendingDelete.name}」`, tone: 'success' });
      setPendingDelete(null);
      setReassignTo('');
    } catch (err) {
      pushToast({ message: (err as Error).message, tone: 'danger' });
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="分类管理"
        labelledBy="category-manager-title"
        footer={
          <>
            <button
              className="btn"
              onClick={() => {
                setEditing(null);
                setParentFor(null);
                setEditorOpen(true);
              }}
            >
              <Plus size={15} /> 新建一级分类
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={onClose}>
              完成
            </button>
          </>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <Segmented
            value={type}
            tone={type}
            onChange={setType}
            options={[
              { value: 'expense', label: '支出分类' },
              { value: 'income', label: '收入分类' },
            ]}
          />
        </div>

        {list.length === 0 ? (
          <Empty icon={<Plus size={22} />} title="还没有分类" desc="新建一个分类，记账时才能选到它。" />
        ) : (
          <div>
            {list.map((c) => {
              const children = categories.filter((x) => x.parentId === c.id).sort((a, b) => a.sort - b.sort);
              return (
                <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                  <div className="list-row" style={{ padding: 0, borderTop: 'none' }}>
                    <IconTile name={c.icon} color={c.color} size={32} />
                    <div className="list-row-main">
                      <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {c.name}
                        {c.hidden ? <span className="badge badge-muted">已隐藏</span> : null}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {children.length} 个细分 · {usageCount(c.id)} 笔账单
                      </div>
                    </div>
                    <div className="tx-actions">
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={c.hidden ? '显示' : '隐藏'}
                        onClick={() => void updateCategory(c.id, { hidden: !c.hidden })}
                      >
                        {c.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label="编辑"
                        onClick={() => {
                          setEditing(c);
                          setParentFor(null);
                          setEditorOpen(true);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label="删除"
                        onClick={() => {
                          setPendingDelete(c);
                          setReassignTo('');
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 43 }}>
                    {children.map((child) => (
                      <span className="chip" key={child.id}>
                        {child.name}
                        <button
                          className="chip-remove"
                          aria-label={`删除细分 ${child.name}`}
                          onClick={() => {
                            setPendingDelete(child);
                            setReassignTo('');
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      className="chip"
                      onClick={() => {
                        setParentFor(c);
                        setEditing(null);
                        setEditorOpen(true);
                      }}
                    >
                      <Plus size={12} /> 添加细分
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Sheet>

      <CategoryEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
          setParentFor(null);
        }}
        editing={editing}
        parent={parentFor}
        type={type}
      />

      <Dialog
        open={Boolean(pendingDelete)}
        title={`删除分类「${pendingDelete?.name ?? ''}」？`}
        onClose={() => setPendingDelete(null)}
        actions={
          <>
            <button className="btn" onClick={() => setPendingDelete(null)}>
              取消
            </button>
            <button
              className="btn btn-danger"
              disabled={usageCount(pendingDelete?.id ?? '') > 0 && !reassignTo}
              onClick={() => void handleDelete()}
            >
              确认删除
            </button>
          </>
        }
      >
        {pendingDelete && usageCount(pendingDelete.id) > 0 ? (
          <>
            该分类（含细分）下有 <b>{usageCount(pendingDelete.id)}</b> 笔账单。
            必须先把它们转移到其他分类，否则会产生「未分类」的悬空数据。
            <div className="field" style={{ marginTop: 12 }}>
              <label className="field-label" htmlFor="reassign-category">
                转移到
              </label>
              <select
                id="reassign-category"
                className="select"
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
              >
                <option value="">请选择目标分类</option>
                {categories
                  .filter((c) => c.type === pendingDelete.type && c.parentId === null && c.id !== pendingDelete.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </>
        ) : (
          <>该分类下没有账单，可以安全删除。</>
        )}
      </Dialog>
    </>
  );
}

function CategoryEditor({
  open,
  onClose,
  editing,
  parent,
  type,
}: {
  open: boolean;
  onClose: () => void;
  editing: Category | null;
  parent: Category | null;
  type: TxType;
}) {
  const addCategory = useLedger((s) => s.addCategory);
  const updateCategory = useLedger((s) => s.updateCategory);
  const categories = useLedger((s) => s.categories);
  const pushToast = useLedger((s) => s.pushToast);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('more-horizontal');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const openedRef = useRef(false);

  // 仅在打开时初始化一次，之后用户输入的内容不会被覆盖
  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;

    if (editing) {
      setName(editing.name);
      setIcon(editing.icon);
      setColor(editing.color);
      setHidden(editing.hidden);
    } else if (parent) {
      setName('');
      setIcon(parent.icon);
      setColor(parent.color);
      setHidden(false);
    } else {
      setName('');
      setIcon('more-horizontal');
      setColor(COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)]);
      setHidden(false);
    }
    setError('');
  }, [open, editing, parent]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请填写分类名称');
      return;
    }
    const duplicated = categories.some(
      (c) =>
        c.type === type &&
        c.parentId === (editing ? editing.parentId : (parent?.id ?? null)) &&
        c.name === trimmed &&
        c.id !== editing?.id,
    );
    if (duplicated) {
      setError('同级下已有同名分类');
      return;
    }

    if (editing) {
      await updateCategory(editing.id, { name: trimmed, icon, color, hidden });
    } else {
      const maxSort = Math.max(0, ...categories.filter((c) => c.type === type).map((c) => c.sort));
      await addCategory({
        name: trimmed,
        type,
        parentId: parent?.id ?? null,
        icon,
        color,
        sort: maxSort + 1,
        hidden: false,
      });
    }
    pushToast({ message: editing ? '分类已更新' : '分类已创建', tone: 'success' });
    onClose();
  };

  const title = editing ? '编辑分类' : parent ? `在「${parent.name}」下新增细分` : '新建一级分类';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      labelledBy="category-editor-title"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={() => void save()}>
            保存
          </button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label" htmlFor="cat-name">
          名称
        </label>
        <input
          id="cat-name"
          className="input"
          value={name}
          maxLength={12}
          placeholder="如：宠物"
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError('');
          }}
        />
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <span className="field-label">图标</span>
        <div className="cat-grid">
          {ICON_KEYS.map((k) => (
            <button
              key={k}
              className={`cat-cell${icon === k ? ' is-active' : ''}`}
              aria-label={`选择图标 ${k}`}
              onClick={() => setIcon(k)}
            >
              <span className="cat-icon is-sm" style={{ background: color }}>
                <Icon name={k} size={15} strokeWidth={2} />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <span className="field-label">颜色</span>
        <div className="chip-row">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              aria-label={`选择颜色 ${c}`}
              onClick={() => setColor(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: c,
                border: color === c ? '2px solid var(--text-1)' : '1px solid var(--border)',
              }}
            />
          ))}
        </div>
      </div>

      {editing ? (
        <div className="setting-row">
          <div>
            <div className="setting-label">隐藏该分类</div>
            <div className="setting-desc">隐藏后记账时不再显示，但历史账单仍会保留该分类。</div>
          </div>
          <div className="setting-control">
            <Switch checked={hidden} onChange={setHidden} label="隐藏该分类" />
          </div>
        </div>
      ) : null}

      {error ? (
        <p style={{ color: 'var(--danger)', fontSize: 12 }} role="alert">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
