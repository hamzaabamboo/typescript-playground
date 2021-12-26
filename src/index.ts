import axios from "axios";
import express from "express";
// @ts-ignore
import m3u from "m3ujs";
import dotenv from "dotenv";
import config from "../config.json";
import { JSDOM, VirtualConsole } from "jsdom";

process.env.TZ = "Asia/Bangkok";

dotenv.config();

const sleep = (s: number) => new Promise((r) => setTimeout(r, s));

const HOST = process.env["host"] ?? `http://localhost:420`;
const COOKIE = config?.cookie ?? process.env["cookie"] ?? "";
const csrftoken = config?.csrf ?? process.env["csrf"] ?? "";

const getChannels = async () => {
  const URL =
    "https://japantvmiru.com/live/%E3%82%B0%E3%83%AA%E3%83%BC%E3%83%B3%E3%83%81%E3%83%A3%E3%83%B3%E3%83%8D%E3%83%AB-41.html";
  const res = await axios.get(URL, {
    headers: {
      cookie: COOKIE,
      "X-CSRF-TOKEN": csrftoken,
    },
  });
  const a = new VirtualConsole();
  const dom = new JSDOM(res.data, { virtualConsole: a });
  const c = dom.window.document.querySelectorAll("[id^='el-channel']");
  channels = Array.from(c).map((channel) => {
    const id = channel.id.replace(/el-channel-(.*?)/, "$1");
    return {
      id,
      serverId: "73",
      title: channel.getAttribute("title") as string,
    };
  });

  return c;
};

interface ServerConfig {
  id: string;
  serverId: string;
  title: string;
}
const getStreamLink = async (serverConfig: ServerConfig, ip?: string) => {
  const url = "https://japantvmiru.com/live/change-live-server";
  const data = { channelID: serverConfig.id, serverId: serverConfig.serverId };
  try {
    const res = await axios.post(url, data, {
      headers: {
        cookie: COOKIE,
        "X-CSRF-TOKEN": csrftoken,
      },
    });

    return res;
  } catch (e: any) {
    console.log("Something went wrong", serverConfig, e.message);
  }
  return { data: {} };
};
const app = express();

app.use((req, res, next) => {
  if (req.query["bestgirl"] !== "seiunsky") {
    res.status(400).send("go away");
  } else {
    next();
  }
});

app.get("/playlist.m3u8", async (req, res) => {
  res.set({
    "Content-Type": "video/MP2P",
  });
  res.status(200).send(
    m3u.format({
      tracks: channels.map((c) => {
        return {
          title: c.title,
          length: -1,
          file: `${HOST}/channels/${c.id}/playlist.m3u8?bestgirl=seiunsky`,
        };
      }),
      header: {
        refresh: "43200",
      },
    }),
  );
});

let commonChannels: { data?: any; cache: Date } | undefined = undefined;

app.get("/common/playlist.m3u8", async (req, res) => {
  const { data, cache } = commonChannels ?? {};
  let tracks = data;
  const ip = req.ip;
  if (!tracks || !cache || cache.valueOf() - new Date().valueOf() > 43200) {
    tracks = await Promise.all(
      channels
        .filter((a) =>
          [
            "1",
            "2",
            "4",
            "13",
            "14",
            "15",
            "16",
            "70",
            "71",
            "270",
            "63",
            "65",
            "66",
            "153",
            "157",
            "41",
            "69",
            "17",
            "18",
            "21",
            "23",
            "24",
            "25",
            "26",
            "27",
            "28",
            "29",
            "206",
            "220",
            "221",
            "229",
            "215",
            "216",
            "217",
            "218",
            "219",
          ].includes(a.id),
        )
        .map(async (c) => {
          return {
            title: c.title,
            length: -1,
            file: (await getStreamLink(c, ip))?.data?.playUrl,
          };
        }),
    );
    commonChannels = {
      data: tracks,
      cache: new Date(),
    };
  }
  const d = m3u.format({
    tracks,
    header: {
      refresh: "43200",
    },
  });
  res.set({
    "Content-Type": "video/MP2P",
  });
  res.status(200).send(d);
});

app.get("/channels/:id/playlist.m3u8", async (req, res) => {
  const id = req.params["id"];
  const cfg = channels.find((channel) => channel.id === id);
  if (!cfg) {
    return res.status(404).send("oops");
  }
  const ah = await getStreamLink(cfg);
  res.set({
    "Content-Type": "video/MP2P",
  });
  res.status(200).send(
    m3u.format({
      tracks: [
        {
          title: cfg.title,
          length: -1,
          file: ah.data.playUrl,
        },
      ],
      header: {
        refresh: "43200",
      },
    }),
  );
});
let channels: ServerConfig[];

async function init() {
  await getChannels();
  await app.listen(420, "0.0.0.0");
  console.log("listening on host", HOST);
  console.log("server started, go ham");
}

init();
