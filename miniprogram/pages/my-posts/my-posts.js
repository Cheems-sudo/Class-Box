const pageSize = 20;

Page({
  data: {
    authLoading: true,
    verified: false,
    canView: false,
    openid: "",
    isLoading: false,
    loadError: false,
    noticeList: [],
  },
  onLoad() {
    this.checkPermission();
  },
  onShow() {
    this.checkPermission();
  },
  onPullDownRefresh() {
    this.checkPermission({
      stopRefresh: true,
    });
  },
  onShareTimeline() {
    return {
      title: "班级盒子｜班级事项统一查看",
      query: "",
    };
  },
  checkPermission(options = {}) {
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

      const verified = result.verified === true;
      const role = String(result.role || "").trim();
      const canView = verified && (role === "admin" || role === "superAdmin");
      const openid = result.openid || "";

      this.setData({
        authLoading: false,
        verified,
        canView,
        openid,
      });

      if (!verified || !canView || !openid) {
        this.setData({
          noticeList: [],
          isLoading: false,
          loadError: false,
        });

        if (options.stopRefresh) {
          wx.stopPullDownRefresh();
        }
        return null;
      }

      return this.loadMyPosts(options);
    }).catch((error) => {
      this.setData({
        authLoading: false,
        verified: false,
        canView: false,
        openid: "",
        noticeList: [],
        isLoading: false,
        loadError: true,
      });

      if (options.stopRefresh) {
        wx.stopPullDownRefresh();
      }
      wx.showToast({
        title: "网络超时，请稍后重试",
        icon: "none",
      });
      return null;
    });
  },
  loadMyPosts(options = {}) {
    this.setData({
      isLoading: true,
      loadError: false,
    });

    this.fetchMyPublishedNotices()
      .then((list) => {
        const noticeList = list.map((notice) => {
          const category = this.normalizeCategory(notice.category);
          const timeLabel = this.normalizeTimeLabel(notice.timeLabel || this.getDefaultTimeLabel(category));
          const isExpired = this.isNoticeExpired(notice);

          return {
            ...notice,
            category,
            timeLabel,
            isExpired,
            statusText: isExpired ? "已过期" : "进行中",
            timeText: this.formatTimeRange(notice.deadline, notice.endTime),
            publisherNameText: this.getPublisherNameText(notice.publisherName),
            updatedAtText: this.formatUpdatedAt(notice.updatedAt),
          };
        }).sort((a, b) => this.getPublishSortTime(b) - this.getPublishSortTime(a));

        this.setData({
          noticeList,
          isLoading: false,
          loadError: false,
        });

        if (options.stopRefresh) {
          wx.stopPullDownRefresh();
        }
      })
      .catch((error) => {
        this.setData({
          noticeList: [],
          isLoading: false,
          loadError: true,
        });

        if (options.stopRefresh) {
          wx.stopPullDownRefresh();
        }
        wx.showToast({
          title: "加载失败，请下拉刷新重试",
          icon: "none",
        });
      });
  },
  async fetchMyPublishedNotices() {
    const db = wx.cloud.database();
    const allNotices = [];
    let page = 0;

    while (true) {
      const res = await db.collection("notices")
        .where({
          publisherOpenid: this.data.openid,
          status: "published",
        })
        .skip(page * pageSize)
        .limit(pageSize)
        .get();
      const currentList = res.data || [];

      allNotices.push(...currentList);

      if (currentList.length < pageSize) {
        break;
      }

      page += 1;
    }

    return allNotices;
  },
  goDetail(e) {
    const noticeId = e.currentTarget.dataset.id;

    if (!noticeId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/detail/detail?id=${noticeId}`,
    });
  },
  normalizeCategory(category) {
    return category === "比赛活动" ? "活动信息" : category;
  },
  normalizeTimeLabel(timeLabel) {
    return timeLabel === "事项时间" ? "相关时间" : timeLabel;
  },
  getDefaultTimeLabel(category) {
    const normalizedCategory = this.normalizeCategory(category);
    const timeLabelMap = {
      考试安排: "考试时间",
      作业信息: "截止时间",
      活动信息: "报名截止",
      班级通知: "相关时间",
      其他: "相关时间",
    };

    return timeLabelMap[normalizedCategory] || "时间";
  },
  getPublisherNameText(publisherName) {
    const name = String(publisherName || "").trim();

    return name || "";
  },
  formatTimeRange(deadline, endTime) {
    if (!deadline) {
      return "";
    }

    if (!endTime) {
      return this.formatSingleTime(deadline);
    }

    const start = this.parseTimeValue(deadline);
    const end = this.parseTimeValue(endTime);

    if (start.date && start.time && end.date && end.time && start.date === end.date) {
      return `${start.date} ${start.time} - ${end.time}`;
    }

    return `${this.formatSingleTime(deadline)} - ${this.formatSingleTime(endTime)}`;
  },
  parseTimeValue(value) {
    const [date, time] = String(value || "").split(" ");

    return {
      date,
      time,
    };
  },
  formatSingleTime(value) {
    const { date, time } = this.parseTimeValue(value);

    if (!date) {
      return "";
    }

    return time ? `${date} ${time}` : `${date}，具体时间待定`;
  },
  parseNoticeTime(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    const rawValue = String(value).trim();

    if (!rawValue) {
      return null;
    }

    const hasTime = /\d{1,2}:\d{1,2}/.test(rawValue);
    const normalizedValue = rawValue
      .replace(/\./g, "-")
      .replace(/\//g, "-")
      .replace("T", " ");
    let dateText = normalizedValue;

    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalizedValue)) {
      dateText = `${normalizedValue} 23:59:59`;
    } else if (!hasTime && /^\d{4}-\d{1,2}-\d{1,2}\s/.test(normalizedValue)) {
      dateText = `${normalizedValue.split(/\s+/)[0]} 23:59:59`;
    }

    const date = new Date(dateText.replace(/-/g, "/"));

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  },
  getNoticeExpireTime(notice) {
    return this.parseNoticeTime(notice.endTime || notice.deadline);
  },
  isNoticeExpired(notice) {
    const expireTime = this.getNoticeExpireTime(notice);

    if (!expireTime) {
      return false;
    }

    return expireTime.getTime() < Date.now();
  },
  getPublishSortTime(notice) {
    const sortTime = this.parseNoticeTime(notice.updatedAt || notice.createdAt || notice.deadline);

    return sortTime ? sortTime.getTime() : 0;
  },
  formatUpdatedAt(value) {
    const date = this.parseNoticeTime(value);

    if (!date) {
      return "";
    }

    const pad = (num) => String(num).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },
});
