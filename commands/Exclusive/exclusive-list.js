const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('exclusive-list')
    .setDescription('List all exclusive logic gates'),

  async execute(interaction) {

	if (!interaction.member.permissions.has('Administrator')) {
  	return await interaction.reply({
    	content: '🚫 You don’t have permission to use this command.',
    	ephemeral: true
  	});
	}

    const guild = interaction.guild;
    const guildId = guild.id;
    const storageDir = path.join(__dirname, 'Exclusivestorage', guildId);

    if (!fs.existsSync(storageDir)) {
      return await interaction.reply({ content: '📭 No exclusive gates found.', ephemeral: true });
    }

    const files = fs.readdirSync(storageDir).filter(file => file.endsWith('.txt'));
    if (files.length === 0) {
      return await interaction.reply({ content: '📭 No exclusive gates found.', ephemeral: true });
    }

    const output = [];

    for (const file of files) {
      const triggerId = path.parse(file).name;
      const triggerRole = guild.roles.cache.get(triggerId);
      const triggerName = triggerRole ? triggerRole.name : `Unknown (${triggerId})`;

      const linkedIds = fs.readFileSync(path.join(storageDir, file), 'utf8')
        .split('\n')
        .map(id => id.trim())
        .filter(Boolean);

      const linkedNames = linkedIds.map(id => {
        const role = guild.roles.cache.get(id);
        return `   ❌ ${role ? role.name : `Unknown (${id})`}`;
      });

      output.push(`🎯 **${triggerName}**\n${linkedNames.join('\n')}`);
    }

    await interaction.reply({
      content: `📜 Exclusive Logic Gates:\n\n${output.join('\n\n')}`,
      ephemeral: true
    });
  }
};