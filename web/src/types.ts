/** 目录树节点（与后端 TreeNode 对齐）。 */
export interface TreeNode {
  /** 文件/目录名（含扩展名） */
  name: string;
  /** 相对根目录路径，`/` 分隔，前端唯一 key 与 API 入参 */
  path: string;
  type: 'dir' | 'file';
  children?: TreeNode[];
}

/** 单篇 Markdown 文件。 */
export interface NoteFile {
  path: string;
  name: string;
  content: string;
  /** 最后修改时间（epoch 毫秒） */
  mtime: number;
  size: number;
}

/** PUT /file 保存结果：NoteFile + 本次保存回收的孤儿附件（根相对路径）。 */
export interface WriteResult extends NoteFile {
  removedAssets?: string[];
}

export interface HealthInfo {
  status: string;
  service: string;
  authEnabled: boolean;
  rootSpace: string;
  time: string;
}

export interface LoginResult {
  token: string;
  authEnabled: boolean;
}

export interface DeleteResult {
  path: string;
  type: 'dir' | 'file';
  removedAssets?: string[];
  keptAssets?: string[];
}

export type ThemeMode = 'light' | 'dark';

/** 文件树内联新建条目的状态。parent 为 null 表示在根目录创建。 */
export interface CreatingEntry {
  parent: string | null;
  type: 'file' | 'dir';
}
