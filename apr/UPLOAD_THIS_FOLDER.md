# 直接上传版

这个 `apr` 文件夹是已经构建好的静态网页。

适合当前这种 GitHub Pages 用法：

- 直接上传文件夹内容到仓库或 Pages 目录
- 使用 `Deploy from a branch`
- 不需要 GitHub Actions
- 不需要 `npm install`

如果仓库访问路径是 `https://tools.burnman.net/apr/`，请保持这个文件夹名为 `apr`，并上传到站点根目录。

## 文件结构

```text
index.html
assets/
```

浏览器不应再请求 `/src/main.tsx`。如果还看到 `/src/main.tsx`，说明线上缓存或上传的仍是旧源码版。

