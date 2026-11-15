import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Gavel,
  ListFilter,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Star,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { JobItem, JobStatus, JuryRoomItem } from '../types.ts';
import { buildCourtroomScene } from '../three/courtroomBuilder.ts';
import { classifyJobDepartment } from '../utils/jobDepartment.ts';
import { buildCourtroomDialogue } from '../utils/courtroomLines.ts';
import {
  disposeCourtAudio,
  playCelebrationApplause,
  playCounselCue,
  playGavelStrike,
  playScoutPing,
  speakCourtLine,
  stopCourtSpeech,
  unlockCourtAudio,
} from '../utils/courtroomAudio.ts';

interface JuryCourtroomCGIProps {
  items: JuryRoomItem[];
  selectedJobId: string | null;
  sessionId: string;
  sessionDate: string;
  isConvening: boolean;
  onSelectJob: (jobId: string) => void;
  onStatusChange: (job: JobItem, status: JobStatus) => Promise<void>;
  onOpenApplication: (jobId: string) => void;
  onTrackClick: (jobId: string) => void;
  onConveneJury: () => Promise<void>;
  onOpenDocket: () => void;
}

type CameraPreset = 'overview' | 'scouts' | 'debate' | 'jury';
type WorkflowPhase = 'scout' | 'submit' | 'argue' | 'gavel' | 'celebrate';

const CASE_DURATION = 14.0; // seconds per real job trial (allows full spoken arguments & gavel)
const CELEBRATION_DURATION = 5.5; // courtroom clapping + confetti finale after 5th job is evaluated

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [0, 8.8, 13.8], target: [0, 1.5, -0.8] },
  scouts: { pos: [-11.2, 5.8, 7.6], target: [-5.4, 1.4, 1.1] },
  debate: { pos: [4.8, 4.6, 7.4], target: [0, 1.7, -0.5] },
  jury: { pos: [0, 4.9, 5.2], target: [0, 2.0, -3.5] },
};

const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _camPosTarget = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _pointer = new THREE.Vector2();
const _confettiDummy = new THREE.Object3D();

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function JuryCourtroomCGI({
  items,
  selectedJobId,
  sessionId,
  sessionDate,
  isConvening,
  onSelectJob,
  onStatusChange,
  onOpenApplication,
  onTrackClick,
  onConveneJury,
  onOpenDocket,
}: JuryCourtroomCGIProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const scoutBubbleRef = useRef<HTMLDivElement | null>(null);
  const proponentBubbleRef = useRef<HTMLDivElement | null>(null);
  const opponentBubbleRef = useRef<HTMLDivElement | null>(null);
  const juryBubbleRef = useRef<HTMLDivElement | null>(null);

  const topCases = useMemo(() => items.slice(0, 5), [items]);
  const topCasesRef = useRef<JuryRoomItem[]>(topCases);
  topCasesRef.current = topCases;

  const selectedJobIdRef = useRef<string | null>(selectedJobId);
  selectedJobIdRef.current = selectedJobId;

  const onSelectJobRef = useRef(onSelectJob);
  onSelectJobRef.current = onSelectJob;

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 1.5>(1);
  const [activeCaseIdx, setActiveCaseIdx] = useState(0);
  const [phase, setPhase] = useState<WorkflowPhase>('scout');
  const [speakerTurn, setSpeakerTurn] = useState<'proponent' | 'opponent' | 'examiner'>('proponent');
  const [gavelHitCount, setGavelHitCount] = useState(0);
  const [evaluatedMask, setEvaluatedMask] = useState<boolean[]>([false, false, false, false, false]);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [autoFollowCamera, setAutoFollowCamera] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cycleSeed, setCycleSeed] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [cycleCompleted, setCycleCompleted] = useState(false);

  const totalCases = Math.max(1, topCases.length);
  const totalDuration = totalCases * CASE_DURATION;

  const simRef = useRef({
    time: 0,
    playing: true,
    speed: 1,
    totalCases: 5,
    soundEnabled: true,
    cameraPreset: 'overview' as CameraPreset,
    autoFollowCamera: true,
    cameraAnimating: false,
    lastCaseIdx: -1,
    lastPhase: '' as string,
    lastSpeakerTurn: '' as string,
    lastGavelPulse: -1,
    celebrationTriggered: false,
    completedTriggered: false,
  });

  simRef.current.playing = playing;
  simRef.current.speed = speed;
  simRef.current.totalCases = totalCases;
  simRef.current.autoFollowCamera = autoFollowCamera;
  simRef.current.soundEnabled = soundEnabled;

  useEffect(() => {
    const handleUnlock = () => {
      unlockCourtAudio();
    };
    window.addEventListener('pointerdown', handleUnlock, { once: true });
    window.addEventListener('keydown', handleUnlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
      disposeCourtAudio();
    };
  }, []);

  const resetTrialFromScratch = (bumpSeed = true) => {
    simRef.current.time = 0;
    simRef.current.playing = true;
    simRef.current.lastCaseIdx = -1;
    simRef.current.lastPhase = '';
    simRef.current.lastSpeakerTurn = '';
    simRef.current.lastGavelPulse = -1;
    simRef.current.celebrationTriggered = false;
    simRef.current.completedTriggered = false;
    simRef.current.cameraPreset = 'scouts';
    simRef.current.cameraAnimating = true;
    setActiveCaseIdx(0);
    setPhase('scout');
    setGavelHitCount(0);
    setEvaluatedMask([false, false, false, false, false]);
    setCelebrating(false);
    setCycleCompleted(false);
    setPlaying(true);
    if (bumpSeed) setCycleSeed((s) => s + 1);
  };

  // Start fresh from scratch whenever a new deliberation session loads or convenes
  useEffect(() => {
    if (isConvening || sessionId) {
      resetTrialFromScratch(true);
    }
  }, [isConvening, sessionId]);

  const jumpToCase = (caseIdx: number, startPhase: Exclude<WorkflowPhase, 'celebrate'> = 'scout') => {
    unlockCourtAudio();
    const offsetMap: Record<Exclude<WorkflowPhase, 'celebrate'>, number> = {
      scout: 0.05,
      submit: 2.15,
      argue: 3.45,
      gavel: 10.65,
    };
    const clampedIdx = Math.max(0, Math.min(totalCases - 1, caseIdx));
    simRef.current.time = clampedIdx * CASE_DURATION + offsetMap[startPhase];
    simRef.current.celebrationTriggered = false;
    simRef.current.completedTriggered = false;
    setCelebrating(false);
    setCycleCompleted(false);
    setActiveCaseIdx(clampedIdx);
    setPhase(startPhase);
    if (topCases[clampedIdx]) {
      onSelectJob(topCases[clampedIdx].job.id);
    }
  };

  const jumpToPhaseInCurrentCase = (targetPhase: Exclude<WorkflowPhase, 'celebrate'>) => {
    jumpToCase(activeCaseIdx, targetPhase);
  };

  const selectCameraPreset = (preset: CameraPreset) => {
    setAutoFollowCamera(false);
    simRef.current.autoFollowCamera = false;
    simRef.current.cameraPreset = preset;
    simRef.current.cameraAnimating = true;
    setCameraPreset(preset);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const width = container.clientWidth || 1280;
    const height = container.clientHeight || 720;

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgHex = 0x0b1120;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.019);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minDistance = 5;
    controls.maxDistance = 24;
    controls.update();

    const onControlStart = () => {
      simRef.current.cameraAnimating = false;
      simRef.current.autoFollowCamera = false;
      setAutoFollowCamera(false);
    };
    controls.addEventListener('start', onControlStart);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x1e293b, 0.92);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.25);
    keyLight.position.set(8, 14, 9);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.left = -13;
    keyLight.shadow.camera.right = 13;
    keyLight.shadow.camera.top = 11;
    keyLight.shadow.camera.bottom = -11;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 36;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.05);
    rimLight.position.set(-10, 9, -9);
    scene.add(rimLight);

    const jurySpot = new THREE.SpotLight(0xfde68a, 22, 20, Math.PI / 4.5, 0.5, 1.5);
    jurySpot.position.set(0, 7.6, -1.2);
    jurySpot.target.position.set(0, 2.2, -4.3);
    scene.add(jurySpot, jurySpot.target);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const rig = buildCourtroomScene(scene, maxAniso);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const raycaster = new THREE.Raycaster();
    const interactiveTargets = [
      ...rig.evaluatedDossiers.map((d) => d.group),
      ...rig.pedestalRings,
    ];

    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_pointer, camera);
      const hits = raycaster.intersectObjects(interactiveTargets, true);
      if (hits.length > 0) {
        const idx = hits[0].object.userData?.pickIndex;
        if (typeof idx === 'number' && topCasesRef.current[idx]) {
          simRef.current.time = idx * CASE_DURATION + 6.45;
          setActiveCaseIdx(idx);
          onSelectJobRef.current(topCasesRef.current[idx].job.id);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(320, entry.contentRect.width);
      const h = Math.max(420, entry.contentRect.height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      simRef.current.playing = false;
      simRef.current.time = 7.2;
      setPlaying(false);
    }

    const headAnchors = {
      scout: new THREE.Vector3(),
      proponent: new THREE.Vector3(),
      opponent: new THREE.Vector3(),
      jury: new THREE.Vector3(),
      phase: 'scout' as WorkflowPhase,
    };

    let frameId = 0;
    let disposed = false;
    let lastNow = performance.now();

    function projectWorldToScreen(worldPos: THREE.Vector3, vw: number, vh: number): { x: number; y: number; visible: boolean } {
      _projVec.copy(worldPos).project(camera);
      if (_projVec.z < -1 || _projVec.z > 1) {
        return { x: 0, y: 0, visible: false };
      }
      return {
        x: (_projVec.x * 0.5 + 0.5) * vw,
        y: (-_projVec.y * 0.5 + 0.5) * vh,
        visible: true,
      };
    }

    function applyBubblePosition(
      el: HTMLDivElement | null,
      visible: boolean,
      x: number,
      y: number,
      vw: number,
      vh: number,
      halfWidth = 155,
      minY = 148
    ) {
      if (!el) return;
      if (!visible) {
        el.style.opacity = '0';
        el.style.transform = 'translate3d(-9999px, -9999px, 0)';
        return;
      }
      const clampedX = Math.max(halfWidth, Math.min(vw - halfWidth, x));
      const clampedY = Math.max(minY, Math.min(vh - 150, y));
      el.style.opacity = '1';
      el.style.transform = `translate3d(${Math.round(clampedX)}px, ${Math.round(clampedY)}px, 0) translate(-50%, calc(-100% - 10px))`;
    }

    function updateChoreography(t: number, delta: number) {
      const count = simRef.current.totalCases;
      const casesDuration = count * CASE_DURATION;
      const fullDuration = casesDuration + CELEBRATION_DURATION;
      const isCelebrationWindow = t >= casesDuration && t < fullDuration;
      const isFinished = t >= fullDuration;

      // Celebration & Completed Terminal State
      if (isCelebrationWindow || isFinished) {
        const celebrateTime = Math.max(0, t - casesDuration);
        headAnchors.phase = 'celebrate';
        if (simRef.current.lastPhase !== 'celebrate') {
          simRef.current.lastPhase = 'celebrate';
          setPhase('celebrate');
          if (simRef.current.autoFollowCamera) {
            simRef.current.cameraPreset = 'overview';
            simRef.current.cameraAnimating = true;
            setCameraPreset('overview');
          }
        }

        if (!simRef.current.celebrationTriggered) {
          simRef.current.celebrationTriggered = true;
          setCelebrating(true);
          setEvaluatedMask([true, true, true, true, true]);
          if (simRef.current.soundEnabled) {
            playCelebrationApplause();
            speakCourtLine(
              'judge',
              `Order and applause! Today's top ${count} positions are evaluated and certified by the Supreme Jury.`,
              simRef.current.speed
            );
          }
        }

        if (isFinished && !simRef.current.completedTriggered) {
          simRef.current.completedTriggered = true;
          simRef.current.playing = false;
          setCelebrating(false);
          setCycleCompleted(true);
          setPlaying(false);
        }

        // Smooth camera damping
        if (simRef.current.cameraAnimating) {
          const preset = CAMERA_PRESETS[simRef.current.cameraPreset];
          _camPosTarget.set(...preset.pos);
          _camLookTarget.set(...preset.target);
          const alpha = 1 - Math.exp(-3.6 * delta);
          camera.position.lerp(_camPosTarget, alpha);
          controls.target.lerp(_camLookTarget, alpha);
          if (camera.position.distanceTo(_camPosTarget) < 0.06) {
            simRef.current.cameraAnimating = false;
          }
        }
        controls.update();

        const clapOsc = isCelebrationWindow
          ? Math.abs(Math.sin(celebrateTime * 13.0)) * 0.36
          : 0;

        // Scouts bounce & clap toward center court
        rig.scouts.forEach((scout, idx) => {
          scout.group.position.lerp(scout.homePos, 1 - Math.exp(-4 * delta));
          scout.group.position.y = isCelebrationWindow
            ? Math.abs(Math.sin(celebrateTime * 7.2 + idx * 0.6)) * 0.14
            : 0;
          scout.group.lookAt(0, scout.group.position.y, 0);
          scout.leftLeg.rotation.x = 0;
          scout.rightLeg.rotation.x = 0;
          scout.carriedDossier.visible = false;
          if (isCelebrationWindow) {
            scout.leftArm.rotation.x = -1.35;
            scout.rightArm.rotation.x = -1.35;
            scout.leftArm.rotation.z = 0.42 - clapOsc;
            scout.rightArm.rotation.z = -0.42 + clapOsc;
          } else {
            scout.leftArm.rotation.x = 0;
            scout.rightArm.rotation.x = 0;
            scout.leftArm.rotation.z = 0;
            scout.rightArm.rotation.z = 0;
          }
        });

        // Lawyers face jury/center and applaud together
        rig.lawyers.forEach((lawyer, idx) => {
          lawyer.group.position.lerp(lawyer.seatPos, 1 - Math.exp(-4 * delta));
          lawyer.group.rotation.y = Math.PI;
          lawyer.torso.rotation.x = isCelebrationWindow ? 0.06 : 0;
          lawyer.head.rotation.y = isCelebrationWindow ? Math.sin(celebrateTime * 4 + idx) * 0.16 : 0;
          if (isCelebrationWindow) {
            lawyer.leftArm.rotation.x = -1.35;
            lawyer.rightArm.rotation.x = -1.35;
            lawyer.leftArm.rotation.z = 0.42 - clapOsc;
            lawyer.rightArm.rotation.z = -0.42 + clapOsc;
          } else {
            lawyer.leftArm.rotation.x = 0;
            lawyer.rightArm.rotation.x = 0;
            lawyer.leftArm.rotation.z = 0;
            lawyer.rightArm.rotation.z = 0;
          }
        });

        // Tall Judges nod and applaud behind bench
        rig.judges.forEach((judge, idx) => {
          judge.head.rotation.y = isCelebrationWindow ? Math.sin(celebrateTime * 3.5 + idx) * 0.15 : 0;
          judge.head.rotation.x = isCelebrationWindow ? Math.sin(celebrateTime * 6 + idx) * 0.08 : 0;
          if (isCelebrationWindow) {
            judge.leftArm.rotation.x = -1.2;
            judge.rightArm.rotation.x = -1.2;
            judge.leftArm.rotation.z = 0.36 - clapOsc * 0.85;
            judge.rightArm.rotation.z = -0.36 + clapOsc * 0.85;
          } else {
            judge.leftArm.rotation.x = -0.35;
            judge.rightArm.rotation.x = -0.65;
            judge.leftArm.rotation.z = 0;
            judge.rightArm.rotation.z = 0;
          }
        });

        // Calm beams/spotlight/shockwave, balanced scales, glowing 5 certified pedestals
        (rig.spotlightCone.material as THREE.MeshBasicMaterial).opacity = 0;
        (rig.debateBeamA.material as THREE.MeshBasicMaterial).opacity = 0;
        (rig.debateBeamB.material as THREE.MeshBasicMaterial).opacity = 0;
        (rig.gavelShockwave.material as THREE.MeshBasicMaterial).opacity = 0;
        rig.scalesBeam.rotation.z = THREE.MathUtils.lerp(rig.scalesBeam.rotation.z, 0, 0.16);

        rig.evaluatedDossiers.forEach((item, idx) => {
          const ringMat = rig.pedestalRings[idx].material as THREE.MeshBasicMaterial;
          const glowMat = item.glowRing.material as THREE.MeshBasicMaterial;
          item.group.visible = idx < count;
          item.group.position.copy(item.pedestalPos);
          item.group.rotation.set(-0.22, 0, 0);
          ringMat.color.setHex(isCelebrationWindow ? 0xfbbf24 : 0x10b981);
          ringMat.opacity = isCelebrationWindow ? 0.65 + Math.sin(celebrateTime * 8 + idx) * 0.25 : 0.78;
          glowMat.opacity = 0.42;
        });

        // Animate celebration confetti rain during applause window
        rig.celebrationConfetti.visible = isCelebrationWindow;
        if (isCelebrationWindow) {
          for (let i = 0; i < rig.confettiMeta.length; i++) {
            const m = rig.confettiMeta[i];
            const fallSpan = 8.4;
            const y = ((m.baseY - celebrateTime * m.speedY) % fallSpan + fallSpan) % fallSpan + 0.15;
            const swayX = Math.sin(celebrateTime * 2.4 + m.swayPhase) * 0.35;
            _confettiDummy.position.set(m.x + swayX, y, m.z);
            _confettiDummy.rotation.set(
              celebrateTime * m.spinSpeed,
              celebrateTime * m.spinSpeed * 0.7,
              m.swayPhase
            );
            _confettiDummy.updateMatrix();
            rig.celebrationConfetti.setMatrixAt(i, _confettiDummy.matrix);
          }
          rig.celebrationConfetti.instanceMatrix.needsUpdate = true;
        }
        return;
      }

      // Active Trial Loop (Cases 0..count-1)
      rig.celebrationConfetti.visible = false;
      const caseIdx = Math.min(count - 1, Math.floor(t / CASE_DURATION));
      const localT = t - caseIdx * CASE_DURATION;

      const currentPhase: WorkflowPhase =
        localT < 2.1 ? 'scout' : localT < 3.4 ? 'submit' : localT < 10.6 ? 'argue' : 'gavel';
      headAnchors.phase = currentPhase;

      const currentTurn: 'proponent' | 'opponent' | 'examiner' =
        localT < 6.0 ? 'proponent' : localT < 8.4 ? 'opponent' : 'examiner';

      if (caseIdx !== simRef.current.lastCaseIdx) {
        simRef.current.lastCaseIdx = caseIdx;
        setActiveCaseIdx(caseIdx);
        const targetItem = topCasesRef.current[caseIdx];
        if (targetItem) {
          onSelectJobRef.current(targetItem.job.id);
        }
      }

      if (currentPhase !== simRef.current.lastPhase) {
        simRef.current.lastPhase = currentPhase;
        setPhase(currentPhase);
        if (simRef.current.autoFollowCamera) {
          const nextCam: CameraPreset =
            currentPhase === 'scout'
              ? 'scouts'
              : currentPhase === 'submit'
                ? 'overview'
                : currentPhase === 'argue'
                  ? 'debate'
                  : 'jury';
          simRef.current.cameraPreset = nextCam;
          simRef.current.cameraAnimating = true;
          setCameraPreset(nextCam);
        }
      }

      if (currentTurn !== simRef.current.lastSpeakerTurn) {
        simRef.current.lastSpeakerTurn = currentTurn;
        setSpeakerTurn(currentTurn);
      }

      // Smooth camera damping
      if (simRef.current.cameraAnimating) {
        const preset = CAMERA_PRESETS[simRef.current.cameraPreset];
        _camPosTarget.set(...preset.pos);
        _camLookTarget.set(...preset.target);
        const alpha = 1 - Math.exp(-3.6 * delta);
        camera.position.lerp(_camPosTarget, alpha);
        controls.target.lerp(_camLookTarget, alpha);
        if (camera.position.distanceTo(_camPosTarget) < 0.06) {
          simRef.current.cameraAnimating = false;
        }
      }
      controls.update();

      // --- 1. DEPARTMENT-SPECIALIZED SCOUT FINDS & SUBMITS CURRENT JOB ---
      const currentCaseJob = topCasesRef.current[caseIdx]?.job;
      const activeScoutIdx = currentCaseJob
        ? classifyJobDepartment(currentCaseJob).index % rig.scouts.length
        : caseIdx % rig.scouts.length;
      rig.scouts.forEach((scout, idx) => {
        scout.leftArm.rotation.z = 0;
        scout.rightArm.rotation.z = 0;
        if (idx !== activeScoutIdx) {
          scout.group.position.lerp(scout.homePos, 1 - Math.exp(-4 * delta));
          scout.group.rotation.y = 0.85;
          scout.leftLeg.rotation.x = 0;
          scout.rightLeg.rotation.x = 0;
          scout.leftArm.rotation.x = Math.sin(t * 1.4 + idx) * 0.05;
          scout.rightArm.rotation.x = -Math.sin(t * 1.4 + idx) * 0.05;
          scout.carriedDossier.visible = false;
          return;
        }

        if (localT < 2.1) {
          const p = smoothStep(0, 1.3, localT);
          scout.group.position.lerpVectors(scout.homePos, scout.boardPos, p);
          scout.group.lookAt(scout.boardPos.x - 1.4, 0, scout.boardPos.z);
          const stride = Math.sin(localT * 10) * 0.55 * (1 - p * 0.5);
          scout.leftLeg.rotation.x = stride;
          scout.rightLeg.rotation.x = -stride;
          const reach = localT > 1.25 ? Math.sin(((localT - 1.25) / 0.85) * Math.PI) : 0;
          scout.rightArm.rotation.x = -reach * 1.25;
          scout.leftArm.rotation.x = -reach * 0.6;
          scout.carriedDossier.visible = localT > 1.5;
        } else if (localT < 3.5) {
          const p = smoothStep(2.1, 3.35, localT);
          scout.group.position.lerpVectors(scout.boardPos, scout.deskPos, p);
          _tmpVecA.subVectors(scout.deskPos, scout.boardPos);
          if (_tmpVecA.lengthSq() > 0.001) {
            scout.group.rotation.y = Math.atan2(_tmpVecA.x, _tmpVecA.z);
          }
          const stride = Math.sin(localT * 11) * 0.55;
          scout.leftLeg.rotation.x = stride;
          scout.rightLeg.rotation.x = -stride;
          scout.leftArm.rotation.x = -0.85;
          scout.rightArm.rotation.x = -0.85;
          scout.group.position.y = Math.abs(Math.sin(localT * 11)) * 0.05;
          scout.carriedDossier.visible = p < 0.9;
        } else {
          const p = smoothStep(3.5, 4.7, localT);
          scout.group.position.lerpVectors(scout.deskPos, scout.homePos, p);
          scout.group.rotation.y = Math.atan2(
            scout.homePos.x - scout.deskPos.x,
            scout.homePos.z - scout.deskPos.z
          );
          const stride = Math.sin(localT * 9) * 0.35 * (1 - p);
          scout.leftLeg.rotation.x = stride;
          scout.rightLeg.rotation.x = -stride;
          scout.leftArm.rotation.x = 0;
          scout.rightArm.rotation.x = 0;
          scout.group.position.y = 0;
          scout.carriedDossier.visible = false;
        }

        headAnchors.scout.set(
          scout.group.position.x,
          scout.group.position.y + 1.85,
          scout.group.position.z
        );
      });

      // --- 2. LAWYERS PRESENT & ARGUE IN FRONT OF JURY ---
      let activeSpeakerIdx = -1;
      let opposerIdx = -1;
      if (currentPhase === 'argue') {
        if (currentTurn === 'proponent') {
          activeSpeakerIdx = 0;
        } else if (currentTurn === 'opponent') {
          activeSpeakerIdx = 2;
          opposerIdx = 0;
        } else {
          activeSpeakerIdx = 1;
          opposerIdx = 0;
        }
      }

      rig.lawyers.forEach((lawyer, idx) => {
        lawyer.leftArm.rotation.z = 0;
        lawyer.rightArm.rotation.z = 0;
        const isSpeaking = idx === activeSpeakerIdx;
        const isOpposing = idx === opposerIdx;

        const targetPos = isSpeaking
          ? lawyer.podiumPos
          : isOpposing
            ? _tmpVecB.lerpVectors(lawyer.seatPos, lawyer.podiumPos, 0.62)
            : lawyer.seatPos;

        const moveAlpha = 1 - Math.exp(-5.5 * delta);
        lawyer.group.position.lerp(targetPos, moveAlpha);

        if (isSpeaking) {
          lawyer.group.rotation.y = Math.PI + Math.sin(t * 2.5) * 0.14;
          lawyer.torso.rotation.x = 0.09 + Math.sin(t * 6.5) * 0.04;
          lawyer.rightArm.rotation.x = -1.2 + Math.sin(t * 10.5) * 0.45;
          lawyer.leftArm.rotation.x = -0.68 + Math.cos(t * 8.0) * 0.28;
          lawyer.head.rotation.y = Math.sin(t * 3.8) * 0.18;
        } else if (isOpposing) {
          const speaker = rig.lawyers[activeSpeakerIdx];
          const angle = Math.atan2(
            speaker.group.position.x - lawyer.group.position.x,
            speaker.group.position.z - lawyer.group.position.z
          );
          lawyer.group.rotation.y = angle;
          lawyer.torso.rotation.x = 0.06;
          lawyer.rightArm.rotation.x = -2.2 + Math.sin(t * 11) * 0.14;
          lawyer.leftArm.rotation.x = -0.35;
        } else {
          lawyer.group.rotation.y = Math.PI;
          lawyer.torso.rotation.x = 0;
          lawyer.rightArm.rotation.x = Math.sin(t * 1.4 + idx) * 0.05;
          lawyer.leftArm.rotation.x = -Math.sin(t * 1.4 + idx) * 0.05;
          lawyer.head.rotation.y = activeSpeakerIdx >= 0 ? (activeSpeakerIdx - 1) * 0.22 : 0;
        }
      });

      const crossLawyerIdx = currentTurn === 'examiner' ? 1 : 2;
      headAnchors.proponent.set(
        rig.lawyers[0].group.position.x,
        rig.lawyers[0].group.position.y + 2.02,
        rig.lawyers[0].group.position.z
      );
      headAnchors.opponent.set(
        rig.lawyers[crossLawyerIdx].group.position.x,
        rig.lawyers[crossLawyerIdx].group.position.y + 2.02,
        rig.lawyers[crossLawyerIdx].group.position.z
      );

      const coneMat = rig.spotlightCone.material as THREE.MeshBasicMaterial;
      const beamMatA = rig.debateBeamA.material as THREE.MeshBasicMaterial;
      const beamMatB = rig.debateBeamB.material as THREE.MeshBasicMaterial;

      if (activeSpeakerIdx >= 0) {
        const speaker = rig.lawyers[activeSpeakerIdx];
        rig.spotlightCone.position.set(speaker.group.position.x, 2.75, speaker.group.position.z);
        coneMat.color.setHex(speaker.accentColor);
        coneMat.opacity = 0.13 + Math.sin(t * 6) * 0.03;

        _tmpVecA.set(speaker.group.position.x, 1.45, speaker.group.position.z);
        _tmpVecB.set(0, 2.45, -3.5);
        const distA = _tmpVecA.distanceTo(_tmpVecB);
        rig.debateBeamA.position.copy(_tmpVecA).lerp(_tmpVecB, 0.5);
        rig.debateBeamA.scale.set(1, 1, distA);
        rig.debateBeamA.lookAt(_tmpVecB);
        beamMatA.color.setHex(speaker.accentColor);
        beamMatA.opacity = 0.48 + Math.sin(t * 12) * 0.24;

        if (opposerIdx >= 0) {
          const opposer = rig.lawyers[opposerIdx];
          _tmpVecA.set(opposer.group.position.x, 1.45, opposer.group.position.z);
          _tmpVecB.set(speaker.group.position.x, 1.45, speaker.group.position.z);
          const distB = _tmpVecA.distanceTo(_tmpVecB);
          rig.debateBeamB.position.copy(_tmpVecA).lerp(_tmpVecB, 0.5);
          rig.debateBeamB.scale.set(1, 1, distB);
          rig.debateBeamB.lookAt(_tmpVecB);
          beamMatB.color.setHex(opposer.accentColor);
          beamMatB.opacity = 0.42 + Math.cos(t * 14) * 0.24;
        } else {
          beamMatB.opacity = 0;
        }
      } else {
        coneMat.opacity = 0;
        beamMatA.opacity = 0;
        beamMatB.opacity = 0;
      }

      // --- 3. TALL JURY ARBITERS & GAVEL STRIKE ON EVERY SINGLE JOB ---
      const shockMat = rig.gavelShockwave.material as THREE.MeshBasicMaterial;
      let gavelArmAngle = -0.65;

      if (currentPhase === 'gavel') {
        const gTime = localT - 10.6;
        if (gTime < 1.45) {
          const pulseIdx = gTime < 0.72 ? 0 : 1;
          const pulseLocal = pulseIdx === 0 ? gTime : gTime - 0.72;
          const lift =
            pulseLocal < 0.25
              ? smoothStep(0, 0.25, pulseLocal) * 0.95
              : (1 - smoothStep(0.25, 0.42, pulseLocal)) * 0.95;
          const slamDown = pulseLocal >= 0.25 ? smoothStep(0.25, 0.4, pulseLocal) * 0.45 : 0;
          gavelArmAngle = -0.65 - lift + slamDown;

          if (pulseLocal >= 0.36) {
            const waveP = smoothStep(0.36, 0.72, pulseLocal);
            rig.gavelShockwave.scale.setScalar(1 + waveP * 4.8);
            shockMat.opacity = (1 - waveP) * 0.88;
            if (simRef.current.lastGavelPulse !== caseIdx * 2 + pulseIdx) {
              simRef.current.lastGavelPulse = caseIdx * 2 + pulseIdx;
              if (simRef.current.soundEnabled) {
                playGavelStrike(pulseIdx === 0 ? 0.58 : 0.46);
              }
              setGavelHitCount((c) => c + 1);
              if (pulseIdx === 0) {
                setEvaluatedMask((prev) => {
                  const next = [...prev];
                  next[caseIdx] = true;
                  return next;
                });
              }
            }
          } else {
            shockMat.opacity = 0;
          }
        } else {
          shockMat.opacity = 0;
        }
      } else {
        shockMat.opacity = 0;
      }

      rig.judges.forEach((judge, idx) => {
        judge.leftArm.rotation.x = -0.35;
        judge.leftArm.rotation.z = 0;
        judge.rightArm.rotation.z = 0;
        if (activeSpeakerIdx >= 0) {
          const speaker = rig.lawyers[activeSpeakerIdx];
          judge.head.rotation.y = (speaker.group.position.x - judge.basePos.x) * 0.14;
          judge.head.rotation.x = 0.08 + Math.sin(t * 4 + idx) * 0.04;
        } else if (currentPhase === 'gavel') {
          const targetPedX = rig.evaluatedDossiers[caseIdx]?.pedestalPos.x ?? 0;
          judge.head.rotation.y = THREE.MathUtils.lerp(
            judge.head.rotation.y,
            (targetPedX - judge.basePos.x) * 0.12,
            0.12
          );
          judge.head.rotation.x = 0.12;
        } else {
          judge.head.rotation.y = 0;
          judge.head.rotation.x = 0;
        }

        if (judge.gavel) {
          judge.rightArm.rotation.x = THREE.MathUtils.lerp(judge.rightArm.rotation.x, gavelArmAngle, 0.35);
        } else {
          judge.rightArm.rotation.x = -0.35;
        }
      });

      const chiefJudge = rig.judges[1];
      headAnchors.jury.set(
        chiefJudge.group.position.x,
        chiefJudge.group.position.y + 2.48,
        chiefJudge.group.position.z
      );

      // Scales of Justice reaction
      if (currentPhase === 'argue') {
        rig.scalesBeam.rotation.z = Math.sin(t * 3.8) * 0.24;
      } else if (currentPhase === 'gavel') {
        rig.scalesBeam.rotation.z = THREE.MathUtils.lerp(rig.scalesBeam.rotation.z, 0, 0.16);
      } else {
        rig.scalesBeam.rotation.z = Math.sin(t * 1.4) * 0.06;
      }

      // --- 4. 5 EVALUATED JOB DOSSIERS ON COUNSEL DESKS & JURY PEDESTALS ---
      rig.evaluatedDossiers.forEach((item, idx) => {
        const ringMat = rig.pedestalRings[idx].material as THREE.MeshBasicMaterial;
        const glowMat = item.glowRing.material as THREE.MeshBasicMaterial;
        const isCurrent = idx === caseIdx;
        const alreadyEvaluated = idx < caseIdx || (isCurrent && localT >= 11.1);
        const isSelected = topCasesRef.current[idx]?.job.id === selectedJobIdRef.current;

        if (idx > caseIdx || (isCurrent && localT < 3.0)) {
          item.group.visible = isCurrent && localT > 2.4;
          item.group.position.copy(item.startPos);
          item.group.rotation.set(0, 0, 0);
          ringMat.color.setHex(isSelected ? 0xf59e0b : 0x3b82f6);
          ringMat.opacity = isCurrent ? 0.25 : 0.1;
          glowMat.opacity = 0;
        } else if (isCurrent && localT < 11.1) {
          item.group.visible = true;
          item.group.position.copy(item.startPos);
          item.group.position.y = item.startPos.y + Math.sin(t * 3.5) * 0.025;
          item.group.rotation.set(0, Math.sin(t * 1.2) * 0.12, 0);
          ringMat.color.setHex(0x60a5fa);
          ringMat.opacity = 0.35;
          glowMat.opacity = 0;
        } else if (isCurrent && localT >= 11.1) {
          item.group.visible = true;
          const p = smoothStep(11.1, 12.6, localT);
          item.group.position.lerpVectors(item.startPos, item.pedestalPos, p);
          item.group.position.y += Math.sin(p * Math.PI) * 1.9;
          item.group.rotation.y = p * Math.PI * 2;
          item.group.rotation.x = p >= 0.98 ? -0.22 : Math.sin(p * Math.PI) * 0.35;
          ringMat.color.setHex(isSelected ? 0xf59e0b : 0x10b981);
          ringMat.opacity = p >= 0.9 ? 0.85 : 0.45;
          glowMat.opacity = p >= 0.9 ? 0.5 : 0;
        } else {
          item.group.visible = true;
          item.group.position.copy(item.pedestalPos);
          item.group.rotation.set(-0.22, 0, 0);
          ringMat.color.setHex(isSelected ? 0xf59e0b : alreadyEvaluated ? 0x10b981 : 0x3b82f6);
          ringMat.opacity = isSelected ? 0.9 : 0.65;
          glowMat.opacity = 0.35;
        }
      });
    }

    function updateSpeechBubblesProjection() {
      const vw = container?.clientWidth || 1280;
      const vh = container?.clientHeight || 720;
      camera.updateMatrixWorld();

      const p = headAnchors.phase;
      const showScout = p === 'scout' || p === 'submit';
      const showLawyers = p === 'argue';
      const showJury = p === 'gavel';

      const scoutScreen = projectWorldToScreen(headAnchors.scout, vw, vh);
      applyBubblePosition(scoutBubbleRef.current, showScout && scoutScreen.visible, scoutScreen.x, scoutScreen.y, vw, vh, 155, 165);

      const propScreen = projectWorldToScreen(headAnchors.proponent, vw, vh);
      const oppScreen = projectWorldToScreen(headAnchors.opponent, vw, vh);

      let propX = propScreen.x;
      let oppX = oppScreen.x;
      if (showLawyers && propScreen.visible && oppScreen.visible) {
        const minGap = Math.min(340, vw * 0.42);
        if (Math.abs(oppX - propX) < minGap) {
          const mid = (propX + oppX) * 0.5;
          if (propX <= oppX) {
            propX = mid - minGap * 0.5;
            oppX = mid + minGap * 0.5;
          } else {
            propX = mid + minGap * 0.5;
            oppX = mid - minGap * 0.5;
          }
        }
      }

      applyBubblePosition(proponentBubbleRef.current, showLawyers && propScreen.visible, propX, propScreen.y, vw, vh, 165, 165);
      applyBubblePosition(opponentBubbleRef.current, showLawyers && oppScreen.visible, oppX, oppScreen.y, vw, vh, 165, 165);

      const juryScreen = projectWorldToScreen(headAnchors.jury, vw, vh);
      applyBubblePosition(juryBubbleRef.current, showJury && juryScreen.visible, juryScreen.x, juryScreen.y, vw, vh, 175, 155);
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const delta = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;

      const fullDuration = Math.max(1, simRef.current.totalCases) * CASE_DURATION + CELEBRATION_DURATION;
      if (simRef.current.playing) {
        simRef.current.time = Math.min(fullDuration, simRef.current.time + delta * simRef.current.speed);
      }

      updateChoreography(simRef.current.time, delta);
      renderer.render(scene, camera);
      updateSpeechBubblesProjection();

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      rig.disposables.forEach((d) => d.dispose());
      envRT.dispose();
      renderer.dispose();
    };
  }, []);

  const currentItem = topCases[activeCaseIdx] || topCases[0] || null;
  const currentJob = currentItem?.job || null;
  const currentDept = useMemo(() => (currentJob ? classifyJobDepartment(currentJob) : null), [currentJob]);
  const dialogue = useMemo(() => {
    if (!currentItem || !currentDept) return null;
    return buildCourtroomDialogue(currentItem, currentDept, activeCaseIdx, cycleSeed);
  }, [currentItem, currentDept, activeCaseIdx, cycleSeed]);

  // Trigger Live Character Voiceovers & Chamber Cues on every phase/turn transition
  useEffect(() => {
    if (!soundEnabled || !playing || !currentJob || !dialogue || !currentDept) {
      stopCourtSpeech();
      return;
    }

    unlockCourtAudio();

    if (phase === 'scout') {
      playScoutPing();
      speakCourtLine('scout', dialogue.scoutDiscoverLine, speed);
    } else if (phase === 'submit') {
      speakCourtLine('scout', dialogue.scoutSubmitLine, speed);
    } else if (phase === 'argue') {
      if (speakerTurn === 'proponent') {
        playCounselCue(false);
        speakCourtLine('proponent', dialogue.proponent.statement, speed);
      } else if (speakerTurn === 'opponent') {
        playCounselCue(true);
        speakCourtLine('opponent', dialogue.opponent.statement, speed);
      } else {
        playCounselCue(false);
        speakCourtLine('examiner', dialogue.examiner.statement, speed);
      }
    } else if (phase === 'gavel') {
      const verdictText = currentJob.jury_verdict || currentItem?.verdict?.verdict || 'Approved';
      speakCourtLine('judge', `Case ${activeCaseIdx + 1}: ${verdictText}. ${dialogue.juryComment}`, speed);
    }
  }, [soundEnabled, playing, activeCaseIdx, phase, speakerTurn, currentJob, currentItem, dialogue, currentDept, speed]);

  const toggleSound = () => {
    unlockCourtAudio();
    setSoundEnabled((prev) => {
      const next = !prev;
      if (!next) {
        stopCourtSpeech();
      }
      return next;
    });
  };

  return (
    <section
      aria-label="Full-Viewport 3D Jury Courtroom"
      className="relative w-full h-screen min-h-[600px] bg-slate-950 overflow-hidden select-none"
    >
      {/* Full-Section 3D CGI Courtroom Background */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {webglUnavailable && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-200 p-6 text-center z-10">
          <p className="font-display text-base font-semibold">3D WebGL viewport unavailable</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            Your browser context suspended WebGL rendering. Open the Full Docket drawer to inspect every deliberation.
          </p>
        </div>
      )}

      {/* 3D HEAD-ANCHORED FLOATING SPEECH BUBBLES */}
      {currentJob && dialogue && currentDept && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {/* 1. Department-Specialized Scout Worker Floating Speech Bubble */}
          <div
            ref={scoutBubbleRef}
            style={{ opacity: 0, transform: 'translate3d(-9999px, -9999px, 0)' }}
            className="absolute top-0 left-0 w-[285px] sm:w-[310px] transition-opacity duration-200 will-change-transform"
          >
            <div className={`relative bg-slate-950 border-2 ${currentDept.cssBorderColor} rounded-2xl px-3.5 py-2.5 text-white shadow-2xl`}>
              <div className={`flex items-center justify-between gap-2 text-[11px] font-semibold ${currentDept.cssBadgeText}`}>
                <span className="inline-flex items-center gap-1.5 truncate">
                  {soundEnabled && playing && <Volume2 className="w-3 h-3 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{currentDept.scoutTitle} · {currentJob.source}</span>
                </span>
                <span className="font-mono text-slate-300 shrink-0">{currentDept.shortLabel}</span>
              </div>
              <p className="text-xs text-slate-100 mt-1 leading-snug">
                {phase === 'scout' ? dialogue.scoutDiscoverLine : dialogue.scoutSubmitLine}
              </p>
              <span
                aria-hidden="true"
                className={`absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 bg-slate-950 border-r-2 border-b-2 ${currentDept.cssBorderColor}`}
              />
            </div>
          </div>

          {/* 2. Presenting Counsel Floating Speech Bubble (Above Lawyer #1's Head) */}
          <div
            ref={proponentBubbleRef}
            style={{ opacity: 0, transform: 'translate3d(-9999px, -9999px, 0)' }}
            className={`absolute top-0 left-0 w-[275px] sm:w-[310px] transition-opacity duration-200 will-change-transform ${
              speakerTurn === 'proponent' ? 'z-20' : 'z-10'
            }`}
          >
            <div
              className={`relative bg-slate-950 border-2 rounded-2xl px-3.5 py-2.5 text-white shadow-2xl transition-all ${
                speakerTurn === 'proponent'
                  ? 'border-blue-500 scale-100 opacity-100'
                  : 'border-slate-600 scale-95 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-400 truncate">
                  {soundEnabled && playing && speakerTurn === 'proponent' && (
                    <Volume2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">{dialogue.proponent.name}</span>
                </span>
                <span className="font-mono text-[11px] font-bold text-blue-200 tabular-nums shrink-0">
                  {dialogue.proponent.score}/100
                </span>
              </div>
              <p className="text-xs text-slate-100 mt-1 leading-snug">
                &ldquo;{dialogue.proponent.statement}&rdquo;
              </p>
              <span
                aria-hidden="true"
                className={`absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 bg-slate-950 border-r-2 border-b-2 ${
                  speakerTurn === 'proponent' ? 'border-blue-500' : 'border-slate-600'
                }`}
              />
            </div>
          </div>

          {/* 3. Cross-Examining Counsel Floating Speech Bubble (Above Counter-Lawyer's Head) */}
          <div
            ref={opponentBubbleRef}
            style={{ opacity: 0, transform: 'translate3d(-9999px, -9999px, 0)' }}
            className={`absolute top-0 left-0 w-[275px] sm:w-[310px] transition-opacity duration-200 will-change-transform ${
              speakerTurn !== 'proponent' ? 'z-20' : 'z-10'
            }`}
          >
            <div
              className={`relative bg-slate-950 border-2 rounded-2xl px-3.5 py-2.5 text-white shadow-2xl transition-all ${
                speakerTurn !== 'proponent'
                  ? 'border-amber-500 scale-100 opacity-100'
                  : 'border-slate-600 scale-95 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 truncate">
                  {soundEnabled && playing && speakerTurn !== 'proponent' && (
                    <Volume2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {speakerTurn === 'examiner'
                      ? dialogue.examiner.name
                      : `${dialogue.opponent.name} (Objection)`}
                  </span>
                </span>
                <span className="font-mono text-[11px] font-bold text-amber-200 tabular-nums shrink-0">
                  {speakerTurn === 'examiner'
                    ? dialogue.examiner.score
                    : dialogue.opponent.score}
                  /100
                </span>
              </div>
              <p className="text-xs text-slate-100 mt-1 leading-snug">
                &ldquo;
                {speakerTurn === 'examiner'
                  ? dialogue.examiner.statement
                  : dialogue.opponent.statement}
                &rdquo;
              </p>
              <span
                aria-hidden="true"
                className={`absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 bg-slate-950 border-r-2 border-b-2 ${
                  speakerTurn !== 'proponent' ? 'border-amber-500' : 'border-slate-600'
                }`}
              />
            </div>
          </div>

          {/* 4. Tall Supreme Jury Arbiter Floating Gavel Verdict Speech Bubble */}
          <div
            ref={juryBubbleRef}
            style={{ opacity: 0, transform: 'translate3d(-9999px, -9999px, 0)' }}
            className="absolute top-0 left-0 w-[305px] sm:w-[350px] z-20 transition-opacity duration-200 will-change-transform"
          >
            <div className="relative bg-slate-950 border-2 border-amber-400 rounded-2xl px-4 py-3 text-white shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-400">
                  <Gavel className="w-3.5 h-3.5" aria-hidden="true" />
                  {soundEnabled && playing && <Volume2 className="w-3 h-3 shrink-0" aria-hidden="true" />}
                  <span>Supreme Jury Verdict #{activeCaseIdx + 1}</span>
                </span>
                <span className="font-mono text-xs font-bold text-white tabular-nums">
                  {currentJob.jury_score || currentJob.score}/100
                </span>
              </div>
              <div className="text-xs font-bold text-emerald-400 mt-1">
                {currentJob.jury_verdict || currentItem?.verdict?.verdict || 'APPROVED BY MAJORITY VOTE'}
              </div>
              <p className="text-xs text-slate-100 mt-1 leading-relaxed">
                &ldquo;{dialogue.juryComment}&rdquo;
              </p>
              <span
                aria-hidden="true"
                className="absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 bg-slate-950 border-r-2 border-b-2 border-amber-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* TOP HUD BAR: Compact Job Case Card + Quick Actions + Docket Controls */}
      <div className="relative z-20 pointer-events-none p-3 sm:p-4 flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        {/* Left: Active Case Header & App Workflow Stepper */}
        <div className="pointer-events-auto bg-slate-950/92 border border-slate-700/80 rounded-xl px-4 py-3 text-white max-w-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              Session {sessionId || 'Live'} {sessionDate ? `· ${sessionDate}` : ''}
            </span>
            <span className="font-mono text-amber-400 tabular-nums">
              Case {activeCaseIdx + 1} of {totalCases} · Gavel strikes: {gavelHitCount}
            </span>
          </div>

          {currentJob ? (
            <div className="mt-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-blue-400 font-medium">
                {currentDept && (
                  <>
                    <span className={`font-semibold ${currentDept.cssBadgeText}`}>
                      {currentDept.scoutTitle}
                    </span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>Source: {currentJob.source}</span>
                <span aria-hidden="true">·</span>
                <span>{currentJob.posted_date || 'Recently posted'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{currentJob.jury_score || currentJob.score}/100</span>
              </div>
              <h1 className="font-display text-sm sm:text-base font-bold text-white leading-snug mt-0.5 line-clamp-1">
                {currentJob.title}
              </h1>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-0.5">
                <p className="text-xs text-slate-300 truncate">
                  {currentJob.company} · {currentJob.location || 'Global / Remote'}
                </p>

                <div className="flex items-center gap-1.5 shrink-0">
                  {currentJob.status !== 'shortlisted' && currentJob.status !== 'applied' ? (
                    <button
                      type="button"
                      onClick={() => onStatusChange(currentJob, 'shortlisted')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                    >
                      <Star className="w-3 h-3" />
                      Shortlist
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenApplication(currentJob.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      Resume &amp; Cover Letter
                    </button>
                  )}
                  {currentJob.url && (
                    <a
                      href={currentJob.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onTrackClick(currentJob.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-blue-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded transition-colors"
                    >
                      <span>Open Job</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <h1 className="font-display text-base font-bold text-white mt-1">
              Supreme Jury Deliberation Room
            </h1>
          )}

          {/* 5-Step App Workflow Progress */}
          <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-800 overflow-x-auto">
            {(
              [
                ['scout', '1. Scouted'],
                ['submit', '2. Submitted'],
                ['argue', '3. Lawyers Argue'],
                ['gavel', '4. Jury Gavel & Verdict'],
              ] as Array<[Exclude<WorkflowPhase, 'celebrate'>, string]>
            ).map(([key, label]) => {
              const active = phase === key && !cycleCompleted;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => jumpToPhaseInCurrentCase(key)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <span
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md whitespace-nowrap shrink-0 ${
                celebrating || cycleCompleted
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'bg-slate-900 text-slate-500'
              }`}
            >
              5. Top 5 Certified
            </span>
          </div>
        </div>

        {/* Right: Courtroom Actions */}
        <div className="pointer-events-auto flex items-center gap-2 self-start flex-wrap justify-end">
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundEnabled ? 'Mute courtroom voice & SFX' : 'Enable courtroom voice & SFX'}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-lg transition-colors whitespace-nowrap ${
              soundEnabled
                ? 'bg-emerald-950/90 border-emerald-500/70 text-emerald-200 hover:bg-emerald-900'
                : 'bg-slate-950/92 border-slate-700/80 text-slate-300 hover:bg-slate-900'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
            <span>{soundEnabled ? 'Voice & SFX On' : 'Voice Muted'}</span>
          </button>
          <button
            type="button"
            onClick={onOpenDocket}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-100 bg-slate-950/92 border border-slate-700/80 hover:bg-slate-900 rounded-lg transition-colors whitespace-nowrap"
          >
            <ListFilter className="w-3.5 h-3.5 text-blue-400" />
            <span>Full Docket ({items.length})</span>
          </button>
          <button
            type="button"
            onClick={onConveneJury}
            disabled={isConvening}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConvening ? 'animate-spin' : ''}`} />
            <span>{isConvening ? 'Re-Debating…' : 'Re-Score & Re-Debate'}</span>
          </button>
        </div>
      </div>

      {/* CELEBRATION & TODAY'S COMPLETION BANNER */}
      {(celebrating || cycleCompleted) && (
        <div className="pointer-events-auto absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[min(540px,92vw)] bg-slate-950/95 border-2 border-amber-400 rounded-2xl px-6 py-5 text-white shadow-2xl text-center">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-amber-400/15 border border-amber-400/50 text-amber-300 mb-2">
            {celebrating ? <Sparkles className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          </div>
          <h2 className="font-display text-lg font-bold text-white">
            {celebrating
              ? 'Courtroom Applause — Top 5 Jobs Evaluated!'
              : "Today's Top 5 Jobs Evaluated & Sealed"}
          </h2>
          <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
            {celebrating
              ? `All ${totalCases} daily priority roles have been scouted, argued, and certified by the Supreme Jury.`
              : `Deliberation paused after certifying today's top ${totalCases} picks. Runs fresh from scratch on every reload and automatically every 24 hours.`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
            <button
              type="button"
              onClick={() => {
                unlockCourtAudio();
                resetTrialFromScratch(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Replay Today&apos;s Trials</span>
            </button>
            <button
              type="button"
              onClick={onConveneJury}
              disabled={isConvening}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isConvening ? 'animate-spin' : ''}`} />
              <span>{isConvening ? 'Re-Debating…' : 'Run Fresh Deliberation'}</span>
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM UNIFIED DOCK: 5 Real Evaluated Jobs Strip + Playback/Camera Controls */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(1040px,96vw)] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-slate-200 bg-slate-950/92 border border-slate-700/80 rounded-md hover:bg-slate-900 transition-colors"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Courtroom Controls &amp; 5 Evaluated Jobs</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-slate-950/92 border border-slate-700/80 rounded-xl p-2.5 space-y-2">
            {topCases.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
                {topCases.map((item, idx) => {
                  const isCurrent = idx === activeCaseIdx;
                  const isDone = evaluatedMask[idx] || idx < activeCaseIdx;
                  const dept = classifyJobDepartment(item.job);
                  return (
                    <button
                      key={item.job.id}
                      type="button"
                      onClick={() => jumpToCase(idx, 'scout')}
                      className={`text-left px-2.5 py-2 rounded-lg border transition-colors ${
                        isCurrent
                          ? 'bg-blue-600/25 border-blue-500 text-white'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="font-mono font-semibold text-amber-400 tabular-nums">
                          #{idx + 1} · {item.job.jury_score || item.job.score}
                        </span>
                        {isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="text-[10px] text-slate-500">
                            {isCurrent ? 'On Trial' : 'Queued'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold truncate mt-0.5">
                        {item.job.title}
                      </div>
                      <div className="flex items-center justify-between gap-1.5 text-[11px] text-slate-400 mt-0.5">
                        <span className="truncate">{item.job.company}</span>
                        <span className={`font-medium shrink-0 ${dept.cssBadgeText}`}>
                          {dept.shortLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800 text-xs text-slate-200">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    unlockCourtAudio();
                    if (cycleCompleted) {
                      resetTrialFromScratch(true);
                      return;
                    }
                    setPlaying((p) => !p);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap"
                >
                  {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{playing ? 'Pause' : cycleCompleted ? 'Replay' : 'Play'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    unlockCourtAudio();
                    resetTrialFromScratch(true);
                  }}
                  aria-label="Restart 5-job trial cycle"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSpeed((s) => (s === 1 ? 1.5 : 1))}
                  className="px-2 py-1 font-mono text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors tabular-nums"
                >
                  {speed}x
                </button>
                <button
                  type="button"
                  onClick={toggleSound}
                  aria-label={soundEnabled ? 'Mute voice' : 'Unmute voice'}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                >
                  {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                <span className="hidden md:inline text-[11px] text-slate-400 ml-2 tabular-nums">
                  {Math.round(totalDuration)}s 5-case cycle + applause · Auto-renews on reload &amp; 24h
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setAutoFollowCamera(true);
                    simRef.current.autoFollowCamera = true;
                  }}
                  className={`px-2 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap ${
                    autoFollowCamera
                      ? 'bg-slate-100 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  Auto-Cam
                </button>
                {(
                  [
                    ['overview', 'Courtroom'],
                    ['scouts', 'Boards'],
                    ['debate', 'Lawyers'],
                    ['jury', 'Gavel Bench'],
                  ] as Array<[CameraPreset, string]>
                ).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => selectCameraPreset(preset)}
                    className={`px-2 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap ${
                      cameraPreset === preset && !autoFollowCamera
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
