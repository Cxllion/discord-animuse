const { Client } = require('pg');
require('dotenv').config();

async function checkRoles() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        console.log('--- Categories ---');
        const resCats = await client.query('SELECT * FROM public.role_categories');
        console.table(resCats.rows);

        console.log('--- Colors (Basic) ---');
        const basicCat = resCats.rows.find(c => c.name === 'Colors (Basic)');
        if (basicCat) {
            const resBasic = await client.query('SELECT role_id FROM public.server_roles WHERE category_id = $1', [basicCat.id]);
            console.log(`Found ${resBasic.rowCount} roles in Colors (Basic)`);
        } else {
            console.log('Category "Colors (Basic)" not found.');
        }

        console.log('--- Colors (Premium) ---');
        const premiumCat = resCats.rows.find(c => c.name === 'Colors (Premium)');
        if (premiumCat) {
            const resPremium = await client.query('SELECT role_id FROM public.server_roles WHERE category_id = $1', [premiumCat.id]);
            console.log(`Found ${resPremium.rowCount} roles in Colors (Premium)`);
        } else {
            console.log('Category "Colors (Premium)" not found.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkRoles();
