# 本机 Paperclip 环境

本地环境配置以标品原版稳定运行优先。只调整本机工具链、代理、端口和
产品提供的配置入口，不修改产品自带的启动脚本或业务源码。

日常服务使用下文“稳定版的日常使用”中的独立入口。以下 `start/stop/restart`
是旧主检出环境的回退操作；源码检查和依赖准备仍使用相同脚本的 `pnpm` 入口。

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

## 本地分支维护

- `master`：只跟踪 `origin/master`，作为官方开发线镜像。
- `codex/stable`：以正式标签 `v2026.1012.0` 为底座的中文维护入口。
- `codex/complete-chinese-localization`：原始中文版回退入口；主检出的未提交内容继续保留。
- 本机环境和历史引导修复不重复合并；冗余引用先保存在归档引用和完整 Git bundle 中。
- `codex/private-backup/before-remote-push-2026-10-08`：只保留本地恢复用途。

`origin` 是官方仓库，只用于获取上游；`personal` 是
[waldongao/paperclip](https://github.com/waldongao/paperclip)。个人仓库推送使用本机已有的
GitHub SSH 认证，避免 HTTPS 凭据缺少 workflow 作用域导致官方工作流文件无法同步。

稳定维护工作区位于 `/Users/waldon/.codex/worktrees/stable/paperclip`。
当前整理进度与完整验证结果见
[`doc/plans/2026-10-19-stability-consolidation.md`](../../doc/plans/2026-10-19-stability-consolidation.md)。
只有该记录确认所有发布门槛通过后，才可把分支视为最终稳定版。

## 稳定版的日常使用

日常服务使用产品原生服务管理与外部专用入口，代码来自稳定工作区；配置和数据
位于普通独立实例，不使用预览工作树的调度和备份限制。在任意目录执行：

```sh
~/.local/bin/paperclip-stable service start --instance stable-live
~/.local/bin/paperclip-stable service status --instance stable-live
~/.local/bin/paperclip-stable service stop --instance stable-live
~/.local/bin/paperclip-stable service restart --instance stable-live
```

`restart` 用于运行中的服务；停止后用 `start`。Codex 环境按钮使用同一专用入口。
日常访问地址为 `http://127.0.0.1:3100`，数据库端口为 `54359`，配置和数据位于
`~/.paperclip-stable/instances/stable-live/`。原生 PostgreSQL 自动备份启用，使用独立
备份目录。专用 macOS 服务标签为 `ing.paperclip.paperclipai.stable-live`，不会替换
原默认服务；登录后自动启动。外部入口不修改产品自带的启动脚本。

该普通实例使用显式外部配置，保留 `local_trusted` 与仅本机监听；不是通过解除
预览实例的防护来运行。用户原有的智能体状态、按需执行配置、暂停的例行任务
与历史任务状态保留，旧执行队列确认均为终态，不会重放历史运行。

3200 / 数据库 54349 保留为隔离验证实例，数据位于
`~/.paperclip-worktrees/instances/stable/`。该实例的工作树执行开关默认关闭，自动
备份也受预览模式限制，不能当作日常入口。需要验证时，在稳定工作区执行
`bash scripts/local-env.sh pnpm dev:once`；停止该前台验证进程使用 Ctrl+C；本轮临时 API 和数据库已停止。
主检出的 `.paperclip-local/` 仍是升级前恢复点，不能与新版本共用同一实例目录。

在稳定源码工作区执行完整检查：

```sh
bash scripts/local-env.sh pnpm -r typecheck
bash scripts/local-env.sh pnpm test:run
bash scripts/local-env.sh pnpm build
bash scripts/local-env.sh pnpm check:i18n
bash scripts/local-env.sh pnpm check:token-gates
```

本机 Node 为 `24.15.0`，项目 pnpm 固定为 `9.15.4`，独立工具链位于
`~/.local/share/paperclip-toolchain/`，不依赖旧检出的缓存目录。
Runner 使用仓库 `rust-toolchain.toml` 固定的 Rust `1.97.1`；Rust 安装在
`~/.cargo/bin`，新 shell 会自动加载，已有 shell 可执行 `source ~/.cargo/env`。
安装和构建沿用 `.env.local` 的本机代理设置，依赖安装坚持 `--frozen-lockfile`。
正式标签遗漏的两项锁记录仅移植官方 `03cf6a6ec` 的最小修复，没有升级已有依赖。

数据库备份/恢复使用与服务端兼容的原生 PostgreSQL 18 客户端。本机已安装
`/opt/homebrew/opt/libpq/bin/pg_dump` 与 `psql`，通过 `.env.local` 的
`PAPERCLIP_PG_DUMP_PATH` / `PAPERCLIP_PSQL_PATH` 指定。不要依赖缺少原生工具时
自动退回的 JavaScript 备份来做整实例迁移：正式版该路径未保留 CHECK 约束，
可能让后续迁移失败。整理记录保留了原生备份和完整恢复验证证据。

后续升级先获取新的正式标签，在独立工作区备份、迁移和完整验证，再更新维护分支。
不要把 `origin/master` 直接合入日常稳定入口，也不要用依赖升级代替正式版升级。
误删引用可以从私密备份目录的 Git bundle 或本地 `refs/archive/` 恢复；
恢复个人分支时先核对整理前的 SHA，不把私有发布前备份推送到远端。

官方 remote 仅默认获取 `master`，其余本地跟踪引用已归档。升级正式版时用
`git fetch origin tag <正式标签>` 明确获取标签，再按整理记录做备份、整合和验证。
