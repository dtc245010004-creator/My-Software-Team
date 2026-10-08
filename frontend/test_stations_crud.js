import { chromium } from 'playwright';

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ PLAYWRIGHT: TẠO/SỬA TRẠM SẠC & VALIDATION (SCRUM-23) ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  // 1. Đăng nhập Admin
  console.log('1. Đăng nhập hệ thống bằng tài khoản admin...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"], input[name="username"]', 'admin');
  await page.fill('input[type="password"]', 'AdminPass123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  // 2. Điều hướng đến trang Quản lý Trạm Sạc
  console.log('2. Điều hướng tới /stations...');
  await page.goto('http://localhost:5173/stations', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Chụp ảnh danh sách trạm sạc ban đầu
  await page.screenshot({ path: 'stations_list.png' });
  console.log('- Đã lưu ảnh: stations_list.png');

  // 3. Kiểm tra Form Validation khi để trống
  console.log('3. Mở Modal "Thêm trạm sạc" và kiểm tra Client Validation...');
  const addBtn = page.getByRole('button', { name: /Thêm trạm sạc/i });
  await addBtn.click();
  await page.waitForTimeout(600);

  // Xóa trắng tên trạm và bấm Lưu cấu hình
  const nameInput = page.getByPlaceholder(/Ví dụ: Trạm Sạc VinFast Landmark 81/i);
  await nameInput.fill('');
  
  // Nút Lưu cấu hình
  const saveBtn = page.getByRole('button', { name: /LƯU CẤU HÌNH/i });
  await saveBtn.click();
  await page.waitForTimeout(500);

  // Kiểm tra thông báo lỗi validation hiển thị trực tiếp dưới các trường
  const errorElements = await page.locator('.text-critical-red').allTextContents();
  console.log('- Số lượng cảnh báo lỗi validation:', errorElements.length);
  console.log('- Chi tiết thông báo lỗi xuất hiện trên màn hình:');
  errorElements.forEach((msg) => {
    const cleanMsg = msg.trim();
    if (cleanMsg) console.log(`   * ${cleanMsg}`);
  });

  await page.screenshot({ path: 'stations_validation_errors.png' });
  console.log('- Đã lưu ảnh lỗi validation: stations_validation_errors.png');

  // Đóng toast lỗi validation nếu có
  const closeToast = page.locator('.fixed.top-4 button');
  if (await closeToast.isVisible()) {
    await closeToast.click();
    await page.waitForTimeout(300);
  }

  // 4. Nhập dữ liệu hợp lệ và tạo mới trạm sạc
  console.log('4. Nhập dữ liệu hợp lệ để tạo trạm sạc mới...');
  const testStationName = `Trạm Test Auto ${Date.now().toString().slice(-4)}`;
  await nameInput.fill(testStationName);

  // Nhập công suất
  const capacityInput = page.locator('input[type="number"][min="1"]');
  await capacityInput.fill('350');

  // Click vào bản đồ modal để ghim tọa độ
  const mapElement = page.locator('.fixed.inset-0 .leaflet-container');
  if (await mapElement.isVisible()) {
    console.log('- Click lên bản đồ modal để ghim tọa độ GPS...');
    const box = await mapElement.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(600);
    }
  }

  // Nhập địa chỉ chi tiết
  const detailAddrInput = page.getByPlaceholder(/Ví dụ: 720A Điện Biên Phủ/i);
  await detailAddrInput.fill('Số 54 Liễu Giai, Ba Đình, Hà Nội');

  // Nhập giờ hoạt động
  const hoursInput = page.getByPlaceholder('24/7');
  await hoursInput.fill('24/7');
  await page.waitForTimeout(400);

  console.log('- Nhấn Lưu cấu hình tạo trạm...');
  await saveBtn.click();

  // Chờ Toast xuất hiện
  await page.waitForSelector('.fixed.top-4', { timeout: 8000 });
  const toastText = await page.locator('.fixed.top-4').textContent();
  console.log(`- Toast thông báo kết quả: "${toastText.trim()}"`);

  await page.screenshot({ path: 'stations_create_success.png' });
  console.log('- Đã lưu ảnh: stations_create_success.png');
  await page.waitForTimeout(2000);

  // 5. Kiểm tra tìm kiếm trạm vừa tạo
  console.log(`5. Tìm kiếm trạm vừa tạo: "${testStationName}"...`);
  const searchInput = page.getByPlaceholder(/tên trạm hoặc địa chỉ/i);
  await searchInput.fill(testStationName);
  await page.waitForTimeout(800);

  const matchedCards = await page.locator(`text=${testStationName}`).count();
  console.log(`- Tìm thấy trạm theo bộ lọc từ khóa: ${matchedCards > 0 ? 'THÀNH CÔNG' : 'KHÔNG TÌM THẤY'}`);

  // Đóng toast cũ nếu còn
  const prevToastClose = page.locator('.fixed.top-4 button');
  if (await prevToastClose.isVisible()) {
    await prevToastClose.click();
    await page.waitForTimeout(300);
  }

  // 6. Kiểm tra chức năng Sửa thông tin trạm sạc
  console.log('6. Mở Modal "Sửa cấu hình" và cập nhật thông tin trạm...');
  const editBtn = page.getByTitle(/Sửa cấu hình/i).first();
  await editBtn.click();
  await page.waitForTimeout(600);

  // Sửa tên trạm trong modal edit
  const editNameInput = page.locator('.fixed.inset-0 input[type="text"]').first();
  const updatedName = `${testStationName} - Cập nhật`;
  await editNameInput.fill(updatedName);

  const updateSaveBtn = page.getByRole('button', { name: /LƯU THAY ĐỔI/i });
  await updateSaveBtn.click();

  // Chờ Toast cập nhật thành công
  await page.waitForSelector('.fixed.top-4', { timeout: 8000 });
  const editToastText = await page.locator('.fixed.top-4').textContent();
  console.log(`- Toast cập nhật thành công: "${editToastText.trim()}"`);

  await page.screenshot({ path: 'stations_edit_success.png' });
  console.log('- Đã lưu ảnh: stations_edit_success.png');

  console.log('=== TẤT CẢ KIỂM THỬ PLAYWRIGHT HOÀN THÀNH XUẤT SẮC ===');
  await browser.close();
}

run().catch((err) => {
  console.error('Lỗi khi chạy kiểm thử:', err);
  process.exit(1);
});
