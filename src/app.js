const http = require('http');
const socketio = require('socket.io');
const xxh = require('xxhashjs');

const fs = require('fs');
const Character = require('./Character.js');
const Enemy = require('./Enemy.js');
const physics = require('./physics.js');

const PORT = process.env.PORT || process.env.NODE_PORT || 3000;

const handler = (req, res) => {
  if (req.url === '/bundle.js') {
    fs.readFile(`${__dirname}/../hosted/bundle.js`, (err, data) => {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
      });
      res.end(data);
    });
  } else if (req.url === '/style.css') {
    console.log('hi');
    fs.readFile(`${__dirname}/../hosted/style.css`, (err, data) => {
      res.writeHead(200, {
        'Content-Type': 'text/css',
      });
      res.end(data);
    });
  } else {
    // Read our file ASYNCHRONOUSLY from the file system.
    fs.readFile(`${__dirname}/../hosted/index.html`, (err, data) => {
      // if err, throw it for now
      if (err) {
        throw err;
      }
      res.writeHead(200);
      res.end(data);
    });
  }
};

const app = http.createServer(handler);
const io = socketio(app);

app.listen(PORT);

// Array of rooms that exist on our server
// Each room has roomName, joinable, users, chatMessages
const rooms = [];
let roomCount = 0; // Number of rooms created since the server started

const createNewRoom = () => {
  roomCount++;
  const roomObj = {
    roomName: `Room${roomCount}`,
    joinable: true,
    users: [],
    chatMessages: [],
    enemy: new Enemy(),
  };

  rooms.push(roomObj);
  return rooms[rooms.indexOf(roomObj)];
};

const getBestRoom = () => {
  let bestRoom;
  let userCount = -1;

  // If there are no rooms, create one
  if (rooms.length === 0) {
    return createNewRoom();
  }

  // Otherwise, we loop through our rooms and see if at least one is joinable
  let joinable = false;
  for (let i = 0; i < rooms.length; i++) {
    if (rooms[i].joinable) {
      joinable = true;
      break;
    }
  }

  // If no rooms are joinable, create a new room
  if (!joinable) return createNewRoom();

  // Otherwise, we have at least one joinable room
  // Loop through our rooms and find the joinable room with the most users
  for (let i = 0; i < rooms.length; i++) {
    const checkRoom = rooms[i];
    if (checkRoom.joinable) {
      if (checkRoom.users.length < 12 && checkRoom.users.length > userCount) {
        userCount = checkRoom.users.length;
        bestRoom = checkRoom;
      }
    }
  }

  return bestRoom;
};

const enemyHit = (data) => {
  console.dir(data);
  console.dir(data.enemy);
  const { enemy } = data;
  enemy.health--;
  console.log('Enemy Hit!');
  io.sockets.in(data.slash.roomName).emit('addLine', data.slash);
};

const onJoined = (sock) => {
  const socket = sock;
  const room = getBestRoom();

  socket.join(room.roomName);

  console.log(`Joined ${room.roomName}`);

  // Announcement to everyone in the room
  /* const response = {
    name: 'server',
    msg: `${data.name} has joined the room.`,
  };
  socket.broadcast.to(room.roomName).emit('msg', response);

  // Success message to the new user
  socket.emit('msg', {
    name: 'server',
    msg: `You have joined ${room.roomName}`,
  });

  socket.join(room.roomName);

  /*socket.name = data.name;
  socket.emit('msg', joinMsg);
  socket.emit('joinedRoom', room);
  */

  // Server itself doesn't care about height, width, prevX, and prevY (unless collisions)
  socket.hash = xxh.h32(`${socket.id}${new Date().getTime()}`, 0xDEADBEEF).toString(16);

  socket.character = new Character(socket.hash);
  room.users.push(socket.character);

  socket.roomName = room.roomName;

  socket.emit('joined', {
    character: socket.character,
    roomName: socket.roomName,
  });

  socket.emit('updateEnemy', room.enemy);
};

io.on('connection', (sock) => {
  const socket = sock;

  onJoined(socket);

  socket.on('movementUpdate', (data) => {
    socket.character = data;
    socket.character.lastUpdate = new Date().getTime();

    socket.broadcast.to(socket.roomName).emit('updatedMovement', socket.character);
  });

  socket.on('slashLineCreated', (data) => {
    socket.broadcast.to(socket.roomName).emit('addLine', data);
    physics.addSlash(data);
  });

  socket.on('disconnect', () => {
    io.sockets.in(socket.roomName).emit('left', socket.character.hash);

    socket.leave(socket.roomName);
  });

  socket.on('updatedSlashLine', (data) => {
    physics.addSlash(data);
  });

  /* socket.on('message' () => {

  }); */
});

const getRoom = (rName) => {
  for (let i = 0; i < rooms.length; i++) {
    if (rooms[i].roomName === rName) return rooms[i];
  }
  return null;
};

const getEnemy = rName => getRoom(rName).enemy;

console.log(`listening on port ${PORT}`);

module.exports.enemyHit = enemyHit;
module.exports.getEnemy = getEnemy;
