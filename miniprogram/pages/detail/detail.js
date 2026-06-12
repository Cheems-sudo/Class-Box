const supportedAttachmentTypes = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const editNoticeStorageKey = "pendingEditNotice";

Page({
  data: {
    detail: null,
    notFound: false,
    authLoading: true,
    verified: false,
    isAdmin: false,
    isSuperAdmin: false,
    openid: "",
    canManage: false,
    isFavorited: false,
    favoriteId: "",
    favoriteLoading: false,
  },
  onLoad(options) {
    this.pendingNoticeId = String((options && (options.noticeId || options.id)) || "").trim();

    if (this.pendingNoticeId) {
      this.setData({
        detail: null,
        notFound: false,
      });
      this.checkAdminPermission();
      return;
    }

    this.setData({
      detail: null,
      notFound: true,
    });
    this.checkAdminPermission();
  },
  normalizeDetail(detail) {
    detail.isPinned = detail.isPinned === true || detail.pinned === true;
    detail.pinned = detail.isPinned;
    detail.category = this.normalizeCategory(detail.category);
    detail.timeLabel = this.normalizeTimeLabel(detail.timeLabel || this.getDefaultTimeLabel(detail.category));
    detail.place = detail.place || detail.location;
    detail.courseLabel = this.getCourseLabel(detail.category);
    detail.courseText = String(detail.course || "").trim();
    detail.locationLabel = this.getLocationLabel(detail.category);
    detail.locationText = String(detail.location || detail.place || "").trim();
    detail.publisherNameText = this.getPublisherNameText(detail.publisherName);
    detail.images = this.normalizeImages(detail.images);
    detail.attachments = this.normalizeAttachments(detail.attachments);
    detail.links = this.normalizeLinks(detail.links);
    detail.timeText = this.formatTimeRange(detail.deadline, detail.endTime);
    detail.isExpired = this.isNoticeExpired(detail);
    detail.statusText = detail.isExpired ? "已过期" : "进行中";

    return detail;
  },
  loadNoticeDetail(noticeId) {
    if (!noticeId) {
      return;
    }

    const db = wx.cloud.database();

    db.collection("notices").doc(noticeId).get()
      .then((res) => {
        if (!res.data) {
          this.setData({
            detail: null,
            notFound: true,
          });
          return;
        }

        const detail = this.normalizeDetail(res.data);

        this.setData({
          detail,
          notFound: false,
          canManage: this.canManageNotice(detail, this.data.openid, this.data.isAdmin, this.data.isSuperAdmin),
        });
        this.loadImageTempFileURLs();
        this.loadFavoriteStatus();
      })
      .catch(() => {
        this.setData({
          detail: null,
          notFound: true,
        });
      });
  },
  checkAdminPermission() {
    wx.cloud
      .callFunction({
        name: "checkAdmin",
      })
      .then((res) => {
        const result = res.result || {};

        if (!result.success) {
          throw new Error(result.message || "checkAdmin failed");
        }

        const verified = result.verified === true;

        this.setData({
          authLoading: false,
          verified,
          isAdmin: result.isAdmin === true,
          isSuperAdmin: result.isSuperAdmin === true,
          openid: result.openid || "",
          canManage: verified && this.canManageNotice(this.data.detail, result.openid || "", result.isAdmin === true, result.isSuperAdmin === true),
        });

        if (verified) {
          const detail = this.data.detail;

          if (this.pendingNoticeId) {
            this.loadNoticeDetail(this.pendingNoticeId);
          } else if (detail && detail._id) {
            this.loadNoticeDetail(detail._id);
          } else {
            this.loadImageTempFileURLs();
          }
        }
      })
      .catch(() => {
        this.setData({
          authLoading: false,
          verified: false,
          isAdmin: false,
          isSuperAdmin: false,
          openid: "",
          canManage: false,
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
  onShareAppMessage() {
    const detail = this.data.detail || {};
    const titleText = String(detail.title || "").trim();
    const noticeId = detail._id || this.pendingNoticeId || "";

    return {
      title: titleText ? `班级盒子｜${titleText}` : "班级盒子｜班级事项统一查看",
      path: noticeId ? `/pages/detail/detail?id=${noticeId}` : "/pages/index/index",
      desc: "班级考试、作业、活动和通知统一查看。",
    };
  },
  onShareTimeline() {
    const detail = this.data.detail || {};
    const titleText = String(detail.title || "").trim();
    const noticeId = detail._id || this.pendingNoticeId || "";

    return {
      title: titleText ? `班级盒子｜${titleText}` : "班级盒子｜班级事项统一查看",
      query: noticeId ? `id=${noticeId}` : "",
    };
  },
  loadFavoriteStatus() {
    const detail = this.data.detail;

    if (!this.data.verified || !this.data.openid || !detail || !detail._id) {
      this.setData({
        isFavorited: false,
        favoriteId: "",
      });
      return;
    }

    const db = wx.cloud.database();

    db.collection("favorites")
      .where({
        openid: this.data.openid,
        noticeId: detail._id,
      })
      .limit(1)
      .get()
      .then((res) => {
        const favorite = (res.data || [])[0];

        this.setData({
          isFavorited: !!favorite,
          favoriteId: favorite ? favorite._id : "",
        });
      })
      .catch(() => {});
  },
  toggleFavorite() {
    if (this.data.favoriteLoading) {
      return;
    }

    if (!this.data.verified) {
      wx.showToast({
        title: "请先完成班级身份验证",
        icon: "none",
      });
      return;
    }

    const detail = this.data.detail;

    if (!this.data.openid || !detail || !detail._id) {
      wx.showToast({
        title: "事项信息异常",
        icon: "none",
      });
      return;
    }

    this.setData({
      favoriteLoading: true,
    });

    const db = wx.cloud.database();
    const query = {
      openid: this.data.openid,
      noticeId: detail._id,
    };

    db.collection("favorites")
      .where(query)
      .limit(1)
      .get()
      .then((res) => {
        const favorite = (res.data || [])[0];

        if (favorite) {
          return db.collection("favorites")
            .doc(favorite._id)
            .remove()
            .then(() => ({
              isFavorited: false,
              favoriteId: "",
              message: "已取消收藏",
            }));
        }

        return db.collection("favorites")
          .add({
            data: {
              openid: this.data.openid,
              noticeId: detail._id,
              createdAt: new Date(),
            },
          })
          .then((addRes) => ({
            isFavorited: true,
            favoriteId: addRes._id || "",
            message: "已收藏",
          }));
      })
      .then((result) => {
        this.setData({
          isFavorited: result.isFavorited,
          favoriteId: result.favoriteId,
          favoriteLoading: false,
        });
        wx.showToast({
          title: result.message,
          icon: "success",
        });
      })
      .catch(() => {
        this.setData({
          favoriteLoading: false,
        });
        wx.showToast({
          title: "操作失败，请稍后重试",
          icon: "none",
        });
      });
  },
  canManageNotice(detail, openid, isAdmin, isSuperAdmin) {
    if (!detail || !isAdmin) {
      return false;
    }

    if (isSuperAdmin) {
      return true;
    }

    return !!openid && !!detail.publisherOpenid && detail.publisherOpenid === openid;
  },
  editNotice() {
    if (!this.data.canManage) {
      wx.showToast({
        title: "暂无操作权限",
        icon: "none",
      });
      return;
    }

    const detail = this.data.detail;

    if (!detail || !detail._id) {
      wx.showToast({
        title: "事项数据异常",
        icon: "none",
      });
      return;
    }

    wx.setStorageSync(editNoticeStorageKey, detail);
    wx.switchTab({
      url: "/pages/publish/publish",
    });
  },
  deleteNotice() {
    if (!this.data.canManage) {
      wx.showToast({
        title: "暂无操作权限",
        icon: "none",
      });
      return;
    }

    const detail = this.data.detail;

    if (!detail || !detail._id) {
      wx.showToast({
        title: "事项数据异常",
        icon: "none",
      });
      return;
    }

    wx.showModal({
      title: "提示",
      content: "确认删除该事项吗？",
      success: (modalRes) => {
        if (!modalRes.confirm) {
          return;
        }

        wx.cloud
          .callFunction({
            name: "deleteNotice",
            data: {
              noticeId: detail._id,
            },
          })
          .then((res) => {
            const result = res.result || {};

            if (!result.success) {
              wx.showToast({
                title: result.message || "删除失败",
                icon: "none",
              });
              return;
            }

            wx.showToast({
              title: result.message || "删除成功",
              icon: "success",
            });
            wx.switchTab({
              url: "/pages/index/index",
            });
          })
          .catch(() => {
            wx.showToast({
              title: "删除失败",
              icon: "none",
            });
          });
      },
    });
  },
  togglePinNotice() {
    if (!this.data.canManage) {
      wx.showToast({
        title: "暂无操作权限",
        icon: "none",
      });
      return;
    }

    const detail = this.data.detail;

    if (!detail || !detail._id) {
      wx.showToast({
        title: "事项数据异常",
        icon: "none",
      });
      return;
    }

    const nextPinned = detail.isPinned !== true;

    wx.cloud.callFunction({
      name: "updateNoticePin",
      data: {
        noticeId: detail._id,
        pinned: nextPinned,
      },
    })
      .then((res) => {
        const result = res.result || {};

        if (!result.success) {
          throw new Error(result.message || "updateNoticePin failed");
        }

        this.setData({
          "detail.isPinned": nextPinned,
          "detail.pinned": nextPinned,
        });
        wx.showToast({
          title: nextPinned ? "已置顶" : "已取消置顶",
          icon: "success",
        });
      })
      .catch(() => {
        wx.showToast({
          title: "操作失败",
          icon: "none",
        });
      });
  },
  normalizeImages(images) {
    if (!Array.isArray(images)) {
      return [];
    }

    return images
      .filter((image) => image && image.fileID)
      .map((image) => ({
        fileID: image.fileID,
        tempFileURL: image.tempFileURL || image.url || "",
        url: image.url || "",
        name: image.name || "图片",
        uploadedAt: image.uploadedAt || "",
      }));
  },
  normalizeAttachments(attachments) {
    if (!Array.isArray(attachments)) {
      return [];
    }

    return attachments
      .filter((attachment) => attachment && attachment.fileID)
      .map((attachment) => {
        const name = attachment.name || "附件";
        const type = this.getAttachmentType(name, attachment.type);
        const size = Number(attachment.size) || 0;

        return {
          fileID: attachment.fileID,
          name,
          size,
          type,
          formattedSize: this.formatFileSize(size),
          uploadedAt: attachment.uploadedAt || "",
        };
      });
  },
  normalizeLinks(links) {
    if (!Array.isArray(links)) {
      return [];
    }

    return links
      .filter((link) => link && link.url)
      .map((link) => ({
        title: String(link.title || "").trim() || "相关链接",
        url: String(link.url || "").trim(),
      }))
      .filter((link) => link.url);
  },
  loadImageTempFileURLs() {
    const detail = this.data.detail;
    const images = detail && detail.images ? detail.images : [];
    const fileList = images
      .filter((image) => image.fileID)
      .map((image) => image.fileID);

    if (!fileList.length) {
      return;
    }

    wx.cloud.getTempFileURL({
      fileList,
    }).then((res) => {
      const tempFileMap = {};

      (res.fileList || []).forEach((file) => {
        if (file.fileID && file.tempFileURL) {
          tempFileMap[file.fileID] = file.tempFileURL;
        }
      });

      const nextImages = images.map((image) => ({
        ...image,
        tempFileURL: tempFileMap[image.fileID] || image.tempFileURL || image.url || "",
      }));

      this.setData({
        "detail.images": nextImages,
      });
    }).catch(() => {});
  },
  previewImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const urls = (this.data.detail.images || [])
      .map((image) => image.tempFileURL || image.fileID || image.url)
      .filter(Boolean);

    if (!urls.length) {
      return;
    }

    wx.previewImage({
      current: urls[index] || urls[0],
      urls,
    });
  },
  copyLink(e) {
    const index = Number(e.currentTarget.dataset.index);
    const link = (this.data.detail.links || [])[index];

    if (!link || !link.url) {
      return;
    }

    wx.setClipboardData({
      data: link.url,
      success: () => {
        wx.showToast({
          title: "链接已复制",
          icon: "success",
        });
      },
    });
  },
  async openAttachment(e) {
    const index = Number(e.currentTarget.dataset.index);
    const attachment = (this.data.detail.attachments || [])[index];

    if (!attachment || !attachment.fileID) {
      wx.showToast({
        title: "文件信息异常",
        icon: "none",
      });
      return;
    }

    const fileType = this.resolveAttachmentFileType(attachment);

    if (!fileType) {
      wx.showToast({
        title: "暂不支持该文件类型",
        icon: "none",
      });
      return;
    }

    wx.showLoading({
      title: "文件打开中",
      mask: true,
    });

    try {
      const tempUrlRes = await new Promise((resolve, reject) => {
        wx.cloud.getTempFileURL({
          fileList: [attachment.fileID],
          success: resolve,
          fail: reject,
        });
      });
      const file = (tempUrlRes.fileList || [])[0] || {};
      const tempFileURL = file.tempFileURL;

      if (!tempFileURL) {
        wx.showToast({
          title: "文件打开失败",
          icon: "none",
        });
        return;
      }

      let downloadRes;

      try {
        downloadRes = await new Promise((resolve, reject) => {
          wx.downloadFile({
            url: tempFileURL,
            success: resolve,
            fail: reject,
          });
        });
      } catch (err) {
        wx.showToast({
          title: "网络超时，请稍后重试",
          icon: "none",
        });
        return;
      }

      if ((downloadRes.statusCode && downloadRes.statusCode !== 200) || !downloadRes.tempFilePath) {
        wx.showToast({
          title: "文件下载失败",
          icon: "none",
        });
        return;
      }

      const safeFileName = this.getSafeAttachmentFileName(attachment.name, fileType);
      const destPath = `${wx.env.USER_DATA_PATH}/${safeFileName}`;
      let openFilePath = destPath;

      try {
        await new Promise((resolve, reject) => {
          wx.getFileSystemManager().copyFile({
            srcPath: downloadRes.tempFilePath,
            destPath,
            success: resolve,
            fail: reject,
          });
        });
      } catch (err) {
        openFilePath = downloadRes.tempFilePath;
      }

      try {
        await new Promise((resolve, reject) => {
          wx.openDocument({
            filePath: openFilePath,
            fileType,
            showMenu: true,
            success: resolve,
            fail: reject,
          });
        });
      } catch (err) {
        wx.showToast({
          title: "文件打开失败",
          icon: "none",
        });
      }
    } catch (error) {
      wx.showToast({
        title: "网络超时，请稍后重试",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
    }
  },
  resolveAttachmentFileType(attachment) {
    const rawType = attachment && attachment.type
      ? attachment.type
      : this.getAttachmentType(attachment && attachment.name);
    const fileType = String(rawType || "").toLowerCase();

    return supportedAttachmentTypes.includes(fileType) ? fileType : "";
  },
  getSafeAttachmentFileName(fileName, fileType) {
    const fallbackName = `attachment-${Date.now()}.${fileType}`;
    const rawName = String(fileName || "").trim() || fallbackName;
    const safeName = rawName.replace(/[\\/:*?"<>|]/g, "_");
    const lowerSafeName = safeName.toLowerCase();

    if (lowerSafeName.endsWith(`.${fileType}`)) {
      return safeName;
    }

    return `${safeName}.${fileType}`;
  },
  getAttachmentType(name, fallbackType = "") {
    const match = String(name || "").match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    const type = match ? match[1] : fallbackType;

    return String(type || "").toLowerCase();
  },
  formatFileSize(size) {
    const fileSize = Number(size) || 0;

    if (fileSize >= 1024 * 1024) {
      return `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
    }

    return `${Math.max(1, Math.ceil(fileSize / 1024))} KB`;
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
});
