const { SlashCommandBuilder, EmbedBuilder, version, MessageFlags } = require('discord.js');
const os = require('os');
const supabase = require('../../utils/core/supabaseClient');
const { getGlobalTrackCount } = require('../../utils/services/animeTrackerService');
const { getGlobalBingoCount } = require('../../utils/services/bingoService');

/**
 * Formats seconds into a human-readable string (Days, Hours, Minutes, Seconds)
 * @param {number} seconds 
 * @returns {string}
 */
const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor(((seconds % 86400) % 3600) / 60);
    const s = Math.floor(((seconds % 86400) % 3600) % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('View the live heartrate and status of the library archives.'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // 1. Connection Latency
        const ping = interaction.client.ws.ping;
        const pingIcon = ping < 150 ? '🟢' : ping < 300 ? '🟡' : '🔴';

        // 2. Resource Usage
        const memory = process.memoryUsage();
        const heapUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
        const rss = (memory.rss / 1024 / 1024).toFixed(2);

        // 3. Database Health Check
        let dbStatus = '🟢 Operational';
        let dbLatency = 0;
        try {
            const start = Date.now();
            const { error } = await supabase.from('guild_configs').select('guild_id').limit(1);
            dbLatency = Date.now() - start;
            if (error) throw error;
        } catch (e) {
            dbStatus = '🔴 Unstable';
        }

        // 4. Shard Info
        const shardId = interaction.guild.shardId;
        const totalShards = interaction.client.options.shardCount || 1;

        // 5. Library Volume
        const trackedCount = await getGlobalTrackCount();
        const bingoCount = await getGlobalBingoCount();

        const embed = new EmbedBuilder()
            .setTitle('📖 Library Health Report')
            .setDescription(`Diagnostic overview for **AniMuse** ${interaction.client.isTestBot ? '(Test Lib)' : '(Global Lib)'}`)
            .addFields(
                { name: '📡 Connection', value: `${pingIcon} **${ping}ms** (WS)`, inline: true },
                { name: '💾 Memory', value: `💬 **${heapUsed}MB** / **${rss}MB** RSS`, inline: true },
                { name: '📚 Archives (DB)', value: `${dbStatus === '🟢 Operational' ? '🟢' : '🔴'} **${dbLatency}ms**`, inline: true },
                { name: '📦 Volume', value: `📈 **${trackedCount}** Tracks • **${bingoCount}** Cards`, inline: true },
                { name: '🕒 Uptime', value: `⏳ **${formatUptime(process.uptime())}**`, inline: true },
                { name: '⚙️ Platform', value: `📦 **v${require('../../package.json').version}** • Node **${process.version}**`, inline: true },
                { name: '💎 Cluster', value: `💠 Shard **${shardId}/${totalShards}**`, inline: true }
            )
            .setColor(dbStatus === '🟢 Operational' ? '#A78BFA' : '#FF6B6B')
            .setFooter({ text: '✦ Archives of AniMuse • Diagnostics Unit' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
