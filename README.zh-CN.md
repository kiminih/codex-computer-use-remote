# Codex Computer Use Remote

**自包含的 macOS Computer Use MCP：不拉取上游仓库，不安装 npm 依赖，不需要编译。**

使用本机 ChatGPT.app 中的官方签名组件。**已验证的兼容路径不需要在 Mac 上登录
ChatGPT 账号，ChatGPT.app 和 Mac Codex CLI 都可以保持未登录。** 远端客户端负责
模型推理，Mac 端只负责界面操作；远端客户端本身的模型用量不受本项目改变。

[English](README.md) · [架构](docs/ARCHITECTURE.md) · [测试记录](docs/TESTED.md)

> **v0.2.0 experimental。** 这次自包含重写已经加入自动化测试，但尚未完成新版代码的
> macOS 实机验收。之前的兼容版本确实在 Mac CLI 登出时读到了 Finder 界面树和截图，
> 不能把那次成功当作本次重写的实机回归结果。具体边界见测试记录。
>
> 独立第三方项目，不受 OpenAI 官方支持。依赖官方组件的内部接口，更新 ChatGPT.app
> 后可能需要重新适配。无需登录不等于绕过 macOS 权限或官方组件的授权提示。

## 环境要求

Mac 桌面用户已登录且未锁屏，保留官方 `/Applications/ChatGPT.app`，安装 Node.js 22+
并给 **Codex Computer Use** 开启辅助功能、屏幕与系统音频录制权限。远程使用还需要 SSH。

不需要 Python、TypeScript、MCP SDK、Zod、`npm install` 或构建步骤。
Git 只是下载项目的一种方式，也可以下载源码压缩包。安装过程本身不联网。

## Mac 安装

```bash
git clone https://github.com/kiminih/codex-computer-use-remote.git
cd codex-computer-use-remote
bash scripts/install.sh
bash scripts/doctor.sh
bash scripts/smoke-local.sh
```

安装器从**已安装的 ChatGPT.app** 提取 `Codex Computer Use.app`，不是直接解压 DMG。
必要时复制到 `~/.codex/computer-use/`，并检查 Codex、Service、Client 的签名及 OpenAI
Team ID。已有 runtime 只校验，不静默覆盖。不修改、不重签名任何官方二进制。

自己的运行代码安装在：

```text
~/.local/share/codex-computer-use-remote/current/
```

启动入口是：

```text
~/.local/bin/mac-computer-use-mcp
```

这是 stdio MCP 服务，不是交互式命令行。正常使用由客户端自动启动，不需要另开终端
长期手工运行。支持 `--version`、`--status`、`--smoke`；状态检查成功不代表 GUI 可用。

## Debian / 局域网接入

在 Mac 上安装 GUI/Aqua 启动器：

```bash
bash scripts/install.sh --with-ssh-gui
```

它会创建 root-owned 的 `/usr/local/sbin/codex-computer-use-gui`，以及权限为 `0440`
的 sudoers 文件。免密规则仅允许这个固定命令，**不接受额外参数**。启动器核对当前桌面
用户，通过 `launchctl asuser` 切到 GUI 会话，再降回普通用户运行 MCP，不用 root 跑界面操作。
如果特权目录可被普通用户改写，安装会停止，而不是放宽权限。

远端 `~/.codex/config.toml`：

```toml
[mcp_servers.mac-computer-use]
command = "ssh"
args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-T", "mac-host", "sudo", "-n", "/usr/local/sbin/codex-computer-use-gui"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

`mac-host` 换成自己的 SSH alias，参考 [examples/ssh-config](examples/ssh-config)。
配置更新后重启客户端。也可以在远端项目目录直接测试，不启动任何模型：

```bash
node scripts/smoke-remote.mjs mac-host
```

这条命令通过 SSH 读取 Finder 并检查截图返回。读取状态可能激活应用，但不会主动点击、
输入或滚动。`timeout` 返回 `124` 只说明进程存活，**不能当作 MCP 或 GUI 验收通过**。

## 工具和会话

提供 `list_apps`、`get_app_state`、`click`、`perform_secondary_action`、`set_value`、
`select_text`、`scroll`、`drag`、`press_key`、`type_text`，以及 `computer_use_status`。

操作前必须先 `get_app_state`，后续使用同一个 app 参数。请求串行执行并复用会话，避免元素
编号失效。空闲 120 秒、失败、取消或断开后清理会话，下一次操作必须重新读取状态。
同一 Mac 用户同时只允许一个 native 会话，避免多个控制端互相干扰。

官方组件要求确认时，支持的客户端会收到确认请求；不支持或未回答的请求取消，**不会自动同意**。
当前实现支持协商后的 MCP stdio 2025-11-25、2025-06-18、2025-03-26、2024-11-05，
不声称支持所有新草案，也不提供 HTTP、sampling、任意 shell 或任务执行接口。

## 隔离和用量

每次会话创建独立的 `CODEX_HOME`、`CODEX_SQLITE_HOME`、配置和 runtime 映射，不继承本机
账号文件、API key、shell 启动文件或 `NODE_OPTIONS`。同时把官方 Codex 所在目录放进 PATH，
让 native Service 能找到 `env codex app-server`。

模型地址仍指向 `127.0.0.1:9`。本项目不发送 `turn/start`，发现 `turn/*` 或 `item/*`
事件就中止会话。这是无推理调用设计，**不是全机网络隔离或计费审计**；`modelTurnsStarted`
只是当前连接的观测值，不代表能检查所有闭源子进程。项目不落盘记录截图或应用文本，
但读取到的内容仍会返回给发起请求的客户端，请只连接可信控制端。

清理只针对本次会话拥有的进程，不会全局 `pkill` 所有 Codex 或 Computer Use。清理失败会
报告错误，并保留临时目录供排查。

## 升级和回滚

从新版源码重新运行安装器即可。安装会先暂存新版本并备份已有 wrapper，再切换。
v0.1 的 upstream 目录保留用于回滚，v0.2 运行不再读取它。

```bash
bash scripts/rollback.sh
bash scripts/uninstall.sh
```

默认卸载只移除本项目识别的启动器，保留版本目录、备份、官方 runtime、ChatGPT.app 和账号数据。
`bash scripts/uninstall.sh --remove-runtime` 仅在安装记录确认 runtime 由本项目新建时额外删除它，
不会删除安装前已经存在的 runtime。

## 自动化测试

```bash
node scripts/check.mjs
node --test test/*.test.mjs
```

无需账号、API key 或网络。测试包含协议、参数、会话复用、取消、权限确认、模型事件拦截、
子进程清理和完整 MCP 调用链。真实辅助功能权限、屏幕录制、Aqua 和 Finder 仍需实机验收。
遇到错误先看 [排查说明](docs/TROUBLESHOOTING.md)，不要反复改 TCC 数据库或登录账号。

## 开源说明

本项目代码使用 MIT。保留 Thomas Mustier 上游工作的版权和来源说明，详见 [NOTICE.md](NOTICE.md)。
**保留署名不等于继续依赖上游仓库。** 不分发任何 OpenAI 二进制、登录凭证、TCC 数据库、SSH 私钥或私人截图。
