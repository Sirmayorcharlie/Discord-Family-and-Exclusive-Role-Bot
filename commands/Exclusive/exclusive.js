const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('exclusive')
    .setDescription('Define a logic gate: IF this role is added, THEN remove another')
    .addRoleOption(option =>
      option.setName('trigger').setDescription('The role that triggers removal').setRequired(true))
    .addRoleOption(option =>
      option.setName('remove').setDescription('The role to remove when trigger is added').setRequired(true)),

  async execute(interaction) {

	if (!interaction.member.permissions.has('Administrator')) {
  	return await interaction.reply({
    	content: '🚫 You don’t have permission to use this command.',
    	ephemeral: true
  	});
	}

    const guildId = interaction.guild.id;
    const trigger = interaction.options.getRole('trigger');
    const toRemove = interaction.options.getRole('remove');

    const storageDir = path.join(__dirname, 'Exclusivestorage', guildId);
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    const filePath = path.join(storageDir, `${trigger.id}.txt`);

    let lines = [];
    if (fs.existsSync(filePath)) {
      lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    }

    if (lines.includes(toRemove.id)) {
      return await interaction.reply({
        content: `⚠️ Logic gate already exists:\n**IF** ${trigger} **THEN REMOVE** ${toRemove}`,
        ephemeral: true
      });
    }

    lines.push(toRemove.id);
    fs.writeFileSync(filePath, lines.join('\n'));

    await interaction.reply(`✅ Logic gate added:\n**IF** ${trigger} **THEN REMOVE** ${toRemove}`);
  }
};