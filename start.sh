#!/usr/bin/env bash
# ============================================================
# go-battle 围棋对战平台 一键启动
# 同时启动：Vite 前端 + KataGo GTP 桥接，并自动打开浏览器
#
# 用法:  ./start.sh
# 退出:  Ctrl+C 同时关闭两个服务
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

KATAGO_BIN="${KATAGO_BIN:-$HOME/katago/v1.15.3/katago}"
KATAGO_MODEL="${KATAGO_MODEL:-$HOME/katago/model.bin.gz}"
KATAGO_CFG="${KATAGO_CFG:-$HOME/katago/gtp_fast.cfg}"
BRIDGE_PORT=3333
VITE_PORT=5173

# ---------- 颜色 ----------
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[start]${NC} $1"; }
ok()    { echo -e "${GREEN}[start]${NC} $1"; }
warn()  { echo -e "${YELLOW}[start]${NC} $1"; }
err()   { echo -e "${RED}[start]${NC} $1"; }

port_in_use() { ss -tln 2>/dev/null | grep -q ":$1 "; }

# ---------- 检查引擎文件 ----------
if [ ! -x "$KATAGO_BIN" ]; then
  err "未找到 KataGo 引擎: $KATAGO_BIN"
  err "请设置环境变量 KATAGO_BIN 指向引擎路径，或先完成引擎安装。"
  exit 1
fi
if [ ! -f "$KATAGO_MODEL" ]; then
  err "未找到模型文件: $KATAGO_MODEL"
  err "请设置环境变量 KATAGO_MODEL，或先下载模型权重。"
  exit 1
fi

# ---------- 检查端口 ----------
if port_in_use $BRIDGE_PORT; then
  warn "端口 $BRIDGE_PORT 已被占用（可能桥接已在运行），跳过启动引擎。"
  BRIDGE_ALREADY=true
fi
if port_in_use $VITE_PORT; then
  warn "端口 $VITE_PORT 已被占用（可能前端已在运行），跳过启动前端。"
  VITE_ALREADY=true
fi

# ---------- 启动桥接 ----------
BRIDGE_PID=""
if [ "$BRIDGE_ALREADY" != "true" ]; then
  info "启动 GTP 桥接（KataGo 智子引擎）..."
  node "$SCRIPT_DIR/server/bridge.mjs" \
    --engine "$KATAGO_BIN" \
    --args "gtp -model $KATAGO_MODEL -config $KATAGO_CFG" \
    --port $BRIDGE_PORT \
    > /tmp/go-battle-bridge.log 2>&1 &
  BRIDGE_PID=$!
  ok "桥接进程 PID: $BRIDGE_PID（日志: /tmp/go-battle-bridge.log）"
fi

# ---------- 启动前端 ----------
VITE_PID=""
if [ "$VITE_ALREADY" != "true" ]; then
  info "启动 Vite 前端..."
  (cd "$SCRIPT_DIR" && exec npm run dev > /tmp/go-battle-vite.log 2>&1) &
  VITE_PID=$!
  ok "前端进程 PID: $VITE_PID（日志: /tmp/go-battle-vite.log）"
fi

# ---------- 等待桥接就绪（引擎预热需 1 分钟左右）----------
if [ "$BRIDGE_ALREADY" != "true" ]; then
  info "等待引擎就绪（首次启动含 GPU 初始化 + kernel 预热，约 40-90 秒）..."
  for i in $(seq 1 60); do
    if grep -q "Warmup complete" /tmp/go-battle-bridge.log 2>/dev/null; then
      ok "引擎就绪（耗时约 $((i * 2)) 秒）"
      break
    fi
    if ! kill -0 $BRIDGE_PID 2>/dev/null; then
      err "桥接进程异常退出！日志:"
      tail -20 /tmp/go-battle-bridge.log
      exit 1
    fi
    sleep 2
  done
  if ! grep -q "Warmup complete" /tmp/go-battle-bridge.log 2>/dev/null; then
    warn "等待超时，引擎可能仍在预热，可继续等待或查看日志。"
  fi
fi

# ---------- 等待前端就绪 ----------
if [ "$VITE_ALREADY" != "true" ]; then
  for i in $(seq 1 30); do
    if curl -s --max-time 1 -o /dev/null "http://localhost:$VITE_PORT" 2>/dev/null; then
      break
    fi
    if ! kill -0 $VITE_PID 2>/dev/null; then
      err "前端进程异常退出！日志:"
      tail -20 /tmp/go-battle-vite.log
      exit 1
    fi
    sleep 1
  done
fi

# ---------- 打开浏览器 ----------
URL="http://localhost:$VITE_PORT"
ok "=========================================="
ok "  围棋对战平台已就绪:  $URL"
ok "  模式: 人机对战 / AI vs AI"
ok "  引擎: GTP 桥接 (KataGo 智子 b40c768)"
ok "  操作: Ctrl+C 关闭全部服务"
warn "  若页面异常（AI 不落子/白屏），请强制刷新: Ctrl+Shift+R"
ok "=========================================="

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v sensible-browser >/dev/null 2>&1; then
  sensible-browser "$URL" >/dev/null 2>&1 &
fi

# ---------- 优雅退出 ----------
cleanup() {
  echo ""
  info "正在关闭服务..."
  [ -n "$VITE_PID" ] && kill $VITE_PID 2>/dev/null
  [ -n "$BRIDGE_PID" ] && kill $BRIDGE_PID 2>/dev/null
  ok "已全部关闭。再见！"
  exit 0
}
trap cleanup INT TERM

# 保持前台运行，显示桥接日志
if [ -n "$BRIDGE_PID" ]; then
  tail -f /tmp/go-battle-bridge.log &
  TAIL_PID=$!
  wait $BRIDGE_PID
  kill $TAIL_PID 2>/dev/null
else
  while true; do sleep 60; done
fi
