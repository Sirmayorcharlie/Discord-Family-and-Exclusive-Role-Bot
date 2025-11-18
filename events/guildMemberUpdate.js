const fs = require('fs');
const path = require('path');

// Helper function to generate the storage path, ensuring correct casing and project root relative path
const getStoragePath = (type, guildId) => {
  const subDir = type.charAt(0).toUpperCase() + type.slice(1); // 'family' -> 'Family'
  const storageFolder = `${type}storage`; // 'family' -> 'familystorage'
  return path.join('./commands', subDir, storageFolder, guildId);
};

// Function to read and parse the family links JSON file
const loadFamilyLinks = (guildId) => {
    const familyDir = getStoragePath('family', guildId);
    const filePath = path.join(familyDir, 'family-links.json');
    
    // Start logging to see when file read happens
    console.log(`[Family Logic] Checking file ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
        console.log('[Family Logic] No links file found.');
        return null;
    }
    
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data); // Returns { "kidId": "parentId", ... }
    } catch (e) {
        console.error(`❌ Error reading or parsing family-links.json for guild ${guildId}:`, e);
        return null;
    }
};


module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    if (oldMember.pending && !newMember.pending) {
        // Ignore update from when a member finishes Discord's required membership screening
        return;
    }

    const guildId = newMember.guild.id;
    // Load links once at the start
    const links = loadFamilyLinks(guildId); // { kidId: parentId, ... }
    
    // Ensure we have links to process
    if (!links || Object.keys(links).length === 0) return; 

    // Find roles that were added or removed
    const addedRoleIds = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id)).map(role => role.id);
    const removedRoleIds = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id)).map(role => role.id);

    // --- FAMILY LOGIC ---
    
    // 1. Handle Added/Removed KID Roles (Kid role is the key in the links map)
    for (const [kidId, parentId] of Object.entries(links)) {
        
        // --- Kid Role ADDED ---
        if (addedRoleIds.includes(kidId)) {
            if (!newMember.roles.cache.has(parentId)) {
                try {
                    await newMember.roles.add(parentId, `Family logic: Kid ${kidId} added, adding Parent ${parentId}`);
                    console.log(`✅ Family logic: Added Parent Role ${parentId} to ${newMember.user.tag}`);
                } catch (e) {
                    console.error(`❌ FAILED to add Parent role ${parentId} to ${newMember.user.tag}. Check bot hierarchy and permissions!`, e.message);
                }
            }
        }

        // --- Kid Role REMOVED ---
        if (removedRoleIds.includes(kidId)) {
            if (newMember.roles.cache.has(parentId)) {
                // Only remove the Parent role if the member still doesn't have ANY other linked Kid roles
                const stillHasKid = Object.keys(links).some(otherKidId => 
                    links[otherKidId] === parentId && newMember.roles.cache.has(otherKidId) && otherKidId !== kidId
                );
                
                if (!stillHasKid) {
                    try {
                        await newMember.roles.remove(parentId, `Family logic: Kid ${kidId} removed, removing Parent ${parentId}`);
                        console.log(`✅ Family logic: Removed Parent Role ${parentId} from ${newMember.user.tag}`);
                    } catch (e) {
                        console.error(`❌ FAILED to remove Parent role ${parentId} from ${newMember.user.tag}. Check bot hierarchy and permissions!`, e.message);
                    }
                }
            }
        }
    }
    
    // 2. Handle Removed PARENT Roles (The "Flipped" case fix)
    // If a parent role is manually removed, we should remove the kid role(s) that require it.
    for (const removedId of removedRoleIds) {
        // Iterate through all links to see if the removed role is a Parent role (the value)
        for (const [kidId, parentId] of Object.entries(links)) {
            if (removedId === parentId && newMember.roles.cache.has(kidId)) {
                // If the removed role is the required parent, and the member still has the kid role
                try {
                    await newMember.roles.remove(kidId, `Family logic: Parent ${parentId} removed, removing Kid ${kidId}`);
                    console.log(`✅ Family logic: Removed Kid Role ${kidId} from ${newMember.user.tag} because Parent was removed.`);
                } catch (e) {
                    console.error(`❌ FAILED to remove Kid role ${kidId} from ${newMember.user.tag}. Check bot hierarchy and permissions!`, e.message);
                }
            }
        }
    }


    // === EXCLUSIVE LOGIC (Kept in its original .txt file format) ===
    const exclusiveDir = getStoragePath('exclusive', guildId);
    if (fs.existsSync(exclusiveDir)) {
      
      for (const addedId of addedRoleIds) {
        const conflictPath = path.join(exclusiveDir, `${addedId}.txt`); // Trigger ID is the filename
        
        if (fs.existsSync(conflictPath)) {
          const toRemoveIds = fs.readFileSync(conflictPath, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
          
          for (const removeId of toRemoveIds) {
            if (newMember.roles.cache.has(removeId)) {
              try {
                  await newMember.roles.remove(removeId, `Exclusive logic: Trigger ${addedId} added, removing conflicting role ${removeId}`);
                  console.log(`✅ Exclusive logic: Removed conflicting Role ${removeId} from ${newMember.user.tag}`);
              } catch (e) {
                  console.error(`❌ FAILED to remove exclusive role ${removeId} from ${newMember.user.tag}. Check bot hierarchy and permissions!`, e.message);
              }
            }
          }
        }
      }
    }
  }
};