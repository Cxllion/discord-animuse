require('dotenv').config();
const { COLOR_FAMILIES, BASIC_COLORS } = require('./utils/config/colorConfig');

async function scan() {
    console.log("--- Premium Color Scan ---");
    const premiumRoles = Object.values(COLOR_FAMILIES).flat();
    console.log(`Total Premium Roles: ${premiumRoles.length}`);

    premiumRoles.forEach((role, i) => {
        if (!role.name || !role.hex) {
            console.error(`[Error] Role at index ${i} is missing name or hex:`, role);
        }
        if (!/^#?[\da-f]{6}$/i.test(role.hex)) {
            console.error(`[Error] Role "${role.name}" has invalid hex: "${role.hex}"`);
        }
    });

    console.log("--- Family Check ---");
    for (const [family, roles] of Object.entries(COLOR_FAMILIES)) {
        console.log(`- ${family}: ${roles.length} roles`);
        if (roles.length !== 10) {
            console.warn(`[Warning] Family "${family}" does not have 10 roles (has ${roles.length})`);
        }
    }

    console.log("--- Sequence Check ---");
    const families = Object.keys(COLOR_FAMILIES);
    console.log("Order:", families.join(" -> "));
    
    const role30 = premiumRoles[29];
    const role31 = premiumRoles[30];
    console.log(`30th Role: ${role30.name} (${role30.hex})`);
    console.log(`31st Role: ${role31.name} (${role31.hex})`);
}

scan();
