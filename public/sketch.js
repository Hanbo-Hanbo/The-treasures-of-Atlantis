let socket;
let myPos = { x: 0.5, y: 0.5 }; 
let activeTreasures = [];
let stars = 0;
let heading = 0;
let interferenceEndTime = 0;
let myColor;
let stepThreshold = 12; // 步进灵敏度
let lastAccel = 0;
let drawingHistory = [];
let mapImg;

function preload() {
    // 预加载背景图
    mapImg = loadImage('map.jpg');
}

function setup() {
    socket = io(); 
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("sketch-container"); 
    myColor = color(random(255), random(255), random(255)); 

    let btn = createButton("进入 10m² 寻宝场");
    btn.style('padding', '20px');
    btn.center();
    btn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            Promise.all([
                DeviceOrientationEvent.requestPermission(),
                DeviceMotionEvent.requestPermission()
            ]).then(results => {
                if (results.every(res => res === 'granted')) {
                    window.addEventListener('deviceorientation', e => {
                        heading = e.webkitCompassHeading || e.alpha;
                    }, true);
                    window.addEventListener('devicemotion', handleMotion, true);
                    btn.hide();
                }
            });
        } else { btn.hide(); }
    });

    socket.on("status-update", data => {
        if (activeTreasures.length > 0 && data.treasures.filter(t => t.found).length > activeTreasures.filter(t => t.found).length) {
            triggerVibration("treasure");
        }
        activeTreasures = data.treasures;
        stars = data.stars;
    });
    
    socket.on("history", data => { drawingHistory = data; });
    
    socket.on("bomb-hit", () => { 
        interferenceEndTime = millis() + 5000; 
        triggerVibration("bomb");
    });
}

function handleMotion(event) {
    if (millis() < interferenceEndTime) return;
    let acc = event.accelerationIncludingGravity;
    let totalAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    
    if (totalAccel - lastAccel > stepThreshold) {
        let stepSize = 0.02; // 每一步的移动幅度
        myPos.x += cos(radians(heading - 90)) * stepSize;
        myPos.y += sin(radians(heading - 90)) * stepSize;
        myPos.x = constrain(myPos.x, 0, 1);
        myPos.y = constrain(myPos.y, 0, 1);
        
        socket.emit("drawing", {
            xpos: myPos.x, ypos: myPos.y,
            userR: red(myColor), userG: green(myColor), userB: blue(myColor)
        });
    }
    lastAccel = totalAccel;
}

function draw() {
    image(mapImg, 0, 0, width, height); // 绘制背景图
    let isInterfered = millis() < interferenceEndTime;

    // 绘制轨迹历史
    for (let h of drawingHistory) {
        fill(h.userR, h.userG, h.userB, 60);
        noStroke();
        circle(h.xpos * width, h.ypos * height, 8);
    }

    drawCompassUI(isInterfered);

    // 绘制玩家
    fill(myColor);
    stroke(255);
    strokeWeight(3);
    circle(myPos.x * width, myPos.y * height, 25);
}

function triggerVibration(type) {
    if (!("vibrate" in navigator)) return;
    if (type === "treasure") navigator.vibrate(500);
    else if (type === "bomb") navigator.vibrate([100, 50, 100, 50, 100]);
    else if (type === "near") navigator.vibrate(50);
}

function drawCompassUI(isInterfered) {
    let closestT = null;
    let minDist = Infinity;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) { minDist = d; closestT = t; }
    });

    if (closestT && minDist < 0.1 && frameCount % 30 === 0) triggerVibration("near");

    push();
    translate(width / 2, height - 150);
    let targetAngle = closestT ? atan2(closestT.y - myPos.y, closestT.x - myPos.x) : 0;
    rotate(isInterfered ? random(TWO_PI) : (targetAngle - radians(heading) + PI/2));
    
    // 绘制十字指南针
    strokeWeight(4);
    let armLen = 60;
    stroke(200, 150);
    line(0, 0, 0, armLen);    // 后臂
    line(0, 0, -armLen, 0);   // 左臂
    line(0, 0, armLen, 0);    // 右臂
    stroke(isInterfered ? 100 : color(255, 0, 0)); 
    line(0, 0, 0, -armLen);   // 前臂 (红端)
    noStroke();
    fill(isInterfered ? 100 : color(255, 0, 0));
    circle(0, 0, 10);
    pop();

    fill(0, 150);
    rectMode(CENTER);
    rect(width/2, 65, 200, 40, 10);
    fill(255);
    textAlign(CENTER);
    textSize(20);
    text(`⭐ 积分: ${stars}`, width / 2, 72);
    if (closestT) {
        text(`目标距离: ${nf(minDist * 3.16, 1, 2)} 米`, width / 2, height - 75);
    }
}