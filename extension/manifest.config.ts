import { defineManifest } from '@crxjs/vite-plugin';

/**
 * MV3 清单。
 * - content script 声明在 <all_urls> 上，但只注册一个轻量消息监听器，
 *   用户点「保存」时由 background 发 CN_EXTRACT 消息触发 Readability 提取（不在每个页面跑重逻辑）。
 * - host_permissions <all_urls>：读取任意网页、跨域抓图片、调用用户配置的云简服务器（地址运行时配置）。
 */
export default defineManifest({
  manifest_version: 3,
  name: '云简剪藏 · CloudNote Clipper',
  version: '0.1.0',
  description: '一键把当前网页的标题、正文、图片/GIF 存进你的云简 CloudNote。',
  icons: {
    16: 'icons/icon-16.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_title: '保存到云简',
    default_icon: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  options_page: 'src/options/options.html',
  permissions: ['storage', 'tabs', 'scripting', 'declarativeNetRequest'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content.ts'],
      run_at: 'document_idle',
    },
  ],
});
