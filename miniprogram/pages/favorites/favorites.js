const favoritePageSize = 100;

Page({
  data: {
    authLoading: true,
    verified: false,
    openid: "",
    isLoading: false,
    loadError: false,
    favoriteNotices: [],
    manageMode: false,
    selectedFavoriteIds: [],
    batchLoading: false,
  },
  onLoad() {
    this.checkMemberVerification();
  },
  onShow() {
    this.checkMemberVerification();
  },
  onShareTimeline() {
    return {
      title: "班级盒子｜班级事项统一查看",
      query: "",
    };
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

      const verified = result.verified === true;

      this.setData({
        authLoading: false,
        verified,
        openid: result.openid || "",
      });

      if (!verified) {
        this.setData({
          favoriteNotices: [],
          isLoading: false,
          loadError: false,
        });
        return null;
      }

      return this.loadFavorites();
    }).catch(() => {
      this.setData({
        authLoading: false,
        verified: false,
        openid: "",
        favoriteNotices: [],
        isLoading: false,
        loadError: true,
      });
      wx.showToast({
        title: "网络超时，请稍后重试",
        icon: "none",
      });
      return null;
    });
  },
  loadFavorites() {
    if (!this.data.openid) {
      return Promise.resolve();
    }

    this.setData({
      isLoading: true,
      loadError: false,
    });

    const db = wx.cloud.database();

    return db.collection("favorites")
      .where({
        openid: this.data.openid,
      })
      .limit(favoritePageSize)
      .get()
      .then((res) => {
        const favorites = (res.data || []).sort((a, b) => this.getTimeValue(b.createdAt) - this.getTimeValue(a.createdAt));

        if (!favorites.length) {
          this.setData({
            favoriteNotices: [],
            manageMode: false,
            selectedFavoriteIds: [],
            isLoading: false,
            loadError: false,
          });
          return null;
        }

        return Promise.all(favorites.map((favorite) => this.fetchNotice(favorite.noticeId)
          .then((notice) => notice ? {
            favorite,
            notice,
          } : null)))
          .then((notices) => {
            const favoriteNotices = notices
              .filter(Boolean)
              .map((item) => this.normalizeNotice(item.notice, item.favorite));

            this.setData({
              favoriteNotices,
              isLoading: false,
              loadError: false,
            });
            return null;
          });
      })
      .catch(() => {
        this.setData({
          favoriteNotices: [],
          isLoading: false,
          loadError: true,
        });
      });
  },
  fetchNotice(noticeId) {
    if (!noticeId) {
      return Promise.resolve(null);
    }

    const db = wx.cloud.database();

    return db.collection("notices")
      .doc(noticeId)
      .get()
      .then((res) => res.data || null)
      .catch(() => {
        return null;
      });
  },
  getTimeValue(value) {
    if (!value) {
      return 0;
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value.toDate === "function") {
      return value.toDate().getTime();
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  },
  normalizeNotice(notice, favorite) {
    const category = this.normalizeCategory(notice.category);
    const timeLabel = this.normalizeTimeLabel(notice.timeLabel || this.getDefaultTimeLabel(category));
    const isExpired = this.isNoticeExpired(notice);

    return {
      ...notice,
      favoriteId: favorite._id,
      selected: this.data.selectedFavoriteIds.includes(favorite._id),
      category,
      timeLabel,
      timeText: this.formatTimeRange(notice.deadline, notice.endTime),
      publisherNameText: this.getPublisherNameText(notice.publisherName),
      isExpired,
      statusText: isExpired ? "已过期" : "进行中",
    };
  },
  normalizeCategory(category) {
    return category === "比赛活动" ? "活动信息" : category;
  },
  normalizeTimeLabel(timeLabel) {
    return timeLabel === "事项时间" ? "相关时间" : timeLabel;
  },
  getDefaultTimeLabel(category) {
    const timeLabelMap = {
      考试安排: "考试时间",
      作业信息: "截止时间",
      活动信息: "报名截止",
      班级通知: "相关时间",
      其他: "相关时间",
    };

    return timeLabelMap[this.normalizeCategory(category)] || "时间";
  },
  getPublisherNameText(publisherName) {
    const name = String(publisherName || "").trim();

    return name || "未知";
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
  goDetail(e) {
    const noticeId = e.currentTarget.dataset.id;
    const favoriteId = e.currentTarget.dataset.favoriteId;

    if (this.data.manageMode) {
      this.toggleSelectFavorite(favoriteId);
      return;
    }

    if (!noticeId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/detail/detail?id=${noticeId}`,
    });
  },
  toggleManageMode() {
    const nextManageMode = !this.data.manageMode;

    this.setData({
      manageMode: nextManageMode,
      selectedFavoriteIds: [],
      favoriteNotices: this.data.favoriteNotices.map((notice) => ({
        ...notice,
        selected: false,
      })),
    });
  },
  toggleSelectFavorite(favoriteId) {
    if (!favoriteId) {
      return;
    }

    const selectedFavoriteIds = this.data.selectedFavoriteIds.includes(favoriteId)
      ? this.data.selectedFavoriteIds.filter((id) => id !== favoriteId)
      : this.data.selectedFavoriteIds.concat(favoriteId);
    const selectedMap = selectedFavoriteIds.reduce((map, id) => {
      map[id] = true;
      return map;
    }, {});

    this.setData({
      selectedFavoriteIds,
      favoriteNotices: this.data.favoriteNotices.map((notice) => ({
        ...notice,
        selected: !!selectedMap[notice.favoriteId],
      })),
    });
  },
  batchCancelFavorite() {
    if (this.data.batchLoading) {
      return;
    }

    const selectedFavoriteIds = this.data.selectedFavoriteIds;

    if (!selectedFavoriteIds.length) {
      wx.showToast({
        title: "请选择要取消收藏的事项",
        icon: "none",
      });
      return;
    }

    wx.showModal({
      title: "取消收藏",
      content: "确定将选中的事项移出收藏吗？",
      success: (modalRes) => {
        if (!modalRes.confirm) {
          return;
        }

        this.removeSelectedFavorites(selectedFavoriteIds);
      },
    });
  },
  removeSelectedFavorites(selectedFavoriteIds) {
    this.setData({
      batchLoading: true,
    });

    const selectedSet = selectedFavoriteIds.reduce((map, id) => {
      map[id] = true;
      return map;
    }, {});
    const db = wx.cloud.database();
    const selectedNotices = this.data.favoriteNotices.filter((notice) => selectedSet[notice.favoriteId]);

    Promise.all(selectedNotices.map((notice) => db.collection("favorites")
      .doc(notice.favoriteId)
      .remove()))
      .then(() => {
        this.setData({
          favoriteNotices: this.data.favoriteNotices.filter((notice) => !selectedSet[notice.favoriteId]),
          selectedFavoriteIds: [],
          batchLoading: false,
          manageMode: false,
        });
        wx.showToast({
          title: "已取消收藏",
          icon: "success",
        });
      })
      .catch(() => {
        this.setData({
          batchLoading: false,
        });
        wx.showToast({
          title: "操作失败，请稍后重试",
          icon: "none",
        });
      });
  },
  goMemberVerify() {
    wx.navigateTo({
      url: "/pages/member-verify/member-verify",
    });
  },
});
