const supabase = require('./utils/core/supabaseClient');

async function checkWordleSessions() {
    console.log('--- Wordle Sessions Columns ---');
    const { error } = await supabase.from('wordle_sessions').insert({ user_id: 'test_probe', target_word: 'HELLO', guesses: [], status: 'PLAYING' });
    if (error) {
        console.error('Error:', error.message);
    } else {
        const { data } = await supabase.from('wordle_sessions').select('*').eq('user_id', 'test_probe').single();
        console.log('Columns:', Object.keys(data));
        console.log('Guesses type:', typeof data.guesses);
        await supabase.from('wordle_sessions').delete().eq('user_id', 'test_probe');
    }
}

checkWordleSessions().then(() => process.exit());
