# 心绪记录（静态原型）

这是一个手机端优先的网页原型，支持：

- 首页快速记录（自动按系统时间归入时段）
- 引导式情绪记录（按你确认过的 5 步流程）
- 情绪之轮细分标签 + 躯体化联动
- 自定义项目（如饭量、学习、社交）
- 基础统计可视化
- 按时间范围导出文字（可复制给 AI）
- PWA 安装（添加到主屏幕）与离线缓存
- JSON 备份与恢复
- 基础时段提醒（打开网页时检查漏记）

## 使用方式

直接打开 [index.html](D:\MoodTracker\index.html) 即可。

如果浏览器限制本地文件脚本，可在目录里运行：

```powershell
python -m http.server 4173
```

然后访问：

```text
http://localhost:4173
```

如果要用手机验证，在电脑同目录开启服务后，手机访问：

```text
http://电脑局域网IPv4:4173/index.html
```

提示：
- iPhone 请用 Safari 的“添加到主屏幕”
- Android 请用 Chrome 的“安装应用/添加到主屏幕”
- `file://` 模式下无法完整验证 PWA 离线缓存

## 当前存储方式

数据保存在浏览器 `localStorage`（键名：`mood-tracker-v1`）。

## 公网部署

已提供 GitHub Pages 自动部署工作流：

- [static.yml](D:\MoodTracker\.github\workflows\static.yml)

详细步骤见：

- [DEPLOY.md](D:\MoodTracker\DEPLOY.md)
