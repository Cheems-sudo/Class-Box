const noticePageSize = 20;

Page({
  data: {
    categories: ["全部", "考试安排", "作业信息", "活动信息", "班级通知", "其他"],
    statusFilters: ["进行中", "已过期", "全部"],
    activeCategory: "全部",
    activeStatus: "进行中",
    searchKeyword: "",
    noticeList: [],
    filteredNoticeList: [],
    authLoading: true,
    verified: false,
    isLoading: false,
    loadError: false,
  },
  onLoad() {
    this.checkMemberVerification();
  },
  onShow() {
    this.checkMemberVerification();
  },
  onPullDownRefresh() {
    this.checkMemberVerification({
      stopRefresh: true,
    });
  },
  onShareAppMessage() {
    return {
      title: "班级盒子｜班级事项统一查看",
      path: "/pages/index/index",
      desc: "班级考试、作业、活动和通知统一查看。",
    };
  },
  onShareTimeline() {
    return {
      title: "班级盒子｜班级事项统一查看",
      query: "",
    };
  },
  checkMemberVerification(options = {}) {
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

      this.setData({
        authLoading: false,
        verified,
      });

      if (!verified) {
        this.setData({
          noticeList: [],
          filteredNoticeList: [],
          isLoading: false,
          loadError: false,
        });

        if (options.stopRefresh) {
          wx.stopPullDownRefresh();
        }
        return null;
      }

      return this.loadNotices(options);
    }).catch(() => {
      this.setData({
        authLoading: false,
        verified: false,
        noticeList: [],
        filteredNoticeList: [],
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
  loadNotices(options = {}) {
    this.setData({
      isLoading: true,
      loadError: false,
    });

    this.fetchVisibleNotices()
      .then((list) => {
        const noticeList = list.map((notice) => {
          const category = this.normalizeCategory(notice.category);
          const timeLabel = this.normalizeTimeLabel(notice.timeLabel || this.getDefaultTimeLabel(category));
          const isExpired = this.isNoticeExpired(notice);
          const courseText = String(notice.course || "").trim();
          const locationText = String(notice.location || notice.place || "").trim();
          const publisherNameText = this.getPublisherNameText(notice.publisherName);

          return {
            ...notice,
            category,
            timeLabel,
            courseLabel: this.getCourseLabel(category),
            courseText,
            locationLabel: this.getLocationLabel(category),
            locationText,
            publisherNameText,
            isPinned: notice.isPinned === true,
            isExpired,
            statusText: isExpired ? "已过期" : "进行中",
            timeText: this.formatTimeRange(notice.deadline, notice.endTime),
            important: notice.isImportant,
            place: notice.location,
          };
        }).sort((a, b) => {
          if (a.isPinned !== b.isPinned) {
            return a.isPinned ? -1 : 1;
          }

          const sortResult = this.getSortTime(a) - this.getSortTime(b);

          if (sortResult !== 0) {
            return sortResult;
          }

          return String(a.deadline || "").localeCompare(String(b.deadline || ""));
        });

        this.setData({
          noticeList,
          isLoading: false,
          loadError: false,
        }, () => {
          this.filterNotices();

          if (options.stopRefresh) {
            wx.stopPullDownRefresh();
          }
        });
      })
      .catch(() => {
        this.setData({
          noticeList: [],
          filteredNoticeList: [],
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
  async fetchVisibleNotices() {
    const db = wx.cloud.database();
    const _ = db.command;
    const publishedList = await this.fetchNoticesByWhere({
      status: "published",
    });
    let legacyList = [];

    try {
      legacyList = await this.fetchNoticesByWhere({
        status: _.exists(false),
      });
    } catch (error) {}

    const noticeMap = {};

    publishedList.concat(legacyList).forEach((notice) => {
      if (notice && notice._id) {
        noticeMap[notice._id] = notice;
      }
    });

    return Object.keys(noticeMap).map((id) => noticeMap[id]);
  },
  async fetchNoticesByWhere(where) {
    const db = wx.cloud.database();
    const allNotices = [];
    let page = 0;

    while (true) {
      const res = await db.collection("notices")
        .where(where)
        .orderBy("deadline", "asc")
        .skip(page * noticePageSize)
        .limit(noticePageSize)
        .get();
      const currentList = res.data || [];

      allNotices.push(...currentList);

      if (currentList.length < noticePageSize) {
        break;
      }

      page += 1;
    }

    return allNotices;
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
  normalizeCategory(category) {
    return category === "比赛活动" ? "活动信息" : category;
  },
  normalizeTimeLabel(timeLabel) {
    return timeLabel === "事项时间" ? "相关时间" : timeLabel;
  },
  getPublisherNameText(publisherName) {
    const name = String(publisherName || "").trim();

    return name || "未知";
  },
  getCourseLabel(category) {
    const normalizedCategory = this.normalizeCategory(category);
    const courseLabelMap = {
      考试安排: "科目",
      作业信息: "课程",
      活动信息: "活动名称",
      班级通知: "事项名称",
      其他: "事项名称",
    };

    return courseLabelMap[normalizedCategory] || "事项名称";
  },
  getLocationLabel(category) {
    const normalizedCategory = this.normalizeCategory(category);
    const locationLabelMap = {
      考试安排: "考试地点",
      作业信息: "提交方式",
      活动信息: "活动地点",
      班级通知: "地点",
      其他: "地点",
    };

    return locationLabelMap[normalizedCategory] || "地点";
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
  getSortTime(notice) {
    const sortTime = this.parseNoticeTime(notice.deadline);

    return sortTime ? sortTime.getTime() : Number.MAX_SAFE_INTEGER;
  },
  changeCategory(e) {
    this.setData({
      activeCategory: e.currentTarget.dataset.category,
    }, () => {
      this.filterNotices();
    });
  },
  changeStatus(e) {
    this.setData({
      activeStatus: e.currentTarget.dataset.status,
    }, () => {
      this.filterNotices();
    });
  },
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value.trim(),
    }, () => {
      this.filterNotices();
    });
  },
  filterNotices() {
    const { activeCategory, activeStatus, searchKeyword, noticeList } = this.data;
    const keyword = searchKeyword.toLowerCase();
    const filteredNoticeList = noticeList.filter((notice) => {
      const matchCategory = activeCategory === "全部" || this.normalizeCategory(notice.category) === activeCategory;
      const matchStatus = activeStatus === "全部" || notice.statusText === activeStatus;
      const searchableText = `${notice.title || ""}${notice.content || ""}${notice.course || ""}`.toLowerCase();
      const matchKeyword = !keyword || searchableText.includes(keyword);

      return matchStatus && matchCategory && matchKeyword;
    }).sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }

      const sortResult = this.getSortTime(a) - this.getSortTime(b);

      if (sortResult !== 0) {
        return sortResult;
      }

      return String(a.deadline || "").localeCompare(String(b.deadline || ""));
    });

    this.setData({
      filteredNoticeList,
    });
  },
  goDetail(e) {
    const index = e.currentTarget.dataset.index;
    const notice = this.data.filteredNoticeList[index];

    if (!notice) {
      return;
    }

    wx.navigateTo({
      url: `/pages/detail/detail?noticeId=${notice._id}`,
    });
  },
  goMemberVerify() {
    wx.navigateTo({
      url: "/pages/member-verify/member-verify",
    });
  },
});
