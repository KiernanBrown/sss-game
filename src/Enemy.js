class Enemy {
  constructor() {
    this.lastUpdate = new Date().getTime();
    this.x = 270;
    this.y = 270;
    this.height = 60;
    this.width = 60;
    this.prevX = 270;
    this.prevY = 270;
    this.destX = 270;
    this.destY = 270;
    this.alpha = 0;
    this.health = 10;
  }
}

module.exports = Enemy;
