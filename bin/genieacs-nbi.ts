/**
 * Copyright 2013-2019  GenieACS Inc.
 *
 * This file is part of GenieACS.
 *
 * GenieACS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * GenieACS is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with GenieACS.  If not, see <http://www.gnu.org/licenses/>.
 */

import * as config from "../lib/config";
import * as logger from "../lib/logger";
import * as cluster from "../lib/cluster";
import * as server from "../lib/server";
import { listener } from "../lib/nbi";
import * as db from "../lib/db";
import * as extensions from "../lib/extensions";
import * as cache from "../lib/cache";
import { version as VERSION } from "../package.json";
import * as xmpp from "../lib/xmpp-client";

logger.init("nbi", VERSION);

const SERVICE_ADDRESS = config.get("NBI_INTERFACE") as string;
const SERVICE_PORT = config.get("NBI_PORT") as number;

const XMPP_HOST = config.get("XMPP_HOST") as string;
const XMPP_PORT = config.get("XMPP_PORT") as number;
const XMPP_DOMAIN = config.get("XMPP_DOMAIN") as string;
const XMPP_USERNAME = config.get("XMPP_USERNAME") as string;
const XMPP_PASSWORD = config.get("XMPP_PASSWORD") as string;
const XMPP_RESOURCE= config.get("XMPP_RESOURCE") as string;

function exitWorkerGracefully(): void {
  setTimeout(exitWorkerUngracefully, 5000).unref();
  Promise.all([
    db.disconnect(),
    cache.disconnect(),
    extensions.killAll(),
    cluster.worker.disconnect(),
  ]).catch(exitWorkerUngracefully);
}

function exitWorkerUngracefully(): void {
  extensions.killAll().finally(() => {
    process.exit(1);
  });
}

if (!cluster.worker) {
  const WORKER_COUNT = config.get("NBI_WORKER_PROCESSES") as number;

  logger.info({
    message: `genieacs-nbi starting`,
    pid: process.pid,
    version: VERSION,
  });

  cluster.start(WORKER_COUNT, SERVICE_PORT, SERVICE_ADDRESS);

  process.on("SIGINT", () => {
    logger.info({
      message: "Received signal SIGINT, exiting",
      pid: process.pid,
    });

    cluster.stop();
  });

  process.on("SIGTERM", () => {
    logger.info({
      message: "Received signal SIGTERM, exiting",
      pid: process.pid,
    });

    cluster.stop();
  });
} else {
  const key = config.get("NBI_SSL_KEY") as string;
  const cert = config.get("NBI_SSL_CERT") as string;
  const options = {
    port: SERVICE_PORT,
    host: SERVICE_ADDRESS,
    ssl: key && cert ? { key, cert } : null,
    timeout: 30000,
  };

  let stopping = false;

  process.on("uncaughtException", (err) => {
    if ((err as NodeJS.ErrnoException).code === "ERR_IPC_DISCONNECTED") return;
    logger.error({
      message: "Uncaught exception",
      exception: err,
      pid: process.pid,
    });
    stopping = true;
	xmpp.stop();
    server.stop().then(exitWorkerGracefully).catch(exitWorkerUngracefully);
  });

  const _listener = (req, res): void => {
    if (stopping) res.setHeader("Connection", "close");
    listener(req, res);
  };

  const initPromise = Promise.all([db.connect(), cache.connect()])
    .then(() => {
      server.start(options, _listener);
      xmpp.start(XMPP_HOST, XMPP_PORT, XMPP_DOMAIN, XMPP_USERNAME, XMPP_PASSWORD, XMPP_RESOURCE, false);
    })
    .catch((err) => {
      setTimeout(() => {
        throw err;
      });
    });

  process.on("SIGINT", () => {
    stopping = true;
    initPromise.finally(() => {
	  xmpp.stop();
      server.stop().then(exitWorkerGracefully).catch(exitWorkerUngracefully);
    });
  });

  process.on("SIGTERM", () => {
    stopping = true;
    initPromise.finally(() => {
	  xmpp.stop();
      server.stop().then(exitWorkerGracefully).catch(exitWorkerUngracefully);
    });
  });
}
