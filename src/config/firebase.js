// src/config/firebase.js
import fs from "fs";
import path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const keyPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./firebase-service-account.json");
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));

const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });

export const messaging = getMessaging(app);