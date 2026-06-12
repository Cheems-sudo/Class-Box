# 开源安全注意事项

本仓库是班级盒子的开源副本，不能包含正式项目或真实班级环境的敏感信息。

## 不应提交的内容

开源仓库不得包含：

- 真实 AppID
- 真实云环境 ID
- 真实订阅消息模板 ID
- openid
- unionid
- 真实学生姓名
- 真实学生学号
- 真实管理员邀请码
- 真实超级管理员邀请码
- `cloud://` 文件地址
- `access_token`
- `secret`
- `key`
- `password`
- `token`

如需展示结构，请使用 `example`、`your-*`、`openid_example` 等占位值。

## 配置文件

只提交 example 配置：

- `project.config.example.json`
- `miniprogram/config.example.js`
- `cloudfunctions/sendNoticeMessage/config.example.js`
- `cloudfunctions/saveNoticeSubscriber/config.example.js`

不要提交真实配置：

- `project.private.config.json`
- `project.config.json`
- `miniprogram/config.js`
- `cloudfunctions/sendNoticeMessage/config.js`
- `cloudfunctions/saveNoticeSubscriber/config.js`

## 运行安全建议

- 不要只依赖前端判断权限。
- 发布、编辑、删除等关键操作应通过云函数执行。
- 内容安全检测应在云函数侧完成。
- 图片上传应进行图片内容安全检测。
- 操作日志不应记录真实敏感内容原文。
- 不要记录完整邀请码。
- 不要在 `console.log` / `console.error` 中输出完整 `event`。
- `security_counters` 和 `operation_logs` 不应允许普通用户直接写入。
- `subscribers` 不应允许普通用户直接读写，订阅授权通过云函数保存。
- 数据库权限应尽量收紧。
- 邀请码应设置过期时间，并且只能使用一次。

## 数据库安全

建议重点保护以下集合：

- `class_members`：包含班级成员姓名、学号和绑定状态。
- `users`：包含用户 openid、认证状态和权限角色。
- `admin_invite_codes`：包含管理员/超级管理员邀请码。
- `security_counters`：包含安全计数和失败记录。
- `operation_logs`：包含关键操作日志。

普通用户不应直接写入 `subscribers`、`security_counters` 和 `operation_logs`。管理员授权、发布、编辑、删除等敏感操作应由云函数进行权限校验后执行。具体权限目标见 `docs/database-permissions.md`。

## 邀请码安全

- 邀请码只应在云数据库中保存和校验。
- 邀请码应设置 `expiredAt`。
- 邀请码使用后必须标记为 `used: true`。
- 操作日志中不要保存完整邀请码。
- 如需记录授权来源，只记录 `codePrefix`、角色、成功/失败状态和失败原因。

## 日志安全

日志用于排查问题和审计关键操作，但不应成为敏感信息泄露点。

建议：

- 不记录完整请求 `event`。
- 不记录事项正文原文。
- 不在操作日志中重复保存姓名和学号。
- 不记录附件 `fileID` 或云文件地址。
- 不记录完整邀请码。
- 不记录真实配置值。
- 错误日志只记录错误类型、错误码、操作类型和脱敏后的上下文。
- 为操作日志设置合理的保留周期，过期后及时清理。

## 内容安全

发布和编辑事项时应在云函数侧执行内容安全检测：

- 文本内容检测。
- 链接标题和链接地址检测。
- 图片文件内容检测。
- 图片和附件名称检测。

前端检测只能作为用户体验优化，不能作为唯一安全边界。

## 开源前检查清单

发布或同步到开源仓库前，建议检查：

1. 搜索真实 AppID。
2. 搜索真实云环境 ID。
3. 搜索真实订阅消息模板 ID。
4. 搜索 openid / unionid。
5. 搜索真实学生姓名和学号。
6. 搜索真实邀请码。
7. 搜索 `cloud://` 和云存储 fileID。
8. 搜索 `access_token`、`secret`、`key`、`password`、`token`。
9. 确认真实配置文件没有被 Git 跟踪。
10. 确认 README 和 docs 中只使用假数据或 example 数据。
