import { useEffect, useRef, useState, type ReactNode } from 'react';
import { App, Input, type InputRef } from 'antd';
import {
  CaretRightFilled,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileAddOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useNotes } from '../context/NotesContext';
import { api } from '../api';
import type { CreatingEntry, TreeNode } from '../types';

const ROW_H = 30;
const INDENT = 14;
const BASE_PAD = 8;
const ROOT_DROP_ID = '__root__';
/** 长按触发菜单的等待时间。500ms 是移动端常见手势标准。 */
const LONG_PRESS_MS = 500;
/** 拖拽时悬停在文件夹上 ~600ms 后自动展开。 */
const DRAG_AUTO_EXPAND_MS = 600;

function parentOf(path: string): string | null {
  const i = path.lastIndexOf('/');
  return i === -1 ? null : path.slice(0, i);
}
function titleOf(name: string): string {
  return name.replace(/\.md$/i, '');
}

/** 常见图片扩展名（用于给附件配上图片图标）。 */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|heic)$/i;
/** 是否为非 Markdown 的附件文件（assets 目录下的图片等）。 */
function isAssetFile(name: string): boolean {
  return !name.toLowerCase().endsWith('.md');
}
/** 判断 `ancestor` 是否是 `descendant` 的祖先或自身。 */
function isAncestorOrSelf(ancestor: string, descendant: string): boolean {
  return descendant === ancestor || descendant.startsWith(`${ancestor}/`);
}

/** 递归收集树里所有的 .md 笔记（扁平化，用于搜索）。 */
function collectNotes(nodes: TreeNode[]): TreeNode[] {
  const acc: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.type === 'file' && n.name.toLowerCase().endsWith('.md')) acc.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return acc;
}

interface FileTreeProps {
  /** 搜索关键词（非空时文件树切换为扁平的搜索结果列表） */
  query: string;
  creating: CreatingEntry | null;
  setCreating: (c: CreatingEntry | null) => void;
  /** 移动端选中后关闭抽屉 */
  onNavigate?: () => void;
}

/** 自定义菜单项：只支持 divider / 普通按钮，避免依赖 antd MenuProps。 */
type ContextMenuItem =
  | { type: 'divider'; key: string }
  | {
      type?: 'item';
      key: string;
      label: string;
      icon?: ReactNode;
      danger?: boolean;
      onClick: () => void;
    };

/**
 * 自定义现代文件树（不使用 antd Tree 默认样式）。
 * - 右键 / 移动端长按唤出操作菜单（新建子项 / 重命名 / 删除 / 在此新建...）；
 * - 拖拽移动（@dnd-kit）：支持跨文件夹移动，悬停自动展开，禁掉非法目标；
 * - 选中行以主色高亮，悬浮优雅背景反馈。
 */
export function FileTree({ query, creating, setCreating, onNavigate }: FileTreeProps) {
  const { tree, selected, setSelected, create, rename, remove } = useNotes();
  const { message, modal } = App.useApp();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  /** 正在被拖拽的节点 path，用于 DragOverlay 展示预览。 */
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  /** 右键 / 长按弹出的菜单目标节点 + 屏幕坐标。 */
  const [menuState, setMenuState] = useState<
    { node: TreeNode | null; x: number; y: number } | null
  >(null);
  const openMenu = (node: TreeNode, x: number, y: number) => setMenuState({ node, x, y });
  /** 整个文件树根区域空白处右键：node=null 表示「在根目录新建」。 */
  const openRootMenu = (x: number, y: number) => setMenuState({ node: null, x, y });

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
    setMenuState(null);
    setCreating({ parent, type });
  };

  const startRename = (path: string) => {
    if (parentOf(path)) ensure(parentOf(path)!);
    setMenuState(null);
    setRenaming(path);
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
    const asset = !isDir && isAssetFile(node.name);
    modal.confirm({
      title: isDir ? '删除文件夹？' : asset ? '删除附件？' : '删除笔记？',
      content: isDir
        ? `「${node.name}」及其所有内容将被永久删除。`
        : asset
          ? `「${node.name}」将被删除，引用它的笔记可能出现图片失效。`
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

  // ── 拖拽：完成时的实际移动 ─────────────────────────────────
  // 复用 NotesContext.rename —— 后端 /api/fs/rename 已支持「重命名 / 移动」，
  // 通过把目标 parent 接到 fileName 前即可触发移动。
  const onDragEnd = async (e: DragEndEvent) => {
    setDraggingPath(null);
    const source = e.active.id as string;
    const over = e.over?.id as string | undefined;
    if (!over || over === source) return;
    if (over === ROOT_DROP_ID) {
      // 拖到根：去掉 parent
      const name = source.slice(source.lastIndexOf('/') + 1);
      const to = name;
      if (to === source) return;
      try {
        await rename(source, to);
      } catch (err) {
        message.error(err instanceof Error ? err.message : '移动失败');
      }
      return;
    }
    const target = findNodeByPath(tree, over);
    if (!target) return;
    // 禁掉：把文件夹丢进自身或子孙
    if (isAncestorOrSelf(source, over)) {
      message.error('不能将文件夹移动到自身或其子目录');
      return;
    }
    const newParent = target.type === 'dir' ? target.path : parentOf(target.path);
    if (newParent === null) {
      message.error('无法确定目标位置');
      return;
    }
    const name = source.slice(source.lastIndexOf('/') + 1);
    const to = `${newParent}/${name}`;
    if (to === source) return;
    // 禁掉：把文件丢进自己（理论不可能，但兜底）
    if (isAncestorOrSelf(target.path, source)) {
      message.error('目标位置非法');
      return;
    }
    try {
      await rename(source, to);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '移动失败');
    }
  };

  const onDragStart = (e: DragStartEvent) => {
    setDraggingPath(e.active.id as string);
  };

  // dnd-kit sensors：PointerSensor 支持鼠标 + 触屏；KeyboardSensor 支持键盘拖拽（无障碍）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  // 拖拽悬停自动展开：监听当前 over 的 dir
  const autoExpandRef = useRef<{ path: string; timer: number } | null>(null);
  useEffect(() => {
    if (!draggingPath) return;
    // dnd-kit 没有 over 的回调直接给到组件外，所以这里用一个轻量的
    // 「正在拖拽中 + expanded」的副作用：上层用 setInterval 兜底不可行。
    // 真实做法是把 onDragOver 绑定在 DndContext 上 —— 见下面。
    return () => {
      if (autoExpandRef.current) {
        window.clearTimeout(autoExpandRef.current.timer);
        autoExpandRef.current = null;
      }
    };
  }, [draggingPath]);

  // ── 树渲染 ─────────────────────────────────────────────────
  const renderNode = (node: TreeNode, depth: number): ReactNode => (
    <TreeRow
      key={node.path}
      node={node}
      depth={depth}
      expanded={expanded}
      toggle={toggle}
      selected={selected}
      setSelected={(p) => {
        setSelected(p);
        onNavigate?.();
      }}
      renaming={renaming}
      onCommitRename={commitRename}
      onCancelRename={() => setRenaming(null)}
      creating={creating}
      onCommitCreate={commitCreate}
      onCancelCreate={() => setCreating(null)}
      onStartRename={startRename}
      onOpenMenu={openMenu}
      draggingPath={draggingPath}
    />
  );

  // 搜索：非空 query 时把树扁平成匹配的笔记列表
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const results = searching
    ? collectNotes(tree).filter((n) => titleOf(n.name).toLowerCase().includes(q))
    : [];

  // 菜单：右键 / 长按
  const buildMenu = (node: TreeNode | null): ContextMenuItem[] => {
    if (!node) {
      // 空白处右键 —— 只能新建到根目录
      return [
        {
          key: 'new-file-root',
          icon: <FileAddOutlined />,
          label: '新建笔记',
          onClick: () => startCreate(null, 'file'),
        },
        {
          key: 'new-dir-root',
          icon: <FolderAddOutlined />,
          label: '新建文件夹',
          onClick: () => startCreate(null, 'dir'),
        },
      ];
    }
    const isDir = node.type === 'dir';
    // 附件文件（assets 下的非 md）：只提供下载 / 删除。
    // 重命名会破坏笔记里的图片引用，且后端 rename 仅放行 .md，故不提供。
    if (!isDir && isAssetFile(node.name)) {
      return [
        {
          key: 'download',
          icon: <DownloadOutlined />,
          label: '下载',
          onClick: () => window.open(api.assetUrl(node.path), '_blank'),
        },
        { type: 'divider', key: 'div' },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: '删除',
          danger: true,
          onClick: () => confirmDelete(node),
        },
      ];
    }
    // 在「此处新建」时使用的父目录：文件夹就是它自身；文件则是它的父目录
    const hereParent = isDir ? node.path : parentOf(node.path);
    return [
      {
        key: 'new-file',
        icon: <FileAddOutlined />,
        label: '新建笔记',
        onClick: () => startCreate(hereParent, 'file'),
      },
      {
        key: 'new-dir',
        icon: <FolderAddOutlined />,
        label: '新建文件夹',
        onClick: () => startCreate(hereParent, 'dir'),
      },
      { type: 'divider', key: 'div' },
      {
        key: 'rename',
        icon: <EditOutlined />,
        label: '重命名',
        onClick: () => startRename(node.path),
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除',
        danger: true,
        onClick: () => confirmDelete(node),
      },
    ];
  };

  // 树根容器：同时作为根级 droppable（拖到空白处 → 移动到根）
  return (
    // 外层包一层 h-full flex flex-col，让 RootDropZone 的 flex-1 填满 Sidebar 滚动区
    <div className="flex h-full flex-col">
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver(autoExpandRef, expanded, ensure)}
      >
        <RootDropZone
          onRootContextMenu={openRootMenu}
          onRootLongPress={openRootMenu}
        >
        {searching ? (
          results.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px] text-gray-400">无匹配的笔记</div>
          ) : (
            results.map((n) => (
              <SearchResultRow
                key={n.path}
                node={n}
                selected={selected}
                onPick={() => {
                  setSelected(n.path);
                  onNavigate?.();
                }}
              />
            ))
          )
        ) : tree.length === 0 ? (
          <EmptyState
            creating={creating}
            onCommitCreate={commitCreate}
            onCancelCreate={() => setCreating(null)}
            onStartCreate={(type) => setCreating({ parent: null, type })}
          />
        ) : (
          <>
            {creating?.parent === null && (
              <InlineCreateRow
                type={creating.type}
                depth={0}
                onCommit={commitCreate}
                onCancel={() => setCreating(null)}
              />
            )}
            {tree.map((n) => renderNode(n, 0))}
          </>
        )}
      </RootDropZone>

      <DragOverlay dropAnimation={null}>
        {draggingPath ? <DragPreview path={draggingPath} tree={tree} /> : null}
      </DragOverlay>

      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={buildMenu(menuState.node)}
          onClose={() => setMenuState(null)}
        />
      )}
      </DndContext>
    </div>
  );
}

/** 搜索结果行：扁平展示一篇笔记（标题 + 所属目录），点击打开。 */
function SearchResultRow({
  node,
  selected,
  onPick,
}: {
  node: TreeNode;
  selected: string | null;
  onPick: () => void;
}) {
  const title = titleOf(node.name);
  const parent = parentOf(node.path);
  const isSelected = node.path === selected;
  return (
    <div
      onClick={onPick}
      className="group flex cursor-pointer items-center gap-2 rounded-lg pr-2 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      style={{
        height: 40,
        paddingLeft: BASE_PAD,
        ...(isSelected
          ? {
              background: 'color-mix(in srgb, var(--ant-color-primary) 13%, transparent)',
              color: 'var(--ant-color-primary)',
            }
          : {}),
      }}
    >
      <FileTextOutlined className="text-[14px] leading-none text-gray-400" />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className={`truncate text-[13px] ${isSelected ? 'font-medium' : ''}`} title={node.name}>
          {title}
        </span>
        {parent !== null && <span className="truncate text-[11px] text-gray-400">{parent}</span>}
      </div>
    </div>
  );
}

// ── 浮动菜单：fixed 定位到右键/长按坐标，点空白处关闭 ─────────
function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  // 用 ref 探测点击是否在菜单外。
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocPointer = (ev: PointerEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) onClose();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    // 用 capture 阶段抢先吃掉 pointerdown，避免事件先到达下面的 row 又触发别的逻辑
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="z-50 min-w-[180px] overflow-hidden rounded-md border border-black/10 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#1f1f1f]"
      style={{ position: 'fixed', top: y, left: x }}
    >
      {items.map((it) => {
        if (!it) return null;
        if (it.type === 'divider') {
          return <div key={String(it.key)} className="my-1 h-px bg-black/10 dark:bg-white/10" />;
        }
        const item = it as Exclude<typeof it, { type: 'divider' }>;
        return (
          <button
            key={String(item.key)}
            type="button"
            role="menuitem"
            onClick={(ev) => {
              ev.stopPropagation();
              item.onClick();
              onClose();
            }}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08] ${
              'danger' in item && item.danger
                ? 'text-red-500 hover:bg-red-500/10'
                : 'text-gray-700 dark:text-gray-200'
            }`}
          >
            {item.icon ? <span className="text-[14px]">{item.icon}</span> : null}
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── 根级 droppable（拖到空白处 → 移动到根） ─────────────────────
function RootDropZone({
  onRootContextMenu,
  onRootLongPress,
  children,
}: {
  onRootContextMenu: (x: number, y: number) => void;
  onRootLongPress: (x: number, y: number) => void;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID });
  // 移动端长按：在 root 空白处按下 500ms 触发根菜单
  const longPressTimer = useRef<number | null>(null);
  const longPressPos = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    return () => {
      if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    };
  }, []);
  return (
    <div
      ref={setNodeRef}
      onContextMenu={(e) => {
        // 行内的 onContextMenu 已经 stopPropagation，所以冒泡到这里的一定是空白处
        e.preventDefault();
        onRootContextMenu(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return;
        longPressPos.current = { x: e.clientX, y: e.clientY };
        if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
        longPressTimer.current = window.setTimeout(() => {
          const pos = longPressPos.current;
          if (pos) onRootLongPress(pos.x, pos.y);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        if (longPressTimer.current !== null) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        longPressPos.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        if (longPressTimer.current !== null) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }}
      onPointerCancel={() => {
        if (longPressTimer.current !== null) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }}
      className={`flex min-h-full flex-1 flex-col py-1 transition-colors ${
        isOver ? 'bg-[var(--ant-color-primary)]/8' : ''
      }`}
    >
      {children}
      {/* 占据剩余空间：让滚动容器底部空白区域也属于 RootDropZone，
          这样在空白处右键 / 长按才会触发根菜单。 */}
      <div className="flex-1" aria-hidden />
      {isOver && (
        <div
          className="mt-2 rounded-md border-2 border-dashed text-center text-[12px] text-[var(--ant-color-primary)]"
          style={{ height: 28, lineHeight: '24px' }}
        >
          移动到根目录
        </div>
      )}
    </div>
  );
}

// ── 单行：可拖拽 + 可放置 + 右键/长按菜单 ─────────────────────
interface TreeRowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  selected: string | null;
  setSelected: (path: string) => void;
  renaming: string | null;
  onCommitRename: (v: string) => void;
  onCancelRename: () => void;
  creating: CreatingEntry | null;
  onCommitCreate: (v: string) => void;
  onCancelCreate: () => void;
  onStartRename: (path: string) => void;
  onOpenMenu: (n: TreeNode, x: number, y: number) => void;
  draggingPath: string | null;
}

function TreeRow(props: TreeRowProps) {
  const {
    node,
    depth,
    expanded,
    toggle,
    selected,
    setSelected,
    renaming,
    onCommitRename,
    onCancelRename,
    creating,
    onCommitCreate,
    onCancelCreate,
    onStartRename,
    onOpenMenu,
    draggingPath,
  } = props;

  const dir = node.type === 'dir';
  const asset = !dir && isAssetFile(node.name);
  const open = expanded.has(node.path);
  const isSelected = node.path === selected;
  const isRenaming = renaming === node.path;
  const padLeft = depth * INDENT + BASE_PAD;

  // 拖拽源 —— 文件/文件夹都可以拖。正在拖时降低自身透明度，让 DragOverlay 更显眼
  // 附件不可拖：拖拽落点会触发 rename，而后端 rename 仅放行 .md，且重命名会破坏笔记里的引用。
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: node.path,
    disabled: asset,
  });

  // 文件夹作为放置目标。文件不作为目标（避免误把 A 笔记丢到 B 笔记「上」造成混乱）
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: node.path,
    disabled: !dir,
  });

  // 拖拽悬停自动展开
  useEffect(() => {
    if (!dir || !isOver) return;
    if (open) return;
    if (draggingPath && isAncestorOrSelf(node.path, draggingPath)) return; // 自己是拖拽源的祖先就别展开（避免循环）
    const t = window.setTimeout(() => toggle(node.path), DRAG_AUTO_EXPAND_MS);
    return () => window.clearTimeout(t);
  }, [dir, isOver, open, toggle, node.path, draggingPath]);

  // 长按手势（移动端）：单独用 addEventListener 监听 pointerdown / pointermove / pointerup。
  // 这里故意不走 React 的 onPointerDown / onPointerMove —— 那些位置必须留给 dnd-kit 的
  // {listeners} spread，否则 dnd-kit 收不到 pointerdown 事件，拖拽永远无法启动。
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const rowElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rowElRef.current;
    if (!el) return;

    const clearLongPress = () => {
      if (longPressTimer.current !== null) {
        window.clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      longPressTriggered.current = false;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      clearLongPress();
      longPressTimer.current = window.setTimeout(() => {
        longPressTriggered.current = true;
        const pos = lastPointerRef.current;
        onOpenMenu(node, pos?.x ?? 0, pos?.y ?? 0);
      }, LONG_PRESS_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (longPressTimer.current !== null) clearLongPress();
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => clearLongPress();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onUp);
      clearLongPress();
    };
  }, [node, onOpenMenu]);

  const handleClick = (e: React.MouseEvent) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      e.preventDefault();
      return;
    }
    if (dir) toggle(node.path);
    else if (asset) window.open(api.assetUrl(node.path), '_blank', 'noopener');
    else setSelected(node.path);
  };
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenMenu(node, e.clientX, e.clientY);
  };

  const setRefs = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
    rowElRef.current = el;
  };

  return (
    <div>
      <div
        ref={setRefs}
        {...attributes}
        {...listeners}
        className={`group flex select-none items-center gap-1 rounded-lg pr-2 transition-colors ${
          isSelected ? '' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
        } ${isDragging ? 'opacity-30' : ''} ${
          isOver && dir ? 'ring-1 ring-[var(--ant-color-primary)]/50 bg-[var(--ant-color-primary)]/8' : ''
        }`}
        style={{
          height: ROW_H,
          paddingLeft: padLeft,
          // 重命名态用 text cursor 让用户清楚这是输入区；其他时候全部可拖 → grab
          cursor: isRenaming
            ? 'text'
            : isDragging
            ? 'grabbing'
            : 'default',
          // dnd-kit 官方推荐：'none' 阻止浏览器默认的滚动/缩放，避免和拖拽手势冲突
          touchAction: 'none',
          userSelect: 'none',
          ...(isSelected
            ? {
                background: 'color-mix(in srgb, var(--ant-color-primary) 13%, transparent)',
                color: 'var(--ant-color-primary)',
              }
            : {}),
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onDoubleClick={(e) => {
          // 拖拽监听器可能拦截双击；显式阻止默认 drag 行为时不会出问题
          if (dir) onStartRename(node.path);
        }}
        // 注意：这里**不要**写 onPointerDown / onPointerMove / onPointerUp。
        // dnd-kit 的 {...listeners} 内部要用这些事件去启动拖拽（PointerSensor 的
        // activationConstraint.distance）。一旦覆盖，dnd-kit 收不到 pointerdown，
        // 拖拽就永远不启动。长按检测改用 useEffect + addEventListener 单独挂。
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
          ) : asset ? (
            IMAGE_EXT_RE.test(node.name) ? (
              <FileImageOutlined className="text-gray-400" />
            ) : (
              <PaperClipOutlined className="text-gray-400" />
            )
          ) : (
            <FileTextOutlined className="text-gray-400" />
          )}
        </span>

        {isRenaming ? (
          <InlineInput
            initial={dir ? node.name : titleOf(node.name)}
            onCommit={onCommitRename}
            onCancel={onCancelRename}
          />
        ) : (
          <span
            className={`flex-1 truncate text-[13px] ${isSelected ? 'font-medium' : ''}`}
            title={node.name}
          >
            {dir ? node.name : titleOf(node.name)}
          </span>
        )}
      </div>

      {/* 文件夹内的内联新建行 */}
      {dir && creating?.parent === node.path && (
        <InlineCreateRow
          type={creating.type}
          depth={depth + 1}
          onCommit={onCommitCreate}
          onCancel={onCancelCreate}
        />
      )}

      {dir && open && node.children?.length === 0 && creating?.parent !== node.path && (
        <div
          className="flex items-center gap-1 text-[12px] italic text-gray-400"
          style={{ height: ROW_H, paddingLeft: (depth + 1) * INDENT + BASE_PAD + 22 }}
        >
          空文件夹
        </div>
      )}

      {dir && open && node.children?.map((c) => (
        <TreeRow key={c.path} {...props} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

// ── 拖拽预览（在 DragOverlay 中渲染） ─────────────────────────
function DragPreview({ path, tree }: { path: string; tree: TreeNode[] }) {
  const node = findNodeByPath(tree, path);
  if (!node) return null;
  const dir = node.type === 'dir';
  return (
    <div
      className="flex items-center gap-1 rounded-md border border-black/10 bg-white px-2 py-1 text-[13px] shadow-lg dark:border-white/20 dark:bg-[#1f1f1f]"
      style={{ minWidth: 120 }}
    >
      {dir ? (
        <FolderOutlined className="text-amber-400" />
      ) : (
        <FileTextOutlined className="text-gray-400" />
      )}
      <span className="truncate">{dir ? node.name : titleOf(node.name)}</span>
    </div>
  );
}

// ── 空树占位 ─────────────────────────────────────────────────
function EmptyState({
  creating,
  onCommitCreate,
  onCancelCreate,
  onStartCreate,
}: {
  creating: CreatingEntry | null;
  onCommitCreate: (v: string) => void;
  onCancelCreate: () => void;
  onStartCreate: (type: 'file' | 'dir') => void;
}) {
  return (
    <div className="py-1">
      {creating?.parent === null && (
        <InlineCreateRow
          type={creating.type}
          depth={0}
          onCommit={onCommitCreate}
          onCancel={onCancelCreate}
        />
      )}
      <div className="mt-8 flex flex-col items-center gap-2 px-4 text-center text-gray-400">
        <FileTextOutlined className="text-3xl opacity-50" />
        <p className="text-[13px]">还没有笔记</p>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onStartCreate('file')}
            className="rounded-full bg-black/[0.04] px-4 py-1.5 text-[12px] text-gray-600 transition-colors hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
          >
            + 新建第一篇
          </button>
          <button
            type="button"
            onClick={() => onStartCreate('dir')}
            className="rounded-full bg-black/[0.04] px-4 py-1.5 text-[12px] text-gray-600 transition-colors hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
          >
            + 新建文件夹
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 内联输入 ─────────────────────────────────────────────────
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
  const committed = useRef(false);

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
      onPointerDown={(e) => e.stopPropagation()}
      onPressEnter={() => {
        if (committed.current) return;
        committed.current = true;
        onCommit(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (committed.current) return;
          committed.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (committed.current) return;
        committed.current = true;
        onCommit(value);
      }}
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

// ── 工具 ────────────────────────────────────────────────────
function findNodeByPath(tree: TreeNode[], path: string): TreeNode | null {
  for (const n of tree) {
    if (n.path === path) return n;
    if (n.children) {
      const hit = findNodeByPath(n.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

/** dnd-kit 的 onDragOver 回调：拖到 dir 时启动 auto-expand 计时器。 */
function handleDragOver(
  ref: React.RefObject<{ path: string; timer: number } | null>,
  _expanded: Set<string>,
  ensure: (path: string) => void,
) {
  return ({ over }: { over: { id: string | number } | null }) => {
    const id = over?.id;
    if (!id || id === ROOT_DROP_ID || typeof id !== 'string') return;
    if (ref.current?.path === id) return; // 已经在等这个
    if (ref.current) {
      window.clearTimeout(ref.current.timer);
    }
    const t = window.setTimeout(() => ensure(id), DRAG_AUTO_EXPAND_MS);
    ref.current = { path: id, timer: t };
  };
}
