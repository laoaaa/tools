# 校对王 Agent 模式 · 网页 Demo

给技术团队看的静态网页 demo，演示"上传书稿 → agent 主动提问确认策略 → 并发校对 → 分类结果 → 继续追问专项检查"的完整交互。纯前端、无后端、无构建步骤，可直接用浏览器打开，也可以托管到 GitHub Pages。演示完建议直接删掉仓库或吊销当次使用的 API Key。

对应的方案文档见 `plan.md`。

## 文件说明

- `index.html` — 唯一的界面文件，内联全部样式。
- `prompts.js` — 四套提示词常量（查全、政务、监督、新增的画像提示词）+ 用户确认答案到指令的编译表。三套沿用现有生产提示词，逐字未改，可对照 `提示词/` 目录核对。
- `app.js` — 纯逻辑：docx/txt 解析、分句分块、LLM 调用、并发调度、JSON 容错解析、结果合并、人名一致性聚类。不含 DOM 操作，可独立单测。
- `cors-test.html` — 部署前的独立自检页面，只做一次最简 API 调用，判断浏览器能否直连 DeepSeek。
- `plan.md` — 技术方案。

## 第一步：先测 CORS，别直接开演

DeepSeek 官方文档没有说明是否对浏览器跨域请求开放。GitHub Pages 是静态托管，没有服务端能绕开这个问题，所以**演示前必须先确认**：

1. 用浏览器打开 `cors-test.html`（本地双击打开即可，不需要起服务）。
2. 填入 Base URL（默认 `https://api.deepseek.com/v1`）、API Key、模型名，点"发起一次最简请求"。
3. 看结果：
   - 绿色"直连成功" → 可以直接用 `index.html` 演示，跳过下面的代理步骤。
   - 红色报错且浏览器控制台（F12）出现 `blocked by CORS policy` → 看下面"CORS 不通怎么办"。
   - 红色报错但是 HTTP 状态码（如 401/404）→ 不是 CORS 问题，是 Key 或 URL 填错了，检查一下。

## 本地运行

不需要 npm install，也不需要构建。因为 `index.html` 用了 ES module（`<script type="module">`），必须通过 `http://` 协议打开，不能直接双击文件（`file://` 协议下浏览器会拦截 module 的相对导入）。任选一种起一个静态服务器：

```bash
cd 校对王agent的网页demo
python3 -m http.server 8000
# 或
npx serve .
```

然后浏览器打开 `http://localhost:8000/index.html`。

`cors-test.html` 不用 module，可以直接双击打开，不受此限制。

## 部署到 GitHub Pages

```bash
cd 校对王agent的网页demo
git init
git add index.html app.js prompts.js cors-test.html README.md
git commit -m "校对王 agent demo"
git branch -M main
git remote add origin <你的空仓库地址>
git push -u origin main
```

然后在仓库 Settings → Pages 里把 Source 设为 `main` 分支根目录。几分钟后可通过 `https://<你的GitHub用户名>.github.io/<仓库名>/` 访问。

**演示用的 API Key 建议：** 去 DeepSeek 控制台单独开一个限额较低的临时 Key，演示完立刻吊销。Key 只存在浏览器内存和当前标签页的 `sessionStorage` 里，不会写进代码仓库，关闭标签页即失效，但公网页面上明文填 Key 终究不是长期方案，仅用于这次演示。

## CORS 不通怎么办

如果 `cors-test.html` 提示被拦截，说明需要一层最小代理转发请求。给技术团队的 Cloudflare Worker 参考代码（免费额度足够演示用）：

```js
export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }
    const url = new URL(request.url);
    const target = "https://api.deepseek.com" + url.pathname.replace(/^\/proxy/, "");
    const resp = await fetch(target, {
      method: request.method,
      headers: { "Content-Type": "application/json", "Authorization": request.headers.get("Authorization") },
      body: request.body,
    });
    const newHeaders = new Headers(resp.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(resp.body, { status: resp.status, headers: newHeaders });
  },
};
```

部署后把 `index.html` 顶部配置条里的 Base URL 换成 `https://<你的worker>.workers.dev/proxy/v1` 即可，不需要改任何 JS 代码。这一步顺带也说明了为什么正式版仍然需要服务端——浏览器直连大模型 API 本身就不是长期可用的架构。

## 演示流程建议

1. 打开页面，配置条里填 API Key，点"测试连接"确认能通。
2. 上传一份书稿（`.docx` / `.txt` / `.md`，几千到几万字均可，字数越大越能体现并发效果）。
3. 观察对话区：agent 先说"文档已在读取中"，然后基于抽样内容给出书稿类型判断和几个针对性确认问题——**这些问题是模型现场生成的，不是写死的**，换一份不同风格的稿子问题会不一样，这是与旧链路最大的区别。
4. 逐条点 Y/N，其中"是否需要人名统一性检查"选 Y 可以展示跨 chunk 一致性专项能力。
5. 确认完毕后点"查看本轮实际提示词"，让技术团队看到 Y/N 选择真的被编译进了提示词末尾，不是摆设。
6. 等待执行完成，结果区展示统计、类型筛选、原文对照；重点展开"剔除的疑似误报"区，讲解监督提示词的噪声规则（N0-N11）是如何工作的。
7. 在底部输入框发起一次追问，比如"只看内容风险类问题"，展示专项复用能力。
8. 导出 JSON/CSV/日志，说明这些数据结构与生产链路的 chunk JSON 格式完全兼容，方便技术团队评估迁移成本。

## 已知限制（demo 范围内的取舍，不是 bug）

- 不支持 PDF，只支持 docx/txt/md。若书稿是 PDF，请先另存为 docx。
- 三方校对员简化为两方（查全 + 政务），监督提示词的"丙"栏固定填"未报出错误"——监督提示词本身的裁决逻辑不依赖固定三人数，这个简化不影响演示效果。
- 人名一致性专项检查基于简单的姓氏启发式规则 + 编辑距离聚类，用于demo展示"跨chunk能力"，不是生产级的实体识别，请勿直接套用到正式链路。
- token 计价用的是占位单价常量，演示前请对照实际账户价格在 `app.js` 的 `PRICE_PER_1K` 里更新。
- 无用户体系、无持久化，刷新页面即丢失当前会话状态。
