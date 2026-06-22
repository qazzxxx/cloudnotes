import { login } from '../lib/api';
import { getConfig, setConfig } from '../lib/store';

const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
const statusEl = document.getElementById('status')!;

// 初始化：读已有配置回填
void (async () => {
  const cfg = await getConfig();
  $('server').value = cfg.server;
  $('password').value = cfg.password;
  $('folder').value = cfg.folder;
  $('autoScroll').checked = cfg.autoScroll;
  $('autoScrollSec').value = String(Math.round(cfg.autoScrollMaxMs / 1000));
})();

document.getElementById('save')!.addEventListener('click', async () => {
  await setConfig(currentFormValues());
  setStatus('已保存', 'ok');
});

document.getElementById('test')!.addEventListener('click', async () => {
  const vals = currentFormValues();
  if (!vals.server) {
    setStatus('请先填写服务器地址', 'err');
    return;
  }
  setStatus('测试中…', '');
  try {
    await setConfig(vals); // 先存当前值，再尝试登录
    await login(vals.server, vals.password);
    setStatus('✅ 连接成功', 'ok');
  } catch (e) {
    setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`, 'err');
  }
});

function currentFormValues() {
  const sec = Number($('autoScrollSec').value) || 8;
  return {
    server: $('server').value,
    password: $('password').value,
    folder: $('folder').value,
    autoScroll: $('autoScroll').checked,
    autoScrollMaxMs: Math.max(0, Math.min(120, sec)) * 1000,
  };
}

function setStatus(text: string, kind: '' | 'ok' | 'err'): void {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ` ${kind}` : '');
}
