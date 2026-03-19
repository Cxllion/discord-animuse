const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { fetchConfig, getServerRoles, getLevelRoles, initializeDatabase, getRoleCategories } = require('./utils/core/database');
const fs = require('fs');
require('dotenv').config();

// Standardize Credentials
process.env.DISCORD_TOKEN = process.env.TEST_DISCORD_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) throw new Error('No guilds found.');
        
        const guildId = guild.id;
        let log = `[Debug] Checking guild: ${guild.name} (${guildId})\n`;

        const config = await fetchConfig(guildId);
        const serverRolesEnriched = await getServerRoles(guildId);
        const categories = await getRoleCategories(guildId);
        const roles = await guild.roles.fetch(undefined, { force: true });
        const botMember = await guild.members.fetchMe({ force: true });
        
        log += '--- SYSTEM CONFIG ---\n';
        log += `Member: ${config.member_role_id ? roles.get(config.member_role_id)?.name : 'N/A'}\n`;
        log += `Bot: ${config.bot_role_id ? roles.get(config.bot_role_id)?.name : 'N/A'}\n`;
        log += `Premium: ${config.premium_role_id ? roles.get(config.premium_role_id)?.name : 'N/A'}\n`;
        
        log += '\n--- CATEGORIES IN DB ---\n';
        categories.forEach(c => {
            const rcount = serverRolesEnriched.filter(sr => sr.category_id === c.id).length;
            log += `- [${c.id}] ${c.name} (${rcount} roles)\n`;
        });

        log += '\n--- HIERARCHY PREVIEW ---\n';
        const botMaxPos = botMember.roles.highest.position;
        const allRoles = Array.from(roles.values()).sort((a,b) => b.position - a.position);
        
        log += `Bot Highest Position: ${botMaxPos}\n`;
        
        allRoles.forEach((r, idx) => {
            const sr = serverRolesEnriched.find(sr => sr.role_id === r.id);
            const cat = sr?.category?.name || 'Unmanaged';
            const status = r.editable ? '[Can Edit]' : '[Protected]';
            log += `${idx+1}. ${status} [Pos ${r.position}] ${r.name} | Category: ${cat}\n`;
        });

        fs.writeFileSync('organize_log.txt', log);
        console.log('Log saved to organize_log.txt');

    } catch (e) {
        console.error('Debug Error:', e);
    } finally {
        client.destroy();
        process.exit();
    }
});

client.login(process.env.DISCORD_TOKEN);
