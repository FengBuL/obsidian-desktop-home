# 开发与验证

## 环境

- Node.js 22+，npm。
- 构建通过 esbuild 生成 Obsidian 的 CommonJS 插件入口；内置壁纸（`assets/alpine.webp`）以 data URL 打包进 `main.js`。
- 浏览器交互预览通过 Vite 提供，默认绑定本机回环地址。

```sh
npm ci
npm run dev
npm run verify
```

`npm run verify` 依次执行：TypeScript 检查、ESLint（`eslint-plugin-obsidianmd` 推荐规则，要求 0 错误）、CSS 兼容与 `!important` 检查、Vitest 单元测试、插件构建、静态预览构建。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| `src/main.ts` | Obsidian 视图、命令、笔记缓存、日记 / 待办 / 壁纸宿主适配 |
| `src/settings-tab.ts` | 设置页（基础 / 日记 / 高级），同时提供 1.13+ 的声明式设置 |
| `src/host.ts` | 插件与预览共用的宿主接口 |
| `src/ui/` | 桌面、组件、网格与面板 |
| `src/model.ts` | 设置校验、布局及路径改名 |
| `src/notes.ts` | 搜索、别名、安全文件名、日期路径 |
| `src/tasks.ts` | 待办解析、筛选、勾选与追加 |
| `src/persistence.ts` | 配置合并写入、串行保存及重试 |
| `src/weather.ts` | 城市查询、天气解析、缓存与离线回退 |
| `preview/` | 示例笔记、浏览器宿主，以及 setCssProps 的最小实现 |
| `tests/` | 模型、待办、搜索、天气、宿主适配及界面回归测试 |

## 约定

- 不写内联样式：动态值通过 `setCssProps` 写成 CSS 变量，样式表负责使用。
- 悬停提示：图标按钮用 `aria-label`（由 Obsidian 显示提示），带自定义气泡的元素用 `aria-labelledby`，大块区域用视觉隐藏的标签，不设置 `title`。
- 样式不使用 `!important`；手机端底部留白使用 `--mobile-navbar-height` 与 `env(safe-area-inset-bottom)`。
- 首页只通过 `DesktopHost` 访问笔记库，便于在浏览器预览和测试中替换。

## 外部服务与资源

天气默认关闭，主动选择城市后连接 Open-Meteo（只发送城市名或坐标）。内置壁纸生成记录见 [wallpaper-generation.md](wallpaper-generation.md)，第三方声明见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
