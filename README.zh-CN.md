# Codex Computer Use Remote for macOS

把 OpenAI **官方签名的 macOS Computer Use runtime** 当成远程 MCP 执行后端：
Mac 不需要登录 ChatGPT 账号，也不需要在 Mac 上再跑一个模型进程。

本项目是对 MIT 项目
[`tmustier/codex-computer-use-mcp`](https://github.com/tmustier/codex-computer-use-mcp)
的兼容补丁和安装层。仓库**不分发任何 OpenAI 二进制**；安装时只使用用户自己
`/Applications/ChatGPT.app` 里已经存在的官方组件。

> 独立第三方项目，不是 OpenAI 产品，也不受 OpenAI 官方支持。依赖实验性/内部
> app-server 与 Computer Use 行为，ChatGPT/Codex 更新后可能失效。

## 核心目标

```text
Debian / 其他远程 Codex 客户端
        |
        | MCP over SSH
        v
Mac（仅 GUI executor）
        |
        +-- OpenAI signed Codex app-server
        +-- SkyComputerUseClient
        +-- SkyComputerUseService
        |
        v
Finder / Xcode / Safari / macOS App
```

远端 Codex 客户端是唯一 reasoning 模型。已验证的 Mac 本地调用中，Finder 的
`get_app_state` 能返回 Accessibility tree + JPEG screenshot，同时
`modelTurnsStarted = 0`。

## 环境要求

- macOS，桌面用户已登录且未锁屏
- 官方 `/Applications/ChatGPT.app`
- Node.js 22+
- Git / npm / Python 3
- 给 **Codex Computer Use** 开启 Accessibility 与 Screen Recording 权限
- 远程场景需要 SSH

这条兼容路径**不要求在 Mac 上登录 ChatGPT 账号**；ChatGPT.app 可以保持未登录，本地验证时 Mac 自带 Codex CLI 也处于登出状态。

## Mac 安装

```bash
git clone https://github.com/kiminih/codex-computer-use-remote.git codex-computer-use-remote
cd codex-computer-use-remote
./scripts/install.sh
./scripts/doctor.sh
./scripts/smoke-local.sh
```

安装脚本会：

1. 从本机 ChatGPT.app 找到官方 `Codex Computer Use.app`；
2. 必要时复制到 `~/.codex/computer-use/`；
3. 校验 OpenAI Team ID `2DC432GLL2`；
4. 拉取 `tmustier/codex-computer-use-mcp`；
5. 应用 zero-auth / remote compatibility patch；
6. `npm ci && npm run build`；
7. 安装 `~/.local/bin/mac-computer-use-mcp`。

不会修改、重签名 ChatGPT.app 或任何 OpenAI binary。

## 我们改了什么

上游已经实现“direct Computer Use、无 nested model turn”。本项目补上新版 CUA
runtime 在实际调试中缺失的几层兼容：

- 同时传递 `CODEX_HOME` 与 `CODEX_SQLITE_HOME`；
- 在隔离 `CODEX_HOME/computer-use/` 映射已验证的官方 runtime；
- 把 `requires_openai_auth = false` 的 dummy provider 写进隔离 `config.toml`，让
  Service 自己拉起的 auth-status app-server 也能看到；
- 把 `/Applications/ChatGPT.app/Contents/Resources` 加到 PATH，因为
  `SkyComputerUseService` 实际执行的是 `env codex app-server --listen stdio://`。

Dummy provider 仍指向不可达的 `127.0.0.1:9`，上游也仍会在检测到 model-turn
activity 时 fail closed。

## 本机验证

```bash
./scripts/smoke-local.sh
```

预期：

```json
{
  "isError": false,
  "modelTurnsStarted": 0,
  "brokerCleanupVerified": true
}
```

并返回 Finder 的界面树和截图。

## Debian / 局域网 SSH

直接 SSH 启 MCP 可能处于 Background launchd/audit session。本次调试里表现为：
Mac 本地 Finder 正常，但 SSH 直接调用返回 `-600 procNotFound`。

安装 GUI/Aqua launcher：

```bash
./scripts/install.sh --with-ssh-gui
```

它会创建一个 root-owned 固定 launcher，通过 `launchctl asuser` 进入当前桌面
用户 GUI session，然后立即 `sudo -u` 降回普通用户，再启动 MCP。

远端测试：

```bash
timeout 5 ssh -T mac-host 'sudo -n /usr/local/sbin/codex-computer-use-gui'
echo $?
```

返回 `124` 表示 MCP 一直正常等待 stdio，最终只是被 timeout 结束。

远端 Codex 配置：

```toml
[mcp_servers.mac-computer-use]
command = "ssh"
args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-T", "mac-host", "sudo", "-n", "/usr/local/sbin/codex-computer-use-gui"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

## 权限与 TCC

macOS Accessibility / Screen Recording 仍必须正常授权。

SSH 场景还可能出现：

```text
responsible_path=/usr/libexec/sshd-keygen-wrapper
access to kTCCServiceAppleEvents denied
```

诊断：

```bash
./scripts/tcc-diagnose.sh
```

本项目默认**不会自动改 TCC.db**。如果确认是这个问题，可参考 `macuse` 的 SSH
repair 流程并先备份：
https://github.com/fitchmultz/macuse

## 当前验证边界

见 [docs/TESTED.md](docs/TESTED.md)：

- Mac 本地 zero-auth / zero-turn Finder 读取：**已验证成功**
- SSH → Aqua launcher 免密启动并保持 stdio：**已验证成功**
- 改成 Aqua launcher 后的远端 Finder 最终读取：打包本项目时**尚未重新执行最终验证**

因此发布首版时建议标记为 experimental。

## License / 上游

- 上游：`tmustier/codex-computer-use-mcp`，MIT
- 上游版权：Copyright (c) 2026 Thomas Mustier
- 本项目兼容/安装层：MIT
- 本仓库不包含 OpenAI proprietary binaries
