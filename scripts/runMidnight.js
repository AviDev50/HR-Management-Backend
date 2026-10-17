import "dotenv/config";
import { midnightJob } from "../src/cron/attendanceCron.js";

await midnightJob();
process.exit(0);