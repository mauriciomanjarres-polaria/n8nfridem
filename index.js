const express = require('express');
const puppeteer = require('puppeteer-core');

const app = express();

app.get('/scrape', async (req, res) => {

let browser;
let page;

try {

browser = await puppeteer.launch({
executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
headless: "new",
args: [
'--no-sandbox',
'--disable-setuid-sandbox',
'--disable-dev-shm-usage',
'--disable-gpu'
]
});

page = await browser.newPage();

// LOGIN
await page.goto("https://sai.fridem.mx/ingreso", { waitUntil: "networkidle2" });

const loginInput = await page.$('input[name="ingUsuario"]');

if (loginInput) {
  await page.type('input[name="ingUsuario"]', 'u075464');
  await page.type('input[name="ingPassword"]', 'M3a16tSu06ply');

  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2" })
  ]);
}

// IR A CUSTOMER STOCK
await page.goto("https://sai.fridem.mx/customer-stock", { waitUntil: "networkidle2" });

const selectorRD = '.btn-info';

await page.waitForSelector(selectorRD, { timeout: 15000 });

await Promise.all([
  page.click(selectorRD),
  page.waitForNavigation({ waitUntil: "networkidle2" })
]);

// ESPERAR TABLA
await page.waitForSelector('#tbl-equipos-ingreso', { timeout: 15000 });

let allData = [];
let hasNextPage = true;
let safetyCounter = 0;

while (hasNextPage && safetyCounter < 100) {

  safetyCounter++;

  const pageData = await page.$$eval('#tbl-equipos-ingreso tbody tr', rows => {
    return rows.map(row => {

      const cols = row.querySelectorAll('td');

      if (cols.length < 10 || row.innerText.includes('No data')) return null;

      return {
        rd: cols[0]?.innerText.trim(),
        renglon: cols[1]?.innerText.trim(),
        fecha_ingreso: cols[2]?.innerText.trim(),
        descripcion: cols[3]?.innerText.trim(),
        marca: cols[4]?.innerText.trim(),
        embalaje: cols[5]?.innerText.trim(),
        lote: cols[6]?.innerText.trim(),
        caducidad: cols[7]?.innerText.trim(),
        peso_unitario: cols[8]?.innerText.trim(),
        piezas: cols[9]?.innerText.trim(),
        kilosactual: cols[10]?.innerText.trim()
      };

    }).filter(i => i !== null);
  });

  allData.push(...pageData);

  hasNextPage = await page.evaluate(() => {

    const nextBtn =
      document.querySelector('#tbl-equipos-ingreso_next:not(.disabled) a') ||
      document.querySelector('#tbl-equipos-ingreso_next:not(.disabled)');

    if (nextBtn) {
      nextBtn.click();
      return true;
    }

    return false;
  });

  if (hasNextPage) {
    await new Promise(r => setTimeout(r, 2000));
  }

}

await browser.close();

res.json(allData);

} catch (error) {

if (browser) {
await browser.close();
}

res.status(500).json({
error: error.message,
url: page ? page.url() : null
});

}

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log(`Scraper corriendo en puerto ${PORT}`);
});
