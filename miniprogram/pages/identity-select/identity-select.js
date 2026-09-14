Page({
  data: {
    authLoading: true,
  },
  pageAlive: false,
  isRouting: false,
  onLoad() {
    this.pageAlive = true;
  },
  onShow() {
    this.hideNativeHomeButton();
    this.checkIdentity();
  },
  hideNativeHomeButton() {
    if (typeof wx.hideHomeButton !== "function") {
      return;
    }

    wx.hideHomeButton({
      fail: () => {},
    });
  },
  onUnload() {
    this.pageAlive = false;
  },
  checkIdentity() {
    if (this.isRouting) {
      return;
    }

    this.setData({ authLoading: true });
    wx.cloud.callFunction({
      name: "checkAdmin",
    }).then((res) => {
      if (!this.pageAlive || this.isRouting) {
        return;
      }

      const result = res.result || {};

      if (!result.success) {
        throw new Error(result.message || "checkAdmin failed");
      }

      if (result.isMember === true || result.verified === true) {
        this.routeTo("/pages/index/index");
        return;
      }

      if (result.isGuest === true) {
        this.routeTo("/pages/class-assistant/class-assistant");
        return;
      }

      this.setData({ authLoading: false });
    }).catch((error) => {
      if (!this.pageAlive || this.isRouting) {
        return;
      }

      console.error("identity check failed", {
        errMsg: String(error && (error.errMsg || error.message) || ""),
      });
      this.setData({ authLoading: false });
      wx.showToast({
        title: "身份检查失败，请稍后重试",
        icon: "none",
      });
    });
  },
  routeTo(url) {
    if (this.isRouting) {
      return;
    }

    this.isRouting = true;
    wx.reLaunch({
      url,
      fail: () => {
        this.isRouting = false;
        this.setData({ authLoading: false });
        wx.showToast({
          title: "页面打开失败，请重试",
          icon: "none",
        });
      },
    });
  },
  goMemberVerify() {
    if (this.data.authLoading || this.isRouting) {
      return;
    }

    wx.navigateTo({
      url: "/pages/member-verify/member-verify",
    });
  },
  goGuestAccess() {
    if (this.data.authLoading || this.isRouting) {
      return;
    }

    wx.navigateTo({
      url: "/pages/guest-access/guest-access",
    });
  },
});
