let socket;
let myPos = { x: 0.5, y: 0.5 }; 
let activeTreasures = [];
let stars = 0;
let heading = 0; // 手机朝向 (0-360)
let interferenceEndTime = 0;
let myColor;
let stepThreshold = 12; // 步行检测灵敏度（数值越小越灵敏）
let lastAccel = 0;

function setup() {
    socket = io(); // [cite: 15]
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("sketch-container"); // [cite: 35]
    myColor = color(random(255), random(255), random(255)); // [cite: 70]

    // iOS 授权按钮：必须点击才能开启传感器
    let btn = createButton("进入 30m² 寻宝场");
    btn.style('padding', '20px');
    btn.center();
    btn.mousePressed(() => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            // 授权罗盘和加速度计
            Promise.all([
                DeviceOrientationEvent.requestPermission(),
                DeviceMotionEvent.requestPermission()
            ]).then(results => {
                if (results.every(res => res === 'granted')) {
                    // 监听罗盘 [cite: 109]
                    window.addEventListener('deviceorientation', e => {
                        heading = e.webkitCompassHeading || e.alpha;
                    }, true);
                    // 监听步进
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
    socket.on("bomb-hit", () => { interferenceEndTime = millis() + 5000; });
}

// 核心：只有当你物理上移动（产生震动）时，才会触发位移
function handleMotion(event) {
    if (millis() < interferenceEndTime) return;

    let acc = event.accelerationIncludingGravity;
    let totalAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    
    // 检测加速度突变（模拟迈步）
    if (totalAccel - lastAccel > stepThreshold) {
        let stepSize = 0.015; // 每一小步的位移量
        myPos.x += cos(radians(heading - 90)) * stepSize;
        myPos.y += sin(radians(heading - 90)) * stepSize;
        
        myPos.x = constrain(myPos.x, 0, 1);
        myPos.y = constrain(myPos.y, 0, 1);
        
        emitData(); // [cite: 98, 103]
    }
    lastAccel = totalAccel;
}

function draw() {
    background(10, 10, 20);
    let isInterfered = millis() < interferenceEndTime;

    drawNetworkTracks(); // 绘制所有人的历史足迹 [cite: 155]
    drawCompassUI(isInterfered);

    // 绘制玩家自己 [cite: 76, 77]
    fill(myColor);
    noStroke();
    circle(myPos.x * width, myPos.y * height, 25);
}

function emitData() {
    socket.emit("drawing", {
        xpos: myPos.x, ypos: myPos.y, // [cite: 109, 110]
        userR: red(myColor), userG: green(myColor), userB: blue(myColor)
    });
}

function drawCompassUI(isInterfered) {
    let closestT = null;
    let minDist = Infinity;
    
    // 筛选未找到的宝藏并计算最近距离
    activeTreasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) { minDist = d; closestT = t; }
    });

    // 绘制指南针
    push();
    translate(width / 2, height - 150);
    
    // 计算宝藏相对于玩家的绝对角度
    let targetAngle = closestT ? atan2(closestT.y - myPos.y, closestT.x - myPos.x) : 0;
    
    // 关键：箭头旋转角度 = 目标角度 - 手机当前朝向角度
    // 这样无论你转到哪，箭头都指向宝藏
    rotate(isInterfered ? random(TWO_PI) : (targetAngle - radians(heading) + PI/2));
    
    // 绘制指南针盘面
    stroke(255, 50);
    noFill();
    ellipse(0, 0, 100, 100);
    
    // 绘制指示箭头
    fill(isInterfered ? 100 : "#00FF00");
    noStroke();
    triangle(0, -40, -15, 0, 15, 0); 
    pop();

    // 文字反馈
    fill(255);
    textAlign(CENTER);
    textSize(20);
    text(`⭐ 积分: ${stars}`, width / 2, 60);
    if (closestT) {
        text(`目标距离: ${nf(minDist * 5.5, 1, 1)} 米`, width / 2, height - 80);
    }
    if (isInterfered) {
        fill(255, 0, 0);
        text("⚠️ 信号干扰：传感器失灵", width / 2, height / 2);
    }
}

function drawNetworkTracks() {
    // 这里可以调用原本的 onDrawingEvent 逻辑绘制其他人的足迹 [cite: 119, 123]
}