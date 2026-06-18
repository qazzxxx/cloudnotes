import { randomBytes } from 'node:crypto';
import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { FsError, ASSETS_DIR, isMarkdown, resolveWithinRoot } from './paths';

/** 允许的图片/附件扩展名（小写，不含点）。 */
const ALLOWED_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico',
]);

/** 上传文件大小上限（字节）。 */
export const MAX_ASSET_BYTES = 20 * 1024 * 1024; // 20MB

export interface AssetResult {
  /** 原始文件名（已清洗） */
  name: string;
  /** 相对于笔记所在目录的引用路径，用于嵌入 Markdown，例如 `assets/img-a1b2.png` */
  relPath: string;
  /** 相对于根目录的完整路径，用于拼装 asset 服务 URL */
  fullPath: string;
  size: number;
}

/** 从笔记相对路径推导其同级 assets 目录（绝对 + 根相对）。 */
export function assetsDirForNote(noteRelPath: string): {
  absAssetsDir: string;
  relAssetsDir: string;
} {
  const segs = noteRelPath.replace(/\\/g, '/').split('/').filter(Boolean);
  segs.pop(); // 去掉文件名，保留目录段
  const relDir = segs.join('/');
  const absAssetsDir = path.join(resolveWithinRoot(relDir), ASSETS_DIR);
  const relAssetsDir = relDir ? `${relDir}/${ASSETS_DIR}` : ASSETS_DIR;
  return { absAssetsDir, relAssetsDir };
}

/** 清洗扩展名：小写、去点、须在白名单内。 */
function cleanExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().replace(/^\./, '');
  if (!ext || !ALLOWED_EXTS.has(ext)) {
    throw new FsError(400, `不支持的附件类型（仅限 ${[...ALLOWED_EXTS].join('/')}）`);
  }
  return ext;
}

/** 清洗文件名主干：仅保留字母数字/中文/下划线/连字符。 */
function cleanBase(originalName: string): string {
  const base = path.basename(originalName, path.extname(originalName));
  const kept = base.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '');
  return kept.slice(0, 40) || 'image';
}

/**
 * 保存上传的附件到笔记同级 assets 目录，返回可嵌入的相对路径。
 */
export async function saveAsset(
  noteRelPath: string,
  originalName: string,
  data: Buffer,
): Promise<AssetResult> {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new FsError(400, '附件内容为空');
  }
  if (data.length > MAX_ASSET_BYTES) {
    throw new FsError(413, '附件过大（>20MB）');
  }
  const ext = cleanExt(originalName);
  const base = cleanBase(originalName);
  const filename = `${base}-${randomBytes(4).toString('hex')}.${ext}`;

  const { absAssetsDir, relAssetsDir } = assetsDirForNote(noteRelPath);
  await fs.mkdir(absAssetsDir, { recursive: true });
  const absFile = path.join(absAssetsDir, filename);
  await fs.writeFile(absFile, data);

  return {
    name: filename,
    relPath: `${ASSETS_DIR}/${filename}`,
    fullPath: `${relAssetsDir}/${filename}`,
    size: data.length,
  };
}

// ── 引用解析（用于删除时的智能清理） ────────────────────────
// 匹配 Markdown 图片 ![alt](url) 与 HTML <img src="url">
const MD_IMG_RE = /!\[[^\]]*\]\(([^)\s]+)(?:[ \t]+"[^"]*")?\)/g;
const HTML_IMG_RE = /<img[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

/** 从 Markdown 文本中抽取「本地」资源引用（排除 http/data/blob 等）。 */
export function extractAssetRefs(markdown: string): string[] {
  const refs = new Set<string>();
  const collect = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      if (/^(?:https?:|data:|blob:|mailto:|tel:|#)/i.test(raw)) continue;
      refs.add(raw);
    }
  };
  collect(MD_IMG_RE);
  collect(HTML_IMG_RE);
  return [...refs];
}

/** 规整相对路径：处理 . / .. 与多余分隔符。 */
function normalizeRel(p: string): string {
  const segs: string[] = [];
  for (const s of p.split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') {
      segs.pop();
      continue;
    }
    segs.push(s);
  }
  return segs.join('/');
}

/** 把一个引用（相对于笔记目录）转换为根相对路径；仅保留指向 assets 的引用。 */
function refToRootRel(ref: string, noteDirRel: string): string | null {
  let r = ref;
  try {
    r = decodeURIComponent(r);
  } catch {
    /* 忽略非法百分号编码 */
  }
  r = r.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (!r.toLowerCase().includes(`${ASSETS_DIR}/`)) return null;
  const full = noteDirRel ? `${noteDirRel}/${r}` : r;
  const normalized = normalizeRel(full);
  if (!normalized.toLowerCase().includes(`${ASSETS_DIR}/`)) return null;
  return normalized;
}

export interface CleanupResult {
  /** 已删除的孤儿附件（根相对路径） */
  removed: string[];
  /** 被同级笔记引用而保留的附件 */
  kept: string[];
}

/**
 * 删除一篇 .md 后，智能清理其引用的附件：
 * 仅删除「同级目录其他 .md 都未引用」的附件，避免误删共享图片。
 * （必须在 .md 文件已被删除之后调用）
 */
export async function cleanupAssetsForDeletedNote(
  deletedNoteAbs: string,
  deletedContent: string,
): Promise<CleanupResult> {
  const noteDirAbs = path.dirname(deletedNoteAbs);
  const noteDirRelRaw = path.relative(env.rootSpace, noteDirAbs).split(path.sep).join('/');
  const noteDirRel = noteDirRelRaw === '.' ? '' : noteDirRelRaw;

  // 1. 被删笔记引用的附件
  const deletedRefs = new Set<string>();
  for (const ref of extractAssetRefs(deletedContent)) {
    const rr = refToRootRel(ref, noteDirRel);
    if (rr) deletedRefs.add(rr);
  }
  if (deletedRefs.size === 0) return { removed: [], kept: [] };

  // 2. 同级其他 .md 引用的附件
  const siblingRefs = new Set<string>();
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(noteDirAbs, { withFileTypes: true });
  } catch {
    entries = [];
  }
  await Promise.all(
    entries.map(async (e) => {
      if (!e.isFile() || !isMarkdown(e.name)) return;
      try {
        const content = await fs.readFile(path.join(noteDirAbs, e.name), 'utf8');
        for (const ref of extractAssetRefs(content)) {
          const rr = refToRootRel(ref, noteDirRel);
          if (rr) siblingRefs.add(rr);
        }
      } catch {
        /* 单文件读取失败不影响整体 */
      }
    }),
  );

  // 3. 删除孤儿
  const removed: string[] = [];
  const kept: string[] = [];
  const touchedDirs = new Set<string>();
  for (const rr of deletedRefs) {
    if (siblingRefs.has(rr)) {
      kept.push(rr);
      continue;
    }
    const abs = resolveWithinRoot(rr);
    try {
      await fs.unlink(abs);
      removed.push(rr);
      touchedDirs.add(path.dirname(abs));
    } catch {
      /* 文件可能已不存在 */
    }
  }

  // 4. 尽力清理空的 assets 目录
  for (const dir of touchedDirs) {
    if (path.basename(dir) !== ASSETS_DIR) continue;
    try {
      const left = await fs.readdir(dir);
      if (left.length === 0) await fs.rmdir(dir);
    } catch {
      /* 非空或无权限，忽略 */
    }
  }

  return { removed, kept };
}

/**
 * 一篇 .md 保存后，回收其同级 assets 目录里的孤儿附件：
 * 删除「当前正文 + 同级其他 .md 均未引用」的附件，避免误删共享图片。
 * 用于编辑器中删掉图片块后及时回收对应文件。
 *
 * 性能：先算候选孤儿，若无候选（如纯文字编辑）直接返回、不读同级笔记，
 * 保证常规保存开销极小；只有真有候选时才扫描同级。
 */
export async function cleanupOrphanAssetsForNote(
  noteAbs: string,
  currentContent: string,
): Promise<CleanupResult> {
  const noteRelPath = path.relative(env.rootSpace, noteAbs).split(path.sep).join('/');
  const { absAssetsDir, relAssetsDir } = assetsDirForNote(noteRelPath);
  const noteDirAbs = path.dirname(noteAbs);
  const noteDirRelRaw = path.relative(env.rootSpace, noteDirAbs).split(path.sep).join('/');
  const noteDirRel = noteDirRelRaw === '.' ? '' : noteDirRelRaw;
  const selfName = path.basename(noteAbs);

  // 1. assets 目录里实际存在的附件
  let assetEntries: Dirent[];
  try {
    assetEntries = await fs.readdir(absAssetsDir, { withFileTypes: true });
  } catch {
    return { removed: [], kept: [] }; // 无 assets 目录
  }
  const existing = assetEntries.filter((e) => e.isFile()).map((e) => `${relAssetsDir}/${e.name}`);
  if (existing.length === 0) return { removed: [], kept: [] };

  // 2. 当前正文引用的附件
  const referenced = new Set<string>();
  for (const ref of extractAssetRefs(currentContent)) {
    const rr = refToRootRel(ref, noteDirRel);
    if (rr) referenced.add(rr);
  }

  // 3. 候选孤儿：存在但当前正文未引用。无候选则短路返回（不读同级）。
  if (existing.every((p) => referenced.has(p))) return { removed: [], kept: existing };

  // 4. 同级其他 .md 引用的附件（保护共享图片）——仅在有候选时才读
  const siblingRefs = new Set<string>();
  let siblings: Dirent[] = [];
  try {
    siblings = await fs.readdir(noteDirAbs, { withFileTypes: true });
  } catch {
    siblings = [];
  }
  await Promise.all(
    siblings.map(async (e) => {
      if (!e.isFile() || !isMarkdown(e.name) || e.name === selfName) return;
      try {
        const content = await fs.readFile(path.join(noteDirAbs, e.name), 'utf8');
        for (const ref of extractAssetRefs(content)) {
          const rr = refToRootRel(ref, noteDirRel);
          if (rr) siblingRefs.add(rr);
        }
      } catch {
        /* 单文件读取失败不影响整体 */
      }
    }),
  );

  // 5. 删除既未被当前正文、也未被同级引用的附件
  const removed: string[] = [];
  const kept: string[] = [];
  for (const p of existing) {
    if (referenced.has(p) || siblingRefs.has(p)) {
      kept.push(p);
      continue;
    }
    try {
      await fs.unlink(resolveWithinRoot(p));
      removed.push(p);
    } catch {
      /* 文件可能已不存在 */
    }
  }

  // 6. 尽力清理空的 assets 目录
  try {
    const left = await fs.readdir(absAssetsDir);
    if (left.length === 0) await fs.rmdir(absAssetsDir);
  } catch {
    /* 非空或无权限，忽略 */
  }

  return { removed, kept };
}
