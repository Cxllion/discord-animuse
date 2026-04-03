const { SlashCommandBuilder } = require('discord.js');
const os = require('os');
const baseEmbed = require('../../utils/generators/baseEmbed');

module.exports = {
    category: 'general',
    dbRequired: false,
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('📊 View bot statistics and information'),
    dbRequired: false,
    cooldown: 10,
    botPermissions: ['SendMessages', 'EmbedLinks'],

    async execute(interaction) {
        const client = interaction.client;

        // Calculate uptime
        const uptime = client.uptime;
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        const uptimeString = `${days}d ${hours}h ${minutes}m`;

        // Get stats
        const totalServers = client.guilds.cache.size;
        const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const totalChannels = client.channels.cache.size;
        const totalCommands = client.commands.size;

        // Memory usage
        const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

        // Ping
        const ping = client.ws.ping;

        // Version (you can update this manually or use package.json)
        const version = '2.0.0';

        const embed = baseEmbed('AniMuse Bot Information', '📖 Library statistics and technical information', client.user.displayAvatarURL())
            .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
            .addFields(
                {
                    name: '📊 Statistics',
                    value:
                        `> **Servers**: ${totalServers.toLocaleString()}\n` +
                        `> **Users**: ${totalUsers.toLocaleString()}\n` +
                        `> **Channels**: ${totalChannels.toLocaleString()}\n` +
                        `> **Commands**: ${totalCommands}`,
                    inline: true
                },
                {
                    name: '⚡ Performance',
                    value:
                        `> **Uptime**: ${uptimeString}\n` +
                        `> **Ping**: ${ping}ms\n` +
                        `> **Memory**: ${memoryUsage} MB\n` +
                        `> **Version**: v${version}`,
                    inline: true
                },
                {
                    name: '🛠️ Technical',
                    value:
                        `> **Node.js**: ${process.version}\n` +
                        `> **Discord.js**: v14.16.3\n` +
                        `> **Platform**: ${os.platform()}\n` +
                        `> **CPU**: ${os.cpus()[0].model.split(' ')[0]}`,
                    inline: false
                },
                {
                    name: '🔗 Links',
                    value:
                        '• [Invite Bot](https://discord.com/api/oauth2/authorize?client_id=' + client.user.id + '&permissions=8&scope=bot%20applications.commands)\n' +
                        '• [Support Server](https://discord.gg/your-support-server)\n' +
                        '• [GitHub](https://github.com/Cxllion/discord-animuse)',
                    inline: false
                }
            );

        await interaction.reply({ embeds: [embed] });
    }
};
