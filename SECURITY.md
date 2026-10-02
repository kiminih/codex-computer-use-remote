# Security

Treat access to this stdio MCP service as access to the logged-in user's desktop.
Only use a trusted SSH account and controller. Do not expose it on an unauthenticated
network listener. Native operations can access private application data.

The bridge verifies official signatures, isolates configuration and credentials,
never requests model inference, checks tool arguments, serializes operations and
cancels unsupported approvals. These controls do not replace macOS TCC or provide
a system-wide network/billing guarantee.

The optional privileged launcher accepts no arguments, requires root-controlled
parent directories and drops to the intended desktop user before executing any
user-writable code. Never extend its sudoers rule to arbitrary launchctl commands.

Report vulnerabilities to the repository owner through GitHub's private reporting
feature when available. Do not include credentials or personal screenshots in a
public issue. The proprietary runtime must be updated through its official source.
