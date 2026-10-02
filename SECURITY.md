# Security

## Desktop access

A connected client can read and operate the logged-in user's Mac apps. Use a trusted SSH account and controller. Do not expose the service through an unauthenticated network listener. App text and screenshots can contain private data.

## Controls

The bridge verifies signed components, isolates credentials, validates tool arguments, serializes calls and cancels unsupported approvals. It does not request model inference. These controls do not replace macOS permissions or provide system-wide network or usage auditing.

The optional GUI launcher accepts no arguments, requires root-controlled directories and drops privileges before running user-writable code. Keep its sudoers rule limited to that launcher.

## Reporting

Report vulnerabilities privately to the repository owner, using GitHub private reporting when enabled. Leave credentials, private screenshots and sensitive logs out of public issues. Obtain proprietary runtime updates from the official source.
