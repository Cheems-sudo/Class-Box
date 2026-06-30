# 班级盒子

班级盒子是一个面向班级日常事务的微信小程序。它把考试安排、作业信息、活动通知、班级公告、资料链接等内容集中到一个地方，让同学不用再从聊天记录里反复翻找重要信息。

这个项目适合班级、社团、学习小组或课程团队使用：管理员负责发布和维护事项，成员完成身份认证后即可查看、收藏和订阅提醒。

## 它能解决什么

班级信息常常散落在群聊、私聊、文件和截图里。时间一久，考试时间、作业截止日期、活动地点、通知原文都容易被新的消息淹没。

班级盒子提供一个更稳定的入口：

- 重要事项统一发布，按类型整理。
- 每条事项有清晰的时间、地点、课程/活动名称和详细说明。
- 支持图片、附件和外部链接，资料不再只靠聊天记录转发。
- 成员可以收藏事项，也可以订阅下一次通知提醒。
- 管理员可以编辑、删除、置顶自己有权限管理的内容。

## 主要功能

- 班级事项：发布、查看、编辑、删除、置顶。
- 分类管理：考试安排、作业信息、活动信息、班级通知、其他。
- 资料补充：支持图片、附件和链接。
- 收藏列表：保存自己关心的事项。
- 消息提醒：通过微信订阅消息提醒下一条通知。
- 身份认证：只允许班级成员进入主要功能。
- 权限管理：普通成员、管理员、超级管理员分层使用。
- 安全校验：发布和编辑内容会经过内容安全检测。
- 操作记录：关键操作会写入日志，便于后续追踪。

## 使用角色

| 角色 | 可以做什么 |
| --- | --- |
| 未认证用户 | 只能进行班级身份认证 |
| 已认证成员 | 查看事项、收藏事项、订阅提醒 |
| 管理员 | 发布事项，管理自己发布的事项 |
| 超级管理员 | 管理所有事项和关键内容 |

## 页面概览

- 首页：浏览和筛选班级事项。
- 详情页：查看事项内容、图片、附件、链接，并进行收藏。
- 发布页：管理员发布或编辑事项。
- 我的：查看身份状态、订阅提醒、进入收藏和我的发布。
- 成员认证：填写姓名和学号完成班级身份认证。
- 管理员认证：通过一次性邀请码开通管理员权限。

## 自行部署

本仓库是开源版本，不包含正式项目的真实 AppID、云环境 ID、订阅消息模板 ID、openid、班级成员名单、管理员邀请码或云文件地址。

如果你想部署自己的班级盒子，需要准备：

- 微信开发者工具
- 微信小程序 AppID
- 微信云开发环境
- 订阅消息模板
- 班级成员名单
- 管理员或超级管理员邀请码

快速步骤：

```bash
git clone https://github.com/Cheems-sudo/Class-Box.git
cd Class-Box
cp project.config.example.json project.config.json
cp miniprogram/config.example.js miniprogram/config.js
cp cloudfunctions/sendNoticeMessage/config.example.js cloudfunctions/sendNoticeMessage/config.js
cp cloudfunctions/saveNoticeSubscriber/config.example.js cloudfunctions/saveNoticeSubscriber/config.js
```

然后在这些本地配置文件中填入自己的 AppID、云环境 ID 和订阅消息模板 ID，再使用微信开发者工具打开项目并部署云函数。

完整部署步骤见 [docs/deploy.md](docs/deploy.md)。

## 数据与安全

班级盒子依赖微信云开发数据库。你需要自行创建以下集合：

- `notices`
- `users`
- `admin_invite_codes`
- `class_members`
- `subscribers`
- `favorites`
- `security_counters`
- `operation_logs`

数据库字段说明见 [docs/database.md](docs/database.md)，权限建议见 [docs/database-permissions.md](docs/database-permissions.md)。

部署前的隐私和权限配置建议见 [docs/security.md](docs/security.md)。

## 技术说明

项目由微信小程序前端和微信云函数组成。

```text
miniprogram/      # 小程序页面、样式和配置
cloudfunctions/   # 权限校验、事项管理、订阅提醒等云函数
docs/             # 部署、数据库和安全文档
```

主要云函数包括：

- `checkAdmin`：检查当前用户认证状态和权限。
- `verifyMember`：完成班级成员身份认证。
- `createNotice` / `updateNotice` / `deleteNotice`：管理事项。
- `updateNoticePin`：更新置顶状态。
- `contentSecurityCheck`：内容安全检测。
- `saveNoticeSubscriber` / `sendNoticeMessage`：保存订阅授权并发送提醒。
- `applyAdminInvite`：处理管理员邀请码。

## 当前限制

- 项目依赖微信小程序和微信云开发环境。
- 页面交互需要在微信开发者工具或真机中测试。
- 班级成员名单、邀请码和订阅消息模板需要部署者自行配置。

## 反馈

如果你发现问题，或有适合班级场景的新想法，可以在 GitHub Issues 中提出。

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE)。
