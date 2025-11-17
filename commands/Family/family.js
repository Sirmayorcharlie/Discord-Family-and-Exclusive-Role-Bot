const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

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

    const storageDir = path.join(__dirname, 'Familystorage', guildId);
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    const filePath = path.join(storageDir, `${kidRole.id}.txt`);
    fs.writeFileSync(filePath, parentRole.id);

    await interaction.reply(`✅ Linked **${kidRole.name}** to parent role: **${parentRole.name}**`);
  }
};