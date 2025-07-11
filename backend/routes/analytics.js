const express = require("express");
const Analytics = require("../models/analytics");

const router = express.Router();

// 1x1 transparent pixel/
const pixelBuffer = Buffer.from(
  "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64"
);

function parseClient(ua = "") {
  const lower = ua.toLowerCase();
  if (lower.includes("gmail")) return "Gmail";
  if (lower.includes("outlook")) return "Outlook";
  if (lower.includes("apple")) return "Apple Mail";
  if (lower.includes("yahoo")) return "Yahoo Mail";
  return "Unknown";
}

/**
 * Pixel‐tracker endpoint.
 * Expects URLs like:
 *   GET /pixel/ABC123.png?sect=quote&ts=2025-07-05T12:00:00Z
 */
// pixel tracker endpoint
router.get("/pixel/:key.png", async (req, res) => {
  const { key } = req.params;
  const { sect, ts, clientTime } = req.query;
  const userAgent = req.get("User-Agent") || "unknown";

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.connection.remoteAddress ||
    req.ip;

  // recording 1 event in the opens array
  await Analytics.findOneAndUpdate(
    { key },
    {
      $push: {
        opens: {
          time: new Date(),
          userAgent,
          emailClient: parseClient(userAgent),
          section: sect || null,
          clientTs: ts ? new Date(ts) : undefined,
          clientTime: clientTime ? new Date(clientTime) : undefined,
        },
      },
    },
    { upsert: true }
  );
  // return a no cache GIF
  res
    .set("Content-Type", "image/gif")
    .set("Cache-Control", "no-cache, no-store, must-revalidate")
    .send(pixelBuffer);
});

router.get("/stats/:key", async (req, res) => {
  const { key } = req.params;
  const doc = await Analytics.findOne({ key }).lean();
  if (!doc) return res.json({ openCount: 0, opens: [], userStats: [] });

  // grouping all pixel events by userAgent
  const groups = {};
  for (const ev of doc.opens || []) {
    const ua = ev.userAgent || "unknown";
    if (!groups[ua]) {
      groups[ua] = {
        userAgent: ua,
        emailClient: ev.emailClient,
        firstSeen: ev.time,
        lastSeen: ev.time,
      };
    } else {
      if (ev.time < groups[ua].firstSeen) groups[ua].firstSeen = ev.time;
      if (ev.time > groups[ua].lastSeen) groups[ua].lastSeen = ev.time;
    }
  }

  const userStats = Object.values(groups).map((g) => ({
    userAgent: g.userAgent,
    emailClient: g.emailClient,
    firstSeen: g.firstSeen,
    lastSeen: g.lastSeen,
    // difference in seconds
    secondsSpent: Math.round((g.lastSeen - g.firstSeen) / 1000),
  }));
  res.json({
    openCount: doc.openCount || 0,
    userStats,
  });

  // const opens = doc.opens || [];
  // const grouped = {};
  // for (const o of opens) {
  //   const id = o.userAgent || "unknown";
  //   if (!grouped[id]) {
  //     grouped[id] = {
  //       userAgent: o.userAgent,
  //       emailClient: o.emailClient,
  //       totalOpens: 0,
  //       totalSeconds: 0,
  //     };
  //   }
  //   grouped[id].totalOpens += 1;
  //   if (typeof o.secondsSpent === "number") {
  //     grouped[id].totalSeconds += o.secondsSpent;
  //   }
  // }
  // res.json({
  //   openCount: doc.openCount,
  //   opens,
  //   userStats: Object.values(grouped),
  // });
});

// router.get("/open/:key.png", async (req, res) => {
//   const { key } = req.params;
//   const userAgent = req.get("User-Agent") || "unknown";
//   const clientTime = req.query.clientTime
//     ? new Date(req.query.clientTime)
//     : undefined;
//   await Analytics.findOneAndUpdate(
//     { key },
//     {
//       $inc: { openCount: 1 },
//       $push: {
//         opens: {
//           time: new Date(),
//           userAgent,
//           emailClient: parseClient(userAgent),
//           clientTime,
//         },
//       },
//     },
//     { upsert: true }
//   );
//   res.set("Content-Type", "image/gif");
//   res.set("Cache-Control", "no-cache, no-store, must-revalidate");
//   res.send(pixelBuffer);
// });

// router.post("/time/:key", async (req, res) => {
//   const { key } = req.params;
//   const { secondsSpent, clientTime } = req.body || {};
//   const userAgent = req.headers["user-agent"] || "unknown";
//   await Analytics.findOneAndUpdate(
//     { key },
//     {
//       $push: {
//         opens: {
//           time: new Date(),
//           userAgent,
//           emailClient: parseClient(userAgent),
//           clientTime: clientTime ? new Date(clientTime) : undefined,
//           secondsSpent: Number(secondsSpent) || 0,
//           isPing: false,
//         },
//       },
//     },
//     { upsert: true }
//   );
//   res.sendStatus(204);
// });

// router.get("/ping/:key.png", async (req, res) => {
//   const { key } = req.params;
//   const userAgent = req.headers["user-agent"] || "unknown";
//   const clientTime = req.query.clientTime
//     ? new Date(req.query.clientTime)
//     : undefined;
//   await Analytics.findOneAndUpdate(
//     { key },
//     {
//       $push: {
//         opens: {
//           time: new Date(),
//           userAgent,
//           emailClient: parseClient(userAgent),
//           clientTime,
//           isPing: true,
//         },
//       },
//     },
//     { upsert: true }
//   );
//   res.set("Content-Type", "image/gif");
//   res.set("Cache-Control", "no-cache, no-store, must-revalidate");
//   res.send(pixelBuffer);
// });

module.exports = router;
