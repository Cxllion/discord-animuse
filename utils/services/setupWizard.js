// --- SERVER SETUP WIZARD ---

const { createLayer, addRoleToLayer } = require('../core/database');

// Role specifications
const MODERATION_ROLES = [
    {
        name: 'Head Librarian',
        color: '#9B59B6', // Purple
        permissions: ['Administrator'],
        hoist: true,
        description: 'Server owners and head administrators'
    },
    {
        name: 'Senior Librarian',
        color: '#3498DB', // Blue
        permissions: ['ManageGuild', 'ManageRoles', 'ManageChannels', 'KickMembers', 'BanMembers', 'ManageMessages'],
        hoist: true,
        description: 'Senior administrators'
    },
    {
        name: 'Librarian',
        color: '#2ECC71', // Green
        permissions: ['ManageMessages', 'KickMembers', 'ModerateMembers'],
        hoist: true,
        description: 'Moderators'
    },
    {
        name: 'Library Council',
        color: '#8E44AD', // Royal Purple
        permissions: ['ManageRoles', 'ManageChannels'],
        hoist: true,
        description: 'Special council role'
    }
];

const PREMIUM_ROLE = {
    name: 'Premium',
    color: '#F1C40F', // Gold
    permissions: [],
    hoist: false,
    description: 'Premium members'
};

/**
 * Setup Wizard: Creates all essential server roles
 */
const setupEssentialRoles = async (guild) => {
    const logger = require('../core/logger');
    const { PermissionFlagsBits } = require('discord.js');

    const createdRoles = {
        moderation: [],
        premium: null
    };

    try {
        // 1. Create moderation roles
        logger.info(`Creating ${MODERATION_ROLES.length} moderation roles...`, 'SetupWizard');

        for (const roleSpec of MODERATION_ROLES) {
            const permissions = roleSpec.permissions.map(p => PermissionFlagsBits[p]);

            const role = await guild.roles.create({
                name: roleSpec.name,
                color: roleSpec.color,
                permissions: permissions,
                hoist: roleSpec.hoist,
                reason: 'AniMuse Setup Wizard - Moderation Role'
            });

            createdRoles.moderation.push(role);
            logger.info(`✅ Created ${role.name}`, 'SetupWizard');
        }

        // 2. Create premium role
        logger.info('Creating premium role...', 'SetupWizard');

        const premiumRole = await guild.roles.create({
            name: PREMIUM_ROLE.name,
            color: PREMIUM_ROLE.color,
            permissions: [],
            hoist: PREMIUM_ROLE.hoist,
            reason: 'AniMuse Setup Wizard - Premium Role'
        });

        createdRoles.premium = premiumRole;
        logger.info(`✅ Created ${premiumRole.name}`, 'SetupWizard');

        // 3. Create layers and register roles
        logger.info('Creating layers and registering roles...', 'SetupWizard');

        // Create "Staff" layer for moderation
        const staffLayer = await createLayer(guild.id, 'Staff', 0);
        for (const role of createdRoles.moderation) {
            await addRoleToLayer(staffLayer.id, role.id, role.name);
        }

        // Create "Premium" layer
        const premiumLayer = await createLayer(guild.id, 'Premium', 1);
        await addRoleToLayer(premiumLayer.id, premiumRole.id, premiumRole.name);

        logger.info('✅ Layers created and roles registered', 'SetupWizard');

        return createdRoles;

    } catch (error) {
        logger.error('Setup wizard failed:', error, 'SetupWizard');
        throw error;
    }
};

module.exports = {
    setupEssentialRoles
};
