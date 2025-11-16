const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public')); // Serve frontend

// Helper to get correct storage path
const getStoragePath = (type, guildId) => {
  const baseDir = path.join(__dirname, 'commands');
  const subDir = type === 'exclusive' ? 'Exclusive' : 'Family';
  const storageFolder = `${type}storage`;
  return path.join(baseDir, subDir, storageFolder, guildId);
};

// Read links from storage
const getLinks = (type, guildId) => {
  const dir = getStoragePath(type, guildId);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir).map(file => ({
    id: file.replace('.txt', ''),
    target: fs.readFileSync(path.join(dir, file), 'utf8').trim()
  }));
};

// GET: List links
app.get('/api/:type/:guildId', (req, res) => {
  const { type, guildId } = req.params;
  const links = getLinks(type, guildId);
  res.json(links);
});

// DELETE: Remove link
app.delete('/api/:type/:guildId/:id', (req, res) => {
  const { type, guildId, id } = req.params;
  const filePath = path.join(getStoragePath(type, guildId), `${id}.txt`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Link not found' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});