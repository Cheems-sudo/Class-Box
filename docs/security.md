# 安全与隐私建议

班级盒子会处理班级成员身份、通知内容、收藏记录、订阅授权和管理员权限。自行部署时，建议把它当作一个真实班级系统来配置，而不只是一个演示小程序。

这份文档面向部署者和运营者，重点说明哪些数据需要保护、哪些操作必须走云函数、日志应该如何脱敏，以及哪些配置不能公开。

## 需要重点保护的数据

以下数据不应公开，也不应出现在仓库、截图、日志或演示数据中：

- 小程序 AppID、云环境 ID、订阅消息模板 ID。
- AI 服务 API Key、Base URL、模型配置等服务端凭据。
- 用户 openid、unionid。
- 真实学生姓名和学号。
- 管理员和超级管理员邀请码。
- `cloud://` 云文件地址和云存储 fileID。
- `access_token`、`secret`、`key`、`password`、`token` 等凭据。

如需展示示例，请使用 `example`、`your-*`、`openid_example` 这类占位值。

## 本地配置文件

仓库只应提交 example 配置：

- `project.config.example.json`
- `miniprogram/config.example.js`
- `cloudfunctions/sendNoticeMessage/config.example.js`
- `cloudfunctions/saveNoticeSubscriber/config.example.js`

以下文件只属于本地部署环境，不应提交：

- `project.private.config.json`
- `project.config.json`
- `miniprogram/config.js`
- `cloudfunctions/sendNoticeMessage/config.js`
- `cloudfunctions/saveNoticeSubscriber/config.js`

这些文件已写入 `.gitignore`，正常情况下 Git 会自动忽略。

AI 辅助发布所需的 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 只能放在云函数环境变量或服务端配置中，不能写入小程序前端代码，也不能提交到仓库。

## 权限边界

不要只依赖前端判断权限。前端可以决定按钮是否显示，但不能作为安全边界。

以下操作应始终通过云函数完成：

- 成员身份认证。
- 管理员邀请码校验。
- 发布事项。
- 编辑事项。
- 删除事项。
- 更新置顶状态。
- 保存订阅授权。
- 发送订阅消息。
- AI 辅助解析发布草稿。
- 提交意见反馈。
- 查看用户反馈。

普通用户不应直接写入 `notices`、`subscribers`、`feedbacks`、`security_counters`、`operation_logs` 等关键集合，也不应直接读取 `feedbacks`。反馈提交应通过 `submitFeedback`，反馈查看应通过 `listFeedbacks` 校验超级管理员权限。数据库权限建议见 [database-permissions.md](database-permissions.md)。

## 数据库安全

建议重点保护以下集合：

- `class_members`：包含班级成员姓名、学号和绑定状态。
- `users`：包含用户 openid、认证状态和权限角色。
- `admin_invite_codes`：包含管理员/超级管理员邀请码。
- `subscribers`：包含订阅消息授权记录。
- `feedbacks`：包含用户身份和反馈内容。
- `security_counters`：包含频率限制计数和失败记录。
- `ai_usage_logs`：包含 AI 辅助发布调用日志。
- `operation_logs`：包含关键操作日志。

建议做法：

- `class_members` 和 `admin_invite_codes` 不对普通用户开放直接读写。
- `subscribers` 只通过 `saveNoticeSubscriber` 写入。
- `feedbacks` 只通过 `submitFeedback` 写入，并只通过 `listFeedbacks` 向超级管理员返回必要字段。
- `security_counters` 只由云函数维护。
- `ai_usage_logs` 只由 `parseNoticeWithAI` 写入，普通用户不可直接读取或写入。
- `operation_logs` 只由云函数写入，普通用户不可直接读取。
- 根据运营需要定期清理过期的 `security_counters` 和历史 `operation_logs`。

## 邀请码安全

管理员邀请码相当于提权凭证，应按敏感数据处理。

建议：

- 邀请码只保存在云数据库中，并通过云函数校验。
- 邀请码设置 `expiredAt`。
- 邀请码使用后立即标记为 `used: true`。
- 不在前端、日志或报错信息中展示完整邀请码。
- 如需记录授权来源，只记录角色、成功/失败状态、失败原因和脱敏后的 `codePrefix`。

## 日志安全

日志用于排查问题和审计关键操作，但不应成为敏感信息泄露点。

建议不要记录：

- 完整请求 `event`。
- 事项正文原文。
- 真实姓名和学号。
- 附件 fileID 或 `cloud://` 地址。
- 完整邀请码。
- 真实配置值。
- AI 辅助发布的管理员输入原文和 AI 返回完整正文。

错误日志建议只记录错误类型、错误码、操作类型和脱敏后的上下文。

## 内容安全

发布和编辑事项时，应在云函数侧执行内容安全检测。前端检测只能优化体验，不能作为唯一安全边界。

建议检测：

- 标题和正文。
- 链接标题和链接地址。
- 图片内容。
- 图片和附件名称。

AI 辅助发布只生成草稿，不直接写入 `notices`。管理员输入在调用 AI 前需要先经过内容安全检测，AI 草稿确认发布时仍必须继续走现有发布安全检测。

## 发布前检查

部署或公开分享项目前，建议检查：

- 真实配置文件没有被 Git 跟踪。
- README 和 docs 中只使用占位数据。
- 仓库中没有真实 AppID、云环境 ID、模板 ID。
- 仓库中没有真实 openid、学生信息、邀请码。
- 仓库中没有 `cloud://` 文件地址或云存储 fileID。
- 数据库权限已经按最小权限配置，并用普通用户账号测试过。
