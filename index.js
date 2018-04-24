var app = require('./app.js');
app.initialize();

// Include any extra routes
require('./provider/utils/serviceListRoute')(app.getExpress(), app.getAppConfig());