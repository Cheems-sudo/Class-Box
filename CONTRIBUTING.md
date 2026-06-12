# 贡献指南

感谢你愿意改进班级盒子。

## 提交问题

提交 Issue 前，请先搜索是否已有相同问题。Bug 报告尽量包含：

- 出现问题的页面或功能
- 可以重复问题的操作步骤
- 微信开发者工具和基础库版本
- 控制台错误信息（请先删除 openid、学生信息和配置值）

Issue 地址：https://github.com/Cheems-sudo/Class-Box/issues

## 提交代码

1. Fork 仓库并从 `main` 创建分支。
2. 保持改动范围清晰，不要夹带无关格式化或重构。
3. 在微信开发者工具中测试相关流程。
4. 检查没有提交真实配置或班级数据。
5. 提交 Pull Request，说明改动目的和测试方法。

## 代码要求

- 云函数不能信任客户端传入的身份信息。
- 发布、编辑、删除、授权等关键操作必须在云函数中校验权限。
- 日志不得记录正文、完整邀请码、附件 fileID、姓名或学号。
- 不要提交 `project.config.json`、`miniprogram/config.js` 或云函数中的真实 `config.js`。
- JavaScript 使用 2 空格缩进，并确保 `node --check` 通过。

## 本地配置

按 README 复制 example 文件：

```bash
cp project.config.example.json project.config.json
cp miniprogram/config.example.js miniprogram/config.js
cp cloudfunctions/sendNoticeMessage/config.example.js cloudfunctions/sendNoticeMessage/config.js
cp cloudfunctions/saveNoticeSubscriber/config.example.js cloudfunctions/saveNoticeSubscriber/config.js
```

部署和数据库配置见 `docs/deploy.md`。

## 安全问题

安全漏洞不要公开到 Issue。请通过仓库的
[Private vulnerability reporting](https://github.com/Cheems-sudo/Class-Box/security/advisories/new)
私下提交，详情见 `SECURITY.md`。
