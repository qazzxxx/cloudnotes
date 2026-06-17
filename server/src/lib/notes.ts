import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { cleanupAssetsForDeletedNote } from './assets';
import {
  FsError,
  isHiddenEntry,
  isMarkdown,
  joinRel,
  resolveWithinRoot,
  validateName,
} from './paths';

export interface TreeNode {
  name: string;
  /** 相对根目录的路径（`/` 分隔），作为前端唯一 key 与后续 API 入参 */
  path: string;
  type: 'dir' | 'file';
  children?: TreeNode[];
}

export interface NoteFile {
  path: string;
  name: string;
  content: string;
  /** 最后修改时间（epoch 毫秒） */
  mtime: number;
  size: number;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// ── 目录树 ──────────────────────────────────────────────────
function sortNodes(nodes: TreeNode[]): void {
  // 目录优先，再按 localeCompare（中文友好）排序
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh');
  });
}

async function readDirChildren(absDir: string, relDir: string): Promise<TreeNode[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return []; // 无权限 / 不存在的子目录静默跳过
  }

  const nodes: TreeNode[] = [];
  await Promise.all(
    entries.map(async (entry) => {
      if (isHiddenEntry(entry.name)) return;
      const abs = path.join(absDir, entry.name);
      const rel = joinRel(relDir, entry.name);
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: rel,
          type: 'dir',
          children: await readDirChildren(abs, rel),
        });
      } else if (entry.isFile() && isMarkdown(entry.name)) {
        nodes.push({ name: entry.name, path: rel, type: 'file' });
      }
    }),
  );
  sortNodes(nodes);
  return nodes;
}

/** 读取整棵笔记树（仅目录 + .md 文件）。 */
export async function readTree(): Promise<TreeNode[]> {
  return readDirChildren(env.rootSpace, '');
}

// ── 读取文件 ────────────────────────────────────────────────
export async function readNote(relPath: string): Promise<NoteFile> {
  const abs = resolveWithinRoot(relPath);
  if (!isMarkdown(abs)) throw new FsError(400, '仅支持读取 .md 文件');
  const stat = await fs.stat(abs).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') throw new FsError(404, '文件不存在');
    throw e;
  });
  if (!stat.isFile()) throw new FsError(400, '目标不是文件');
  const content = await fs.readFile(abs, 'utf8');
  return {
    path: relPath,
    name: path.basename(abs),
    content,
    mtime: stat.mtimeMs,
    size: stat.size,
  };
}

// ── 保存（覆盖写入）────────────────────────────────────────
export async function writeNote(relPath: string, content: string): Promise<NoteFile> {
  if (typeof content !== 'string') throw new FsError(400, 'content 必须为字符串');
  const abs = resolveWithinRoot(relPath);
  if (!isMarkdown(abs)) throw new FsError(400, '仅支持写入 .md 文件');
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
  const stat = await fs.stat(abs);
  return {
    path: relPath,
    name: path.basename(abs),
    content,
    mtime: stat.mtimeMs,
    size: stat.size,
  };
}

// ── 新建 ────────────────────────────────────────────────────
export async function createEntry(
  relPath: string,
  type: 'file' | 'dir',
  content = '',
): Promise<TreeNode> {
  const abs = resolveWithinRoot(relPath);
  validateName(path.basename(abs)); // 防止恶意名（其余段已由沙箱校验）
  if (type === 'file' && !isMarkdown(abs)) throw new FsError(400, '仅支持创建 .md 文件');
  if (abs === env.rootSpace) throw new FsError(400, '不能在根目录创建同名项');

  if (await exists(abs)) throw new FsError(409, '已存在同名项');

  if (type === 'dir') {
    await fs.mkdir(abs, { recursive: true });
  } else {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content ?? '', 'utf8');
  }
  return { name: path.basename(abs), path: relPath, type };
}

// ── 重命名 / 移动 ──────────────────────────────────────────
export async function renameEntry(
  fromRel: string,
  toRel: string,
): Promise<{ from: string; to: string; type: 'dir' | 'file' }> {
  if (!fromRel || !toRel) throw new FsError(400, '缺少 from / to 路径');
  const fromAbs = resolveWithinRoot(fromRel);
  const toAbs = resolveWithinRoot(toRel);
  if (fromAbs === env.rootSpace) throw new FsError(400, '禁止移动根目录');
  validateName(path.basename(toAbs));

  const fromStat = await fs.stat(fromAbs).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') throw new FsError(404, '源路径不存在');
    throw e;
  });

  // 文件重命名须保留 .md 扩展名；目录无扩展名要求
  if (fromStat.isFile() && !isMarkdown(toAbs)) {
    throw new FsError(400, 'Markdown 文件重命名后须保留 .md 扩展名');
  }
  if (await exists(toAbs)) throw new FsError(409, '目标已存在');
  // 防止把目录移入自身子目录（会造成递归）
  if (fromStat.isDirectory() && (toAbs + path.sep).startsWith(fromAbs + path.sep)) {
    throw new FsError(400, '不能将目录移动到自身或其子目录内');
  }

  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.rename(fromAbs, toAbs);
  return { from: fromRel, to: toRel, type: fromStat.isDirectory() ? 'dir' : 'file' };
}

// ── 删除 ────────────────────────────────────────────────────
// 删除 .md 文件时，会智能清理其引用的孤儿附件（见 cleanupAssetsForDeletedNote）。
export async function deleteEntry(
  relPath: string,
): Promise<{ path: string; type: 'dir' | 'file'; removedAssets?: string[]; keptAssets?: string[] }> {
  const abs = resolveWithinRoot(relPath);
  if (!relPath || abs === env.rootSpace) throw new FsError(400, '禁止删除根目录');

  const stat = await fs.stat(abs).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') throw new FsError(404, '目标不存在');
    throw e;
  });

  if (stat.isDirectory()) {
    await fs.rm(abs, { recursive: true, force: false });
    return { path: relPath, type: 'dir' };
  }

  // .md 文件：先读内容，删除后清理孤儿附件
  let removedAssets: string[] = [];
  let keptAssets: string[] = [];
  if (isMarkdown(abs)) {
    let content = '';
    try {
      content = await fs.readFile(abs, 'utf8');
    } catch {
      /* 读取失败则按空内容处理 */
    }
    await fs.unlink(abs);
    const cleanup = await cleanupAssetsForDeletedNote(abs, content);
    removedAssets = cleanup.removed;
    keptAssets = cleanup.kept;
  } else {
    await fs.unlink(abs);
  }

  return { path: relPath, type: 'file', removedAssets, keptAssets };
}
