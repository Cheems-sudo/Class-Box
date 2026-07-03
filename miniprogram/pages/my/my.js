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
    return wx.cloud
      .callFunction({
        name: "checkAdmin",
      })
      .then((res) => {
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
  noop() {},
  subscribeNextNotice() {
    if (this.data.subscribeLoading) {
      return;
    }

    this.setData({
      subscribeLoading: true,
    });

    wx.requestSubscribeMessage({
      tmplIds: [noticeTemplateId],
      success: (res) => {
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
    return wx.cloud
      .callFunction({
        name: "saveNoticeSubscriber",
      })
      .then((res) => {
        const result = res.result || {};

        if (!result.success) {
          throw new Error(result.message || "save subscriber failed");
        }

        return result;
      })
      .then((res) => {
        wx.showToast({
          title: res && res.alreadySubscribed ? "你已订阅下次通知提醒" : "订阅成功",
          icon: "success",
        });
      })
      .catch((error) => {
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
