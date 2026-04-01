const supabase = require('../core/supabaseClient');
const { Collection } = require('discord.js');
const logger = require('../core/logger');

const cooldowns = new Collection();

/**
 * Calculates level based on XP.
 * Formula: Level = Floor(0.1 * Sqrt(XP))
 * @param {number} xp 
 * @returns {number} level
 */
const calculateLevel = (xp) => {
    return Math.floor(0.1 * Math.sqrt(xp));
};

/**
 * Calculates progress to next level.
 * @param {number} xp 
 * @param {number} level 
 * @returns {object} { current, next, percent }
 */
const getLevelProgress = (xp, level) => {
    const currentLevelBase = 100 * (level * level);
    const nextLevelBase = 100 * ((level + 1) * (level + 1));
    const required = nextLevelBase - currentLevelBase;
    const current = xp - currentLevelBase;

    return {
        current: Math.max(0, current),
        required: required,
        percent: Math.min(1, Math.max(0, current / required))
    };
};

/**
 * Adds XP to a user. Handles cooldowns and DB updates.
 * @param {string} userId 
 * @param {string} guildId 
 * @param {import('discord.js').GuildMember} [member=null]
 * @param {import('discord.js').Message} [message=null]
 */
const addXp = async (userId, guildId, member = null, message = null) => {
    if (!supabase) return;

    const key = `${guildId}-${userId}`;
    const now = Date.now();

    // Cooldown check (60 seconds)
    if (cooldowns.has(key)) {
        const expiration = cooldowns.get(key) + 60000;
        if (now < expiration) return;
    }

    // Set cooldown
    cooldowns.set(key, now);
    setTimeout(() => cooldowns.delete(key), 60000);

    // Random XP (15-25)
    const xpToAdd = Math.floor(Math.random() * (25 - 15 + 1)) + 15;

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('xp, level')
            .eq('user_id', userId)
            .eq('guild_id', guildId)
            .single();

        let newXp = xpToAdd;
        let oldLevel = 0;

        if (user) {
            newXp += user.xp;
            oldLevel = user.level;
        }

        const newLevel = calculateLevel(newXp);

        // Update DB
        const { error: upsertError } = await supabase
            .from('users')
            .upsert({
                user_id: userId,
                guild_id: guildId,
                xp: newXp,
                level: newLevel,
                last_message: new Date().toISOString()
            }, { onConflict: 'user_id, guild_id' });

        if (upsertError) {
            logger.error('XP Error - DB update failed:', upsertError, 'Leveling');
        } else if (newLevel > oldLevel) {
            const { getLevelRoles, fetchConfig } = require('../core/database');
            const [levelRoles, config] = await Promise.all([
                getLevelRoles(guildId),
                fetchConfig(guildId)
            ]);

            // --- Standard Level Up: Reaction ---
            if (message && config?.xp_level_up_emoji) {
                try {
                    // Try to react with the configured emoji
                    await message.react(config.xp_level_up_emoji).catch(() => null);
                } catch (e) {
                    // Fallback or ignore
                }
            }

            // --- Milestone Check & Role Assignment ---
            if (member) {
                // Find all roles the user should have based on new level
                const qualifyingRoles = levelRoles.filter(lr => lr.level <= newLevel);
                let newTierEarned = null;

                for (const lr of qualifyingRoles) {
                    if (!member.roles.cache.has(lr.role_id)) {
                        const role = member.guild.roles.cache.get(lr.role_id);
                        const botMember = member.guild.members.me;
                        
                        if (role && botMember.permissions.has('ManageRoles') && role.position < botMember.roles.highest.position) {
                            try {
                                const cleanName = role.name.replace(/^\d+\s*\|\s*/, '');
                                await member.roles.add(role);
                                logger.info(`Assigned Level ${lr.level} Role ${cleanName} to ${member.user.tag}`, 'Leveling');
                                if (lr.level === newLevel) newTierEarned = role;
                            } catch (e) {
                                logger.error(`Failed to assign level role ${lr.level} to ${member.user.tag}:`, e, 'Leveling');
                            }
                        }
                    }
                }

                // --- Milestone Announcement (Themed Embed in SAME channel) ---
                if (newTierEarned && message) {
                    const baseEmbed = require('../generators/baseEmbed');
                    const { getDynamicUserTitle } = require('../core/userMeta');
                    const title = await getDynamicUserTitle(member);
                    
                    const presets = [
                        { title: '✨ Muse Ascension', text: `${title} **${member.displayName}** has unlocked a new volume of influence.`, footer: 'The Archives resonate with your progress.' },
                        { title: '📖 Chapter Unlocked', text: `A new tier of the library has opened for ${title} **${member.displayName}**.`, footer: 'Your story is being written in golden ink.' },
                        { title: '🌟 Celestial Recognition', text: `The Muse tiers shift to accommodate ${title} **${member.displayName}**'s growth.`, footer: 'Premium records have been updated.' }
                    ];
                    
                    const preset = presets[Math.floor(Math.random() * presets.length)];

                    const tierName = newTierEarned.name.replace(/^\d+\s*\|\s*/, '');
                    const embed = baseEmbed(preset.title, `${preset.text}\n\n🎭 **New Muse Tier**: **${tierName}**\n📍 **Ascension Level**: **${newLevel}**`, null)
                        .setThumbnail(member.user.displayAvatarURL({ extension: 'png' }))
                        .setColor('#A78BFA');

                    await message.channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => null);
                }
            }
        }

    } catch (err) {
        logger.error('XP Error - Unexpected error:', err, 'Leveling');
    }
};

/**
 * Get user rank data.
 * @param {string} userId 
 * @param {string} guildId 
 */
const getUserRank = async (userId, guildId) => {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('users')
        .select('xp, level')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .single();

    if (error) {
        if (error.code !== 'PGRST116') logger.error('XP Error getUserRank: ' + error.message, null, 'Leveling');
        return { xp: 0, level: 0, rank: 0 };
    }
    if (!data) return { xp: 0, level: 0, rank: 0 };

    // Calculate Rank (Count users with more XP)
    const { count, error: rankError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('guild_id', guildId)
        .gt('xp', data.xp);

    const rank = (rankError) ? '?' : (count + 1);

    return { ...data, rank };
};

/**
 * Get top 10 users by XP.
 * @param {string} guildId 
 */
const getTopUsers = async (guildId) => {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('users')
        .select('user_id, xp, level')
        .eq('guild_id', guildId)
        .order('xp', { ascending: false })
        .limit(10);

    return data || [];
};

module.exports = {
    addXp,
    getUserRank,
    getLevelProgress,
    getTopUsers
};
