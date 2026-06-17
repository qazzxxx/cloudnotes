import { BlockNoteEditor, BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from '@blocknote/core';
import { codeBlockOptions } from '@blocknote/code-block';

/**
 * 全局共享的 BlockNote Schema。
 * 唯一区别于默认 schema 之处：用带 Shiki 高亮的 codeBlockSpec 替换默认 codeBlock，
 * 让代码块支持语法高亮和语言选择器。
 *
 * 注意点：
 * - 新建代码块默认语言为 'text'（不开启高亮），用户在下拉中显式选择语言后立即生效。
 * - 高亮使用 Shiki precompiled 引擎，主题跟随 antd 主题自动切换 light/dark。
 * - 语言列表来自 `codeBlockOptions.supportedLanguages`，覆盖常见 40+ 语言。
 */
export const blockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      ...codeBlockOptions,
      defaultLanguage: 'text',
    }),
  },
});

/** 复用一个无界面编辑器实例（与编辑器同 schema），用于 Markdown↔Blocks 解析。失败则回退为默认 schema。 */
export function createBlockNoteParser(): BlockNoteEditor | null {
  try {
    return BlockNoteEditor.create({ schema: blockNoteSchema });
  } catch {
    return null;
  }
}
