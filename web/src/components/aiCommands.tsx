import type { FC } from 'react';
import type { BlockNoteEditor } from '@blocknote/core';
import { AIMenu, type AIMenuSuggestionItem, getDefaultAIMenuItems } from '@blocknote/xl-ai';
import { RiQuillPenLine, RiFileList3Line, RiMagicLine, RiCheckLine } from 'react-icons/ri';

/** AI 菜单状态：来自 AIMenu items 回调的第二个参数。 */
type AIStatus = 'user-input' | 'thinking' | 'ai-writing' | 'error' | 'user-reviewing' | 'closed';

// 注：0.51.4 的命令通过 onItemClick(setPrompt) 填入提示词，由 AI 菜单统一提交执行，
// 无需手动调用 invokeAI（那是更新版本的 API）。

/** 续写：在当前内容后追加（无需选区）。 */
const continueWriting = (): AIMenuSuggestionItem => ({
  key: 'cn_continue',
  title: '续写',
  aliases: ['续写', 'continue', '扩写', '接着写'],
  icon: <RiQuillPenLine size={18} />,
  onItemClick: (setPrompt) => setPrompt('顺着当前内容的语气与主题，继续往下写几段'),
  size: 'small',
});

/** 总结：把选区（或全文）浓缩成要点。 */
const summarize = (): AIMenuSuggestionItem => ({
  key: 'cn_summarize',
  title: '总结',
  aliases: ['总结', 'summarize', '摘要', '归纳'],
  icon: <RiFileList3Line size={18} />,
  onItemClick: (setPrompt) => setPrompt('把给定内容总结成简洁的要点列表，用中文'),
  size: 'small',
});

/** 润色：改写选中文本，更流畅地道，保持原意。 */
const polishText = (): AIMenuSuggestionItem => ({
  key: 'cn_polish',
  title: '润色',
  aliases: ['润色', 'polish', '改写', '优化'],
  icon: <RiMagicLine size={18} />,
  onItemClick: (setPrompt) => setPrompt('润色选中文本，使其更通顺、地道，严格保持原意'),
  size: 'small',
});

/** 纠错：修正选中文本里的错别字与标点、语法问题。 */
const correctTypos = (): AIMenuSuggestionItem => ({
  key: 'cn_correct',
  title: '纠错',
  aliases: ['纠错', '校对', '错别字', 'correct', 'proofread'],
  icon: <RiCheckLine size={18} />,
  onItemClick: (setPrompt) => setPrompt('修正选中文本中的错别字、标点与明显语法错误，保持原意'),
  size: 'small',
});

/**
 * 云简自定义 AI 菜单：在默认命令基础上，按「有无选区」补充中文命令。
 * - 有选区（格式工具栏打开）：润色 / 纠错 / 总结
 * - 无选区（/ai 斜杠打开）：续写 / 总结
 */
export const CloudNoteAIMenu: FC = () => {
  const items = (editor: BlockNoteEditor, status: AIStatus): AIMenuSuggestionItem[] => {
    if (status !== 'user-input') {
      return getDefaultAIMenuItems(editor, status);
    }
    const hasSelection = editor.getSelection() != null;
    const extra = hasSelection
      ? [polishText(), correctTypos(), summarize()]
      : [continueWriting(), summarize()];
    return [...getDefaultAIMenuItems(editor, status), ...extra];
  };
  return <AIMenu items={items} />;
};
