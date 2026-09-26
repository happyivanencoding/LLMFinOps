# Android 桌面 Widget

LLMFinOps 提供一个轻量 Android companion，用于在手机桌面直接查看账户余额。

## 功能

- 每个账户一行展示余额。
- 仅展示网页首页中未隐藏的币种；币种显示偏好保存在 LLMFinOps 服务端，因此网页与 Widget 共用。
- 约每 30 分钟由 Android 系统刷新，也可点击右上角 ↻ 手动刷新。
- 点击 Widget 打开 https://finops.thegreatnovel.com/#overview。
- Widget 使用独立的只读 Token；供应商 API Key 不会下发到手机。

## 配置

1. 在 LLMFinOps 网页打开“设置”。
2. 找到“Android 桌面 Widget”。
3. 点击“显示 Widget Token”。
4. 安装 Android APK 并打开 LLMFinOps Widget。
5. 服务器地址保持 `https://finops.thegreatnovel.com`。
6. 点击“允许后台刷新”，按系统提示允许 LLMFinOps Widget 不受电池优化限制。Samsung / Android 在省电模式下可能会阻断普通后台 DNS 与网络请求；这是桌面余额自动更新所必需的。
7. 粘贴 Widget Token，点击“测试连接”。
8. 点击“保存并刷新 Widget”。
9. 回到 Android 桌面，长按空白区域 → Widget → LLMFinOps Widget。

如果重新生成 Widget Token，已配置手机需要输入新的 Token。若 Widget 提示后台网络受系统省电限制，打开 LLMFinOps Widget App 并重新点击“允许后台刷新”。
