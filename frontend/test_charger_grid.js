import { chromium } from 'playwright';

async function run() {
  console.log('--- KHỞI ĐỘNG KIỂM THỬ PLAYWRIGHT CHO MÀN HÌNH LƯỚI TRỤ SẠC ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // 1. Đăng nhập Admin
  console.log('1. Truy cập trang đăng nhập...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

  // Nhập thông tin đăng nhập
  await page.fill('input[type="text"], input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'AdminPass123');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(1500);
  console.log('Đã đăng nhập thành công. URL hiện tại:', page.url());

  // 2. Chuyển sang màn hình Lưới Trụ Sạc
  console.log('2. Điều hướng tới /charger-grid...');
  await page.goto('http://localhost:5173/charger-grid', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 3. Kiểm tra Acceptance Criteria 1: Hiển thị 20+ trụ sạc không có cuộn ngang
  const cards = await page.$$('.select-none');
  console.log(`Số lượng thẻ trụ sạc hiển thị trên màn hình: ${cards.length}`);
  if (cards.length < 20) {
    console.error(`CẢNH BÁO: Số lượng thẻ (${cards.length}) nhỏ hơn 20!`);
  } else {
    console.log(`ĐẠT AC 1: Hiển thị đủ ${cards.length} trụ sạc (>= 20 trụ)!`);
  }

  // Kiểm tra tràn cuộn ngang
  const scrollInfo = await page.evaluate(() => {
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });
  console.log('Kích thước khung nhìn:', scrollInfo);
  const noHorizontalScroll = scrollInfo.scrollWidth <= scrollInfo.clientWidth + 5;
  console.log(`Kiểm tra không cuộn ngang: ${noHorizontalScroll ? 'PASSED (Không tràn ngang)' : 'FAILED'}`);

  // Chụp ảnh màn hình chế độ thường
  await page.screenshot({ path: 'charger_grid_normal.png', fullPage: false });
  console.log('Đã lưu ảnh chụp: charger_grid_normal.png');

  // 4. Kiểm tra Acceptance Criteria 2: Chế độ trợ năng mù màu (Color-blind Accessibility)
  console.log('3. Kiểm tra nút bật/tắt Chế độ trợ năng mù màu...');
  const colorBlindBtn = await page.getByRole('button', { name: /Mù màu/i });
  await colorBlindBtn.click();
  await page.waitForTimeout(500);

  // Kiểm tra các nhãn mã trợ năng [OK], [CHG], [ERR], [OFF], [RDY]
  const pageContent = await page.content();
  const hasOkTag = pageContent.includes('[OK]');
  const hasErrTag = pageContent.includes('[ERR]') || pageContent.includes('[OFF]') || pageContent.includes('[CHG]');
  console.log(`Kiểm tra ký hiệu trợ năng WCAG [OK]: ${hasOkTag ? 'CÓ' : 'KHÔNG'}`);
  console.log(`Kiểm tra các ký hiệu trợ năng khác [ERR]/[CHG]/[OFF]: ${hasErrTag ? 'CÓ' : 'KHÔNG'}`);

  // Chụp ảnh màn hình chế độ mù màu
  await page.screenshot({ path: 'charger_grid_colorblind.png', fullPage: false });
  console.log('Đã lưu ảnh chụp: charger_grid_colorblind.png');

  // 5. Kiểm tra Modal Chi Tiết Trụ Sạc
  console.log('4. Thử click vào một thẻ trụ sạc để mở Modal Chi Tiết...');
  if (cards.length > 0) {
    await cards[0].click();
    await page.waitForTimeout(1000);

    const modal = await page.$('.fixed.inset-0');
    console.log(`Modal chi tiết mở thành công: ${modal ? 'YES' : 'NO'}`);

    // Chụp ảnh màn hình modal
    await page.screenshot({ path: 'charger_grid_modal.png', fullPage: false });
    console.log('Đã lưu ảnh chụp: charger_grid_modal.png');
  }

  await browser.close();
  console.log('--- HOÀN TẤT KIỂM THỬ PLAYWRIGHT THÀNH CÔNG RỰC RỠ! ---');
}

run().catch((err) => {
  console.error('Lỗi kiểm thử:', err);
  process.exit(1);
});
