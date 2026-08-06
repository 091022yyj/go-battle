# go-battle 围棋对战平台

Vue 3 + Vite + TS 实现的围棋网页平台：完整规则引擎、双人/人机/AI vs AI、多引擎支持（Simple AI / KataGo WASM / GTP 桥接）、AI 分析、SGF 棋谱。

## 运行

```bash
npm install
npm run dev
```

## 测试

```bash
npm run test
```

## 功能

- **完整规则引擎**: 提子、劫、禁着点、pass、终局判定、中式数子/贴目
- **三种模式**: 双人对弈、人机对战、AI vs AI
- **三种引擎**:
  - 🧠 **Simple AI**: 启发式评分 + 蒙特卡洛模拟（零依赖，1-5 级棋力）
  - 🌐 **KataGo WASM**: 浏览器内运行 KataGo（需放置 WASM 文件，见下方）
  - 🔌 **GTP 桥接**: 连接本地/远程 KataGo 或 Sayuri 引擎（需运行桥接服务）
- **棋盘尺寸**: 9路 / 13路 / 19路
- **分析面板**: 胜率曲线、最佳着法
- **棋谱**: 手数回放（前进/后退/跳转）、SGF 导入导出
- **动画**: 落子缩放、提子淡出、PASS 提示、最后手脉冲标记

## KataGo WASM 配置

1. 下载 KataGo WASM 构建（katago.wasm + katago.js）和模型权重（如 b6c96）
   - 官方仓库: https://github.com/lightvector/KataGo
2. 放置到 `public/kata/` 目录：
   ```
   public/kata/katago.wasm
   public/kata/katago.js
   public/kata/model.bin.gz
   ```
3. 刷新页面，在引擎下拉框选择 "KataGo WASM"

> 文件未放置时会自动提示并回退到 Simple AI。

## GTP 桥接（本地引擎）

### 1. 安装引擎

- **KataGo**: https://github.com/lightvector/KataGo （下载二进制 + 模型）
- **Sayuri**: https://github.com/CGLemon/Sayuri （AlphaZero 风格引擎）

### 2. 启动桥接服务

```bash
# KataGo 示例
node server/bridge.mjs --engine /path/to/katago --args "gtp -model /path/to/model.bin.gz"

# Sayuri 示例
node server/bridge.mjs --engine /path/to/sayuri --args ""
```

默认监听 `localhost:3333`，可用 `--port` 修改。

### 3. 前端连接

在控制栏选择 "GTP 桥接" 引擎，配置主机/端口（默认 `localhost:3333`），选择引擎类型（KataGo/Sayuri），点击「测试连接」验证。

支持**远程主机**：将主机地址改为远程 IP 即可连接其他机器上的引擎。

## 技术栈

Vue 3、Vite、TypeScript、Pinia、Vitest、Canvas 2D、Node.js（桥接）
