# 数据库权限建议

本文档描述集合级别的最小权限目标。微信云开发安全规则的具体语法可能随控制台和基础能力版本变化，请在云开发控制台中按此矩阵配置并使用测试账号验证，不要未经验证直接复制网络上的规则。

| 集合 | 客户端读取 | 客户端写入 | 推荐云函数入口 |
| --- | --- | --- | --- |
| `notices` | 按产品可见范围开放 | 禁止 | `createNotice`、`updateNotice`、`updateNoticePin`、`deleteNotice` |
| `users` | 禁止或仅本人 | 禁止 | `verifyMember`、`applyAdminInvite` |
| `class_members` | 禁止 | 禁止 | `verifyMember` |
| `admin_invite_codes` | 禁止 | 禁止 | `applyAdminInvite` |
| `subscribers` | 禁止 | 禁止 | `saveNoticeSubscriber`、`sendNoticeMessage` |
| `favorites` | 仅记录所有者 | 仅记录所有者 | 小程序客户端 |
| `feedbacks` | 禁止 | 禁止 | `submitFeedback`、`listFeedbacks` |
| `security_counters` | 禁止 | 禁止 | 业务云函数 |
| `ai_usage_logs` | 禁止 | 禁止 | `parseNoticeWithAI` |
| `handbook_versions` | 禁止 | 禁止 | `askClassAssistant` |
| `handbook_chunks` | 禁止 | 禁止 | `askClassAssistant` |
| `class_assistant_logs` | 禁止 | 禁止 | `askClassAssistant` |
| `class_assistant_requests` | 禁止 | 禁止 | `askClassAssistant` |
| `operation_logs` | 禁止 | 禁止 | 业务云函数 |

## 配置要点

- `notices` 的客户端写权限必须关闭，不能依赖页面按钮控制权限。
- `favorites` 仍由客户端操作，应使用云数据库自动写入的 `_openid` 将读写范围限制为记录所有者。
- `feedbacks` 包含用户身份和反馈内容，客户端不应直接读取或写入；反馈提交应通过 `submitFeedback` 云函数补全身份信息后写入，超级管理员查看应通过 `listFeedbacks` 云函数校验权限后读取。
- `subscribers` 包含用户订阅授权和 openid，不应允许客户端直接查询或写入。
- `users`、`class_members` 和 `admin_invite_codes` 包含身份或权限数据，不应向普通用户开放。
- `security_counters`、`ai_usage_logs`、`handbook_versions`、`handbook_chunks`、`class_assistant_logs`、`class_assistant_requests` 和 `operation_logs` 均不应向客户端开放读写。
- `class_assistant_requests` 是后端取消信号，不是客户端状态接口；客户端只能通过带身份的 `askClassAssistant` 云函数发起或停止自己的请求。
- `handbook_chunks` 可能包含未公开的完整手册内容，即使问答功能只对认证成员开放，也不能把集合设置为客户端可读。
- 如果事项只允许已认证成员查看，应把事项列表和详情查询也迁移到云函数；仅靠前端隐藏页面不能形成严格的读取权限边界。

## 验证清单

使用未认证用户、普通用户、管理员和超级管理员四类测试账号验证：

1. 普通用户不能直接新增、修改或删除 `notices`。
2. 客户端不能直接读写 `subscribers`、`feedbacks`、`security_counters`、`ai_usage_logs`、手册集合、班级助手日志、取消信号和 `operation_logs`。
3. 用户只能读写自己的 `favorites`。
4. 未认证用户不能读取班级成员名单、邀请码或其他用户资料。
5. 云函数部署后仍可完成认证、授权、发布、编辑、删除、置顶和订阅流程。
6. 已认证成员可以通过 `askClassAssistant` 问答和停止自己的请求，未认证用户不能使用该功能。
7. 用户不能停止其他用户的班级助手请求，也不能直接伪造或修改 `class_assistant_requests`。
