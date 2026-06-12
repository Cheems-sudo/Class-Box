Page({
  data: {
    form: {
      inviteCode: "",
    },
    inviteCodeReady: false,
    authLoading: true,
    verified: false,
    submitting: false,
  },
  onLoad() {
    this.checkMemberVerification();
  },
  onShow() {
    this.checkMemberVerification();
  },
  checkMemberVerification() {
    this.setData({
      authLoading: true,
    });

    return wx.cloud.callFunction({
      name: "checkAdmin",
    }).then((res) => {
      const result = res.result || {};

      if (!result.success) {
        throw new Error(result.message || "checkAdmin failed");
      }

      this.setData({
        authLoading: false,
        verified: result.verified === true,
      });
    }).catch(() => {
      this.setData({
        authLoading: false,
        verified: false,
      });
      this.showError("请先完成班级身份验证");
    });
  },
  onInviteCodeInput(e) {
    const inviteCode = e.detail.value;

    this.setData({
      "form.inviteCode": inviteCode,
      inviteCodeReady: inviteCode.trim().length > 0,
    });
  },
  showError(message) {
    wx.showToast({
      title: message,
      icon: "none",
    });
  },
  goMemberVerify() {
    wx.navigateTo({
      url: "/pages/member-verify/member-verify",
    });
  },
  submitAuth() {
    if (this.data.submitting) {
      return;
    }

    if (!this.data.verified) {
      this.showError("请先完成班级身份验证");
      return;
    }

    const inviteCode = this.data.form.inviteCode.trim();

    if (!inviteCode) {
      this.showError("请输入管理员邀请码");
      return;
    }

    this.setData({
      submitting: true,
    });

    wx.cloud
      .callFunction({
        name: "applyAdminInvite",
        data: {
          inviteCode,
        },
      })
      .then((res) => {
        const result = res.result || {};

        if (!result.success) {
          this.showError(result.message || "邀请码不存在或已被使用");
          this.setData({
            submitting: false,
          });
          return;
        }

        wx.showToast({
          title: result.message || "管理员权限开通成功",
          icon: "success",
        });

        this.setData({
          form: {
            inviteCode: "",
          },
          inviteCodeReady: false,
          submitting: false,
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 800);
      })
      .catch(() => {
        this.showError("邀请码不存在或已被使用");
        this.setData({
          submitting: false,
        });
      });
  },
});
