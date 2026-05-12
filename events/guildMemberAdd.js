const { Events, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const { generateWelcomeCard } = require('../utils/generators/welcomeGenerator');
const { generateLogEmbed } = require('../utils/generators/logEmbed');
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

        const botType = require('../utils/config').BOT_TYPE || 'main';

        // 2. Detect if member is a bot
        if (member.user.bot) {
            // BOT MEMBER - Auto-assign bot role
            if ((botType === 'core' || botType === 'test') && config.bot_role_id) {
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

        if (botType === 'main' || botType === 'test') {
            // --- STAGE 1: PUBLIC WELCOME (IMAGE) ---
            let welcomeMsg = null;
            if (config.welcome_channel_id) {
                const channel = guild.channels.cache.get(config.welcome_channel_id);
                if (channel && channel.isTextBased()) {
                    try {
                        // Generate Image
                        const buffer = await generateWelcomeCard(member);
                        const attachment = new AttachmentBuilder(buffer, { name: 'welcome-card.webp' });

                        const messageOptions = {
                            files: [attachment]
                        };

                        // Add Custom Welcome Message if configured
                        if (config.welcome_message) {
                            let formattedWelcomeMsg = config.welcome_message
                                .replace(/{user}/g, member.toString())
                                .replace(/{guild}/g, member.guild.name)
                                .replace(/{count}/g, member.guild.memberCount);
                            
                            // 🛡️ [Cyber Librarian] Prevent mass-mention exploits
                            formattedWelcomeMsg = formattedWelcomeMsg
                                .replace(/@everyone/g, '@\u200Beveryone')
                                .replace(/@here/g, '@\u200Bhere');
                            
                            messageOptions.content = formattedWelcomeMsg;
                        }

                        welcomeMsg = await channel.send(messageOptions);

                    } catch (error) {
                        logger.error(`Failed to send welcome card in ${guild.name}:`, error, 'Welcome');
                    }
                }
            }

            // --- STAGE 1.5: PUBLIC GREETING (TEXT) ---
            let greetingMsg = null;
            if (config.greeting_channel_id) {
                const channel = guild.channels.cache.get(config.greeting_channel_id);
                if (channel && channel.isTextBased()) {
                    const { welcomeMessages: defaultGreetings } = require('../utils/config/welcomeMessages');
                    let greetings = [...defaultGreetings];

                    // Use custom greetings if configured
                    if (config.greeting_messages && config.greeting_messages.length > 0) {
                        greetings = config.greeting_messages;
                    }

                    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)].replace(/{user}/g, member.toString());

                    try {
                        greetingMsg = await channel.send({ content: randomGreeting });
                    } catch (error) {
                        logger.error(`Failed to send greeting in ${guild.name}:`, error, 'Welcome');
                    }
                }
            }

            // --- STAGE 1.7: TRACKING (For Anti-Ghosting) ---
            if (config.welcome_antighost_enabled !== false && (welcomeMsg || greetingMsg)) {
                const { trackWelcome } = require('../utils/services/welcomeService');
                await trackWelcome(member.id, guild.id, {
                    welcome_msg_id: welcomeMsg?.id,
                    welcome_channel_id: welcomeMsg?.channel.id,
                    greeting_msg_id: greetingMsg?.id,
                    greeting_channel_id: greetingMsg?.channel.id
                });
            }

            // --- STAGE 2: USER BRIEFING (DM) ---
            if (config.welcome_dm_briefing !== false) {
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
            }
        }

        if (botType === 'core' || botType === 'test') {
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

            // --- STAGE 4: ARCHIVAL LOGGING (ARRIVAL) ---
            if (config.logs_channel_id) {
                const logChannel = guild.channels.cache.get(config.logs_channel_id);
                if (logChannel) {
                    const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
                    const embed = generateLogEmbed(
                        'Archivist Arrival',
                        `A new scholar, **${member.user.tag}**, has entered the archives.`,
                        'INFO',
                        { name: member.user.tag, iconURL: member.user.displayAvatarURL() }
                    )
                    .addFields(
                        { name: 'User ID', value: `\`${member.id}\``, inline: true },
                        { name: 'Account Age', value: `\`${accountAge} days\``, inline: true },
                        { name: 'Member Count', value: `\`${guild.memberCount}\``, inline: true }
                    );

                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }
    },
};
