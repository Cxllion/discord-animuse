const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const toastGenerator = require('./utils/generators/toastGenerator');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    try {
        console.log('Bot logged in as', client.user.tag);
        const toastBuffer = await toastGenerator.generateSuccessSlip({
            user: { username: 'Cxllion', avatarURL: null },
            pointsEarned: 10,
            streakBonus: 2,
            totalPoints: 100,
            streak: 1,
            gameName: 'Wordle',
            attempts: 1,
            extraLine: 'A test definition'
        });
        
        console.log('Toast generated successfully. Buffer size:', toastBuffer.length);
        console.log('AttachmentBuilder instantiated.');
        
        // We won't actually send it to Discord to avoid spamming the user's real server
        // but we verify the Buffer and AttachmentBuilder creation works without throwing errors.
        const attachment = new AttachmentBuilder(toastBuffer, { name: 'success-slip-public.webp' });
        console.log('AttachmentBuilder success!', attachment.name);
        
    } catch (e) {
        console.error('Error:', e);
    }
    client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
