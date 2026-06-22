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
})();

document.getElementById('save')!.addEventListener('click', async () => {
  await setConfig({
    server: $('server').value,
    password: $('password').value,
    folder: $('folder').value,
  });
  setStatus('已保存', 'ok');
});

document.getElementById('test')!.addEventListener('click', async () => {
  const server = $('server').value.trim();
  const password = $('password').value;
  if (!server) {
    setStatus('请先填写服务器地址', 'err');
    return;
  }
  setStatus('测试中…', '');
  try {
    // 先把当前值存下来，再尝试登录
    await setConfig({ server, password, folder: $('folder').value });
    await login(server, password);
    setStatus('✅ 连接成功', 'ok');
  } catch (e) {
    setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`, 'err');
  }
});

function setStatus(text: string, kind: '' | 'ok' | 'err'): void {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ` ${kind}` : '');
}
