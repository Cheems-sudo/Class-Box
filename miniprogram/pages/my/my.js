const config = require("../../config.js");
const noticeTemplateId = config.subscribeTemplateId;

Page({
  data: {
    isAdmin: false,
    role: "user",
    roleText: "普通用户",
    verified: false,
    name: "",
    studentId: "",
    subscribeLoading: false,
  },
  onShow() {
    this.loadUserInfo();
  },
  loadUserInfo() {
    this.checkAdminPermission();
  },
  checkAdminPermission() {
    console.log("[my] 开始 checkAdmin 身份检查");
    return wx.cloud
      .callFunction({
        name: "checkAdmin",
      })
      .then((res) => {
        console.log("[my] checkAdmin 身份检查完成", res);
        const result = res.result || {};

        if (!result.success) {
          throw new Error(result.message || "checkAdmin failed");
        }

        this.setData({
          isAdmin: result.isAdmin === true,
          role: result.role || "user",
          roleText: this.getRoleText(result.role),
          verified: result.verified === true,
          name: result.name || "",
          studentId: result.studentId || "",
        });
      })
      .catch((error) => {
        console.error("[my] checkAdmin 身份检查失败", error);
        this.setData({
          isAdmin: false,
          role: "user",
          roleText: "普通用户",
          verified: false,
          name: "",
          studentId: "",
        });
        wx.showToast({
          title: "网络超时，请稍后重试",
          icon: "none",
        });
      });
  },
  goMemberVerify() {
    wx.navigateTo({
      url: "/pages/member-verify/member-verify",
    });
  },
  goAdminAuth() {
    if (this.data.verified !== true) {
      wx.showToast({
        title: "请先完成班级身份验证",
        icon: "none",
      });
      return;
    }

    if (this.data.role !== "user" || this.data.isAdmin) {
      return;
    }

    wx.navigateTo({
      url: "/pages/admin-auth/admin-auth",
    });
  },
  goFavorites() {
    wx.navigateTo({
      url: "/pages/favorites/favorites",
    });
  },
  goMyPosts() {
    if (this.data.verified !== true || (this.data.role !== "admin" && this.data.role !== "superAdmin")) {
      return;
    }

    wx.navigateTo({
      url: "/pages/my-posts/my-posts",
    });
  },
  subscribeNextNotice() {
    if (this.data.subscribeLoading) {
      return;
    }

    console.log("[my] 开始订阅消息授权");
    this.setData({
      subscribeLoading: true,
    });

    wx.requestSubscribeMessage({
      tmplIds: [noticeTemplateId],
      success: (res) => {
        console.log("[my] 订阅消息授权完成", res);
        const subscribeResult = res[noticeTemplateId];

        if (subscribeResult === "accept") {
          this.saveNoticeSubscriber().finally(() => {
            this.setData({
              subscribeLoading: false,
            });
          });
          return;
        }

        if (subscribeResult === "ban") {
          wx.showToast({
            title: "请在微信设置中开启订阅消息权限",
            icon: "none",
          });
          this.setData({
            subscribeLoading: false,
          });
          return;
        }

        wx.showToast({
          title: "已取消订阅，可随时重新订阅",
          icon: "none",
        });
        this.setData({
          subscribeLoading: false,
        });
      },
      fail: (error) => {
        console.error("[my] 订阅消息授权失败", error);
        wx.showToast({
          title: "订阅失败，请稍后重试",
          icon: "none",
        });
        this.setData({
          subscribeLoading: false,
        });
      },
    });
  },
  saveNoticeSubscriber() {
    console.log("[my] 开始保存订阅记录前身份检查");
    return wx.cloud
      .callFunction({
        name: "checkAdmin",
      })
      .then((res) => {
        console.log("[my] 保存订阅记录前身份检查完成", res);
        const result = res.result || {};

        if (!result.success || !result.openid) {
          throw new Error(result.message || "get openid failed");
        }

        const now = new Date();
        const db = wx.cloud.database();

        console.log("[my] 开始查询有效订阅记录");
        return db.collection("subscribers")
          .where({
            openid: result.openid,
            templateId: noticeTemplateId,
            used: false,
            enabled: true,
          })
          .limit(1)
          .get()
          .then((subscriberRes) => {
            console.log("[my] 有效订阅记录查询完成", subscriberRes);
            const existingSubscribers = subscriberRes.data || [];

            if (existingSubscribers.length > 0) {
              return {
                alreadySubscribed: true,
              };
            }

            console.log("[my] 开始新增订阅记录");
            return db.collection("subscribers").add({
              data: {
                openid: result.openid,
                templateId: noticeTemplateId,
                used: false,
                enabled: true,
                createdAt: now,
                updatedAt: now,
              },
            }).then((addRes) => {
              console.log("[my] 新增订阅记录完成", addRes);
              return addRes;
            });
          });
      })
      .then((res) => {
        console.log("[my] 订阅记录保存流程完成", res);
        wx.showToast({
          title: res && res.alreadySubscribed ? "你已订阅下次通知提醒" : "订阅成功",
          icon: "success",
        });
      })
      .catch((error) => {
        console.error("[my] 保存订阅记录失败", error);
        wx.showToast({
          title: "网络超时，请稍后重试",
          icon: "none",
        });
      });
  },
  getRoleText(role) {
    const value = String(role || "").trim();

    if (value === "superAdmin") {
      return "超级管理员";
    }

    if (value === "admin") {
      return "管理员";
    }

    return "普通用户";
  },
});
