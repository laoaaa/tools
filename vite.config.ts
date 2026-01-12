import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { copyFileSync } from "fs";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          // Inject data-source attribute for AI agent source location
          "./scripts/babel-plugin-jsx-source-location.cjs",
        ],
      },
    }),
    tailwindcss(),
    // 复制 404.html 和 .nojekyll 到 dist 目录（用于 GitHub Pages）
    {
      name: "copy-github-pages-files",
      closeBundle() {
        const distPath = path.resolve(__dirname, "dist");
        try {
          copyFileSync(
            path.resolve(__dirname, "404.html"),
            path.resolve(distPath, "404.html")
          );
          copyFileSync(
            path.resolve(__dirname, ".nojekyll"),
            path.resolve(distPath, ".nojekyll")
          );
        } catch (err) {
          console.warn("Failed to copy GitHub Pages files:", err);
        }
      },
    },
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // 如果部署到 GitHub Pages 子路径，请将 base 设置为你的仓库名称
  // 例如：如果仓库名是 text-collator，访问地址是 https://username.github.io/text-collator/
  // 则 base 应该设置为 "/text-collator/"
  // 如果是部署到 username.github.io 根目录，则设置为 "/"
  base: "/text-collator/",
  build: { outDir: "dist", emptyOutDir: true },
});
