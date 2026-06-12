# 班级盒子

班级盒子是一个面向班级场景的微信小程序，用于统一发布和查看考试、作业、活动、通知、资料等班级事项。

本仓库是开源副本，不包含正式项目的真实 AppID、云环境 ID、订阅消息模板 ID、openid、班级成员名单、管理员邀请码或云文件地址。

## 快速开始

### 1. 前置要求

- 微信开发者工具
- 自己的微信小程序 AppID
- 云开发环境

### 2. 克隆项目

```bash
git clone <your-repository-url>
cd class-box-open-source
```

### 3. 配置文件

复制配置文件模板：

```bash
cp project.config.example.json project.config.json
cp miniprogram/config.example.js miniprogram/config.js
cp cloudfunctions/sendNoticeMessage/config.example.js cloudfunctions/sendNoticeMessage/config.js
cp cloudfunctions/saveNoticeSubscriber/config.example.js cloudfunctions/saveNoticeSubscriber/config.js
```

然后编辑这些文件，填入自己的：

- AppID
- 云环境 ID
- 订阅消息模板 ID

### 4. 部署

1. 在微信开发者工具中打开此项目。
2. 进入“云开发” → “云函数”。
3. 右键 `cloudfunctions` 文件夹，选择“增量上传并部署”，部署所有云函数。
4. 创建数据库集合，见 `docs/database.md` 了解详情。
5. 点击“预览”在微信中测试。

详细步骤见 `docs/deploy.md`。

## 功能特性

- 班级事项发布、编辑、删除和查看。
- 按考试安排、作业信息、活动信息、班级通知、其他等类型管理事项。
- 图片、附件和链接支持。
- 收藏事项。
- 首页和事项详情支持好友分享与朋友圈分享。
- 订阅消息提醒。
- 班级成员身份认证。
- 管理员和超级管理员权限体系。
- 管理员/超级管理员邀请码为一次性使用。
- 发布事项通过 `createNotice` 云函数完成，避免前端直接写入关键集合。
- 发布/编辑内容进行内容安全检测。
- 图片内容安全检测。
- 关键操作日志记录。
- 敏感操作通过云函数进行权限校验。

## 权限角色

- 未认证用户：只能进行班级身份认证，不能正常使用主要功能。
- 已认证普通用户：可以查看事项、收藏事项、订阅提醒。
- 已认证管理员：可以发布事项，并管理自己发布的事项。
- 已认证超级管理员：可以管理所有事项。

## 云函数

当前项目使用以下云函数：

| 云函数 | 说明 |
| --- | --- |
| `applyAdminInvite` | 处理一次性管理员/超级管理员邀请码 |
| `checkAdmin` | 判断当前用户身份、认证状态和权限 |
| `contentSecurityCheck` | 对文本、图片等内容进行安全检测 |
| `createNotice` | 通过云函数创建事项，避免前端直接写入关键集合 |
| `deleteNotice` | 删除事项，并进行权限校验 |
| `saveNoticeSubscriber` | 校验当前用户并保存订阅授权，避免前端直接写入订阅集合 |
| `sendNoticeMessage` | 发送订阅消息提醒 |
| `updateNotice` | 编辑事项，并进行权限校验 |
| `updateNoticePin` | 更新事项置顶状态，并进行权限校验 |
| `verifyMember` | 班级成员身份认证 |

说明：发布、编辑、删除、置顶和管理员授权等关键业务操作均由对应业务云函数完成权限校验，并在业务成功后直接记录操作日志。

## 配置

### 敏感信息

本仓库不包含真实的 AppID、云环境 ID、邀请码等敏感信息。如需自行部署，请参考 `docs/security.md` 的“不应提交的内容”章节。

### 配置文件

复制并填写以下配置文件：

1. **`project.config.json`** - 微信开发者工具配置
   - 源文件：`project.config.example.json`
   - 需填写：`appid`（你的小程序 AppID）

2. **`miniprogram/config.js`** - 小程序配置
   - 源文件：`miniprogram/config.example.js`
   - 需填写：`envId`（云开发环境 ID）、`subscribeTemplateId`（订阅消息模板 ID）

3. **`cloudfunctions/sendNoticeMessage/config.js`** - 消息发送配置
   - 源文件：`cloudfunctions/sendNoticeMessage/config.example.js`
   - 需填写：订阅消息相关配置

4. **`cloudfunctions/saveNoticeSubscriber/config.js`** - 订阅保存配置
   - 源文件：`cloudfunctions/saveNoticeSubscriber/config.example.js`
   - 需填写：与前端一致的订阅消息模板 ID

### 不要提交以下文件

- `project.private.config.json`
- `project.config.json`
- `miniprogram/config.js`
- `cloudfunctions/sendNoticeMessage/config.js`
- `cloudfunctions/saveNoticeSubscriber/config.js`

这些文件已在 `.gitignore` 中，Git 会自动忽略它们。

## 文档

- **快速开始**：见上方“快速开始”章节
- **部署指南**：`docs/deploy.md` - 详细的部署步骤
- **数据库设计**：`docs/database.md` - 8 个集合的字段说明和示例数据
- **数据库权限**：`docs/database-permissions.md` - 各集合的最小权限建议
- **安全建议**：`docs/security.md` - 开源和运营时的安全注意事项

## 项目结构

```text
cloudfunctions/           # 云函数后端（10个）
├── checkAdmin/           # 检查用户权限和认证状态
├── createNotice/         # 创建班级事项
├── updateNotice/         # 编辑班级事项
├── updateNoticePin/      # 更新事项置顶状态
├── deleteNotice/         # 删除班级事项
├── verifyMember/         # 班级成员身份认证
├── contentSecurityCheck/ # 内容安全检测（文本+图片）
├── saveNoticeSubscriber/ # 保存当前用户的订阅授权
├── sendNoticeMessage/    # 发送订阅消息通知
└── applyAdminInvite/     # 处理管理员邀请码

miniprogram/              # 小程序前端
├── pages/                # 8个页面
│   ├── index/            # 首页 - 事项列表
│   ├── detail/           # 详情 - 事项详细信息
│   ├── publish/          # 发布 - 创建/编辑事项（需要管理员权限）
│   ├── my/               # 我的 - 用户信息、权限设置
│   ├── my-posts/         # 我的发布 - 管理自己发布的事项
│   ├── favorites/        # 收藏 - 收藏的事项
│   ├── member-verify/    # 成员认证 - 班级身份认证
│   └── admin-auth/       # 管理员认证 - 使用邀请码成为管理员
├── components/           # 可复用组件
│   └── cloudTipModal/    # 云操作提示框
├── app.js                # 小程序全局配置和初始化
└── config.example.js     # 配置文件模板

docs/                     # 文档
├── deploy.md             # 部署指南
├── database.md           # 数据库集合说明
└── security.md           # 安全注意事项
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

本项目采用 MIT 许可证。详见 `LICENSE` 文件。

## 反馈

- 遇到问题？请使用本仓库的 GitHub Issues
- 有建议？欢迎讨论和 PR
