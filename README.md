# 班级盒子

班级盒子是一个基于微信小程序云开发的班级事项管理工具，适合班级、社团或小型组织发布通知、管理活动、共享附件和进行成员权限控制。

本仓库是开源副本，不包含真实班级数据、真实邀请码、真实 openid、真实 AppID、真实云环境 ID、真实订阅消息模板 ID。使用者需要自行创建云开发环境、数据库集合，并导入自己的班级成员数据。

## 功能特性

- 首页事项展示，支持分类筛选、状态筛选和关键词搜索
- 事项发布、编辑、删除、置顶/取消置顶
- 事项详情页，展示时间、地点、说明、发布人、图片、附件和相关链接
- 图片上传与预览
- 附件上传与打开
- 相关链接填写与复制
- 发布人显示
- 收藏功能和我的收藏页，支持批量取消收藏
- 班级成员身份认证
- 管理员权限和超级管理员权限
- 一次性管理员邀请码
- 订阅消息提醒
- 我发布的事项
- V1.5 界面优化

## 技术栈

- 微信小程序原生框架
- 微信云开发 CloudBase
- 云数据库
- 云存储
- Node.js 云函数
- 微信订阅消息

## 项目目录结构

```text
.
├── cloudfunctions/                     # 云函数
│   ├── applyAdminInvite/               # 使用一次性邀请码开通管理员权限
│   ├── checkAdmin/                     # 检查当前用户身份和权限
│   ├── deleteNotice/                   # 删除事项
│   ├── sendNoticeMessage/              # 发送订阅消息提醒
│   ├── updateNotice/                   # 更新事项
│   └── verifyMember/                   # 班级成员身份认证
├── miniprogram/                        # 小程序端源码
│   ├── components/                     # 公共组件
│   ├── images/                         # 图片资源
│   ├── pages/
│   │   ├── admin-auth/                 # 管理员认证
│   │   ├── detail/                     # 事项详情
│   │   ├── favorites/                  # 我的收藏
│   │   ├── index/                      # 首页
│   │   ├── member-verify/              # 班级身份验证
│   │   ├── my/                         # 我的
│   │   ├── my-posts/                   # 我发布的事项
│   │   └── publish/                    # 发布/编辑事项
│   ├── app.js
│   ├── app.json
│   └── config.example.js               # 小程序端配置示例
├── project.config.json                 # 微信开发者工具项目配置
└── project.config.example.json         # 项目配置示例
```

## 数据库集合说明

需要在云开发控制台自行创建以下集合：

| 集合名 | 用途 |
| --- | --- |
| `class_members` | 班级成员基础数据，用于姓名和学号认证 |
| `users` | 小程序用户身份、认证状态和权限角色 |
| `notices` | 班级事项数据，包括分类、状态、内容、图片、附件、链接和发布人 |
| `favorites` | 用户收藏事项记录 |
| `admin_invite_codes` | 一次性管理员邀请码 |
| `subscribers` | 订阅消息授权记录 |

## 云函数说明

| 云函数 | 说明 |
| --- | --- |
| `verifyMember` | 根据姓名和学号验证班级成员，并绑定当前 openid |
| `checkAdmin` | 返回当前用户 openid、认证状态、角色和管理员权限 |
| `applyAdminInvite` | 校验一次性邀请码，并为已认证成员开通管理员或超级管理员权限 |
| `updateNotice` | 管理员或事项发布人更新事项内容 |
| `deleteNotice` | 超级管理员或事项发布人删除事项 |
| `sendNoticeMessage` | 向已订阅用户发送事项提醒 |

## 权限角色说明

| 角色 | 权限 |
| --- | --- |
| 未认证用户 | 只能进行班级身份认证，不能正常使用主要功能 |
| 已认证普通用户 | 可以查看事项、收藏事项、订阅提醒 |
| 已认证管理员 | 可以发布事项，并管理自己发布的事项 |
| 已认证超级管理员 | 可以管理所有事项 |

管理员和超级管理员权限通过 `admin_invite_codes` 集合中的一次性邀请码开通。邀请码用完后会标记为已使用。

## 本地运行步骤

1. 使用微信开发者工具导入本项目目录。
2. 将 `project.config.example.json` 复制为本地项目配置参考，并在微信开发者工具中填写自己的小程序 AppID。
3. 将 `miniprogram/config.example.js` 复制为 `miniprogram/config.js`，填写自己的云环境 ID 和订阅消息模板 ID。
4. 将 `cloudfunctions/sendNoticeMessage/config.example.js` 复制为 `cloudfunctions/sendNoticeMessage/config.js`，填写自己的订阅消息模板 ID。
5. 在微信开发者工具中选择自己的云开发环境。
6. 编译运行小程序。

## 云开发部署步骤

1. 在微信开发者工具中开通云开发，并创建云环境。
2. 在云开发控制台创建所需数据库集合。
3. 配置数据库权限，确保前端直连读写和云函数读写符合自己的安全策略。
4. 上传并部署 `cloudfunctions/` 下的云函数。
5. 上传云函数时注意安装依赖，不要上传本地 `node_modules/`。
6. 在微信公众平台创建订阅消息模板，并把模板 ID 写入本地配置文件。
7. 使用自己的班级成员数据初始化 `class_members` 集合。
8. 生成管理员或超级管理员邀请码，写入 `admin_invite_codes` 集合。

## 配置文件说明

本项目使用 example 文件提供占位配置，不提交真实私有配置。

| 文件 | 说明 |
| --- | --- |
| `project.config.example.json` | 微信开发者工具项目配置示例，`appid` 为占位值 |
| `project.config.json` | 开源副本中的项目配置，`appid` 使用占位值 |
| `miniprogram/config.example.js` | 小程序端配置示例，包含 `envId` 和 `subscribeTemplateId` |
| `miniprogram/config.js` | 使用者本地创建，填写真实云环境 ID 和订阅消息模板 ID，不应提交 |
| `cloudfunctions/sendNoticeMessage/config.example.js` | 订阅消息云函数配置示例 |
| `cloudfunctions/sendNoticeMessage/config.js` | 使用者本地创建，填写真实订阅消息模板 ID，不应提交 |

`.gitignore` 已忽略本地私有配置、依赖目录、日志文件和构建产物。

## 数据初始化说明

`class_members` 集合需要导入使用者自己的班级成员数据。建议字段包括：

```json
{
  "name": "示例学生",
  "studentId": "2026000000",
  "verified": false,
  "boundOpenid": null,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

`admin_invite_codes` 集合需要自行创建一次性邀请码。建议字段包括：

```json
{
  "code": "your-invite-code",
  "role": "admin",
  "used": false,
  "expiredAt": "Date",
  "createdAt": "Date"
}
```

如需创建超级管理员邀请码，可将 `role` 设置为 `superAdmin`。请不要在公开仓库中提交真实邀请码。

## 注意事项

- 本项目不包含真实班级数据、真实邀请码、真实 openid、真实 AppID、真实云环境 ID、真实订阅消息模板 ID。
- 使用前必须自行创建微信小程序、云开发环境、数据库集合和订阅消息模板。
- `miniprogram/config.js` 和 `cloudfunctions/sendNoticeMessage/config.js` 应只保存在本地或私有部署环境中。
- 不要提交 `project.private.config.json`、`.env`、`node_modules/`、`miniprogram_npm/`、日志文件和构建产物。
- 数据库权限会直接影响数据安全，正式使用前请根据实际场景审查集合权限和云函数权限。
- 订阅消息模板字段需要与 `sendNoticeMessage` 云函数中的消息字段匹配。
- 云存储中的图片和附件属于使用者自己的云环境资源，开源仓库不包含真实云文件。
