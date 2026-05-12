const puppeteer = require('puppeteer-extra');

const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');


// --- CONFIGURACIÓN DE GOOGLE DRIVE ---
const DRIVE_FOLDER_ID = '0AAmELIefAxCDUk9PVA'; 
const KEYFILEPATH = path.resolve(__dirname, '../credentials.json'); // Ajustado para subir un nivel

async function uploadToDrive(fileName, filePath) {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEYFILEPATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const driveService = google.drive({ version: 'v3', auth });

    const fileMetadata = {
        name: fileName,
        parents: [DRIVE_FOLDER_ID]
    };
    
    const media = {
        mimeType: 'text/csv',
        body: fs.createReadStream(filePath)
    };

    try {
        const file = await driveService.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
            supportsAllDrives: true 
        });
        return file.data.id;
    } catch (err) {
        throw new Error(`Error Drive: ${err.message}`);
    }
}

// ESTA ES LA FUNCIÓN QUE EXPORTAMOS PARA EXPRESS
const scrapeTCI = async (req, res) => {
    const downloadPath = path.resolve(__dirname, '../downloads');
    if (!fs.existsSync(downloadPath)) { fs.mkdirSync(downloadPath); }

    console.log("🤖 Iniciando Scraper TCI...");
    
    const browser = await puppeteer.launch({
        headless: true, // Cambia a false si quieres ver el proceso en el servidor
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });

        // --- LÓGICA DE SCRAPPING (Tu código optimizado) ---
        await page.goto("https://aortizdemontellanoarevalo.quickbase.com/db/btcn3qu85?a=appoverview", { 
            waitUntil: "networkidle2" 
        });

        // 1. Login
        const userSelector = 'input#login-userid, input[name="loginid"]';
        await page.waitForSelector(userSelector, { visible: true });
        await page.type(userSelector, 'santiago@complexity.capital');
        await page.type('input[type="password"]', 'C0mpl3x1tyJBR2026');
        await Promise.all([
            page.click('#signin'),
            page.waitForNavigation({ waitUntil: "networkidle0" })
        ]);

        await new Promise(r => setTimeout(r, 6000)); 

        // 2. Menú More
        await page.evaluate(() => {
            const more = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.includes('More'));
            if (more) more.click();
        });
        await new Promise(r => setTimeout(r, 2000));

        // 3. Import/Export
        await page.waitForSelector('#importExportLink', { visible: true });
        await page.click('#importExportLink');

        // 4. Configuración
        await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
        const radioLabel = 'xpath/.//label[contains(., "Export a table to a file")]';
        await page.waitForSelector(radioLabel, { visible: true });
        await page.click(radioLabel);

        // 5. Tabla
        await page.waitForSelector('#tablePicker', { visible: true });
        await page.select('#tablePicker', 'btvkvvvwh'); 

        // 6. Click Final
        const finalBtnSelector = '#submitButton';
        await page.waitForSelector(finalBtnSelector, { visible: true });
        await page.evaluate((sel) => document.querySelector(sel).click(), finalBtnSelector);

        console.log("⏳ Esperando descarga...");
        await new Promise(r => setTimeout(r, 25000));

        const files = fs.readdirSync(downloadPath);
        if (files.length > 0) {
            const fileName = files[files.length - 1];
            const filePath = path.join(downloadPath, fileName);
            
            const driveId = await uploadToDrive(fileName, filePath);
            
            // Opcional: Borrar archivo local después de subirlo para ahorrar espacio
            fs.unlinkSync(filePath);

            res.status(200).json({
                success: true,
                message: "Scraping y subida completados",
                driveFileId: driveId
            });
        } else {
            throw new Error("No se generó ningún archivo en downloads");
        }

    } catch (error) {
        console.error("❌ ERROR EN TCI:", error.message);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        await browser.close();
    }
};

module.exports = { scrapeTCI };
