const initialForm = {
  title: "",
  category: "鑰冭瘯瀹夋帓",
  timeLabel: "鑰冭瘯鏃堕棿",
  course: "",
  date: "",
  time: "",
  endDate: "",
  endClock: "",
  location: "",
  content: "",
  links: [],
  isImportant: false,
};

const categoryTimeLabelMap = {
  "鑰冭瘯瀹夋帓": "鑰冭瘯鏃堕棿",
  "浣滀笟淇℃伅": "鎴鏃堕棿",
  "娲诲姩淇℃伅": "鎶ュ悕鎴",
  "鐝骇閫氱煡": "鐩稿叧鏃堕棿",
  "鍏朵粬": "鐩稿叧鏃堕棿",
};

const categoryTimeConfigMap = {
  "鑰冭瘯瀹夋帓": {
    timeLabelOptions: ["鑰冭瘯鏃堕棿"],
  },
  "浣滀笟淇℃伅": {
    timeLabelOptions: ["鎴鏃堕棿"],
  },
  "娲诲姩淇℃伅": {
    timeLabelOptions: ["鎶ュ悕鎴", "娲诲姩鏃堕棿"],
  },
  "鐝骇閫氱煡": {
    timeLabelOptions: ["鐩稿叧鏃堕棿", "娲诲姩鏃堕棿", "鎴鏃堕棿"],
  },
  "鍏朵粬": {
    timeLabelOptions: ["鐩稿叧鏃堕棿", "娲诲姩鏃堕棿", "鎴鏃堕棿"],
  },
};

const timeLabelConfigMap = {
  "鑰冭瘯鏃堕棿": {
    mainLabel: "开始日期 / 开始时间",
    endSectionLabel: "考试结束时间（选填）",
    showEndTime: true,
  },
  "娲诲姩鏃堕棿": {
    mainLabel: "开始日期 / 开始时间",
    endSectionLabel: "活动结束时间（选填）",
    showEndTime: true,
  },
  "鎴鏃堕棿": {
    mainLabel: "鎴鏃ユ湡 / 鎴鏃堕棿",
    endSectionLabel: "",
    showEndTime: false,
  },
  "鎶ュ悕鎴": {
    mainLabel: "鎶ュ悕鎴鏃ユ湡 / 鎶ュ悕鎴鏃堕棿",
    endSectionLabel: "",
    showEndTime: false,
  },
  "鐩稿叧鏃堕棿": {
    mainLabel: "鐩稿叧鏃ユ湡 / 鐩稿叧鏃堕棿",
    endSectionLabel: "",
    showEndTime: false,
  },
};

const allTimeLabels = Object.keys(timeLabelConfigMap);

const courseLabelMap = {
  "鑰冭瘯瀹夋帓": "绉戠洰",
  "浣滀笟淇℃伅": "璇剧▼",
  "娲诲姩淇℃伅": "娲诲姩鍚嶇О",
  "鐝骇閫氱煡": "浜嬮」鍚嶇О",
  "鍏朵粬": "浜嬮」鍚嶇О",
};

const coursePlaceholderMap = {
  "鑰冭瘯瀹夋帓": "例如：高等数学",
  "浣滀笟淇℃伅": "例如：高等数学",
  "娲诲姩淇℃伅": "例如：龙舟比赛",
  "鐝骇閫氱煡": "渚嬪锛氱彮浼氶€氱煡",
  "鍏朵粬": "请输入事项名称",
};

const locationLabelMap = {
  "鑰冭瘯瀹夋帓": "鑰冭瘯鍦扮偣",
  "浣滀笟淇℃伅": "鎻愪氦鏂瑰紡",
  "娲诲姩淇℃伅": "娲诲姩鍦扮偣",
  "鐝骇閫氱煡": "鍦扮偣",
  "鍏朵粬": "鍦扮偣",
};

const locationPlaceholderMap = {
  "鑰冭瘯瀹夋帓": "渚嬪锛氭暀瀛︽ゼ A203",
  "浣滀笟淇℃伅": "例如：学习通 / 纸质提交 / QQ群文件",
  "娲诲姩淇℃伅": "渚嬪锛氫綋鑲查 / 鎿嶅満 / 绾夸笂",
  "鐝骇閫氱煡": "渚嬪锛氭暀瀛︽ゼ A101",
  "鍏朵粬": "璇疯緭鍏ュ湴鐐规垨璇存槑",
};

const maxImageCount = 6;
const maxAttachmentCount = 3;
const maxLinkCount = 3;
const maxAttachmentSize = 20 * 1024 * 1024;
const supportedAttachmentTypes = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const editNoticeStorageKey = "pendingEditNotice";
const initialAiDraft = {
  title: "",
  category: "",
  timeLabel: "",
  course: "",
  deadline: "",
  endTime: "",
  location: "",
  content: "",
  isImportant: false,
  warnings: [],
};

Page({
  data: {
    categories: ["鑰冭瘯瀹夋帓", "浣滀笟淇℃伅", "娲诲姩淇℃伅", "鐝骇閫氱煡", "鍏朵粬"],
    timeLabelOptions: categoryTimeConfigMap["鑰冭瘯瀹夋帓"].timeLabelOptions,
    timeConfig: {
      ...timeLabelConfigMap["鑰冭瘯鏃堕棿"],
      showTimeLabelPicker: false,
    },
    courseLabel: courseLabelMap["鑰冭瘯瀹夋帓"],
    coursePlaceholder: coursePlaceholderMap["鑰冭瘯瀹夋帓"],
    locationLabel: locationLabelMap["鑰冭瘯瀹夋帓"],
    locationPlaceholder: locationPlaceholderMap["鑰冭瘯瀹夋帓"],
    categoryIndex: 0,
    timeLabelIndex: 0,
    authLoading: true,
    verified: false,
    canPublish: false,
    openid: "",
    isSuperAdmin: false,
    publisherName: "鏈煡",
    isEdit: false,
    editNoticeId: "",
    editPublisherOpenid: "",
    maxImageCount,
    maxAttachmentCount,
    maxLinkCount,
    existingImages: [],
    newImages: [],
    existingAttachments: [],
    newAttachments: [],
    submitting: false,
    aiModalVisible: false,
    aiInput: "",
    aiGenerating: false,
    aiPublishing: false,
    aiDraftReady: false,
    aiDraft: {
      ...initialAiDraft,
    },
    aiCategoryIndex: 0,
    aiTimeLabelIndex: 0,
    aiTimeLabelOptions: allTimeLabels,
    aiDeadlineDate: "",
    aiDeadlineTime: "",
    aiEndDate: "",
    aiEndTime: "",
    form: {
      ...initialForm,
    },
  },
  onLoad(options) {
    this.pageOptions = options || {};
    this.initEditMode(options);
    this.checkPublishPermission();
  },
  onShow() {
    this.consumePendingEditNotice();
    this.checkPublishPermission({ silent: this.hasCheckedPublishPermission === true });
  },
  checkPublishPermission(options = {}) {
    if (this.permissionChecking) {
      return this.permissionChecking;
    }

    if (!options.silent) {
      this.setData({
        authLoading: true,
      });
    }

    const request = wx.cloud
      .callFunction({
        name: "checkAdmin",
      })
      .then((res) => {
        const result = res.result || {};

        if (!result.success) {
          throw new Error(result.message || "checkAdmin failed");
        }

        const verified = result.verified === true;
        const canPublish = verified && result.isAdmin === true;

        this.setData({
          authLoading: false,
          verified,
          canPublish,
          isSuperAdmin: result.isSuperAdmin === true,
          openid: result.openid || "",
          publisherName: this.getPublisherName(result.name),
        });
        this.hasCheckedPublishPermission = true;

        return canPublish;
      })
      .catch(() => {
        this.setData({
          authLoading: false,
          verified: false,
          canPublish: false,
          isSuperAdmin: false,
          openid: "",
          publisherName: "鏈煡",
        });
        this.hasCheckedPublishPermission = true;
        wx.showToast({
          title: "缃戠粶瓒呮椂锛岃绋嶅悗閲嶈瘯",
          icon: "none",
        });

        return null;
      });

    this.permissionChecking = request.then((result) => {
      this.permissionChecking = null;
      return result;
    });

    return this.permissionChecking;
  },
  goMemberVerify() {
    wx.navigateTo({
      url: "/pages/member-verify/member-verify",
    });
  },
  noop() {},
  initEditMode(options) {
    if (!options || !options.notice) {
      return;
    }

    try {
      const notice = JSON.parse(decodeURIComponent(options.notice));

      if (!notice._id) {
        wx.showToast({
          title: "浜嬮」鏁版嵁寮傚父",
          icon: "none",
        });
        return;
      }

      this.fillEditForm(notice);
    } catch (error) {
      wx.showToast({
        title: "缂栬緫鏁版嵁寮傚父",
        icon: "none",
      });
    }
  },
  consumePendingEditNotice() {
    if (this.data.isEdit) {
      return;
    }

    const notice = wx.getStorageSync(editNoticeStorageKey);

    if (!notice) {
      return;
    }

    wx.removeStorageSync(editNoticeStorageKey);

    if (!notice._id) {
      wx.showToast({
        title: "浜嬮」淇℃伅寮傚父",
        icon: "none",
      });
      return;
    }

    this.fillEditForm(notice);
  },
  fillEditForm(notice) {
    const category = this.normalizeCategory(notice.category || "鑰冭瘯瀹夋帓");
    const categoryIndex = Math.max(this.data.categories.indexOf(category), 0);
    const timeLabelOptions = this.getTimeLabelOptions(category);
    const timeLabel = this.getSafeTimeLabel(notice.timeLabel, category);
    const timeLabelIndex = Math.max(timeLabelOptions.indexOf(timeLabel), 0);
    const timeConfig = this.getTimeConfig(timeLabel, timeLabelOptions);
    const startTime = this.splitDateTime(notice.deadline);
    const endTime = this.splitDateTime(notice.endTime);

    this.setData({
      isEdit: true,
      editNoticeId: notice._id,
      editPublisherOpenid: notice.publisherOpenid || "",
      categoryIndex,
      timeLabelOptions,
      timeConfig,
      courseLabel: this.getCourseLabel(category),
      coursePlaceholder: this.getCoursePlaceholder(category),
      locationLabel: this.getLocationLabel(category),
      locationPlaceholder: this.getLocationPlaceholder(category),
      timeLabelIndex,
      existingImages: this.normalizeImages(notice.images),
      newImages: [],
      existingAttachments: this.normalizeAttachments(notice.attachments),
      newAttachments: [],
      form: {
        title: notice.title || "",
        category,
        timeLabel,
        course: notice.course || "",
        date: startTime.date,
        time: startTime.time,
        endDate: timeConfig.showEndTime ? endTime.date : "",
        endClock: timeConfig.showEndTime ? endTime.time : "",
        location: notice.location || notice.place || "",
        content: notice.content || "",
        links: this.normalizeLinks(notice.links),
        isImportant: !!notice.isImportant,
      },
    });
    this.loadExistingImageTempFileURLs();
  },
  splitDateTime(value) {
    const [date = "", time = ""] = String(value || "").split(" ");

    return {
      date,
      time,
    };
  },
  changeCategory(e) {
    const categoryIndex = Number(e.detail.value);
    const category = this.data.categories[categoryIndex];
    const timeLabel = categoryTimeLabelMap[category] || "鐩稿叧鏃堕棿";
    const safeTimeLabel = this.normalizeTimeLabel(timeLabel);
    const timeLabelOptions = this.getTimeLabelOptions(category);
    const timeConfig = this.getTimeConfig(safeTimeLabel, timeLabelOptions);
    const timeLabelIndex = timeLabelOptions.indexOf(safeTimeLabel);
    const nextData = {
      categoryIndex,
      timeLabelOptions,
      timeConfig,
      courseLabel: this.getCourseLabel(category),
      coursePlaceholder: this.getCoursePlaceholder(category),
      locationLabel: this.getLocationLabel(category),
      locationPlaceholder: this.getLocationPlaceholder(category),
      timeLabelIndex: timeLabelIndex >= 0 ? timeLabelIndex : 0,
      "form.category": category,
      "form.timeLabel": safeTimeLabel,
    };

    if (!timeConfig.showEndTime) {
      nextData["form.endDate"] = "";
      nextData["form.endClock"] = "";
    }

    this.setData(nextData);
  },
  getCourseLabel(category) {
    return courseLabelMap[this.normalizeCategory(category)] || "浜嬮」鍚嶇О";
  },
  getCoursePlaceholder(category) {
    return coursePlaceholderMap[this.normalizeCategory(category)] || "请输入事项名称";
  },
  getLocationLabel(category) {
    return locationLabelMap[this.normalizeCategory(category)] || "鍦扮偣";
  },
  getLocationPlaceholder(category) {
    return locationPlaceholderMap[this.normalizeCategory(category)] || "璇疯緭鍏ュ湴鐐规垨璇存槑";
  },
  normalizeCategory(category) {
    return category === "姣旇禌娲诲姩" ? "娲诲姩淇℃伅" : category;
  },
  normalizeTimeLabel(timeLabel) {
    return timeLabel === "浜嬮」鏃堕棿" ? "鐩稿叧鏃堕棿" : timeLabel;
  },
  getTimeLabelOptions(category) {
    const categoryConfig = categoryTimeConfigMap[this.normalizeCategory(category)] || categoryTimeConfigMap["鍏朵粬"];

    return categoryConfig.timeLabelOptions;
  },
  getSafeTimeLabel(timeLabel, category) {
    const timeLabelOptions = this.getTimeLabelOptions(category);
    const normalizedTimeLabel = this.normalizeTimeLabel(timeLabel);

    if (timeLabelOptions.includes(normalizedTimeLabel)) {
      return normalizedTimeLabel;
    }

    return categoryTimeLabelMap[this.normalizeCategory(category)] || "鐩稿叧鏃堕棿";
  },
  getTimeConfig(timeLabel, timeLabelOptions = []) {
    const normalizedTimeLabel = this.normalizeTimeLabel(timeLabel);
    const timeLabelConfig = timeLabelConfigMap[normalizedTimeLabel] || timeLabelConfigMap["鐩稿叧鏃堕棿"];

    return {
      ...timeLabelConfig,
      showTimeLabelPicker: timeLabelOptions.length > 1,
    };
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
        name: image.name || "鍥剧墖",
        uploadedAt: this.normalizeUploadedAt(image.uploadedAt) || new Date(),
      }));
  },
  normalizeAttachments(attachments) {
    if (!Array.isArray(attachments)) {
      return [];
    }

    return attachments
      .filter((attachment) => attachment && attachment.fileID)
      .map((attachment) => {
        const name = attachment.name || "闄勪欢";
        const type = this.getAttachmentType(name, attachment.type);
        const size = Number(attachment.size) || 0;

        return {
          fileID: attachment.fileID,
          name,
          size,
          type,
          formattedSize: this.formatFileSize(size),
          uploadedAt: this.normalizeUploadedAt(attachment.uploadedAt) || new Date(),
        };
      });
  },
  normalizeLinks(links) {
    if (!Array.isArray(links)) {
      return [];
    }

    return links
      .filter((link) => link && (link.title || link.url))
      .slice(0, maxLinkCount)
      .map((link) => ({
        title: String(link.title || ""),
        url: String(link.url || ""),
      }));
  },
  loadExistingImageTempFileURLs() {
    const images = this.data.existingImages || [];
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
        existingImages: nextImages,
      });
    }).catch(() => {});
  },
  normalizeUploadedAt(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  },
  changeTimeLabel(e) {
    const timeLabelIndex = Number(e.detail.value);
    const timeLabel = this.data.timeLabelOptions[timeLabelIndex];
    const timeConfig = this.getTimeConfig(timeLabel, this.data.timeLabelOptions);
    const nextData = {
      timeLabelIndex,
      timeConfig,
      "form.timeLabel": timeLabel,
    };

    if (!timeConfig.showEndTime) {
      nextData["form.endDate"] = "";
      nextData["form.endClock"] = "";
    }

    this.setData(nextData);
  },
  onTitleInput(e) {
    this.setData({
      "form.title": e.detail.value,
    });
  },
  onCourseInput(e) {
    this.setData({
      "form.course": e.detail.value,
    });
  },
  onDateChange(e) {
    this.setData({
      "form.date": e.detail.value,
    });
  },
  onTimeChange(e) {
    this.setData({
      "form.time": e.detail.value,
    });
  },
  clearMainTime() {
    this.setData({
      "form.time": "",
    });
  },
  onEndDateChange(e) {
    this.setData({
      "form.endDate": e.detail.value,
    });
  },
  onEndTimeChange(e) {
    this.setData({
      "form.endClock": e.detail.value,
    });
  },
  clearEndTime() {
    this.setData({
      "form.endDate": "",
      "form.endClock": "",
    });
  },
  onLocationInput(e) {
    this.setData({
      "form.location": e.detail.value,
    });
  },
  onContentInput(e) {
    this.setData({
      "form.content": e.detail.value,
    });
  },
  addLink() {
    const links = this.data.form.links || [];

    if (links.length >= maxLinkCount) {
      this.showError(`最多添加${maxLinkCount}个链接`);
      return;
    }

    this.setData({
      "form.links": links.concat({
        title: "",
        url: "",
      }),
    });
  },
  removeLink(e) {
    const index = Number(e.currentTarget.dataset.index);
    const links = (this.data.form.links || []).filter((_, itemIndex) => itemIndex !== index);

    this.setData({
      "form.links": links,
    });
  },
  onLinkTitleInput(e) {
    const index = Number(e.currentTarget.dataset.index);

    this.setData({
      [`form.links[${index}].title`]: e.detail.value,
    });
  },
  onLinkUrlInput(e) {
    const index = Number(e.currentTarget.dataset.index);

    this.setData({
      [`form.links[${index}].url`]: e.detail.value,
    });
  },
  onImportantChange(e) {
    this.setData({
      "form.isImportant": e.detail.value,
    });
  },
  openAiModal() {
    if (this.data.isEdit) {
      return;
    }

    this.aiInputValue = "";

    this.setData({
      aiModalVisible: true,
      aiInput: "",
      aiGenerating: false,
      aiPublishing: false,
      aiDraftReady: false,
      aiDraft: {
        ...initialAiDraft,
        warnings: [],
      },
      aiCategoryIndex: 0,
      aiTimeLabelIndex: 0,
      aiTimeLabelOptions: allTimeLabels,
      aiDeadlineDate: "",
      aiDeadlineTime: "",
      aiEndDate: "",
      aiEndTime: "",
    });
  },
  closeAiModal() {
    if (this.data.aiGenerating || this.data.aiPublishing) {
      return;
    }

    this.aiInputValue = "";

    this.setData({
      aiModalVisible: false,
    });
  },
  onAiInput(e) {
    this.aiInputValue = e.detail.value;
  },
  onAiInputBlur(e) {
    this.aiInputValue = e.detail.value;
  },
  generateAiDraft() {
    if (this.data.aiGenerating || this.data.aiPublishing) {
      return;
    }

    const text = String(this.aiInputValue || this.data.aiInput || "").trim();

    if (!text) {
      this.showError("请输入要发布的内容");
      return;
    }

    if (text.length > 500) {
      this.showError("输入内容不能超过500字");
      return;
    }

    this.setData({
      aiGenerating: true,
    });

    wx.cloud.callFunction({
      name: "parseNoticeWithAI",
      data: {
        text,
      },
    }).then((res) => {
      const result = res.result || {};

      if (!result.success) {
        this.showError(result.message || "杈呭姪鐢熸垚澶辫触锛岃绋嶅悗閲嶈瘯");
        return;
      }

      this.applyAiDraft(result.draft || {});
    }).catch(() => {
      this.showError("鏈嶅姟杩炴帴澶辫触锛岃绋嶅悗閲嶈瘯");
    }).then(() => {
      this.setData({
        aiGenerating: false,
      });
    });
  },
  applyAiDraft(draft) {
    const normalizedCategory = this.normalizeCategory(draft.category);
    const hasCategory = this.data.categories.includes(normalizedCategory);
    const categoryIndex = hasCategory ? this.data.categories.indexOf(normalizedCategory) : 0;
    const safeCategory = hasCategory ? normalizedCategory : "";
    const timeLabelOptions = safeCategory ? this.getTimeLabelOptions(safeCategory) : allTimeLabels;
    const normalizedTimeLabel = this.normalizeTimeLabel(draft.timeLabel);
    const timeLabel = timeLabelOptions.includes(normalizedTimeLabel) ? normalizedTimeLabel : "";
    const timeLabelIndex = Math.max(timeLabelOptions.indexOf(timeLabel), 0);
    const deadline = this.splitDateTime(draft.deadline);
    const endTime = this.splitDateTime(draft.endTime);

    this.setData({
      aiDraftReady: true,
      aiCategoryIndex: categoryIndex,
      aiTimeLabelIndex: timeLabelIndex,
      aiTimeLabelOptions: timeLabelOptions,
      aiDeadlineDate: deadline.date,
      aiDeadlineTime: deadline.time,
      aiEndDate: endTime.date,
      aiEndTime: endTime.time,
      aiDraft: {
        title: String(draft.title || ""),
        category: safeCategory,
        timeLabel,
        course: String(draft.course || ""),
        deadline: this.buildDateTime(deadline.date, deadline.time),
        endTime: this.buildDateTime(endTime.date, endTime.time),
        location: String(draft.location || ""),
        content: String(draft.content || ""),
        isImportant: draft.isImportant === true,
        warnings: Array.isArray(draft.warnings) ? draft.warnings : [],
      },
    });
  },
  changeAiCategory(e) {
    const aiCategoryIndex = Number(e.detail.value);
    const category = this.data.categories[aiCategoryIndex] || "鑰冭瘯瀹夋帓";
    const timeLabelOptions = this.getTimeLabelOptions(category);
    const normalizedTimeLabel = this.normalizeTimeLabel(this.data.aiDraft.timeLabel);
    const timeLabel = timeLabelOptions.includes(normalizedTimeLabel)
      ? normalizedTimeLabel
      : categoryTimeLabelMap[category];
    const aiTimeLabelIndex = Math.max(timeLabelOptions.indexOf(timeLabel), 0);

    this.setData({
      aiCategoryIndex,
      aiTimeLabelOptions: timeLabelOptions,
      aiTimeLabelIndex,
      "aiDraft.category": category,
      "aiDraft.timeLabel": timeLabel,
    });
  },
  changeAiTimeLabel(e) {
    const aiTimeLabelIndex = Number(e.detail.value);
    const timeLabel = this.data.aiTimeLabelOptions[aiTimeLabelIndex] || "鐩稿叧鏃堕棿";

    this.setData({
      aiTimeLabelIndex,
      "aiDraft.timeLabel": timeLabel,
    });
  },
  onAiDraftFieldInput(e) {
    const field = e.currentTarget.dataset.field;

    if (!field) {
      return;
    }

    this.setData({
      [`aiDraft.${field}`]: e.detail.value,
    });
  },
  onAiImportantChange(e) {
    this.setData({
      "aiDraft.isImportant": e.detail.value,
    });
  },
  chooseImages() {
    const currentCount = this.data.existingImages.length + this.data.newImages.length;
    const count = maxImageCount - currentCount;

    if (count <= 0) {
      this.showError(`最多上传${maxImageCount}张图片`);
      return;
    }

    const handleFiles = (files) => {
      const selectedImages = files.slice(0, count).map((file, index) => {
        const tempFilePath = typeof file === "string" ? file : file.tempFilePath;

        return {
          tempFilePath,
          name: this.getImageName(tempFilePath, index),
        };
      }).filter((image) => image.tempFilePath);

      if (!selectedImages.length) {
        return;
      }

      this.setData({
        newImages: this.data.newImages.concat(selectedImages),
      });
    };

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
        success: (res) => {
          handleFiles(res.tempFiles || []);
        },
      });
      return;
    }

    wx.chooseImage({
      count,
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
      success: (res) => {
        handleFiles(res.tempFilePaths || []);
      },
    });
  },
  getImageName(tempFilePath, index) {
    const fileName = String(tempFilePath || "").split("/").pop();

    return fileName || `鍥剧墖${index + 1}`;
  },
  removeExistingImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const existingImages = this.data.existingImages.filter((_, itemIndex) => itemIndex !== index);

    this.setData({
      existingImages,
    });
  },
  removeNewImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const newImages = this.data.newImages.filter((_, itemIndex) => itemIndex !== index);

    this.setData({
      newImages,
    });
  },
  previewSelectedImage(e) {
    const current = e.currentTarget.dataset.url;
    const urls = this.data.existingImages
      .map((image) => image.tempFileURL || image.fileID || image.url)
      .concat(this.data.newImages.map((image) => image.tempFilePath))
      .filter(Boolean);

    if (!current || !urls.length) {
      return;
    }

    wx.previewImage({
      current,
      urls,
    });
  },
  chooseAttachments() {
    const currentCount = this.data.existingAttachments.length + this.data.newAttachments.length;
    const remainingCount = maxAttachmentCount - currentCount;

    if (remainingCount <= 0) {
      this.showError("最多上传3个附件");
      return;
    }

    wx.chooseMessageFile({
      count: remainingCount,
      type: "file",
      success: (res) => {
        const files = res.tempFiles || [];

        if (files.length > remainingCount) {
          this.showError("最多上传3个附件");
        }

        const attachments = [];

        for (let index = 0; index < files.length && attachments.length < remainingCount; index += 1) {
          const file = files[index];
          const name = file.name || this.getFileName(file.path || file.tempFilePath, index);
          const type = this.getAttachmentType(name, file.type);
          const size = Number(file.size) || 0;

          if (!supportedAttachmentTypes.includes(type)) {
            this.showError("暂不支持该文件类型");
            continue;
          }

          if (size > maxAttachmentSize) {
            this.showError("鏂囦欢涓嶈兘瓒呰繃20MB");
            continue;
          }

          attachments.push({
            tempFilePath: file.path || file.tempFilePath,
            name,
            size,
            type,
            formattedSize: this.formatFileSize(size),
          });
        }

        if (!attachments.length) {
          return;
        }

        this.setData({
          newAttachments: this.data.newAttachments.concat(attachments),
        });
      },
    });
  },
  getFileName(filePath, index) {
    const fileName = String(filePath || "").split("/").pop();

    return fileName || `闄勪欢${index + 1}`;
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
  removeExistingAttachment(e) {
    const index = Number(e.currentTarget.dataset.index);
    const existingAttachments = this.data.existingAttachments.filter((_, itemIndex) => itemIndex !== index);

    this.setData({
      existingAttachments,
    });
  },
  removeNewAttachment(e) {
    const index = Number(e.currentTarget.dataset.index);
    const newAttachments = this.data.newAttachments.filter((_, itemIndex) => itemIndex !== index);

    this.setData({
      newAttachments,
    });
  },
  uploadNewImages() {
    const images = this.data.newImages;

    if (!images.length) {
      return Promise.resolve([]);
    }

    wx.showLoading({
      title: "图片上传中",
      mask: true,
    });

    return Promise.all(images.map((image) => {
      const cloudPath = `notice-images/${Date.now()}-${this.getRandomString()}.${this.getImageExt(image.tempFilePath)}`;

      return wx.cloud.uploadFile({
        cloudPath,
        filePath: image.tempFilePath,
      }).then((res) => {
        return {
          fileID: res.fileID,
          name: image.name,
          uploadedAt: new Date(),
        };
      });
    })).then((uploadedImages) => {
      wx.hideLoading();
      return uploadedImages;
    }).catch((error) => {
      wx.hideLoading();
      wx.showToast({
        title: "涓婁紶澶辫触锛岃妫€鏌ョ綉缁滃悗閲嶈瘯",
        icon: "none",
      });
      throw error;
    });
  },
  getRandomString() {
    return Math.random().toString(36).slice(2, 10);
  },
  getImageExt(tempFilePath) {
    const match = String(tempFilePath || "").match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    const ext = match ? match[1].toLowerCase() : "jpg";

    return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext) ? ext : "jpg";
  },
  uploadNewAttachments() {
    const attachments = this.data.newAttachments;

    if (!attachments.length) {
      return Promise.resolve([]);
    }

    wx.showLoading({
      title: "附件上传中",
      mask: true,
    });

    return Promise.all(attachments.map((attachment) => {
      const cloudPath = `notice-files/${Date.now()}-${this.getRandomString()}-${this.sanitizeFileName(attachment.name)}`;

      return wx.cloud.uploadFile({
        cloudPath,
        filePath: attachment.tempFilePath,
      }).then((res) => {
        return {
          fileID: res.fileID,
          name: attachment.name,
          size: attachment.size,
          type: attachment.type,
          uploadedAt: new Date(),
        };
      });
    })).then((uploadedAttachments) => {
      wx.hideLoading();
      return uploadedAttachments;
    }).catch((error) => {
      wx.hideLoading();
      wx.showToast({
        title: "涓婁紶澶辫触锛岃妫€鏌ョ綉缁滃悗閲嶈瘯",
        icon: "none",
      });
      throw error;
    });
  },
  sanitizeFileName(fileName) {
    return String(fileName || "attachment").replace(/[\\/:*?"<>|\s]+/g, "_");
  },
  showError(message) {
    const now = Date.now();
    const text = String(message || "").trim();

    if (!text) {
      return;
    }

    if (this.lastToastMessage === text && now - this.lastToastAt < 900) {
      return;
    }

    this.lastToastMessage = text;
    this.lastToastAt = now;

    wx.showToast({
      title: text,
      icon: "none",
    });
  },
  handleResetForm() {
    if (this.data.isEdit) {
      return;
    }

    wx.showModal({
      title: "纭閲嶇疆",
      content: "纭畾娓呯┖褰撳墠濉啓鍐呭鍚楋紵",
      cancelText: "鍙栨秷",
      confirmText: "纭畾",
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        this.resetPublishForm();
      },
    });
  },
  validateForm(form) {
    const title = form.title.trim();
    const content = form.content.trim();

    if (!title) {
      this.showError("请填写标题");
      return false;
    }

    if (title.length > 30) {
      this.showError("标题不能超过30字");
      return false;
    }

    if (!form.category) {
      this.showError("璇烽€夋嫨鍒嗙被");
      return false;
    }

    if (!form.date) {
      this.showError("璇烽€夋嫨鏃ユ湡");
      return false;
    }

    if (!this.data.timeConfig.showEndTime) {
      return this.validateContent(content);
    }

    if (!form.endDate && form.endClock) {
      this.showError("璇峰厛閫夋嫨缁撴潫鏃ユ湡");
      return false;
    }

    if (form.endDate) {
      if (form.endDate < form.date) {
        this.showError("结束时间必须晚于开始时间");
        return false;
      }

      if (form.endDate === form.date && form.time && form.endClock && form.endClock <= form.time) {
        this.showError("结束时间必须晚于开始时间");
        return false;
      }
    }

    return this.validateContent(content);
  },
  validateContent(content) {
    if (!content) {
      this.showError("请填写详细内容");
      return false;
    }

    if (content.length > 500) {
      this.showError("详细内容不能超过500字");
      return false;
    }

    return true;
  },
  getValidatedLinks() {
    const links = this.data.form.links || [];
    const validLinks = [];

    for (let index = 0; index < links.length; index += 1) {
      const link = links[index] || {};
      const title = String(link.title || "").trim();
      const url = String(link.url || "").trim();

      if (!title && !url) {
        continue;
      }

      if (title && !url) {
        this.showError("璇峰～鍐欓摼鎺ュ湴鍧€");
        return null;
      }

      if (url && !this.isValidLink(url)) {
        this.showError("链接格式不正确");
        return null;
      }

      validLinks.push({
        title,
        url,
      });
    }

    return validLinks;
  },
  isValidLink(url) {
    return /^https?:\/\/[^\s]+$/i.test(String(url || "").trim());
  },
  validateNoticePayload(noticeData) {
    const images = noticeData.images;
    const attachments = noticeData.attachments;
    const links = noticeData.links;

    if (!Array.isArray(images) || images.length > maxImageCount || images.some((image) => !image || !String(image.fileID || "").trim())) {
      return "图片数据不符合要求";
    }

    if (!Array.isArray(attachments) || attachments.length > maxAttachmentCount) {
      return `附件数量不能超过${maxAttachmentCount}个`;
    }

    for (const attachment of attachments) {
      const fileID = String((attachment && attachment.fileID) || "").trim();
      const name = String((attachment && attachment.name) || "").trim();
      const size = Number(attachment && attachment.size);
      const type = String((attachment && attachment.type) || "").trim().toLowerCase();

      if (!fileID || !name || !Number.isFinite(size) || size < 0 || size > maxAttachmentSize || !supportedAttachmentTypes.includes(type)) {
        return "附件数据不符合要求";
      }
    }

    if (!Array.isArray(links) || links.length > maxLinkCount || links.some((link) => !link || !this.isValidLink(link.url))) {
      return "链接数据不符合要求";
    }

    return "";
  },
  buildDateTime(date, time) {
    return time ? `${date} ${time}` : date;
  },
  submitForm() {
    if (this.data.submitting) {
      return;
    }

    if (!this.data.canPublish) {
      wx.showToast({
        title: "鏆傛棤鍙戝竷鏉冮檺",
        icon: "none",
      });
      return;
    }

    if (this.data.isEdit && !this.canEditCurrentNotice()) {
      wx.showToast({
        title: "鏆傛棤鎿嶄綔鏉冮檺",
        icon: "none",
      });
      return;
    }

    this.submitNotice();
  },
  canEditCurrentNotice() {
    if (this.data.isSuperAdmin) {
      return true;
    }

    return !!this.data.openid && !!this.data.editPublisherOpenid && this.data.editPublisherOpenid === this.data.openid;
  },
  async submitNotice() {
    const isEdit = this.data.isEdit === true;
    const noticeId = String(this.data.editNoticeId || "").trim();

    if (isEdit && !noticeId) {
      wx.showToast({
        title: "浜嬮」淇℃伅寮傚父",
        icon: "none",
      });
      return;
    }

    const form = this.data.form;

    if (!isEdit && this.isEmptyPublishContent(form)) {
      this.showError("请输入要发布的内容");
      return;
    }

    if (!this.validateForm(form)) {
      return;
    }

    const links = this.getValidatedLinks();

    if (!links) {
      return;
    }

    const now = new Date().toISOString();
    const endTime = this.data.timeConfig.showEndTime && form.endDate ? this.buildDateTime(form.endDate, form.endClock) : "";
    let uploadedImages = [];
    let uploadedAttachments = [];

    this.setData({
      submitting: true,
    });

    try {
      uploadedAttachments = await this.uploadNewAttachments();
      uploadedImages = await this.uploadNewImages();
    } catch (error) {
      this.setData({
        submitting: false,
      });
      return;
    }

    const existingImages = this.data.existingImages.map((image) => ({
      fileID: image.fileID,
      name: image.name || "鍥剧墖",
      uploadedAt: image.uploadedAt,
    }));
    const images = existingImages.concat(uploadedImages);
    const existingAttachments = this.data.existingAttachments.map((attachment) => ({
      fileID: attachment.fileID,
      name: attachment.name || "闄勪欢",
      size: Number(attachment.size) || 0,
      type: String(attachment.type || this.getAttachmentType(attachment.name)).toLowerCase(),
      uploadedAt: attachment.uploadedAt,
    }));
    const attachments = existingAttachments.concat(uploadedAttachments);
    const noticeData = {
      title: form.title.trim(),
      category: this.normalizeCategory(form.category),
      timeLabel: form.timeLabel,
      course: form.course.trim(),
      deadline: this.buildDateTime(form.date, form.time),
      endTime,
      location: form.location.trim(),
      content: form.content.trim(),
      images,
      attachments,
      links,
      isImportant: form.isImportant,
      updatedAt: now,
    };

    if (!isEdit) {
      noticeData.status = "published";
      noticeData.createdAt = now;
      noticeData.publisherOpenid = this.data.openid;
      noticeData.publisherName = this.getPublisherName(this.data.publisherName);
    }

    const writeData = isEdit ? this.sanitizeNoticeData(noticeData) : noticeData;

    try {
      await this.publishNoticeData(writeData, { isEdit, noticeId });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: isEdit ? "淇敼澶辫触" : "鍙戝竷澶辫触",
        icon: "none",
      });
    } finally {
      if (this.data.submitting) {
        this.setData({
          submitting: false,
        });
      }
    }
  },
  validateAiDraft(draft) {
    const title = String(draft.title || "").trim();
    const content = String(draft.content || "").trim();
    const category = this.normalizeCategory(draft.category);
    const timeLabel = this.normalizeTimeLabel(draft.timeLabel);

    if (!title) return "请填写标题";
    if (title.length > 30) return "标题不能超过30字";
    if (!this.data.categories.includes(category)) return "璇烽€夋嫨鍒嗙被";
    if (!allTimeLabels.includes(timeLabel)) return "璇烽€夋嫨鏃堕棿绫诲瀷";
    if (!this.data.aiDeadlineDate) return "璇烽€夋嫨鏃ユ湡";
    if (this.data.aiEndTime && !this.data.aiEndDate) return "璇峰厛閫夋嫨缁撴潫鏃ユ湡";
    if (this.data.aiEndDate && this.data.aiEndDate < this.data.aiDeadlineDate) return "结束时间必须晚于开始时间";
    if (this.data.aiEndDate === this.data.aiDeadlineDate && this.data.aiDeadlineTime && this.data.aiEndTime && this.data.aiEndTime <= this.data.aiDeadlineTime) {
      return "结束时间必须晚于开始时间";
    }
    if (!content) return "请填写详细内容";
    if (content.length > 500) return "详细内容不能超过500字";

    return "";
  },
  isEmptyPublishContent(form) {
    const fields = [
      form.title,
      form.course,
      form.date,
      form.time,
      form.endDate,
      form.endClock,
      form.location,
      form.content,
    ];
    const hasText = fields.some((value) => String(value || "").trim());
    const hasLinks = Array.isArray(form.links) && form.links.some((link) => link && (String(link.title || "").trim() || String(link.url || "").trim()));

    return !hasText
      && !hasLinks
      && !this.data.existingImages.length
      && !this.data.newImages.length
      && !this.data.existingAttachments.length
      && !this.data.newAttachments.length;
  },
  isValidNoticeDateTime(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?: ([01]\d|2[0-3]):([0-5]\d))?$/);

    if (!match) {
      return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  },
  async submitAiDraft() {
    if (this.data.aiPublishing) {
      return;
    }

    if (!this.data.canPublish) {
      this.showError("鏆傛棤鍙戝竷鏉冮檺");
      return;
    }

    const draft = this.data.aiDraft || {};
    const validationError = this.validateAiDraft(draft);

    if (validationError) {
      this.showError(validationError);
      return;
    }

    const noticeData = {
      title: String(draft.title || "").trim(),
      category: this.normalizeCategory(draft.category),
      timeLabel: this.normalizeTimeLabel(draft.timeLabel),
      course: String(draft.course || "").trim(),
      deadline: this.buildDateTime(this.data.aiDeadlineDate, this.data.aiDeadlineTime),
      endTime: this.data.aiEndDate ? this.buildDateTime(this.data.aiEndDate, this.data.aiEndTime) : "",
      location: String(draft.location || "").trim(),
      content: String(draft.content || "").trim(),
      images: [],
      attachments: [],
      links: [],
      isImportant: draft.isImportant === true,
    };

    this.setData({
      aiPublishing: true,
    });

    try {
      await this.publishNoticeData(noticeData, { isEdit: false });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: "鍙戝竷澶辫触",
        icon: "none",
      });
    } finally {
      this.setData({
        aiPublishing: false,
      });
    }
  },
  async publishNoticeData(writeData, options = {}) {
    const isEdit = options.isEdit === true;
    const noticeId = String(options.noticeId || "").trim();
    const payloadValidationError = this.validateNoticePayload(writeData);

    if (payloadValidationError) {
      this.setData({
        submitting: false,
      });
      this.showError(payloadValidationError);
      return;
    }

    this.setData({
      submitting: true,
    });

    wx.showLoading({
      title: isEdit ? "修改中" : "发布中",
      mask: true,
    });

    try {
      const dbRes = isEdit
        ? await wx.cloud.callFunction({
          name: "updateNotice",
          data: {
            noticeId,
            noticeData: writeData,
          },
        })
        : await wx.cloud.callFunction({
          name: "createNotice",
          data: {
            noticeData: writeData,
          },
        });

      const result = dbRes.result || {};

      if (!result.success) {
        wx.hideLoading();
        this.setData({
          submitting: false,
        });
        wx.showToast({
          title: result.message || (isEdit ? "淇敼澶辫触" : "鍙戝竷澶辫触"),
          icon: "none",
        });
        return;
      }

      wx.hideLoading();
      this.setData({
        submitting: false,
      });

      let toastTitle = isEdit ? "淇敼鎴愬姛" : "鍙戝竷鎴愬姛";
      let toastIcon = "success";

      if (!isEdit) {
        try {
          await this.sendNoticeMessage(result.noticeId);
        } catch (error) {
          toastTitle = "发布成功，提醒发送失败";
          toastIcon = "none";
        }
      }

      wx.showToast({
        title: isEdit ? ((dbRes.result && dbRes.result.message) || toastTitle) : toastTitle,
        icon: toastIcon,
      });

      this.resetPublishForm();

      setTimeout(() => {
        wx.switchTab({
          url: "/pages/index/index",
        });
      }, 800);
    } catch (error) {
      wx.hideLoading();
      this.setData({
        submitting: false,
      });
      wx.showToast({
        title: isEdit ? "淇敼澶辫触" : "鍙戝竷澶辫触",
        icon: "none",
      });
    }
  },
  resetPublishForm() {
    this.setData({
      categoryIndex: 0,
      timeLabelIndex: 0,
      timeLabelOptions: categoryTimeConfigMap["鑰冭瘯瀹夋帓"].timeLabelOptions,
      timeConfig: this.getTimeConfig("鑰冭瘯鏃堕棿", categoryTimeConfigMap["鑰冭瘯瀹夋帓"].timeLabelOptions),
      courseLabel: this.getCourseLabel("鑰冭瘯瀹夋帓"),
      coursePlaceholder: this.getCoursePlaceholder("鑰冭瘯瀹夋帓"),
      locationLabel: this.getLocationLabel("鑰冭瘯瀹夋帓"),
      locationPlaceholder: this.getLocationPlaceholder("鑰冭瘯瀹夋帓"),
      isEdit: false,
      editNoticeId: "",
      editPublisherOpenid: "",
      existingImages: [],
      newImages: [],
      existingAttachments: [],
      newAttachments: [],
      submitting: false,
      aiModalVisible: false,
      aiPublishing: false,
      aiDraftReady: false,
      aiDeadlineDate: "",
      aiDeadlineTime: "",
      aiEndDate: "",
      aiEndTime: "",
      form: {
        ...initialForm,
      },
    });
  },
  sanitizeNoticeData(noticeData) {
    const forbiddenKeys = ["_id", "publisherOpenid", "publisherName", "createdAt"];
    const tempKeys = ["tempFileURL", "tempFilePath", "localPath"];
    const stripValue = (value) => {
      if (value === undefined) {
        return undefined;
      }

      if (Array.isArray(value)) {
        return value
          .map((item) => stripValue(item))
          .filter((item) => item !== undefined);
      }

      if (value && typeof value === "object" && !(value instanceof Date)) {
        const next = {};

        Object.keys(value).forEach((key) => {
          if (forbiddenKeys.includes(key) || tempKeys.includes(key)) {
            return;
          }

          const nextValue = stripValue(value[key]);

          if (nextValue !== undefined) {
            next[key] = nextValue;
          }
        });

        return next;
      }

      return value;
    };
    const data = stripValue(noticeData) || {};

    data.images = Array.isArray(data.images)
      ? data.images
        .filter((image) => image && image.fileID)
        .map((image) => {
          const nextImage = {
            fileID: image.fileID,
            name: image.name || "鍥剧墖",
          };

          if (image.uploadedAt !== undefined) {
            nextImage.uploadedAt = image.uploadedAt;
          }

          return nextImage;
        })
      : [];

    data.attachments = Array.isArray(data.attachments)
      ? data.attachments
        .filter((attachment) => attachment && attachment.fileID)
        .map((attachment) => {
          const nextAttachment = {
            fileID: attachment.fileID,
            name: attachment.name || "闄勪欢",
            size: Number(attachment.size) || 0,
            type: String(attachment.type || "").toLowerCase(),
          };

          if (attachment.uploadedAt !== undefined) {
            nextAttachment.uploadedAt = attachment.uploadedAt;
          }

          return nextAttachment;
        })
      : [];

    return data;
  },
  sendNoticeMessage(noticeId) {
    return wx.cloud.callFunction({
      name: "sendNoticeMessage",
      data: {
        noticeId,
      },
    });
  },
  getPublisherName(name) {
    const publisherName = String(name || "").trim();

    return publisherName || "鏈煡";
  },
});
