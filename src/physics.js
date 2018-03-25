const Victor = require('victor');
const app = require('./app.js');

const slashes = {};
// const enemyProjectiles = [];

// Check collisions of two boxes
/* const checkBoxCollisions = (rect1, rect2, width, height) => {
  if (rect1.x < rect2.x + width &&
    rect1.x + width > rect2.x &&
    rect1.y < rect2.y + height &&
    height + rect1.y > rect2.y) {
    return true; // Is colliding
  }
  return false; // Is not colliding
}; */

const checkSlashCollision = (enemy, slashObj) => {
  const slash = slashObj;

  // Check if this enemy has already been hit by the slash
  if (slash.hits.includes(enemy)) return false;

  const collisionPoint = new Victor(slash.p2X, slash.p2Y);

  // If our collisionPoint is in our enemy, then the slash has connected
  if (collisionPoint.x > enemy.x && collisionPoint.x < enemy.x + enemy.width) {
    if (collisionPoint.y > enemy.y && collisionPoint.y < enemy.y + enemy.height) {
      return true;
    }
  }

  return false;
};

const checkSlashes = () => {
  const keys = Object.keys(slashes);
  if (keys.length > 0) {
    for (let i = 0; i < keys.length; i++) {
      const slash = slashes[keys[i]];
      if (slash.alpha > 0) {
        const enemy = app.getEnemy(slash.roomName);
        const hit = checkSlashCollision(enemy, slash);

        if (hit) {
          slash.hits.push(enemy);
          app.enemyHit({ enemy, slash });
        }
      }
    }
  }
};

// Check for collisions every 20ms
setInterval(() => {
  checkSlashes();
}, 20);

const addSlash = (slash) => {
  slashes[slash.hash] = slash;
};

module.exports.addSlash = addSlash;
