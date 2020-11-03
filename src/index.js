const pkg = require('../package.json');
const ESModel = require('./model');
const provider = {
    name: 'es',
    hosts: true,
    disableIdParam: false,
    Model: ESModel,
    status: {
        version: pkg.version
    },
    type: 'provider',
    version: pkg.version
};

module.exports = provider;
