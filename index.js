const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

app.get('/scrape', async (req, res) => {
  // Configuramos el navegador para que corra en servidores (Docker/Railway)
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();

  try {
    // 1. LOGIN
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

    // 2. IR A CUSTOMER STOCK Y CLICK EN "RD"
    await page.goto("https://sai.fridem.mx/customer-stock", { waitUntil: "networkidle2" });
    const selectorRD = '.btn-info';
    await page.waitForSelector(selectorRD, { timeout: 15000 });
    await Promise.all([
      page.click(selectorRD),
      page.waitForNavigation({ waitUntil: "networkidle2" })
    ]);

    // 3. EXTRACCIÓN DE DATOS CON PAGINACIÓN FORZADA
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
        const nextBtn = document.querySelector('#tbl-equipos-ingreso_next:not(.disabled) a, #tbl-equipos-ingreso_next:not(.disabled)');
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
    res.json(allData); // n8n recibirá el array de objetos

  } catch (error) {
    await browser.close();
    res.status(500).json({ error: error.message, url: page.url() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Scraper corriendo en puerto ${PORT}`));
