const fs = require('fs');
const path = require('path');
const logger = require('../utils/core/logger');
const CONFIG = require('../utils/config');
const supabase = require('../utils/core/supabaseClient');
const anilist = require('../utils/services/anilistService');

/**
 * 📚 [Cyber-Librarian Auditor]
 * A dynamic diagnostic engine that ensures the library archives are production-ready.
 */

async function runAudit() {
    console.log('\n🏮 Starting Full System Audit... ♡\n');
    const results = {
        passed: 0,
        failed: 0,
        warnings: 0,
        errors: []
    };

    // --- 1. Environment & Config ---
    console.log('📋 [1/5] Validating Environment... ');
    if (CONFIG.DISCORD_TOKEN && CONFIG.DATABASE_URL && CONFIG.SUPABASE_URL) {
        console.log('   ✅ Core Environment Variables: SECURED');
        results.passed++;
    } else {
        results.failed++;
        results.errors.push('CRITICAL: Missing core environment variables in .env');
    }

    // --- 2. Service Probes ---
    console.log('\n📡 [2/5] Probing External Archives...');
    
    // Supabase Probe
    try {
        const { error } = await supabase.from('guild_configs').select('count', { count: 'exact', head: true });
        if (error) throw error;
        console.log('   ✅ Supabase Connection: STABLE');
        results.passed++;
    } catch (e) {
        console.log('   ❌ Supabase Connection: FAILED');
        results.errors.push(`DATABASE: ${e.message}`);
        results.failed++;
    }

    // AniList Probe
    try {
        const health = anilist.getAniListStatus();
        if (health.isCircuitBroken) {
            console.log('   🟡 AniList Status: CIRCUIT BROKEN (Cooling down)');
            results.warnings++;
        } else {
            console.log('   ✅ AniList Integration: ACTIVE');
            results.passed++;
        }
    } catch (e) {
        results.failed++;
    }

    // --- 3. Command Discovery & Validation ---
    console.log('\n📖 [3/5] Auditing Command Volumes (Deep Semantic Probe)...');
    const commandPath = path.join(__dirname, '../commands');
    const categories = fs.readdirSync(commandPath);
    const db = require('../utils/core/database');

    for (const category of categories) {
        const catPath = path.join(commandPath, category);
        if (!fs.statSync(catPath).isDirectory()) continue;

        const commandFiles = fs.readdirSync(catPath).filter(f => f.endsWith('.js'));
        for (const file of commandFiles) {
            try {
                const cmdPath = path.join(catPath, file);
                const cmd = require(cmdPath);
                
                // 2. Semantic Audit: Validate Imports & References
                const content = fs.readFileSync(cmdPath, 'utf8');
                
                // --- Deep Destructure Validation ---
                // Find all: const { a, b } = require('...')
                const requireMatches = content.matchAll(/const\s+\{([^}]+)\}\s+=\s+require\(['"]([^'"]+)['"]\)/g);
                for (const match of requireMatches) {
                    const importsStr = match[1];
                    const modulePath = match[2];
                    
                    // Handle both : and as aliasing
                    const imports = importsStr.split(',').map(s => {
                        const trimmed = s.trim();
                        if (trimmed.includes(':')) return trimmed.split(':')[0].trim(); // CommonJS aliasing
                        if (trimmed.includes(' as ')) return trimmed.split(' as ')[0].trim(); // ES6 aliasing
                        return trimmed;
                    });
                    
                    try {
                        // Resolve path relative to command file
                        const resolvedPath = path.resolve(path.dirname(cmdPath), modulePath);
                        const mod = require(resolvedPath);
                        for (const imp of imports) {
                            if (!imp || imp.startsWith('//')) continue;
                            if (mod[imp] === undefined) {
                                throw new Error(`Semantic Error: Imported property "${imp}" is undefined in ${modulePath}`);
                            }
                        }
                    } catch (e) {
                        if (e.message.includes('Semantic Error')) throw e;
                        // Skip if module can't be resolved (e.g. discord.js)
                    }
                }

                // --- Direct Access Validation ---
                const usedDbFunctions = content.match(/db\.[a-zA-Z0-9_]+/g) || [];
                for (const func of usedDbFunctions) {
                    const funcName = func.split('.')[1];
                    if (!db[funcName]) throw new Error(`Semantic Error: Reference to undefined DB function "${funcName}"`);
                }

                // --- Scope Validation ---
                const commonImports = ['getBulkUserTitles', 'getBulkUserAvatarConfig', 'getUserTitle', 'fetchConfig'];
                for (const f of commonImports) {
                    if (content.includes(f) && !content.includes(`const {`) && !content.includes(`const ${f}`) && !content.includes(`function ${f}`)) {
                        throw new Error(`Semantic Error: Potential missing import for "${f}"`);
                    }
                }
                
                const name = cmd.data.name || file;
                console.log(`   ✅ [${category}] ${name}: VALIDATED`);
                results.passed++;
            } catch (e) {
                console.log(`   ❌ [${category}] ${file}: CORRUPT`);
                results.errors.push(`COMMAND [${file}]: ${e.message}`);
                results.failed++;
            }
        }
    }

    // --- 4. Event Integrity ---
    console.log('\n🎭 [4/5] Auditing Runtime Events...');
    const eventPath = path.join(__dirname, '../events');
    const eventFiles = fs.readdirSync(eventPath).filter(f => f.endsWith('.js'));

    for (const file of eventFiles) {
        try {
            const event = require(path.join(eventPath, file));
            if (!event.name || !event.execute) {
                throw new Error('Event missing name or execute function.');
            }
            console.log(`   ✅ Event: ${event.name}: SECURED`);
            results.passed++;
        } catch (e) {
            console.log(`   ❌ Event: ${file}: BROKEN`);
            results.errors.push(`EVENT [${file}]: ${e.message}`);
            results.failed++;
        }
    }

    // --- 5. Asset Verification ---
    console.log('\n🎨 [5/5] Verifying Visual Assets...');
    const fontPath = path.join(__dirname, '../assets/fonts');
    if (fs.existsSync(fontPath)) {
        const fonts = fs.readdirSync(fontPath);
        console.log(`   ✅ ${fonts.length} Typography assets verified.`);
        results.passed++;
    } else {
        console.log('   🟡 Asset folder missing (Skipping visual audit).');
        results.warnings++;
    }

    // --- FINAL REPORT ---
    console.log('\n' + '─'.repeat(40));
    console.log(`🏮 SYSTEM AUDIT COMPLETE`);
    console.log(`   PASSED:   ${results.passed}`);
    console.log(`   WARNINGS: ${results.warnings}`);
    console.log(`   FAILED:   ${results.failed}`);
    console.log('─'.repeat(40));

    if (results.failed > 0) {
        console.log('\n🔴 CRITICAL FLAWS DETECTED:');
        results.errors.forEach(err => console.log(`   - ${err}`));
        process.exit(1);
    } else {
        console.log('\n✨ All systems are within acceptable archival parameters. ♡\n');
        process.exit(0);
    }
}

runAudit();
