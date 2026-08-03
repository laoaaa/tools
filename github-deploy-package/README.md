# 校对王 Agent Demo

这是一个面向技术评审的中文书稿校对 Agent 前端演示。

它展示的工作会话是:

上传 DOCX → 浏览器本地解析 → 文稿诊断 → Agent 主动追问 → 校对方案确认 → 分片任务与监督复核 → 原文定位 → 定向复查。

## 本地运行

```bash
npm install
npm run dev
```

打开终端中显示的本地地址即可。没有 API Key 时，页面会自动使用演示模式，仍可以完整演示交互。

## 接入 DeepSeek

打开页面右上角设置，输入:

- Base URL: `https://api.deepseek.com`
- Model: `deepseek-v4-pro`（也可以改成你账号可用的模型）
- API Key: 只在当前页面输入

点击“测试连接”后，页面会切换到实际模型连接状态。Key 只存在页面内存，刷新后清除。

请不要把 API Key 写入源码、`.env`、GitHub Actions 构建变量或公开仓库。GitHub Pages 是公开静态站，前端提示词也会随构建产物公开。

## 构建与测试

```bash
npm test
npm run build
```

## GitHub Pages

仓库推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会构建 `dist` 并发布到 Pages。演示结束后请撤销演示 Key，并关闭或归档 Pages。
