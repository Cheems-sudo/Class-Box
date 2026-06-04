# 部署说明

本文档说明如何将班级盒子部署到自己的微信小程序云开发环境。

## 导入项目

1. 打开微信开发者工具。
2. 选择导入项目。
3. 项目目录选择本仓库根目录。
4. AppID 填写自己的微信小程序 AppID。
5. 导入后确认小程序根目录为 `miniprogram/`，云函数目录为 `cloudfunctions/`。

## 开通微信云开发

1. 在微信开发者工具中打开项目。
2. 点击工具栏中的云开发入口。
3. 按提示开通云开发服务。
4. 创建一个云开发环境，并记录自己的云环境 ID。
5. 将 `miniprogram/config.example.js` 复制为 `miniprogram/config.js`，填写自己的 `envId`。

## 创建数据库集合

在云开发控制台的数据库中创建以下集合：

- `notices`
- `users`
- `admin_invite_codes`
- `class_members`
- `subscribers`
- `favorites`

创建后请根据自己的使用场景设置数据库权限。正式使用前应避免给敏感集合设置过宽的前端写权限。

## 部署云函数

需要部署的云函数包括：

- `verifyMember`
- `applyAdminInvite`
- `checkAdmin`
- `deleteNotice`
- `updateNotice`
- `sendNoticeMessage`

部署步骤：

1. 在微信开发者工具中展开 `cloudfunctions/`。
2. 右键选择需要部署的云函数目录。
3. 选择上传并部署。
4. 如有依赖，选择云端安装依赖。
5. 逐个部署上方列出的云函数。

`sendNoticeMessage` 需要本地配置文件。将 `cloudfunctions/sendNoticeMessage/config.example.js` 复制为 `cloudfunctions/sendNoticeMessage/config.js`，填写自己的订阅消息模板 ID 后再部署。

## 配置订阅消息模板

1. 登录微信公众平台。
2. 进入订阅消息配置页面。
3. 创建或选择适合班级事项提醒的模板。
4. 记录模板 ID。
5. 将模板 ID 填入：
   - `miniprogram/config.js` 的 `subscribeTemplateId`
   - `cloudfunctions/sendNoticeMessage/config.js` 的 `subscribeTemplateId`
6. 确认模板字段与 `sendNoticeMessage` 云函数中的发送字段匹配。

## 导入班级成员数据

1. 准备自己的班级成员名单。
2. 按 `class_members` 集合字段整理数据，至少包含 `name`、`studentId`、`verified`、`boundOpenid`。
3. 在云开发控制台导入 JSON 或 CSV 数据。
4. 初始导入时建议将 `verified` 设置为 `false`，`boundOpenid` 设置为 `null`。

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

## 创建管理员邀请码

在 `admin_invite_codes` 集合中创建一次性邀请码。

管理员邀请码示例：

```json
{
  "code": "BW-EXAMPLE-0001",
  "role": "admin",
  "used": false,
  "usedByOpenid": null,
  "usedByName": null,
  "usedByStudentId": null,
  "usedAt": null,
  "createdAt": "2026-05-31T00:00:00.000Z",
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
  "usedByName": null,
  "usedByStudentId": null,
  "usedAt": null,
  "createdAt": "2026-05-31T00:00:00.000Z",
  "expiredAt": "2026-12-31T23:59:59.000Z"
}
```

## 测试功能

建议按以下顺序测试：

1. 编译并打开小程序首页。
2. 使用示例班级成员数据完成身份认证。
3. 使用管理员邀请码开通管理员权限。
4. 发布一条测试事项。
5. 测试首页分类筛选、状态筛选和搜索。
6. 进入详情页，测试图片预览、附件打开、链接复制。
7. 测试收藏和我的收藏页。
8. 测试编辑、删除、置顶和取消置顶。
9. 授权订阅消息后发布事项，测试订阅消息发送。
10. 打开我发布的事项页面，确认列表展示正常。
