# go-battle

纯前端的围棋对战平台：Vue 3 + Canvas 2D 渲染棋盘，自研完整规则引擎，浏览器里就能下棋、复盘、看实时 AI 分析。本地浏览器就能跑 KataGo（WASM）、规则可自定义、对局中实时看胜率——这三点 OGS 和其他开源围棋 UI 都给不了。

![Version](https://img.shields.io/github/v/release/091022yyj/go-battle)
![License](https://img.shields.io/github/license/091022yyj/go-battle)
![Language](https://img.shields.io/badge/Language-TypeScript-3178C6)
![Platform](https://img.shields.io/badge/Platform-Web-brightgreen)

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| ⚔️ 三种对战模式 | 双人 / 人机 / AI vs AI，一键切换 |
| 📏 完整规则引擎 | 提子、劫、禁着点、数目终局判定，全部自研实现 |
| 🤖 三引擎可选 | Simple AI / KataGo WASM / GTP 桥接外部引擎 |
| 📊 实时 AI 分析 | 对局中实时显示胜率与推荐选点 |
| 💾 SGF 棋谱 | 导入导出棋谱，一键复盘 |
| 🎨 自定义规则 | 贴目、让子、棋盘大小自由配置 |

## 📸 截图

| 棋盘对战 | 实时 AI 分析 | 棋谱复盘 |
|----------|--------------|----------|
| ![棋盘](docs/screenshot-board.png) | ![分析](docs/screenshot-ai.png) | ![复盘](docs/screenshot-sgf.png) |

## 🚀 快速开始

```bash
git clone https://github.com/091022yyj/go-battle.git
cd go-battle
npm install
npm run dev
# 浏览器打开 http://localhost:5173
```

## ❓ FAQ

**Q: KataGo WASM 需要下载模型吗？**
A: 首次使用时自动加载（需联网），之后走浏览器缓存，可离线使用。

**Q: 可以自定义规则吗？**
A: 支持贴目、让子、棋盘大小与禁着点规则调整。

**Q: 怎么接入自己的围棋引擎？**
A: 设置里配置 GTP 引擎路径与参数，即可桥接 KataGo、Leela 等外部引擎。

**Q: 支持手机浏览器吗？**
A: 响应式布局，手机可用；大棋盘（19 路）建议桌面端体验更好。

## 🏷️ 推荐 Topics

`go` `weiqi` `baduk` `katago` `vue3` `typescript` `board-game` `sgf`
