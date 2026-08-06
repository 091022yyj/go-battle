# go-battle 围棋对战平台

Vue 3 + Vite + TS 实现的围棋网页平台：完整规则引擎、双人/人机/AI vs AI、AI 分析、SGF 棋谱。

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
- **自写 AI**: 启发式评分 + 蒙特卡洛模拟，支持 1-5 级棋力
- **棋盘尺寸**: 9路 / 13路 / 19路
- **分析面板**: 胜率曲线、最佳着法
- **棋谱**: 手数回放（前进/后退/跳转）、SGF 导入导出

## 技术栈

Vue 3、Vite、TypeScript、Pinia、Vitest、Canvas 2D
