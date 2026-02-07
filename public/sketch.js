let socket;
let myPos = { x: 0.5, y: 0.5 };
let activeTreasures = [];
let starsCount = 0;
let heading = 0;
let myColor;
let mapImg;

// 刷新机制变量
let lastRefreshTime = -5000; 
let refreshCooldown = 5000;
let pulseDuration = 2000;
let refreshButton;

// 存储其他玩家的脉冲效果
let otherPulses = [];

function preload() {
    mapImg = loadImage('map.jpg');
}

function setup() {
    socket = io();
    createCanvas(windowWidth, windowHeight).parent("sketch-container");
    myColor = color(random(255), random(255), random(255));

    // 1. 刷新位置按钮
    refreshButton = createButton("REFRESH LOCATION");
    refreshButton.style('padding', '15px');
    refreshButton.position(20, height - 70);
    refreshButton.mousePressed(handleRefresh);

    // iOS 授权 (只需罗盘)
    let authBtn = createButton("ENABLE COMPASS");
    authBtn.center();
    authBtn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(res => {
                if (res === 'granted') {
                    window.addEventListener('deviceorientation', e => {
                        heading = e.webkitCompassHeading || e.alpha;
                    }, true);
                    authBtn.hide();
                }
            });
        } else { authBtn.hide(); }
    });

    socket.on("init-game", data => { activeTreasures = data.treasures; starsCount = data.starsCount; });
    socket.on("treasure-activated", data => { activeTreasures = data.treasures; starsCount = data.starsCount; });
    socket.on("level-up", data => { activeTreasures = data.treasures; starsCount = data.starsCount; });
    socket.on("player-pulse", data => { otherPulses.push({ ...data, time: millis() }); });
}

function handleRefresh() {
    let now = millis();
    if (now - lastRefreshTime > refreshCooldown) {
        lastRefreshTime = now;
        
        // 模拟在 10m² 内移动 (3.16m x 3.16m)
        let stepSize = 0.15; 
        myPos.x += cos(radians(heading - 90)) * stepSize;
        myPos.y += sin(radians(heading - 90)) * stepSize;
        myPos.x = constrain(myPos.x, 0, 1);
        myPos.y = constrain(myPos.y, 0, 1);

        socket.emit("refresh-location", {
            xpos: myPos.x, ypos: myPos.y,
            userR: red(myColor), userG: green(myColor), userB: blue(myColor)
        });
    }
}

function draw() {
    image(mapImg, 0, 0, width, height);
    
    // 2. 绘制已激活的宝藏（星星标记）
    drawStarMarkers();

    // 3. 绘制自己的位置（2秒淡出）
    let myElapsed = millis() - lastRefreshTime;
    if (myElapsed < pulseDuration) {
        drawPulse(myPos.x * width, myPos.y * height, myColor, myElapsed);
    }

    // 绘制其他玩家的脉冲
    for (let i = otherPulses.length - 1; i >= 0; i--) {
        let p = otherPulses[i];
        let elapsed = millis() - p.time;
        if (elapsed < pulseDuration) {
            drawPulse(p.xpos * width, p.ypos * height, color(p.userR, p.userG, p.userB), elapsed);
        } else {
            otherPulses.splice(i, 1);
        }
    }

    drawCompassUI();
    drawHUD();
}

function drawPulse(x, y, col, elapsed) {
    let percent = elapsed / pulseDuration;
    let size = lerp(20, 80, percent);
    let alpha = lerp(255, 0, percent);
    
    noStroke();
    fill(red(col), green(col), blue(col), alpha);
    circle(x, y, size);
}

function drawStarMarkers() {
    activeTreasures.forEach(t => {
        if (t.found && t.foundByColor) {
            push();
            translate(t.x * width, t.y * height);
            fill(t.foundByColor.r, t.foundByColor.g, t.foundByColor.b);
            noStroke();
            // 绘制一个小星星
            beginShape();
            for (let i = 0; i < 10; i++) {
                let angle = TWO_PI * i / 10;
                let r = (i % 2 === 0) ? 10 : 5;
                vertex(r * cos(angle), r * sin(angle));
            }
            endShape(CLOSE);
            pop();
        }
    });
}

function drawCompassUI() {
    let closestT = null;
    let minDist = Infinity;
    activeTreasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) { minDist = d; closestT = t; }
    });

    push();
    translate(width / 2, height - 160);
    let targetAngle = closestT ? atan2(closestT.y - myPos.y, closestT.x - myPos.x) : 0;
    rotate(targetAngle - radians(heading) + PI/2);
    
    strokeWeight(4);
    stroke(200, 100);
    line(0, -40, 0, 40); line(-40, 0, 40, 0); // 十字
    stroke(255, 0, 0); line(0, 0, 0, -40); // 红色端
    pop();

    if (closestT) {
        fill(255); textAlign(CENTER); textSize(18);
        text(`NEAREST: ${nf(minDist * 3.16, 1, 2)}m`, width/2, height - 80);
    }
}

function drawHUD() {
    // 冷却进度条
    let cooldownLeft = max(0, refreshCooldown - (millis() - lastRefreshTime));
    let barWidth = map(cooldownLeft, 0, refreshCooldown, 0, 200);
    
    fill(0, 150); rect(20, height - 100, 200, 10);
    fill(0, 255, 200); rect(20, height - 100, barWidth, 10);
    
    fill(255); textAlign(LEFT); textSize(14);
    text(cooldownLeft > 0 ? "RECHARGING..." : "READY TO SCAN", 20, height - 110);
    text(`STARS: ${starsCount} ⭐`, 20, 40);
}