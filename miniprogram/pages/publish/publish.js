const initialForm = {
  title: "",
  category: "考试安排",
  timeLabel: "考试时间",
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
  考试安排: "考试时间",
  作业信息: "截止时间",
  活动信息: "报名截止",
  班级通知: "相关时间",
  其他: "相关时间",
};

const categoryTimeConfigMap = {
  考试安排: {
    timeLabelOptions: ["考试时间"],
  },
  作业信息: {
    timeLabelOptions: ["截止时间"],
  },
  活动信息: {
    timeLabelOptions: ["报名截止", "活动时间"],
  },
  班级通知: {
    timeLabelOptions: ["相关时间", "活动时间", "截止时间"],
  },
  其他: {
    timeLabelOptions: ["相关时间", "活动时间", "截止时间"],
  },
};

const timeLabelConfigMap = {
  考试时间: {
    mainLabel: "开始日期 / 开始时间",
    endSectionLabel: "考试结束时间（选填）",
    showEndTime: true,
  },
  活动时间: {
    mainLabel: "开始日期 / 开始时间",
    endSectionLabel: "活动结束时间（选填）",
    showEndTime: true,
  },
  截止时间: {
    mainLabel: "截止日期 / 截止时间",
    endSectionLabel: "",
    showEndTime: false,
  },
  报名截止: {
    mainLabel: "报名截止日期 / 报名截止时间",
    endSectionLabel: "",
    showEndTime: false,
  },
  相关时间: {
    mainLabel: "相关日期 / 相关时间",
    endSectionLabel: "",
    showEndTime: false,
  },
};

const courseLabelMap = {
  考试安排: "科目",
  作业信息: "课程",
  活动信息: "活动名称",
  班级通知: "事项名称",
  其他: "事项名称",
};

const coursePlaceholderMap = {
  考试安排: "例如：高等数学",
  作业信息: "例如：高等数学",
  活动信息: "例如：龙舟比赛",
  班级通知: "例如：班会通知",
  其他: "请输入事项名称",
};

const locationLabelMap = {
  考试安排: "考试地点",
  作业信息: "提交方式",
  活动信息: "活动地点",
  班级通知: "地点",
  其他: "地点",
};

const locationPlaceholderMap = {
  考试安排: "例如：教学楼 A203",
  作业信息: "例如：学习通 / 纸质提交 / QQ群文件",
  活动信息: "例如：体育馆 / 操场 / 线上",
  班级通知: "例如：教学楼 A101",
  其他: "请输入地点或说明",
};

const maxImageCount = 6;
const maxAttachmentCount = 3;
const maxLinkCount = 3;
const maxAttachmentSize = 20 * 1024 * 1024;
const supportedAttachmentTypes = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const editNoticeStorageKey = "pendingEditNotice";

Page({
  data: {
    categories: ["考试安排", "作业信息", "活动信息", "班级通知", "其他"],
    timeLabelOptions: categoryTimeConfigMap["考试安排"].timeLabelOptions,
    timeConfig: {
      ...timeLabelConfigMap["考试时间"],
      showTimeLabelPicker: false,
    },
    courseLabel: courseLabelMap["考试安排"],
    coursePlaceholder: coursePlaceholderMap["考试安排"],
    locationLabel: locationLabelMap["考试安排"],
    locationPlaceholder: locationPlaceholderMap["考试安排"],
    categoryIndex: 0,
    timeLabelIndex: 0,
    authLoading: true,
    verified: false,
    canPublish: false,
    openid: "",
    isSuperAdmin: false,
    publisherName: "未知",
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
    this.checkPublishPermission();
  },
  checkPublishPermission() {
    console.log("[publish] 开始 checkAdmin 身份检查");
    this.setData({
      authLoading: true,
    });

    return wx.cloud
      .callFunction({
        name: "checkAdmin",
      })
      .then((res) => {
        console.log("[publish] checkAdmin 身份检查完成", res);
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

        return canPublish;
      })
      .catch((error) => {
        console.error("[publish] checkAdmin 身份检查失败", error);
        this.setData({
          authLoading: false,
          verified: false,
          canPublish: false,
          isSuperAdmin: false,
          openid: "",
          publisherName: "未知",
        });
        wx.showToast({
          title: "网络超时，请稍后重试",
          icon: "none",
        });

        return null;
      });
  },
  goMemberVerify() {
    wx.navigateTo({
      url: "/pages/member-verify/member-verify",
    });
  },
  initEditMode(options) {
    if (!options || !options.notice) {
      return;
    }

    try {
      const notice = JSON.parse(decodeURIComponent(options.notice));

      if (!notice._id) {
        wx.showToast({
          title: "事项数据异常",
          icon: "none",
        });
        return;
      }

      this.fillEditForm(notice);
    } catch (error) {
      console.error("解析编辑事项失败", error);
      wx.showToast({
        title: "编辑数据异常",
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
      console.error("[publish] 编辑缓存事项缺少 _id", notice);
      wx.showToast({
        title: "事项信息异常",
        icon: "none",
      });
      return;
    }

    this.fillEditForm(notice);
  },
  fillEditForm(notice) {
    const category = this.normalizeCategory(notice.category || "考试安排");
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
    const timeLabel = categoryTimeLabelMap[category] || "相关时间";
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
    return courseLabelMap[this.normalizeCategory(category)] || "事项名称";
  },
  getCoursePlaceholder(category) {
    return coursePlaceholderMap[this.normalizeCategory(category)] || "请输入事项名称";
  },
  getLocationLabel(category) {
    return locationLabelMap[this.normalizeCategory(category)] || "地点";
  },
  getLocationPlaceholder(category) {
    return locationPlaceholderMap[this.normalizeCategory(category)] || "请输入地点或说明";
  },
  normalizeCategory(category) {
    return category === "比赛活动" ? "活动信息" : category;
  },
  normalizeTimeLabel(timeLabel) {
    return timeLabel === "事项时间" ? "相关时间" : timeLabel;
  },
  getTimeLabelOptions(category) {
    const categoryConfig = categoryTimeConfigMap[this.normalizeCategory(category)] || categoryTimeConfigMap["其他"];

    return categoryConfig.timeLabelOptions;
  },
  getSafeTimeLabel(timeLabel, category) {
    const timeLabelOptions = this.getTimeLabelOptions(category);
    const normalizedTimeLabel = this.normalizeTimeLabel(timeLabel);

    if (timeLabelOptions.includes(normalizedTimeLabel)) {
      return normalizedTimeLabel;
    }

    return categoryTimeLabelMap[this.normalizeCategory(category)] || "相关时间";
  },
  getTimeConfig(timeLabel, timeLabelOptions = []) {
    const normalizedTimeLabel = this.normalizeTimeLabel(timeLabel);
    const timeLabelConfig = timeLabelConfigMap[normalizedTimeLabel] || timeLabelConfigMap["相关时间"];

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
        name: image.name || "图片",
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
        const name = attachment.name || "附件";
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

    console.log("[publish] 开始获取已有图片临时链接", {
      count: fileList.length,
    });
    wx.cloud.getTempFileURL({
      fileList,
    }).then((res) => {
      console.log("[publish] 已有图片临时链接获取完成", res);
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
    }).catch((error) => {
      console.error("[publish] 获取已有图片临时链接失败", error);
    });
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

    return fileName || `图片${index + 1}`;
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
            this.showError("文件不能超过20MB");
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

    return fileName || `附件${index + 1}`;
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
      console.log("[publish] 无新图片需要上传");
      return Promise.resolve([]);
    }

    console.log("[publish] 开始上传图片", {
      count: images.length,
    });
    wx.showLoading({
      title: "图片上传中",
      mask: true,
    });

    return Promise.all(images.map((image) => {
      const cloudPath = `notice-images/${Date.now()}-${this.getRandomString()}.${this.getImageExt(image.tempFilePath)}`;

      console.log("[publish] 开始上传单张图片", {
        cloudPath,
        name: image.name,
      });

      return wx.cloud.uploadFile({
        cloudPath,
        filePath: image.tempFilePath,
      }).then((res) => {
        console.log("[publish] 单张图片上传完成", {
          cloudPath,
          fileID: res.fileID,
        });

        return {
          fileID: res.fileID,
          name: image.name,
          uploadedAt: new Date(),
        };
      });
    })).then((uploadedImages) => {
      wx.hideLoading();
      console.log("[publish] 图片上传完成", {
        count: uploadedImages.length,
      });
      return uploadedImages;
    }).catch((error) => {
      wx.hideLoading();
      console.error("[publish] 图片上传失败", error);
      wx.showToast({
        title: "上传失败，请检查网络后重试",
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
      console.log("[publish] 无新附件需要上传");
      return Promise.resolve([]);
    }

    console.log("[publish] 开始上传附件", {
      count: attachments.length,
    });
    wx.showLoading({
      title: "附件上传中",
      mask: true,
    });

    return Promise.all(attachments.map((attachment) => {
      const cloudPath = `notice-files/${Date.now()}-${this.getRandomString()}-${this.sanitizeFileName(attachment.name)}`;

      console.log("[publish] 开始上传单个附件", {
        cloudPath,
        name: attachment.name,
        size: attachment.size,
      });

      return wx.cloud.uploadFile({
        cloudPath,
        filePath: attachment.tempFilePath,
      }).then((res) => {
        console.log("[publish] 单个附件上传完成", {
          cloudPath,
          fileID: res.fileID,
        });

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
      console.log("[publish] 附件上传完成", {
        count: uploadedAttachments.length,
      });
      return uploadedAttachments;
    }).catch((error) => {
      wx.hideLoading();
      console.error("[publish] 附件上传失败", error);
      wx.showToast({
        title: "上传失败，请检查网络后重试",
        icon: "none",
      });
      throw error;
    });
  },
  sanitizeFileName(fileName) {
    return String(fileName || "attachment").replace(/[\\/:*?"<>|\s]+/g, "_");
  },
  showError(message) {
    wx.showToast({
      title: message,
      icon: "none",
    });
  },
  handleResetForm() {
    if (this.data.isEdit) {
      return;
    }

    wx.showModal({
      title: "确认重置",
      content: "确定清空当前填写内容吗？",
      cancelText: "取消",
      confirmText: "确定",
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
      this.showError("请选择分类");
      return false;
    }

    if (!form.date) {
      this.showError("请选择日期");
      return false;
    }

    if (!this.data.timeConfig.showEndTime) {
      return this.validateContent(content);
    }

    if (!form.endDate && form.endClock) {
      this.showError("请先选择结束日期");
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
        this.showError("请填写链接地址");
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
    return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url);
  },
  buildDateTime(date, time) {
    return time ? `${date} ${time}` : date;
  },
  submitForm() {
    console.log("[publish] 开始提交前权限检查");
    this.checkPublishPermission().then((canPublish) => {
      console.log("[publish] 提交前权限检查完成", {
        canPublish,
      });
      if (canPublish === null) {
        return;
      }

      if (!canPublish) {
        wx.showToast({
          title: "暂无发布权限",
          icon: "none",
        });
        return;
      }

      if (this.data.isEdit && !this.canEditCurrentNotice()) {
        wx.showToast({
          title: "暂无操作权限",
          icon: "none",
        });
        return;
      }

      this.submitNotice();
    }).catch((error) => {
      console.error("[publish] 提交前权限检查异常", error);
      wx.showToast({
        title: "网络超时，请稍后重试",
        icon: "none",
      });
    });
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

    console.log("[publish] 当前模式:", isEdit ? "编辑" : "新增");
    console.log("[publish] 编辑事项ID:", noticeId);

    if (isEdit && !noticeId) {
      console.error("[publish] 编辑模式缺少事项ID", {
        pageOptions: this.pageOptions || {},
        isEdit: this.data.isEdit,
        editNoticeId: this.data.editNoticeId,
      });
      wx.showToast({
        title: "事项信息异常",
        icon: "none",
      });
      return;
    }

    const form = this.data.form;

    if (!this.validateForm(form)) {
      return;
    }

    const links = this.getValidatedLinks();

    if (!links) {
      return;
    }

    console.log("[publish] 当前标题:", this.data.title || (this.data.formData && this.data.formData.title) || this.data.form.title);

    const now = new Date().toISOString();
    const endTime = this.data.timeConfig.showEndTime && form.endDate ? this.buildDateTime(form.endDate, form.endClock) : "";
    let uploadedImages = [];
    let uploadedAttachments = [];

    try {
      uploadedAttachments = await this.uploadNewAttachments();
      uploadedImages = await this.uploadNewImages();
    } catch (error) {
      console.error("[publish] 上传阶段失败，停止发布", error);
      return;
    }

    const existingImages = this.data.existingImages.map((image) => ({
      fileID: image.fileID,
      name: image.name || "图片",
      uploadedAt: image.uploadedAt,
    }));
    const images = existingImages.concat(uploadedImages);
    const existingAttachments = this.data.existingAttachments.map((attachment) => ({
      fileID: attachment.fileID,
      name: attachment.name || "附件",
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

    console.log("[publish] 准备写入的数据:", writeData);
    console.log("[publish] 准备更新标题:", writeData.title);

    wx.showLoading({
      title: isEdit ? "修改中" : "发布中",
    });

    const db = wx.cloud.database();

    try {
      const dbRes = isEdit
        ? await wx.cloud.callFunction({
          name: "updateNotice",
          data: {
            noticeId,
            noticeData: writeData,
          },
        })
        : await db.collection("notices").add({
          data: writeData,
        });

      console.log("[publish] 数据库写入结果:", dbRes);

      if (isEdit) {
        const result = dbRes.result || {};

        if (!result.success) {
          console.error("[publish] updateNotice 返回失败:", dbRes);
          wx.hideLoading();
          wx.showToast({
            title: result.message || "修改失败",
            icon: "none",
          });
          return;
        }
      }

      wx.hideLoading();

      let toastTitle = isEdit ? "修改成功" : "发布成功";
      let toastIcon = "success";

      if (!isEdit) {
        try {
          console.log("[publish] 开始发送订阅消息");
          const messageRes = await this.sendNoticeMessage(dbRes._id, writeData);
          console.log("[publish] 订阅消息发送完成", messageRes);
        } catch (error) {
          console.error("[publish] 订阅消息发送失败", error);
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
      console.error("[publish] 保存失败:", error);
      wx.showToast({
        title: isEdit ? "修改失败" : "发布失败",
        icon: "none",
      });
    }
  },
  resetPublishForm() {
    this.setData({
      categoryIndex: 0,
      timeLabelIndex: 0,
      timeLabelOptions: categoryTimeConfigMap["考试安排"].timeLabelOptions,
      timeConfig: this.getTimeConfig("考试时间", categoryTimeConfigMap["考试安排"].timeLabelOptions),
      courseLabel: this.getCourseLabel("考试安排"),
      coursePlaceholder: this.getCoursePlaceholder("考试安排"),
      locationLabel: this.getLocationLabel("考试安排"),
      locationPlaceholder: this.getLocationPlaceholder("考试安排"),
      isEdit: false,
      editNoticeId: "",
      editPublisherOpenid: "",
      existingImages: [],
      newImages: [],
      existingAttachments: [],
      newAttachments: [],
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
            name: image.name || "图片",
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
            name: attachment.name || "附件",
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
  sendNoticeMessage(noticeId, notice) {
    console.log("[publish] 调用 sendNoticeMessage 云函数", {
      noticeId,
    });
    return wx.cloud.callFunction({
      name: "sendNoticeMessage",
      data: {
        noticeId,
        title: notice.title,
        deadline: notice.deadline,
        timeLabel: notice.timeLabel,
      },
    });
  },
  getPublisherName(name) {
    const publisherName = String(name || "").trim();

    return publisherName || "未知";
  },
});
