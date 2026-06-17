# 云简 · CloudNote

> 纯文件系统驱动的轻量级 Markdown 笔记 / 文档管理系统。专为 NAS 极客与开发者设计。

- **零数据库**：不依赖 MySQL / SQLite，所有数据以纯 `.md` 文本与原始目录层级直接落盘。
- **100% 数据主权**：笔记就是你硬盘上的普通文件，任意同步盘 / `rsync` / Git 即可备份。
- **本地优先 (Local-first)**：私人部署，极简 JWT 鉴权。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 语言 | TypeScript (全栈) |
| 后端 | Node.js + Express |
| 前端 | React + Ant Design + Tailwind CSS |
| 编辑器 | BlockNote |
| 构建 | Vite (前端) · tsc (后端) |
| 部署 | Docker · docker-compose |

## 目录结构

```
cloudnote/
├── server/            # @cloudnote/server — Express API + 文件系统操作
├── web/               # @cloudnote/web    — Vite + React 前端
├── pnpm-workspace.yaml
├── docker-compose.yml
└── Dockerfile         # 多阶段构建：编译前端 → 单容器提供静态资源 + API
```

## 快速开始 (开发)

```bash
# 1. 安装依赖
pnpm install

# 2. 准备环境变量
cp .env.example .env        # 按需修改，尤其 ROOT_SPACE / NAS_PASSWORD

# 3. 同时启动前后端 (Vite 5173 + Express 3130)
pnpm dev
```

## 快速开始 (Docker)

```bash
cp .env.example .env
docker compose up -d --build
# 访问 http://<NAS-IP>:3130
```

## 开发执行进度

- [x] **Step 1** — 项目初始化 (Monorepo / TS / ESLint / Docker / 鉴权环境变量)
- [x] **Step 2** — 后端核心 API (目录树 / 读 / 写 / 增删改)
- [x] **Step 3** — 附件处理机制 (assets / 智能清理)
- [x] **Step 4** — 前端骨架与自定义文件树
- [x] **Step 5** — BlockNote 集成与自动保存
- [ ] **Step 6** — UI 打磨与安全完善（登录页、空状态、代码高亮等）
