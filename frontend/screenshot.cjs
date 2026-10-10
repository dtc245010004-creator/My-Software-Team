const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Navigate to the stations page
    await page.goto('http://localhost:5173/stations', { waitUntil: 'networkidle' });
    
    // Check if there's a login prompt, if so, login
    // If it redirects to login, we need to handle that.
    // Let's just wait a bit and take a screenshot
    await page.waitForTimeout(2000);
    
    // If we are on login, we might need to login
    if (page.url().includes('login')) {
      await page.fill('input[type="text"]', 'admin');
      await page.fill('input[type="password"]', 'AdminPass123');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
    }
    
    // Now take screenshot of the stations page
    await page.screenshot({ path: 'frontend_screenshot.png', fullPage: true });
    console.log('Screenshot taken successfully.');
  } catch (err) {
    console.error('Error taking screenshot:', err);
  } finally {
    await browser.close();
  }
})();
