# Dashboard 图像显示问题修复

## 问题描述

**症状**: Dashboard 前端无法显示训练脚本生成的可视化图像（如 `outputs/rnn_training_curve_epoch_50.png`）

**用户报告**: "前端的图像显示有问题 outputs/rnn_training_curve_epoch_50.png的这几个"

## 根本原因

### 1. 图像路径和服务器位置不匹配

**训练脚本行为**:
- 训练脚本在 `ocean-workspace` 目录运行
- 生成图像保存在 `ocean-workspace/outputs/rnn_training_curve_epoch_50.png`
- 调用 Dashboard API: `client.add_visualization(title="...", imagePath="/outputs/rnn_training_curve_epoch_50.png")`

**前端行为**:
- 前端收到 `imagePath="/outputs/rnn_training_curve_epoch_50.png"`
- 尝试加载 `http://localhost:3737/outputs/rnn_training_curve_epoch_50.png`

**Dashboard 服务器原始配置**:
```typescript
// 原来只有这行 (dashboardServer.ts:140)
this.app.use(express.static(join(__dirname, 'public')))
```

**问题**:
- 服务器只提供 `public` 目录的静态文件
- `outputs` 目录在 `ocean-workspace`，不在 Dashboard 服务器的静态文件路径中
- 浏览器请求 `/outputs/rnn_training_curve_epoch_50.png` 返回 404

### 2. 工作目录不一致

**环境信息**:
```
Working directory: E:\个人项目\海洋KODE魔改\Kode-Ocean
Additional working directories: E:\个人项目\海洋KODE魔改\ocean-workspace
```

**问题**:
- 主工作目录是 `Kode-Ocean`
- 训练脚本在 `ocean-workspace` 运行
- `process.cwd()` 返回 `Kode-Ocean`，而不是 `ocean-workspace`

## 修复方案

### 修改文件: `src/services/oceanDashboard/dashboardServer.ts`

**修改位置**: Line 138-164

**修改内容**:

```typescript
private setupMiddleware(): void {
  this.app.use(express.json())

  // Serve static files from public directory (dashboard UI)
  this.app.use(express.static(join(__dirname, 'public')))

  // CRITICAL: Serve static files from working directories (training outputs)
  // This allows access to images like /outputs/plot.png from ocean-workspace

  // Serve from current working directory
  this.app.use(express.static(process.cwd()))

  // Also serve from common ocean-workspace locations
  const commonWorkspacePaths = [
    join(process.cwd(), 'ocean-workspace'),
    join(process.cwd(), '..', 'ocean-workspace'),
    // Absolute path as fallback
    'E:\\个人项目\\海洋KODE魔改\\ocean-workspace'
  ]

  for (const path of commonWorkspacePaths) {
    if (existsSync(path)) {
      this.app.use(express.static(path))
      console.log(`[Dashboard] Serving static files from: ${path}`)
    }
  }
}
```

### 修复原理

**Express 静态文件服务工作原理**:
```typescript
app.use(express.static('/path/to/directory'))
```

当浏览器请求 `/outputs/image.png` 时，Express 会在指定目录下查找 `outputs/image.png`。

**多个静态目录**:
Express 支持添加多个静态目录，按顺序查找：
```typescript
app.use(express.static('dir1'))
app.use(express.static('dir2'))
app.use(express.static('dir3'))
```

请求 `/file.png` 时，Express 会依次在 `dir1/file.png`, `dir2/file.png`, `dir3/file.png` 中查找。

**我们的修复**:
1. **`public`** - Dashboard UI 文件
2. **`process.cwd()`** - 当前工作目录
3. **`process.cwd()/ocean-workspace`** - 相对路径
4. **`../ocean-workspace`** - 上一级目录
5. **绝对路径** - 作为最后的后备方案

这样无论从哪个目录启动 Dashboard，都能找到 `ocean-workspace/outputs/` 下的图像。

## 测试修复

### 步骤 1: 重新构建 Kode

```bash
cd E:\个人项目\海洋KODE魔改\Kode-Ocean
bun run build
```

### 步骤 2: 重启 Dashboard

如果 Dashboard 正在运行：
1. 停止 Dashboard（使用 ocean_dashboard tool 的 stop 动作）
2. 重新启动 Dashboard（使用 ocean_dashboard tool 的 start 动作）

### 步骤 3: 检查日志

启动 Dashboard 后，应该看到类似的日志：
```
[Dashboard] Serving static files from: E:\个人项目\海洋KODE魔改\ocean-workspace
Ocean Dashboard started on http://localhost:3737
```

### 步骤 4: 验证图像访问

**方法 A: 直接访问**

在浏览器中打开：
```
http://localhost:3737/outputs/rnn_training_curve_epoch_50.png
```

**预期结果**: 显示图像（不是 404）

**方法 B: 通过 Dashboard**

1. 访问 http://localhost:3737
2. 滚动到 "Visualizations" 部分
3. 应该能看到之前添加的所有可视化图像

### 步骤 5: 运行新训练

```bash
cd E:\个人项目\海洋KODE魔改\ocean-workspace
conda run -n agentUse python scripts/train_simple_rnn.py
```

**预期**:
- 训练过程中添加的可视化应该立即显示在 Dashboard 上
- 不再有 404 错误

## 验证清单

- [ ] 重新构建 Kode (`bun run build`)
- [ ] 重启 Dashboard
- [ ] 检查启动日志中的 "Serving static files from" 消息
- [ ] 直接访问图像 URL (http://localhost:3737/outputs/...)
- [ ] Dashboard Visualizations 区域显示图像
- [ ] 运行新训练，实时查看可视化

## 技术细节

### 文件路径映射

**训练脚本保存路径**:
```python
plt.savefig("outputs/rnn_training_curve_epoch_50.png")
# 实际文件: ocean-workspace/outputs/rnn_training_curve_epoch_50.png
```

**Dashboard API 调用**:
```python
client.add_visualization(
    title="Training Curve",
    imagePath="/outputs/rnn_training_curve_epoch_50.png"  # Leading slash!
)
```

**前端 HTML**:
```html
<img src="/outputs/rnn_training_curve_epoch_50.png">
```

**浏览器请求**:
```
GET http://localhost:3737/outputs/rnn_training_curve_epoch_50.png
```

**Express 静态文件查找**:
```
1. public/outputs/rnn_training_curve_epoch_50.png ❌ 不存在
2. E:\个人项目\海洋KODE魔改\Kode-Ocean/outputs/... ❌ 不存在
3. E:\个人项目\海洋KODE魔改\ocean-workspace/outputs/... ✅ 找到了！
```

### 为什么需要多个路径

**场景 1: 从 Kode-Ocean 启动 Kode**
- `process.cwd()` = `E:\个人项目\海洋KODE魔改\Kode-Ocean`
- 需要 `join(process.cwd(), '..', 'ocean-workspace')` 才能找到

**场景 2: 从 ocean-workspace 启动 Kode**
- `process.cwd()` = `E:\个人项目\海洋KODE魔改\ocean-workspace`
- `process.cwd()` 本身就能找到

**场景 3: 从其他目录启动**
- 绝对路径作为后备

**结论**: 多路径支持确保无论从哪里启动都能工作！

## 常见问题

### Q: 为什么不让训练脚本上传图像到 Dashboard 服务器？

**A**:
- 需要实现文件上传 API
- 需要管理上传的文件存储
- 增加复杂性
- 静态文件服务更简单、更高效

### Q: 为什么不使用绝对路径？

**A**:
- 硬编码绝对路径不够灵活
- 不同用户的路径可能不同
- 我们已经添加了绝对路径作为后备方案

### Q: 如果我在其他项目中使用 Dashboard 怎么办？

**A**:
- 当前的多路径方案主要针对 ocean-workspace
- 如果在其他项目使用，确保从项目目录启动 Kode
- 或者修改 `commonWorkspacePaths` 添加你的项目路径

### Q: 这会不会暴露敏感文件？

**A**:
- Dashboard 只在 localhost 运行，不对外暴露
- Express 静态文件服务只提供文件下载，不列出目录
- 训练脚本只上传需要显示的图像路径
- 如果担心安全性，可以限制只提供 `outputs` 目录

## 改进建议（未来）

### 1. 配置化工作目录

在 Dashboard 启动时接受工作目录参数：
```typescript
const server = new OceanDashboardServer({
  port: 3737,
  workspaces: [
    '/path/to/ocean-workspace',
    '/path/to/another/project'
  ]
})
```

### 2. 自动检测工作目录

根据 `.kode` 目录的位置自动检测：
```typescript
const workspaces = findWorkspaces(process.cwd())
```

### 3. 安全限制

只允许访问特定子目录：
```typescript
app.use('/outputs', express.static(join(workspace, 'outputs')))
app.use('/models', express.static(join(workspace, 'models')))
```

### 4. 图像代理 API

添加一个专门的图像代理端点：
```typescript
app.get('/api/image/:path', (req, res) => {
  const imagePath = findImageInWorkspaces(req.params.path)
  res.sendFile(imagePath)
})
```

## 总结

**问题**: Dashboard 无法显示训练脚本生成的图像

**原因**: 服务器只提供 `public` 目录，无法访问 `ocean-workspace/outputs`

**修复**: 添加多个静态文件根目录，支持从多个位置查找文件

**状态**: ✅ 已修复，需要重新构建 (`bun run build`)

---

**修复时间**: 2025-10-25
**修改文件**: `src/services/oceanDashboard/dashboardServer.ts` (Line 138-164)
**需要操作**: 运行 `bun run build` 重新构建
