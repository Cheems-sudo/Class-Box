# 开源安全注意事项

本仓库用于开源展示和二次开发，不应包含任何真实生产或班级敏感信息。

## 不要提交的文件和配置

- 不要提交 `project.private.config.json`
- 不要提交 `.env`、`.env.local` 等本地环境文件
- 不要提交 `cloudbaserc.json`
- 不要提交 `miniprogram/config.js`
- 不要提交 `cloudfunctions/sendNoticeMessage/config.js`
- 不要提交 `node_modules/`、`miniprogram_npm/`、日志文件和构建产物

## 不要提交的敏感信息

- 不要提交真实 AppID
- 不要提交云环境 ID
- 不要提交真实学生名单
- 不要提交真实 openid
- 不要提交真实 unionid
- 不要提交真实管理员邀请码
- 不要提交真实超级管理员邀请码
- 不要提交订阅消息模板 ID
- 不要提交云存储 fileID
- 不要提交 `cloud://` 开头的云文件地址
- 不要提交 token、secret、key、password

## 数据库安全

- `class_members` 包含班级成员姓名和学号，应谨慎设置权限。
- `users` 包含 openid、姓名、学号和角色，应避免前端任意写入。
- `admin_invite_codes` 关系到权限提升，应只允许可信管理流程写入。
- `subscribers` 包含订阅授权记录，应避免公开读取。
- 正式环境中建议通过云函数完成敏感写操作。

## 发布前检查

发布开源仓库前建议检查：

1. 搜索 `wx` 开头的小程序 AppID。
2. 搜索 `cloud1-` 等云环境 ID。
3. 搜索真实姓名、学号、openid、unionid。
4. 搜索真实邀请码。
5. 搜索订阅消息模板 ID。
6. 搜索 `cloud://` 和云存储 fileID。
7. 搜索 `token`、`secret`、`key`、`password`、`access_token`。
8. 确认 `.gitignore` 已覆盖本地私有配置和依赖目录。

## 示例数据要求

文档、截图和测试数据应全部使用假数据。不要把真实班级成员名单、真实管理员邀请码、真实云文件地址或真实订阅消息模板 ID 放入公开仓库。
