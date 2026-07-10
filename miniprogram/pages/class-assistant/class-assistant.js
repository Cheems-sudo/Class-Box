const maxQuestionLength = 300;
const fallbackTypingInterval = 40;
const typingCharsPerTick = 4;
const scrollThrottleMs = 80;

Page({
  data: {
    authLoading: true,
    verified: false,
    question: "",
    hasQuestion: false,
    messages: [],
    sending: false,
    scrollIntoView: "message-bottom",
    maxQuestionLength,
    inputBarBottom: 0,
    scrollBottomPadding: 132,
  },
  pageAlive: false,
  activeRequestId: "",
  pendingAssistantId: "",
  typingTimer: null,
  scrollTimer: null,
  authCheckId: "",
  onLoad() {
    this.pageAlive = true;
  },
  onShow() {
    if (!this.data.sending) {
      this.checkMemberVerification();
    }
  },
  onUnload() {
    this.pageAlive = false;
    this.clearTypingTimer();
    this.clearScrollTimer();

    if (this.activeRequestId) {
      this.cancelCloudRequest(this.activeRequestId, this.pendingAssistantId, false);
    }
  },
  checkMemberVerification() {
    const checkId = this.createRequestId("auth");
    this.authCheckId = checkId;
    this.setData({
      authLoading: true,
    });

    wx.cloud.callFunction({
      name: "checkAdmin",
    }).then((res) => {
      if (!this.pageAlive || this.authCheckId !== checkId) {
        return;
      }

      const result = res.result || {};

      if (!result.success) {
        throw new Error(result.message || "checkAdmin failed");
      }

      this.setData({
        authLoading: false,
        verified: result.verified === true,
      });
    }).catch((error) => {
      if (!this.pageAlive || this.authCheckId !== checkId) {
        return;
      }

      console.error("class assistant auth check failed", {
        errMsg: String(error && error.errMsg || ""),
      });
      this.setData({
        authLoading: false,
        verified: false,
      });
      wx.showToast({
        title: "网络超时，请稍后重试",
        icon: "none",
      });
    });
  },
  onQuestionInput(e) {
    const question = e.detail.value;

    this.setData({
      question,
      hasQuestion: String(question || "").trim().length > 0,
    });
  },
  onKeyboardHeightChange(e) {
    const height = Number(e.detail && e.detail.height) || 0;
    const inputBarBottom = height > 0 ? height : 0;

    this.setData({
      inputBarBottom,
      scrollBottomPadding: height > 0 ? height + 132 : 132,
    }, () => {
      this.scrollToBottom();
    });
  },
  onQuestionBlur() {
    this.setData({
      inputBarBottom: 0,
      scrollBottomPadding: 132,
    });
  },
  handleActionTap() {
    if (this.data.sending) {
      this.stopAnswer();
      return;
    }

    this.sendQuestion();
  },
  toggleCitation(e) {
    const messageId = String(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id || "");

    if (!messageId) {
      return;
    }

    this.setData({
      messages: this.data.messages.map((item) => item.id === messageId
        ? { ...item, citationExpanded: !item.citationExpanded }
        : item),
    });
  },
  sendQuestion() {
    if (this.data.sending) {
      return;
    }

    if (!this.data.verified) {
      wx.showToast({
        title: "请先完成身份认证",
        icon: "none",
      });
      return;
    }

    const question = String(this.data.question || "").trim();

    if (!question) {
      return;
    }

    if (question.length > maxQuestionLength) {
      wx.showToast({
        title: `问题不能超过${maxQuestionLength}字`,
        icon: "none",
      });
      return;
    }

    const userMessage = this.createMessage("user", question);
    const assistantMessage = this.createMessage("assistant", "", {
      loading: true,
    });
    const requestId = this.createRequestId("ask");

    this.activeRequestId = requestId;
    this.pendingAssistantId = assistantMessage.id;
    this.clearTypingTimer();
    this.setData({
      messages: this.data.messages.concat(userMessage, assistantMessage),
      question: "",
      hasQuestion: false,
      sending: true,
    }, () => {
      this.scrollToBottom();
    });

    this.requestCloudFunction(question, assistantMessage.id, requestId);
  },
  requestCloudFunction(question, messageId, requestId) {
    wx.cloud.callFunction({
      name: "askClassAssistant",
      data: {
        question,
        requestId,
      },
    }).then((res) => {
      if (!this.pageAlive || this.activeRequestId !== requestId) {
        return;
      }

      const result = res.result || {};

      if (!result.success) {
        this.handleRequestFail(requestId, messageId, result.message || "回答失败，请稍后再试", result);
        return;
      }

      this.typeAnswer(requestId, messageId, this.normalizeAnswer(result.answer || ""));
    }).catch((error) => {
      console.error("class assistant cloud call failed", {
        requestId,
        errMsg: String(error && error.errMsg || ""),
      });

      if (this.pageAlive && this.activeRequestId === requestId) {
        this.handleRequestFail(requestId, messageId, "回答失败，请稍后再试");
      }
    });
  },
  typeAnswer(requestId, messageId, answer) {
    const text = answer.content + (answer.citation ? `\n${answer.citation}` : "");
    let index = 0;

    const tick = () => {
      if (!this.pageAlive || this.activeRequestId !== requestId) {
        return;
      }

      index += typingCharsPerTick;
      this.setAssistantMessage(messageId, this.splitAnswerText(text.slice(0, index)));

      if (index < text.length) {
        this.typingTimer = setTimeout(tick, fallbackTypingInterval);
        return;
      }

      this.typingTimer = null;
      this.finishAnswer(requestId);
    };

    tick();
  },
  stopAnswer() {
    const requestId = this.activeRequestId;
    const messageId = this.pendingAssistantId;

    if (!requestId) {
      return;
    }

    this.clearTypingTimer();
    this.markPendingStopped(messageId, "正在停止回答...");
    this.finishAnswer(requestId);
    this.cancelCloudRequest(requestId, messageId, true);
  },
  cancelCloudRequest(requestId, messageId, updateMessage) {
    wx.cloud.callFunction({
      name: "askClassAssistant",
      data: {
        action: "cancel",
        requestId,
      },
    }).then((res) => {
      const result = res.result || {};

      if (!result.success) {
        throw new Error(result.errorType || "cancel failed");
      }

      if (updateMessage && this.pageAlive) {
        this.markPendingStopped(messageId, "已停止回答");
      }
    }).catch((error) => {
      console.error("class assistant cancel failed", {
        requestId,
        errMsg: String(error && (error.errMsg || error.message) || ""),
      });

      if (updateMessage && this.pageAlive) {
        this.markPendingStopped(messageId, "停止失败，后台请求可能仍在执行");
      }
    });
  },
  setAssistantMessage(messageId, answer) {
    if (!this.pageAlive) {
      return;
    }

    const messages = this.data.messages.map((item) => {
      if (item.id !== messageId) {
        return item;
      }

      return {
        ...item,
        content: answer.content,
        citation: answer.citation,
        loading: false,
      };
    });

    this.setData({
      messages,
    }, () => {
      this.scrollToBottom();
    });
  },
  handleRequestFail(requestId, messageId, message, result = {}) {
    console.error("class assistant request rejected", {
      requestId,
      errorType: String(result.errorType || ""),
      traceId: String(result.traceId || ""),
    });
    this.setAssistantMessage(messageId, {
      content: message,
      citation: "",
    });
    this.finishAnswer(requestId);
  },
  markPendingStopped(messageId, text) {
    if (!messageId) {
      return;
    }

    const messages = this.data.messages.map((item) => {
      if (item.id !== messageId) {
        return item;
      }

      return {
        ...item,
        content: item.content,
        stopStatus: text,
        loading: false,
      };
    });

    this.setData({
      messages,
    });
  },
  finishAnswer(requestId) {
    if (this.activeRequestId !== requestId) {
      return;
    }

    this.setData({
      sending: false,
    });
    this.activeRequestId = "";
    this.pendingAssistantId = "";
  },
  clearTypingTimer() {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
  },
  clearScrollTimer() {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
  },
  createRequestId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  },
  createMessage(role, content, extra = {}) {
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      role,
      content,
      citation: "",
      citationExpanded: false,
      loading: false,
      ...extra,
    };
  },
  normalizeAnswer(answer) {
    const text = String(answer || "").trim();
    return this.splitAnswerText(text || "学生手册中未找到明确规定。");
  },
  splitAnswerText(text) {
    const value = String(text || "").trim();
    const index = value.indexOf("依据：");

    if (index < 0) {
      return {
        content: value,
        citation: "",
      };
    }

    return {
      content: value.slice(0, index).trim(),
      citation: value.slice(index).trim(),
    };
  },
  scrollToBottom() {
    if (this.scrollTimer || !this.pageAlive) {
      return;
    }

    this.scrollTimer = setTimeout(() => {
      this.scrollTimer = null;

      if (this.pageAlive) {
        this.setData({
          scrollIntoView: "message-bottom",
        });
      }
    }, scrollThrottleMs);
  },
  goMemberVerify() {
    wx.navigateTo({
      url: "/pages/member-verify/member-verify",
    });
  },
});
