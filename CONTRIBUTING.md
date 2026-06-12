# 贡献指南

感谢你对班级盒子（Class Box）的关注！我们欢迎各种形式的贡献，包括但不限于：Bug 修复、功能改进、文档完善和问题反馈。

## 目录

- [开发流程](#开发流程)
- [分支命名规范](#分支命名规范)
- [提交信息规范](#提交信息规范)
- [代码规范](#代码规范)
- [开发环境搭建](#开发环境搭建)
- [Pull Request 流程](#pull-request-流程)
- [代码审查](#代码审查)
- [报告问题](#报告问题)
- [安全报告](#安全报告)

## 开发流程

1. **Fork** 本仓库到你的 GitHub 账号。
2. **Clone** 你 Fork 的仓库到本地：
   ```bash
   git clone https://github.com/YOUR_USERNAME/class-box-open-source.git
   cd class-box-open-source
   ```
3. 添加上游仓库：
   ```bash
   git remote add upstream https://github.com/Cheems-sudo/class-box-open-source.git
   ```
4. 从 `main` 分支创建功能分支（参见[分支命名规范](#分支命名规范)）。
5. 进行开发，遵循[代码规范](#代码规范)。
6. 在提交前拉取上游最新代码并解决冲突：
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```
7. 提交更改（参见[提交信息规范](#提交信息规范)）。
8. 推送到你的远程分支并提交 Pull Request。

## 分支命名规范

请使用以下分支命名前缀：

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feature/` | 新功能开发 | `feature/add-dark-mode` |
| `fix/` | Bug 修复 | `fix/login-error` |
| `docs/` | 文档更新 | `docs/update-api-guide` |
| `refactor/` | 代码重构 | `refactor/cloud-functions` |
| `chore/` | 构建/工具/依赖更新 | `chore/update-deps` |

## 提交信息规范

提交信息应清晰描述变更内容，推荐使用以下格式：

```
<类型>: <简短描述>

<详细说明（可选）>
```

类型包括：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具/依赖

示例：
```
feat: 添加通知消息定时发送功能

使用云函数定时触发器实现每天定时推送订阅消息。
```

## 代码规范

- 使用 **ES6+** 语法（箭头函数、模板字符串、解构赋值等）。
- 云函数中 **必须验证用户权限**，不可信任客户端传入的身份信息。
- 关键操作（创建、修改、删除）需记录操作日志。
- **避免前端直接操作**敏感数据库集合（如 `users`、`class_members`），应通过云函数中转。
- **不得提交**包含真实敏感信息的配置文件。请使用 `config.example.*` 文件作为模板。
- 中文注释和文档使用 UTF-8 编码。
- 保持与现有代码风格一致：2 空格缩进、LF 换行符。
- 优先使用 `const` 和 `let`，避免使用 `var`。
- 云函数返回的错误信息应为通用描述，**不暴露**原始错误堆栈。

## 开发环境搭建

### 前提条件

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 注册微信小程序账号并开通云开发
3. 安装 [Node.js](https://nodejs.org/) (推荐 v16 LTS 或更高版本)
4. 安装 [Git](https://git-scm.com/)

### 配置步骤

1. 克隆仓库后，复制配置模板文件：
   ```bash
   cp project.config.example.json project.config.json
   cp miniprogram/config.example.js miniprogram/config.js
   cp cloudfunctions/sendNoticeMessage/config.example.js cloudfunctions/sendNoticeMessage/config.js
   cp cloudfunctions/saveNoticeSubscriber/config.example.js cloudfunctions/saveNoticeSubscriber/config.js
   ```
2. 修改上述配置文件，填入你自己的云环境 ID、AppID 和模板 ID。
3. 使用微信开发者工具打开项目根目录。
4. 在微信开发者工具中，右键 `cloudfunctions/` 下的每个云函数，选择"上传并部署"。

详细部署说明请参阅 [docs/deploy.md](docs/deploy.md)。

## Pull Request 流程

### PR 提交前检查清单

在提交 PR 之前，请确认：

- [ ] 代码已在微信开发者工具中测试通过
- [ ] 遵循了项目[代码规范](#代码规范)
- [ ] 未提交任何包含真实敏感信息的配置文件（`project.config.json`、`miniprogram/config.js` 等）
- [ ] 相关文档已更新（如 README、docs/ 下的文件）
- [ ] 如引入新功能，已在 [CHANGELOG.md](CHANGELOG.md) 中添加条目
- [ ] 提交信息清晰描述了变更内容
- [ ] 已从上游 `main` 分支 rebase 并解决所有冲突
- [ ] PR 标题简洁明了，描述包含变更动机和实现思路
- [ ] 云函数的 `package.json` 依赖版本无意外变更

### PR 描述模板

```markdown
## 变更说明
简要描述此 PR 做了什么。

## 变更类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 文档更新
- [ ] 代码重构
- [ ] 其他

## 测试
描述如何测试这些变更。

## 截图（如适用）
附上 UI 变更截图。
```

## 代码审查

所有 PR 将由项目维护者审查。审查关注以下方面：

- **正确性**：代码是否实现了预期功能，边界情况是否处理得当。
- **安全性**：权限验证是否到位，是否存在数据泄露风险。
- **代码风格**：是否与项目风格一致。
- **可维护性**：代码是否清晰易懂，是否有适当的注释。

审查反馈可能包含修改建议。请及时回应审查意见并做出相应修改。PR 获得至少一位维护者批准后方可合并。

### 预期时间

- 初次审查通常在 3-5 个工作日内完成。
- 如遇紧急问题，请在 PR 标题中标注 `[urgent]`。

## 报告问题

使用 [GitHub Issues](https://github.com/Cheems-sudo/class-box-open-source/issues) 报告问题，并尽量提供：

- **问题描述**：清晰描述发生了什么。
- **重现步骤**：详细列出操作步骤。
- **预期结果**：期望发生什么。
- **实际结果**：实际发生了什么。
- **环境信息**：微信开发者工具版本、基础库版本、云开发环境信息。
- **截图**：如适用，提供截图帮助理解问题。

### Issue 模板

我们提供了以下 Issue 模板：
- **Bug 报告**：`.github/ISSUE_TEMPLATE/bug_report.md`
- **功能请求**：`.github/ISSUE_TEMPLATE/feature_request.md`

请根据你的需求选择对应的模板。

## 安全报告

如果你发现安全漏洞，**请勿在公开 Issue 中披露**。请通过 [GitHub Security Advisories](https://github.com/Cheems-sudo/class-box-open-source/security/advisories/new) 页面私下报告，或直接联系项目维护者。

我们将尽快确认并修复问题，修复完成后再公开披露。详情请参阅 [SECURITY.md](SECURITY.md)。
