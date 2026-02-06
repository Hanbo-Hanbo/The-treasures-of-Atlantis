let socket;
let myPos = { x: 0.5, y: 0.5 }; // Shared state [cite: 17]
let activeTreasures = [];
let stars = 0;
let heading = 0;
let interferenceEndTime = 0;
let myColor;
let stepThreshold = 8; // Lowered to be more sensitive to movement
let lastAccel = 0;
let drawingHistory = [];
let mapImg;

function preload() {
    mapImg = loadImage('map.jpg');
}

function setup() {
    socket = io(); // Creates Socket.IO client connection [cite: 15, 16]
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("sketch-container"); // Attaches canvas to HTML element [cite: 35, 36]
    
    // Give user a random brush color [cite: 70, 71]
    myColor = color(random(255), random(255), random(255));

    // Permission button for iOS
    let btn = createButton("ENTER 10m² TREASURE FIELD");
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

    // Receive data from server [cite: 146, 150]
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

// Movement only triggers when a physical "step" (acceleration) is detected
function handleMotion(event) {
    if (millis() < interferenceEndTime) return;
    
    let acc = event.accelerationIncludingGravity;
    let totalAccel = sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    
    // Check if acceleration change exceeds the threshold (detects a step)
    if (totalAccel - lastAccel > stepThreshold) {
        let stepSize = 0.02; // Movement speed
        
        // Update position based on compass heading
        myPos.x += cos(radians(heading - 90)) * stepSize;
        myPos.y += sin(radians(heading - 90)) * stepSize;
        
        // Keep within bounds
        myPos.x = constrain(myPos.x, 0, 1);
        myPos.y = constrain(myPos.y, 0, 1);
        
        emitData(); // Send drawing data to server [cite: 98, 99, 103]
    }
    lastAccel = totalAccel;
}

function draw() {
    image(mapImg, 0, 0, width, height); 
    let isInterfered = millis() < interferenceEndTime;

    // Draw previous drawing events from history [cite: 152, 153, 155]
    for (let h of drawingHistory) {
        fill(h.userR, h.userG, h.userB, 60);
        noStroke();
        circle(h.xpos * width, h.ypos * height, 8); // Converts normalized back to local [cite: 123, 124]
    }

    drawCompassUI(isInterfered);

    // Draw player sphere
    fill(myColor);
    stroke(255);
    strokeWeight(3);
    circle(myPos.x * width, myPos.y * height, 25);
}

function emitData() {
    // Sends "drawing" event with normalized coordinates [cite: 105, 108, 109, 110]
    socket.emit("drawing", {
        xpos: myPos.x,
        ypos: myPos.y,
        userR: red(myColor),
        userG: green(myColor),
        userB: blue(myColor)
    });
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
    
    // Find closest unfound treasure
    activeTreasures.filter(t => !t.found).forEach(t => {
        let d = dist(myPos.x, myPos.y, t.x, t.y);
        if (d < minDist) { minDist = d; closestT = t; }
    });

    if (closestT && minDist < 0.1 && frameCount % 30 === 0) triggerVibration("near");

    push();
    translate(width / 2, height - 150);
    let targetAngle = closestT ? atan2(closestT.y - myPos.y, closestT.x - myPos.x) : 0;
    
    // Rotate crosshair based on compass heading
    rotate(isInterfered ? random(TWO_PI) : (targetAngle - radians(heading) + PI/2));
    
    // Draw Crosshair Compass
    strokeWeight(4);
    let armLen = 60;
    stroke(200, 150);
    line(0, 0, 0, armLen);    // Back
    line(0, 0, -armLen, 0);   // Left
    line(0, 0, armLen, 0);    // Right
    stroke(isInterfered ? 100 : color(255, 0, 0)); 
    line(0, 0, 0, -armLen);   // Red Front (Points to Target)
    noStroke();
    fill(isInterfered ? 100 : color(255, 0, 0));
    circle(0, 0, 10);
    pop();

    // UI Panel
    fill(0, 150);
    rectMode(CENTER);
    rect(width/2, 65, 220, 45, 10);
    fill(255);
    textAlign(CENTER);
    textSize(20);
    text(`⭐ Score: ${stars}`, width / 2, 72);
    
    if (closestT) {
        fill(0, 150);
        rect(width/2, height - 75, 250, 40, 10);
        fill(255);
        text(`Target: ${nf(minDist * 3.16, 1, 2)} m`, width / 2, height - 68);
    }
    
    if (isInterfered) {
        fill(255, 0, 0);
        text("⚠️ SIGNAL LOST", width / 2, height / 2);
    }
}