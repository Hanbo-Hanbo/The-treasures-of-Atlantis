let socket;
let myPos = { x: 0.5, y: 0.5 };
let treasures = [];
let bases = [];
let myColor;
let mapImg;
let heading = 0;
let timeLeft = 300;

// 传感器控制
let lastMoveTime = -2000;
let stepThreshold = 15.0; // 提高阈值，极度过滤漂移
let lastAccel = 0;
let hasSetBase = false;

function preload() { mapImg = loadImage('map.jpg'); }

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));

    let authBtn = createButton("START SESSION");
    authBtn.center();
    authBtn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            Promise.all([DeviceOrientationEvent.requestPermission(), DeviceMotionEvent.requestPermission()])
            .then(res => {
                if (res.every(r => r === 'granted')) {
                    window.addEventListener('deviceorientation', e => heading = e.webkitCompassHeading || e.alpha, true);
                    window.addEventListener('devicemotion', handleMotion, true);
                    authBtn.hide();
                    if (!hasSetBase) showSetBaseBtn();
                }
            });
        }
    });

    socket.on("init-game", d => { treasures = d.treasures; bases = d.bases; timeLeft = d.gameTime; });
    socket.on("update-treasures", d => treasures = d);
    socket.on("update-bases", d => bases = d);
    socket.on("timer-update", t => timeLeft = t);
    socket.on("game-over", () => noLoop());
}

function showSetBaseBtn() {
    let bBtn = createButton("SET HOME BASE HERE");
    bBtn.position(width/2 - 80, height - 120);
    bBtn.mousePressed(() => {
        socket.emit("set-base", { x: myPos.x, y: myPos.y, color: {r: red(myColor), g: green(myColor), b: blue(myColor)} });
        hasSetBase = true;
        bBtn.hide();
    });
}

function handleMotion(event) {
    let acc = event.accelerationIncludingGravity;
    if (!acc) return;
    let currentAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    if (abs(currentAccel - lastAccel) > stepThreshold) {
        triggerUpdate();
    }
    lastAccel = currentAccel;
}

function triggerUpdate() {
    lastMoveTime = millis();
    let stepSize = 0.05; // 减小步长，使移动更加丝滑、不夸张
    myPos.x += cos(radians(heading - 90)) * stepSize;
    myPos.y += sin(radians(heading - 90)) * stepSize;
    myPos.x = constrain(myPos.x, 0, 1);
    myPos.y = constrain(myPos.y, 0, 1);
    socket.emit("refresh-location", { xpos: myPos.x, ypos: myPos.y, color: {r: red(myColor), g: green(myColor), b: blue(myColor)} });
}

function draw() {
    image(mapImg, 0, 0, width, height);
    
    let minDist = 1.0;
    treasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) minDist = d;
    });

    drawDistanceBar(minDist); // 窄条
    drawBases();            // 大本营 (常驻)
    drawStars();            // 被点亮的星星
    
    if (millis() - lastMoveTime < 2000) {
        drawPlayerUI(myPos.x * width, myPos.y * height);
    }

    drawTimer();
}

// 1. 极窄距离条 (12像素宽)
function drawDistanceBar(d) {
    let barW = 12;
    let h = map(d, 0, 0.5, height, 0);
    fill(d < 0.22 ? color(255,0,0) : color(255, 200));
    noStroke();
    rect(0, height, barW, -h);
}

// 2. 绘制大本营 (房子形状)
function drawBases() {
    bases.forEach(b => {
        push();
        translate(b.x * width, b.y * height);
        fill(b.color.r, b.color.g, b.color.b);
        stroke(255);
        rectMode(CENTER);
        rect(0, 5, 20, 15); // 屋身
        triangle(-12, 5, 0, -10, 12, 5); // 屋顶
        pop();
    });
}

// 3. 绘制倒计时
function drawTimer() {
    fill(0, 150);
    rect(width/2 - 50, 20, 100, 30, 5);
    fill(255);
    textAlign(CENTER, CENTER);
    let m = floor(timeLeft / 60);
    let s = timeLeft % 60;
    text(`${m}:${nf(s, 2)}`, width/2, 35);
}

function drawStars() {
    treasures.forEach(t => {
        if (t.found) {
            push();
            translate(t.x * width, t.y * height);
            fill(t.foundBy.r, t.foundBy.g, t.foundBy.b);
            noStroke();
            beginShape();
            for(let i=0; i<10; i++) {
                let r = (i%2==0) ? 8 : 4;
                vertex(r*cos(TWO_PI*i/10), r*sin(TWO_PI*i/10));
            }
            endShape(CLOSE);
            pop();
        }
    });
}

function drawPlayerUI(x, y) {
    push();
    translate(x, y);
    noFill();
    stroke(255, 150);
    ellipse(0,0,30,30);
    line(-10,0,10,0); line(0,-10,0,10);
    stroke(255,0,0);
    line(0,0,0,-15);
    fill(myColor);
    noStroke();
    circle(0,0,15);
    pop();
}