import * as THREE from 'three';

export interface ScoutActor {
  group: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  head: THREE.Group;
  carriedDossier: THREE.Group;
  homePos: THREE.Vector3;
  boardPos: THREE.Vector3;
  deskPos: THREE.Vector3;
  departmentName: string;
  accentColor: number;
}

export interface LawyerActor {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  head: THREE.Group;
  torso: THREE.Group;
  seatPos: THREE.Vector3;
  podiumPos: THREE.Vector3;
  accentColor: number;
  label: string;
}

export interface JudgeActor {
  group: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  gavel?: THREE.Group;
  basePos: THREE.Vector3;
}

export interface EvaluatedDossier {
  group: THREE.Group;
  coverMesh: THREE.Mesh;
  glowRing: THREE.Mesh;
  startPos: THREE.Vector3;
  reviewPos: THREE.Vector3;
  pedestalPos: THREE.Vector3;
  rejectedPos: THREE.Vector3;
  index: number;
}

export interface ConfettiPieceMeta {
  x: number;
  baseY: number;
  z: number;
  speedY: number;
  swayPhase: number;
  spinSpeed: number;
}

export interface CourtroomRig {
  scouts: ScoutActor[];
  lawyers: LawyerActor[];
  judges: JudgeActor[];
  evaluatedDossiers: EvaluatedDossier[];
  pedestalRings: THREE.Mesh[];
  rejectedRings: THREE.Mesh[];
  scalesBeam: THREE.Group;
  debateBeamA: THREE.Mesh;
  debateBeamB: THREE.Mesh;
  spotlightCone: THREE.Mesh;
  gavelShockwave: THREE.Mesh;
  celebrationConfetti: THREE.InstancedMesh;
  confettiMeta: ConfettiPieceMeta[];
  disposables: Array<{ dispose: () => void }>;
}

function createFloorTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e2430';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle inlaid marble/slate grid
  const tile = 64;
  for (let y = 0; y < 512; y += tile) {
    for (let x = 0; x < 512; x += tile) {
      const checker = ((x / tile) + (y / tile)) % 2 === 0;
      ctx.fillStyle = checker ? '#232a38' : '#1c222e';
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      ctx.strokeStyle = '#2f384a';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = maxAniso;
  return tex;
}

function createWoodTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4a2c1d';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 64; i++) {
    const y = i * 4;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(30, 14, 7, 0.25)' : 'rgba(110, 68, 42, 0.16)';
    ctx.fillRect(0, y, 256, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createBoardScreenTexture(title: string, subtitle: string, accent: string, maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 320);

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 512, 14);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(title, 28, 72);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '20px "Public Sans", system-ui, sans-serif';
  ctx.fillText(subtitle, 28, 108);

  // Simulated job listing lines
  for (let i = 0; i < 4; i++) {
    const y = 138 + i * 40;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(28, y, 456, 28);
    ctx.fillStyle = accent;
    ctx.fillRect(28, y, 8, 28);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(48, y + 9, 220 + (i % 2) * 80, 10);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(390, y + 9, 74, 10);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.18)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function createDossier(accentColor: number, disposables: Array<{ dispose: () => void }>): {
  group: THREE.Group;
  coverMesh: THREE.Mesh;
  glowRing: THREE.Mesh;
} {
  const group = new THREE.Group();

  const folderGeo = new THREE.BoxGeometry(0.46, 0.06, 0.6);
  const folderMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.45,
    metalness: 0.05,
  });
  const folderMesh = new THREE.Mesh(folderGeo, folderMat);
  folderMesh.position.y = 0.03;
  folderMesh.castShadow = true;
  group.add(folderMesh);

  const coverGeo = new THREE.BoxGeometry(0.47, 0.025, 0.58);
  const coverMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.35,
    metalness: 0.25,
    emissive: new THREE.Color(accentColor),
    emissiveIntensity: 0.18,
  });
  const coverMesh = new THREE.Mesh(coverGeo, coverMat);
  coverMesh.position.y = 0.068;
  coverMesh.castShadow = true;
  group.add(coverMesh);

  const sealGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.015, 20);
  const sealMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.2,
    metalness: 0.85,
  });
  const seal = new THREE.Mesh(sealGeo, sealMat);
  seal.position.set(0.11, 0.085, 0.14);
  group.add(seal);

  const ringGeo = new THREE.RingGeometry(0.32, 0.39, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glowRing = new THREE.Mesh(ringGeo, ringMat);
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.y = 0.01;
  group.add(glowRing);

  disposables.push(folderGeo, folderMat, coverGeo, coverMat, sealGeo, sealMat, ringGeo, ringMat);
  return { group, coverMesh, glowRing };
}

function createScoutWorker(
  accentColor: number,
  shadowTex: THREE.CanvasTexture,
  disposables: Array<{ dispose: () => void }>
): Omit<ScoutActor, 'homePos' | 'boardPos' | 'deskPos' | 'departmentName' | 'accentColor'> {
  const group = new THREE.Group();

  // Ground contact shadow
  const shadowGeo = new THREE.PlaneGeometry(1.15, 1.15);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  group.add(shadow);

  const suitMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72, metalness: 0.08 });
  const vestMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.45, metalness: 0.15 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe6b89c, roughness: 0.6, metalness: 0.02 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.2 });

  const legGeo = new THREE.CapsuleGeometry(0.09, 0.42, 6, 12);
  const bootGeo = new THREE.BoxGeometry(0.18, 0.12, 0.28);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.14, 0.58, 0);
  const leftLegMesh = new THREE.Mesh(legGeo, suitMat);
  leftLegMesh.position.y = -0.25;
  leftLegMesh.castShadow = true;
  const leftBoot = new THREE.Mesh(bootGeo, bootMat);
  leftBoot.position.set(0, -0.52, 0.05);
  leftLeg.add(leftLegMesh, leftBoot);
  group.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.14, 0.58, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, suitMat);
  rightLegMesh.position.y = -0.25;
  rightLegMesh.castShadow = true;
  const rightBoot = new THREE.Mesh(bootGeo, bootMat);
  rightBoot.position.set(0, -0.52, 0.05);
  rightLeg.add(rightLegMesh, rightBoot);
  group.add(rightLeg);

  // Torso + Scout Vest
  const torsoGeo = new THREE.CylinderGeometry(0.24, 0.21, 0.68, 16);
  const torso = new THREE.Mesh(torsoGeo, suitMat);
  torso.position.y = 0.94;
  torso.castShadow = true;
  group.add(torso);

  const vestGeo = new THREE.CylinderGeometry(0.255, 0.225, 0.46, 16);
  const vest = new THREE.Mesh(vestGeo, vestMat);
  vest.position.y = 0.96;
  vest.castShadow = true;
  group.add(vest);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.38, 6, 10);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.31, 1.2, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, suitMat);
  leftArmMesh.position.y = -0.2;
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.31, 1.2, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, suitMat);
  rightArmMesh.position.y = -0.2;
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  group.add(rightArm);

  // Head + Scout Visor Cap
  const head = new THREE.Group();
  head.position.y = 1.44;
  const headGeo = new THREE.SphereGeometry(0.2, 18, 16);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  head.add(headMesh);

  const capGeo = new THREE.SphereGeometry(0.21, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const cap = new THREE.Mesh(capGeo, vestMat);
  cap.position.y = 0.03;
  head.add(cap);

  const brimGeo = new THREE.BoxGeometry(0.26, 0.03, 0.16);
  const brim = new THREE.Mesh(brimGeo, bootMat);
  brim.position.set(0, 0.06, 0.18);
  head.add(brim);
  group.add(head);

  // Carried Dossier Batch Stack (3 stacked folders when Scouts submit a bunch of jobs at once)
  const carriedDossier = new THREE.Group();
  carriedDossier.position.set(0, 0.96, 0.4);
  carriedDossier.rotation.x = 0.22;
  for (let s = 0; s < 3; s++) {
    const stackLayer = createDossier(s === 2 ? accentColor : 0xf59e0b, disposables);
    stackLayer.group.position.set((s - 1) * 0.02, s * 0.09, 0);
    stackLayer.group.rotation.y = (s - 1) * 0.08;
    carriedDossier.add(stackLayer.group);
  }
  carriedDossier.visible = false;
  group.add(carriedDossier);

  disposables.push(
    shadowGeo, shadowMat, suitMat, vestMat, skinMat, bootMat,
    legGeo, bootGeo, torsoGeo, vestGeo, armGeo, headGeo, capGeo, brimGeo
  );

  return { group, leftLeg, rightLeg, leftArm, rightArm, head, carriedDossier };
}

function createLawyerSubAgent(
  accentColor: number,
  shadowTex: THREE.CanvasTexture,
  disposables: Array<{ dispose: () => void }>
): Omit<LawyerActor, 'seatPos' | 'podiumPos' | 'accentColor' | 'label'> {
  const group = new THREE.Group();

  const shadowGeo = new THREE.PlaneGeometry(1.35, 1.35);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.6,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  group.add(shadow);

  const robeCoatMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55, metalness: 0.12 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7, metalness: 0.02 });
  const tieMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.35,
    metalness: 0.25,
    emissive: new THREE.Color(accentColor),
    emissiveIntensity: 0.12,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdfb195, roughness: 0.58, metalness: 0.02 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.9 });

  // Lower Suit / Trousers
  const legGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.72, 12);
  const leftLeg = new THREE.Mesh(legGeo, robeCoatMat);
  leftLeg.position.set(-0.14, 0.36, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeo, robeCoatMat);
  rightLeg.position.set(0.14, 0.36, 0);
  rightLeg.castShadow = true;
  group.add(leftLeg, rightLeg);

  // Upper Body Group (allows leaning forward when arguing!)
  const torso = new THREE.Group();
  torso.position.y = 0.72;

  const jacketGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.78, 16);
  const jacket = new THREE.Mesh(jacketGeo, robeCoatMat);
  jacket.position.y = 0.39;
  jacket.castShadow = true;
  torso.add(jacket);

  // Shirt & Silk Tie / Counsel Stole
  const bibGeo = new THREE.BoxGeometry(0.18, 0.45, 0.06);
  const bib = new THREE.Mesh(bibGeo, shirtMat);
  bib.position.set(0, 0.52, 0.23);
  torso.add(bib);

  const tieGeo = new THREE.BoxGeometry(0.075, 0.42, 0.04);
  const tie = new THREE.Mesh(tieGeo, tieMat);
  tie.position.set(0, 0.48, 0.255);
  torso.add(tie);

  // Counsel Lapel Pin
  const pinGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12);
  const pin = new THREE.Mesh(pinGeo, goldMat);
  pin.rotation.x = Math.PI / 2;
  pin.position.set(-0.13, 0.58, 0.25);
  torso.add(pin);

  // Articulated Arms
  const upperArmGeo = new THREE.CapsuleGeometry(0.08, 0.46, 6, 10);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.34, 0.68, 0);
  const leftArmMesh = new THREE.Mesh(upperArmGeo, robeCoatMat);
  leftArmMesh.position.y = -0.22;
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  torso.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.34, 0.68, 0);
  const rightArmMesh = new THREE.Mesh(upperArmGeo, robeCoatMat);
  rightArmMesh.position.y = -0.22;
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  torso.add(rightArm);

  // Head + Hair/Spectacles
  const head = new THREE.Group();
  head.position.y = 0.98;
  const headGeo = new THREE.SphereGeometry(0.21, 18, 16);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  head.add(headMesh);

  const hairGeo = new THREE.SphereGeometry(0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 0.02;
  head.add(hair);

  // Counsel Glasses Rim
  const frameGeo = new THREE.TorusGeometry(0.055, 0.01, 8, 16);
  const leftLens = new THREE.Mesh(frameGeo, goldMat);
  leftLens.position.set(-0.075, 0.02, 0.195);
  const rightLens = new THREE.Mesh(frameGeo, goldMat);
  rightLens.position.set(0.075, 0.02, 0.195);
  head.add(leftLens, rightLens);

  torso.add(head);
  group.add(torso);

  disposables.push(
    shadowGeo, shadowMat, robeCoatMat, shirtMat, tieMat, skinMat, goldMat,
    legGeo, jacketGeo, bibGeo, tieGeo, pinGeo, upperArmGeo, headGeo, hairGeo, hairMat, frameGeo
  );

  return { group, leftArm, rightArm, head, torso };
}

function createJudgeArbiter(
  isChief: boolean,
  disposables: Array<{ dispose: () => void }>
): Omit<JudgeActor, 'basePos'> {
  const group = new THREE.Group();

  const robeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.1 });
  const stoleMat = new THREE.MeshStandardMaterial({
    color: isChief ? 0xf59e0b : 0x3b82f6,
    roughness: 0.28,
    metalness: 0.65,
    emissive: new THREE.Color(isChief ? 0xd97706 : 0x2563eb),
    emissiveIntensity: 0.14,
  });
  const collarMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe2b49a, roughness: 0.55 });
  const hairMat = new THREE.MeshStandardMaterial({
    color: isChief ? 0xe2e8f0 : 0x334155,
    roughness: 0.65,
  });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x1e1b18, roughness: 0.45, metalness: 0.15 });
  const brassChairMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.25, metalness: 0.85 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3b22, roughness: 0.35, metalness: 0.1 });

  // Tall Judicial Throne Chair (pedestal base on dais -> high leather seat & commanding crest backrest)
  const chairPedestalGeo = new THREE.CylinderGeometry(0.11, 0.24, 0.72, 16);
  const chairPedestal = new THREE.Mesh(chairPedestalGeo, brassChairMat);
  chairPedestal.position.set(0, 0.36, -0.05);
  group.add(chairPedestal);

  const seatGeo = new THREE.BoxGeometry(0.82, 0.14, 0.72);
  const seat = new THREE.Mesh(seatGeo, leatherMat);
  seat.position.set(0, 0.74, 0);
  seat.castShadow = true;
  group.add(seat);

  const backrestGeo = new THREE.BoxGeometry(0.84, 1.48, 0.14);
  const backrest = new THREE.Mesh(backrestGeo, leatherMat);
  backrest.position.set(0, 1.52, -0.34);
  backrest.castShadow = true;
  group.add(backrest);

  const crestGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.15, 20, 1, false, 0, Math.PI);
  const crest = new THREE.Mesh(crestGeo, woodMat);
  crest.rotation.z = Math.PI / 2;
  crest.rotation.y = Math.PI / 2;
  crest.position.set(0, 2.26, -0.34);
  group.add(crest);

  // Judge Torso perched high on the judicial seat (well above benchTop at 1.98!)
  const torsoGeo = new THREE.CylinderGeometry(0.32, 0.4, 0.96, 16);
  const torso = new THREE.Mesh(torsoGeo, robeMat);
  torso.position.set(0, 1.26, 0.04);
  torso.castShadow = true;
  group.add(torso);

  const collarGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.14, 16);
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.set(0, 1.72, 0.06);
  group.add(collar);

  const stoleGeo = new THREE.BoxGeometry(0.38, 0.68, 0.36);
  const stole = new THREE.Mesh(stoleGeo, stoleMat);
  stole.position.set(0, 1.38, 0.09);
  group.add(stole);

  // Prominent Raised Head clearly visible above benchTop
  const head = new THREE.Group();
  head.position.set(0, 1.98, 0.06);
  const headGeo = new THREE.SphereGeometry(0.25, 20, 18);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  head.add(headMesh);

  const wigHairGeo = new THREE.SphereGeometry(0.26, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const wigHair = new THREE.Mesh(wigHairGeo, hairMat);
  wigHair.position.y = 0.025;
  head.add(wigHair);
  group.add(head);

  // Left articulated arm (can rest or clap/celebrate)
  const armGeo = new THREE.CapsuleGeometry(0.085, 0.46, 6, 10);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.38, 1.62, 0.06);
  const leftArmMesh = new THREE.Mesh(armGeo, robeMat);
  leftArmMesh.position.y = -0.2;
  leftArm.add(leftArmMesh);
  leftArm.rotation.x = -0.35;
  group.add(leftArm);

  // Right articulated arm (holds oversized visible gavel for Chief Arbiter)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.38, 1.62, 0.06);
  const rightArmMesh = new THREE.Mesh(armGeo, robeMat);
  rightArmMesh.position.y = -0.2;
  rightArm.add(rightArmMesh);

  let gavel: THREE.Group | undefined;
  if (isChief) {
    gavel = new THREE.Group();
    const handleGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.62, 12);
    const handle = new THREE.Mesh(handleGeo, woodMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, -0.38, 0.34);

    const headCylGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.3, 16);
    const gavelHead = new THREE.Mesh(headCylGeo, woodMat);
    gavelHead.rotation.z = Math.PI / 2;
    gavelHead.position.set(0, -0.38, 0.62);

    const brassBandMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.18, metalness: 0.92 });
    const bandGeo = new THREE.CylinderGeometry(0.118, 0.118, 0.06, 16);
    const band = new THREE.Mesh(bandGeo, brassBandMat);
    band.rotation.z = Math.PI / 2;
    band.position.set(0, -0.38, 0.62);

    gavel.add(handle, gavelHead, band);
    rightArm.add(gavel);
    disposables.push(handleGeo, headCylGeo, bandGeo, brassBandMat);
  }
  group.add(rightArm);

  disposables.push(
    robeMat, stoleMat, collarMat, skinMat, hairMat, leatherMat, brassChairMat, woodMat,
    chairPedestalGeo, seatGeo, backrestGeo, crestGeo, torsoGeo, collarGeo, stoleGeo, headGeo, wigHairGeo, armGeo
  );
  return { group, head, leftArm, rightArm, gavel };
}

export function buildCourtroomScene(
  scene: THREE.Scene,
  maxAnisotropy: number
): CourtroomRig {
  const disposables: Array<{ dispose: () => void }> = [];

  const floorTex = createFloorTexture(maxAnisotropy);
  const woodTex = createWoodTexture(maxAnisotropy);
  const shadowTex = createContactShadowTexture();
  disposables.push(floorTex, woodTex, shadowTex);

  // 1. Courtroom Floor & Elevated Judicial Dais
  const floorGeo = new THREE.PlaneGeometry(34, 28);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.38,
    metalness: 0.14,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  disposables.push(floorGeo, floorMat);

  // Center Seal Carpet (offset +0.02 on Y to prevent Z-fighting)
  const rugGeo = new THREE.CircleGeometry(3.4, 48);
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0x172554,
    roughness: 0.88,
    metalness: 0.02,
  });
  const rug = new THREE.Mesh(rugGeo, rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.02, 0.2);
  rug.receiveShadow = true;
  scene.add(rug);

  const rugTrimGeo = new THREE.RingGeometry(3.25, 3.42, 48);
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.22,
    metalness: 0.9,
  });
  const rugTrim = new THREE.Mesh(rugTrimGeo, brassMat);
  rugTrim.rotation.x = -Math.PI / 2;
  rugTrim.position.set(0, 0.03, 0.2);
  scene.add(rugTrim);
  disposables.push(rugGeo, rugMat, rugTrimGeo, brassMat);

  // Back Wood Wainscot Wall & Architectural Columns
  const woodMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.42,
    metalness: 0.08,
  });
  const wallSlateMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.85,
    metalness: 0.05,
  });

  const backWallGeo = new THREE.BoxGeometry(28, 8.5, 0.5);
  const backWall = new THREE.Mesh(backWallGeo, wallSlateMat);
  backWall.position.set(0, 4.25, -7.2);
  backWall.receiveShadow = true;
  scene.add(backWall);

  const wainscotGeo = new THREE.BoxGeometry(27.8, 2.8, 0.6);
  const wainscot = new THREE.Mesh(wainscotGeo, woodMat);
  wainscot.position.set(0, 1.4, -7.1);
  scene.add(wainscot);

  const pillarGeo = new THREE.CylinderGeometry(0.32, 0.36, 8.2, 16);
  [-10, -5.5, 5.5, 10].forEach((x) => {
    const pillar = new THREE.Mesh(pillarGeo, woodMat);
    pillar.position.set(x, 4.1, -6.7);
    pillar.castShadow = true;
    scene.add(pillar);
  });
  disposables.push(woodMat, wallSlateMat, backWallGeo, wainscotGeo, pillarGeo);

  // 2. Elevated Supreme Jury Bench (Rear Center)
  const daisGeo = new THREE.BoxGeometry(9.6, 0.55, 3.2);
  const dais = new THREE.Mesh(daisGeo, woodMat);
  dais.position.set(0, 0.275, -4.6);
  dais.receiveShadow = true;
  dais.castShadow = true;
  scene.add(dais);

  const benchFrontGeo = new THREE.BoxGeometry(8.8, 1.35, 0.9);
  const benchFront = new THREE.Mesh(benchFrontGeo, woodMat);
  benchFront.position.set(0, 1.22, -3.55);
  benchFront.castShadow = true;
  benchFront.receiveShadow = true;
  scene.add(benchFront);

  const benchTopGeo = new THREE.BoxGeometry(9.0, 0.12, 1.1);
  const benchTop = new THREE.Mesh(benchTopGeo, brassMat);
  benchTop.position.set(0, 1.92, -3.55);
  scene.add(benchTop);
  disposables.push(daisGeo, benchFrontGeo, benchTopGeo);

  // Brass Scales of Justice Centerpiece on Jury Bench
  const scalesGroup = new THREE.Group();
  scalesGroup.position.set(0, 1.98, -3.45);
  const standGeo = new THREE.CylinderGeometry(0.04, 0.14, 0.85, 16);
  const stand = new THREE.Mesh(standGeo, brassMat);
  stand.position.y = 0.42;
  scalesGroup.add(stand);

  const scalesBeam = new THREE.Group();
  scalesBeam.position.y = 0.82;
  const beamBarGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.0, 12);
  const beamBar = new THREE.Mesh(beamBarGeo, brassMat);
  beamBar.rotation.z = Math.PI / 2;
  scalesBeam.add(beamBar);

  const panGeo = new THREE.CylinderGeometry(0.18, 0.08, 0.08, 16);
  const leftPan = new THREE.Mesh(panGeo, brassMat);
  leftPan.position.set(-0.46, -0.34, 0);
  const rightPan = new THREE.Mesh(panGeo, brassMat);
  rightPan.position.set(0.46, -0.34, 0);
  scalesBeam.add(leftPan, rightPan);
  scalesGroup.add(scalesBeam);
  scene.add(scalesGroup);
  disposables.push(standGeo, beamBarGeo, panGeo);

  // Wooden Gavel Sounding Block & Impact Shockwave Ring
  const blockGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.12, 24);
  const soundingBlock = new THREE.Mesh(blockGeo, woodMat);
  soundingBlock.position.set(0.36, 2.04, -3.55);
  soundingBlock.castShadow = true;
  scene.add(soundingBlock);

  const shockGeo = new THREE.RingGeometry(0.22, 0.34, 32);
  const shockMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const gavelShockwave = new THREE.Mesh(shockGeo, shockMat);
  gavelShockwave.rotation.x = -Math.PI / 2;
  gavelShockwave.position.set(0.36, 2.11, -3.55);
  scene.add(gavelShockwave);
  disposables.push(blockGeo, shockGeo, shockMat);

  // 3 Supreme Jury Arbiters seated on tall chairs behind the bench
  const judges: JudgeActor[] = [];
  [-2.3, 0, 2.3].forEach((x, idx) => {
    const basePos = new THREE.Vector3(x, 0.55, -4.42);
    const judge = createJudgeArbiter(idx === 1, disposables);
    judge.group.position.copy(basePos);
    scene.add(judge.group);
    judges.push({ ...judge, basePos });
  });

  // 3. Discovery Zone: 4 Specialized Department Job Terminals (Left Arc)
  const boardDefs = [
    { title: 'Software & AI', sub: 'AI Agents & Code Feeds', accent: '#3b82f6', pos: new THREE.Vector3(-8.2, 0, -2.5), rotY: 0.65 },
    { title: 'Embedded & UGV', sub: 'Robotics, C++ & Hardware', accent: '#10b981', pos: new THREE.Vector3(-8.7, 0, 0.1), rotY: 0.92 },
    { title: 'Product & TPM', sub: 'Product Eng & Program', accent: '#8b5cf6', pos: new THREE.Vector3(-8.5, 0, 2.7), rotY: 1.15 },
    { title: 'QA, Sec & Ops', sub: 'Testing, Cyber & Cloud', accent: '#f59e0b', pos: new THREE.Vector3(-7.4, 0, 5.1), rotY: 1.38 },
  ];

  const pedestalBaseGeo = new THREE.BoxGeometry(1.7, 1.2, 0.7);
  const screenFrameGeo = new THREE.BoxGeometry(2.1, 1.35, 0.14);
  const screenFaceGeo = new THREE.PlaneGeometry(1.94, 1.2);
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.7 });

  boardDefs.forEach((b) => {
    const boardGroup = new THREE.Group();
    boardGroup.position.copy(b.pos);
    boardGroup.rotation.y = b.rotY;

    const base = new THREE.Mesh(pedestalBaseGeo, darkMetalMat);
    base.position.y = 0.6;
    base.castShadow = true;
    boardGroup.add(base);

    const frame = new THREE.Mesh(screenFrameGeo, darkMetalMat);
    frame.position.y = 1.9;
    frame.castShadow = true;
    boardGroup.add(frame);

    const screenTex = createBoardScreenTexture(b.title, b.sub, b.accent, maxAnisotropy);
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenTex,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: screenTex,
      emissiveIntensity: 0.55,
      roughness: 0.2,
    });
    const screen = new THREE.Mesh(screenFaceGeo, screenMat);
    screen.position.set(0, 1.9, 0.08);
    boardGroup.add(screen);

    disposables.push(screenTex, screenMat);
    scene.add(boardGroup);
  });
  disposables.push(pedestalBaseGeo, screenFrameGeo, screenFaceGeo, darkMetalMat);

  // 4. 3 Counsel Desks & Lawyer Sub-Agents
  const lawyerConfigs = [
    {
      label: 'Software & Systems Counsel',
      accent: 0x2563eb,
      deskPos: new THREE.Vector3(-3.2, 0, 2.3),
      deskRotY: 0.25,
      seatPos: new THREE.Vector3(-3.3, 0, 3.25),
      podiumPos: new THREE.Vector3(-1.35, 0, 0.25),
    },
    {
      label: 'Quality & Operations Counsel',
      accent: 0x0d9488,
      deskPos: new THREE.Vector3(0.2, 0, 3.2),
      deskRotY: 0,
      seatPos: new THREE.Vector3(0.2, 0, 4.15),
      podiumPos: new THREE.Vector3(0, 0, 0.5),
    },
    {
      label: 'Visa & Relocation Advocate',
      accent: 0xd97706,
      deskPos: new THREE.Vector3(3.6, 0, 2.3),
      deskRotY: -0.25,
      seatPos: new THREE.Vector3(3.7, 0, 3.25),
      podiumPos: new THREE.Vector3(1.35, 0, 0.25),
    },
  ];

  const deskGeo = new THREE.BoxGeometry(2.1, 0.85, 0.95);
  const deskTrimGeo = new THREE.BoxGeometry(2.16, 0.08, 1.0);
  const lawyers: LawyerActor[] = [];

  lawyerConfigs.forEach((cfg) => {
    const desk = new THREE.Group();
    desk.position.copy(cfg.deskPos);
    desk.rotation.y = cfg.deskRotY;

    const body = new THREE.Mesh(deskGeo, woodMat);
    body.position.y = 0.425;
    body.castShadow = true;
    body.receiveShadow = true;
    desk.add(body);

    const trim = new THREE.Mesh(deskTrimGeo, brassMat);
    trim.position.y = 0.86;
    desk.add(trim);
    scene.add(desk);

    const actor = createLawyerSubAgent(cfg.accent, shadowTex, disposables);
    actor.group.position.copy(cfg.seatPos);
    actor.group.rotation.y = Math.PI;
    scene.add(actor.group);

    lawyers.push({
      ...actor,
      seatPos: cfg.seatPos,
      podiumPos: cfg.podiumPos,
      accentColor: cfg.accent,
      label: cfg.label,
    });
  });
  disposables.push(deskGeo, deskTrimGeo);

  // 5. 4 Department-Specialized Scout Workers
  const scouts: ScoutActor[] = [
    {
      departmentName: 'Software & AI Scout',
      homePos: new THREE.Vector3(-5.9, 0, -1.8),
      boardPos: new THREE.Vector3(-6.8, 0, -2.1),
      deskPos: new THREE.Vector3(-3.9, 0, 1.8),
      accent: 0x3b82f6,
    },
    {
      departmentName: 'Embedded & Robotics Scout',
      homePos: new THREE.Vector3(-6.2, 0, 0.2),
      boardPos: new THREE.Vector3(-7.2, 0, 0.2),
      deskPos: new THREE.Vector3(-0.6, 0, 2.5),
      accent: 0x10b981,
    },
    {
      departmentName: 'Product & Program Scout',
      homePos: new THREE.Vector3(-6.0, 0, 2.2),
      boardPos: new THREE.Vector3(-7.0, 0, 2.5),
      deskPos: new THREE.Vector3(-2.6, 0, 2.0),
      accent: 0x8b5cf6,
    },
    {
      departmentName: 'QA & Security Scout',
      homePos: new THREE.Vector3(-5.3, 0, 4.1),
      boardPos: new THREE.Vector3(-6.2, 0, 4.5),
      deskPos: new THREE.Vector3(2.8, 0, 1.8),
      accent: 0xf59e0b,
    },
  ].map((s) => {
    const worker = createScoutWorker(s.accent, shadowTex, disposables);
    worker.group.position.copy(s.homePos);
    scene.add(worker.group);
    return {
      ...worker,
      homePos: s.homePos,
      boardPos: s.boardPos,
      deskPos: s.deskPos,
      departmentName: s.departmentName,
      accentColor: s.accent,
    };
  });

  // 6. 5 Approved Jury Pedestals (Front of Jury Bar) + 5 Crimson Rejected Case Rail Pedestals (Right Wing) + 10 Batch Dossiers
  const pedestalGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.95, 24);
  const pedestalTopGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.07, 24);
  const ringGeo = new THREE.RingGeometry(0.48, 0.56, 32);
  const crimsonMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.35, metalness: 0.45 });

  // Central Lawyer Case Examination Lectern (where selected single job sits during argument)
  const lecternPed = new THREE.Mesh(pedestalGeo, darkMetalMat);
  lecternPed.position.set(0, 0.475, 1.05);
  lecternPed.castShadow = true;
  scene.add(lecternPed);
  const lecternTop = new THREE.Mesh(pedestalTopGeo, brassMat);
  lecternTop.position.set(0, 0.97, 1.05);
  scene.add(lecternTop);

  const evaluatedDossiers: EvaluatedDossier[] = [];
  const pedestalRings: THREE.Mesh[] = [];
  const rejectedRings: THREE.Mesh[] = [];
  const evalX = [-3.2, -1.6, 0, 1.6, 3.2];
  const rejCoords: Array<[number, number]> = [
    [5.1, -1.7],
    [5.8, -0.7],
    [6.1, 0.4],
    [5.7, 1.5],
    [5.0, 2.5],
  ];

  const startDesks = [
    new THREE.Vector3(-3.6, 0.89, 2.2),
    new THREE.Vector3(-3.0, 0.91, 2.35),
    new THREE.Vector3(-2.5, 0.89, 2.15),
    new THREE.Vector3(-0.3, 0.89, 3.15),
    new THREE.Vector3(0.25, 0.91, 3.25),
    new THREE.Vector3(0.75, 0.89, 3.12),
    new THREE.Vector3(3.15, 0.89, 2.15),
    new THREE.Vector3(3.65, 0.91, 2.32),
    new THREE.Vector3(4.1, 0.89, 2.18),
    new THREE.Vector3(-0.1, 0.95, 3.22),
  ];

  // Build 5 Approved Golden/Emerald Jury Pedestals
  evalX.forEach((px, idx) => {
    const pz = -2.15;
    const ped = new THREE.Mesh(pedestalGeo, darkMetalMat);
    ped.position.set(px, 0.475, pz);
    ped.castShadow = true;
    ped.receiveShadow = true;
    scene.add(ped);

    const pedTop = new THREE.Mesh(pedestalTopGeo, brassMat);
    pedTop.position.set(px, 0.97, pz);
    scene.add(pedTop);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(px, 1.02, pz);
    ring.userData = { pickIndex: idx };
    scene.add(ring);
    pedestalRings.push(ring);
    disposables.push(ringMat);
  });

  // Build 5 Crimson Rejected Case Rail Pedestals
  rejCoords.forEach(([rx, rz]) => {
    const ped = new THREE.Mesh(pedestalGeo, darkMetalMat);
    ped.position.set(rx, 0.42, rz);
    ped.scale.set(0.85, 0.88, 0.85);
    ped.castShadow = true;
    scene.add(ped);

    const pedTop = new THREE.Mesh(pedestalTopGeo, crimsonMat);
    pedTop.position.set(rx, 0.86, rz);
    pedTop.scale.set(0.85, 1, 0.85);
    scene.add(pedTop);

    const rejRingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rejRing = new THREE.Mesh(ringGeo, rejRingMat);
    rejRing.rotation.x = -Math.PI / 2;
    rejRing.position.set(rx, 0.9, rz);
    scene.add(rejRing);
    rejectedRings.push(rejRing);
    disposables.push(rejRingMat);
  });

  // Build 10 Batch Job Dossiers
  for (let idx = 0; idx < 10; idx++) {
    const slot5 = idx % 5;
    const dossier = createDossier(idx % 2 === 0 ? 0x2563eb : 0xf59e0b, disposables);
    dossier.group.position.copy(startDesks[idx]);
    dossier.group.userData = { pickIndex: idx };
    dossier.group.traverse((child) => {
      child.userData = { pickIndex: idx };
    });
    scene.add(dossier.group);

    evaluatedDossiers.push({
      group: dossier.group,
      coverMesh: dossier.coverMesh,
      glowRing: dossier.glowRing,
      startPos: startDesks[idx].clone(),
      reviewPos: new THREE.Vector3(0, 1.04, 1.05),
      pedestalPos: new THREE.Vector3(evalX[slot5], 1.04, -2.15),
      rejectedPos: new THREE.Vector3(rejCoords[slot5][0], 0.93, rejCoords[slot5][1]),
      index: idx,
    });
  }
  disposables.push(pedestalGeo, pedestalTopGeo, ringGeo, crimsonMat);

  // 7. Debate Energy Beams & Speaker Spotlight Cone
  const beamGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 10);
  beamGeo.rotateX(Math.PI / 2);
  const beamMatA = new THREE.MeshBasicMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const beamMatB = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const debateBeamA = new THREE.Mesh(beamGeo, beamMatA);
  const debateBeamB = new THREE.Mesh(beamGeo, beamMatB);
  scene.add(debateBeamA, debateBeamB);

  const coneGeo = new THREE.ConeGeometry(1.4, 5.5, 24, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const spotlightCone = new THREE.Mesh(coneGeo, coneMat);
  spotlightCone.position.set(0, 2.75, 0.3);
  scene.add(spotlightCone);
  disposables.push(beamGeo, beamMatA, beamMatB, coneGeo, coneMat);

  // 8. Celebration Confetti Instanced System (shown after Top 5 evaluation completes)
  const confettiCount = 120;
  const confettiGeo = new THREE.PlaneGeometry(0.16, 0.09);
  const confettiMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const celebrationConfetti = new THREE.InstancedMesh(confettiGeo, confettiMat, confettiCount);
  celebrationConfetti.visible = false;
  celebrationConfetti.frustumCulled = false;

  const confettiPalette = [
    new THREE.Color(0xfbbf24),
    new THREE.Color(0x10b981),
    new THREE.Color(0x3b82f6),
    new THREE.Color(0x8b5cf6),
    new THREE.Color(0xf8fafc),
  ];
  const confettiMeta: ConfettiPieceMeta[] = [];
  for (let i = 0; i < confettiCount; i++) {
    // Deterministic seeded scatter so no unpredictable clustering
    const s1 = Math.sin(i * 12.9898) * 43758.5453;
    const r1 = s1 - Math.floor(s1);
    const s2 = Math.sin(i * 78.233) * 19341.123;
    const r2 = s2 - Math.floor(s2);
    const s3 = Math.sin(i * 45.164) * 98123.456;
    const r3 = s3 - Math.floor(s3);

    confettiMeta.push({
      x: (r1 - 0.5) * 13.5,
      baseY: 4.2 + r2 * 4.8,
      z: -3.2 + r3 * 8.2,
      speedY: 1.15 + (i % 5) * 0.24,
      swayPhase: r1 * Math.PI * 2,
      spinSpeed: 2.8 + (i % 4) * 1.1,
    });
    celebrationConfetti.setColorAt(i, confettiPalette[i % confettiPalette.length]);
  }
  if (celebrationConfetti.instanceColor) {
    celebrationConfetti.instanceColor.needsUpdate = true;
  }
  scene.add(celebrationConfetti);
  disposables.push(confettiGeo, confettiMat);

  return {
    scouts,
    lawyers,
    judges,
    evaluatedDossiers,
    pedestalRings,
    rejectedRings,
    scalesBeam,
    debateBeamA,
    debateBeamB,
    spotlightCone,
    gavelShockwave,
    celebrationConfetti,
    confettiMeta,
    disposables,
  };
}
