const supabase = require('./utils/core/supabaseClient');

async function checkDuplicates() {
    console.log('Checking for duplicates in minigame_scores...');
    const { data: allRows, error } = await supabase.from('minigame_scores').select('user_id, total_points, id');
    
    if (error) {
        console.error('Error fetching rows:', error);
        return;
    }

    const counts = {};
    allRows.forEach(r => {
        counts[r.user_id] = (counts[r.user_id] || 0) + 1;
    });

    const dups = Object.entries(counts).filter(([id, count]) => count > 1);
    if (dups.length > 0) {
        console.log('Found duplicates for users:', dups.map(d => d[0]));
        for (const [userId, count] of dups) {
            const userRows = allRows.filter(r => r.user_id === userId).sort((a, b) => b.total_points - a.total_points);
            const keepId = userRows[0].id;
            const deleteIds = userRows.slice(1).map(r => r.id);
            console.log(`User ${userId}: Keeping ID ${keepId} (${userRows[0].total_points} pts), deleting ${deleteIds.length} rows.`);
            await supabase.from('minigame_scores').delete().in('id', deleteIds);
        }
        console.log('Cleanup complete.');
    } else {
        console.log('No duplicates found.');
    }
}

checkDuplicates().then(() => process.exit());
