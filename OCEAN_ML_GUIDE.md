# Ocean ML Tools - 使用指南

## 概述

这是为Kode添加的海洋机器学习工具集,提供完整的数据处理、模型训练、可视化工作流,并配备实时Web仪表盘进行监控。

## 核心组件

### 1. Web仪表盘 (Ocean Dashboard)

实时Web仪表盘,可视化展示:
- 训练进度和状态
- 模型架构和参数
- 数据信息
- 训练曲线
- 可视化图表
- 实时日志

**启动仪表盘:**
```
使用 ocean_dashboard 工具,action为"start"
```

访问地址: http://localhost:3737

### 2. 自定义工具 (Tools)

#### OceanDashboardTool
- **功能**: 启动/停止/查询仪表盘状态
- **工具名**: `ocean_dashboard`
- **参数**:
  - `action`: 'start' | 'stop' | 'status' | 'url'
  - `port`: 端口号(默认3737)

#### OceanDataTool
- **功能**: 加载和验证海洋数据(HDF5, NetCDF等)
- **工具名**: `ocean_load_data`
- **参数**:
  - `filepath`: 数据文件路径
  - `format`: 'auto' | 'hdf5' | 'netcdf' (默认auto)
  - `dashboard_url`: 仪表盘URL

### 3. Ocean ML Agent

专门的Agent配置,位于 `.kode/agents/ocean-ml.md`

**使用方法:**
```bash
# 启动Kode并使用ocean-ml agent
kode

# 在对话中提及agent
@ocean-ml 帮我处理海洋数据
```

### 4. Python脚本

所有Python脚本使用conda环境 `agentUse`:

```bash
conda create -n agentUse python=3.10
conda activate agentUse
pip install torch numpy h5py netCDF4 matplotlib requests
```

脚本位置: `ocean_scripts/`
- `data_loader.py`: 数据加载
- `visualizer.py`: 可视化
- `training_example.py`: 训练示例

## 完整工作流示例

### 方式1: 使用Agent (推荐)

```
用户: @ocean-ml 我要训练一个FNO模型来处理海洋温度数据

AI会自动:
1. 启动仪表盘
2. 加载数据
3. 构建模型
4. 训练并监控
5. 生成可视化
6. 报告结果
```

### 方式2: 手动调用工具

1. **启动仪表盘**
```json
{
  "tool": "ocean_dashboard",
  "input": {
    "action": "start"
  }
}
```

2. **加载数据**
```json
{
  "tool": "ocean_load_data",
  "input": {
    "filepath": "path/to/ocean_data.h5"
  }
}
```

3. **训练模型** (使用Bash工具)
```bash
conda run -n agentUse python ocean_scripts/training_example.py --epochs 100 --target-loss 0.01
```

4. **查看仪表盘**
打开浏览器访问 http://localhost:3737

## 仪表盘API

仪表盘提供REST API用于更新数据:

### 更新训练状态
```bash
curl -X POST http://localhost:3737/api/training/status \
  -H "Content-Type: application/json" \
  -d '{"status": "running", "currentEpoch": 10, "totalEpochs": 100}'
```

### 添加训练指标
```bash
curl -X POST http://localhost:3737/api/training/metric \
  -H "Content-Type: application/json" \
  -d '{"epoch": 10, "loss": 0.05, "metrics": {"mae": 0.03}}'
```

### 添加可视化
```bash
curl -X POST http://localhost:3737/api/visualization \
  -H "Content-Type: application/json" \
  -d '{"type": "curve", "title": "Training Loss", "imagePath": "/path/to/image.png"}'
```

### 添加日志
```bash
curl -X POST http://localhost:3737/api/log \
  -H "Content-Type: application/json" \
  -d '{"level": "info", "message": "Training started"}'
```

## 扩展开发

### 添加新的数据格式支持

编辑 `ocean_scripts/data_loader.py`,添加新的加载函数:

```python
def load_your_format(self, filepath):
    # 实现加载逻辑
    self.metadata = {
        'format': 'YourFormat',
        'variables': [...],
        'shape': [...],
        'loaded': True
    }
    return self.metadata
```

### 添加新的可视化类型

编辑 `ocean_scripts/visualizer.py`,添加新的可视化函数。

### 创建新的Tool

参考 `src/tools/OceanDataTool/OceanDataTool.tsx` 的结构:

1. 创建Tool文件
2. 定义inputSchema (使用zod)
3. 实现call函数
4. 在 `src/tools.ts` 中注册

## 目录结构

```
Kode-Ocean/
├── src/
│   ├── tools/
│   │   ├── OceanDashboardTool/     # 仪表盘工具
│   │   ├── OceanDataTool/          # 数据加载工具
│   │   └── ...
│   └── services/
│       └── oceanDashboard/         # 仪表盘服务
│           ├── dashboardServer.ts  # 后端服务
│           └── public/
│               └── index.html      # 前端页面
├── ocean_scripts/                  # Python脚本
│   ├── data_loader.py
│   ├── visualizer.py
│   └── training_example.py
└── .kode/
    └── agents/
        └── ocean-ml.md             # Agent配置
```

## 常见问题

### Q: 仪表盘无法启动?
A: 检查端口3737是否被占用,或使用自定义端口:
```json
{"action": "start", "port": 8080}
```

### Q: Python脚本执行失败?
A: 确保conda环境agentUse已创建并安装所需库:
```bash
conda create -n agentUse python=3.10
conda activate agentUse
pip install torch numpy h5py netCDF4 matplotlib requests
```

### Q: 数据加载失败?
A: 检查:
1. 文件路径是否正确
2. 文件格式是否支持
3. 是否安装了对应的库(h5py for HDF5, netCDF4 for NetCDF)

### Q: 仪表盘看不到更新?
A: 确保:
1. 仪表盘已启动
2. dashboard_url参数正确
3. 检查浏览器控制台是否有WebSocket连接错误

## 下一步开发

- [ ] 添加OceanVisualizationTool (独立可视化工具)
- [ ] 添加OceanModelTool (模型构建工具)
- [ ] 添加OceanTrainTool (训练控制工具)
- [ ] 支持更多数据格式(GRIB, Zarr等)
- [ ] 添加模型保存/加载功能
- [ ] 增加超参数优化工具
- [ ] 集成TensorBoard
- [ ] 添加分布式训练支持

## 贡献

欢迎贡献代码、报告问题或提出新功能建议!

## 许可

与Kode主项目保持一致。
