const fs = require('fs');
const path = require('path');

// Helper function to generate the storage path, ensuring correct casing from Main.js
const getStoragePath = (type, guildId) => {
  const subDir = type.charAt(0).toUpperCase() + type.slice(1); // 'family' -> 'Family'
  const storageFolder = `${type}storage`; // 'family' -> 'familystorage'
  
  // This constructs the consistent path: ./commands/Family/familystorage/{guildId}
  return path.join('./commands', subDir, storageFolder, guildId);
};


module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const guildId = newMember.guild.id;

    // === FAMILY LOGIC ===
    // FIX: Using the standardized function to ensure correct path/casing
    const familyDir = getStoragePath('family', guildId);
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
          const kidFiles = fs.readdirSync(familyDir);
          for (const file of kidFiles) {
            const kidRoleId = path.basename(file, '.txt');
            const parentRoleIds = fs.readFileSync(path.join(familyDir, file), 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
            if (parentRoleIds.includes(roleId) && newMember.roles.cache.has(kidRoleId)) {
              await newMember.roles.remove(kidRoleId, `Family logic: Parent ${roleId} removed, removing Kid ${kidRoleId}`);
            }
          }
        }
      }
    }

    // === EXCLUSIVE LOGIC ===
    // FIX: Using the standardized function to ensure correct path/casing
    const exclusiveDir = getStoragePath('exclusive', guildId);
    if (fs.existsSync(exclusiveDir)) {
      const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      for (const [roleId] of addedRoles) {
        const conflictPath = path.join(exclusiveDir, `${roleId}.txt`);
        if (fs.existsSync(conflictPath)) {
          const toRemoveIds = fs.readFileSync(conflictPath, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
          for (const removeId of toRemoveIds) {
            if (newMember.roles.cache.has(removeId)) {
              await newMember.roles.remove(removeId, `Exclusive logic: ${roleId} added, removing ${removeId}`);
            }
          }
        }
      }
    }
  }
};