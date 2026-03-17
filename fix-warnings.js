const fs = require('fs');
const path = require('path');

const DIRS_TO_SCAN = ['commands', 'events', 'utils'];

const processFile = (filePath) => {
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    // Check if we need MessageFlags
    const needsFlags = content.includes('ephemeral: true') || content.includes('ephemeral: false');
    
    if (needsFlags) {
        // Ensure MessageFlags is imported from discord.js
        if (content.includes("require('discord.js')") && !content.includes('MessageFlags')) {
            content = content.replace(/(const\s+\{.*?)(\}\s*=\s*require\('discord\.js'\);)/s, (match, p1, p2) => {
                return p1.endsWith(', ') ? p1 + 'MessageFlags ' + p2 : p1 + ', MessageFlags ' + p2;
            });
            modified = true;
        }

        // Replace ephemeral: true
        if (content.includes('ephemeral: true')) {
            content = content.replace(/ephemeral:\s*true/g, 'flags: MessageFlags.Ephemeral');
            modified = true;
        }
        
        // Replace ephemeral: false
        if (content.includes('ephemeral: false')) {
            // Just remove it, or replace with empty
            content = content.replace(/,\s*ephemeral:\s*false/g, '');
            content = content.replace(/ephemeral:\s*false\s*,?/g, '');
            modified = true;
        }
    }

    if (content.includes('fetchReply: true')) {
        content = content.replace(/fetchReply:\s*true/g, 'withResponse: true');
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`Updated ${filePath}`);
    }
};

const scanDir = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath);
        } else if (fullPath.endsWith('.js')) {
            processFile(fullPath);
        }
    }
};

DIRS_TO_SCAN.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (fs.existsSync(fullPath)) scanDir(fullPath);
});
console.log('Done.');
