require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');

const app = express();
const PORT = 3000;
const GUILD_ID = process.env.GUILD_ID;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

client.commands = new Collection();
const commandFolders = ['Family', 'Exclusive'];
const commandsForRegistration = [];

// 🔁 Load commands
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
        console.log(`✅ Loaded command: ${commandName}`);
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

// 🧠 Dashboard helpers
const getStoragePath = (type, guildId) => {
  const baseDir = path.join(__dirname, 'commands');
  const subDir = type === 'exclusive' ? 'Exclusive' : 'Family';
  const storageFolder = `${type}storage`;
  return path.join(baseDir, subDir, storageFolder, guildId);
};

const getRoleName = (guild, roleId) => {
  const role = guild.roles.cache.get(roleId);
  return role ? role.name : `Unknown (${roleId})`;
};

const getLinks = async (type, guildId) => {
  const dir = getStoragePath(type, guildId);
  if (!fs.existsSync(dir)) return [];

  const guild = await client.guilds.fetch(guildId); // Ensure full guild object
  await guild.roles.fetch(); // Populate role cache

  return fs.readdirSync(dir).map(file => {
    const id = file.replace('.txt', '');
    const target = fs.readFileSync(path.join(dir, file), 'utf8').trim();
    return {
      id,
      idName: getRoleName(guild, id),
      target,
      targetName: getRoleName(guild, target)
    };
  });
};

// 🌐 Dashboard API
app.use(express.json());
app.use(express.static('public'));

// 1. NEW ROUTE: List all guilds bot is in (for server selector)
app.get('/api/guilds', (req, res) => {
    const guilds = client.guilds.cache.map(guild => ({
        id: guild.id,
        name: guild.name
    }));
    res.json(guilds);
});

// 2. Existing route to fetch single Guild name (for current view title)
app.get('/api/guild/:guildId', async (req, res) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId);
    
    if (guild) {
        res.json({ id: guild.id, name: guild.name });
    } else {
        res.status(404).json({ error: 'Guild not found or bot is not a member.' });
    }
});

app.get('/api/:type/:guildId', async (req, res) => {
  const { type, guildId } = req.params;
  const links = await getLinks(type, guildId);
  res.json(links);
});

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

// 🤖 Bot ready
client.once('ready', async () => {
  console.log(`🎉 Bot is online as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const guilds = client.guilds.cache.map(g => g.id);

  try {
    console.log('🔄 Registering slash commands...');
    for (const guildId of guilds) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: commandsForRegistration }
      );
      console.log(`✅ Registered commands for guild ${guildId}`);
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }

  for (const [guildId, guild] of client.guilds.cache) {
    const fileName = `${guild.name}-Key.txt`.replace(/[\\/:*?"<>|]/g, '_');
    const filePath = path.join(__dirname, fileName);

    const lines = guild.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => `${role.name} | ${role.id}`);

    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`🗝️ Help Key generated: ${fileName}`);
  }

  app.listen(PORT, () => {
    console.log(`🧭 Dashboard running at http://localhost:${PORT}`);
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