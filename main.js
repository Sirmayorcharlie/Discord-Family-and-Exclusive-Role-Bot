require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000; // Use environment variable PORT (for Cloud Run) or default to 3000
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// Load commands for registration
client.commands = new Collection();
const commandsForRegistration = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commandsForRegistration.push(command.data.toJSON());
    } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}


// --- AUTHENTICATION SETUP ---
let GUILD_PASSWORDS = null;
const PASSWORD_FILE_PATH = path.join(__dirname, 'password.json');

// Function to load passwords from JSON
const loadPasswords = () => {
    try {
        if (fs.existsSync(PASSWORD_FILE_PATH)) {
            const data = fs.readFileSync(PASSWORD_FILE_PATH, 'utf8');
            GUILD_PASSWORDS = JSON.parse(data);
            console.log(`🔒 Guild passwords loaded successfully for ${Object.keys(GUILD_PASSWORDS).length} servers.`);
        } else {
            console.error("❌ password.json not found. Dashboard access will be blocked.");
            GUILD_PASSWORDS = null;
        }
    } catch (error) {
        console.error("❌ Failed to read or parse password.json:", error);
        GUILD_PASSWORDS = null;
    }
};

// Authentication Middleware: Checks password and finds the associated Guild ID
const isAuthenticatedByQuery = (req, res, next) => {
    const { password } = req.query;

    if (!GUILD_PASSWORDS || !password) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Missing password or server configuration error.' });
    }

    // Find the Guild ID associated with this password
    let authenticatedGuildId = null;
    for (const [guildId, storedPassword] of Object.entries(GUILD_PASSWORDS)) {
        if (password === storedPassword) {
            authenticatedGuildId = guildId;
            break;
        }
    }

    if (authenticatedGuildId) {
        // Attach the authenticated Guild ID to the request for API routes to use
        req.authenticatedGuildId = authenticatedGuildId; 
        return next();
    }
    
    // Fail authentication
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid password.' });
};

// Middleware to inject authenticated Guild ID into API parameters
const injectGuildId = (req, res, next) => {
    // We only care about API routes that expect a guildId parameter
    if (!req.params.guildId) { 
        return next();
    }
    
    // If the client used the placeholder `:guildId` (as instructed in index.html)
    if (req.params.guildId === ':guildId') {
        // Replace it with the real, authenticated ID
        req.params.guildId = req.authenticatedGuildId;
        return next();
    } 
    
    // If the client passed a specific Guild ID, ensure it matches the authenticated one (Forbidden access check)
    if (req.params.guildId !== req.authenticatedGuildId) {
        return res.status(403).json({ success: false, error: 'Forbidden: Access restricted to the server tied to this password.' });
    }
    
    // If it matches, continue
    return next();
};


// --- EXPRESS MIDDLEWARE & SETUP ---
app.use(express.json());
// Serve static files (including login.html and index.html)
app.use(express.static(path.join(__dirname, 'public')));


// --- HELPER FUNCTIONS ---

const getStoragePath = (type, guildId) => {
  const baseDir = path.join(__dirname, 'commands');
  const subDir = type.charAt(0).toUpperCase() + type.slice(1);
  const storageFolder = `${type}storage`;
  return path.join(baseDir, subDir, storageFolder, guildId);
};

const getRoleInfo = (guild, roleId) => {
  const role = guild.roles.cache.get(roleId);
  if (role) {
    const hexColor = role.color === 0 ? '#FFFFFF' : `#${role.color.toString(16).padStart(6, '0').toUpperCase()}`;
    return { name: role.name, color: hexColor, position: role.position };
  }
  return { name: `Unknown (${roleId})`, color: '#AAAAAA', position: -1 };
};

const getRoleName = (guild, roleId) => {
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : `Unknown (${roleId})`;
};


// =========================================================================
// 🛠️ UPDATED getLinks function for both Exclusive (.txt files) and Family (JSON file)
// =========================================================================
const getLinks = async (type, guildId) => {
    const dir = getStoragePath(type, guildId);
    if (!fs.existsSync(dir)) return [];

    // Ensure client is ready and guild/roles are cached for lookup
    await client.guilds.fetch(guildId);
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return [];
    await guild.roles.fetch();

    const allLinks = [];
    
    if (type === 'exclusive') {
        // EXCLUSIVE: Logic remains on individual .txt files
        const files = fs.readdirSync(dir).filter(file => file.endsWith('.txt'));

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            const triggerId = file.replace('.txt', ''); 
            
            const linkedIds = fs.readFileSync(filePath, 'utf8')
                .split('\n')
                .map(id => id.trim())
                .filter(Boolean);

            const idInfo = getRoleInfo(guild, triggerId); 

            for (const linkedId of linkedIds) {
                const targetInfo = getRoleInfo(guild, linkedId); 
                allLinks.push({
                    id: triggerId, // Trigger Role ID
                    idName: idInfo.name,
                    idColor: idInfo.color,
                    idPosition: idInfo.position,
                    target: linkedId, // Role to Remove ID
                    targetName: targetInfo.name,
                    targetColor: targetInfo.color,
                    targetPosition: targetInfo.position,
                    timestamp: stats.mtimeMs
                });
            }
        }
    } else if (type === 'family') {
        // FAMILY FIX: Reads from a single JSON file
        const filePath = path.join(dir, 'family-links.json');
        
        if (!fs.existsSync(filePath)) return [];

        let links = {};
        try {
            links = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error(`Error parsing family-links.json for guild ${guildId}:`, e);
            return [];
        }

        for (const [kidId, parentId] of Object.entries(links)) {
            const kidInfo = getRoleInfo(guild, kidId); 
            const parentInfo = getRoleInfo(guild, parentId); 

            allLinks.push({
                id: kidId, // Kid Role ID (JSON Key)
                idName: kidInfo.name,
                idColor: kidInfo.color,
                idPosition: kidInfo.position,
                target: parentId, // Parent Role ID (JSON Value)
                targetName: parentInfo.name,
                targetColor: parentInfo.color,
                targetPosition: parentInfo.position,
                timestamp: Date.now() // Use current time or another placeholder as JSON doesn't track file modification time per link
            });
        }
    }

    return allLinks;
};
// =========================================================================


// --- ROUTING ---

// Login Routes (Unprotected)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Dashboard Route (Protected by isAuthenticatedByQuery)
app.get('/index.html', isAuthenticatedByQuery, (req, res) => {
    // If password is valid, serve the dashboard.
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// New API endpoint to exchange password for Guild ID
app.get('/api/auth-guild', isAuthenticatedByQuery, (req, res) => {
    // If the middleware passed, we have the authenticated guild ID
    res.json({ success: true, guildId: req.authenticatedGuildId });
});

// Apply authentication and Guild ID injection to ALL subsequent API routes
app.all('/api/*', isAuthenticatedByQuery, injectGuildId, (req, res, next) => next());


// GET /api/roles/:guildId - Get all roles for dropdowns
app.get('/api/roles/:guildId', async (req, res) => {
    const { guildId } = req.params;
    try {
        const guild = await client.guilds.fetch(guildId);
        await guild.roles.fetch();
        const roles = guild.roles.cache
            .filter(role => role.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(role => ({
                id: role.id,
                name: role.name,
                color: role.color === 0 ? '#FFFFFF' : `#${role.color.toString(16).padStart(6, '0').toUpperCase()}`
            }));
        res.json(roles);
    } catch (e) {
        console.error('Error fetching roles:', e);
        res.status(500).json({ error: 'Failed to fetch roles.' });
    }
});

// GET /api/guild-info/:guildId - Get Guild Name
app.get('/api/guild-info/:guildId', async (req, res) => {
    const { guildId } = req.params;
    try {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
        res.json({ name: guild.name, icon: guild.iconURL() });
    } catch (e) {
        console.error('Error fetching guild info:', e);
        res.status(500).json({ error: 'Failed to fetch guild info.' });
    }
});

// GET /api/exclusive/:guildId - Get all Exclusive Links
app.get('/api/exclusive/:guildId', async (req, res) => {
    try {
        const links = await getLinks('exclusive', req.params.guildId);
        res.json(links);
    } catch (e) {
        console.error('Error fetching exclusive links:', e);
        res.status(500).json({ error: 'Failed to fetch exclusive links.' });
    }
});

// POST /api/exclusive/:guildId - Create a new Exclusive Link
app.post('/api/exclusive/:guildId', async (req, res) => {
    const { guildId } = req.params;
    const { triggerId, removeId } = req.body; 

    if (!triggerId || !removeId) {
        return res.status(400).json({ success: false, error: 'Missing triggerId or removeId.' });
    }

    const storageDir = getStoragePath('exclusive', guildId);
    const filePath = path.join(storageDir, `${triggerId}.txt`);
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    let lines = [];
    if (fs.existsSync(filePath)) {
      lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    }

    if (lines.includes(removeId)) {
        return res.status(409).json({ success: false, message: 'Link already exists.' });
    }

    lines.push(removeId);
    try {
        fs.writeFileSync(filePath, lines.join('\n'));
        const guild = await client.guilds.fetch(guildId);
        res.json({ success: true, message: `Exclusive link created: IF ${getRoleName(guild, triggerId)} THEN REMOVE ${getRoleName(guild, removeId)}` });
    } catch (e) {
        console.error('Error writing exclusive link:', e);
        res.status(500).json({ success: false, error: 'Failed to save link.' });
    }
});

// DELETE /api/exclusive/:guildId/:triggerId/:removeId - Delete an Exclusive Link
app.delete('/api/exclusive/:guildId/:triggerId/:removeId', async (req, res) => {
    const { guildId, triggerId, removeId } = req.params; 

    const storageDir = getStoragePath('exclusive', guildId);
    const filePath = path.join(storageDir, `${triggerId}.txt`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Link file not found.' });
    }

    let lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    const initialLength = lines.length;
    lines = lines.filter(id => id !== removeId);

    if (lines.length < initialLength) {
        try {
            if (lines.length === 0) {
                fs.unlinkSync(filePath); // Delete file if no links remain
            } else {
                fs.writeFileSync(filePath, lines.join('\n'));
            }
            res.json({ success: true, message: `Exclusive link deleted: Trigger ID ${triggerId}, Remove ID ${removeId}` });
        } catch (e) {
            console.error('Error writing exclusive link:', e);
            res.status(500).json({ success: false, error: 'Failed to delete link.' });
        }
    } else {
        res.status(404).json({ success: false, message: 'Exclusive link not found.' });
    }
});


// =========================================================================
// 👪 NEW FAMILY API ROUTES FOR JSON STORAGE
// =========================================================================

// GET /api/family/:guildId - Get all Family Links
app.get('/api/family/:guildId', async (req, res) => {
    try {
        const links = await getLinks('family', req.params.guildId);
        res.json(links);
    } catch (e) {
        console.error('Error fetching family links:', e);
        res.status(500).json({ error: 'Failed to fetch family links.' });
    }
});

// POST /api/family/:guildId - Create a new Family Link (Kid -> Parent)
app.post('/api/family/:guildId', async (req, res) => {
    const { guildId } = req.params;
    // Expected from dashboard: { kidId: 'ROLE_ID', parentId: 'ROLE_ID' }
    const { kidId, parentId } = req.body; 

    if (!kidId || !parentId) {
        return res.status(400).json({ success: false, error: 'Missing kidId or parentId.' });
    }

    const storageDir = getStoragePath('family', guildId);
    const filePath = path.join(storageDir, 'family-links.json');
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    let links = {};
    if (fs.existsSync(filePath)) {
        try {
            links = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error("Error parsing family-links.json for POST:", e);
        }
    }
    
    links[kidId] = parentId; // Map Kid ID to Parent ID

    try {
        fs.writeFileSync(filePath, JSON.stringify(links, null, 2));
        const guild = await client.guilds.fetch(guildId);
        res.json({ success: true, message: `Family link created: **Kid** ${getRoleName(guild, kidId)} -> **Parent** ${getRoleName(guild, parentId)}` });
    } catch (e) {
        console.error('Error writing family-links.json for POST:', e);
        res.status(500).json({ success: false, error: 'Failed to save link.' });
    }
});

// DELETE /api/family/:guildId/:kidId - Delete a Family Link (uses Kid ID as the unique key)
app.delete('/api/family/:guildId/:kidId', async (req, res) => {
    const { guildId, kidId } = req.params; 

    const storageDir = getStoragePath('family', guildId);
    const filePath = path.join(storageDir, 'family-links.json');

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Family links file not found.' });
    }

    let links = {};
    try {
        links = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error("Error parsing family-links.json for DELETE:", e);
        return res.status(500).json({ success: false, error: 'Failed to read link file.' });
    }

    if (links[kidId]) {
        const parentId = links[kidId];
        delete links[kidId];
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(links, null, 2));
            const guild = await client.guilds.fetch(guildId);
            res.json({ success: true, message: `Family link deleted: **Kid** ${getRoleName(guild, kidId)} -> **Parent** ${getRoleName(guild, parentId)}` });
        } catch (e) {
            console.error('Error writing family-links.json for DELETE:', e);
            res.status(500).json({ success: false, error: 'Failed to delete link.' });
        }
    } else {
        res.status(404).json({ success: false, message: 'Family link (Kid ID) not found.' });
    }
});


client.login(process.env.DISCORD_TOKEN);


// --- Discord Command Handler (Kept at the end) ---

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing command ${interaction.commandName}:`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});


// --- Discord Ready Event (Kept at the end) ---

client.once('ready', async client => {
  loadPasswords(); // Load/reload passwords here
  console.log(`🎉 Bot is online as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guilds = client.guilds.cache.map(g => g.id);

  try {
    // This assumes your bot is only in one guild based on password.json structure
    for (const guildId of guilds) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commandsForRegistration }
      );
    }
    console.log(`✅ Registered slash commands for ${guilds.length} guilds.`);
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }

  app.listen(PORT, () => {
    console.log(`🧭 Dashboard running at http://localhost:${PORT}`);
    console.log('*** Dashboard is password-to-server protected. ***');
  });
});