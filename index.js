require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');

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
      .sort((a, b) => b.position - a.position) // sort by hierarchy
      .map(role => `${role.name} | ${role.id}`);

    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`🗝️ Help Key generated: ${fileName}`);
  }
});

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

client.login(process.env.DISCORD_TOKEN);