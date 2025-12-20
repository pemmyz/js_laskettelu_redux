import * as ImportedTHREE from './three.core.min.js';

let THREE = ImportedTHREE;
if (THREE.default) THREE = THREE.default;

if (!THREE.WebGLRenderer) {
    alert("ERROR: Missing WebGLRenderer. Ensure 'three.core.min.js' is present.");
    throw new Error("Missing WebGLRenderer");
}

// --- SETUP ---
const container = document.getElementById('game-container');
const width = 800;
const height = 600;

const scene = new THREE.Scene();
// SUNNY ATMOSPHERE: Sky Blue
scene.background = new THREE.Color(0x87CEEB);
// Soft white fog blending into sky
scene.fog = new THREE.Fog(0x87CEEB, 300, 950); 

const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
camera.position.set(0, 80, 100); 
camera.lookAt(0, 0, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(width, height);
// SHADOWS: Enable high quality shadow map
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);

// --- LIGHTING (SUN & RAYS) ---
const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0xffffff, 0.6);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(100, 200, 50); 
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -200;
dirLight.shadow.camera.right = 200;
dirLight.shadow.camera.top = 200;
dirLight.shadow.camera.bottom = -200;
scene.add(dirLight);

// Visual Sun Sphere
const sunGeo = new THREE.SphereGeometry(20, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.set(200, 400, -500); 
scene.add(sunMesh);

// --- GROUND ---
const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
const planeMaterial = new THREE.MeshPhongMaterial({ 
    color: 0xffffff, 
    shininess: 0,
    specular: 0x000000
});
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true; 
scene.add(plane);

// --- GEOMETRY & MATERIALS ---
const treeGeo = new THREE.ConeGeometry(5, 14, 8);
const trunkGeo = new THREE.CylinderGeometry(1, 1.5, 4, 6);
const rockGeo = new THREE.DodecahedronGeometry(3);
const skiGeo = new THREE.BoxGeometry(1, 0.5, 10);

let skierBodyGeo;
if (THREE.CapsuleGeometry) {
    skierBodyGeo = new THREE.CapsuleGeometry(2, 6, 4, 8);
} else {
    skierBodyGeo = new THREE.CylinderGeometry(2, 2, 6, 8);
}

const materials = {
    treeLeaves: new THREE.MeshLambertMaterial({ color: 0x0f2e13 }), 
    treeTrunk: new THREE.MeshLambertMaterial({ color: 0x3e2723 }),
    rock: new THREE.MeshLambertMaterial({ color: 0x808080 }),
    mogul: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    gatePole: new THREE.MeshPhongMaterial({ color: 0xff0000 }), 
    gateFlag: new THREE.MeshPhongMaterial({ color: 0x0033cc }), 
    skis: new THREE.MeshLambertMaterial({ color: 0x111111 }),
    yeti: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.1 })
};

// --- GAME LOGIC ---
const SKIER_COLORS = { '⛷️': 0xFFD700, '🏂': 0xFF00FF, '🏃‍♂️': 0x00FF00, '🚴‍♀️': 0xFF0000, '🛹': 0x0000FF };
const SKIER_OPTIONS = Object.keys(SKIER_COLORS);

const mapX = (val) => (val - 400) * 0.15;
const mapZ = (val) => (val - 50) * 0.15; 

const PLAYER_SPEED_X = 5;
const GAME_INITIAL_SPEED_Y = 4;
const GAME_SPEED_INCREMENT = 0.0005;
const AUTOBOT_DETECTION_RANGE = 450;

let gameRunning = false;
let gameSpeedY, score, distance, highScore;
let player, obstacles = [], yeti, yetiActive = false;
let currentSkierChar = localStorage.getItem('skierChar') || SKIER_OPTIONS[0];
let autobotEnabled = false;
let devModeEnabled = false;
let currentBotAlgorithmIndex = 0;

const scoreDisplay = document.getElementById('score-display');
const distanceDisplay = document.getElementById('distance-display');
const highScoreDisplay = document.getElementById('high-score-display');
const modeIndicator = document.getElementById('mode-indicator');
const startMenu = document.getElementById('start-menu');
const gameOverMenu = document.getElementById('game-over-menu');
const hud = document.getElementById('hud');
const finalScoreEl = document.getElementById('final-score');
const finalHighScoreEl = document.getElementById('final-high-score');

class Player {
    constructor(x, y, char) {
        this.x = x;
        this.y = y; 
        this.width = 40;
        this.height = 40;
        this.dx = 0;
        this.isJumping = false;
        this.jumpTimer = 0;
        this.group = new THREE.Group();
        
        const color = SKIER_COLORS[char] || 0xFFD700;
        const bodyMat = new THREE.MeshPhongMaterial({ color: color, shininess: 50 });
        const body = new THREE.Mesh(skierBodyGeo, bodyMat);
        body.position.y = 3;
        body.castShadow = true;
        
        const leftSki = new THREE.Mesh(skiGeo, materials.skis);
        leftSki.position.set(-1.5, 0.25, 0);
        leftSki.castShadow = true;
        const rightSki = new THREE.Mesh(skiGeo, materials.skis);
        rightSki.position.set(1.5, 0.25, 0);
        rightSki.castShadow = true;
        
        this.group.add(body, leftSki, rightSki);
        scene.add(this.group);
    }

    startJump() {
        if (!this.isJumping) {
            this.isJumping = true;
            this.jumpTimer = 60;
        }
    }

    update() {
        this.x += this.dx;
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > 800) this.x = 800 - this.width;

        if (this.isJumping) {
            this.jumpTimer--;
            if (this.jumpTimer <= 0) this.isJumping = false;
        }

        this.group.position.x = mapX(this.x);
        this.group.position.z = mapZ(this.y);
        
        this.group.rotation.z = this.dx * 0.05; 
        this.group.rotation.y = this.dx * 0.1;
        
        if (this.isJumping) {
            this.group.position.y = Math.sin((60 - this.jumpTimer) / 60 * Math.PI) * 10;
            this.group.rotation.x = -0.5;
        } else {
            this.group.position.y = 0;
            this.group.rotation.x = 0;
        }
    }
    
    destroy() {
        scene.remove(this.group);
    }
}

class Obstacle {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = 40;
        this.height = 40;
        this.points = 0;
        this.mesh = new THREE.Group();

        if (type === 'tree') {
            const leaves = new THREE.Mesh(treeGeo, materials.treeLeaves);
            leaves.position.y = 6;
            leaves.castShadow = true; 
            leaves.receiveShadow = true;
            const trunk = new THREE.Mesh(trunkGeo, materials.treeTrunk);
            trunk.position.y = 2;
            trunk.castShadow = true;
            this.mesh.add(trunk, leaves);
            this.points = -1;
            this.collisionType = 'crash';
        } else if (type === 'rock') {
            const rock = new THREE.Mesh(rockGeo, materials.rock);
            rock.position.y = 2;
            rock.scale.set(1.2, 0.8, 1);
            rock.castShadow = true; 
            this.mesh.add(rock);
            this.points = -1;
            this.collisionType = 'crash';
        } else if (type === 'mogul') {
            const mogul = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), materials.mogul);
            mogul.position.y = 0;
            mogul.scale.set(1, 0.5, 1);
            mogul.receiveShadow = true; 
            this.mesh.add(mogul);
            this.points = 100;
            this.collisionType = 'jump';
        } else if (type === 'gate') {
            const poleL = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10), materials.gatePole);
            poleL.position.set(-5, 5, 0);
            poleL.castShadow = true;
            const poleR = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10), materials.gatePole);
            poleR.position.set(5, 5, 0);
            poleR.castShadow = true;
            const flag = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.2), materials.gateFlag);
            flag.position.set(0, 7, 0);
            flag.castShadow = true;
            this.mesh.add(poleL, poleR, flag);
            this.points = 50;
            this.collisionType = 'gate';
        }

        scene.add(this.mesh);
        this.updatePosition();
    }

    update() {
        this.y -= gameSpeedY; 
        this.updatePosition();
    }

    updatePosition() {
        this.mesh.position.x = mapX(this.x);
        this.mesh.position.z = mapZ(this.y);
    }

    destroy() {
        scene.remove(this.mesh);
    }
}

class Yeti extends Obstacle {
    constructor(x, y) {
        super(x, y, 'yeti');
        this.mesh.clear(); 
        this.width = 60;
        this.height = 60;
        this.collisionType = 'yeti';
        
        const body = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 4), materials.yeti);
        body.position.y = 4;
        body.castShadow = true;
        
        const head = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), materials.yeti);
        head.position.y = 10;
        head.castShadow = true;
        
        const armL = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), materials.yeti);
        armL.position.set(-4, 6, 2);
        armL.rotation.x = -1;
        armL.castShadow = true;
        
        const armR = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), materials.yeti);
        armR.position.set(4, 6, 2);
        armR.rotation.x = -1;
        armR.castShadow = true;

        const eyeGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const eyeMat = new THREE.MeshBasicMaterial({color: 0xff0000});
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-1, 10, 2.1);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(1, 10, 2.1);

        this.mesh.add(body, head, armL, armR, eyeL, eyeR);
        scene.add(this.mesh);
    }

    update() {
        const targetX = player.x - 10;
        if (this.x < targetX) this.x += Math.min(2, targetX - this.x);
        if (this.x > targetX) this.x -= Math.min(2, this.x - targetX);
        this.y -= (gameSpeedY * 1.05);
        this.updatePosition();
        
        this.mesh.rotation.z = Math.sin(Date.now() * 0.01) * 0.1;
    }
}

// --- AUTOBOT ALGORITHMS ---
const BOT_ALGORITHMS = [
    {
        name: 'GateHunter',
        logic: (obsList) => {
            const immediateThreats = obsList.filter(o => 
                (o.collisionType === 'crash' || o.collisionType === 'yeti') && 
                o.y > player.y && 
                o.y < player.y + 120
            );
            const gates = obsList.filter(o => o.collisionType === 'gate' && o.y > player.y);
            
            if (immediateThreats.length > 0) {
                const threat = immediateThreats.sort((a,b) => a.y - b.y)[0];
                const threatCenter = threat.x + (threat.width / 2);
                if (Math.abs(player.x - threatCenter) < 50) {
                    if (player.x < threatCenter) player.dx = -PLAYER_SPEED_X;
                    else player.dx = PLAYER_SPEED_X;
                    return;
                }
            }

            if (gates.length > 0) {
                const targetGate = gates.sort((a,b) => a.y - b.y)[0];
                const gateCenter = targetGate.x + 10;
                if (player.x < gateCenter - 10) player.dx = PLAYER_SPEED_X;
                else if (player.x > gateCenter + 10) player.dx = -PLAYER_SPEED_X;
                else player.dx = 0;
                return;
            }

            if (player.x < 300) player.dx = PLAYER_SPEED_X * 0.5;
            else if (player.x > 500) player.dx = -PLAYER_SPEED_X * 0.5;
            else player.dx = 0;
        }
    },
    {
        name: 'Survivalist',
        logic: (obsList) => {
            // Prioritize dodging over everything else
            const threats = obsList.filter(o => (o.collisionType === 'crash' || o.collisionType === 'yeti') && o.y < player.y + 180);
            
            if (threats.length > 0) {
                const t = threats.sort((a,b) => a.y - b.y)[0]; // Closest threat
                // Simple avoidance: if threat is to the left, go right, etc.
                if (t.x + 20 < player.x) player.dx = PLAYER_SPEED_X;
                else if (t.x > player.x) player.dx = -PLAYER_SPEED_X;
                else player.dx = PLAYER_SPEED_X; // Panic move
            } else {
                // Return to center if safe
                if (player.x < 350) player.dx = PLAYER_SPEED_X * 0.5;
                else if (player.x > 450) player.dx = -PLAYER_SPEED_X * 0.5;
                else player.dx = 0;
            }
        }
    }
];

function runAutobot() {
    const relevant = obstacles.filter(o => o.y > player.y - 50 && o.y < player.y + AUTOBOT_DETECTION_RANGE);
    const algo = BOT_ALGORITHMS[currentBotAlgorithmIndex % BOT_ALGORITHMS.length].logic;
    algo(relevant);
}

function startGame() {
    if (player) player.destroy();
    obstacles.forEach(o => o.destroy());
    obstacles = [];
    
    gameRunning = true;
    gameSpeedY = GAME_INITIAL_SPEED_Y;
    score = 0;
    distance = 0;
    highScore = parseInt(localStorage.getItem('ski3dHighScore') || '0');
    yetiActive = false;
    yeti = null;
    
    player = new Player(380, 50, currentSkierChar);
    
    startMenu.style.display = 'none';
    gameOverMenu.style.display = 'none';
    hud.style.display = 'flex';
    
    animate();
}

function gameOver() {
    gameRunning = false;
    if (!autobotEnabled) {
        if (score > highScore) {
            highScore = Math.floor(score);
            localStorage.setItem('ski3dHighScore', highScore);
        }
        saveLeaderboard(Math.floor(score));
    }
    finalScoreEl.textContent = Math.floor(score);
    finalHighScoreEl.textContent = highScore;
    hud.style.display = 'none';
    gameOverMenu.style.display = 'flex';
}

function spawnObstacles() {
    for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].y < -2000) { 
            obstacles[i].destroy();
            obstacles.splice(i, 1);
        }
    }

    if (obstacles.length > 50) return; 

    if (Math.random() < 0.05) {
        const x = Math.random() * 760;
        const y = 800; 
        const r = Math.random();
        let type;
        
        if (r < 0.4) type = 'tree';
        else if (r < 0.6) type = 'rock';
        else if (r < 0.7) type = 'mogul';
        else type = 'gate'; 
        
        obstacles.push(new Obstacle(x, y, type));
    }
}

function checkCollisions() {
    const pRect = { l: player.x + 10, r: player.x + 30, t: player.y + 10, b: player.y + 30 };
    
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        const oRect = { l: obs.x + 5, r: obs.x + obs.width - 5, t: obs.y + 5, b: obs.y + obs.height - 5 };

        if (pRect.l < oRect.r && pRect.r > oRect.l && pRect.t < oRect.b && pRect.b > oRect.t) {
            if (player.isJumping && obs.collisionType === 'crash') continue; 
            
            if (obs.collisionType === 'crash' || obs.collisionType === 'yeti') {
                gameOver();
            } else if (obs.collisionType === 'jump') {
                player.startJump();
                score += obs.points;
            } else if (obs.collisionType === 'gate') {
                score += obs.points;
                const tempGeo = new THREE.BoxGeometry(10,10,10);
                const tempMat = new THREE.MeshBasicMaterial({color: 0x00ff00, transparent: true, opacity: 0.8});
                const particle = new THREE.Mesh(tempGeo, tempMat);
                particle.position.set(mapX(obs.x), 5, mapZ(obs.y));
                scene.add(particle);
                setTimeout(()=>scene.remove(particle), 100);

                obs.destroy();
                obstacles.splice(i, 1);
            }
        }
    }
}

function animate() {
    if (!gameRunning) return;

    requestAnimationFrame(animate);

    if (autobotEnabled) runAutobot();
    
    player.update();
    obstacles.forEach(o => o.update());
    
    distance += gameSpeedY / 20;
    score += gameSpeedY / 10;
    gameSpeedY += GAME_SPEED_INCREMENT;

    spawnObstacles();
    checkCollisions();

    if (distance > 2000 && !yetiActive) {
        yetiActive = true;
        yeti = new Yeti(Math.random() * 700, 1000);
        obstacles.push(yeti);
    }

    scoreDisplay.textContent = `Score: ${Math.floor(score)}`;
    distanceDisplay.textContent = `Dist: ${Math.floor(distance)}m`;
    highScoreDisplay.textContent = `Best: ${highScore}`;
    
    let modeText = '';
    if (autobotEnabled) modeText += `[BOT: ${BOT_ALGORITHMS[currentBotAlgorithmIndex%2].name}] `;
    if (devModeEnabled) modeText += '[DEV]';
    modeIndicator.textContent = modeText;

    renderer.render(scene, camera);
}

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    
    // Help Toggle
    if (k === 'h') {
        const modal = document.getElementById('help-modal');
        modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
        return;
    }

    if (k === 'b') { autobotEnabled = !autobotEnabled; if(player) player.dx=0; }
    if (k === 'd') devModeEnabled = !devModeEnabled;
    if (k >= '1' && k <= '4') currentBotAlgorithmIndex = parseInt(k) - 1;

    if (!gameRunning || autobotEnabled) return;
    
    if (e.key === 'ArrowLeft') player.dx = -PLAYER_SPEED_X;
    if (e.key === 'ArrowRight') player.dx = PLAYER_SPEED_X;
    if (e.key === 'ArrowDown') player.dx = 0;
});

document.getElementById('start-button').onclick = startGame;
document.getElementById('retry-button').onclick = startGame;
document.getElementById('main-menu-button').onclick = () => { gameOverMenu.style.display = 'none'; startMenu.style.display = 'flex'; };

function saveLeaderboard(s) {
    let b = JSON.parse(localStorage.getItem('ski3dLeaderboard') || '[]');
    b.push(s); b.sort((x,y)=>y-x); b = b.slice(0,5);
    localStorage.setItem('ski3dLeaderboard', JSON.stringify(b));
}

const list = document.getElementById('leaderboard-list');
document.getElementById('leaderboard-button').onclick = () => {
    document.getElementById('leaderboard-modal').style.display = 'flex';
    list.innerHTML = '';
    JSON.parse(localStorage.getItem('ski3dLeaderboard')||'[]').forEach((s,i)=> {
        list.innerHTML += `<li>${s}</li>`;
    });
};

const optContainer = document.getElementById('skier-options');
document.getElementById('customize-button').onclick = () => {
    document.getElementById('customize-modal').style.display = 'flex';
    optContainer.innerHTML = '';
    SKIER_OPTIONS.forEach(char => {
        const d = document.createElement('div');
        d.className = `skier-option ${char===currentSkierChar?'selected':''}`;
        d.textContent = char;
        d.onclick = () => { 
            currentSkierChar = char; 
            localStorage.setItem('skierChar', char); 
            document.querySelectorAll('.skier-option').forEach(x=>x.classList.remove('selected')); 
            d.classList.add('selected'); 
        };
        optContainer.appendChild(d);
    });
};

document.querySelectorAll('.close-button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.modal').forEach(m=>m.style.display='none');
});
