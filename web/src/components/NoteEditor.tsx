import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockNoteEditor } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { App, Input, Spin, Typography, type InputRef } from 'antd';
import { api, getToken } from '../api';
import { useNotes } from '../context/NotesContext';
import { useTheme } from '../context/ThemeContext';
import { blockNoteZhCN } from '../lib/blockNoteDict';
import {
  displayUrlToRef,
  noteDirOf,
  noteTitleOf,
  refToDisplayUrl,
  transformBlockUrls,
} from '../lib/markdownUrls';
import { useDebouncedCallback } from '../lib/useDebouncedCallback';

type SaveState = 'saved' | 'saving' | 'error';
type Blocks = ReturnType<BlockNoteEditor['tryParseMarkdownToBlocks']>;

/**
 * 笔记编辑器（外层）：负责加载 Markdown、解析为 blocks、做图片引用转换，
 * 解析完成后再挂载内层编辑器（确保 initialContent 正确）。
 */
export function NoteEditor({ notePath }: { notePath: string }) {
  const { message } = App.useApp();
  const parser = useParser();
  const noteDir = noteDirOf(notePath);

  const [state, setState] = useState<{ loading: boolean; blocks: Blocks | null; error?: string }>({
    loading: true,
    blocks: null,
  });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, blocks: null });
    (async () => {
      try {
        const note = await api.readFile(notePath);
        if (!alive) return;
        const parsed = parser
          ? parser.tryParseMarkdownToBlocks(note.content)
          : ([{ type: 'paragraph', content: [{ type: 'text', text: note.content }] }] as Blocks);
        setState({
          loading: false,
          blocks: transformBlockUrls(parsed, (u) => refToDisplayUrl(u, noteDir)),
        });
      } catch (e) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : '加载笔记失败';
        message.error(msg);
        setState({ loading: false, blocks: null, error: msg });
      }
    })();
    return () => {
      alive = false;
    };
  }, [notePath, noteDir, parser, message]);

  if (state.loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin />
      </div>
    );
  }
  if (state.error || !state.blocks) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <Typography.Text type="danger">{state.error ?? '无法加载该笔记'}</Typography.Text>
      </div>
    );
  }

  return <NoteEditorInner key={notePath} notePath={notePath} initialBlocks={state.blocks} />;
}

/** 内层：仅在 blocks 就绪后挂载，useCreateBlockNote 的 initialContent 一次性生效。 */
function NoteEditorInner({
  notePath,
  initialBlocks,
}: {
  notePath: string;
  initialBlocks: Blocks;
}) {
  const { message } = App.useApp();
  const { mode } = useTheme();
  const { refresh, rename } = useNotes();
  const noteDir = noteDirOf(notePath);

  const [status, setStatus] = useState<SaveState>('saved');
  const lastSavedMd = useRef('');
  const editorRef = useRef<ReturnType<typeof useCreateBlockNote> | null>(null);

  // 序列化（display URL → 笔记相对引用）并写入纯 Markdown
  const doSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const md = editor.blocksToMarkdownLossy(
      transformBlockUrls(editor.document, (u) => displayUrlToRef(u, noteDir)),
    );
    if (md === lastSavedMd.current) {
      setStatus('saved');
      return;
    }
    setStatus('saving');
    try {
      await api.writeFile(notePath, md);
      lastSavedMd.current = md;
      setStatus('saved');
    } catch (e) {
      setStatus('error');
      message.error(e instanceof Error ? e.message : '保存失败');
    }
  }, [notePath, noteDir, message]);

  const debounced = useDebouncedCallback(doSave, 800);

  const editor = useCreateBlockNote({
    initialContent: initialBlocks,
    dictionary: blockNoteZhCN,
    uploadFile: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(api.uploadUrl(notePath), {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!res.ok) {
        let msg = '上传失败';
        try {
          msg = ((await res.json()) as { error?: string }).error ?? msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as { fullPath: string };
      // 返回可渲染 URL；保存时会自动转回 assets/xxx 相对引用，token 不落盘
      return api.assetUrl(data.fullPath);
    },
  });
  editorRef.current = editor;
  lastSavedMd.current = editor.blocksToMarkdownLossy(
    transformBlockUrls(initialBlocks, (u) => displayUrlToRef(u, noteDir)),
  );

  // 卸载 / 切换笔记前落盘未保存内容
  useEffect(() => {
    return () => debounced.flush();
  }, [debounced]);

  // 切换笔记后刷新文件树（mtime / 顺序可能变化）
  useEffect(() => {
    return () => {
      void refresh();
    };
  }, [refresh]);

  const onChange = () => {
    setStatus('saving');
    debounced.schedule();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-black/5 px-6 dark:border-white/10">
        <EditableTitle notePath={notePath} onRename={rename} />
        <SaveBadge state={status} />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-8">
          <BlockNoteView editor={editor} theme={mode} onChange={onChange} className="cn-editor" />
        </div>
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const map = {
    saved: { text: '已保存', dot: 'bg-emerald-500', color: 'text-gray-400' },
    saving: { text: '保存中…', dot: 'bg-amber-400 animate-pulse', color: 'text-amber-500' },
    error: { text: '保存失败', dot: 'bg-red-500', color: 'text-red-500' },
  }[state];
  return (
    <span className={`flex items-center gap-1.5 text-xs ${map.color}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${map.dot}`} />
      {map.text}
    </span>
  );
}

/** 复用一个无界面编辑器实例（与编辑器同 schema），用于 Markdown↔Blocks 解析。失败则回退为纯文本块。 */
function useParser() {
  return useState<BlockNoteEditor | null>(() => {
    try {
      return BlockNoteEditor.create();
    } catch {
      return null;
    }
  })[0];
}

/**
 * 顶部标题：一个常驻的无边框输入框。
 * - Enter / 失焦提交重命名（自动补 .md）；
 * - Esc 取消并回滚到当前标题；
 * - 切换笔记时输入框值跟随更新。
 */
function EditableTitle({
  notePath,
  onRename,
}: {
  notePath: string;
  onRename: (from: string, to: string) => Promise<void>;
}) {
  const { message } = App.useApp();
  const [value, setValue] = useState(noteTitleOf(notePath));
  const inputRef = useRef<InputRef>(null);
  const committed = useRef(false);

  // 切换笔记时同步显示
  useEffect(() => {
    setValue(noteTitleOf(notePath));
  }, [notePath]);

  const commit = async () => {
    if (committed.current) return;
    const next = value.trim();
    if (!next || next === noteTitleOf(notePath)) {
      setValue(noteTitleOf(notePath));
      return;
    }
    committed.current = true;
    const fileName = next.endsWith('.md') ? next : `${next}.md`;
    const lastSlash = notePath.lastIndexOf('/');
    const parent = lastSlash === -1 ? '' : notePath.slice(0, lastSlash);
    const to = parent ? `${parent}/${fileName}` : fileName;
    try {
      await onRename(notePath, to);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '重命名失败');
      setValue(noteTitleOf(notePath));
    } finally {
      queueMicrotask(() => {
        committed.current = false;
      });
    }
  };

  return (
    <Input
      ref={inputRef}
      variant="borderless"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onPressEnter={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setValue(noteTitleOf(notePath));
          inputRef.current?.blur();
        }
      }}
      onBlur={() => void commit()}
      className="cn-title-input !min-w-0 flex-1 !px-0"
    />
  );
}
