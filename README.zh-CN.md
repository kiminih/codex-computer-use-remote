# Codex Computer Use Remote

让 Codex 等 MCP 客户端读取和操作 Mac 应用，支持截图、点击、输入和滚动。可在本机使用，也可通过 SSH 从另一台电脑连接。

使用本机 ChatGPT.app 内置的 Computer Use 组件，**Mac 端无需登录 ChatGPT 账号**。

[English](README.md) · [故障排查](docs/TROUBLESHOOTING.md) · [架构](docs/ARCHITECTURE.md)

> v0.2 为实验版本：自动化测试已通过，真实桌面和 SSH 操作尚待验证。详见[测试记录](docs/TESTED.md)。

## 环境要求

- Mac 桌面用户已登录，屏幕未锁定。
- 官方 ChatGPT.app 已安装在 `/Applications`，并保留在机器上。
- Node.js 22 或更新版本。远程连接还需要开启 Mac 的 SSH 访问。

## 在 Mac 上安装

```bash
git clone https://github.com/kiminih/codex-computer-use-remote.git
cd codex-computer-use-remote
bash scripts/install.sh
```

脚本会提取并校验所需组件。在“系统设置 → 隐私与安全性”中，为 **Codex Computer Use** 开启辅助功能、屏幕与系统音频录制权限，再检查安装并测试读取 Finder：

```bash
bash scripts/doctor.sh
bash scripts/smoke-local.sh
```

读取成功时会返回 Finder 的界面文字和截图。

安装后的 MCP 启动命令是 `~/.local/bin/mac-computer-use-mcp`。由客户端自动启动，无需另开终端保持运行。

## 从另一台电脑连接

先在 Mac 上安装远程启动器：

```bash
bash scripts/install.sh --with-ssh-gui
```

这一步需要 sudo 权限，用于进入桌面会话。MCP 本身仍以普通用户身份运行。

在控制端按[示例](examples/ssh-config)配置 SSH 主机别名，将下面的 `mac-host` 换成自己的别名，加入 `~/.codex/config.toml`：

```toml
[mcp_servers.mac-computer-use]
command = "ssh"
args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-T", "mac-host", "sudo", "-n", "/usr/local/sbin/codex-computer-use-gui"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

重启客户端后即可调用。也可在控制端的项目目录测试连接：

```bash
node scripts/smoke-remote.mjs mac-host
```

## 使用

先调用 `get_app_state` 读取界面，再用同一个 `app` 参数操作。

| 用途 | 工具 |
| --- | --- |
| 查看应用和界面 | `list_apps`、`get_app_state` |
| 鼠标和键盘 | `click`、`drag`、`scroll`、`press_key` |
| 文字和控件 | `type_text`、`set_value`、`select_text`、`perform_secondary_action` |
| 检查服务状态 | `computer_use_status` |

每个 Mac 用户同时只允许一个操作会话。报错、取消、断开连接或空闲两分钟后，需要重新读取界面。读取状态可能激活应用。

## 权限与隐私

截图和应用文字会返回给控制端，请只连接可信客户端。macOS 权限和组件授权仍需确认；无法处理的授权请求会取消。

Mac 端不发起模型推理，控制端的模型用量由其所用服务计算。详见[安全说明](SECURITY.md)。

## 升级、回滚和卸载

更新项目后，重新执行安装命令即可。安装时会备份已有启动脚本。

恢复上一版启动脚本：

```bash
bash scripts/rollback.sh
```

卸载启动器：

```bash
bash scripts/uninstall.sh
```

默认保留官方组件、版本备份和账号数据。[完整卸载说明](docs/TROUBLESHOOTING.md#upgrade-and-uninstall)

## 开源说明

本项目使用 [MIT 许可证](LICENSE)，代码来源见 [NOTICE](NOTICE.md)。独立第三方项目，不受 OpenAI 官方支持；ChatGPT.app 更新后可能需要适配。
