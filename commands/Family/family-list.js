const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

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
    const storageDir = path.join(__dirname, 'Familystorage', guildId);

    if (!fs.existsSync(storageDir)) {
      return await interaction.reply({ content: '📭 No family links found.', ephemeral: true });
    }

    const files = fs.readdirSync(storageDir).filter(file => file.endsWith('.txt'));
    if (files.length === 0) {
      return await interaction.reply({ content: '📭 No family links found.', ephemeral: true });
    }

    // Build a map: parentId => [kidId, kidId, ...]
    const parentMap = new Map();

    for (const file of files) {
      const kidId = path.parse(file).name;
      const parentId = fs.readFileSync(path.join(storageDir, file), 'utf8').trim();

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

      output.push(`🧑‍🤝‍🧑 **${parentName}**\n${kidLines.join('\n')}`);
    }

    await interaction.reply({
      content: `📜 Family Role Links:\n\n${output.join('\n\n')}`,
      ephemeral: true
    });
  }
};