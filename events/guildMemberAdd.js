const { Events, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const { generateWelcomeCard } = require('../utils/generators/welcomeGenerator');
const logger = require('../utils/core/logger');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        const guild = member.guild;

        // --- Test Bot Restriction ---
        // Skip welcome automated tasks for test bot to avoid duplicate welcomes
        if (member.client.isTestBot) return;

        // 1. Fetch Configuration

        const config = await fetchConfig(guild.id);
        if (!config) return;

        // 2. Detect if member is a bot
        if (member.user.bot) {
            // BOT MEMBER - Auto-assign bot role
            if (config.bot_role_id) {
                const roleId = config.bot_role_id;
                const role = guild.roles.cache.get(roleId);
                const botMember = guild.members.me;

                if (role && botMember.permissions.has(PermissionFlagsBits.ManageRoles) && role.position < botMember.roles.highest.position) {
                    try {
                        await member.roles.add(role);
                        logger.info(`Assigned Bot Role ${role.name} to ${member.user.tag}`, 'AutoRole');
                    } catch (error) {
                        logger.error(`Failed to assign bot role in ${guild.name}:`, error, 'AutoRole');
                    }
                } else {
                    if (!role) logger.warn(`Configured Bot Role ${roleId} not found in ${guild.name}.`, 'AutoRole');
                    else logger.warn(`Cannot assign bot role ${role.name}. Check hierarchy/permissions.`, 'AutoRole');
                }
            }
            return; // Don't send welcome messages to bots
        }

        // HUMAN MEMBER - Continue with welcome flow

        // --- STAGE 1: PUBLIC WELCOME (IMAGE) ---
        if (config.welcome_channel_id) {
            const channel = guild.channels.cache.get(config.welcome_channel_id);
            if (channel && channel.isTextBased()) {
                try {
                    // Generate Image
                    const buffer = await generateWelcomeCard(member);
                    const attachment = new AttachmentBuilder(buffer, { name: 'welcome-card.webp' });

                    await channel.send({
                        files: [attachment]
                    });

                } catch (error) {
                    logger.error(`Failed to send welcome card in ${guild.name}:`, error, 'Welcome');
                }
            }
        }

        // --- STAGE 1.5: PUBLIC GREETING (TEXT) ---
        if (config.greeting_channel_id) {
            const channel = guild.channels.cache.get(config.greeting_channel_id);
            if (channel && channel.isTextBased()) {
                const greetings = [
                    `📖 **A new scholar enters the archives.**\nWelcome to our collection, ${member}.`,
                    `✨ **The library doors open.**\nPlease make yourself comfortable, ${member}.`,
                    `📜 **Registration complete.**\nYour story begins here, ${member}.`,
                    `🔖 **Another volume added to the shelf.**\nWelcome to the community, ${member}.`,
                    `🖊️ **The ink is fresh.**\nGlad to have you with us, ${member}.`
                ];

                const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

                try {
                    await channel.send({ content: randomGreeting });
                } catch (error) {
                    logger.error(`Failed to send greeting in ${guild.name}:`, error, 'Welcome');
                }
            }
        }

        // --- STAGE 2: USER BRIEFING (DM) ---
        const baseEmbed = require('../utils/generators/baseEmbed');
        const briefingEmbed = baseEmbed('🔰 Welcome to AniMuse!', 
            `You've just joined **${guild.name}**. I am the Great Librarian, here to guide you through our collection.`, 
            null
        )
            .addFields(
                { name: '👋 Profile Card', value: 'Use `/profile` to view your archival signature. You can customize it with themes!', inline: true },
                { name: '🔎 Search Records', value: 'Use `/search` to find anime/manga details from the global database.', inline: true },
                { name: '📈 Muse Tiers', value: 'Engaging in the library earns you XP. Check `/rank` to see your progress.', inline: true }
            )
            .setColor('#A78BFA');

        try {
            await member.send({ embeds: [briefingEmbed] });
        } catch (error) {
            // User has DMs disabled, ignore silently
        }

        // --- STAGE 3: AUTO-ROLE ASSIGNMENT (HUMAN MEMBER ROLE) ---
        if (config.member_role_id) {
            const roleId = config.member_role_id;
            const role = guild.roles.cache.get(roleId);

            const botMember = guild.members.me;

            if (role && botMember.permissions.has(PermissionFlagsBits.ManageRoles) && role.position < botMember.roles.highest.position) {
                try {
                    await member.roles.add(role);
                    logger.info(`Assigned Member Role ${role.name} to ${member.user.tag}`, 'AutoRole');
                } catch (error) {
                    logger.error(`Failed to assign member role in ${guild.name}:`, error, 'AutoRole');
                }
            } else {
                if (!role) logger.warn(`Configured Member Role ${roleId} not found in ${guild.name}.`, 'AutoRole');
                else logger.warn(`Cannot assign role ${role.name}. Check hierarchy/permissions.`, 'AutoRole');
            }
        }
    },
};
