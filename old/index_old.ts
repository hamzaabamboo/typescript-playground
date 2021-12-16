import puppeteer, { Browser, BrowserContext, Page } from "puppeteer";
import { writeFile } from "fs/promises";
import { join } from "path";
import axios from "axios";
import express from "express";
// @ts-ignore
import m3u from "m3ujs";
import dotenv from "dotenv";
import config from "../config.json";

dotenv.config();

const sleep = (s: number) => new Promise((r) => setTimeout(r, s));

const HOST = process.env["host"] ?? `http://localhost:420`;
const COOKIE = config?.cookie ?? process.env["cookie"] ?? "";
const csrftoken = process.env["csrf"] ?? "";

const addCookie = async (ctx: Page) => {
  const pairs = COOKIE.split(";").map((l) => {
    const item = l.trim().split("=");
    return {
      name: item[0],
      value: item[1],
      domain: "japantvmiru.com",
    };
  });
  await Promise.all(pairs.map((item) => ctx.setCookie(item)));
  return pairs;
};

const getChannels = async (page: Page) => {
  const URL =
    "https://japantvmiru.com/live/%E3%82%B0%E3%83%AA%E3%83%BC%E3%83%B3%E3%83%81%E3%83%A3%E3%83%B3%E3%83%8D%E3%83%AB-41.html";
  await page.goto(URL);
  const file = await page.pdf();
  const results = await page.$$("[id^='el-channel']");

  await writeFile(join(__dirname, "./test.pdf"), file);
  return await Promise.all(
    results.map(async (ele) => {
      const res = await ele.getProperty("id");
      const ctx = (await res?.jsonValue()) as string;
      const id = ctx.replace(/el-channel-(.*?)/, "$1");
      return {
        id,
        serverId: "73",
        title: (await (await ele.getProperty("title"))?.jsonValue()) as string,
      };
    }),
  );
};

interface ServerConfig {
  id: string;
  serverId: string;
  title: string;
}
const getStreamLink = async (serverConfig: ServerConfig) => {
  const url = "https://japantvmiru.com/live/change-live-server";
  const data = { channelID: serverConfig.id, serverId: serverConfig.serverId };
  const res = await axios.post(url, data, {
    headers: {
      cookie: COOKIE,
      "X-CSRF-TOKEN": csrftoken,
    },
  });
  return res;
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
            file: (await getStreamLink(c))?.data?.playUrl,
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
  const browser = await puppeteer.launch({ userDataDir: "./cache" });
  const ctx = await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  await addCookie(page);
  channels = await getChannels(page);
  await app.listen(420, "0.0.0.0");
  console.log("listening on host", HOST);
  console.log("server started, go ham");
}

init();
