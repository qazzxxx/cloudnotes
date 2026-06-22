import { getConfig } from '../lib/store';
import type { ProgressMessage, ResultMessage } from '../lib/types';

const statusEl = document.getElementById('status')!;
const saveBtn = document.getElementById('save') as HTMLButtonElement;
const openOpt = document.getElementById('open-options')!;

// 收到 background 的进度 / 结果
chrome.runtime.onMessage.addListener((msg) => {
  const m = msg as ProgressMessage | ResultMessage | { type?: string };
  if (m.type === 'CN_PROGRESS') {
    setStatus((m as ProgressMessage).text, false);
  } else if (m.type === 'CN_RESULT') {
    const r = m as ResultMessage;
    saveBtn.disabled = false;
    if (r.ok) {
      let msg = `✅ 已保存：${r.notePath}`;
      if (r.total && r.total > 0) {
        const ok = r.total - (r.skipped ?? 0);
        msg += `\n🖼️ 图片 ${ok}/${r.total}${r.skipped ? `（跳过 ${r.skipped} 张）` : ''}`;
      }
      setStatus(msg, true);
    } else {
      setStatus(`❌ ${r.error ?? '保存失败'}`, true);
    }
  }
});

saveBtn.addEventListener('click', async () => {
  const cfg = await getConfig();
  if (!cfg.server) {
    setStatus('请先在「设置」里填写服务器地址', true);
    chrome.runtime.openOptionsPage();
    return;
  }
  saveBtn.disabled = true;
  setStatus('正在处理…', false);
  chrome.runtime.sendMessage({ type: 'CN_SAVE' });
});

openOpt.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

function setStatus(text: string, _done: boolean): void {
  statusEl.textContent = text;
}
