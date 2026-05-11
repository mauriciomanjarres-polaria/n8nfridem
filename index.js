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
