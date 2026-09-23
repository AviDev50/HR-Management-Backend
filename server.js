// MUST be the very first import. ES module imports are hoisted and
// evaluated before any other top-level code, so a later `dotenv.config()`
// call would run AFTER app.js (and its whole import chain, e.g. jwt.js
// reading process.env.JWT_SECRET at module load) has already evaluated.
import "dotenv/config";

import app from "./app.js";

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});