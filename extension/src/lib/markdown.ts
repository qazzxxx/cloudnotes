/** Markdown 组装：把内容脚本产出的正文（图片为原始 URL）替换为 assets 相对引用，并加标题/来源头。 */

/**
 * 把正文里 `![alt](origUrl)` 的 origUrl 替换为上传后的 relPath（如 assets/img-xxxx.png）。
 * 用 split/join 避免 URL 中的正则特殊字符问题。
 */
export function substituteImages(markdown: string, urlToRel: Map<string, string>): string {
  let out = markdown;
  for (const [orig, rel] of urlToRel) {
    out = out.split(`](${orig})`).join(`](${rel})`);
  }
  return out;
}

/** 组装最终 Markdown：# 标题 + 来源/作者/日期 引用块 + 正文。 */
export function assembleMarkdown(opts: {
  title: string;
  body: string;
  url: string;
  byline?: string;
}): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [`# ${opts.title}`, ''];
  lines.push(`> 来源：[${opts.url}](${opts.url})`);
  if (opts.byline) lines.push(`> 作者：${opts.byline}`);
  lines.push(`> 日期：${date}`, '');
  lines.push(opts.body.trim(), '');
  return lines.join('\n');
}
