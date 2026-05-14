require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { deployCommands } = require('../utils/core/commandDeployer');
const logger = require('../utils/core/logger');

async function run() {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    
    // Mock the necessary parts for deployCommands
    client.isTestBot = process.env.TEST_MODE === 'true';
    
    try {
        console.log('🚀 Manual Command Deployment Initiated...');
        await deployCommands(client);
        console.log('✅ Deployment Complete.');
    } catch (e) {
        console.error('❌ Deployment Failed:', e);
    } finally {
        process.exit(0);
    }
}

run();
