# 浏览器回归测试

单元测试检查计算和数据边界；Playwright 使用真实 Chromium 检查 DOM、IndexedDB、音频和 Service Worker。测试数据保存在独立浏览器上下文中，不使用个人浏览器资料。

```sh
npm ci
npx playwright install chromium
npm run build
npm test
npm run test:e2e
```

端到端测试会自动在 `127.0.0.1:4180` 启动构建预览服务。默认使用 Playwright 管理的 Chromium；已有兼容浏览器时，可用环境变量 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定其绝对路径。

覆盖的场景：

1. 没有词卡记录时仍显示真题报告；复盘筛选和键盘焦点定位。
2. 两个标签页并行编辑不同内容，合并保留；同字段冲突时选择本页或另一页。
3. 暂停页面计时器后切到后台，自动保存无需等待防抖计时器。
4. localStorage 读写被阻止时，仍能初始化、完成引导和打开设置。
5. 没有系统英语语音时，原创 MP3 真实播放；完整缓存后断网刷新重听。
6. 报告与复盘在手机、平板、桌面和横屏布局中的尺寸边界，星夜和晨光主题。

`test-results/` 和 `playwright-report/` 不提交仓库。失败时可查看截图、`error-context.md` 与 trace：

```sh
npx playwright show-trace test-results/<失败用例>/trace.zip
```

GitHub Pages 工作流在部署前运行这些检查。失败时停止发布，并上传浏览器测试证据，保留 7 天。

当前自动化仅使用 Chromium；这些测试不代表 Safari/Firefox 或真实手机系统的全面兼容性认证。
