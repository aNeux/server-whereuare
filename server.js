"use strict";

// Properties for MySQL database
var mysql = require("mysql");
var mysqlConnection = mysql.createConnection({
  host: 'sql11.freemysqlhosting.net',
  user: 'sql11154458',
  password: 'sYUmbMukdS',
  database: 'sql11154458',
  port: 3306
});

// Properties for WebSocket server
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: 8080 });
var clientsArray = [ ];

wss.on('connection', function connection(ws) {
    
    var client = {
        connection: ws
    };
    var arrayIndex;
    
    ws.on('message', function incoming(message) {
        var msgJSON = JSON.parse(message);
        switch (msgJSON.msg_type) {
            case 0:
                // Registrate user on the server if he doesn't already registred
                for (var i = 0; i < clientsArray.length; i++) {
                    if (clientsArray[i].id == msgJSON.id) return;
                }
                mysqlConnection.query("SELECT * FROM `users` WHERE `id` = " + msgJSON.id, function(err, rows) {
                    if (err) throw err;
                    client.id = msgJSON.id;
                    client.login = rows[0].login;
                    if (msgJSON.is_sender) {
                        // That client is a sender. Save his geo info
                        client.isSender = true;
                        client.updateTime = msgJSON.update_time;
                        client.latitude = msgJSON.latitude;
                        client.longitude = msgJSON.longitude;
                        client.speed = msgJSON.speed;
                        mysqlConnection.query("UPDATE `users` SET `access_password` = '" + msgJSON.access_password + "', `online` = true WHERE `id` = " + client.id);
                        // Notify sender about successful connection
                        client.connection.send(JSON.stringify({ type: 0, info: "Sender was successfuly connected." }));
                    } else {
                        // That client is a spectator. Store his info
                        client.isSender = false;
                        client.spectateToId = msgJSON.spectate_to_id;
                        // Find array index of the sender which that client wants to spectate
                        var spectateToArrayIndex = -1;
                        for (var i = 0; i < clientsArray.length; i++) {
                            if (client.spectateToId == clientsArray[i].id) {
                                spectateToArrayIndex = i;
                                break;
                            }
                        }
                        if (spectateToArrayIndex == -1) {
                            // No such online sender client wants to spectate
                            client.spectateToId = -1;
                            client.connection.send(JSON.stringify({ type: 1, info: "No such sender you want to spectate. Maybe he is offline now." }));
                        } else {
                            // Sender is online
                            var listenersArray = [ ];
                            // Message for spectators and sender
                            var msg = JSON.stringify({ type: 2, info: "New listener has been connected.", new_listener_login: client.login });
                            for (var i = 0; i < clientsArray.length; i++) {
                                if (clientsArray[i].id != client.id && (clientsArray[i].id == client.spectateToId || clientsArray[i].spectateToId == client.spectateToId)) {
                                    // Notify sender and other spectators about new one
                                    clientsArray[i].connection.send(msg);
                                }
                                if (clientsArray[i].id != client.spectateToId && clientsArray[i].spectateToId == client.spectateToId) {
                                    // Fill array of current spectators
                                    listenersArray.push(clientsArray[i].login);
                                }
                            }
                            // Notify client about successful connection and send him sender's geo info
                            client.connection.send(JSON.stringify({ type: 0, info: "Listener was successfuly connected.", listeners: listenersArray, update_time: clientsArray[spectateToArrayIndex].updateTime, latitude: clientsArray[spectateToArrayIndex].latitude, longitude: clientsArray[spectateToArrayIndex].longitude, speed: clientsArray[spectateToArrayIndex].speed }));
                        }
                        arrayIndex = clientsArray.push(client) - 1;
                    }
                });
                break;
            case 1:
                // New geo info from a sender. Notify listeners about this
                client.updateTime = msgJSON.update_time;
                client.latitude = msgJSON.latitude;
                client.longitude = msgJSON.longitude;
                client.speed = msgJSON.speed;
                var msg = JSON.stringify({ type: 3, info: "New geo info from a sender.", update_time: client.updateTime, latitude: client.latitude, longitude: client.longitude, speed: client.speed});
                for (var i = 0; i < clientsArray.length; i++) {
                    if (!clientsArray[i].isSender && clientsArray[i].spectateToId == client.id) {
                        clientsArray[i].connection.send(msg);
                    }
                }
                break;
            case 2:
                // New message in chat. Find users for whom it was
                var msg = msg = JSON.stringify({ type: 4, from: client.login, to: msgJSON.to, msg: msgJSON.msg });
                if (msgJSON.to == "all") {
                    for (var i = 0; i < clientsArray.length; i++) {
                        if (clientsArray[i].id == client.spectateToId || clientsArray[i].spectateToId == client.spectateToId) {
                            clientsArray[i].connection.send(msg);
                        }
                    }
                } else {
                    for (var i = 0; i < clientsArray.length; i++) {
                        if (clientsArray[i].id == client.id || clientsArray[i].login == msgJSON.to) {
                            clientsArray[i].connection.send(msg);
                        }
                    }
                }
                break;
        }
    });
    
    ws.on('close', function closing() {
        var msg;
        if (client.isSender) {
            // That user was a sender. Notify listeners about his disconnection
            mysqlConnection.query("UPDATE `users` SET `access_password` = '', `online` = false WHERE `id` = " + client.id);
            msg = JSON.stringify({ type: 5, info: "Sender has been disconnected." });
            for (var i = 0; i < clientsArray.length; i++) {
                if (!clientsArray[i].isSender && clientsArray[i].spectateToId == client.id) {
                    clientsArray[i].connection.send(msg);
                }
            }
        } else {
            // That user was a listener. Notify another listeners and a sender about his disconnection
            msg = JSON.stringify({ type: 6, info: "Listener \"" + client.login + "\" has been disconnected.", disconnected_user_login: client.login });
            for (var i = 0; i < clientsArray.length; i++) {
                if (clientsArray[i].id != client.id && (clientsArray[i].id = client.spectateToId || clientsArray[i].spectateToId == client.spectateToId)) {
                    clientsArray[i].connection.send(msg);
                }
            }
        }
        // Delete user info from array and close MySQL connection if it's needed
        clientsArray.splice(arrayIndex, 1);
        if (clientsArray.length == 0) {
            mysqlConnection.end();
        }
    });
  
});