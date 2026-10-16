# 开发与验证

## 环境

- Node.js 22+，npm。
- 构建通过 esbuild 生成 Obsidian 的 CommonJS 插件入口。
- 安装 ZIP 的生成依赖 `/usr/bin/zip`，当前构建流程用于 macOS / Linux。
- 浏览器交互预览通过 Vite 提供，默认绑定本机回环地址。

```sh
npm ci
npm run dev
npm run check
```

## 项目结构

| 路径 | 职责 |
| --- | --- |
| `src/main.ts` | Obsidian 视图、命令、笔记和设置适配 |
| `src/host.ts` | 插件与预览共用的宿主接口 |
| `src/ui/` | 桌面、组件、网格与设置面板 |
| `src/model.ts` | 设置校验、布局及固定路径转换 |
| `src/persistence.ts` | 配置合并写入、串行保存及重试 |
| `src/weather.ts` | 城市查询、天气解析、缓存与离线回退 |
| `preview/` | 示例笔记和浏览器宿主 |
| `assets/` | 本地内置壁纸 |
| `tests/` | 模型、服务、宿主适配及界面回归测试 |

## 构建产物

- `npm run build`：生成 `dist/desktop-home/` 和版本对应的 ZIP。
- `npm run build:preview`：生成 `dist-preview/` 静态预览。
- 插件安装时保留 `main.js`、`manifest.json`、`styles.css` 与 `assets/`。
- 依赖、构建目录、安装 ZIP 和用户插件配置不纳入源码仓库。

## 0.1.1 验证范围

`npm run check` 包含 34 个用例、TypeScript 检查、插件构建和静态预览构建。

已进行浏览器交互检查：本地搜索、主题切换、壁纸上传与刷新持久化、组件尺寸和鼠标拖动、布局撤销与恢复、关闭前保存，以及宽/窄面板布局。

Obsidian 适配测试使用明确的接口替身；真实应用里的安装、视图生命周期、关闭时异步保存、资源协议和主题兼容仍需应用内验证。移动端未验收，manifest 标记电脑端专用。

## 外部服务与资源

天气默认关闭，主动选择城市后连接 Open-Meteo。默认服务用于个人非商业使用和原型验证，商业发布前需按服务方条款选择适合的方案。笔记内容不发送到天气服务。

内置壁纸生成记录见 [wallpaper-generation.md](wallpaper-generation.md)，第三方声明见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
