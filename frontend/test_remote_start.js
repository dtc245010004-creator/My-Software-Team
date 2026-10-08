import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ PLAYWRIGHT: NÚT BẮT ĐẦU SẠC TRÊN MÀN HÌNH TRỤ & 4 CA S-24 (SCRUM-59 / SCRUM-154) ===');

  const screenshotDir = path.resolve(process.cwd(), '../docs/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  // 1. Kiểm tra bố cục đáp ứng màn hình di động 360px theo mẫu T-48
  console.log('\n--- 1. Kiểm tra bố cục di động 360px theo mẫu T-48 ---');
  const mobileContext = await browser.newContext({
    viewport: { width: 360, height: 740 },
  });
  const mobilePage = await mobileContext.newPage();
  mobilePage.on('console', msg => console.log('MOBILE LOG:', msg.text()));
  mobilePage.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Đăng nhập tài khoản Tài xế
  console.log('Đăng nhập tài khoản Tài xế (customer_user)...');
  await mobilePage.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await mobilePage.fill('input[type="text"]', 'customer_user');
  await mobilePage.fill('input[type="password"]', 'CusPass123');
  await mobilePage.click('button[type="submit"]');
  await mobilePage.waitForTimeout(1000);
  console.log('URL sau đăng nhập:', mobilePage.url());

  // Điều hướng tới màn hình trụ sạc /chargers/1
  console.log('Điều hướng tới màn hình trụ sạc /chargers/1 trên mobile 360px...');
  await mobilePage.goto('http://localhost:5173/chargers/1', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(2000);
  console.log('URL hiện tại:', mobilePage.url());

  // Kiểm tra tiêu đề màn hình trụ
  const headerLocator = mobilePage.locator('h1');
  await headerLocator.first().waitFor({ state: 'visible', timeout: 10000 });
  const headerTitle = await headerLocator.first().innerText();
  console.log(`Tiêu đề màn hình trụ: "${headerTitle}"`);
  if (headerTitle.includes('TRỤ SẠC')) {
    console.log('=> [PASSED] Tiêu đề hiển thị chuẩn xác font-mono theo mẫu T-48.');
  } else {
    throw new Error('=> [FAILED] Tiêu đề không đúng định dạng. Nhận được: ' + headerTitle);
  }

  // Kiểm tra danh sách cổng sạc (connectors)
  const connectorCardsCount = await mobilePage.locator('[id^="connector-item-"]').count();
  console.log(`Số lượng súng sạc tìm thấy trên trụ: ${connectorCardsCount}`);
  if (connectorCardsCount > 0) {
    console.log('=> [PASSED] Danh sách đầu nối sạc hiển thị đầy đủ trên màn hình di động 360px.');
  } else {
    throw new Error('=> [FAILED] Không tìm thấy danh sách súng sạc trên trụ!');
  }

  // Kiểm tra nút bắt đầu sạc
  const mobileStartBtn = mobilePage.locator('#remote-start-submit-btn');
  await mobileStartBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('=> [PASSED] Nút bắt đầu sạc hiển thị chuẩn xác trên mobile 360px.');

  await mobilePage.screenshot({ path: path.join(screenshotDir, 'remote_start_charger_view.png') });
  console.log('Đã lưu ảnh: docs/screenshots/remote_start_charger_view.png');
  await mobileContext.close();

  // 2. Chạy trên màn hình chuẩn Desktop để kiểm thử chi tiết 4 ca S-24 và NFR
  console.log('\n--- 2. Khởi tạo phiên Desktop để kiểm thử chức năng & 4 ca S-24 ---');
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await desktopContext.newPage();
  page.on('console', msg => console.log('DESKTOP LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Đăng nhập
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'customer_user');
  await page.fill('input[type="password"]', 'CusPass123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  await page.goto('http://localhost:5173/chargers/1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Mở bảng mô phỏng 4 ca S-24 nếu chưa mở
  console.log('Mở bảng mô phỏng 4 ca S-24...');
  const openTestBtn = page.locator('button:has-text("BỘ CHỌN MÔ PHỎNG 4 CA S-24")');
  await openTestBtn.click();
  await page.waitForTimeout(500);

  // --- KIỂM THỬ CA 3 CỦA S-24: ĐẦU NỐI BẬN ---
  console.log('\n--- 3. Kiểm thử Ca 3 của S-24: Đầu nối bận (Chặn ngay tại server HTTP 409) ---');
  await page.click('input[value="BUSY"]');
  await page.waitForTimeout(300);
  await page.click('#remote-start-submit-btn');
  await page.waitForTimeout(1000);

  const busyAlert = page.locator('[role="alert"]');
  await busyAlert.waitFor({ state: 'visible', timeout: 5000 });
  const busyAlertText = await busyAlert.innerText();
  console.log('Nội dung thông báo ca bận:\n', busyAlertText);
  if (busyAlertText.includes('bận') || busyAlertText.includes('không khả dụng') || busyAlertText.includes('BẬN')) {
    console.log('=> [PASSED] Ca 3: Thông báo đầu nối bận chuẩn xác theo đặc tả S-24!');
  } else {
    throw new Error('=> [FAILED] Ca 3 không hiển thị thông báo đầu nối bận đúng. Nhận được: ' + busyAlertText);
  }
  await page.screenshot({ path: path.join(screenshotDir, 'remote_start_busy_error.png') });
  console.log('Đã lưu ảnh: docs/screenshots/remote_start_busy_error.png');

  // Đóng thông báo
  const closeAlertBtn = page.locator('[role="alert"] button');
  if (await closeAlertBtn.count() > 0) await closeAlertBtn.first().click();
  await page.waitForTimeout(500);

  // --- KIỂM THỬ CA 2 CỦA S-24: TRỤ TỪ CHỐI (REJECTED) ---
  console.log('\n--- 4. Kiểm thử Ca 2 của S-24: Trụ từ chối lệnh bắt đầu (Rejected) ---');
  await page.click('input[value="REJECTED"]');
  await page.waitForTimeout(300);
  await page.click('#remote-start-submit-btn');
  await page.waitForTimeout(1000);

  const rejectedAlert = page.locator('[role="alert"]');
  await rejectedAlert.waitFor({ state: 'visible', timeout: 5000 });
  const rejectedAlertText = await rejectedAlert.innerText();
  console.log('Nội dung thông báo ca từ chối:\n', rejectedAlertText);
  if (rejectedAlertText.includes('từ chối') && rejectedAlertText.includes('súng sạc')) {
    console.log('=> [PASSED] Ca 2: Thông báo trụ từ chối và gợi ý kiểm tra súng sạc chuẩn xác theo đặc tả S-24!');
  } else {
    throw new Error('=> [FAILED] Ca 2 không hiển thị gợi ý kiểm tra súng sạc. Nhận được: ' + rejectedAlertText);
  }
  await page.screenshot({ path: path.join(screenshotDir, 'remote_start_rejected_error.png') });
  console.log('Đã lưu ảnh: docs/screenshots/remote_start_rejected_error.png');

  if (await closeAlertBtn.count() > 0) await closeAlertBtn.first().click();
  await page.waitForTimeout(500);

  // --- KIỂM THỬ NFR & CA 4 CỦA S-24: NÚT BỊ VÔ HIỆU KHI CHỜ & HẾT THỜI GIAN CHỜ (TIMEOUT) ---
  console.log('\n--- 5. Kiểm thử NFR & Ca 4 của S-24: Nút bị vô hiệu khi gửi lệnh & Hết thời gian chờ 60s (Timeout) ---');
  await page.click('input[value="TIMEOUT"]');
  await page.waitForTimeout(300);
  await page.click('#remote-start-submit-btn');
  await page.waitForTimeout(400);

  // Kiểm tra nút bị vô hiệu hóa
  const startBtn = page.locator('#remote-start-submit-btn');
  const isDisabled = await startBtn.isDisabled();
  console.log(`Nút bắt đầu sạc bị vô hiệu hóa (disabled) khi đang chờ: ${isDisabled}`);
  if (isDisabled) {
    console.log('=> [PASSED] NFR ĐẠT: Nút bắt đầu sạc bị vô hiệu trong lúc chờ phản hồi để không gửi hai lệnh.');
  } else {
    throw new Error('=> [FAILED] NFR thất bại: Nút bắt đầu sạc không bị vô hiệu hóa!');
  }

  // Kiểm tra banner chờ phản hồi 60s và đồng hồ tiến trình
  const waitingCard = page.locator('#remote-start-waiting-card');
  const isWaitingCardVisible = await waitingCard.isVisible();
  console.log(`Khung đếm ngược và trạng thái chờ xuất hiện: ${isWaitingCardVisible}`);
  if (isWaitingCardVisible) {
    console.log('=> [PASSED] NFR ĐẠT: Màn hình hiển thị đồng hồ và tiến trình đếm ngược 60s.');
  }

  await page.screenshot({ path: path.join(screenshotDir, 'remote_start_timer_in_progress.png') });
  console.log('Đã lưu ảnh: docs/screenshots/remote_start_timer_in_progress.png');

  // Đợi cho đến khi quá trình mô phỏng timeout kết thúc và hiển thị thông báo lỗi
  console.log('Đang chờ kết quả phản hồi Timeout...');
  await page.waitForTimeout(2500);

  const timeoutAlert = page.locator('[role="alert"]');
  await timeoutAlert.waitFor({ state: 'visible', timeout: 5000 });
  const timeoutAlertText = await timeoutAlert.innerText();
  console.log('Nội dung thông báo ca hết thời gian:\n', timeoutAlertText);
  if (timeoutAlertText.includes('thời gian chờ') || timeoutAlertText.includes('TIMEOUT') || timeoutAlertText.includes('thử lại')) {
    console.log('=> [PASSED] Ca 4: Thông báo chưa bắt đầu được và cho phép thử lại chuẩn xác theo đặc tả S-24!');
  } else {
    throw new Error('=> [FAILED] Ca 4 không hiển thị thông báo hết thời gian chờ đúng. Nhận được: ' + timeoutAlertText);
  }
  await page.screenshot({ path: path.join(screenshotDir, 'remote_start_timeout_error.png') });
  console.log('Đã lưu ảnh: docs/screenshots/remote_start_timeout_error.png');

  if (await closeAlertBtn.count() > 0) await closeAlertBtn.first().click();
  await page.waitForTimeout(500);

  // --- KIỂM THỬ CA 1 CỦA S-24: THÀNH CÔNG VÀ TỰ CHUYỂN SANG MÀN HÌNH PHIÊN T-48 ---
  console.log('\n--- 6. Kiểm thử Ca 1 của S-24: Bắt đầu thành công và tự chuyển màn hình phiên T-48 ---');
  await page.click('input[value="SUCCESS"]');
  await page.waitForTimeout(300);
  await page.click('#remote-start-submit-btn');

  // Chờ phản hồi thành công và tự chuyển sang /session/:id hoặc /sessions
  console.log('Chờ tự động chuyển hướng màn hình phiên...');
  await page.waitForURL(/.*(\/session|\/sessions).*/, { timeout: 10000 });
  await page.waitForTimeout(1500);

  const currentUrl = page.url();
  console.log(`URL sau khi chuyển màn hình: ${currentUrl}`);
  if (currentUrl.includes('/session')) {
    console.log('=> [PASSED] Ca 1: Bắt đầu sạc thành công và tự động chuyển sang màn hình theo dõi phiên sạc T-48!');
  } else {
    throw new Error('=> [FAILED] Không chuyển sang màn hình phiên sạc T-48. URL hiện tại: ' + currentUrl);
  }

  await page.screenshot({ path: path.join(screenshotDir, 'remote_start_success_transition_to_t48.png') });
  console.log('Đã lưu ảnh: docs/screenshots/remote_start_success_transition_to_t48.png');

  console.log('\n=== TẤT CẢ 6/6 BÀI KIỂM THỬ PLAYWRIGHT ĐỀU ĐẠT HOÀN HẢO (100% PASSED) ===');
  await browser.close();
}

run().catch((err) => {
  console.error('\n❌ KIỂM THỬ PLAYWRIGHT THẤT BẠI:', err);
  process.exit(1);
});

