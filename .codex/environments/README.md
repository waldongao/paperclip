# 本机 Paperclip 环境

本地环境配置以标品原版稳定运行优先。只调整本机工具链、代理、端口和
产品提供的配置入口，不修改产品自带的启动脚本或业务源码。

在项目根目录运行 `bash scripts/local-env.sh <command>`：

- `setup`：使用项目声明的 pnpm 版本安装依赖，检查 workspace 链接。
- `start`：调用产品原有的 `pnpm dev`，前台运行。
- `stop` / `restart`：调用产品原有的服务管理命令。
- `status`：查看服务登记状态和 `/api/health`。
- `logs`：查看本机运行日志。
- `pnpm ...`：使用相同工具链执行指定命令。

安装使用 `--frozen-lockfile`。如果依赖声明与锁文件不一致，会直接报错；
不得通过自动重算锁文件或修改产品代码来绕过错误。

机器设置在 Git 忽略的 `.env.local`，示例见 `.env.local.example`。
可配置 Node 路径、HTTP 代理、端口和数据目录。默认访问地址为
`http://127.0.0.1:3100`，数据目录为 `.paperclip-local/`，控制台日志为
`.paperclip-local/local-server.log`。使用内嵌数据库时保持 `DATABASE_URL` 未设置。

启动遵循产品自身的迁移行为，可能自动应用产品已有的数据库迁移。
已有配置、密钥和数据库不由环境脚本重置。

Codex 操作定义在本目录的 `environment.toml`。本机脚本仅管理主检出目录；
Git worktree 使用产品原有的独立工作区配置流程。
