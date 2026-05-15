const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config();

/** Comillas simples en nombres rompen el parámetro `q` de Drive; se escapan según la API. */
function escapeDriveQueryName(name) {
    return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Sube un CSV a Drive.
 * - Si existe GOOGLE_DRIVE_FOLDER_ID: crea o actualiza un archivo con ese nombre dentro de esa carpeta
 *   (p. ej. https://drive.google.com/drive/folders/0AAmELIefAxCDUk9PVA → id 0AAmELIefAxCDUk9PVA).
 * - Si no: usa GOOGLE_DRIVE_FILE_ID_<idTabla> o GOOGLE_DRIVE_FILE_ID (solo actualiza ese archivo fijo).
 */
async function uploadToDrive(fileName, filePath, tableId) {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
    const legacyFileId =
        (tableId && process.env[`GOOGLE_DRIVE_FILE_ID_${tableId}`]) ||
        process.env.GOOGLE_DRIVE_FILE_ID;

    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const driveService = google.drive({ version: 'v3', auth });

        const media = {
            mimeType: 'text/csv',
            body: fs.createReadStream(filePath),
        };

        if (folderId) {
            const q = `'${escapeDriveQueryName(folderId)}' in parents and name = '${escapeDriveQueryName(fileName)}' and trashed = false`;
            const listRes = await driveService.files.list({
                q,
                fields: 'files(id, name)',
                pageSize: 5,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
            });

            const existing = listRes.data.files?.[0];

            if (existing?.id) {
                console.log(`☁️ Carpeta Drive: actualizando ${fileName} (id ${existing.id})...`);
                const response = await driveService.files.update({
                    fileId: existing.id,
                    media,
                    fields: 'id',
                    supportsAllDrives: true,
                });
                console.log(`✅ En Drive: ${fileName}`);
                return response.data.id;
            }

            console.log(`☁️ Carpeta Drive: creando ${fileName} en carpeta ${folderId}...`);
            const response = await driveService.files.create({
                requestBody: {
                    name: fileName,
                    parents: [folderId],
                    mimeType: 'text/csv',
                },
                media,
                fields: 'id',
                supportsAllDrives: true,
            });
            console.log(`✅ En Drive: ${fileName}`);
            return response.data.id;
        }

        if (!legacyFileId) {
            throw new Error(
                `Falta destino en Drive para ${fileName}. Define GOOGLE_DRIVE_FOLDER_ID (carpeta) o GOOGLE_DRIVE_FILE_ID / GOOGLE_DRIVE_FILE_ID_<idTabla>.`
            );
        }

        console.log(`☁️ Actualizando archivo fijo en Drive: ${fileName} (ID: ${legacyFileId})...`);
        const response = await driveService.files.update({
            fileId: legacyFileId,
            media,
            fields: 'id',
            supportsAllDrives: true,
        });
        console.log(`✅ En Drive: ${fileName}`);
        return response.data.id;
    } catch (error) {
        console.error('❌ Error en Drive:', error.message);
        throw error;
    }
}

const scrapeTCI = async (req, res) => {
    console.log("⏳ Iniciando scraping...");
    let browser;
    let page;

    const downloadPath = path.resolve(__dirname, './downloads');

    try {
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
        if (folderId) {
            console.log(
                `☁️ Drive: carpeta ${folderId} — cada CSV es un archivo aparte (crear o actualizar por nombre).`
            );
        } else {
            console.warn(
                '☁️ Drive: no hay GOOGLE_DRIVE_FOLDER_ID. Sin carpeta, solo se usa GOOGLE_DRIVE_FILE_ID_* / GOOGLE_DRIVE_FILE_ID y varias tablas pueden pisar el mismo archivo. Para 7 archivos independientes, define GOOGLE_DRIVE_FOLDER_ID en .env.'
            );
        }

        await new Promise(r => setTimeout(r, 25000)); 

        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath);
        }

        browser = await puppeteer.launch({
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--ignore-certificate-errors',
                '--start-maximized'
            ]
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath
        });

        // LOGIN
        console.log("🔐 Login...");
        await page.goto("https://aortizdemontellanoarevalo.quickbase.com/db/btcn3qu85?a=appoverview", { 
            waitUntil: "networkidle2" 
        });

        const userSelector = 'input#login-userid, input[name="loginid"]';
        await page.waitForSelector(userSelector, { visible: true });
        await page.type(userSelector, 'santiago@complexity.capital', { delay: 30 });
        await page.type('input[type="password"]', 'C0mpl3x1tyJBR2026', { delay: 30 });

        await Promise.all([
            page.click('#signin'),
            page.waitForNavigation({ waitUntil: "networkidle0" })
        ]);

        await new Promise(r => setTimeout(r, 5000));

        // Tablas exportadas por separado; cada una queda como <nombre>.csv en ./downloads (no se borran tras Drive)
        const tablas = [
            { nombre: 'Detalle_Movimientos_Palets', id: 'btuceb9js' },
            { nombre: 'Compras_Especiales_Fruta', id: 'btuccx2gk' },
            { nombre: 'Ventas', id: 'btcn3qvb5' },
            { nombre: 'Detalle_Ventas', id: 'btvkvvvwh' },
            { nombre: 'Catalogo_Productos', id: 'btsi2wfny' },
            { nombre: 'Clientes', id: 'btcn3qvby' },
            { nombre: 'Proveedor', id: 'btcn3qvcb' },
        ];

        const resultados = [];

        for (const tabla of tablas) {
            console.log(`📥 Exportando: ${tabla.nombre}`);

            await page.goto("https://aortizdemontellanoarevalo.quickbase.com/db/btcn3qu85?a=appoverview", { 
                waitUntil: "networkidle2" 
            });

            await new Promise(r => setTimeout(r, 4000));

            // Click "More"
            await page.evaluate(() => {
                const more = Array.from(document.querySelectorAll('a, button'))
                    .find(el => el.innerText.includes('More'));
                if (more) more.click();
            });

            await page.waitForSelector('#importExportLink', { visible: true });
            await page.click('#importExportLink');

            const radioLabel = 'xpath/.//label[contains(., "Export a table to a file")]';
            await page.waitForSelector(radioLabel, { visible: true });
            await page.click(radioLabel);

            await page.waitForSelector('#tablePicker', { visible: true });
            await page.select('#tablePicker', tabla.id);

            await page.waitForSelector('#submitButton', { visible: true });
            await page.evaluate(() => document.querySelector('#submitButton').click());

            console.log(`⏳ Descargando ${tabla.nombre}...`);
            await new Promise(r => setTimeout(r, 20000));

            const files = fs.readdirSync(downloadPath);

            const latestFile = files
                .map(f => ({
                    name: f,
                    time: fs.statSync(path.join(downloadPath, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time)[0];

            if (latestFile) {
                const oldPath = path.join(downloadPath, latestFile.name);
                const newFileName = `${tabla.nombre}.csv`;
                const newPath = path.join(downloadPath, newFileName);

                if (fs.existsSync(newPath) && path.resolve(oldPath) !== path.resolve(newPath)) {
                    fs.unlinkSync(newPath);
                }
                fs.renameSync(oldPath, newPath);

                console.log(`✅ Archivo local guardado: ${newPath}`);

                const driveId = await uploadToDrive(newFileName, newPath, tabla.id);

                resultados.push({
                    tabla: tabla.nombre,
                    tableId: tabla.id,
                    fileName: newFileName,
                    localPath: newPath,
                    driveId,
                });
            }
        }

        await browser.close();

        res.json({
            success: true,
            message: "Todas las tablas exportadas correctamente",
            resultados
        });

    } catch (error) {
        if (browser) await browser.close();

        console.error("❌ ERROR:", error.message);

        res.status(500).json({
            error: error.message,
            url: page ? page.url() : null
        });
    }
};

module.exports = { scrapeTCI };
