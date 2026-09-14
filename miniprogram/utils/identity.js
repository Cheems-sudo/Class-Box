const assistantPageUrl = "/pages/class-assistant/class-assistant";

const redirectGuestToAssistant = (identity, page, beforeRoute) => {
  if (!identity || identity.isGuest !== true) return false;
  if (page && page.guestRedirecting) return true;

  if (page) page.guestRedirecting = true;
  if (typeof beforeRoute === "function") beforeRoute();

  wx.reLaunch({
    url: assistantPageUrl,
    fail: () => {
      if (page) page.guestRedirecting = false;
      wx.showToast({ title: "页面打开失败，请重试", icon: "none" });
    },
  });
  return true;
};

module.exports = { assistantPageUrl, redirectGuestToAssistant };
