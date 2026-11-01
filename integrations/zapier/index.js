// Zapier's CommonJS wrapper (zapier-platform-core include/zapierwrapper.js)
// always loads the app from ./index.js at the package root, and the CLI only
// bundles index.js when it exists. The TypeScript build is in dist/, so this
// file hands it over. Without it: "Cannot find module '/var/task/index.js'".
module.exports = require("./dist/index.js")
