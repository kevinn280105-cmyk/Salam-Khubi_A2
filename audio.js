/* ============================================================
   audio.js — ROOMS WITHIN
   FULL REPLACEMENT — SIMPLE QUEST AUDIO

   - No ENABLE SOUND button.
   - First click / touch / key / Quest controller action unlocks sound.
   - Clicking ENTER VR counts as the unlock gesture.
   - Room audio uses A-Frame / THREE Web Audio for Quest/WebXR.
   - Settings SOUND: ON / OFF is the only sound control.
   - TV static follows the standalone #tv position.
   - Thunder remains compatible with engine-environment.js.
============================================================ */

let roomsMasterVolume = 1.0;
let roomsMuted = false;
let roomsTVOn = false;
let roomsTVWorldPosition = null;
let roomsAudioUnlocked = false;
let roomsUnlockPromise = null;
let roomsLastUnlockSource = 'none';
let roomsLastThunderTime = -Infinity;

window.roomsMuted = roomsMuted;

const ROOM_SOUND_DEFINITIONS = [
  {
    id: 'fanSound',
    src: 'sounds/73347__noisecollector__noisy_ceiling_fan.mp3',
    position: new THREE.Vector3(-3.5, 2.4, -1.0),
    volume: 0.22,
    loop: true,
    autoplay: true,
    positional: true,
    refDistance: 1.5,
    maxDistance: 12,
    rolloffFactor: 1.15
  },
  {
    id: 'rainSound',
    src: 'sounds/bedroom-rain.wav',
    position: new THREE.Vector3(-2.0, 1.6, -3.0),
    volume: 0.18,
    loop: true,
    autoplay: true,
    positional: true,
    refDistance: 1.6,
    maxDistance: 12,
    rolloffFactor: 1.1
  },
  {
    id: 'fluorescentSound',
    src: 'sounds/fluorescent-light.wav',
    position: new THREE.Vector3(2.5, 2.5, 1.5),
    volume: 0.12,
    loop: true,
    autoplay: true,
    positional: true,
    refDistance: 1.2,
    maxDistance: 9,
    rolloffFactor: 1.25
  },
  {
    id: 'tvStaticSound',
    src: 'sounds/tv-static.mp3',
    position: new THREE.Vector3(0, 1.2, 0),
    volume: 0.16,
    loop: true,
    autoplay: false,
    positional: true,
    refDistance: 0.8,
    maxDistance: 7,
    rolloffFactor: 1.4
  },
  {
    id: 'thunderSound',
    src: 'sounds/thunder.wav',
    position: new THREE.Vector3(0, 0, 0),
    volume: 0.55,
    loop: false,
    autoplay: false,
    positional: false,
    refDistance: 1,
    maxDistance: 100,
    rolloffFactor: 1
  }
];

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getScene() {
  return document.querySelector('a-scene');
}

function getRoomSoundDefinition(id) {
  return ROOM_SOUND_DEFINITIONS.find((item) => item.id === id) || null;
}

function hasImmersiveXRSession(scene) {
  try {
    if (!scene || !scene.renderer || !scene.renderer.xr) return false;
    const xr = scene.renderer.xr;
    return Boolean(xr.isPresenting || (xr.getSession && xr.getSession()));
  } catch (error) {
    return false;
  }
}

function isRoomsPauseMenuOpen() {
  if (window.roomsPaused || window.roomsInputLocked) return true;

  const desktopOverlay = document.querySelector('#screenPauseMenuOverlay');
  if (desktopOverlay && desktopOverlay.classList.contains('is-open')) {
    return true;
  }

  const vrPanel = document.querySelector('#vrPausePanel');
  if (vrPanel) {
    const visible = vrPanel.getAttribute('visible');
    if (visible === true || visible === 'true') return true;
  }

  return false;
}

function getFinalVolume(definition) {
  if (!definition || roomsMuted) return 0;
  return clamp01(definition.volume * roomsMasterVolume);
}

function getRoomsAudioContext() {
  try {
    if (
      typeof THREE !== 'undefined' &&
      THREE.AudioContext &&
      THREE.AudioContext.getContext
    ) {
      const context = THREE.AudioContext.getContext();
      if (context) return context;
    }
  } catch (error) {
    /* Continue to fallback. */
  }

  const scene = getScene();
  if (scene && scene.audioListener && scene.audioListener.context) {
    return scene.audioListener.context;
  }

  return null;
}

function wakeAudioContextImmediately() {
  const context = getRoomsAudioContext();
  if (!context) return Promise.resolve(false);
  if (context.state === 'running') return Promise.resolve(true);

  let resumeResult = null;

  try {
    resumeResult = context.resume();
  } catch (error) {
    console.warn('Rooms Within: AudioContext resume failed:', error);
  }

  /* Silent one-frame buffer helps wake mobile/Quest Web Audio. */
  try {
    const buffer = context.createBuffer(1, 1, context.sampleRate || 44100);
    const source = context.createBufferSource();
    const gain = context.createGain();

    gain.gain.value = 0;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);
    source.start(0);
    source.stop(0.01);
  } catch (error) {
    /* Best effort only. */
  }

  if (resumeResult && typeof resumeResult.then === 'function') {
    return resumeResult
      .then(() => context.state === 'running')
      .catch(() => context.state === 'running');
  }

  return Promise.resolve(context.state === 'running');
}

AFRAME.registerComponent('spatial-audio-manager', {
  init: function () {
    this.emitters = new Map();
    this.desiredPlaying = new Set();
    this.playingIds = new Set();
    this.created = false;

    this.onPauseChanged = this.onPauseChanged.bind(this);
    this.onEnterVR = this.onEnterVR.bind(this);
    this.onExitVR = this.onExitVR.bind(this);

    this.el.addEventListener('rooms-pause-changed', this.onPauseChanged);
    this.el.addEventListener('enter-vr', this.onEnterVR);
    this.el.addEventListener('exit-vr', this.onExitVR);

    this.createEmitters();
  },

  createEmitters: function () {
    if (this.created) return;
    this.created = true;

    ROOM_SOUND_DEFINITIONS.forEach((definition) => {
      const emitter = document.createElement('a-entity');

      emitter.setAttribute('id', definition.id);
      emitter.classList.add('spatial-sound');
      emitter.setAttribute('position', {
        x: definition.position.x,
        y: definition.position.y,
        z: definition.position.z
      });

      emitter.setAttribute('sound', {
        src: `url(${definition.src})`,
        autoplay: false,
        loop: Boolean(definition.loop),
        positional: Boolean(definition.positional),
        volume: getFinalVolume(definition),
        distanceModel: 'inverse',
        refDistance: definition.refDistance,
        maxDistance: definition.maxDistance,
        rolloffFactor: definition.rolloffFactor,
        poolSize: definition.id === 'thunderSound' ? 2 : 1
      });

      emitter.addEventListener('sound-loaded', () => {
        if (
          roomsAudioUnlocked &&
          !roomsMuted &&
          !isRoomsPauseMenuOpen() &&
          this.desiredPlaying.has(definition.id)
        ) {
          this.playEmitter(definition.id);
        }
      });

      this.el.appendChild(emitter);
      this.emitters.set(definition.id, emitter);

      if (definition.autoplay) {
        this.desiredPlaying.add(definition.id);
      }
    });

    if (roomsTVWorldPosition) {
      this.setEmitterPosition('tvStaticSound', roomsTVWorldPosition);
    }

    this.updateVolumes();
  },

  getEmitter: function (id) {
    return this.emitters.get(id) || null;
  },

  getSoundComponent: function (id) {
    const emitter = this.getEmitter(id);
    if (!emitter || !emitter.components) return null;
    return emitter.components.sound || null;
  },

  updateVolumes: function () {
    ROOM_SOUND_DEFINITIONS.forEach((definition) => {
      const emitter = this.getEmitter(definition.id);
      if (!emitter) return;
      emitter.setAttribute('sound', 'volume', getFinalVolume(definition));
    });
  },

  playEmitter: function (id) {
    if (!roomsAudioUnlocked || roomsMuted || isRoomsPauseMenuOpen()) {
      return false;
    }

    if (this.playingIds.has(id)) return true;

    const sound = this.getSoundComponent(id);
    if (!sound || !sound.playSound) return false;

    try {
      sound.playSound();
      this.playingIds.add(id);
      return true;
    } catch (error) {
      console.warn(`Rooms Within: could not play ${id}:`, error);
      return false;
    }
  },

  pauseEmitter: function (id) {
    this.playingIds.delete(id);
    const sound = this.getSoundComponent(id);
    if (!sound) return;

    try {
      if (sound.pauseSound) sound.pauseSound();
      else if (sound.stopSound) sound.stopSound();
    } catch (error) {
      /* Ignore pause errors. */
    }
  },

  stopEmitter: function (id) {
    this.desiredPlaying.delete(id);
    this.playingIds.delete(id);

    const sound = this.getSoundComponent(id);
    if (!sound) return;

    try {
      if (sound.stopSound) sound.stopSound();
      else if (sound.pauseSound) sound.pauseSound();
    } catch (error) {
      /* Ignore stop errors. */
    }
  },

  pauseAll: function () {
    this.emitters.forEach((emitter, id) => this.pauseEmitter(id));
  },

  setEmitterPosition: function (id, worldPosition) {
    const definition = getRoomSoundDefinition(id);
    const emitter = this.getEmitter(id);

    if (!definition || !emitter || !worldPosition) return;

    definition.position.set(
      Number(worldPosition.x) || 0,
      Number(worldPosition.y) || 0,
      Number(worldPosition.z) || 0
    );

    emitter.setAttribute('position', {
      x: definition.position.x,
      y: definition.position.y,
      z: definition.position.z
    });
  },

  playOneShot: function (id) {
    if (!roomsAudioUnlocked || roomsMuted || isRoomsPauseMenuOpen()) {
      return false;
    }

    const sound = this.getSoundComponent(id);
    if (!sound || !sound.playSound) return false;

    try {
      sound.playSound();
      return true;
    } catch (error) {
      return false;
    }
  },

  applyPlaybackState: function () {
    this.updateVolumes();

    if (!roomsAudioUnlocked || roomsMuted || isRoomsPauseMenuOpen()) {
      this.pauseAll();
      return;
    }

    ROOM_SOUND_DEFINITIONS.forEach((definition) => {
      if (definition.autoplay) {
        this.desiredPlaying.add(definition.id);
      }
    });

    if (roomsTVOn) {
      this.desiredPlaying.add('tvStaticSound');
    } else {
      this.desiredPlaying.delete('tvStaticSound');
      this.pauseEmitter('tvStaticSound');
    }

    this.desiredPlaying.forEach((id) => this.playEmitter(id));
  },

  onPauseChanged: function () {
    this.applyPlaybackState();
  },

  onEnterVR: function () {
    unlockRoomsAudio('enter-vr');

    window.setTimeout(() => {
      unlockRoomsAudio('enter-vr-retry');
    }, 250);
  },

  onExitVR: function () {
    this.applyPlaybackState();
  },

  remove: function () {
    this.el.removeEventListener('rooms-pause-changed', this.onPauseChanged);
    this.el.removeEventListener('enter-vr', this.onEnterVR);
    this.el.removeEventListener('exit-vr', this.onExitVR);

    this.pauseAll();

    this.emitters.forEach((emitter) => {
      if (emitter.parentNode) emitter.parentNode.removeChild(emitter);
    });

    this.emitters.clear();
    this.desiredPlaying.clear();
    this.playingIds.clear();
  }
});

function getSpatialAudioManager() {
  const scene = getScene();
  if (!scene) return null;
  return scene.components['spatial-audio-manager'] || null;
}

function unlockRoomsAudio(source) {
  const scene = getScene();
  const manager = getSpatialAudioManager();

  if (!scene || !manager) {
    return Promise.resolve(false);
  }

  const context = getRoomsAudioContext();

  if (
    roomsAudioUnlocked &&
    context &&
    context.state === 'running'
  ) {
    manager.applyPlaybackState();
    return Promise.resolve(true);
  }

  if (roomsUnlockPromise) return roomsUnlockPromise;

  roomsLastUnlockSource = String(source || 'unknown');

  roomsUnlockPromise = wakeAudioContextImmediately()
    .then((success) => {
      const currentContext = getRoomsAudioContext();

      roomsAudioUnlocked = Boolean(
        success ||
        (currentContext && currentContext.state === 'running')
      );

      scene.audioUnlocked = roomsAudioUnlocked;

      if (roomsAudioUnlocked) {
        manager.applyPlaybackState();

        [100, 400, 1000].forEach((milliseconds) => {
          window.setTimeout(() => {
            if (roomsAudioUnlocked && !roomsMuted) {
              manager.applyPlaybackState();
            }
          }, milliseconds);
        });
      }

      updateRoomsVolumeUI();

      scene.emit(
        'audio-settings-changed',
        getRoomsAudioState(),
        false
      );

      console.log('Rooms Within audio unlock:', {
        source: roomsLastUnlockSource,
        success: roomsAudioUnlocked,
        contextState: currentContext ? currentContext.state : 'no-context'
      });

      return roomsAudioUnlocked;
    })
    .catch((error) => {
      console.warn('Rooms Within audio unlock failed:', error);
      return false;
    })
    .finally(() => {
      roomsUnlockPromise = null;
    });

  return roomsUnlockPromise;
}

function setRoomsTVState(shouldBeOn) {
  roomsTVOn = Boolean(shouldBeOn);

  const manager = getSpatialAudioManager();
  if (!manager) return;

  if (roomsTVOn) {
    manager.desiredPlaying.add('tvStaticSound');
  } else {
    manager.desiredPlaying.delete('tvStaticSound');
    manager.pauseEmitter('tvStaticSound');
  }

  manager.applyPlaybackState();
}

function setRoomsTVPosition(worldPosition) {
  if (!worldPosition) return;

  roomsTVWorldPosition = new THREE.Vector3(
    Number(worldPosition.x) || 0,
    Number(worldPosition.y) || 0,
    Number(worldPosition.z) || 0
  );

  const manager = getSpatialAudioManager();
  if (manager) {
    manager.setEmitterPosition('tvStaticSound', roomsTVWorldPosition);
  }
}

function playRoomsThunder() {
  const now = performance.now();

  if (
    now - roomsLastThunderTime < 250 ||
    roomsMuted ||
    isRoomsPauseMenuOpen()
  ) {
    return false;
  }

  const manager = getSpatialAudioManager();
  if (!manager || !roomsAudioUnlocked) return false;

  roomsLastThunderTime = now;
  return manager.playOneShot('thunderSound');
}

function changeRoomsVolume(amount) {
  roomsMasterVolume = clamp01(
    roomsMasterVolume + Number(amount || 0)
  );
  applyRoomsAudioSettings();
}

function toggleRoomsMute() {
  /* First SOUND press can also unlock audio if Quest still has it locked. */
  if (!roomsAudioUnlocked) {
    roomsMuted = false;
    window.roomsMuted = false;

    unlockRoomsAudio('settings-sound-button').then(() => {
      applyRoomsAudioSettings();
    });

    updateRoomsVolumeUI();
    return false;
  }

  roomsMuted = !roomsMuted;
  window.roomsMuted = roomsMuted;
  applyRoomsAudioSettings();
  return roomsMuted;
}

function applyRoomsAudioSettings() {
  const manager = getSpatialAudioManager();
  if (manager) manager.applyPlaybackState();

  updateRoomsVolumeUI();

  const scene = getScene();
  if (scene) {
    scene.emit(
      'audio-settings-changed',
      getRoomsAudioState(),
      false
    );
  }
}

function updateRoomsVolumeUI() {
  const soundText = roomsMuted ? 'SOUND: OFF' : 'SOUND: ON';

  const screenSoundButton = document.querySelector('#screenSoundButton');
  if (screenSoundButton) screenSoundButton.textContent = soundText;

  const vrSoundLabel = document.querySelector('#vrSoundLabel');
  if (vrSoundLabel) vrSoundLabel.setAttribute('value', soundText);

  const percent = Math.round(roomsMasterVolume * 100);

  const screenVolumeLabel = document.querySelector('#screenVolumeLabel');
  if (screenVolumeLabel) screenVolumeLabel.textContent = `${percent}%`;

  const vrVolumeLabel = document.querySelector('#vrVolumeLabel');
  if (vrVolumeLabel) vrVolumeLabel.setAttribute('value', `${percent}%`);
}

function getRoomsAudioState() {
  const context = getRoomsAudioContext();

  return {
    muted: roomsMuted,
    volume: roomsMasterVolume,
    tvOn: roomsTVOn,
    unlocked: roomsAudioUnlocked,
    contextState: context ? context.state : 'no-context',
    immersiveXR: hasImmersiveXRSession(getScene()),
    lastUnlockSource: roomsLastUnlockSource
  };
}

function onRoomsAudioUserGesture(event) {
  unlockRoomsAudio(event && event.type ? event.type : 'user-gesture');
}

function setupRoomsAudioGestureStart() {
  /*
    Capture phase is intentional: pressing A-Frame's ENTER VR button
    reaches this audio unlock before that browser gesture finishes.
  */
  window.addEventListener('pointerdown', onRoomsAudioUserGesture, {
    capture: true,
    passive: true
  });

  window.addEventListener('touchstart', onRoomsAudioUserGesture, {
    capture: true,
    passive: true
  });

  window.addEventListener('keydown', onRoomsAudioUserGesture, {
    capture: true
  });

  const attachControllerEvents = () => {
    const hands = [
      document.querySelector('#leftHand'),
      document.querySelector('#rightHand')
    ].filter(Boolean);

    const events = [
      'triggerdown',
      'gripdown',
      'squeezestart',
      'abuttondown',
      'bbuttondown',
      'xbuttondown',
      'ybuttondown'
    ];

    hands.forEach((hand) => {
      if (hand.dataset.roomsAudioRecovery === 'true') return;
      hand.dataset.roomsAudioRecovery = 'true';

      events.forEach((eventName) => {
        hand.addEventListener(eventName, () => {
          unlockRoomsAudio(`controller-${eventName}`);
        });
      });
    });
  };

  attachControllerEvents();
  window.setTimeout(attachControllerEvents, 500);
  window.setTimeout(attachControllerEvents, 1500);
}

/* Keep the existing component name in index.html. */
AFRAME.registerComponent('footstep-player', {
  schema: {
    minSpeed: { default: 0.02 },
    maxSpeed: { default: 4 },
    volume: { default: 0.11 }
  },

  init: function () {
    this.audio = document.querySelector('#footstepAudio');
    this.previousWorldPosition = new THREE.Vector3();
    this.currentWorldPosition = new THREE.Vector3();
    this.hasPreviousPosition = false;
    this.isPlaying = false;

    if (this.audio) {
      this.audio.loop = true;
      this.audio.volume = 0;
    }
  },

  stopSteps: function () {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
  },

  pause: function () {
    this.stopSteps();
    this.hasPreviousPosition = false;
  },

  play: function () {
    this.hasPreviousPosition = false;
  },

  tick: function (time, deltaTime) {
    if (
      !deltaTime ||
      !this.audio ||
      !roomsAudioUnlocked ||
      roomsMuted ||
      isRoomsPauseMenuOpen()
    ) {
      if (this.isPlaying) this.stopSteps();
      this.hasPreviousPosition = false;
      return;
    }

    this.el.object3D.getWorldPosition(this.currentWorldPosition);

    if (!this.hasPreviousPosition) {
      this.previousWorldPosition.copy(this.currentWorldPosition);
      this.hasPreviousPosition = true;
      return;
    }

    const dx = this.currentWorldPosition.x - this.previousWorldPosition.x;
    const dz = this.currentWorldPosition.z - this.previousWorldPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const speed = distance / Math.max(deltaTime / 1000, 0.001);

    const walking =
      speed >= this.data.minSpeed &&
      speed <= this.data.maxSpeed;

    this.audio.volume = clamp01(
      this.data.volume * roomsMasterVolume
    );

    if (walking && !this.isPlaying) {
      try {
        const result = this.audio.play();

        if (result && result.catch) {
          result.catch(() => {
            this.isPlaying = false;
          });
        }

        this.isPlaying = true;
      } catch (error) {
        this.isPlaying = false;
      }
    } else if (!walking && this.isPlaying) {
      this.stopSteps();
    }

    this.previousWorldPosition.copy(this.currentWorldPosition);
  }
});

function getRoomsAudioDebug() {
  const manager = getSpatialAudioManager();
  const context = getRoomsAudioContext();
  const emitters = [];

  if (manager) {
    manager.emitters.forEach((emitter, id) => {
      emitters.push({
        id,
        componentReady: Boolean(
          emitter.components && emitter.components.sound
        ),
        desiredPlaying: manager.desiredPlaying.has(id),
        markedPlaying: manager.playingIds.has(id),
        position: emitter.object3D.position.toArray()
      });
    });
  }

  return {
    unlocked: roomsAudioUnlocked,
    muted: roomsMuted,
    masterVolume: roomsMasterVolume,
    tvOn: roomsTVOn,
    contextState: context ? context.state : 'no-context',
    immersiveXR: hasImmersiveXRSession(getScene()),
    lastUnlockSource: roomsLastUnlockSource,
    managerReady: Boolean(manager),
    emitterCount: emitters.length,
    emitters
  };
}

/* Compatibility export. There is no ENABLE SOUND button anymore. */
window.enableSound = function () {
  return unlockRoomsAudio('legacy-enableSound-call');
};

window.unlockRoomsAudio = unlockRoomsAudio;
window.ensureRoomsAudioUnlocked = unlockRoomsAudio;
window.setRoomsTVState = setRoomsTVState;
window.setRoomsTVPosition = setRoomsTVPosition;
window.playRoomsThunder = playRoomsThunder;
window.changeRoomsVolume = changeRoomsVolume;
window.toggleRoomsMute = toggleRoomsMute;
window.getRoomsAudioState = getRoomsAudioState;
window.applyRoomsAudioSettings = applyRoomsAudioSettings;
window.updateRoomsVolumeUI = updateRoomsVolumeUI;
window.getRoomsAudioDebug = getRoomsAudioDebug;

window.addEventListener('DOMContentLoaded', () => {
  setupRoomsAudioGestureStart();
  updateRoomsVolumeUI();
});