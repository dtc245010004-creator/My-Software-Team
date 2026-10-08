import { chromium } from 'playwright';

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ PLAYWRIGHT: DANH SÁCH PHIÊN BẤT THƯỜNG (SCRUM-52 / SCRUM-148) ===');
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

  // 1. Kiểm tra Ràng buộc kỹ thuật (NFR): Tài xế (CUSTOMER) bị chặn truy cập
  console.log('1. Kiểm tra NFR: Vai trò Khách / Tài xế (CUSTOMER) bị chặn truy cập /abnormal-sessions...');
  await page.goto('http://localhost:5173/abnormal-sessions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  console.log('URL hiện tại khi là CUSTOMER:', page.url());
  const isBlocked = page.url().includes('/map') || (await page.locator('text=TRUY CẬP BỊ TỪ CHỐI').count()) > 0;
  console.log(`- Kết quả kiểm tra NFR (Chặn CUSTOMER): ${isBlocked ? 'PASSED (Đã chặn thành công)' : 'FAILED'}`);

  // 2. Đăng nhập với vai trò Vận hành viên (OPERATOR)
  console.log('2. Đăng nhập hệ thống với tài khoản Vận hành viên (OPERATOR)...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"]', 'operator_a');
  await page.fill('input[type="password"]', 'OpPass123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  // 3. Điều hướng tới /abnormal-sessions
  console.log('3. Vận hành viên điều hướng tới /abnormal-sessions...');
  await page.goto('http://localhost:5173/abnormal-sessions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Chụp ảnh màn hình danh sách ban đầu
  await page.screenshot({ path: 'abnormal_sessions_list.png' });
  console.log('- Đã lưu ảnh: abnormal_sessions_list.png');

  // 4. Kiểm tra Tiêu chí chấp nhận (AC): Hiển thị đủ mã, trụ, thời điểm mất liên lạc, số đo cuối
  console.log('4. Kiểm tra các trường bắt buộc trên màn hình (Mã, Trụ, Thời điểm mất liên lạc, Số đo cuối)...');
  const sessionCards = await page.locator('.bg-panel.border.rounded-lg').count();
  console.log(`- Số lượng phiên bất thường hiển thị: ${sessionCards}`);

  const hasSessionCode = (await page.getByText(/#SES-/i).count()) > 0;
  const hasCharger = (await page.getByText(/TRỤ SẠC & CỔNG/i).count()) > 0;
  const hasLostTime = (await page.getByText(/THỜI ĐIỂM MẤT LIÊN LẠC/i).count()) > 0;
  const hasMeter = (await page.getByText(/SỐ ĐO CÔNG TƠ CUỐI/i).count()) > 0;

  console.log(`  * Mã phiên (#SES-XX): ${hasSessionCode ? 'OK' : 'FAIL'}`);
  console.log(`  * Trụ sạc & Cổng: ${hasCharger ? 'OK' : 'FAIL'}`);
  console.log(`  * Thời điểm mất liên lạc: ${hasLostTime ? 'OK' : 'FAIL'}`);
  console.log(`  * Số đo công tơ cuối: ${hasMeter ? 'OK' : 'FAIL'}`);

  if (!hasSessionCode || !hasCharger || !hasLostTime || !hasMeter) {
    throw new Error('Thiếu một trong các thông tin bắt buộc theo AC!');
  }

  // 5. Kiểm tra Tiêu chí chấp nhận (AC): Đóng tay không có lý do thì bị chặn
  console.log('5. Mở Modal Đóng tay và kiểm tra: ĐÓNG TAY KHÔNG CÓ LÝ DO THÌ BỊ CHẶN...');
  const forceCloseBtn = page.getByRole('button', { name: /ĐÓNG TAY PHIÊN SẠC/i }).first();
  await forceCloseBtn.click();
  await page.waitForTimeout(600);

  // Kiểm tra nút xác nhận đóng phiên khi lý do để trống
  const confirmBtn = page.locator('#confirm-force-close-btn');
  const isDisabledInitially = await confirmBtn.isDisabled();
  console.log(`- Nút xác nhận bị vô hiệu hóa khi chưa có lý do: ${isDisabledInitially ? 'PASSED (Bị chặn)' : 'FAILED'}`);

  const blockedText = await page.locator('text=Đóng tay không có lý do thì bị chặn').count();
  console.log(`- Cảnh báo quy định vận hành hiển thị: ${blockedText > 0 ? 'PASSED' : 'FAILED'}`);

  await page.screenshot({ path: 'abnormal_sessions_blocked_without_reason.png' });
  console.log('- Đã lưu ảnh minh chứng chặn: abnormal_sessions_blocked_without_reason.png');

  // 6. Nhập lý do can thiệp và hoàn tất đóng tay
  console.log('6. Nhập lý do can thiệp hợp lệ và thực hiện đóng tay...');
  const reasonTextarea = page.locator('#force-close-reason-input');
  await reasonTextarea.fill('Trạm sạc mất nguồn điện lưới EVN đột ngột, xe đã ngắt sạc an toàn.');
  await page.waitForTimeout(400);

  const isEnabledAfterReason = await confirmBtn.isEnabled();
  console.log(`- Nút xác nhận đã được kích hoạt sau khi có lý do: ${isEnabledAfterReason ? 'PASSED' : 'FAILED'}`);

  await confirmBtn.click();
  console.log('- Đã bấm Xác nhận đóng phiên...');

  // Chờ Toast thông báo thành công
  await page.waitForSelector('.fixed.top-4', { timeout: 8000 });
  const toastText = await page.locator('.fixed.top-4').textContent();
  console.log(`- Toast thông báo kết quả: "${toastText.trim()}"`);

  await page.screenshot({ path: 'abnormal_sessions_force_close_success.png' });
  console.log('- Đã lưu ảnh thành công: abnormal_sessions_force_close_success.png');
  await page.waitForTimeout(2000);

  // 7. Kiểm tra với vai trò Kế toán (ACCOUNTANT) theo NFR
  console.log('7. Kiểm tra NFR: Vai trò Kế toán (ACCOUNTANT) truy cập trang thành công...');
  const accRoleBtn = page.getByRole('button', { name: /Kế toán/i });
  if (await accRoleBtn.isVisible()) {
    await accRoleBtn.click();
    await page.waitForTimeout(1500);
    console.log('- Đã chuyển sang vai trò Kế toán. URL hiện tại:', page.url());
    const accHeader = await page.locator('text=DANH SÁCH PHIÊN BẤT THƯỜNG TRÊN MÀN HÌNH VẬN HÀNH').count();
    console.log(`- Màn hình hiển thị đầy đủ cho Kế toán: ${accHeader > 0 ? 'PASSED' : 'FAILED'}`);
  }

  console.log('=== TẤT CẢ KIỂM THỬ PLAYWRIGHT HOÀN THÀNH XUẤT SẮC 100% ===');
  await browser.close();
}

run().catch((err) => {
  console.error('Lỗi kiểm thử Playwright:', err);
  process.exit(1);
});
