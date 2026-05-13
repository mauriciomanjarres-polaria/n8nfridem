const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config(); // Cargar variables al inicio del archivo


async function uploadToDrive(fileName, filePath) {
    // Usamos las variables de entorno en lugar de valores fijos
    const FILE_ID_FIJO = process.env.GOOGLE_DRIVE_FILE_ID; 
    
    console.log(`☁️ Actualizando contenido en archivo fijo de Drive (ID: ${FILE_ID_FIJO})...`);
    
    try {
        // Configuramos la autenticación usando las variables del .env
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Corregir saltos de línea
            },
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const driveService = google.drive({ version: 'v3', auth });

        const media = {
            mimeType: 'text/csv',
            body: fs.createReadStream(filePath)
        };

        const response = await driveService.files.update({
            fileId: FILE_ID_FIJO,
            media: media,
            fields: 'id',
            supportsAllDrives: true 
        });

        console.log(`✅ Archivo reemplazado con éxito. ID en Drive: ${response.data.id}`);
        return response.data.id;

    } catch (error) {
        console.error("❌ Error al actualizar el archivo en Google Drive:", error.message);
        throw error;
    }
}

// 1. Función exportable
const scrapeTCI = async (req, res) => {
    console.log("⏳ Iniciando proceso de scraping...");
    let browser;
    let page;
    const downloadPath = path.resolve(__dirname, './downloads');

    try {
        
        await new Promise(r => setTimeout(r, 25000)); 
        // Asegurar que la carpeta de descargas existe
        if (!fs.existsSync(downloadPath)) { fs.mkdirSync(downloadPath); }

        browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--ignore-certificate-errors',
                '--ignore-certificate-errors-spki-list',
                '--start-maximized'
            ]
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // Configurar comportamiento de descarga en el servidor
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });

        // --- LÓGICA DE AUTOMATIZACIÓN ---
        console.log("🚀 Navegando a Quickbase...");
        await page.goto("https://aortizdemontellanoarevalo.quickbase.com/db/btcn3qu85?a=appoverview", { 
            waitUntil: "networkidle2" 
        });

        // Login
        const userSelector = 'input#login-userid, input[name="loginid"]';
        await page.waitForSelector(userSelector, { visible: true, timeout: 20000 });
        await page.type(userSelector, 'santiago@complexity.capital', { delay: 30 });
        await page.type('input[type="password"]', 'C0mpl3x1tyJBR2026', { delay: 30 });

        await Promise.all([
            page.click('#signin'),
            page.waitForNavigation({ waitUntil: "networkidle0" })
        ]);

        await new Promise(r => setTimeout(r, 6000)); 

        // Menú More e Import/Export
        await page.evaluate(() => {
            const more = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.includes('More'));
            if (more) more.click();
        });
        
        const ieSelector = '#importExportLink';
        await page.waitForSelector(ieSelector, { visible: true });
        await page.click(ieSelector);

        // Selección de exportación
        const radioLabel = 'xpath/.//label[contains(., "Export a table to a file")]';
        await page.waitForSelector(radioLabel, { visible: true });
        await page.click(radioLabel);

        // Seleccionar tabla
        await page.waitForSelector('#tablePicker', { visible: true });
        await page.select('#tablePicker', 'btvkvvvwh'); 

        // Ejecutar descarga
        const finalBtnSelector = '#submitButton';
        await page.waitForSelector(finalBtnSelector, { visible: true });
        await page.evaluate((sel) => document.querySelector(sel).click(), finalBtnSelector);

        // Espera de descarga (ajustada para entornos de servidor)
        console.log("⏳ Esperando descarga del archivo...");
        await new Promise(r => setTimeout(r, 25000)); 

        const files = fs.readdirSync(downloadPath);
        let driveId = null;

        if (files.length > 0) {
            const fileName = files[files.length - 1];
            const filePath = path.join(downloadPath, fileName);
            console.log(`✅ Archivo detectado: ${fileName}. Subiendo...`);
            
            driveId = await uploadToDrive(fileName, filePath);
            
            // Opcional: Limpiar archivo local después de subir
            fs.unlinkSync(filePath);
        }

        await browser.close();

        // 2. Respuesta al cliente
        res.json({
            success: true,
            message: "Proceso completado",
            fileName: files.length > 0 ? files[files.length - 1] : null,
            googleDriveId: driveId
        });

    } catch (error) {
        if (browser) await browser.close();
        console.error("❌ ERROR:", error.message);
        res.status(500).json({
            error: error.message,
            url: page ? page.url() : null,
            step: "Proceso de scraping/upload fallido"
        });
    }
};

// 3. Exportación
module.exports = { scrapeTCI };

