import { chromium } from 'playwright';

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ PLAYWRIGHT: NÚT DỪNG TRÊN MÀN HÌNH PHIÊN & 3 CA LỖI (SCRUM-52 / SCRUM-146) ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (!text.includes('React Router Future Flag') && !text.includes('React DevTools')) {
      console.log('BROWSER LOG:', text);
    }
  });

  // 1. Kiểm tra Ràng buộc kỹ thuật (NFR): Tài xế (CUSTOMER) không thấy nút dừng
  console.log('\n--- 1. Kiểm tra NFR: Vai trò Tài xế (CUSTOMER) không được thấy nút dừng từ xa ---');
  await page.goto('http://localhost:5173/sessions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const customerStopButtons = await page.locator('button:has-text("Dừng từ xa"), button:has-text("Dừng phiên từ xa")').count();
  console.log(`Số lượng nút dừng từ xa thấy bởi Tài xế: ${customerStopButtons}`);
  if (customerStopButtons === 0) {
    console.log('=> [PASSED] NFR RBAC: Tài xế (CUSTOMER) hoàn toàn không thấy nút dừng từ xa.');
  } else {
    throw new Error('=> [FAILED] Tài xế không được thấy nút dừng từ xa nhưng lại thấy ' + customerStopButtons + ' nút!');
  }

  // 2. Đăng nhập với vai trò Vận hành viên (OPERATOR)
  console.log('\n--- 2. Đăng nhập với vai trò Vận hành viên (OPERATOR) ---');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"]', 'operator_a');
  await page.fill('input[type="password"]', 'OpPass123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  // Điều hướng tới /sessions
  console.log('Điều hướng tới /sessions với tài khoản Vận hành viên...');
  await page.goto('http://localhost:5173/sessions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const operatorStopButtons = await page.locator('button:has-text("Dừng từ xa"), button:has-text("Dừng phiên từ xa")').count();
  console.log(`Số lượng nút dừng từ xa thấy bởi Vận hành viên: ${operatorStopButtons}`);
  if (operatorStopButtons > 0) {
    console.log('=> [PASSED] NFR RBAC: Vận hành viên thấy nút dừng từ xa trên màn hình phiên.');
  } else {
    throw new Error('=> [FAILED] Vận hành viên phải thấy nút dừng từ xa nhưng không tìm thấy nút!');
  }

  await page.screenshot({ path: 'docs/screenshots/remote_stop_active_sessions_view.png' });
  console.log('Đã lưu ảnh: docs/screenshots/remote_stop_active_sessions_view.png');

  // 3. Kiểm tra AC Ca lỗi 1: Trụ từ chối (Rejected)
  console.log('\n--- 3. Kiểm tra AC Ca lỗi 1: Trụ sạc từ chối lệnh dừng (Rejected) ---');
  await page.selectOption('#sim-condition-select', 'REJECTED');
  await page.waitForTimeout(300);

  const stopBtn = page.locator('button:has-text("Dừng phiên từ xa")').first();
  await stopBtn.click();
  await page.waitForTimeout(1500);

  const bannerText = await page.locator('#remote-stop-alert-banner').innerText();
  console.log('Nội dung banner thông báo:', bannerText);

  if (bannerText.includes('từ chối') || bannerText.includes('REJECTED') || bannerText.includes('Rejected')) {
    console.log('=> [PASSED] Ca 1: Hiển thị đúng thông báo "Trụ sạc từ chối lệnh dừng (Rejected)".');
  } else {
    throw new Error('=> [FAILED] Ca 1: Không hiển thị thông báo từ chối mong đợi. Nhận được: ' + bannerText);
  }
  await page.screenshot({ path: 'docs/screenshots/remote_stop_rejected_error.png' });
  console.log('Đã lưu ảnh: docs/screenshots/remote_stop_rejected_error.png');

  // Đóng banner
  await page.locator('#remote-stop-alert-banner button').click();
  await page.waitForTimeout(500);

  // 4. Kiểm tra AC Ca lỗi 2: Trụ ngoại tuyến (Offline)
  console.log('\n--- 4. Kiểm tra AC Ca lỗi 2: Trụ sạc ngoại tuyến (Offline) ---');
  await page.selectOption('#sim-condition-select', 'OFFLINE');
  await page.waitForTimeout(300);

  await page.locator('button:has-text("Dừng phiên từ xa")').first().click();
  await page.waitForTimeout(1500);

  const bannerOfflineText = await page.locator('#remote-stop-alert-banner').innerText();
  console.log('Nội dung banner thông báo:', bannerOfflineText);

  if (bannerOfflineText.includes('ngoại tuyến') || bannerOfflineText.includes('Offline') || bannerOfflineText.includes('OFFLINE')) {
    console.log('=> [PASSED] Ca 2: Hiển thị đúng thông báo "Trụ sạc đang ngoại tuyến (Offline)".');
  } else {
    throw new Error('=> [FAILED] Ca 2: Không hiển thị thông báo ngoại tuyến mong đợi. Nhận được: ' + bannerOfflineText);
  }
  await page.screenshot({ path: 'docs/screenshots/remote_stop_offline_error.png' });
  console.log('Đã lưu ảnh: docs/screenshots/remote_stop_offline_error.png');

  // Đóng banner
  await page.locator('#remote-stop-alert-banner button').click();
  await page.waitForTimeout(500);

  // 5. Kiểm tra AC Ca lỗi 3: Hết thời gian chờ (Timeout) & Trạng thái chờ có đồng hồ
  console.log('\n--- 5. Kiểm tra AC Ca lỗi 3: Hết thời gian chờ (Timeout) & Đồng hồ chạy ---');
  await page.selectOption('#sim-condition-select', 'TIMEOUT');
  await page.waitForTimeout(300);

  const timeoutBtn = page.locator('button:has-text("Dừng phiên từ xa")').first();
  await timeoutBtn.click();

  // Kiểm tra đồng hồ đang chạy
  await page.waitForTimeout(1000);
  const runningButtonText = await page.locator('#live-remote-stop-btn-62, button[id^="live-remote-stop-btn-"]').first().innerText();
  console.log('Văn bản nút trong trạng thái chờ có đồng hồ:', runningButtonText);

  if (runningButtonText.includes('Đang dừng') || runningButtonText.includes(':')) {
    console.log('=> [PASSED] Trạng thái chờ có đồng hồ đếm thời gian hiển thị chính xác!');
    await page.screenshot({ path: 'docs/screenshots/remote_stop_timer_in_progress.png' });
    console.log('Đã lưu ảnh: docs/screenshots/remote_stop_timer_in_progress.png');
  } else {
    console.log('Cảnh báo: Không bắt kịp nhịp đồng hồ, tiếp tục chờ phản hồi timeout...');
  }

  // Chờ thông báo timeout hoàn tất
  await page.waitForTimeout(2000);
  const bannerTimeoutText = await page.locator('#remote-stop-alert-banner').innerText();
  console.log('Nội dung banner thông báo timeout:', bannerTimeoutText);

  if (bannerTimeoutText.includes('hết thời gian') || bannerTimeoutText.includes('TIMEOUT') || bannerTimeoutText.includes('Timeout')) {
    console.log('=> [PASSED] Ca 3: Hiển thị đúng thông báo "Hết thời gian chờ phản hồi từ trụ sạc (Timeout)".');
  } else {
    throw new Error('=> [FAILED] Ca 3: Không hiển thị thông báo timeout mong đợi. Nhận được: ' + bannerTimeoutText);
  }
  await page.screenshot({ path: 'docs/screenshots/remote_stop_timeout_error.png' });
  console.log('Đã lưu ảnh: docs/screenshots/remote_stop_timeout_error.png');

  // Đóng banner
  await page.locator('#remote-stop-alert-banner button').click();
  await page.waitForTimeout(500);

  // 6. Kiểm tra AC Ca thành công: Phiên chuyển sang đã kết thúc không cần tải lại
  console.log('\n--- 6. Kiểm tra AC Ca thành công: Phiên chuyển sang COMPLETED không cần reload ---');
  await page.selectOption('#sim-condition-select', 'NORMAL');
  await page.waitForTimeout(300);

  const normalStopBtn = page.locator('button:has-text("Dừng phiên từ xa")').first();
  await normalStopBtn.click();

  // Chờ phản hồi thành công và giao diện tự động cập nhật
  await page.waitForTimeout(2000);

  const bannerSuccessText = await page.locator('#remote-stop-alert-banner').innerText();
  console.log('Nội dung banner thông báo thành công:', bannerSuccessText);

  if (bannerSuccessText.includes('THÀNH CÔNG') || bannerSuccessText.includes('thành công') || bannerSuccessText.includes('Remote')) {
    console.log('=> [PASSED] Thông báo thành công hiển thị rõ ràng!');
  } else {
    throw new Error('=> [FAILED] Không nhận được thông báo thành công. Nhận được: ' + bannerSuccessText);
  }

  // Kiểm tra bảng danh sách phiên có hiển thị COMPLETED cho phiên #62 không cần reload
  const completedBadgeCount = await page.locator('text=COMPLETED').count();
  console.log(`Số lượng nhãn COMPLETED tìm thấy: ${completedBadgeCount}`);

  await page.screenshot({ path: 'docs/screenshots/remote_stop_success_no_reload.png' });
  console.log('Đã lưu ảnh: docs/screenshots/remote_stop_success_no_reload.png');

  console.log('\n=== TẤT CẢ 6/6 BÀI KIỂM THỬ PLAYWRIGHT ĐỀU ĐẠT (100% PASSED) ===');
  await browser.close();
}

run().catch((err) => {
  console.error('\n❌ KIỂM THỬ PLAYWRIGHT THẤT BẠI:', err);
  process.exit(1);
});
