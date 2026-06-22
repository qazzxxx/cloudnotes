# 云简剪藏 · CloudNote Clipper（浏览器扩展）

一键把当前网页的**标题、正文、图片/GIF** 存进你的[云简 CloudNote](../README.md)，转成可继续编辑的 Markdown 笔记（图片进笔记同级 `assets/`）。

## 功能

- 📄 **正文智能提取**：基于 Mozilla Readability（火狐阅读模式同款算法），去掉导航/广告/侧栏，只留正文。
- 🖼️ **图片/GIF 本地化**：正文里的图片逐张下载并上传到你云简的 `assets/`，正文里的链接自动改成笔记相对引用——离线可看、不外链、可编辑。
- 🔗 **保留来源**：笔记开头记录原网页链接、作者、日期。
- 🔐 **复用云简鉴权**：填服务器地址 + 密码即可，token 自动缓存、失效自动重登。
- 📁 **集中存放**：默认存到「网页剪藏」文件夹（可在设置里改），重名自动 `-2/-3`。

## 安装（开发 / 本地加载）

```bash
# 1. 在仓库根目录安装依赖（需 pnpm）
pnpm install

# 2. 构建扩展
pnpm --filter @cloudnote/extension build
# 产物在 extension/dist/
```

然后在浏览器加载：

1. 打开 `chrome://extensions`（或 Edge `edge://extensions`）。
2. 右上角打开「**开发者模式**」。
3. 点「**加载已解压的扩展程序**」，选择 `extension/dist` 目录。
4. 点扩展图标的「设置」，填：
   - **服务器地址**：你的云简地址，如 `http://nas-ip:3130`
   - **密码**：云简登录密码（开放模式留空）
   - **存放文件夹**：默认 `网页剪藏`
   - 点「**测试连接**」确认能通。
5. 打开任意网页 → 点工具栏的云简图标 → 「**保存当前网页到云简**」。

> 开发期可用 `pnpm --filter @cloudnote/extension dev`（HMR，配合 crxjs 自动重载）。

## 工作流程（架构）

```
popup（保存按钮）
   │  CN_SAVE
   ▼
background（service worker）
   │  1) CN_EXTRACT → content script
   │  2) Readability 提取正文 + Turndown 转 Markdown
   │  3) 逐张 fetch 图片 → POST /api/fs/upload（拿 relPath）
   │  4) 替换正文里的图片 URL → assets/xxx
   │  5) PUT /api/fs/file 写入 网页剪藏/{标题}.md
   ▼
云简 CloudNote
```

- **跨域**：图片抓取与 API 调用都在 background（受 `host_permissions: <all_urls>` 保护），不受页面 CORS 限制。
- **存储格式**：与云简现有笔记完全一致——`.md` 正文 + 同级 `assets/` 图片，BlockNote 可直接编辑。
- **失败容错**：单张图片抓取/上传失败只跳过该图（正文位置降级为原链接），不中断整体保存。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存服务器地址/密码/文件夹/token |
| `tabs` | 读取当前标签页、向其注入提取指令 |
| `<all_urls>` (host) | 读取任意网页内容、跨域抓取其图片、调用你配置的云简服务器 |

不收集任何数据，所有交互只发生在你的浏览器与你的云简之间。

## 已知限制

- Readability 对需要登录、纯 SPA 或特殊结构的页面可能提取失败（会提示并存标题+链接）。
- 懒加载图片（`data-src` 等）目前不识别，按 `src` 抓取。
- 扩展图标暂用默认（可后续替换 `manifest.config.ts` 里的 PNG 图标）。
