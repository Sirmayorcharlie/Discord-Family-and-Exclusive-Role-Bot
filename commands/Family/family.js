const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Helper function to generate the storage path, ensuring consistency across all files
const getStoragePath = (type, guildId) => {
  const subDir = type.charAt(0).toUpperCase() + type.slice(1); // 'family' -> 'Family'
  const storageFolder = `${type}storage`; // 'family' -> 'familystorage'
  // NOTE: This path is relative to the bot's root directory.
  // Using path.join(__dirname, '..', '..', '..', 'commands', ...) is safer, but
  // for now, let's stick to the root-relative path if Main.js is in the root.
  return path.join('./commands', subDir, storageFolder, guildId);
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('family')
    .setDescription('Link one Kid role to one Parent role')
    .addRoleOption(option =>
      option.setName('kid').setDescription('The Kid role').setRequired(true))
    .addRoleOption(option =>
      option.setName('parent').setDescription('The Parent role').setRequired(true)),

  async execute(interaction) {

	if (!interaction.member.permissions.has('Administrator')) {
  	return await interaction.reply({
    	content: '🚫 You don’t have permission to use this command.',
    	ephemeral: true
  	});
	}

    const guildId = interaction.guild.id;
    const kidRole = interaction.options.getRole('kid');
    const parentRole = interaction.options.getRole('parent');

    // 👇 FIX: Use consistent storage path logic
    const storageDir = getStoragePath('family', guildId);
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    // --- NEW JSON Logic ---
    const filePath = path.join(storageDir, `family-links.json`);
    
    let links = {};
    if (fs.existsSync(filePath)) {
        try {
            // Read and parse the existing JSON file
            links = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error("Error parsing family-links.json:", e);
        }
    }

    links[kidRole.id] = parentRole.id; 

    try {
        fs.writeFileSync(filePath, JSON.stringify(links, null, 2));
    } catch (e) {
        console.error("Error writing family-links.json:", e);
        // Return a better error message to the user
        return await interaction.reply({ content: `❌ Error saving the family link due to a file system issue. Check console for details.`, ephemeral: true });
    }

    await interaction.reply(`✅ Linked **${kidRole.name}** to parent role: **${parentRole.name}**`);
  }
};