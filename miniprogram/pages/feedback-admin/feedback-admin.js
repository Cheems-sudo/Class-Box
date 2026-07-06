const pageSize = 50;

Page({
  data: {
    loading: true,
    loadingMore: false,
    errorMessage: "",
    feedbackList: [],
    hasMore: false,
    nextCursor: null,
  },

  onLoad() {
    this.loadFeedbacks({ reset: true });
  },

  onPullDownRefresh() {
    this.loadFeedbacks({ reset: true }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) {
      return;
    }

    this.loadFeedbacks();
  },

  loadFeedbacks(options = {}) {
    const reset = options.reset === true;
    const cursor = reset ? null : this.data.nextCursor;

    this.setData({
      loading: reset,
      loadingMore: !reset,
      errorMessage: reset ? "" : this.data.errorMessage,
    });

    return wx.cloud
      .callFunction({
        name: "listFeedbacks",
        data: {
          pageSize,
          cursor,
        },
      })
      .then((res) => {
        const result = res.result || {};

        if (!result.success) {
          throw new Error(result.message || "反馈加载失败，请稍后重试");
        }

        const nextList = this.normalizeFeedbacks(result.list);

        this.setData({
          feedbackList: reset ? nextList : this.data.feedbackList.concat(nextList),
          hasMore: result.hasMore === true,
          nextCursor: result.nextCursor || null,
          errorMessage: "",
        });
      })
      .catch((error) => {
        const message = error && error.message ? error.message : "反馈加载失败，请稍后重试";

        this.setData({
          errorMessage: message,
          hasMore: false,
        });

        wx.showToast({
          title: message,
          icon: "none",
        });
      })
      .finally(() => {
        this.setData({
          loading: false,
          loadingMore: false,
        });
      });
  },

  retryLoad() {
    this.loadFeedbacks({ reset: true });
  },

  normalizeFeedbacks(list) {
    if (!Array.isArray(list)) {
      return [];
    }

    return list.map((item) => ({
      id: item.id || "",
      userName: item.userName || "匿名用户",
      content: item.content || "",
      createdAtText: this.formatTime(item.createdAt),
    }));
  },

  formatTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "时间未知";
    }

    const pad = (number) => String(number).padStart(2, "0");

    return [
      date.getFullYear(),
      "-",
      pad(date.getMonth() + 1),
      "-",
      pad(date.getDate()),
      " ",
      pad(date.getHours()),
      ":",
      pad(date.getMinutes()),
    ].join("");
  },
});
