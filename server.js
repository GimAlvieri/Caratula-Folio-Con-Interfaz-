const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const dataFile = path.join(__dirname, 'folios.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'PUBLIC'), { index: ['index.HTML', 'index.html'] }));

function readFolios() {
  if (!fs.existsSync(dataFile)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error('No se pudo leer folios.json:', error.message);
    return [];
  }
}

function writeFolios(value) {
  fs.writeFileSync(dataFile, JSON.stringify(value, null, 2), 'utf8');
}

function validFolio(value) {
  return value && typeof value.folio === 'string' && value.folio.trim() &&
    typeof value.periodo === 'string' && value.periodo.trim() &&
    Array.isArray(value.entries) && value.entries.length <= 300 &&
    value.entries.every(entry => entry && ['document', 'separator'].includes(entry.type));
}

app.get('/api/folios', (req, res) => res.json(readFolios()));

app.post('/api/folios', (req, res) => {
  if (!validFolio(req.body)) return res.status(400).json({ error: 'Completa el folio, el periodo y revisa las filas registradas.' });
  const folios = readFolios();
  const item = { ...req.body, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  folios.push(item);
  writeFolios(folios);
  res.status(201).json(item);
});

app.put('/api/folios/:id', (req, res) => {
  if (!validFolio(req.body)) return res.status(400).json({ error: 'Completa el folio, el periodo y revisa las filas registradas.' });
  const folios = readFolios();
  const index = folios.findIndex(item => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'No se encontró el folio.' });
  folios[index] = { ...req.body, id: req.params.id, createdAt: folios[index].createdAt, updatedAt: new Date().toISOString() };
  writeFolios(folios);
  res.json(folios[index]);
});

app.delete('/api/folios/:id', (req, res) => {
  const folios = readFolios();
  const next = folios.filter(item => item.id !== req.params.id);
  if (next.length === folios.length) return res.status(404).json({ error: 'No se encontró el folio.' });
  writeFolios(next);
  res.status(204).end();
});

app.listen(port, () => console.log(`Carátulas de folio: http://localhost:${port}`));
