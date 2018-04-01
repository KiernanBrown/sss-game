const http = require('http');
const socketio = require('socket.io');
const xxh = require('xxhashjs');

const fs = require('fs');
const Character = require('./Character.js');
const Enemy = require('./Enemy.js');
const physics = require('./physics.js');
const Victor = require('victor');

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
    running: false,
    wave: 1,
    state: 'starting',
    enemyCount: 8,
    enemiesSpawned: 0,
    enemyHealth: 1,
    enemySpeed: 1.25,
    users: {},
    chatMessages: [],
    enemies: [],
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
      const keys = Object.keys(checkRoom.users);
      if (keys.length < 4 && keys.length > userCount) {
        userCount = keys.length;
        bestRoom = checkRoom;
      }
    }
  }

  if (!bestRoom) return createNewRoom();

  return bestRoom;
};

const getRoom = (rName) => {
  for (let i = 0; i < rooms.length; i++) {
    if (rooms[i].roomName === rName) return rooms[i];
  }
  return null;
};

const endGame = (r) => {
  const room = r;
  room.state = 'end';

  // Get our winner for the game
  let winner = {};
  let winningScore = -1;
  const keys = Object.keys(room.users);
  for (let i = 0; i < keys.length; i++) {
    const player = room.users[keys[i]];
    if (player.score > winningScore) {
      winningScore = player.score;
      winner = player;
    }
  }

  console.dir(winner);
};

const advanceWave = (r) => {
  console.log('Advancing wave');
  const room = r;
  room.enemies.length = 0;

  // If this was the fifth wave, we end the game
  if (room.wave === 5) {
    endGame(room);
    return;
  }

  room.wave++;
  if (room.wave % 10 === 1) {
    room.enemyCount -= 5;
    room.enemyHealth++;
    room.enemySpeed += 0.15;
  } else {
    room.enemyCount += 2;
  }
  room.enemiesSpawned = 0;
  room.state = 'wave';
};

const enemyHit = (data) => {
  // Decrease the enemy's health
  const { enemy } = data;

  enemy.health--;

  // If the enemy is dead, remove it from our enemies array
  if (enemy.health <= 0) {
    const room = getRoom(data.slash.roomName);
    const enemyIndex = room.enemies.indexOf(enemy);
    room.enemies[enemyIndex].alive = false;

    // Add to the player's score
    room.users[data.slash.hash].score++;

    // Removing enemies during this step causes some problem
    // Instead we will wait until the end of the wave
    /* if (enemyIndex === 0) {
      room.enemies.shift();
    } else {
      room.enemies.splice(1, enemyIndex);
    } */

    let enemiesAlive = false;
    for (let i = 0; i < room.enemies.length; i++) {
      if (room.enemies[i].alive) {
        enemiesAlive = true;
        break;
      }
    }

    // If all the enemies in the wave have been killed, advance to the next wave
    if (!enemiesAlive && room.enemiesSpawned === room.enemyCount) {
      advanceWave(room);
    }
    io.sockets.in(data.slash.roomName).emit('updateEnemies', room.enemies);
  }

  // Update the slash line to change the color to red
  io.sockets.in(data.slash.roomName).emit('addLine', data.slash);
  physics.addSlash(data.slash);
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
  room.users[socket.hash] = socket.character;
  room.running = true;
  room.state = 'wave';

  socket.roomName = room.roomName;

  socket.emit('joined', {
    character: socket.character,
    roomName: socket.roomName,
  });

  socket.emit('updateEnemies', room.enemies);
};

io.on('connection', (sock) => {
  const socket = sock;

  onJoined(socket);

  socket.on('movementUpdate', (data) => {
    socket.character = data;
    socket.character.lastUpdate = new Date().getTime();
    getRoom(socket.roomName).users[socket.hash] = data;

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

const updateRooms = () => {
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (room.running && room.state === 'wave' && room.enemiesSpawned < room.enemyCount) {
      room.enemiesSpawned++;
      const hash = xxh.h32(`${room.enemiesSpawned}${new Date().getTime()}`, 0xDEADBEEF).toString(16);
      room.enemies.push(new Enemy(hash, 600, 600, room.enemyHealth, room.users));
      io.sockets.in(room.roomName).emit('updateEnemies', room.enemies);
    }
  }
};

const enemiesMove = () => {
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (room.enemies.length > 0) {
      for (let j = 0; j < room.enemies.length; j++) {
        const enemy = room.enemies[j];
        if (enemy.alive) {
          // Update the enemy's target
          enemy.target = room.users[enemy.target.hash];

          // Get the direction from the enemy to its target
          const targetX = enemy.target.x - enemy.x - (enemy.width / 2);
          const targetY = enemy.target.y - enemy.y - (enemy.height / 2);
          const direction = new Victor(targetX, targetY);
          const magnitude = Math.sqrt((direction.x ** 2) + (direction.y ** 2));
          const unitDir = new Victor(direction.x / magnitude, direction.y / magnitude);
          enemy.x = enemy.destX;
          enemy.y = enemy.destY;
          enemy.destX += unitDir.x * room.enemySpeed;
          enemy.destY += unitDir.y * room.enemySpeed;
        }
      }

      io.sockets.in(room.roomName).emit('updateEnemies', room.enemies);
    }
  }
};

const getEnemies = rName => getRoom(rName).enemies;

const getUsers = rName => getRoom(rName).users;

console.log(`listening on port ${PORT}`);

setInterval(updateRooms, 1000);
setInterval(enemiesMove, 20);

module.exports.enemyHit = enemyHit;
module.exports.getEnemies = getEnemies;
module.exports.getUsers = getUsers;
module.exports.rooms = rooms;
