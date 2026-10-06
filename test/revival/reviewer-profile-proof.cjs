'use strict';
// Run the real native reviewer workflow with the production Local AppData profile resolver.
process.env.LT_REVIEWER_PROFILE_PROOF='1';
require('./reviewer-proof.cjs');
