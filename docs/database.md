# 数据库集合说明

本文档说明班级盒子使用的云数据库集合。示例数据均为假数据，仅用于说明字段结构。

## notices

用途：存储班级事项，包括通知、考试安排、作业、活动、资料等内容。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `_id` | 云数据库自动生成的记录 ID |
| `title` | 事项标题 |
| `category` | 事项分类 |
| `status` | 事项状态，例如 `pending`、`done` |
| `content` | 事项正文说明 |
| `deadline` | 截止时间或相关时间 |
| `location` | 地点或补充说明 |
| `course` | 课程、活动或事项名称 |
| `images` | 图片列表，通常包含 `fileID`、`name` 等字段 |
| `attachments` | 附件列表，通常包含 `fileID`、`name`、`type` 等字段 |
| `links` | 相关链接列表 |
| `publisherOpenid` | 发布人的 openid |
| `publisherName` | 发布人显示名称 |
| `pinned` | 是否置顶 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

示例数据：

```json
{
  "title": "示例班会通知",
  "category": "班级通知",
  "status": "pending",
  "content": "这是一条示例事项，请替换为真实内容。",
  "deadline": "2026-06-10 19:00",
  "location": "示例教室 A101",
  "course": "班会",
  "images": [],
  "attachments": [],
  "links": [
    {
      "title": "示例链接",
      "url": "https://example.com"
    }
  ],
  "publisherOpenid": "openid_example_0001",
  "publisherName": "示例管理员",
  "pinned": false,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

## users

用途：存储小程序用户身份、认证状态和权限角色。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `_id` | 云数据库自动生成的记录 ID |
| `openid` | 用户 openid |
| `name` | 已认证成员姓名 |
| `studentId` | 已认证成员学号 |
| `role` | 用户角色，支持 `user`、`admin`、`superAdmin` |
| `verified` | 是否完成班级成员身份认证 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

示例数据：

```json
{
  "openid": "openid_example_0001",
  "name": "示例学生",
  "studentId": "2026000000",
  "role": "user",
  "verified": true,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

## admin_invite_codes

用途：存储一次性管理员邀请码和超级管理员邀请码。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `_id` | 云数据库自动生成的记录 ID |
| `code` | 邀请码 |
| `role` | 邀请码授予的角色，支持 `admin`、`superAdmin` |
| `used` | 是否已使用 |
| `usedByOpenid` | 使用者 openid |
| `usedByName` | 使用者姓名 |
| `usedByStudentId` | 使用者学号 |
| `usedAt` | 使用时间 |
| `createdAt` | 创建时间 |
| `expiredAt` | 过期时间 |

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

## class_members

用途：存储班级成员基础名单，用于姓名和学号认证。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `_id` | 云数据库自动生成的记录 ID |
| `name` | 成员姓名 |
| `studentId` | 成员学号 |
| `boundOpenid` | 已绑定的小程序用户 openid |
| `verified` | 是否已完成认证 |
| `verifiedAt` | 认证时间 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

班级成员示例：

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

## subscribers

用途：存储用户对订阅消息的授权记录，用于发送下一次事项提醒。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `_id` | 云数据库自动生成的记录 ID |
| `openid` | 订阅用户 openid |
| `templateId` | 订阅消息模板 ID |
| `used` | 本次订阅授权是否已使用 |
| `enabled` | 是否启用 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

示例数据：

```json
{
  "openid": "openid_example_0001",
  "templateId": "template_example_0001",
  "used": false,
  "enabled": true,
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

## favorites

用途：存储用户收藏事项记录。

主要字段：

| 字段 | 含义 |
| --- | --- |
| `_id` | 云数据库自动生成的记录 ID |
| `openid` | 收藏用户 openid |
| `noticeId` | 被收藏事项 ID |
| `createdAt` | 收藏时间 |

示例数据：

```json
{
  "openid": "openid_example_0001",
  "noticeId": "notice_example_0001",
  "createdAt": "2026-06-01T00:00:00.000Z"
}
```
