// 页面逻辑：管理 app 页面的状态、用户交互与数据请求。
// app.js
const config = require("./config.js");

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }

    wx.cloud.init({
      env: config.envId,
      traceUser: true,
    });
  },
});
