Page({
  data: {
    accessCode: "",
    submitting: false,
    errorMessage: "",
  },
  isRouting: false,
  onAccessCodeInput(e) {
    this.setData({
      accessCode: e.detail.value,
      errorMessage: "",
    });
  },
  submitAccess() {
    if (this.data.submitting || this.isRouting) {
      return;
    }

    const accessCode = String(this.data.accessCode || "").trim();

    if (!accessCode) {
      this.showError("请输入访问码");
      return;
    }

    this.setData({
      submitting: true,
      errorMessage: "",
    });

    wx.cloud.callFunction({
      name: "verifyGuestAccess",
      data: { accessCode },
    }).then((res) => {
      const result = res.result || {};

      if (!result.success) {
        const message = result.errorType === "invalid_code"
          ? "访问码错误，请重新输入"
          : "暂时无法验证，请稍后重试";
        this.showError(message);
        return;
      }

      if (result.alreadyMember === true || result.isMember === true || result.verified === true) {
        this.isRouting = true;
        wx.showToast({
          title: "当前账号已经是班级成员",
          icon: "none",
        });
        setTimeout(() => {
          wx.reLaunch({
            url: "/pages/index/index",
            fail: () => {
              this.isRouting = false;
              this.showError("页面打开失败，请重试");
            },
          });
        }, 500);
        return;
      }

      if (result.isGuest !== true || result.userType !== "guest") {
        this.showError("暂时无法验证，请稍后重试");
        return;
      }

      this.isRouting = true;
      wx.redirectTo({
        url: "/pages/class-assistant/class-assistant",
        fail: () => {
          this.isRouting = false;
          this.showError("页面打开失败，请重试");
        },
      });
    }).catch((error) => {
      console.error("guest access verification failed", {
        errMsg: String(error && (error.errMsg || error.message) || ""),
      });
      this.showError("暂时无法验证，请稍后重试");
    }).finally(() => {
      this.setData({ submitting: false });
    });
  },
  showError(message) {
    this.setData({
      errorMessage: message,
    });
    wx.showToast({
      title: message,
      icon: "none",
    });
  },
});
