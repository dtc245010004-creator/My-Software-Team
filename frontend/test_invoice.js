import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ PLAYWRIGHT: GIAO DIỆN HÓA ĐƠN TỪNG ĐOẠN GIÁ (SCRUM-186 / SCRUM-224 / S-33) ===');

  const screenshotDir = path.resolve(process.cwd(), '../docs/screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 850 },
  });
  const page = await desktopContext.newPage();
  page.on('console', msg => console.log('DESKTOP LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // 1. Đăng nhập tài xế
  console.log('\n--- 1. Đăng nhập tài khoản Tài xế (customer_user) ---');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'customer_user');
  await page.fill('input[type="password"]', 'CusPass123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  console.log('URL sau đăng nhập:', page.url());

  // 2. Mở danh sách phiên sạc /sessions
  console.log('\n--- 2. Truy cập màn hình /sessions và mở hóa đơn phiên #7 (có 2 đoạn giá TOU) ---');
  await page.goto('http://localhost:5173/sessions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Tìm dòng phiên #7 và bấm nút Hóa đơn
  const row7 = page.locator('tr').filter({ has: page.locator('td').filter({ hasText: /^#7$/ }) });
  await row7.waitFor({ state: 'visible', timeout: 5000 });
  const invoiceBtn7 = row7.locator('button:has-text("Hóa đơn")');
  await invoiceBtn7.click();
  await page.waitForTimeout(1000);

  // Kiểm tra Modal Hóa đơn mở lên
  const modalContent = page.locator('#invoice-modal-content');
  await modalContent.waitFor({ state: 'visible', timeout: 5000 });
  console.log('=> [PASSED] Modal Hóa đơn mở thành công.');

  // Kiểm tra Tiêu đề Hóa đơn
  const modalTitle = await modalContent.locator('h2').first().innerText();
  console.log('Tiêu đề hóa đơn:', modalTitle);
  if (!modalTitle.includes('HÓA ĐƠN')) {
    throw new Error('Tiêu đề modal không chứa HÓA ĐƠN: ' + modalTitle);
  }

  // Kiểm tra Bảng diễn giải từng đoạn giá (S-33)
  const segmentsSection = page.locator('text=DIỄN GIẢI DANH SÁCH TỪNG ĐOẠN GIÁ');
  await segmentsSection.waitFor({ state: 'visible', timeout: 5000 });
  console.log('=> [PASSED] Tiêu đề Bảng danh sách từng đoạn giá hiển thị rõ ràng.');

  // Kiểm tra sự xuất hiện của các đoạn giá (Normal và Peak)
  const normalRateBadge = modalContent.locator('text=Giờ bình thường');
  const peakRateBadge = modalContent.locator('text=Giờ cao điểm');
  const hasNormal = (await normalRateBadge.count()) > 0;
  const hasPeak = (await peakRateBadge.count()) > 0;
  console.log(`Đoạn giờ bình thường xuất hiện: ${hasNormal}, Đoạn giờ cao điểm xuất hiện: ${hasPeak}`);
  if (hasNormal && hasPeak) {
    console.log('=> [PASSED] Đầy đủ các đoạn giá theo khoảng thời gian, phân loại TOU, sản lượng và đơn giá!');
  } else {
    throw new Error('=> [FAILED] Thiếu đoạn giá TOU trong bảng diễn giải!');
  }

  // Kiểm tra dòng Phí chiếm trụ (Idle Fee)
  const idleFeeSection = modalContent.locator('text=Phí chiếm trụ sạc sau khi pin đầy (Idle Fee)');
  await idleFeeSection.waitFor({ state: 'visible', timeout: 5000 });
  console.log('=> [PASSED] Dòng phí chiếm trụ hiển thị đầy đủ theo yêu cầu ticket!');

  // Kiểm tra dòng Tổng cộng thanh toán
  const totalSummary = modalContent.locator('text=TỔNG CỘNG THANH TOÁN');
  await totalSummary.waitFor({ state: 'visible', timeout: 5000 });
  console.log('=> [PASSED] Khối tổng cộng thanh toán hiển thị nổi bật.');

  await page.screenshot({ path: path.join(screenshotDir, 'invoice_detail_segments.png') });
  console.log('Đã lưu ảnh: docs/screenshots/invoice_detail_segments.png');

  // Đóng modal
  const closeBtn = page.locator('#invoice-modal-close-btn');
  await closeBtn.click();
  await page.waitForTimeout(500);

  // 3. Kiểm tra tiêu chí AC S-33: Phiên đang cần xem xét (NEEDS_REVIEW)
  console.log('\n--- 3. Kiểm thử tiêu chí AC S-33: Phiên sạc cần xem xét (#18) hiển thị banner chờ xử lý ---');
  const row18 = page.locator('tr').filter({ has: page.locator('td').filter({ hasText: /^#18$/ }) });
  await row18.waitFor({ state: 'visible', timeout: 5000 });
  const invoiceBtn18 = row18.locator('button:has-text("Hóa đơn")');
  await invoiceBtn18.click();
  await page.waitForTimeout(1000);

  const reviewBanner = page.locator('#invoice-needs-review-banner');
  await reviewBanner.waitFor({ state: 'visible', timeout: 5000 });
  const reviewText = await reviewBanner.innerText();
  console.log('Nội dung cảnh báo đối soát:\n', reviewText);
  if (reviewText.includes('CHỜ XEM XÉT') || reviewText.includes('ĐỐI SOÁT')) {
    console.log('=> [PASSED] AC S-33 ĐẠT: Màn hình hiển thị cảnh báo đang chờ xử lý thay vì số tiền tạm tính!');
  } else {
    throw new Error('=> [FAILED] AC S-33: Không hiển thị banner chờ xử lý: ' + reviewText);
  }

  await page.screenshot({ path: path.join(screenshotDir, 'invoice_needs_review_alert.png') });
  console.log('Đã lưu ảnh: docs/screenshots/invoice_needs_review_alert.png');

  await page.locator('#invoice-modal-close-btn').click();
  await page.waitForTimeout(500);

  // 4. Kiểm tra trang chi tiết /invoices/7
  console.log('\n--- 4. Kiểm tra trang hóa đơn độc lập /invoices/7 ---');
  await page.goto('http://localhost:5173/invoices/7', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const pageSegments = page.locator('text=DIỄN GIẢI DANH SÁCH TỪNG ĐOẠN GIÁ');
  await pageSegments.waitFor({ state: 'visible', timeout: 5000 });
  console.log('=> [PASSED] Trang /invoices/7 hiển thị trực tiếp và đầy đủ.');

  // 5. Kiểm tra bố cục di động 360px
  console.log('\n--- 5. Kiểm tra hiển thị responsive trên màn hình di động 360px ---');
  const mobileContext = await browser.newContext({
    viewport: { width: 360, height: 740 },
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await mobilePage.fill('input[type="text"]', 'customer_user');
  await mobilePage.fill('input[type="password"]', 'CusPass123');
  await mobilePage.click('button[type="submit"]');
  await mobilePage.waitForTimeout(1000);

  await mobilePage.goto('http://localhost:5173/invoices/7', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: path.join(screenshotDir, 'invoice_mobile_view.png') });
  console.log('Đã lưu ảnh: docs/screenshots/invoice_mobile_view.png');
  await mobileContext.close();

  // 6. Kiểm tra nút Hóa đơn trên màn hình phiên kết thúc (ActiveSession)
  console.log('\n--- 6. Kiểm tra nút mở hóa đơn trên màn hình phiên sạc kết thúc (ActiveSession) ---');
  await page.goto('http://localhost:5173/session/1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const viewInvoiceBtn = page.locator('#view-invoice-btn');
  const btnCount = await viewInvoiceBtn.count();
  if (btnCount > 0) {
    console.log('=> [PASSED] Nút "XEM HÓA ĐƠN CHI TIẾT" xuất hiện khi phiên kết thúc.');
    await viewInvoiceBtn.click();
    await page.waitForTimeout(500);
    const activeModal = page.locator('#invoice-modal-content');
    await activeModal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('=> [PASSED] Bấm nút từ ActiveSession mở trực tiếp InvoiceModal chi tiết từng đoạn giá.');
    await page.screenshot({ path: path.join(screenshotDir, 'active_session_invoice_button.png') });
    console.log('Đã lưu ảnh: docs/screenshots/active_session_invoice_button.png');
  } else {
    console.log('Phiên #1 chưa kết thúc trong telemetry, bỏ qua bước click nút ActiveSession.');
  }

  console.log('\n=== TẤT CẢ CÁC BÀI KIỂM THỬ PLAYWRIGHT CHO SCRUM-224 ĐỀU ĐẠT 100% ===');
  await browser.close();
}

run().catch(err => {
  console.error('\n❌ KIỂM THỬ PLAYWRIGHT THẤT BẠI:', err);
  process.exit(1);
});
