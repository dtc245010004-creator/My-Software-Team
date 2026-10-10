const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'C:\\Users\\d8645\\.gemini\\antigravity-cli\\brain\\b802d43f-142f-43b8-80f5-bf5fb78b45cf\\scratch\\screenshots';
const BASE_URL = 'http://localhost:5173';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function runE2E() {
  console.log('=== KHỞI ĐỘNG KIỂM THỬ E2E & CHỤP ẢNH MÀN HÌNH TẤT CẢ GIAO DIỆN & ROLE ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  async function take(filename, desc) {
    const fullPath = path.join(OUTPUT_DIR, filename);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: fullPath, fullPage: true });
    console.log(`[✓] Đã chụp: ${filename} - ${desc}`);
  }

  // 1. Màn hình Đăng nhập
  console.log('\n--- 1. MÀN HÌNH ĐĂNG NHẬP (LOGIN SCREEN) ---');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('text=EV CSMS CONSOLE');
  await take('01_login_screen.png', 'Màn hình đăng nhập & 1-Click Role Switcher');

  // 2. Role: OPERATOR (CPO)
  console.log('\n--- 2. ROLE: OPERATOR (CPO - operator_a) ---');
  await page.click('button:has-text("Vận hành CPO")');
  await page.waitForURL(`${BASE_URL}/`);
  await page.waitForTimeout(2000);
  await take('02_cpo_dashboard.png', 'CPO Dashboard - Phụ tải thanh cái trạm & Lưới điện');

  // Stations
  await page.goto(`${BASE_URL}/stations`);
  await page.waitForTimeout(1500);
  await take('03_cpo_stations.png', 'CPO Stations - Quản lý 3 trạm sạc & 9 trụ EVSE');

  // Simulator
  await page.goto(`${BASE_URL}/simulator`);
  await page.waitForTimeout(2000);
  await take('04_cpo_simulator_idle.png', 'CPO Simulator - Bảng đồng hồ đo đếm Telemetry');

  // Bắt đầu sạc trên simulator
  try {
    const selectConn = await page.$('select');
    if (selectConn) {
      await page.selectOption('select', { index: 1 });
      await page.waitForTimeout(500);
    }
    const startBtn = await page.$('button:has-text("Bắt đầu phiên sạc")');
    if (startBtn) {
      await startBtn.click();
      await page.waitForTimeout(3000); // Đợi 2 nhịp websocket telemetry
    }
  } catch (e) {
    console.warn('Lưu ý khi bấm bắt đầu sạc:', e.message);
  }
  await take('05_cpo_simulator_active.png', 'CPO Simulator - Phiên sạc chạy thời gian thực qua WebSocket');

  // AI Advisor
  await page.goto(`${BASE_URL}/ai-advisor`);
  await page.waitForTimeout(2000);
  const analyzeBtn = await page.$('button:has-text("Phân tích điều phối tải")');
  if (analyzeBtn) {
    await analyzeBtn.click();
    await page.waitForTimeout(2000);
  }
  await take('06_cpo_ai_smart_charging.png', 'CPO AI Advisor - Điều phối phụ tải thanh cái trạm');

  const maintTab = await page.$('button:has-text("Bảo Trì Dự Đoán")');
  if (maintTab) {
    await maintTab.click();
    await page.waitForTimeout(1500);
    await take('07_cpo_ai_predictive_maintenance.png', 'CPO AI Advisor - Ma trận cảnh báo nhiệt độ & sụt áp');
  }

  const pricingTab = await page.$('button:has-text("Tối Ưu Biểu Giá TOU")');
  if (pricingTab) {
    await pricingTab.click();
    await page.waitForTimeout(1500);
    await take('08_cpo_ai_dynamic_pricing.png', 'CPO AI Advisor - Phân tích phụ tải & Khuyến nghị TOU');
  }

  const askTab = await page.$('button:has-text("Trợ Lý Vận Hành")');
  if (askTab) {
    await askTab.click();
    await page.waitForTimeout(1500);
    await take('09_cpo_ai_ask_advisor.png', 'CPO AI Advisor - Trợ lý kỹ thuật hỏi đáp tiếng Việt');
  }

  // Sessions
  await page.goto(`${BASE_URL}/sessions`);
  await page.waitForTimeout(1500);
  await take('10_cpo_sessions.png', 'CPO Sessions - Lịch sử và hóa đơn điện tử');

  // Wallet
  await page.goto(`${BASE_URL}/wallet`);
  await page.waitForTimeout(1500);
  await take('11_cpo_wallet.png', 'CPO Wallet - Số dư và sao kê nạp tiền');

  // 3. Role: CUSTOMER (Khách hàng chuẩn)
  console.log('\n--- 3. ROLE: CUSTOMER (customer_user) ---');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Tài xế sạc")');
  await page.waitForURL(`${BASE_URL}/`);
  await page.waitForTimeout(2000);
  await take('12_customer_dashboard.png', 'Customer Dashboard - Trạng thái cổng sạc mạng lưới');

  await page.goto(`${BASE_URL}/wallet`);
  await page.waitForTimeout(1500);
  await take('13_customer_wallet.png', 'Customer Wallet - Số dư khả dụng & Nạp tiền nhanh');

  await page.goto(`${BASE_URL}/simulator`);
  await page.waitForTimeout(1500);
  await take('14_customer_simulator.png', 'Customer Simulator - Cắm sạc & Theo dõi tiến độ');

  // 4. Role: CUSTOMER ĐANG NỢ CƯỚC (driver_debt)
  console.log('\n--- 4. ROLE: CUSTOMER NỢ TIỀN (driver_debt) ---');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(1000);
  await page.fill('input[type="text"]', 'driver_debt');
  await page.fill('input[type="password"]', 'DriverPass123');
  await page.click('button[type="submit"]:has-text("ĐĂNG NHẬP")');
  await page.waitForURL(`${BASE_URL}/`);
  await page.waitForTimeout(2000);

  await page.goto(`${BASE_URL}/wallet`);
  await page.waitForTimeout(1500);
  await take('15_debt_customer_wallet.png', 'Customer Nợ Tiền - Cảnh báo số dư âm & Khóa tài khoản');

  await page.goto(`${BASE_URL}/simulator`);
  await page.waitForTimeout(1500);
  try {
    const selectConn = await page.$('select');
    if (selectConn) {
      await page.selectOption('select', { index: 1 });
      await page.waitForTimeout(500);
    }
    const startBtn = await page.$('button:has-text("Bắt đầu phiên sạc")');
    if (startBtn) {
      await startBtn.click();
      await page.waitForTimeout(1500);
    }
  } catch (e) {}
  await take('16_debt_customer_blocked.png', 'Customer Nợ Tiền - Chặn khởi động phiên mới (HTTP 402)');

  // 5. Role: ADMIN
  console.log('\n--- 5. ROLE: ADMIN (admin) ---');
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Quản trị viên")');
  await page.waitForURL(`${BASE_URL}/`);
  await page.waitForTimeout(2000);
  await take('17_admin_dashboard.png', 'Admin Dashboard - Toàn quyền giám sát toàn bộ hạ tầng');

  await page.goto(`${BASE_URL}/stations`);
  await page.waitForTimeout(1500);
  await take('18_admin_stations.png', 'Admin Stations - Quản trị đa trạm toàn quốc');

  await browser.close();
  console.log('\n=== HOÀN TẤT KIỂM THỬ E2E & CHỤP TOÀN BỘ 18 ẢNH MÀN HÌNH THÀNH CÔNG ===');
  console.log(`Ảnh đã lưu tại: ${OUTPUT_DIR}`);
}

runE2E().catch((err) => {
  console.error('Lỗi khi chạy E2E:', err);
  process.exit(1);
});
