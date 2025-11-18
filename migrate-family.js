const fs = require('fs');
const path = require('path');

// *** YOUR GUILD ID FROM password.json ***
const GUILD_ID = '1195886093581680650'; 

const storageDir = path.join(__dirname, 'commands', 'Family', 'Familystorage', GUILD_ID);
const jsonPath = path.join(storageDir, 'family-links.json');
const newLinks = {};

if (!fs.existsSync(storageDir)) {
    console.error(`❌ Error: Storage directory not found at ${storageDir}. Please ensure the bot has created it at least once.`);
    process.exit(1);
}

try {
    const files = fs.readdirSync(storageDir).filter(file => file.endsWith('.txt'));
    
    if (files.length === 0) {
        console.log('✅ No existing .txt family links found. Migration skipped.');
    } else {
        console.log(`🔎 Found ${files.length} existing .txt family links. Migrating...`);

        for (const file of files) {
            const kidId = path.parse(file).name; // Kid ID is the filename
            const parentId = fs.readFileSync(path.join(storageDir, file), 'utf8').trim(); // Parent ID is the file content
            
            if (parentId) {
                newLinks[kidId] = parentId;
                fs.unlinkSync(path.join(storageDir, file)); // Delete the old .txt file
            }
        }
        
        fs.writeFileSync(jsonPath, JSON.stringify(newLinks, null, 2));
        console.log(`\n🎉 Migration Complete! ${Object.keys(newLinks).length} links saved to ${jsonPath}. Old .txt files removed.`);
    }

} catch (error) {
    console.error('❌ Migration failed:', error);
}