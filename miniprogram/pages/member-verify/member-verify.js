// 页面逻辑：管理 member-verify 页面的状态、用户交互与数据请求。
Page({
  data: {
    name: "",
    studentId: "",
    submitting: false,
    errorMessage: "",
  },
  onNameInput(e) {
    this.setData({
      name: e.detail.value,
      errorMessage: "",
    });
  },
  onStudentIdInput(e) {
    this.setData({
      studentId: e.detail.value,
      errorMessage: "",
    });
  },
  // 提交前完成校验并锁定重复操作，统一处理成功回写和失败恢复。
  submitVerify() {
    if (this.data.submitting) {
      return;
    }

    const name = String(this.data.name || "").trim();
    const studentId = String(this.data.studentId || "").trim();

    if (!name || !studentId) {
      this.setData({
        errorMessage: "请填写姓名和学号",
      });
      wx.showToast({
        title: "请填写姓名和学号",
        icon: "none",
      });
      return;
    }

    this.setData({
      submitting: true,
    });
    wx.showLoading({
      title: "验证中",
      mask: true,
    });

    wx.cloud.callFunction({
      name: "verifyMember",
      data: {
        name,
        studentId,
      },
    }).then((res) => {
      const result = res.result || {};

      if (!result.success) {
        wx.hideLoading();
        this.setData({
          errorMessage: result.message || "验证失败",
        });
        wx.showToast({
          title: result.message || "验证失败",
          icon: "none",
        });
        return;
      }

      this.setData({
        errorMessage: "",
      });
      wx.showToast({
        title: "身份验证成功",
        icon: "success",
      });

      setTimeout(() => {
        const pages = getCurrentPages();

        if (pages.length > 1) {
          wx.navigateBack();
          return;
        }

        wx.switchTab({
          url: "/pages/index/index",
        });
      }, 800);
    }).catch(() => {
      wx.hideLoading();
      this.setData({
        errorMessage: "网络超时，请稍后重试",
      });
      wx.showToast({
        title: "网络超时，请稍后重试",
        icon: "none",
      });
    }).finally(() => {
      wx.hideLoading();
      this.setData({
        submitting: false,
      });
    });
  },
});
