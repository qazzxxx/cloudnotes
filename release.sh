#!/usr/bin/env bash
#
# release.sh — 一键发布新版本（打 tag 并推送，触发 GitHub Actions 构建/发布 Docker 镜像）。
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
  - 仅打 git tag：发布版本由 tag 决定；package.json 的 version 是开发版本，不参与发布。
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
printf '  将执行:    git tag -a %s && git push origin %s\n' "$NEXT" "$NEXT"
printf '  ↳ 触发 GitHub Actions 构建 multi-arch 镜像 → qazzxxx/cloudnotes\n'

if [ "$ASSUME_YES" -ne 1 ]; then
  printf '%s确认发布？ [y/N] %s' "$B" "$N"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) printf '已取消。\n'; exit 0 ;;
  esac
fi

# ── 执行 ────────────────────────────────────────────────────
step "创建 tag $NEXT …"
git tag -a "$NEXT" -m "Release $NEXT"
step "推送到 origin …"
git push origin "$NEXT"

# ── 收尾 ────────────────────────────────────────────────────
REMOTE_URL="$(git remote get-url origin)"
REPO_SLUG=""
case "$REMOTE_URL" in
  *github.com*) s="${REMOTE_URL#*github.com[:/]}"; s="${s%.git}"; REPO_SLUG="$s" ;;
esac

printf '\n%s✅ 已发布 %s%s\n' "$G" "$NEXT" "$N"
if [ -n "$REPO_SLUG" ]; then
  printf '  Actions:   https://github.com/%s/actions\n' "$REPO_SLUG"
  printf '  Release:   https://github.com/%s/releases/tag/%s\n' "$REPO_SLUG" "$NEXT"
fi
printf '  镜像:      https://hub.docker.com/r/qazzxxx/cloudnotes/tags\n'
