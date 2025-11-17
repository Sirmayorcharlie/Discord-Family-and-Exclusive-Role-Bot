const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const guildId = newMember.guild.id;

    // Define consistent paths using path.join to ensure correct resolution
    const familyDir = path.join(__dirname, '..', 'commands', 'Family', 'Familystorage', guildId);
    const exclusiveDir = path.join(__dirname, '..', 'commands', 'Exclusive', 'Exclusivestorage', guildId);

    // === FAMILY LOGIC ===
    if (fs.existsSync(familyDir)) {
      const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

      for (const [roleId] of addedRoles) {
        const kidPath = path.join(familyDir, `${roleId}.txt`);
        if (fs.existsSync(kidPath)) {
          const parentRoleIds = fs.readFileSync(kidPath, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
          for (const parentRoleId of parentRoleIds) {
            if (!newMember.roles.cache.has(parentRoleId)) {
              await newMember.roles.add(parentRoleId, `Family logic: Kid ${roleId} added, adding Parent ${parentRoleId}`);
            }
          }
        }
      }

      for (const [roleId] of removedRoles) {
        const kidPath = path.join(familyDir, `${roleId}.txt`);
        if (fs.existsSync(kidPath)) {
          const parentRoleIds = fs.readFileSync(kidPath, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
          for (const parentRoleId of parentRoleIds) {
            if (newMember.roles.cache.has(parentRoleId)) {
              await newMember.roles.remove(parentRoleId, `Family logic: Kid ${roleId} removed, removing Parent ${parentRoleId}`);
            }
          }
        } else {
          // Check if the removed role was a Parent role
          const kidFiles = fs.readdirSync(familyDir);
          for (const file of kidFiles) {
            const kidRoleId = path.basename(file, '.txt');
            const parentRoleIds = fs.readFileSync(path.join(familyDir, file), 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
            
            // Check if the removed roleId is listed as a Parent and the Kid role is still present
            if (parentRoleIds.includes(roleId) && newMember.roles.cache.has(kidRoleId)) {
              await newMember.roles.remove(kidRoleId, `Family logic: Parent ${roleId} removed, removing Kid ${kidRoleId}`);
            }
          }
        }
      }
    }

    // === EXCLUSIVE LOGIC ===
    if (fs.existsSync(exclusiveDir)) {
      const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      for (const [roleId] of addedRoles) {
        const conflictPath = path.join(exclusiveDir, `${roleId}.txt`);
        if (fs.existsSync(conflictPath)) {
          const toRemoveIds = fs.readFileSync(conflictPath, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
          for (const removeId of toRemoveIds) {
            if (newMember.roles.cache.has(removeId)) {
              await newMember.roles.remove(removeId, `Exclusive logic: Trigger ${roleId} added, removing conflict ${removeId}`);
            }
          }
        }
      }
    }
  }
};