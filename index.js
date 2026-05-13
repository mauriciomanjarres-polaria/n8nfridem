const express = require('express');
const app = express();
// Importamos la función desde la carpeta scrapers
const { scrapeGeneral } = require('./scrapers/scrapeController');
//const { scrapeTCI } = require('./scrapers/tciController'); 

app.use(express.json());

// RUTAS
app.get('/scrape', scrapeGeneral); 
//app.get('/tci', scrapeTCI); 

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});
