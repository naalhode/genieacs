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

import * as debug from "./debug";
import * as crypto from "crypto";

const {client, xml, jid} = require('@xmpp/client');

var _service;
var _jid;
var _client;

export async function start(
  host: string,
  port: number,
  domain: string,
  username: string,
  password: string,
  resource: string,
  _debug: boolean
): Promise<void> {
  if (!host || host == "") return;
  
  if (! port || port == 0) return;

  if (!domain || domain == "") domain = host;

  _service = "xmpp://" + host + ":" + port;
  _jid =  jid(username + "@" + domain + "/" + resource);
  
  _client = client({
    service: _service,
    domain: domain,
    username: username,
    password: password,
    resource: resource
  });

  return new Promise((resolve, reject) => {
    _client
      .on("error", err => {
        reject(new Error(err));
      })
      .on("stanza", async stanza => {
        if (_debug) {
          //debug.incomingXmppMessage(_service, "", stanza.toString());
        }
      })
      .on("online", async address => {
        resolve();
      })
      .on("offline", () => {
      });

    _client
      .start()
      .catch(function(err) {
        reject(new Error(err));
      });
  });
}

export async function stop(
): Promise<void> {
  if (_jid) {
    _jid = undefined;
  }
  if (_client) {
    await _client.stop();
    _client = undefined;
  }
}

function newId() {
  return crypto.randomBytes(16).toString("hex");
}

export async function connectionRequest(
  connReqJabberId: string,
  username: string,
  password: string,
  _debug: boolean
): Promise<void> {
  if (_jid && _client) {
    const id = newId();
    const to = jid(connReqJabberId);

    const message = xml(
      "iq",
      { id: id, to: to.toString(), from: _jid.toString(), type: "get" },
      xml(
        "connectionRequest",
        { xmlns: "urn:broadband-forum-org:cwmp:xmppConnReq-1-0" },
        xml("username", {}, username),
        xml("password", {}, password)
      )
    );

    if (_debug) {
      //debug.outgoingXmppMessage(_service, connReqJabberId, message.toString());
    }
   
    await _client
      .send(message)
      .catch(function(err) {
        throw new Error(err);
      });
  }
}

