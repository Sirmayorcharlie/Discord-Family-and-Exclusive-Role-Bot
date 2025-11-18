const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Helper function to generate the storage path, ensuring consistency across all files
const getStoragePath = (type, guildId) => {
  const subDir = type.charAt(0).toUpperCase() + type.slice(1); // 'family' -> 'Family'
  const storageFolder = `${type}storage`; // 'family' -> 'familystorage'
  // NOTE: This path is relative to the bot's root directory.
  return path.join('./commands', subDir, storageFolder, guildId);
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('family-list')
    .setDescription('List all Parent roles and their linked Kid roles'),

  async execute(interaction) {

	if (!interaction.member.permissions.has('Administrator')) {
  	return await interaction.reply({
    	content: '🚫 You don’t have permission to use this command.',
    	ephemeral: true
  	});
	}

    const guild = interaction.guild;
    const guildId = guild.id;
    
    // 👇 Use consistent storage path logic
    const storageDir = getStoragePath('family', guildId);
    const filePath = path.join(storageDir, 'family-links.json');

    // Check for the single JSON file
    if (!fs.existsSync(filePath)) {
      return await interaction.reply({ content: '📭 No family links found.', ephemeral: true });
    }
    
    let links;
    try {
        // Read and parse the JSON file
        links = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return await interaction.reply({ content: '❌ Error reading family links file.', ephemeral: true });
    }

    if (Object.keys(links).length === 0) {
      return await interaction.reply({ content: '📭 No family links found.', ephemeral: true });
    }

    // Build a map: parentId => [kidId, kidId, ...]
    const parentMap = new Map();

    // Iterate over the JSON object entries
    for (const [kidId, parentId] of Object.entries(links)) {
      if (!parentMap.has(parentId)) {
        parentMap.set(parentId, []);
      }
      parentMap.get(parentId).push(kidId);
    }

    const output = [];

    for (const [parentId, kidIds] of parentMap.entries()) {
      const parentRole = guild.roles.cache.get(parentId);
      const parentName = parentRole ? parentRole.name : `Unknown (${parentId})`;

      const kidLines = kidIds.map(kidId => {
        const kidRole = guild.roles.cache.get(kidId);
        return `   👶 ${kidRole ? kidRole.name : `Unknown (${kidId})`}`;
      });

      output.push(`👑 **${parentName}** (Parent):\n${kidLines.join('\n')}`);
    }

    if (output.length === 0) {
      return await interaction.reply({ content: '📭 No family links found.', ephemeral: true });
    }

    const pages = [];
    let currentPage = '';

    for (const line of output) {
      // Basic check to not exceed Discord's message limit
      if ((currentPage + line).length > 2000) {
        pages.push(currentPage);
        currentPage = line;
      } else {
        currentPage += (currentPage ? '\n\n' : '') + line;
      }
    }
    pages.push(currentPage);

    // 👇 FIXED: Simplified reply logic to fix the TypeError
    for (let i = 0; i < pages.length; i++) {
      const messageOptions = {
        content: `--- Family Links (Page ${i + 1}/${pages.length}) ---\n\n${pages[i]}`,
        ephemeral: true,
        fetchReply: true
      };

      if (i === 0) {
        // Always use interaction.reply for the first message
        await interaction.reply(messageOptions);
      } else {
        // Always use interaction.followUp for subsequent messages
        await interaction.followUp(messageOptions);
      }
    }
  }
};