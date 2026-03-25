const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static file server
function startServer(dir, port) {
  return new Promise((resolve) => {
    const mime = { '.html':'text/html','.css':'text/css','.js':'application/javascript',
      '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
      '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf' };
    const server = http.createServer((req, res) => {
      let filePath = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (filePath.endsWith('/')) filePath += 'index.html';
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404); res.end('Not found');
      }
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const port = 7891;
  const server = await startServer(__dirname, port);
  console.log(`Server started on http://127.0.0.1:${port}`);

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
           '--font-render-hinting=none', '--force-color-profile=srgb']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for fonts & JS init
  await new Promise(r => setTimeout(r, 3000));

  const totalSlides = await page.evaluate(() =>
    document.querySelectorAll('.slide').length
  );
  console.log(`Found ${totalSlides} slides`);

  const { PDFDocument } = require('pdf-lib');
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < totalSlides; i++) {
    // Use goTo() if available, otherwise manipulate directly
    await page.evaluate((idx) => {
      if (typeof goTo === 'function') {
        goTo(idx);
      } else {
        const slides = document.querySelectorAll('.slide');
        slides.forEach((s, j) => {
          s.style.display = j === idx ? 'flex' : 'none';
          s.style.opacity = '1';
          s.style.transform = 'none';
          s.style.pointerEvents = j === idx ? 'auto' : 'none';
        });
      }
    }, i);

    await new Promise(r => setTimeout(r, 600));

    const screenshotBuffer = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1280, height: 720 }
    });

    const img = await pdfDoc.embedPng(screenshotBuffer);
    const pp = pdfDoc.addPage([1280, 720]);
    pp.drawImage(img, { x: 0, y: 0, width: 1280, height: 720 });

    console.log(`  Slide ${i + 1}/${totalSlides} done`);
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('presentation.pdf', pdfBytes);
  console.log('PDF saved: presentation.pdf');

  await browser.close();
  server.close();
})();
