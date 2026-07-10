# 部署说明

本文档面向自行部署班级盒子的使用者。请使用自己的微信小程序、云开发环境、数据库和订阅消息模板，不要使用正式项目的任何真实配置。

## 1. 准备配置

1. 在微信公众平台创建或准备自己的小程序。
2. 在微信开发者工具中开通云开发。
3. 复制 `project.config.example.json` 为本地项目配置，并填入自己的 AppID。
4. 复制 `miniprogram/config.example.js` 为 `miniprogram/config.js`，填入自己的云环境 ID 和订阅消息模板 ID。
5. 复制 `cloudfunctions/sendNoticeMessage/config.example.js` 为 `cloudfunctions/sendNoticeMessage/config.js`，填入自己的订阅消息模板 ID。
6. 复制 `cloudfunctions/saveNoticeSubscriber/config.example.js` 为 `cloudfunctions/saveNoticeSubscriber/config.js`，填入同一个订阅消息模板 ID。
7. 如需启用 AI 辅助发布或班级助手，在云环境中启用受 CloudBase Node SDK 支持的模型服务：
   - `parseNoticeWithAI` 和 `askClassAssistant` 均通过 `@cloudbase/node-sdk` 使用云函数环境身份调用，不需要配置 API Key 和 Base URL。
   - 两个云函数均可通过服务端环境变量选择已启用的模型。
   - 部署两个云函数时均选择“云端安装依赖”，确保安装 `@cloudbase/node-sdk` 和 `ws`。

不要提交以下文件：

- `project.private.config.json`
- `project.config.json`
- `miniprogram/config.js`
- `cloudfunctions/sendNoticeMessage/config.js`
- `cloudfunctions/saveNoticeSubscriber/config.js`
- 真实学生手册 PDF、文本和非 example 导入数据

## 2. 部署云函数

使用者需要在微信开发者工具中部署使用到的云函数。

核心功能需要部署：

- `applyAdminInvite`
- `checkAdmin`
- `createNotice`
- `deleteNotice`
- `listFeedbacks`
- `saveNoticeSubscriber`
- `sendNoticeMessage`
- `submitFeedback`
- `updateNotice`
- `updateNoticePin`
- `verifyMember`

启用 AI 快速发布时部署：

- `parseNoticeWithAI`

启用班级助手时部署：

- `askClassAssistant`

其中 `createNotice`、`updateNotice` 会在云函数内部使用微信内容安全相关 OpenAPI 权限，包括文本检测和图片检测。`submitFeedback` 会在反馈写入前进行文本内容安全检测。`parseNoticeWithAI` 会先对管理员输入进行文本内容安全检测，再通过云环境中已启用的模型生成草稿。`askClassAssistant` 会先检测学生输入，再检索学生手册片段并通过已启用的模型生成回答。

`sendNoticeMessage/config.json` 已声明订阅消息发送 OpenAPI 权限，部署时请确认该权限配置生效。

`parseNoticeWithAI/config.json` 已声明文本内容安全检测 OpenAPI 权限，部署时也请确认该权限配置生效。AI 辅助发布只生成草稿，不会直接写入 `notices`；管理员确认发布时仍会走 `createNotice` 的权限校验和内容安全检测。

`submitFeedback/config.json` 已声明文本内容安全检测 OpenAPI 权限，部署时请确认该权限配置生效。

`askClassAssistant/config.json` 已声明文本内容安全检测 OpenAPI 权限，并将云函数超时时间设置为 60 秒。部署时应确认该权限和超时配置已经生效；控制台允许设置的超时范围以实际部署环境为准。

小程序通过 `wx.cloud.callFunction` 调用 `askClassAssistant`，不依赖公网 HTTP 路由。该函数不应配置未启用身份认证的公开路由；如需开放 HTTP 路由，必须启用经过验证的身份认证。

班级助手通过 SDK 的 `streamText()` 在云函数内部读取增量流，汇总完整回答后返回前端。单次 SDK 请求限制为 45 秒、整条处理链限制为 55 秒，为 60 秒云函数超时预留 5 秒收尾时间。只对限流、上游故障和连接重置等可恢复错误重试一次；认证、权限、配置、额度、格式、超时和取消错误不重试。检索无匹配时不会调用 AI，也不会消耗每日 AI 次数。

班级助手按 openid 限制频率：所有角色每分钟最多 3 次；普通成员和管理员每天最多 20 次，超级管理员每天最多 50 次。每日计数按北京时间自然日区分。只有检索到候选内容、准备进入 AI 调用的请求才计次；无匹配结果和固定补充说明不计次。进入 AI 阶段后，即使用户停止回答或上游调用失败，也会保留本次计数，避免通过取消或故障重放绕过限额。

## 3. 创建数据库集合

核心功能需要创建：

- `notices`
- `users`
- `admin_invite_codes`
- `class_members`
- `subscribers`
- `favorites`
- `feedbacks`
- `security_counters`
- `operation_logs`

启用 AI 快速发布时创建：

- `ai_usage_logs`

启用班级助手时创建：

- `handbook_versions`
- `handbook_chunks`
- `class_assistant_logs`
- `class_assistant_requests`
- `class_assistant_gaps`

`feedbacks` 用于保存用户提交的意见反馈，建议只允许通过 `submitFeedback` 云函数写入，并通过 `listFeedbacks` 云函数供超级管理员只读查看。

`security_counters` 使用固定时间桶记录发布、编辑、邀请码尝试、反馈提交等频率限制计数。

`ai_usage_logs` 用于记录 AI 辅助发布的调用情况，不保存用户输入原文或 AI 返回完整正文。

`handbook_versions` 用于保存学生手册版本信息，`handbook_chunks` 用于保存学生手册切片内容，`class_assistant_logs` 用于记录班级助手调用情况，`class_assistant_requests` 用于传递短期请求状态和后端取消信号，`class_assistant_gaps` 用于保存未找到明确规定的问题。

`operation_logs` 用于身份认证、管理员授权、事项发布、编辑、删除等关键操作日志。

建议定期在数据库控制台按 `expiresAt` 筛选并手动删除 `security_counters`、`class_assistant_requests` 和 `class_assistant_gaps` 中的过期记录，并根据运营需要为日志设置保留周期。

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
- `handbook_versions.active`（升序、非唯一）
- `handbook_chunks` 复合索引：第一个字段 `handbookVersion` 升序，第二个字段 `sort` 升序，属性选择“非唯一”
- `class_assistant_logs.openid`
- `class_assistant_logs.createdAt`
- `class_assistant_logs.outcome + class_assistant_logs.createdAt`（复合索引）
- `class_assistant_requests.expiresAt`（用于筛选过期记录）
- `class_assistant_gaps.expiresAt`（用于筛选超过30天的记录）
- `class_assistant_gaps.createdAt`
- `class_assistant_gaps.source + class_assistant_gaps.createdAt`（复合索引）

## 4. 数据库权限

建议尽量收紧数据库权限：

- 普通用户不应直接写入 `notices`，发布应通过 `createNotice` 云函数。
- 普通用户不应直接写入 `subscribers`，订阅授权应通过 `saveNoticeSubscriber` 云函数保存。
- 普通用户不应直接读写 `feedbacks`，反馈提交应通过 `submitFeedback` 云函数，超级管理员查看应通过 `listFeedbacks` 云函数。
- 普通用户不应直接写入 `security_counters`。
- 普通用户不应直接读写 `ai_usage_logs`。
- 普通用户不应直接读写 `handbook_versions`、`handbook_chunks`、`class_assistant_logs`、`class_assistant_requests` 和 `class_assistant_gaps`，班级助手问答与停止请求都应通过 `askClassAssistant` 云函数完成。
- 普通用户不应直接写入 `operation_logs`。
- 管理员授权、发布、编辑、删除等敏感操作应通过云函数完成权限校验。
- `class_members`、`admin_invite_codes` 等敏感集合不要开放普通用户直接读写。

具体权限矩阵见 [database-permissions.md](database-permissions.md)，字段说明见 [database.md](database.md)。请再结合实际云开发环境和业务需求配置。

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

## 8. 导入手册数据

如需启用班级助手，需要自行准备手册文本，并导入手册版本和切片数据。

建议按以下方式准备导入文件：

- `data/handbook_versions_example_import.json`：手册版本记录。
- `data/handbook_chunks_example_import.json`：手册切片记录。

实际部署时可以替换为你自己的文件名，例如按年份、学期或手册版本命名。微信云开发控制台导入入口通常只支持 `.json` 或 `.csv` 文件；如使用 JSON Lines 格式，应保证一行一条记录。

导入顺序：

1. 创建集合 `handbook_versions`，导入你的手册版本记录。
2. 创建集合 `handbook_chunks`，导入同一版本对应的手册切片记录。
3. 创建 `class_assistant_logs`、`class_assistant_requests` 和 `class_assistant_gaps`，并关闭五个班级助手集合的客户端读写权限。
4. 按第 3 节要求创建 `handbookVersion + sort` 非唯一复合索引。
5. 确认 `handbook_versions` 中只有需要生效的版本为 `active: true`。
6. 确认 `handbook_chunks` 中 `handbookVersion` 与启用版本的 `version` 一致，且每条切片都有数值型 `sort`。

同一版本重新生成切片后，必须先删除 `handbook_chunks` 中该 `handbookVersion` 的旧记录，再导入新文件，并同步更新 `handbook_versions.chunkCount`。不要直接追加导入，否则旧、新切片会重复命中。生成脚本会逐页校验源文本与输出切片的字符完整性；出现丢字时会直接失败，不应继续导入。

`handbook_versions` 至少需要一条启用版本，字段示例：

```json
{
  "version": "example-version",
  "name": "示例手册",
  "active": true,
  "chunkCount": 1,
  "importedAt": "2026-01-01T00:00:00.000Z",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

`handbook_chunks` 使用相同的 `handbookVersion`，字段示例：

```json
{
  "handbookVersion": "example-version",
  "section": "示例章节",
  "title": "示例条款标题",
  "article": "第一条",
  "pageText": 1,
  "content": "示例条款正文",
  "keywords": ["示例关键词"],
  "sort": 100,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

云函数会按启用版本缓存手册切片约 5 分钟，以减少每次问答重复读取全部切片。更新线上切片后应等待缓存过期或重新部署云函数，再进行验收测试。单版本最多加载 3000 条候选切片，超过时会返回配置错误。

## 9. 发布前检查

发布前建议检查：

- 所有已启用功能所需的云函数均已部署。
- 超级管理员查看反馈前，`listFeedbacks` 已部署。
- 所有已启用功能所需的数据库集合均已创建。
- `feedbacks`、`security_counters` 和 `operation_logs` 已创建且权限收紧。
- 如启用 AI 辅助发布，`parseNoticeWithAI` 已使用“云端安装依赖”部署，`@cloudbase/node-sdk`、`ws` 和 `security.msgSecCheck` 权限均已生效。
- 如启用班级助手，`askClassAssistant` 已使用“云端安装依赖”部署，`@cloudbase/node-sdk`、`ws`、`security.msgSecCheck` 权限和 60 秒超时配置均已生效。
- 如启用任一 AI 功能，云环境已启用受 CloudBase Node SDK 支持的模型服务，云函数通过环境身份调用模型。
- 如启用班级助手，`handbook_versions` 和 `handbook_chunks` 数据已导入，只有一条 `active: true` 的手册版本，并已创建 `handbookVersion + sort` 非唯一复合索引。
- 如启用班级助手，`class_assistant_requests` 已创建、客户端权限已关闭，并已制定手动清理过期记录的安排。
- 如启用班级助手，`class_assistant_gaps` 已创建、客户端权限已关闭，并按 `expiresAt` 手动清理超过30天的记录。
- 如启用班级助手，公网 HTTP 路由已关闭或启用了经过验证的身份认证。
- 班级成员数据已导入。
- 管理员/超级管理员邀请码已创建。
- 订阅消息模板 ID 已配置。
- 开源仓库中没有真实 AppID、云环境 ID、模板 ID、openid、真实学生信息、真实邀请码、真实学生手册或 `cloud://` 文件地址。
