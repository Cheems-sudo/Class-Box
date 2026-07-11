// 页面逻辑：管理 feedback 页面的状态、用户交互与数据请求。
const maxLength = 300;
const minLength = 2;

Page({
  data: {
    content: "",
    contentLength: 0,
    maxLength,
    submitting: false,
  },

  onContentInput(event) {
    const content = event.detail.value || "";

    this.setData({
      content,
      contentLength: content.trim().length,
    });
  },

  // 提交前完成校验并锁定重复操作，统一处理成功回写和失败恢复。
  submitFeedback() {
    if (this.data.submitting) {
      return;
    }

    const content = String(this.data.content || "").trim();

    if (!content) {
      wx.showToast({
        title: "请输入反馈内容",
        icon: "none",
      });
      return;
    }

    if (content.length < minLength) {
      wx.showToast({
        title: "反馈内容至少 2 个字",
        icon: "none",
      });
      return;
    }

    if (content.length > maxLength) {
      wx.showToast({
        title: "反馈内容不能超过 300 字",
        icon: "none",
      });
      return;
    }

    this.setData({
      submitting: true,
    });

    wx.cloud
      .callFunction({
        name: "submitFeedback",
        data: {
          content,
        },
      })
      .then((res) => {
        const result = res.result || {};

        if (!result.success) {
          throw new Error(result.message || "提交失败，请稍后重试");
        }

        wx.showToast({
          title: "提交成功，感谢反馈",
          icon: "success",
        });

        this.setData({
          content: "",
          contentLength: 0,
        });
      })
      .catch((error) => {
        wx.showToast({
          title: error && error.message ? error.message : "提交失败，请稍后重试",
          icon: "none",
        });
      })
      .finally(() => {
        this.setData({
          submitting: false,
        });
      });
  },
});
