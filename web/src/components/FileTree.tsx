import { useEffect, useRef, useState, type ReactNode } from 'react';
import { App, Input, Tooltip, type InputRef } from 'antd';
import {
  CaretRightFilled,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useNotes } from '../context/NotesContext';
import type { CreatingEntry, TreeNode } from '../types';

const ROW_H = 30;
const INDENT = 14;
const BASE_PAD = 8;

function parentOf(path: string): string | null {
  const i = path.lastIndexOf('/');
  return i === -1 ? null : path.slice(0, i);
}
function titleOf(name: string): string {
  return name.replace(/\.md$/i, '');
}

interface FileTreeProps {
  creating: CreatingEntry | null;
  setCreating: (c: CreatingEntry | null) => void;
  /** 移动端选中后关闭抽屉 */
  onNavigate?: () => void;
}

/**
 * 自定义现代文件树（不使用 antd Tree 默认样式）。
 * - 无限层级嵌套；
 * - 选中行以主色高亮，悬浮优雅背景反馈；
 * - 悬浮/选中时显示操作（新建子项 / 重命名 / 删除）；
 * - 内联重命名与新建输入。
 */
export function FileTree({ creating, setCreating, onNavigate }: FileTreeProps) {
  const { tree, selected, setSelected, create, rename, remove } = useNotes();
  const { message, modal } = App.useApp();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);

  // 选中文件时自动展开其所有祖先目录
  useEffect(() => {
    if (!selected) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let p = parentOf(selected);
      while (p) {
        next.add(p);
        p = parentOf(p);
      }
      return next;
    });
  }, [selected]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const ensure = (path: string) =>
    setExpanded((prev) => (prev.has(path) ? prev : new Set(prev).add(path)));

  const startCreate = (parent: string | null, type: 'file' | 'dir') => {
    if (parent) ensure(parent);
    setRenaming(null);
    setCreating({ parent, type });
  };

  // ── 新建提交 ───────────────────────────────────────────────
  const commitCreate = async (rawName: string) => {
    const ctx = creating;
    setCreating(null);
    if (!ctx) return;
    const name = rawName.trim();
    if (!name) return;
    const fileName = ctx.type === 'file' ? (name.endsWith('.md') ? name : `${name}.md`) : name;
    const path = ctx.parent ? `${ctx.parent}/${fileName}` : fileName;
    try {
      const node = await create(path, ctx.type);
      if (node.type === 'file') {
        setSelected(node.path);
        onNavigate?.();
      } else {
        ensure(node.path);
      }
      message.success(ctx.type === 'file' ? '已新建笔记' : '已新建文件夹');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '创建失败');
    }
  };

  // ── 重命名提交 ─────────────────────────────────────────────
  const commitRename = async (rawName: string) => {
    const from = renaming;
    setRenaming(null);
    if (!from) return;
    const name = rawName.trim();
    if (!name) return;
    const wasFile = from.toLowerCase().endsWith('.md');
    const fileName = wasFile ? (name.endsWith('.md') ? name : `${name}.md`) : name;
    const parent = parentOf(from);
    const to = parent ? `${parent}/${fileName}` : fileName;
    if (to === from) return;
    try {
      await rename(from, to);
      message.success('已重命名');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '重命名失败');
    }
  };

  // ── 删除确认 ───────────────────────────────────────────────
  const confirmDelete = (node: TreeNode) => {
    const isDir = node.type === 'dir';
    modal.confirm({
      title: isDir ? '删除文件夹？' : '删除笔记？',
      content: isDir
        ? `「${node.name}」及其所有内容将被永久删除。`
        : `「${titleOf(node.name)}」将被删除，关联的孤儿图片也会被自动清理。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const r = await remove(node.path);
          message.success('已删除');
          if (r.removedAssets?.length) {
            message.info(`已清理 ${r.removedAssets.length} 个孤儿附件`);
          }
        } catch (e) {
          message.error(e instanceof Error ? e.message : '删除失败');
        }
      },
    });
  };

  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    const dir = node.type === 'dir';
    const open = expanded.has(node.path);
    const isSelected = node.path === selected;
    const isRenaming = renaming === node.path;
    const padLeft = depth * INDENT + BASE_PAD;

    return (
      <div key={node.path}>
        <div
          className={`group flex cursor-pointer select-none items-center gap-1 rounded-lg pr-1 transition-colors ${
            isSelected ? '' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
          }`}
          style={{
            height: ROW_H,
            paddingLeft: padLeft,
            ...(isSelected
              ? {
                  background: 'color-mix(in srgb, var(--ant-color-primary) 13%, transparent)',
                  color: 'var(--ant-color-primary)',
                }
              : {}),
          }}
          onClick={() => {
            if (dir) {
              toggle(node.path);
            } else {
              setSelected(node.path);
              onNavigate?.();
            }
          }}
          onDoubleClick={() => setRenaming(node.path)}
        >
          {dir ? (
            <CaretRightFilled
              onClick={(e) => {
                e.stopPropagation();
                toggle(node.path);
              }}
              className={`text-[9px] text-gray-400 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
            />
          ) : (
            <span className="inline-block w-[9px]" />
          )}

          <span className="text-[14px] leading-none">
            {dir ? (
              open ? (
                <FolderOpenOutlined style={{ color: 'var(--ant-color-primary)' }} />
              ) : (
                <FolderOutlined className="text-amber-400" />
              )
            ) : (
              <FileTextOutlined className="text-gray-400" />
            )}
          </span>

          {isRenaming ? (
            <InlineInput
              initial={dir ? node.name : titleOf(node.name)}
              onCommit={commitRename}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <span
              className={`flex-1 truncate text-[13px] ${isSelected ? 'font-medium' : ''}`}
              title={node.name}
            >
              {dir ? node.name : titleOf(node.name)}
            </span>
          )}

          {/* 操作按钮：悬浮或选中时可见 */}
          <div
            className={`flex items-center gap-0.5 transition-opacity ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {dir && (
              <ActionIcon title="在此新建笔记" onClick={() => startCreate(node.path, 'file')}>
                <PlusOutlined />
              </ActionIcon>
            )}
            <ActionIcon title="重命名" onClick={() => setRenaming(node.path)}>
              <EditOutlined />
            </ActionIcon>
            <ActionIcon title="删除" danger onClick={() => confirmDelete(node)}>
              <DeleteOutlined />
            </ActionIcon>
          </div>
        </div>

        {/* 文件夹内的内联新建行 */}
        {dir && creating?.parent === node.path && (
          <InlineCreateRow
            type={creating.type}
            depth={depth + 1}
            onCommit={commitCreate}
            onCancel={() => setCreating(null)}
          />
        )}

        {dir && open && node.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="py-1">
      {creating?.parent === null && (
        <InlineCreateRow
          type={creating.type}
          depth={0}
          onCommit={commitCreate}
          onCancel={() => setCreating(null)}
        />
      )}
      {tree.map((n) => renderNode(n, 0))}
    </div>
  );
}

// ── 子组件 ────────────────────────────────────────────────────
function ActionIcon({
  title,
  danger,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip title={title}>
      <button
        type="button"
        onClick={onClick}
        className={`flex h-[22px] w-[22px] items-center justify-center rounded-md text-[12px] transition-colors ${
          danger
            ? 'text-gray-400 hover:bg-red-500/10 hover:text-red-500'
            : 'text-gray-400 hover:bg-black/[0.06] hover:text-gray-700 dark:hover:bg-white/[0.1] dark:hover:text-gray-200'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** 单次提交守卫：避免 Enter + onBlur 重复触发。 */
function useCommitOnce() {
  const done = useRef(false);
  return (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };
}

function InlineInput({
  initial,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial?: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  const ref = useRef<InputRef>(null);
  const commit = useCommitOnce();

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <Input
      ref={ref}
      size="small"
      variant="borderless"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPressEnter={() => commit(() => onCommit(value))}
      onKeyDown={(e) => {
        if (e.key === 'Escape') commit(onCancel);
      }}
      onBlur={() => commit(() => onCommit(value))}
    />
  );
}

function InlineCreateRow({
  type,
  depth,
  onCommit,
  onCancel,
}: {
  type: 'file' | 'dir';
  depth: number;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1"
      style={{ height: ROW_H, paddingLeft: depth * INDENT + BASE_PAD + 22 }}
    >
      <span className="text-[14px]">
        {type === 'dir' ? (
          <FolderOutlined className="text-amber-400" />
        ) : (
          <FileTextOutlined className="text-gray-400" />
        )}
      </span>
      <InlineInput
        placeholder={type === 'dir' ? '文件夹名' : '笔记名'}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}
