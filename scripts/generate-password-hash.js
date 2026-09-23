// Run: node scripts/generate-password-hash.js "your-plain-password"
import bcrypt from "bcryptjs";

const plainPassword = process.argv[2];

if (!plainPassword) {
  console.error("Usage: node scripts/generate-password-hash.js <plain-password>");
  process.exit(1);
}

const hash = await bcrypt.hash(plainPassword, 10);
console.log(hash);