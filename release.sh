#!/usr/bin/env bash
#
# release.sh — 一键发布新版本：
#   bump 版本 → 打 tag 推送（触发 GitHub Actions 构建多架构 Docker 镜像）
#   → 构建并打包浏览器插件 zip → 创建 GitHub Release（说明自动取「上次 tag 以来的提交记录」+ 附带 zip）。
#
set -euo pipefail

# 切到仓库根目录，保证无论从哪执行都一致
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "❌ 不在 git 仓库内" >&2; exit 1; }

KIND="patch"
ASSUME_YES=0

usage() {
  cat <<'EOF'
用法:
  ./release.sh [patch|minor|major] [-y|--yes]

  patch  升级最后一位（默认）：v0.0.4 → v0.0.5
  minor  升级次版本：         v0.0.4 → v0.1.0
  major  升级主版本：         v0.0.4 → v1.0.0
  -y     跳过确认提示

说明:
  - 发布版本由 tag 决定；各 package.json 与扩展 manifest 的 version 会自动同步到新版本号。
  - GitHub Release 的说明自动取「上次 tag 以来的 git 提交记录」，无需手动维护 changelog。
  - 要求已跟踪文件工作区干净（避免把未提交的中间状态发布出去）；未跟踪文件不影响。
  - 也可用 pnpm 调用：pnpm release / pnpm release minor / pnpm release -- -y
EOF
}

for arg in "$@"; do
  case "$arg" in
    patch|minor|major) KIND="$arg" ;;
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "❌ 未知参数: ${arg}（可用: patch | minor | major | -y | -h）" >&2; exit 1 ;;
  esac
done

# 终端着色（非 TTY 时自动失效）
if [ -t 1 ]; then
  B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
else
  B=''; G=''; Y=''; R=''; N=''
fi
die()  { printf '%s❌ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }
warn() { printf '%s⚠️  %s%s\n' "$Y" "$*" "$N" >&2; }
step() { printf '%s▸ %s%s\n' "$B" "$*" "$N"; }

# 把各 package.json + 扩展 manifest 的 version 统一为指定版本（不带 v 前缀）。
# - package.json 用 node 改（保留 2 空格缩进与键序，仅 version 行变化）。
# - manifest.config.ts 用 sed 只改 `version: '...'`，不动 `manifest_version: 3`。
bump_versions() {
  local ver="$1" f
  for f in package.json web/package.json server/package.json extension/package.json; do
    [ -f "$f" ] || continue
    PKG_FILE="$f" PKG_VER="$ver" node -e '
      const fs = require("fs");
      const p = process.env.PKG_FILE;
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      j.version = process.env.PKG_VER;
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
    '
  done
  if [ -f extension/manifest.config.ts ]; then
    sed -i.bak -E "s/^([[:space:]]*version:[[:space:]])'[^']*'/\1'$ver'/" extension/manifest.config.ts
    rm -f extension/manifest.config.ts.bak
  fi
}

# ── 前置检查 ────────────────────────────────────────────────
git remote get-url origin >/dev/null 2>&1 || die "未配置 origin 远程，无法推送 tag"

if ! git diff-index --quiet HEAD --; then
  git status --short --untracked-files=no
  die "已跟踪文件有未提交改动，请先 commit / stash 再发布。"
fi

step "同步远程 tag…"
git fetch --tags --quiet origin

# ── 计算下一个版本 ──────────────────────────────────────────
# 取最新的严格 vX.Y.Z tag，按版本号倒序（取版本最高者，而非提交可达性）
LATEST="$(git tag --list 'v[0-9]*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)" || true

if [ -z "$LATEST" ]; then
  M=0; MN=0; P=0; LATEST="(无历史 tag)"
else
  cur="${LATEST#v}"
  M="${cur%%.*}"; rest="${cur#*.}"
  MN="${rest%%.*}"; P="${rest#*.}"
  P="${P%%-*}" # 去掉可能的预发布后缀
fi

case "$KIND" in
  patch) NM=$M;        NMN=$MN;       NP=$((P+1)) ;;
  minor) NM=$M;        NMN=$((MN+1)); NP=0 ;;
  major) NM=$((M+1));  NMN=0;         NP=0 ;;
esac
NEXT="v${NM}.${NMN}.${NP}"

git rev-parse "$NEXT" >/dev/null 2>&1 && die "目标 tag $NEXT 已存在，请确认远程最新 tag 后重试。"

# 当前分支落后远程时提示（非致命）
if UP="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
  if BEHIND="$(git rev-list --count HEAD.."$UP" 2>/dev/null)" && [ "${BEHIND:-0}" -gt 0 ]; then
    warn "当前分支落后 $UP 共 $BEHIND 个提交；将发布本地 HEAD（推 tag 时会一并推送到远程）。"
  fi
fi

# ── 确认 ────────────────────────────────────────────────────
HEAD_SHORT="$(git rev-parse --short HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
printf '%s\n' "${B}即将发布：${N}"
printf '  当前版本:  %s\n' "$LATEST"
printf '  下一版本:  %s%s%s   (%s)\n' "$G" "$NEXT" "$N" "$KIND"
printf '  目标提交:  %s @ %s\n' "$HEAD_SHORT" "$BRANCH"
printf '  将执行:    统一 package 版本 → 提交 → git tag -a %s → push\n' "$NEXT"
printf '  然后:      构建浏览器插件 zip + 创建 GitHub Release（说明取自提交记录）\n'
printf '  ↳ 触发 GitHub Actions 构建 multi-arch 镜像 → qazzxxx/cloudnotes\n'

if [ "$ASSUME_YES" -ne 1 ]; then
  printf '%s确认发布？ [y/N] %s' "$B" "$N"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) printf '已取消。\n'; exit 0 ;;
  esac
fi

# ── 执行：统一版本 → 提交 → 打 tag → 推送（触发 Docker 镜像构建）──
VER="${NEXT#v}"
step "统一各 package 版本为 $VER …"
bump_versions "$VER"

# 版本号有变则单独提一个 release commit，让 tag 指向「已带新版本号」的提交
if ! git diff --quiet -- package.json web/package.json server/package.json extension/package.json extension/manifest.config.ts 2>/dev/null; then
  git add package.json web/package.json server/package.json extension/package.json extension/manifest.config.ts
  git commit -m "chore(release): $NEXT" >/dev/null
  step "已提交版本号变更（chore(release): ${NEXT}）"
fi

step "创建 tag $NEXT …"
git tag -a "$NEXT" -m "Release $NEXT"
step "推送到 origin …"
git push origin "$BRANCH" 2>/dev/null || warn "分支推送失败（tag 仍会推送；可稍后手动 git push）"
git push origin "$NEXT"

# 解析仓库 slug（用于构造链接、Release）
REMOTE_URL="$(git remote get-url origin)"
REPO_SLUG=""
case "$REMOTE_URL" in
  *github.com*) s="${REMOTE_URL#*github.com[:/]}"; s="${s%.git}"; REPO_SLUG="$s" ;;
esac

# ── 构建 + 打包浏览器插件 zip ───────────────────────────────
ZIP=""
if [ -f extension/package.json ]; then
  step "构建浏览器插件…"
  if pnpm --filter @cloudnote/extension build >/tmp/cn-ext-build.log 2>&1; then
    ZIP="release/cloudnote-clipper-${NEXT}.zip"
    mkdir -p release
    rm -f "$ZIP"
    ( cd extension/dist && zip -qr "../../$ZIP" . )
    step "已打包插件：$ZIP"
  else
    warn "浏览器插件构建失败，本次发布不带插件 zip（日志：/tmp/cn-ext-build.log）"
    tail -n 20 /tmp/cn-ext-build.log >&2 2>/dev/null || true
  fi
fi

# ── 创建 GitHub Release（说明 = 插件下载指引 + 上次 tag 以来的提交记录；仅附带插件 zip）──
# 说明顶部明确告诉用户「下载下面的 zip = 浏览器插件」「服务端用 Docker，无需源码包」；
# 更新内容用 git log 自动生成（自上个 tag 的提交），无需维护 changelog。
if [ -n "$LATEST" ] && git rev-parse "$LATEST" >/dev/null 2>&1; then
  RANGE="${LATEST}..HEAD"
  SINCE_LABEL="$LATEST"
else
  RANGE=""
  SINCE_LABEL="初始版本"
fi
if [ -n "$RANGE" ]; then
  UPDATES="$(git log "$RANGE" --no-merges --pretty=format:"- %s" 2>/dev/null | grep -vE '^- (chore\(release\): v|Release v)' || true)"
else
  UPDATES="$(git log --no-merges -50 --pretty=format:"- %s" 2>/dev/null || true)"
fi

NOTES_FILE="$(mktemp 2>/dev/null || mktemp -t cnrelease)"
{
  cat <<EOF
🧩 **浏览器插件**：下载本页下方的 **cloudnote-clipper-${NEXT}.zip**，解压后在 Chrome/Edge 开启「开发者模式」→「加载已解压的扩展程序」加载即可（详见 README）。

> 服务端用 Docker 部署（\`docker compose up -d\`），无需下载下方的 Source code 源码包。

---

EOF
  if [ -n "$UPDATES" ]; then
    printf '📝 **更新内容**：\n\n' "$SINCE_LABEL"
    printf '%s\n' "$UPDATES"
  fi
} > "$NOTES_FILE"
if command -v gh >/dev/null 2>&1; then
  step "创建 GitHub Release（仅附带浏览器插件 zip）…"
  args=(gh release create "$NEXT" --title "$NEXT" --notes-file "$NOTES_FILE")
  [ -n "$ZIP" ] && [ -f "$ZIP" ] && args+=("$ZIP")
  if ! "${args[@]}"; then
    warn "gh release create 失败（tag 已推送，Docker 镜像仍会构建；可稍后手动创建 Release）"
  fi
else
  warn "未安装 gh CLI，跳过 GitHub Release 创建。${ZIP:+插件 zip 已生成：${ZIP}（可手动上传到 Release）}"
fi
rm -f "$NOTES_FILE"

# ── 收尾 ────────────────────────────────────────────────────
printf '\n%s✅ 已发布 %s%s\n' "$G" "$NEXT" "$N"
if [ -n "$REPO_SLUG" ]; then
  printf '  Actions:   https://github.com/%s/actions\n' "$REPO_SLUG"
  printf '  Release:   https://github.com/%s/releases/tag/%s（含插件 zip）\n' "$REPO_SLUG" "$NEXT"
fi
printf '  镜像:      https://hub.docker.com/r/qazzxxx/cloudnotes/tags\n'
