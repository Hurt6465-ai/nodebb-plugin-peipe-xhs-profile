# nodebb-plugin-peipe-xhs-profile

NodeBB 用户个人主页移动端“小红书风格”H5 化插件。

## 功能

- 移动端用户个人主页重构为小红书风格顶部大图布局
- 不先显示原版样式：CSS 由 NodeBB 构建提前加载，移动端用户页会先隐藏原版顶部资料区和顶部导航
- 隐藏 NodeBB 顶部导航栏、搜索、通知、消息入口和底部导航
- 保留 NodeBB 原有关注、取关、聊天、举报、屏蔽、管理、头像上传、背景上传逻辑
- 背景图上传前压缩
  - GIF / SVG 不压缩
  - 小于 120 KB 不压缩
  - 默认输出 JPEG
  - 长边限制 720px
  - 目标约 0.38 MB
- 多语言
  - 简体中文：`zh-CN`
  - 英文：`en-GB`
  - 缅语：`my-MM`

## 本版优化说明

- 移动端用户页首屏不再露出原 NodeBB 用户页顶部资料区：CSS 在 JS 初始化前先隐藏原版区域，并显示小红书风格占位层。
- 新样式 shell 完整构建后才切换到 `xhs-profile-active`，避免初始化过程中的一帧原样式闪现。
- 如果 5 秒内找不到兼容的账号页 DOM，会切换到 `xhs-profile-failed` 并恢复原版页面，不会把原用户页永久隐藏。
- 背景图上传压缩监听只在移动端账号页有效，离开账号页会解绑，避免影响其他上传入口。
- `targetBytes` 与 `maxSizeMB` 已统一为约 0.38 MB。

## 文件结构

```text
nodebb-plugin-peipe-xhs-profile/
├── package.json
├── plugin.json
├── library.js
├── public/
│   ├── lib/
│   │   └── client.js
│   └── scss/
│       └── xhs-profile.scss
└── languages/
    ├── zh-CN/xhs-profile.json
    ├── en-GB/xhs-profile.json
    └── my-MM/xhs-profile.json
```

## 上传到 GitHub

仓库名建议使用：

```text
nodebb-plugin-peipe-xhs-profile
```

GitHub 地址：

```text
https://github.com/Hurt6465-ai/nodebb-plugin-peipe-xhs-profile
```

本地解压后执行：

```bash
cd nodebb-plugin-peipe-xhs-profile
git init
git add .
git commit -m "Initial NodeBB XHS mobile profile plugin"
git branch -M main
git remote add origin https://github.com/Hurt6465-ai/nodebb-plugin-peipe-xhs-profile.git
git push -u origin main
```

## Docker 安装命令

按你的安装方式，可以这样执行：

```bash
docker update --restart=no nodebb

docker exec -it nodebb sh -lc 'cd /usr/src/app && npm uninstall nodebb-plugin-peipe-xhs-profile || true && npm cache clean --force && npm install --legacy-peer-deps --force https://github.com/Hurt6465-ai/nodebb-plugin-peipe-xhs-profile/archive/refs/heads/main.tar.gz && ./nodebb activate nodebb-plugin-peipe-xhs-profile && ./nodebb build'

docker restart nodebb

docker update --restart=always nodebb
```

如果你想在 ACP 后台手动启用，也可以去：

```text
ACP → Extend → Plugins
```

找到 `Peipe XHS Mobile Profile` 后启用，再重建并重启 NodeBB。

## 配置压缩参数

编辑：

```text
public/lib/client.js
```

找到：

```js
const IMAGE_CONFIG = {
  useWebp: false,
  minCompressBytes: 120 * 1024,
  targetBytes: Math.round(0.38 * 1024 * 1024),
  maxSizeMB: 0.38,
  maxWidthOrHeight: 720,
  initialQuality: 0.42,
  preserveExif: false,
  beneficialRatio: 0.95,
  coverUploadArmMs: 20000,
  canvasQualities: [0.58, 0.52, 0.46, 0.40, 0.28]
};
```

如果你的 NodeBB 允许 WebP，可以把：

```js
useWebp: false
```

改成：

```js
useWebp: true
```

## 兼容说明

- 推荐 NodeBB v3 / v4
- 插件依赖 NodeBB 前端已有 jQuery
- 插件不替换 NodeBB 上传接口，只在前端拦截背景图文件选择事件，将压缩后的 File 写回 input，然后继续触发原始上传逻辑
- 如果页面结构和默认 Harmony / Persona 差异很大，可能需要调整 `public/lib/client.js` 中的 DOM 选择器

## 卸载

```bash
docker exec -it nodebb sh -lc 'cd /usr/src/app && ./nodebb reset -p nodebb-plugin-peipe-xhs-profile && npm uninstall nodebb-plugin-peipe-xhs-profile && ./nodebb build'
docker restart nodebb
```
