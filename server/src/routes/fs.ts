import { promises as fs } from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../lib/asyncHandler';
import { MAX_ASSET_BYTES, cleanupOrphanAssetsForNote, saveAsset } from '../lib/assets';
import {
  createEntry,
  deleteEntry,
  readNote,
  readTree,
  renameEntry,
  writeNote,
} from '../lib/notes';
import { FsError, isMarkdown, resolveWithinRoot } from '../lib/paths';

export const fsRouter = Router();

/** 取 query 中的 path 字符串（兼容各种 query parser 输出）。 */
function pathQuery(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 附件上传：内存暂存，限制大小。 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ASSET_BYTES },
});

/** GET /api/fs/tree —— 读取整棵笔记树 */
fsRouter.get(
  '/tree',
  asyncHandler(async (_req, res) => {
    const tree = await readTree();
    res.json({ tree });
  }),
);

/** GET /api/fs/file?path= —— 读取单个 .md 文件内容 */
fsRouter.get(
  '/file',
  asyncHandler(async (req, res) => {
    const note = await readNote(pathQuery(req.query.path));
    res.json(note);
  }),
);

/** PUT /api/fs/file?path= —— 覆盖写入（不存在则创建） */
fsRouter.put(
  '/file',
  asyncHandler(async (req, res) => {
    const { content } = (req.body ?? {}) as { content?: unknown };
    if (typeof content !== 'string') {
      throw new FsError(400, '请求体缺少 content 字符串');
    }
    const relPath = pathQuery(req.query.path);
    const note = await writeNote(relPath, content);
    // 保存后回收孤儿附件：编辑器里删掉图片块 → 该附件不再被引用 → 及时删除。
    // 清理失败不应影响保存结果，吞掉异常。
    let removedAssets: string[] = [];
    try {
      const cleanup = await cleanupOrphanAssetsForNote(resolveWithinRoot(relPath), content);
      removedAssets = cleanup.removed;
    } catch {
      /* 清理失败不影响保存 */
    }
    res.json({ ...note, removedAssets });
  }),
);

interface CreateBody {
  path?: unknown;
  type?: unknown;
  content?: unknown;
}

/** POST /api/fs/create —— 新建文件或目录 */
fsRouter.post(
  '/create',
  asyncHandler(async (req, res) => {
    const { path: relPath, type, content } = (req.body ?? {}) as CreateBody;
    if (typeof relPath !== 'string') throw new FsError(400, '缺少 path');
    if (type !== 'file' && type !== 'dir') throw new FsError(400, 'type 必须为 file 或 dir');
    const node = await createEntry(
      relPath,
      type,
      typeof content === 'string' ? content : '',
    );
    res.status(201).json(node);
  }),
);

interface RenameBody {
  from?: unknown;
  to?: unknown;
}

/** POST /api/fs/rename —— 重命名 / 移动 */
fsRouter.post(
  '/rename',
  asyncHandler(async (req, res) => {
    const { from, to } = (req.body ?? {}) as RenameBody;
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw new FsError(400, '缺少 from 或 to');
    }
    const result = await renameEntry(from, to);
    res.json(result);
  }),
);

/** DELETE /api/fs/delete?path= —— 删除文件或目录（目录递归） */
fsRouter.delete(
  '/delete',
  asyncHandler(async (req, res) => {
    const result = await deleteEntry(pathQuery(req.query.path));
    res.json(result);
  }),
);

/**
 * POST /api/fs/upload?path=<笔记相对路径>  (multipart: 字段名 file)
 * 上传图片/附件到该笔记同级的 assets 目录，返回可嵌入 Markdown 的相对路径。
 */
fsRouter.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const notePath = pathQuery(req.query.path);
    if (!notePath) throw new FsError(400, '缺少 path（笔记相对路径）');
    const file = req.file;
    if (!file) throw new FsError(400, '缺少上传文件（字段名 file）');
    const result = await saveAsset(notePath, file.originalname, file.buffer);
    res.status(201).json(result);
  }),
);

/**
 * GET /api/fs/asset?path=<根相对路径>[&token=...]
 * 提供图片/附件二进制（用于 <img src>）。仅放行非 .md 文件。
 */
fsRouter.get(
  '/asset',
  asyncHandler(async (req, res) => {
    const relPath = pathQuery(req.query.path);
    if (!relPath) throw new FsError(400, '缺少 path');
    const abs = resolveWithinRoot(relPath);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      throw new FsError(404, '附件不存在');
    }
    if (!stat.isFile()) throw new FsError(400, '目标不是文件');
    if (isMarkdown(abs)) throw new FsError(403, '请通过 /api/fs/file 读取 Markdown');
    // sendFile 自动按扩展名设置 Content-Type
    res.sendFile(abs);
  }),
);
