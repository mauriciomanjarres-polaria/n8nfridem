const puppeteer = require('puppeteer-core');

// 1. Convertimos el "app.get" en una función exportable
const scrapeGeneral = async (req, res) => {
    let browser;
    let page;

    try {
        browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list'
            ]
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // --- TU LÓGICA DE LOGIN Y SCRAPING EMPIEZA AQUÍ ---
        await page.goto("https://sai.fridem.mx/ingreso", { waitUntil: "networkidle2" });
        const loginInput = await page.waitForSelector('input[name="ingUsuario"]', { timeout: 10000 });

        if (loginInput) {
            await page.type('input[name="ingUsuario"]', 'u075464', { delay: 50 });
            await page.type('input[name="ingPassword"]', 'M3a16tSu06ply', { delay: 50 });
            await Promise.all([
                page.click('button[type="submit"]'),
                page.waitForNavigation({ waitUntil: "networkidle0" })
            ]);
        }

        if (page.url().includes('ingreso')) {
            throw new Error("Login fallido: Las credenciales fueron rechazadas.");
        }

        await page.goto("https://sai.fridem.mx/customer-stock", { waitUntil: "networkidle2" });
        const selectorRD = '.btn-info';
        await page.waitForSelector(selectorRD, { visible: true, timeout: 20000 });

        await Promise.all([
            page.click(selectorRD),
            page.waitForNavigation({ waitUntil: "networkidle2" })
        ]);

        await page.waitForSelector('#tbl-equipos-ingreso', { timeout: 20000 });

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
                const nextBtn = document.querySelector('#tbl-equipos-ingreso_next:not(.disabled) a') || 
                               document.querySelector('#tbl-equipos-ingreso_next:not(.disabled)');
                if (nextBtn && nextBtn.innerText !== "") {
                    nextBtn.click();
                    return true;
                }
                return false;
            });

            if (hasNextPage) await new Promise(r => setTimeout(r, 2500));
        }
        // --- TU LÓGICA TERMINA AQUÍ ---

        await browser.close();
        res.json(allData);

    } catch (error) {
        if (browser) await browser.close();
        res.status(500).json({
            error: error.message,
            url: page ? page.url() : null,
            step: "Proceso de scraping"
        });
    }
};

// 2. IMPORTANTE: Exportamos la función para que index.js la vea
module.exports = { scrapeGeneral };
¿Cómo queda ahora tu index.js?
Este archivo solo debe tener las rutas.

JavaScript
const express = require('express');
const app = express();
const { scrapeGeneral } = require('./scrapers/scrapeController');

app.get('/scrape', scrapeGeneral);

// Aquí podrás agregar fácilmente:
// const { scrapeTCI } = require('./scrapers/tciController');
// app.get('/tci', scrapeTCI);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor en puerto ${PORT}`);
});
