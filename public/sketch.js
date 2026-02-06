let socket;
let myPos = { x: 0.5, y: 0.5 }; 
let activeTreasures = [];
let stars = 0;
let heading = 0;
let interferenceEndTime = 0;
let myColor;
let stepThreshold = 12; // 步行灵敏度，如果走动没反应请调低
let lastAccel = 0;
let drawingHistory = [];

function setup() {
    socket = io(); // 连接服务器
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("sketch-container"); 
    myColor = color(random(255), random(255), random(255));

    // iOS 授权按钮
    let btn = createButton("进入 30m² 寻宝场");
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
        activeTreasures = data.treasures;
        stars = data.stars;
    });
    socket.on("history", data => { drawingHistory = data; });
    socket.on("bomb-hit", () => { interferenceEndTime = millis() + 5000; });
}

// 步进检测：只有真实走动才会位移
function handleMotion(event) {
    if (millis() < interferenceEndTime) return;
    let acc = event.accelerationIncludingGravity;
    let totalAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    
    if (totalAccel - lastAccel > stepThreshold) {
        let stepSize = 0.015; // 限制位移幅度
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
    background(10, 10, 20);
    let isInterfered = millis() < interferenceEndTime;

    // 绘制轨迹历史
    for (let h of drawingHistory) {
        fill(h.userR, h.userG, h.userB, 50);
        noStroke();
        circle(h.xpos * width, h.ypos * height, 8);
    }

    drawCompassUI(isInterfered);

    // 绘制玩家
    fill(myColor);
    stroke(255);
    circle(myPos.x * width, myPos.y * height, 25);
}

function drawCompassUI(isInterfered) {
    let closestT = null;
    let minDist = Infinity;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) { minDist = d; closestT = t; }
    });

    push();
    translate(width / 2, height - 150);
    let targetAngle = closestT ? atan2(closestT.y - myPos.y, closestT.x - myPos.x) : 0;
    
    // 指南针：目标角度 - 手机航向
    rotate(isInterfered ? random(TWO_PI) : (targetAngle - radians(heading) + PI/2));
    
    stroke(255, 50);
    noFill();
    ellipse(0, 0, 100, 100);
    fill(isInterfered ? 100 : "#00FF00");
    noStroke();
    triangle(0, -40, -15, 0, 15, 0); 
    pop();

    fill(255);
    textAlign(CENTER);
    text(`⭐ 积分: ${stars}`, width / 2, 60);
    if (closestT) text(`距离目标: ${nf(minDist * 5.5, 1, 1)} 米`, width / 2, height - 80);
}