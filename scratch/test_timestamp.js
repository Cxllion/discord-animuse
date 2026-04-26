const offset = 5 * 3600000;
const now = new Date();
const nowGMT5 = new Date(now.getTime() + offset);

const nextResetGMT5 = new Date(nowGMT5);
nextResetGMT5.setUTCDate(nextResetGMT5.getUTCDate() + 1);
nextResetGMT5.setUTCHours(0, 0, 0, 0);

const nextResetUTC = new Date(nextResetGMT5.getTime() - offset);
const unix = Math.floor(nextResetUTC.getTime() / 1000);

console.log('Now (Local):', now.toISOString());
console.log('Now (GMT+5):', nowGMT5.toISOString());
console.log('Next Reset (GMT+5):', nextResetGMT5.toISOString());
console.log('Next Reset (UTC):', nextResetUTC.toISOString());
console.log('Unix:', unix);
console.log('Discord Countdown:', `<t:${unix}:R>`);
console.log('Discord Time:', `<t:${unix}:t>`);
