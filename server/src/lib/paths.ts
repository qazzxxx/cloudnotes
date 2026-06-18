import path from 'node:path';
import { env } from '../config/env';

/** 业务层文件系统错误：携带 HTTP 状态码，由全局错误中间件转成响应。 */
export class FsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FsError';
  }
}

export const MD_EXT = '.md';
export const ASSETS_DIR = 'assets';

/** 树状结构中需要隐藏的目录/文件名。 */
const HIDDEN_NAMES = new Set<string>(['node_modules', '$RECYCLE.BIN', '.Trash-1000']);

/** 单个文件名中禁止出现的字符（用集合判定，规避正则转义问题）。 */
const FORBIDDEN_NAME_CHARS = new Set('<>:"|?*\\/'.split(''));
for (let c = 0x00; c <= 0x1f; c++) FORBIDDEN_NAME_CHARS.add(String.fromCharCode(c));
FORBIDDEN_NAME_CHARS.add(String.fromCharCode(0x7f)); // DEL

const RESERVED_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * 将用户传入的「相对路径」解析为 ROOT_SPACE 下的绝对路径，并保证结果不会越出根目录。
 * - 统一使用 `/` 作为分隔符；
 * - 拒绝空字节；剥离前导分隔符（避免被当作绝对路径）；
 * - 用 path.resolve 规整后，校验结果以根目录为前缀（词法判定，避免破坏 NAS 的 bind mount / 符号链接布局）。
 */
export function resolveWithinRoot(relPath: string): string {
  if (relPath.includes('\0')) {
    throw new FsError(400, '非法路径：包含空字节');
  }
  const cleaned = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(env.rootSpace, cleaned);
  const root = env.rootSpace;
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new FsError(400, '路径越权：禁止访问根目录之外');
  }
  return abs;
}

/** 校验单个文件/目录名（不含路径分隔符）。返回规整后的名称。 */
export function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new FsError(400, '名称不能为空');
  if (trimmed.length > 200) throw new FsError(400, '名称过长（>200 字符）');
  if (trimmed === '.' || trimmed === '..') throw new FsError(400, '名称不能为 . 或 ..');
  for (const ch of trimmed) {
    if (FORBIDDEN_NAME_CHARS.has(ch)) throw new FsError(400, '名称包含非法字符');
  }
  if (RESERVED_NAMES.test(trimmed)) throw new FsError(400, '名称为系统保留字');
  return trimmed;
}

/** 是否为 Markdown 文件（按扩展名）。 */
export function isMarkdown(name: string): boolean {
  return name.toLowerCase().endsWith(MD_EXT);
}

/** 树状结构中是否应隐藏该条目。 */
export function isHiddenEntry(name: string): boolean {
  return name.startsWith('.') || HIDDEN_NAMES.has(name);
}

/** 相对路径拼接：用 `/` 分隔，根目录下直接用名字。 */
export function joinRel(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}
