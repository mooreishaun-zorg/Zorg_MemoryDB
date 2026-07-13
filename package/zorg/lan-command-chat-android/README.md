# LAN Command Chat Android

Native Android client for LAN Command Chat. Chat, history, live gauges, theme
controls, and the Memory Brain 3D surface use Android views and direct JSON
contracts. The app has no WebView or OpenClaw TUI dependency.

This is the native Android application, not the browser LAN Console. The APK
does not include the browser page's Android download link or browser-only
controls. Install and operate the browser app and the Memory 3D service
separately; the Android app consumes their authenticated APIs.

The native client presents the LAN Chat password login when the saved auth
cookie is absent or expired; it never embeds a password in the APK.

The app stores multiple configurable chat profiles on-device. Each profile has
an internet URL plus an optional internal host and port. Requests try the
internal route first and fall back to the internet origin when it is not
reachable. The Android client consumes the LAN Chat contract at
`/api/chat/send`, `/api/chat/history`, and `/api/chat/status`; it does not use
the OpenClaw TUI.

Build defaults are centralized in `gradle.properties`:

```bash
./gradlew assembleDebug \
  -PLAN_CHAT_DEFAULT_NAME="Zorg LAN Command Chat" \
  -PLAN_CHAT_DEFAULT_URL="https://chat.example.net/chat"
```

The app supports HTTP for explicitly configured LAN deployments and HTTPS for
internet deployments. Production internet endpoints should always use HTTPS.

The app reports unavailable or degraded live data instead of inventing gauge
values. No credentials or private scheduler configuration is embedded in the
APK.
