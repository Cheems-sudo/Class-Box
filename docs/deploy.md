# 部署说明

本文档面向自行部署班级盒子的使用者。请使用自己的微信小程序、云开发环境、数据库和订阅消息模板，不要使用正式项目的任何真实配置。

## 1. 准备配置

1. 在微信公众平台创建或准备自己的小程序。
2. 在微信开发者工具中开通云开发。
3. 复制 `project.config.example.json` 为本地项目配置，并填入自己的 AppID。
4. 复制 `miniprogram/config.example.js` 为 `miniprogram/config.js`，填入自己的云环境 ID 和订阅消息模板 ID。
5. 复制 `cloudfunctions/sendNoticeMessage/config.example.js` 为 `cloudfunctions/sendNoticeMessage/config.js`，填入自己的订阅消息模板 ID。
6. 复制 `cloudfunctions/saveNoticeSubscriber/config.example.js` 为 `cloudfunctions/saveNoticeSubscriber/config.js`，填入同一个订阅消息模板 ID。
7. 如需启用 AI 辅助发布，在 `parseNoticeWithAI` 云函数环境变量或服务端配置中设置：
   - `AI_API_KEY`
   - `AI_BASE_URL`，应指向兼容 `/chat/completions` 的服务根地址
   - `AI_MODEL`，未设置时云函数会使用内置默认模型名

不要提交以下文件：

- `project.private.config.json`
- `project.config.json`
- `miniprogram/config.js`
- `cloudfunctions/sendNoticeMessage/config.js`
- `cloudfunctions/saveNoticeSubscriber/config.js`

## 2. 部署云函数

使用者需要在微信开发者工具中部署 `cloudfunctions` 下所有云函数。

需要部署的云函数列表：

- `applyAdminInvite`
- `checkAdmin`
- `createNotice`
- `deleteNotice`
- `listFeedbacks`
- `parseNoticeWithAI`
- `saveNoticeSubscriber`
- `sendNoticeMessage`
- `submitFeedback`
- `updateNotice`
- `updateNoticePin`
- `verifyMember`

其中 `createNotice`、`updateNotice` 会在云函数内部使用微信内容安全相关 OpenAPI 权限，包括文本检测和图片检测。`submitFeedback` 会在反馈写入前进行文本内容安全检测。`parseNoticeWithAI` 会先对管理员输入进行文本内容安全检测，再访问配置的 AI 服务地址生成草稿。

`sendNoticeMessage/config.json` 已声明订阅消息发送 OpenAPI 权限，部署时请确认该权限配置生效。

`parseNoticeWithAI/config.json` 已声明文本内容安全检测 OpenAPI 权限，部署时也请确认该权限配置生效。AI 辅助发布只生成草稿，不会直接写入 `notices`；管理员确认发布时仍会走 `createNotice` 的权限校验和内容安全检测。

`submitFeedback/config.json` 已声明文本内容安全检测 OpenAPI 权限，部署时请确认该权限配置生效。

## 3. 创建数据库集合

使用者需要在云开发数据库中创建项目所需集合：

- `notices`
- `users`
- `admin_invite_codes`
- `class_members`
- `subscribers`
- `favorites`
- `feedbacks`
- `security_counters`
- `ai_usage_logs`
- `operation_logs`

`feedbacks` 用于保存用户提交的意见反馈，建议只允许通过 `submitFeedback` 云函数写入，并通过 `listFeedbacks` 云函数供超级管理员只读查看。

`security_counters` 使用固定时间桶记录发布、编辑、邀请码尝试、反馈提交等频率限制计数。

`ai_usage_logs` 用于记录 AI 辅助发布的调用情况，不保存用户输入原文或 AI 返回完整正文。

`operation_logs` 用于身份认证、管理员授权、事项发布、编辑、删除等关键操作日志。

建议定期删除 `security_counters.expiresAt` 已过期的记录，并根据运营需要为 `operation_logs` 设置保留周期。

建议为高频查询字段创建索引，例如：

- `users.openid`
- `users.verified`
- `class_members.name`
- `class_members.studentId`
- `notices.createdAt`
- `notices.publisherOpenid`
- `favorites.openid`
- `favorites.noticeId`
- `feedbacks.createdAt` + `feedbacks._id` 组合倒序索引，用于超级管理员反馈列表游标分页
- `security_counters.openid`
- `security_counters.action`
- `security_counters.windowStart`
- `ai_usage_logs.openid`
- `ai_usage_logs.createdAt`
- `operation_logs.openid`
- `operation_logs.action`
- `operation_logs.createdAt`

## 4. 数据库权限

建议尽量收紧数据库权限：

- 普通用户不应直接写入 `notices`，发布应通过 `createNotice` 云函数。
- 普通用户不应直接写入 `subscribers`，订阅授权应通过 `saveNoticeSubscriber` 云函数保存。
- 普通用户不应直接读写 `feedbacks`，反馈提交应通过 `submitFeedback` 云函数，超级管理员查看应通过 `listFeedbacks` 云函数。
- 普通用户不应直接写入 `security_counters`。
- 普通用户不应直接读写 `ai_usage_logs`。
- 普通用户不应直接写入 `operation_logs`。
- 管理员授权、发布、编辑、删除等敏感操作应通过云函数完成权限校验。
- `class_members`、`admin_invite_codes` 等敏感集合不要开放普通用户直接读写。

具体权限矩阵见 `docs/database-permissions.md`，再结合你的云开发环境和业务需求配置。

## 5. 导入班级成员数据

使用者需要自行导入班级成员数据到 `class_members` 集合。

示例：

```json
{
  "name": "示例学生",
  "studentId": "2026000000",
  "boundOpenid": null,
  "verified": false,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

请不要把真实学生姓名和学号提交到开源仓库。

## 6. 创建邀请码

使用者需要自行创建管理员/超级管理员邀请码，并写入 `admin_invite_codes` 集合。

管理员邀请码示例：

```json
{
  "code": "BW-EXAMPLE-0001",
  "role": "admin",
  "used": false,
  "usedByOpenid": null,
  "usedAt": null,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "expiredAt": "2026-12-31T23:59:59.000Z"
}
```

超级管理员邀请码示例：

```json
{
  "code": "SUPER-EXAMPLE-0001",
  "role": "superAdmin",
  "used": false,
  "usedByOpenid": null,
  "usedAt": null,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "expiredAt": "2026-12-31T23:59:59.000Z"
}
```

邀请码应设置过期时间，并且只能使用一次。

## 7. 配置订阅消息

使用者需要在微信公众平台配置订阅消息模板，并将模板 ID 填入：

- `miniprogram/config.js`
- `cloudfunctions/sendNoticeMessage/config.js`
- `cloudfunctions/saveNoticeSubscriber/config.js`

开源仓库只保留 example 配置，不包含真实模板 ID。

## 8. 发布前检查

发布前建议检查：

- 所有云函数已部署。
- 超级管理员查看反馈前，`listFeedbacks` 已部署。
- 数据库集合已创建。
- `feedbacks`、`security_counters` 和 `operation_logs` 已创建且权限收紧。
- 如启用 AI 辅助发布，`parseNoticeWithAI` 已部署，`AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 已在该云函数环境或服务端配置中设置。
- 班级成员数据已导入。
- 管理员/超级管理员邀请码已创建。
- 订阅消息模板 ID 已配置。
- 开源仓库中没有真实 AppID、云环境 ID、模板 ID、openid、真实学生信息、真实邀请码或 `cloud://` 文件地址。
