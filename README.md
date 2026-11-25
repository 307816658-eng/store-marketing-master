# 门店获客营销大师 - 官网

这是“门店获客营销大师”Android 正式实战版的下载官网源码，部署在 Cloudflare Pages：

https://store-marketing-master.pages.dev/

## 包含内容

- 产品介绍及 Android APK 下载页面
- Android APK 安装包（`downloads/`）
- Cloudflare Pages Function：`/api/ai/*`
- 基础安全响应头

## 本地预览

安装 Node.js 后，在本目录运行：

```powershell
npx wrangler pages dev .
```

随后打开命令行显示的本地地址。

## Cloudflare 部署

```powershell
npx wrangler pages deploy . --project-name store-marketing-master --branch main
```

生产环境需要在 Cloudflare Pages 项目中配置以下机密变量。不要把真实值写入仓库、网页或 APK：

| 变量名 | 用途 |
| --- | --- |
| `AI_API_KEY` | AI 服务的访问密钥 |
| `AI_BASE_URL` | AI 服务地址 |
| `AI_MODEL` | 使用的模型名称 |

## 注意事项

- 此仓库包含 Android APK 安装包。安装前请确认设备允许安装来自浏览器的应用。
- `X-App-Client` 仅用于客户端基础识别，不是用户认证。公开分享前应添加访问控制和限流。
- Cloudflare 的真实密钥仅保存在 Pages Secrets 中，不属于本仓库。
