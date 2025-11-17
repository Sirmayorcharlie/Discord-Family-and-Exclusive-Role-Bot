require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');

const app = express();
const PORT = 3000;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

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


// --- HELPER FUNCTIONS ---

const getStoragePath = (type, guildId) => {
  const baseDir = path.join(__dirname, 'commands');
  const subDir = type === 'exclusive' ? 'Exclusive' : 'Family';
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

const getLinks = async (type, guildId) => {
    const dir = getStoragePath(type, guildId);
    if (!fs.existsSync(dir)) return [];

    const guild = await client.guilds.fetch(guildId);
    await guild.roles.fetch();

    return fs.readdirSync(dir).map(file => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath); 

        const id = file.replace('.txt', '');
        const target = fs.readFileSync(filePath, 'utf8').trim();

        const idInfo = getRoleInfo(guild, id);
        const targetInfo = getRoleInfo(guild, target);

        return {
            id,
            idName: idInfo.name,
            idColor: idInfo.color,
            idPosition: idInfo.position,
            target,
            targetName: targetInfo.name,
            targetColor: targetInfo.color,
            targetPosition: targetInfo.position,
            timestamp: stats.mtimeMs 
        };
    });
};

// --- API IMPLEMENTATIONS ---

// 1. API route to fetch a single Guild's name
app.get('/api/guild/:guildId', async (req, res) => {
    const { guildId } = req.params; 
    const guild = client.guilds.cache.get(guildId);
    
    if (guild) {
        res.json({ id: guild.id, name: guild.name });
    } else {
        res.status(404).json({ error: 'Guild not found or bot is not a member.' });
    }
});

// 2. API route to fetch all roles for a guild
app.get('/api/roles/:guildId', async (req, res) => {
    const { guildId } = req.params;

    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Guild not found.' });
        }

        await guild.roles.fetch();
        const roles = guild.roles.cache
            .filter(role => role.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(role => {
                const hexColor = role.color === 0 ? '#FFFFFF' : `#${role.color.toString(16).padStart(6, '0').toUpperCase()}`;
                return {
                    id: role.id,
                    name: role.name,
                    color: hexColor,
                    position: role.position
                };
            });

        res.json(roles);

    } catch (error) {
        console.error(`Error fetching roles for guild ${guildId}:`, error);
        res.status(500).json({ error: 'Failed to fetch roles.' });
    }
});

// 3. API route to fetch links
app.get('/api/:type/:guildId', async (req, res) => {
  const { type, guildId } = req.params;
  const links = await getLinks(type, guildId);
  res.json(links);
});

// 4. API route to delete a link
app.delete('/api/:type/:guildId/:id', (req, res) => {
  const { type, guildId, id } = req.params;
  const filePath = path.join(getStoragePath(type, guildId), `${id}.txt`);
  if (fs.existsSync(filePath)) {
    if (type === 'exclusive') {
        const linkedIds = fs.readFileSync(filePath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        const targetId = req.query.targetId; 
        
        if (!targetId) {
            fs.unlinkSync(filePath); 
        } else {
            const newLines = linkedIds.filter(tid => tid !== targetId);
            if (newLines.length > 0) {
                fs.writeFileSync(filePath, newLines.join('\n'));
            } else {
                fs.unlinkSync(filePath); 
            }
        }
    } else {
        fs.unlinkSync(filePath);
    }
    
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Link not found' });
  }
});

// 5. API route to create a Family link
app.post('/api/family/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const { kidId, parentId } = req.body;
  
  try {
    const guild = await client.guilds.fetch(guildId);
    const storageDir = getStoragePath('family', guildId);
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    const filePath = path.join(storageDir, `${kidId}.txt`);
    fs.writeFileSync(filePath, parentId);

    res.json({ success: true, message: `Family link created: Kid ${getRoleName(guild, kidId)} -> Parent ${getRoleName(guild, parentId)}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create family link.' });
  }
});

// 6. API route to create an Exclusive link
app.post('/api/exclusive/:guildId', async (req, res) => {
  const { guildId } = req.params;
  const { triggerId, removeId } = req.body;

  try {
    const guild = await client.guilds.fetch(guildId);
    const storageDir = getStoragePath('exclusive', guildId);
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    const filePath = path.join(storageDir, `${triggerId}.txt`);

    let lines = [];
    if (fs.existsSync(filePath)) {
      lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    }

    if (!lines.includes(removeId)) {
      lines.push(removeId);
      fs.writeFileSync(filePath, lines.join('\n'));
      res.json({ success: true, message: `Exclusive link created: IF ${getRoleName(guild, triggerId)} THEN REMOVE ${getRoleName(guild, removeId)}` });
    } else {
      res.status(409).json({ success: false, message: 'Link already exists. No changes made.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to create exclusive link.' });
  }
});

// --- DISCORD BOT LOGIC ---

// 🔁 Load commands
client.commands = new Collection();
const commandFolders = ['Family', 'Exclusive'];
const commandsForRegistration = [];

for (const folder of commandFolders) {
  const folderPath = path.join(__dirname, 'commands', folder);
  const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const commandPath = path.join(folderPath, file);
    try {
      const command = require(commandPath);
      const commandName = path.parse(file).name;
      if (command.data && command.execute) {
        command.data.name = commandName;
        client.commands.set(commandName, command);
        commandsForRegistration.push(command.data.toJSON());
      }
    } catch (err) {
      console.error(`❌ Failed to load command at ${commandPath}:`, err);
    }
  }
}

// 📦 Event loader
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.existsSync(eventsPath)
  ? fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'))
  : [];

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// 🤖 Bot ready
client.once('ready', async () => {
  loadPasswords(); // Load/reload passwords here
  console.log(`🎉 Bot is online as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guilds = client.guilds.cache.map(g => g.id);

  try {
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

// 🧠 Command handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing command ${interaction.commandName}:`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error executing that command.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error executing that command.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);