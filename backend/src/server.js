import "dotenv/config";
import { createApp } from "./app.js";
import { initializeDatabase } from "./database.js";
import { attachMeetingSignaling } from "./meeting-signaling.js";
import { dispatchEmailNotifications } from "./email-notifications.js";

const database = initializeDatabase();
const app = createApp(database);
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "3000", 10);
const server = app.listen(port, host, () => {
  console.log(`SkillSwap API listening at http://${host}:${port}`);
});
const meetingSignaling = attachMeetingSignaling(server, database);
const emailTimer = setInterval(() => { void dispatchEmailNotifications(database); }, 60_000);
emailTimer.unref();
server.once("listening", () => { void dispatchEmailNotifications(database); });

function shutdown() {
  clearInterval(emailTimer);
  meetingSignaling.close().then(() => server.close(() => { database.close(); process.exit(0); }));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
