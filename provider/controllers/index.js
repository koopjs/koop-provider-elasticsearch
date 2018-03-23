const pkg = require('../../package.json');
const ESModel = require('../models/esmodel');
const provider = {
    name: 'es',
    hosts: true,
    disableIdParam: false,
    Model: ESModel,
    status: {
        version: pkg.version
    },
    type: 'provider'
};

module.exports = provider;
