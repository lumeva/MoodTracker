# 公网部署指南（GitHub Pages）

本项目已经内置自动部署工作流：

- `.github/workflows/static.yml`

你只需要把代码推到 GitHub 的 `main` 分支，GitHub 会自动发布网页。

## 1. 在 GitHub 新建仓库

在网页端创建一个空仓库，例如：`MoodTracker`。

## 2. 本地初始化并推送

在 `D:\MoodTracker` 里执行：

```powershell
git init
git branch -M main
git add .
git commit -m "feat: initial mood tracker web app"
git remote add origin https://github.com/<你的用户名>/<你的仓库名>.git
git push -u origin main
```

如果你已经初始化过仓库，跳过 `git init` 即可。

## 3. 开启 Pages（只需一次）

进入仓库网页：

1. `Settings`
2. `Pages`
3. `Build and deployment` 选择 `GitHub Actions`

## 4. 查看部署结果

推送后进入仓库 `Actions`，等待工作流成功，页面会生成公网地址：

```text
https://<你的用户名>.github.io/<你的仓库名>/
```

## 5. 手机上验证

用手机浏览器打开公网地址后，验证：

- 记录与导出是否正常
- 设置页备份/恢复是否正常
- “添加到主屏幕”是否可用

## 可选：快速分享测试版

如果你只想临时分享，也可以把整个目录打包上传到 Netlify Drop：

- [Netlify Drop](https://app.netlify.com/drop)

这种方式无需配置仓库，但不适合长期版本管理。
