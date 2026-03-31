const { Client, GatewayIntentBits, logger } = require('discord.js');
require('dotenv').config();
const http = require('http');
const net = require('net');

// 1. Diagnostics First
console.log('--- Render Stability Probe Started ---');
console.log(`Node Version: ${process.version}`);
console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);

// 2. Immediate Health Server
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('PROBE_ACTIVE');
}).listen(port, '0.0.0.0', () => {
    console.log(`Health server active on port ${port}`);
});

// 3. Network Probe (Raw TCP check to Discord Gateway)
const probeDiscord = () => {
    return new Promise((resolve) => {
        console.log('Probing Discord Gateway (TCP 443)...');
        const socket = net.createConnection(443, 'gateway.discord.gg', () => {
            console.log('✅ TCP Connection to Discord: SUCCESS');
            socket.destroy();
            resolve(true);
        });

        socket.on('error', (err) => {
            console.log(`❌ TCP Connection to Discord: FAILED (${err.message})`);
            resolve(false);
        });

        socket.setTimeout(10000, () => {
            console.log('❌ TCP Connection to Discord: TIMEOUT (10s)');
            socket.destroy();
            resolve(false);
        });
    });
};

// 4. Skeleton Boot
(async () => {
    const networkOk = await probeDiscord();
    if (!networkOk) {
        console.log('⚠️ Network check failed. Gateway may be blocked by platform firewall.');
    }

    const token = process.env.DISCORD_TOKEN || "";
    console.log(`Token Check: Length=${token.length}, Prefix=${token.substring(0, 4)}***`);

    if (token.length < 50) {
        console.log('❌ CRITICAL: Token looks too short or missing!');
        return;
    }

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    
    client.once('ready', () => {
        console.log(`🚀 Ready! Logged in as ${client.user.tag}`);
    });

    client.on('debug', info => {
        if (info.includes('WebSocket') || info.includes('heartbeat')) {
            console.log(`[GW-DEBUG] ${info}`);
        }
    });

    try {
        console.log('Initiating Login...');
        await client.login(token);
    } catch (err) {
        console.log(`❌ Login Error: ${err.message}`);
    }
})();

// Keep-alive Pulse
setInterval(() => {
    console.log(`Still alive... (Uptime: ${Math.floor(process.uptime())}s)`);
}, 30000);
