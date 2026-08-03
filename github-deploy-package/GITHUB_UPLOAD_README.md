# GitHub 上传说明

这个文件夹就是可上传到 GitHub 的 demo 源码包。

## 推荐部署方式

1. 在 GitHub 新建一个空仓库。
2. 把本文件夹里的全部内容上传到仓库根目录。
3. 进入仓库 `Settings` -> `Pages`。
4. `Build and deployment` 选择 `GitHub Actions`。
5. 推送后等待 Actions 跑完，Pages 会生成访问地址。

## 本地自测

```bash
npm install
npm test
npm run build
npm run dev
```

## API Key

API Key 只在浏览器当前页面内存里使用，不会写入源码、构建产物或本地存储。演示时打开右上角设置，填入 DeepSeek/OpenAI 兼容接口地址、模型名和 Key 即可。

默认接口地址：

```text
https://api.deepseek.com
```

默认模型名：

```text
deepseek-v4-pro
```

