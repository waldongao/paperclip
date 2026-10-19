# 中文稳定维护版整理记录

核查日期：2026-10-19。状态：**尚未完成上游整合，不能标记为最终稳定版**。

## 版本与本地分支

本次从 `codex/complete-chinese-localization` 的 `84842e4d5` 开始，初始工作区干净。
通过 GitHub API 核实，最新正式版是
[`v2026.1012.0`](https://github.com/paperclipai/paperclip/releases/tag/v2026.1012.0)，
2026-10-12 发布，对应 `bba6a45f0d364cfd962ac59b3bdf2426a8222adb`，本地尚无该对象。
官方 master 是持续开发线，不等同正式稳定版。

正式版与中文版共同祖先为 `f1d9206c4`：正式版独有 715 个提交，中文版独有 6 个。
本地缓存的 origin/master 独有 783 个提交，与中文化同时修改了 309 个文件，
需要实质升级和冲突处理，不能直接覆盖或回退现有实例。

| 本地分支 | 核查结果 | 后续处理 |
| --- | --- | --- |
| master | 官方镜像，5717523b9；与个人远端 master 一致 | 保留镜像角色，取得新对象后更新 |
| codex/complete-chinese-localization | 当前使用入口，包含中文化与本机环境 | 保留，作为定制改动来源 |
| codex/local-environment | ed23676b2 已是中文版祖先 | 不必重复合并，归档后清理冗余引用 |
| codex/archive/onboarding-fix-2026-09-01 | 已有标签 v2026.831.1；修复已在当前代码内 | 不必重复合并，标签已保留历史 |
| codex/private-backup/before-remote-push-2026-10-08 | 原始发布前备份，修复与文档基本为等价补丁 | 保留本地恢复用途，不重复合并或推送 |

## 个人远端分支

personal 是用户的 waldongao/paperclip，origin 是官方仓库。个人远端默认分支
为 master。API 返回实际有 1,107 条分支，其中 codex/ 前缀有 316 条；本地仅缓存
两条个人开发分支，不能据此认为远端只有两条。

| 与官方当前分支比较 | 数量 | 整理原则 |
| --- | ---: | --- |
| 同名、同 SHA | 1,057 | 保存引用和提交对象后，可清理个人仓库中的副本 |
| 同名、仅落后，无独有提交 | 16 | 保留 master，其他先归档再清理 |
| 同名但历史分叉 | 12 | 先保存引用，不合入稳定维护版 |
| 官方当前已无同名 | 22 | 保留中文化和环境两条；其他 20 条归档审查 |

本次没有删除本地或远端分支。分类是当日快照，删除前必须重新核对 SHA，并在
可联网环境保存包含提交对象的 Git bundle；仅保存分支名不足以恢复历史。

## 已落实的修复

- 稳定测试 runner 补齐 Cursor Cloud、Cursor Local、Gemini、Kimi、Pi，并增加
  对照根 Vitest 配置的覆盖回归，防止新增测试项目被漏跑。
- CLI 批量技能更新的 JSON 保持原始英文/API 消息，终端显示继续本地化。
- 修正 Kimi 核心操作技能的过期测试契约；Cursor/Gemini 的远程工作区测试
  适配分块文件读取；Gemini ACP 与 CLI doctor 单测隔离真实用户目录和端口。
  保留原有行为断言，并补充核心技能、桥接生命周期和端口警告保留断言。
- AGENTS.md 修正过期的 PGlite 与重置目录描述，指向 embedded PostgreSQL
  的当前路径与备份要求。

## 验证与阻塞

| 检查 | 结果 |
| --- | --- |
| 前端完整 Vitest 项目 | 558 个文件、5,397 项测试通过 |
| CLI Vitest（排除受限的 worktree 测试文件） | 60 个文件、409 项测试通过；2 个文件、2 项测试按项目原配置跳过 |
| 新纳入的五类适配器完整 Vitest 项目 | 24 个文件、174 项测试通过 |
| 稳定 runner 调度/分片回归 | 14 项通过，覆盖全部 19 个非 server 项目 |
| UI / CLI 类型检查及生产构建 | 通过 |
| server 直接 TypeScript 检查 | 通过；不代表完整 server 构建门槛通过 |
| 数据库迁移编号与安全静态检查 | 通过；未对业务数据库执行迁移 |
| 中文覆盖、设计 token gates、git diff --check | 通过 |
| 标准全仓 typecheck / test:run / build | 未通过：tsx IPC 监听被沙箱拒绝 |
| 完整 server 类型检查入口 | 未通过：prepare:runner-vendor 所需 cargo 未安装 |
| worktree 集成测试与实际服务启动 | 未验证通过：进程身份检查/本地监听受沙箱限制 |

以上是当前中文版及本次修复的验证，**不是新正式版整合后的验证**。完整发布门槛
及隔离实例运行验证全部通过后，才可标记最终稳定版。Gemini ACP 单测中的
socket transport 使用 FakeRuntime 边界模拟，真实桥接集成行为仍需另行验证。

当前会话对现有 Git 元数据只读，git fetch 无法写入 FETCH_HEAD；终端访问
GitHub 也受 DNS/网络限制，应用工作树工具不可用。因此尚未拉取、创建分支、
合并、提交、切换、推送或清理引用。

标准全仓命令已尝试，但 tsx CLI 创建 IPC 监听时被沙箱拒绝（listen EPERM），
不能将窄范围通过视为全仓发布通过。没有为绕过限制修改产品启动脚本。

## 恢复可写 Git 与联网环境后的顺序

1. 保存本次源码修复，记录本地/个人远端全部 SHA 并备份对应提交对象。
2. 备份实际实例数据库、上传文件、工作区和 secrets master key。
3. 获取正式版标签，在独立 worktree 建立唯一维护分支（建议 codex/stable）。
4. 基于正式版移植本机环境、中文化与本次修复并解决冲突；不要重复合入环境
   祖先、引导归档或发布前备份。核对源数据库迁移版本，禁止降级。
5. 运行 pnpm -r typecheck、pnpm test:run、pnpm build、pnpm check:i18n 和
   pnpm check:token-gates；再以独立数据目录验证启动、健康接口、中文界面和 CLI。
   正式实例按发布说明停旧进程后切换，避免新旧 workspace restore 锁协议混用。
6. 验证通过后推送个人仓库，保留原中文版作回退，再清理已备份且确认冗余的
   分支，更新日常维护入口。

只读来源：[个人引用](https://api.github.com/repos/waldongao/paperclip/git/matching-refs/heads/)、
[官方引用](https://api.github.com/repos/paperclipai/paperclip/git/matching-refs/heads/)、
[正式版标签](https://api.github.com/repos/paperclipai/paperclip/git/ref/tags/v2026.1012.0)。
