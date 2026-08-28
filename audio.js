/* ============================================================
   audio.js — ROOMS WITHIN
   FULL REPLACEMENT

   Behaviour:
   - Normal webpage stays silent.
   - ENTER VR starts ambience while SOUND is ON.
   - Settings SOUND: ON / SOUND: OFF always toggles immediately.
   - SOUND: OFF stops room ambience, TV static, thunder,
     footsteps, scare footsteps, and spiral ambience.
   - SOUND: ON restores audio after the Settings menu is resumed.
   - Fan, rain, fluorescent hum, and TV static fade with distance.
   - A subtle generated spiral ambience moves left -> right -> left.
   - Native HTMLAudioElement playback is used for Quest reliability.
============================================================ */


/* ============================================================
   GLOBAL AUDIO STATE
============================================================ */

let roomsMasterVolume = 1.0;
let roomsMuted = false;
let roomsTVOn = false;
let roomsAudioUnlocked = false;
let roomsVRStarted = false;
let roomsLastUnlockSource = 'none';
let roomsLastThunderTime = -Infinity;

window.roomsMuted = roomsMuted;


/* ============================================================
   SOUND DEFINITIONS
============================================================ */

const ROOM_SOUND_DEFINITIONS = [
  {
    id: 'fanSound',
    src: 'sounds/73347__noisecollector__noisy_ceiling_fan.mp3',
    position: new THREE.Vector3(-3.5, 2.4, -1.0),
    baseVolume: 0.34,
    fullVolumeDistance: 2.5,
    maxDistance: 12.0,
    loop: true,
    auto: true,
    global: false
  },

  {
    id: 'rainSound',
    src: 'sounds/bedroom-rain.wav',
    position: new THREE.Vector3(-2.0, 1.6, -3.0),
    baseVolume: 0.28,
    fullVolumeDistance: 2.8,
    maxDistance: 13.0,
    loop: true,
    auto: true,
    global: false
  },

  {
    id: 'fluorescentSound',
    src: 'sounds/fluorescent-light.wav',
    position: new THREE.Vector3(2.5, 2.5, 1.5),
    baseVolume: 0.20,
    fullVolumeDistance: 2.2,
    maxDistance: 10.0,
    loop: true,
    auto: true,
    global: false
  },

  {
    id: 'tvStaticSound',
    src: 'sounds/tv-static.mp3',
    position: new THREE.Vector3(0, 1.2, 0),
    baseVolume: 0.24,
    fullVolumeDistance: 1.8,
    maxDistance: 8.0,
    loop: true,
    auto: false,
    global: false
  },

  {
    id: 'thunderSound',
    src: 'sounds/thunder.wav',
    position: new THREE.Vector3(0, 0, 0),
    baseVolume: 0.62,
    fullVolumeDistance: 999,
    maxDistance: 1000,
    loop: false,
    auto: false,
    global: true
  }
];


/* ============================================================
   TRACK STORAGE
============================================================ */

const roomsTracks = new Map();
const roomsTrackErrors = new Map();


/* ============================================================
   SPIRAL AMBIENCE STATE
============================================================ */

const ROOMS_SPIRAL_BASE_VOLUME = 0.035;
const ROOMS_SPIRAL_CYCLE_SECONDS = 8.0;

const roomsSpiral = {
  context: null,
  source: null,
  filter: null,
  panner: null,
  gain: null,
  timer: null,
  started: false,
  available: false,
  startTime: 0
};


/* ============================================================
   HELPERS
============================================================ */

function clamp01(value) {
  return Math.max(
    0,
    Math.min(
      1,
      Number(value) || 0
    )
  );
}


function getScene() {
  return document.querySelector('a-scene');
}


function getCameraEntity() {
  return (
    document.querySelector('#cam') ||
    document.querySelector('[camera]')
  );
}


function getDefinition(id) {
  return (
    ROOM_SOUND_DEFINITIONS.find(
      (definition) => definition.id === id
    ) || null
  );
}


function hasRoomsImmersiveXRSession(scene) {
  try {
    if (
      !scene ||
      !scene.renderer ||
      !scene.renderer.xr
    ) {
      return false;
    }

    const xr = scene.renderer.xr;

    return Boolean(
      xr.isPresenting ||
      (
        xr.getSession &&
        xr.getSession()
      )
    );
  } catch (error) {
    return false;
  }
}


function isRoomsPauseMenuOpen() {
  if (
    window.roomsPaused ||
    window.roomsInputLocked
  ) {
    return true;
  }

  const desktopOverlay =
    document.querySelector(
      '#screenPauseMenuOverlay'
    );

  if (
    desktopOverlay &&
    desktopOverlay.classList.contains('is-open')
  ) {
    return true;
  }

  const vrPanel =
    document.querySelector('#vrPausePanel');

  if (vrPanel) {
    const visible =
      vrPanel.getAttribute('visible');

    if (
      visible === true ||
      visible === 'true'
    ) {
      return true;
    }
  }

  return false;
}


function shouldRoomsAudioBeAudible() {
  return Boolean(
    roomsVRStarted &&
    !roomsMuted &&
    !isRoomsPauseMenuOpen()
  );
}


function getPlayerWorldPosition() {
  const camera = getCameraEntity();
  const position = new THREE.Vector3();

  if (
    camera &&
    camera.object3D
  ) {
    camera.object3D.getWorldPosition(
      position
    );
  }

  return position;
}


/* ============================================================
   CREATE NATIVE AUDIO ELEMENTS
============================================================ */

function createRoomsAudioElement(definition) {
  const audio =
    document.createElement('audio');

  audio.id =
    `rooms-${definition.id}`;

  audio.src = definition.src;
  audio.preload = 'auto';
  audio.loop = Boolean(definition.loop);
  audio.playsInline = true;
  audio.volume = 0;

  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.style.display = 'none';

  audio.addEventListener(
    'canplay',
    () => {
      roomsTrackErrors.delete(
        definition.id
      );
    }
  );

  audio.addEventListener(
    'error',
    () => {
      const code =
        audio.error
          ? audio.error.code
          : 'unknown';

      roomsTrackErrors.set(
        definition.id,
        `media error ${code}`
      );

      console.error(
        `Rooms Within audio failed: ${definition.src} (code ${code})`
      );
    }
  );

  document.body.appendChild(audio);

  return audio;
}


function ensureRoomsTracks() {
  ROOM_SOUND_DEFINITIONS.forEach(
    (definition) => {
      if (
        roomsTracks.has(
          definition.id
        )
      ) {
        return;
      }

      roomsTracks.set(
        definition.id,
        {
          definition,
          audio: createRoomsAudioElement(
            definition
          ),
          lastDistance: Infinity,
          lastGain: 0,
          lastPlaySucceeded: false
        }
      );
    }
  );
}


/* ============================================================
   DISTANCE FADING
============================================================ */

function getDistanceGain(
  distance,
  definition
) {
  if (!definition) {
    return 0;
  }

  if (definition.global) {
    return 1;
  }

  const fullDistance =
    Math.max(
      0,
      Number(
        definition.fullVolumeDistance
      ) || 0
    );

  const maxDistance =
    Math.max(
      fullDistance + 0.001,
      Number(
        definition.maxDistance
      ) ||
      fullDistance + 1
    );

  const d =
    Math.max(
      0,
      Number(distance) || 0
    );

  if (d <= fullDistance) {
    return 1;
  }

  if (d >= maxDistance) {
    return 0;
  }

  const normalized =
    clamp01(
      (
        d - fullDistance
      ) /
      (
        maxDistance - fullDistance
      )
    );

  const smooth =
    normalized *
    normalized *
    (
      3 -
      2 * normalized
    );

  return 1 - smooth;
}


function calculateTrackVolume(
  track,
  playerPosition
) {
  if (
    !track ||
    !track.definition ||
    !shouldRoomsAudioBeAudible()
  ) {
    return 0;
  }

  const definition = track.definition;

  if (definition.global) {
    track.lastDistance = 0;
    track.lastGain = 1;

    return clamp01(
      definition.baseVolume *
      roomsMasterVolume
    );
  }

  const distance =
    playerPosition.distanceTo(
      definition.position
    );

  const gain =
    getDistanceGain(
      distance,
      definition
    );

  track.lastDistance = distance;
  track.lastGain = gain;

  return clamp01(
    definition.baseVolume *
    roomsMasterVolume *
    gain
  );
}


function updateRoomsTrackVolumes() {
  const playerPosition =
    getPlayerWorldPosition();

  roomsTracks.forEach(
    (track) => {
      if (
        !track ||
        !track.audio
      ) {
        return;
      }

      track.audio.volume =
        calculateTrackVolume(
          track,
          playerPosition
        );
    }
  );

  updateRoomsSpiralVolume();
}


/* ============================================================
   PLAY / PAUSE NATIVE TRACKS
============================================================ */

function requestRoomsTrackPlay(
  id,
  restart = false
) {
  const track = roomsTracks.get(id);

  if (
    !track ||
    !track.audio
  ) {
    return false;
  }

  const audio = track.audio;

  if (restart) {
    try {
      audio.currentTime = 0;
    } catch (error) {
      /* ignore seek error */
    }
  }

  if (!audio.paused) {
    track.lastPlaySucceeded = true;
    return true;
  }

  try {
    const playPromise = audio.play();

    if (
      playPromise &&
      typeof playPromise.then === 'function'
    ) {
      playPromise
        .then(() => {
          track.lastPlaySucceeded = true;
          roomsTrackErrors.delete(id);
          roomsAudioUnlocked = true;

          const scene = getScene();

          if (scene) {
            scene.audioUnlocked = true;
          }
        })
        .catch((error) => {
          track.lastPlaySucceeded = false;

          roomsTrackErrors.set(
            id,
            error.name ||
            error.message ||
            String(error)
          );

          console.warn(
            `Rooms Within: ${id} could not play:`,
            error
          );
        });
    } else {
      track.lastPlaySucceeded = true;
      roomsAudioUnlocked = true;
    }

    return true;
  } catch (error) {
    track.lastPlaySucceeded = false;

    roomsTrackErrors.set(
      id,
      error.name ||
      error.message ||
      String(error)
    );

    return false;
  }
}


function pauseRoomsTrack(
  id,
  reset = false
) {
  const track = roomsTracks.get(id);

  if (
    !track ||
    !track.audio
  ) {
    return;
  }

  track.audio.pause();

  if (reset) {
    try {
      track.audio.currentTime = 0;
    } catch (error) {
      /* ignore seek error */
    }
  }
}


function pauseAllRoomsNativeAudio() {
  roomsTracks.forEach(
    (track) => {
      if (
        track &&
        track.audio
      ) {
        track.audio.pause();
      }
    }
  );

  const footstep =
    document.querySelector(
      '#footstepAudio'
    );

  const scareFootstep =
    document.querySelector(
      '#scareFootstepAudio'
    );

  if (footstep) {
    footstep.pause();
  }

  if (scareFootstep) {
    scareFootstep.pause();
  }
}


/* ============================================================
   SPIRAL AMBIENCE

   Generated low-frequency noise moves:

   LEFT -> CENTER -> RIGHT -> CENTER -> LEFT

   No extra audio file is required.
============================================================ */

function createRoomsSpiralBuffer(context) {
  const duration = 2;

  const frameCount =
    Math.max(
      1,
      Math.floor(
        context.sampleRate *
        duration
      )
    );

  const buffer =
    context.createBuffer(
      1,
      frameCount,
      context.sampleRate
    );

  const data =
    buffer.getChannelData(0);

  let previous = 0;

  for (
    let i = 0;
    i < frameCount;
    i += 1
  ) {
    const random =
      Math.random() * 2 - 1;

    previous =
      previous * 0.92 +
      random * 0.08;

    data[i] = previous;
  }

  return buffer;
}


function ensureRoomsSpiralAudio() {
  if (
    roomsSpiral.started &&
    roomsSpiral.context
  ) {
    if (
      roomsSpiral.context.state ===
      'suspended'
    ) {
      roomsSpiral.context
        .resume()
        .catch(() => {});
    }

    return true;
  }

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContextClass) {
    roomsSpiral.available = false;
    return false;
  }

  try {
    const context =
      new AudioContextClass();

    if (
      typeof context.createStereoPanner !==
      'function'
    ) {
      roomsSpiral.available = false;

      context.close().catch(() => {});

      return false;
    }

    const source =
      context.createBufferSource();

    const filter =
      context.createBiquadFilter();

    const panner =
      context.createStereoPanner();

    const gain =
      context.createGain();

    source.buffer =
      createRoomsSpiralBuffer(context);

    source.loop = true;

    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.8;

    panner.pan.value = 0;
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(context.destination);

    source.start();

    roomsSpiral.context = context;
    roomsSpiral.source = source;
    roomsSpiral.filter = filter;
    roomsSpiral.panner = panner;
    roomsSpiral.gain = gain;
    roomsSpiral.started = true;
    roomsSpiral.available = true;
    roomsSpiral.startTime =
      performance.now();

    roomsSpiral.timer =
      window.setInterval(
        updateRoomsSpiralPan,
        50
      );

    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }

    updateRoomsSpiralPan();
    updateRoomsSpiralVolume();

    return true;
  } catch (error) {
    roomsSpiral.available = false;

    console.warn(
      'Rooms Within: spiral ambience unavailable:',
      error
    );

    return false;
  }
}


function updateRoomsSpiralPan() {
  if (
    !roomsSpiral.started ||
    !roomsSpiral.context ||
    !roomsSpiral.panner ||
    !roomsSpiral.filter
  ) {
    return;
  }

  const elapsedSeconds =
    (
      performance.now() -
      roomsSpiral.startTime
    ) /
    1000;

  const phase =
    elapsedSeconds /
    ROOMS_SPIRAL_CYCLE_SECONDS *
    Math.PI *
    2;

  const pan = Math.sin(phase);

  const filterFrequency =
    430 +
    180 *
    (
      0.5 +
      0.5 *
      Math.sin(
        phase * 0.5 +
        Math.PI * 0.35
      )
    );

  try {
    roomsSpiral.panner.pan
      .setTargetAtTime(
        pan,
        roomsSpiral.context.currentTime,
        0.08
      );

    roomsSpiral.filter.frequency
      .setTargetAtTime(
        filterFrequency,
        roomsSpiral.context.currentTime,
        0.15
      );
  } catch (error) {
    roomsSpiral.panner.pan.value = pan;
    roomsSpiral.filter.frequency.value =
      filterFrequency;
  }
}


function updateRoomsSpiralVolume() {
  if (
    !roomsSpiral.started ||
    !roomsSpiral.context ||
    !roomsSpiral.gain
  ) {
    return;
  }

  const target =
    shouldRoomsAudioBeAudible()
      ? ROOMS_SPIRAL_BASE_VOLUME *
        roomsMasterVolume
      : 0;

  try {
    roomsSpiral.gain.gain
      .setTargetAtTime(
        target,
        roomsSpiral.context.currentTime,
        0.08
      );
  } catch (error) {
    roomsSpiral.gain.gain.value = target;
  }
}


/* ============================================================
   FOOTSTEP AUDIO PRIMING
============================================================ */

function primeQuietAudioElement(audio) {
  if (!audio) {
    return;
  }

  const previousMuted = audio.muted;
  const previousVolume = audio.volume;

  audio.muted = true;
  audio.volume = 0;

  try {
    const result = audio.play();

    const finish = () => {
      audio.pause();

      try {
        audio.currentTime = 0;
      } catch (error) {
        /* ignore seek error */
      }

      audio.muted = previousMuted;
      audio.volume = previousVolume;
    };

    if (
      result &&
      typeof result.then === 'function'
    ) {
      result
        .then(finish)
        .catch(() => {
          audio.muted = previousMuted;
          audio.volume = previousVolume;
        });
    } else {
      finish();
    }
  } catch (error) {
    audio.muted = previousMuted;
    audio.volume = previousVolume;
  }
}


/* ============================================================
   START AUDIO FROM USER GESTURE
============================================================ */

function startRoomsAudioFromGesture(source) {
  ensureRoomsTracks();

  roomsLastUnlockSource =
    String(
      source ||
      'vr-user-gesture'
    );

  roomsVRStarted = true;

  /*
    Never force SOUND: OFF back to SOUND: ON.
  */
  if (roomsMuted) {
    pauseAllRoomsNativeAudio();
    updateRoomsSpiralVolume();
    updateRoomsVolumeUI();

    return false;
  }

  updateRoomsTrackVolumes();

  ROOM_SOUND_DEFINITIONS.forEach(
    (definition) => {
      if (definition.auto) {
        requestRoomsTrackPlay(
          definition.id
        );
      }
    }
  );

  if (roomsTVOn) {
    requestRoomsTrackPlay(
      'tvStaticSound'
    );
  }

  ensureRoomsSpiralAudio();

  primeQuietAudioElement(
    document.querySelector(
      '#footstepAudio'
    )
  );

  primeQuietAudioElement(
    document.querySelector(
      '#scareFootstepAudio'
    )
  );

  window.setTimeout(
    () => {
      const anyPlaying =
        Array.from(
          roomsTracks.values()
        ).some(
          (track) =>
            track &&
            track.audio &&
            !track.audio.paused
        );

      if (anyPlaying) {
        roomsAudioUnlocked = true;

        const scene = getScene();

        if (scene) {
          scene.audioUnlocked = true;
        }
      }

      updateRoomsTrackVolumes();
      updateRoomsVolumeUI();
    },
    120
  );

  return true;
}


/* ============================================================
   APPLY CURRENT PLAYBACK STATE
============================================================ */

function applyRoomsPlaybackState() {
  ensureRoomsTracks();
  updateRoomsTrackVolumes();

  if (!shouldRoomsAudioBeAudible()) {
    pauseAllRoomsNativeAudio();
    updateRoomsSpiralVolume();
    return;
  }

  ROOM_SOUND_DEFINITIONS.forEach(
    (definition) => {
      if (definition.auto) {
        requestRoomsTrackPlay(
          definition.id
        );
      }
    }
  );

  if (roomsTVOn) {
    requestRoomsTrackPlay(
      'tvStaticSound'
    );
  } else {
    pauseRoomsTrack(
      'tvStaticSound',
      true
    );
  }

  if (roomsSpiral.started) {
    if (
      roomsSpiral.context &&
      roomsSpiral.context.state ===
        'suspended'
    ) {
      roomsSpiral.context
        .resume()
        .catch(() => {});
    }
  } else {
    ensureRoomsSpiralAudio();
  }

  updateRoomsSpiralVolume();
}


/* ============================================================
   ENTER VR BUTTON HOOK
============================================================ */

function attachEnterVRButtonAudioHook() {
  const button =
    document.querySelector(
      '.a-enter-vr-button'
    );

  if (
    !button ||
    button.dataset.roomsAudioHook ===
      'true'
  ) {
    return;
  }

  button.dataset.roomsAudioHook =
    'true';

  const start = (event) => {
    startRoomsAudioFromGesture(
      `enter-vr-${event.type}`
    );
  };

  button.addEventListener(
    'pointerdown',
    start,
    true
  );

  button.addEventListener(
    'touchstart',
    start,
    {
      capture: true,
      passive: true
    }
  );

  button.addEventListener(
    'click',
    start,
    true
  );
}


function setupEnterVRButtonWatcher() {
  attachEnterVRButtonAudioHook();

  const observer =
    new MutationObserver(
      () => {
        attachEnterVRButtonAudioHook();
      }
    );

  observer.observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );

  window.setTimeout(
    attachEnterVRButtonAudioHook,
    300
  );

  window.setTimeout(
    attachEnterVRButtonAudioHook,
    1000
  );
}


/* ============================================================
   QUEST CONTROLLER AUDIO RECOVERY
============================================================ */

function attachQuestControllerAudioRecovery() {
  const events = [
    'triggerdown',
    'gripdown',
    'squeezestart',
    'abuttondown',
    'bbuttondown',
    'xbuttondown',
    'ybuttondown'
  ];

  [
    '#leftHand',
    '#rightHand'
  ].forEach(
    (selector) => {
      const hand =
        document.querySelector(selector);

      if (
        !hand ||
        hand.dataset.roomsAudioControllerHook ===
          'true'
      ) {
        return;
      }

      hand.dataset.roomsAudioControllerHook =
        'true';

      events.forEach(
        (eventName) => {
          hand.addEventListener(
            eventName,
            () => {
              const scene = getScene();

              if (
                roomsVRStarted ||
                hasRoomsImmersiveXRSession(
                  scene
                )
              ) {
                /*
                  Do not change the mute state.
                  This only helps recover browser permission.
                */
                if (!roomsMuted) {
                  startRoomsAudioFromGesture(
                    `controller-${eventName}`
                  );
                }
              }
            }
          );
        }
      );
    }
  );
}


/* ============================================================
   A-FRAME AUDIO MANAGER COMPATIBILITY
============================================================ */

AFRAME.registerComponent(
  'spatial-audio-manager',
  {
    init: function () {
      this.lastVolumeUpdate = 0;

      ensureRoomsTracks();

      this.onEnterVR = () => {
        roomsVRStarted = true;

        if (!roomsMuted) {
          startRoomsAudioFromGesture(
            'enter-vr-event'
          );
        }
      };

      this.onExitVR = () => {
        roomsVRStarted = false;

        pauseAllRoomsNativeAudio();
        updateRoomsSpiralVolume();
      };

      this.onPauseChanged = () => {
        applyRoomsPlaybackState();
      };

      this.el.addEventListener(
        'enter-vr',
        this.onEnterVR
      );

      this.el.addEventListener(
        'exit-vr',
        this.onExitVR
      );

      this.el.addEventListener(
        'rooms-pause-changed',
        this.onPauseChanged
      );

      attachQuestControllerAudioRecovery();

      window.setTimeout(
        attachQuestControllerAudioRecovery,
        500
      );

      window.setTimeout(
        attachQuestControllerAudioRecovery,
        1500
      );
    },


    tick: function (time) {
      if (
        time -
        this.lastVolumeUpdate <
        125
      ) {
        return;
      }

      this.lastVolumeUpdate = time;
      updateRoomsTrackVolumes();
    },


    pauseAll: function () {
      pauseAllRoomsNativeAudio();
      updateRoomsSpiralVolume();
    },


    pauseAllWithoutChangingIntent:
      function () {
        this.pauseAll();
      },


    applyPlaybackState:
      function () {
        applyRoomsPlaybackState();
      },


    playNormalAmbience:
      function () {
        applyRoomsPlaybackState();
      },


    setEmitterPosition:
      function (
        id,
        worldPosition
      ) {
        const definition =
          getDefinition(id);

        if (
          !definition ||
          !worldPosition
        ) {
          return;
        }

        definition.position.set(
          Number(worldPosition.x) || 0,
          Number(worldPosition.y) || 0,
          Number(worldPosition.z) || 0
        );

        updateRoomsTrackVolumes();
      },


    playOneShot:
      function (id) {
        if (
          !shouldRoomsAudioBeAudible()
        ) {
          return false;
        }

        const track = roomsTracks.get(id);

        if (
          !track ||
          !track.audio
        ) {
          return false;
        }

        track.audio.volume =
          clamp01(
            track.definition.baseVolume *
            roomsMasterVolume
          );

        return requestRoomsTrackPlay(
          id,
          true
        );
      },


    remove: function () {
      this.el.removeEventListener(
        'enter-vr',
        this.onEnterVR
      );

      this.el.removeEventListener(
        'exit-vr',
        this.onExitVR
      );

      this.el.removeEventListener(
        'rooms-pause-changed',
        this.onPauseChanged
      );
    }
  }
);


/* ============================================================
   TV SOUND STATE
============================================================ */

function setRoomsTVState(shouldBeOn) {
  roomsTVOn = Boolean(shouldBeOn);

  if (!roomsTVOn) {
    pauseRoomsTrack(
      'tvStaticSound',
      true
    );
  }

  applyRoomsPlaybackState();
}


function setRoomsTVPosition(worldPosition) {
  if (!worldPosition) {
    return;
  }

  const definition =
    getDefinition('tvStaticSound');

  if (!definition) {
    return;
  }

  definition.position.set(
    Number(worldPosition.x) || 0,
    Number(worldPosition.y) || 0,
    Number(worldPosition.z) || 0
  );

  updateRoomsTrackVolumes();
}


/* ============================================================
   THUNDER
============================================================ */

function playRoomsThunder() {
  const now = performance.now();

  if (
    now -
    roomsLastThunderTime <
    250
  ) {
    return false;
  }

  if (!shouldRoomsAudioBeAudible()) {
    return false;
  }

  roomsLastThunderTime = now;

  const track =
    roomsTracks.get('thunderSound');

  if (
    !track ||
    !track.audio
  ) {
    return false;
  }

  track.audio.volume =
    clamp01(
      track.definition.baseVolume *
      roomsMasterVolume
    );

  return requestRoomsTrackPlay(
    'thunderSound',
    true
  );
}


/* ============================================================
   SOUND ON / OFF

   IMPORTANT FIX:
   Always toggle immediately.

   The old version refused to switch to SOUND: OFF when the
   browser's audio-unlocked flag was still false. Quest can report
   that flag late, so the Settings button appeared to do nothing.
============================================================ */

function toggleRoomsMute() {
  roomsMuted = !roomsMuted;
  window.roomsMuted = roomsMuted;

  /*
    Change the Settings label immediately.
  */
  updateRoomsVolumeUI();

  const scene = getScene();

  if (scene) {
    scene.emit(
      'audio-settings-changed',
      getRoomsAudioState(),
      false
    );
  }

  /* ========================================================
     SOUND: OFF
  ======================================================== */

  if (roomsMuted) {
    pauseAllRoomsNativeAudio();
    updateRoomsSpiralVolume();

    return true;
  }

  /* ========================================================
     SOUND: ON

     If Settings is currently open, the game is paused, so the
     tracks stay paused until Resume. The ON state is still saved.
  ======================================================== */

  if (
    roomsVRStarted &&
    !isRoomsPauseMenuOpen()
  ) {
    startRoomsAudioFromGesture(
      'settings-sound-on'
    );
  } else {
    applyRoomsPlaybackState();
  }

  return false;
}


/* ============================================================
   MASTER VOLUME
============================================================ */

function changeRoomsVolume(amount) {
  roomsMasterVolume =
    clamp01(
      roomsMasterVolume +
      Number(amount || 0)
    );

  applyRoomsAudioSettings();
}


/* ============================================================
   APPLY AUDIO SETTINGS
============================================================ */

function applyRoomsAudioSettings() {
  applyRoomsPlaybackState();
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


/* ============================================================
   SETTINGS LABEL
============================================================ */

function updateRoomsVolumeUI() {
  const text =
    roomsMuted
      ? 'SOUND: OFF'
      : 'SOUND: ON';

  const screenSoundButton =
    document.querySelector(
      '#screenSoundButton'
    );

  const vrSoundLabel =
    document.querySelector(
      '#vrSoundLabel'
    );

  if (screenSoundButton) {
    screenSoundButton.textContent = text;
  }

  if (vrSoundLabel) {
    vrSoundLabel.setAttribute(
      'value',
      text
    );
  }
}


/* ============================================================
   FOOTSTEP PLAYER
============================================================ */

AFRAME.registerComponent(
  'footstep-player',
  {
    schema: {
      minSpeed: {
        default: 0.02
      },

      maxSpeed: {
        default: 4
      },

      volume: {
        default: 0.11
      }
    },


    init: function () {
      this.audio =
        document.querySelector(
          '#footstepAudio'
        );

      this.previousPosition =
        new THREE.Vector3();

      this.currentPosition =
        new THREE.Vector3();

      this.hasPrevious = false;
      this.playing = false;

      if (this.audio) {
        this.audio.loop = true;
        this.audio.playsInline = true;
      }
    },


    stopSteps: function () {
      if (!this.audio) {
        return;
      }

      this.audio.pause();
      this.playing = false;
    },


    pause: function () {
      this.stopSteps();
      this.hasPrevious = false;
    },


    play: function () {
      this.hasPrevious = false;
    },


    tick: function (
      time,
      deltaTime
    ) {
      if (
        !this.audio ||
        !deltaTime
      ) {
        return;
      }

      if (!shouldRoomsAudioBeAudible()) {
        if (this.playing) {
          this.stopSteps();
        }

        this.hasPrevious = false;
        return;
      }

      this.el.object3D
        .getWorldPosition(
          this.currentPosition
        );

      if (!this.hasPrevious) {
        this.previousPosition.copy(
          this.currentPosition
        );

        this.hasPrevious = true;
        return;
      }

      const dx =
        this.currentPosition.x -
        this.previousPosition.x;

      const dz =
        this.currentPosition.z -
        this.previousPosition.z;

      const distance =
        Math.sqrt(
          dx * dx +
          dz * dz
        );

      const speed =
        distance /
        Math.max(
          deltaTime / 1000,
          0.001
        );

      const walking =
        speed >= this.data.minSpeed &&
        speed <= this.data.maxSpeed;

      this.audio.volume =
        clamp01(
          this.data.volume *
          roomsMasterVolume
        );

      if (
        walking &&
        !this.playing
      ) {
        try {
          const result =
            this.audio.play();

          this.playing = true;

          if (
            result &&
            result.catch
          ) {
            result.catch(() => {
              this.playing = false;
            });
          }
        } catch (error) {
          this.playing = false;
        }
      } else if (
        !walking &&
        this.playing
      ) {
        this.stopSteps();
      }

      this.previousPosition.copy(
        this.currentPosition
      );
    }
  }
);


/* ============================================================
   AUDIO STATE
============================================================ */

function getRoomsAudioState() {
  return {
    muted: roomsMuted,
    volume: roomsMasterVolume,
    tvOn: roomsTVOn,
    unlocked: roomsAudioUnlocked,
    vrStarted: roomsVRStarted,
    immersiveXR:
      hasRoomsImmersiveXRSession(
        getScene()
      ),
    lastUnlockSource:
      roomsLastUnlockSource,
    spiralAvailable:
      roomsSpiral.available
  };
}


/* ============================================================
   DEBUG

   Browser console:
   getRoomsAudioDebug()
============================================================ */

function getRoomsAudioDebug() {
  return {
    muted: roomsMuted,
    masterVolume: roomsMasterVolume,
    vrStarted: roomsVRStarted,
    unlocked: roomsAudioUnlocked,
    immersiveXR:
      hasRoomsImmersiveXRSession(
        getScene()
      ),
    lastUnlockSource:
      roomsLastUnlockSource,

    spiral: {
      available:
        roomsSpiral.available,
      started:
        roomsSpiral.started,
      contextState:
        roomsSpiral.context
          ? roomsSpiral.context.state
          : 'none',
      pan:
        roomsSpiral.panner
          ? Number(
              roomsSpiral.panner.pan.value
                .toFixed(3)
            )
          : null,
      gain:
        roomsSpiral.gain
          ? Number(
              roomsSpiral.gain.gain.value
                .toFixed(4)
            )
          : null
    },

    tracks:
      Array.from(
        roomsTracks.entries()
      ).map(
        ([id, track]) => ({
          id,
          src:
            track.definition.src,
          paused:
            track.audio.paused,
          readyState:
            track.audio.readyState,
          networkState:
            track.audio.networkState,
          volume:
            Number(
              track.audio.volume
                .toFixed(3)
            ),
          distance:
            Number.isFinite(
              track.lastDistance
            )
              ? Number(
                  track.lastDistance
                    .toFixed(2)
                )
              : null,
          distanceGain:
            Number(
              track.lastGain
                .toFixed(3)
            ),
          lastPlaySucceeded:
            track.lastPlaySucceeded,
          error:
            roomsTrackErrors.get(id) ||
            null
        })
      )
  };
}


/* ============================================================
   GLOBAL EXPORTS
============================================================ */

/*
  Compatibility only.
  There is no separate ENABLE SOUND button anymore.
*/

window.enableSound =
  function () {
    return startRoomsAudioFromGesture(
      'legacy-enableSound-call'
    );
  };


window.unlockRoomsAudio =
  startRoomsAudioFromGesture;


window.ensureRoomsAudioUnlocked =
  startRoomsAudioFromGesture;


window.setRoomsTVState =
  setRoomsTVState;


window.setRoomsTVPosition =
  setRoomsTVPosition;


window.playRoomsThunder =
  playRoomsThunder;


window.changeRoomsVolume =
  changeRoomsVolume;


window.toggleRoomsMute =
  toggleRoomsMute;


window.getRoomsAudioState =
  getRoomsAudioState;


window.applyRoomsAudioSettings =
  applyRoomsAudioSettings;


window.updateRoomsVolumeUI =
  updateRoomsVolumeUI;


window.getRoomsAudioDebug =
  getRoomsAudioDebug;


/* ============================================================
   STARTUP
============================================================ */

window.addEventListener(
  'DOMContentLoaded',
  () => {
    /*
      PRELOAD ONLY.
      The normal webpage remains silent.
    */

    ensureRoomsTracks();
    setupEnterVRButtonWatcher();
    attachQuestControllerAudioRecovery();
    updateRoomsVolumeUI();
  }
);