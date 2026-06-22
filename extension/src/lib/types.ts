/** 内容脚本提取结果（图片在 markdown 里仍是原始 URL，由 background 上传后替换）。 */
export interface ArticleData {
  title: string;
  markdown: string;
  imageUrls: string[];
  url: string;
  byline: string;
}

export type ExtractResponse =
  | { ok: true; data: ArticleData }
  | { ok: false; error: string };

/** popup → background：触发保存当前页 */
export type SaveMessage = { type: 'CN_SAVE' };

/** background → popup：进度 */
export interface ProgressMessage {
  type: 'CN_PROGRESS';
  text: string;
}

/** background → popup：最终结果 */
export interface ResultMessage {
  type: 'CN_RESULT';
  ok: boolean;
  notePath?: string;
  error?: string;
}
