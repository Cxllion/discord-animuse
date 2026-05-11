let client = null;

module.exports = {
    set: (c) => { client = c; },
    get: () => client
};
