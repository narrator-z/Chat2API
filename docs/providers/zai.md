# Z.ai

| 项目 | 说明 |
| --- | --- |
| 供应商 ID | zai |
| 官网 | https://chat.z.ai |
| API Base | https://chat.z.ai/api |
| 认证 | JWT Token |
| 凭据字段 | `token`，可选 `captcha_verify_param` |

## 默认模型

| 显示名称 | 实际模型 ID |
| --- | --- |
| GLM-5.1 | GLM-5.1 |
| GLM-5-Turbo | GLM-5-Turbo |
| GLM-5V-Turbo | GLM-5v-Turbo |
| GLM-5 | glm-5 |
| GLM-4.7 | glm-4.7 |

## 适配状态

已适配：流式对话、非流式对话、多轮会话、账号级清理对话记录、GLM 系列模型映射。

最新 HAR 适配：`X-FE-Version: prod-fe-1.1.37`、`X-Region: domestic`、带浏览器环境 query 参数和 token 认证头的 `/api/v2/chat/completions` 请求。若官网触发验证码，需从最新完成请求体中复制 `captcha_verify_param` 到账号凭据。

后续验证：模型升级、视觉模型 `GLM-5V-Turbo` 的附件/图片输入字段、清理会话接口返回字段。

## 教程

1. 登录 `chat.z.ai`。
2. 打开 DevTools -> Application -> Cookies 或请求头，复制以 `eyJ` 开头的 JWT token。
3. 如果官网对话请求体包含 `captcha_verify_param`，同时复制该字段值。
4. 在供应商管理中添加 Z.ai 账号，填入 `token`，必要时填入 `captcha_verify_param`。
5. 优先使用 `GLM-5.1` 或 `GLM-5-Turbo` 验证基础对话能力；视觉模型使用 `GLM-5V-Turbo`，实际请求 ID 为 `GLM-5v-Turbo`。
