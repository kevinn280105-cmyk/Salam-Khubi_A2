/* ============================================================
   audio.js — ROOMS WITHIN
   FULL REPLACEMENT — QUEST RELIABLE NATIVE AUDIO

   - No ENABLE SOUND button.
   - ENTER VR click starts the sound directly.
   - Uses normal HTMLAudioElement playback because Quest Browser
     is generally more reliable with this across WebXR transitions.
   - Settings SOUND: ON / OFF remains the only sound control.
   - Fan, rain, fluorescent hum and TV static fade by distance.
============================================================ */

let roomsMasterVolume = 1.0;
let roomsMuted = false;
let roomsTVOn = false;
let roomsTVWorldPosition = null;
let roomsAudioUnlocked = false;
let roomsLastUnlockSource = 'none';
let roomsLastThunderTime = -Infinity;

window.roomsMuted = roomsMuted;


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


const roomsTracks =
  new Map();


const roomsDesiredPlaying =
  new Set();


const roomsTrackErrors =
  new Map();


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
  return document.querySelector(
    'a-scene'
  );
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
      (item) =>
        item.id === id
    ) ||
    null
  );
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
    desktopOverlay.classList.contains(
      'is-open'
    )
  ) {
    return true;
  }


  const vrPanel =
    document.querySelector(
      '#vrPausePanel'
    );


  if (vrPanel) {
    const visible =
      vrPanel.getAttribute(
        'visible'
      );


    if (
      visible === true ||
      visible === 'true'
    ) {
      return true;
    }
  }


  return false;
}


/* ============================================================
   CREATE AUDIO
============================================================ */

function createAudioElement(
  definition
) {
  const audio =
    document.createElement(
      'audio'
    );


  audio.id =
    `rooms-${definition.id}`;


  audio.src =
    definition.src;


  audio.preload =
    'auto';


  audio.loop =
    Boolean(
      definition.loop
    );


  audio.playsInline =
    true;


  audio.setAttribute(
    'playsinline',
    ''
  );


  audio.setAttribute(
    'webkit-playsinline',
    ''
  );


  audio.volume =
    0;


  audio.style.display =
    'none';


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
      let message =
        'unknown media error';


      if (
        audio.error
      ) {
        message =
          `code ${audio.error.code}`;
      }


      roomsTrackErrors.set(
        definition.id,
        message
      );


      console.error(
        `Rooms Within: failed to load ${definition.id}: ${definition.src} (${message})`
      );
    }
  );


  document.body.appendChild(
    audio
  );


  return audio;
}


/* ============================================================
   PREPARE TRACKS
============================================================ */

function ensureRoomsTracks() {
  ROOM_SOUND_DEFINITIONS.forEach(
    (definition) => {
      if (
        !roomsTracks.has(
          definition.id
        )
      ) {
        const audio =
          createAudioElement(
            definition
          );


        roomsTracks.set(
          definition.id,
          {
            definition,
            audio,
            playRequested:
              false,
            lastPlaySucceeded:
              false
          }
        );
      }


      if (
        definition.auto
      ) {
        roomsDesiredPlaying.add(
          definition.id
        );
      }
    }
  );
}


/* ============================================================
   PLAYER POSITION
============================================================ */

function getPlayerWorldPosition() {
  const camera =
    getCameraEntity();


  const position =
    new THREE.Vector3();


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
   DISTANCE VOLUME
============================================================ */

function getDistanceGain(
  distance,
  definition
) {
  if (
    !definition
  ) {
    return 0;
  }


  if (
    definition.global
  ) {
    return 1;
  }


  const full =
    Math.max(
      0,
      definition.fullVolumeDistance || 0
    );


  const max =
    Math.max(
      full + 0.001,
      definition.maxDistance ||
        full + 1
    );


  if (
    distance <= full
  ) {
    return 1;
  }


  if (
    distance >= max
  ) {
    return 0;
  }


  const t =
    clamp01(
      (
        distance -
        full
      ) /
      (
        max -
        full
      )
    );


  const smooth =
    t *
    t *
    (
      3 -
      2 * t
    );


  return (
    1 -
    smooth
  );
}


function getTrackVolume(
  track,
  playerPosition
) {
  if (
    !track ||
    roomsMuted ||
    isRoomsPauseMenuOpen()
  ) {
    return 0;
  }


  const definition =
    track.definition;


  let gain =
    1;


  if (
    !definition.global
  ) {
    const distance =
      playerPosition.distanceTo(
        definition.position
      );


    gain =
      getDistanceGain(
        distance,
        definition
      );
  }


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
        getTrackVolume(
          track,
          playerPosition
        );
    }
  );
}


/* ============================================================
   PLAY RESULT
============================================================ */

function markTrackPlayResult(
  id,
  success,
  error
) {
  const track =
    roomsTracks.get(
      id
    );


  if (
    !track
  ) {
    return;
  }


  track.lastPlaySucceeded =
    Boolean(
      success
    );


  if (
    success
  ) {
    roomsTrackErrors.delete(
      id
    );

  } else if (
    error
  ) {
    roomsTrackErrors.set(
      id,
      error.name ||
      error.message ||
      String(error)
    );
  }
}


/* ============================================================
   PLAY TRACK
============================================================ */

function requestTrackPlay(
  id,
  forceGesture = false
) {
  const track =
    roomsTracks.get(
      id
    );


  if (
    !track ||
    !track.audio
  ) {
    return false;
  }


  if (
    !forceGesture &&
    (
      roomsMuted ||
      isRoomsPauseMenuOpen()
    )
  ) {
    return false;
  }


  const audio =
    track.audio;


  track.playRequested =
    true;


  try {
    const result =
      audio.play();


    if (
      result &&
      typeof result.then ===
        'function'
    ) {
      result
        .then(
          () => {
            markTrackPlayResult(
              id,
              true
            );


            roomsAudioUnlocked =
              true;


            const scene =
              getScene();


            if (
              scene
            ) {
              scene.audioUnlocked =
                true;
            }
          }
        )
        .catch(
          (error) => {
            markTrackPlayResult(
              id,
              false,
              error
            );


            console.warn(
              `Rooms Within: ${id} play() was blocked/failed:`,
              error
            );
          }
        );

    } else {
      markTrackPlayResult(
        id,
        true
      );


      roomsAudioUnlocked =
        true;
    }


    return true;

  } catch (error) {
    markTrackPlayResult(
      id,
      false,
      error
    );


    return false;
  }
}


/* ============================================================
   STOP TRACK
============================================================ */

function stopTrack(
  id,
  reset = false
) {
  const track =
    roomsTracks.get(
      id
    );


  if (
    !track ||
    !track.audio
  ) {
    return;
  }


  track.audio.pause();


  track.playRequested =
    false;


  if (
    reset
  ) {
    try {
      track.audio.currentTime =
        0;

    } catch (error) {
      /* Ignore seek error. */
    }
  }
}


/* ============================================================
   APPLY PLAYBACK STATE
============================================================ */

function applyRoomsPlaybackState() {
  ensureRoomsTracks();


  updateRoomsTrackVolumes();


  if (
    roomsMuted ||
    isRoomsPauseMenuOpen()
  ) {
    roomsTracks.forEach(
      (track) => {
        if (
          track &&
          track.audio
        ) {
          track.audio.pause();


          track.playRequested =
            false;
        }
      }
    );


    return;
  }


  ROOM_SOUND_DEFINITIONS.forEach(
    (definition) => {
      if (
        definition.auto
      ) {
        roomsDesiredPlaying.add(
          definition.id
        );
      }
    }
  );


  if (
    roomsTVOn
  ) {
    roomsDesiredPlaying.add(
      'tvStaticSound'
    );

  } else {
    roomsDesiredPlaying.delete(
      'tvStaticSound'
    );


    stopTrack(
      'tvStaticSound',
      true
    );
  }


  if (
    !roomsAudioUnlocked
  ) {
    return;
  }


  roomsDesiredPlaying.forEach(
    (id) => {
      const track =
        roomsTracks.get(
          id
        );


      if (
        track &&
        track.audio &&
        track.audio.paused &&
        !track.playRequested
      ) {
        requestTrackPlay(
          id
        );
      }
    }
  );
}


/* ============================================================
   PRIME FOOTSTEP/JUMPSCARE AUDIO
============================================================ */

function primeQuietAudioElement(
  audio
) {
  if (
    !audio
  ) {
    return;
  }


  const oldMuted =
    audio.muted;


  const oldVolume =
    audio.volume;


  audio.muted =
    true;


  audio.volume =
    0;


  try {
    const result =
      audio.play();


    if (
      result &&
      typeof result.then ===
        'function'
    ) {
      result
        .then(
          () => {
            audio.pause();


            try {
              audio.currentTime =
                0;

            } catch (error) {
              /* ignore */
            }


            audio.muted =
              oldMuted;


            audio.volume =
              oldVolume;
          }
        )
        .catch(
          () => {
            audio.muted =
              oldMuted;


            audio.volume =
              oldVolume;
          }
        );

    } else {
      audio.pause();


      try {
        audio.currentTime =
          0;

      } catch (error) {
        /* ignore */
      }


      audio.muted =
        oldMuted;


      audio.volume =
        oldVolume;
    }

  } catch (error) {
    audio.muted =
      oldMuted;


    audio.volume =
      oldVolume;
  }
}


/* ============================================================
   START AUDIO FROM REAL USER GESTURE
============================================================ */

function startRoomsAudioFromGesture(
  source
) {
  ensureRoomsTracks();


  roomsLastUnlockSource =
    String(
      source ||
      'user-gesture'
    );


  if (
    roomsMuted
  ) {
    roomsMuted =
      false;


    window.roomsMuted =
      false;
  }


  updateRoomsTrackVolumes();


  /*
    IMPORTANT:

    play() happens immediately inside the actual user gesture.
    There is no await and no AudioContext step before this.
  */

  [
    'fanSound',
    'rainSound',
    'fluorescentSound'
  ].forEach(
    (id) => {
      roomsDesiredPlaying.add(
        id
      );


      requestTrackPlay(
        id,
        true
      );
    }
  );


  if (
    roomsTVOn
  ) {
    roomsDesiredPlaying.add(
      'tvStaticSound'
    );


    requestTrackPlay(
      'tvStaticSound',
      true
    );
  }


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


      if (
        anyPlaying
      ) {
        roomsAudioUnlocked =
          true;


        const scene =
          getScene();


        if (
          scene
        ) {
          scene.audioUnlocked =
            true;
        }
      }


      applyRoomsPlaybackState();


      updateRoomsVolumeUI();

    },
    150
  );


  return true;
}


/* ============================================================
   ENTER VR BUTTON HOOK
============================================================ */

function attachEnterVRButtonRecovery() {
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


  const start =
    (event) => {
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


/* ============================================================
   GENERAL PAGE GESTURES
============================================================ */

function setupRoomsAudioGestureRecovery() {
  const start =
    (event) => {
      startRoomsAudioFromGesture(
        event.type
      );
    };


  document.addEventListener(
    'pointerdown',
    start,
    true
  );


  document.addEventListener(
    'touchstart',
    start,
    {
      capture: true,
      passive: true
    }
  );


  document.addEventListener(
    'keydown',
    start,
    true
  );


  attachEnterVRButtonRecovery();


  const observer =
    new MutationObserver(
      () => {
        attachEnterVRButtonRecovery();
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
    attachEnterVRButtonRecovery,
    300
  );


  window.setTimeout(
    attachEnterVRButtonRecovery,
    1000
  );
}


/* ============================================================
   QUEST CONTROLLER BACKUP
============================================================ */

function attachQuestControllerRecovery() {
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
        document.querySelector(
          selector
        );


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
              startRoomsAudioFromGesture(
                `controller-${eventName}`
              );
            }
          );
        }
      );
    }
  );
}


/* ============================================================
   SCENE AUDIO MANAGER

   Keeps the same component name index.html already uses.
============================================================ */

AFRAME.registerComponent(
  'spatial-audio-manager',
  {
    init:
      function () {
        this.lastVolumeUpdate =
          0;


        ensureRoomsTracks();


        this.onEnterVR =
          () => {
            /*
              The real click should already have started the audio.
              Once XR is active, just reapply volume/play state.
            */

            window.setTimeout(
              () => {
                applyRoomsPlaybackState();
              },
              100
            );
          };


        this.onPauseChanged =
          () => {
            applyRoomsPlaybackState();
          };


        this.el.addEventListener(
          'enter-vr',
          this.onEnterVR
        );


        this.el.addEventListener(
          'rooms-pause-changed',
          this.onPauseChanged
        );


        attachQuestControllerRecovery();


        window.setTimeout(
          attachQuestControllerRecovery,
          500
        );


        window.setTimeout(
          attachQuestControllerRecovery,
          1500
        );
      },


    tick:
      function (
        time
      ) {
        if (
          time -
          this.lastVolumeUpdate <
          125
        ) {
          return;
        }


        this.lastVolumeUpdate =
          time;


        updateRoomsTrackVolumes();
      },


    pauseAll:
      function () {
        roomsTracks.forEach(
          (track) => {
            if (
              track &&
              track.audio
            ) {
              track.audio.pause();


              track.playRequested =
                false;
            }
          }
        );
      },


    applyPlaybackState:
      function () {
        applyRoomsPlaybackState();
      },


    setEmitterPosition:
      function (
        id,
        worldPosition
      ) {
        const definition =
          getDefinition(
            id
          );


        if (
          !definition ||
          !worldPosition
        ) {
          return;
        }


        definition.position.set(
          Number(
            worldPosition.x
          ) || 0,

          Number(
            worldPosition.y
          ) || 0,

          Number(
            worldPosition.z
          ) || 0
        );
      },


    playOneShot:
      function (
        id
      ) {
        const track =
          roomsTracks.get(
            id
          );


        if (
          !track ||
          !track.audio ||
          roomsMuted ||
          isRoomsPauseMenuOpen()
        ) {
          return false;
        }


        try {
          track.audio.currentTime =
            0;

        } catch (error) {
          /* ignore */
        }


        requestTrackPlay(
          id
        );


        return true;
      },


    remove:
      function () {
        this.el.removeEventListener(
          'enter-vr',
          this.onEnterVR
        );


        this.el.removeEventListener(
          'rooms-pause-changed',
          this.onPauseChanged
        );
      }
  }
);


/* ============================================================
   TV
============================================================ */

function setRoomsTVState(
  shouldBeOn
) {
  roomsTVOn =
    Boolean(
      shouldBeOn
    );


  if (
    roomsTVOn
  ) {
    roomsDesiredPlaying.add(
      'tvStaticSound'
    );


    if (
      roomsAudioUnlocked &&
      !roomsMuted
    ) {
      requestTrackPlay(
        'tvStaticSound'
      );
    }

  } else {
    roomsDesiredPlaying.delete(
      'tvStaticSound'
    );


    stopTrack(
      'tvStaticSound',
      true
    );
  }


  applyRoomsPlaybackState();
}


function setRoomsTVPosition(
  worldPosition
) {
  if (
    !worldPosition
  ) {
    return;
  }


  roomsTVWorldPosition =
    new THREE.Vector3(
      Number(
        worldPosition.x
      ) || 0,

      Number(
        worldPosition.y
      ) || 0,

      Number(
        worldPosition.z
      ) || 0
    );


  const definition =
    getDefinition(
      'tvStaticSound'
    );


  if (
    definition
  ) {
    definition.position.copy(
      roomsTVWorldPosition
    );
  }
}


/* ============================================================
   THUNDER
============================================================ */

function playRoomsThunder() {
  const now =
    performance.now();


  if (
    now -
      roomsLastThunderTime <
      250 ||
    roomsMuted ||
    isRoomsPauseMenuOpen() ||
    !roomsAudioUnlocked
  ) {
    return false;
  }


  roomsLastThunderTime =
    now;


  const track =
    roomsTracks.get(
      'thunderSound'
    );


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


  try {
    track.audio.currentTime =
      0;

  } catch (error) {
    /* ignore */
  }


  return requestTrackPlay(
    'thunderSound'
  );
}


/* ============================================================
   VOLUME
============================================================ */

function changeRoomsVolume(
  amount
) {
  roomsMasterVolume =
    clamp01(
      roomsMasterVolume +
      Number(
        amount || 0
      )
    );


  applyRoomsAudioSettings();
}


/* ============================================================
   SOUND ON / OFF
============================================================ */

function toggleRoomsMute() {
  /*
    If audio has not started yet, pressing the SOUND button becomes
    another start attempt instead of turning an already-silent
    project OFF.
  */

  if (
    !roomsAudioUnlocked
  ) {
    roomsMuted =
      false;


    window.roomsMuted =
      false;


    startRoomsAudioFromGesture(
      'settings-sound-button'
    );


    updateRoomsVolumeUI();


    return false;
  }


  roomsMuted =
    !roomsMuted;


  window.roomsMuted =
    roomsMuted;


  applyRoomsAudioSettings();


  return roomsMuted;
}


/* ============================================================
   APPLY SETTINGS
============================================================ */

function applyRoomsAudioSettings() {
  applyRoomsPlaybackState();


  updateRoomsVolumeUI();


  const scene =
    getScene();


  if (
    scene
  ) {
    scene.emit(
      'audio-settings-changed',
      getRoomsAudioState(),
      false
    );
  }
}


/* ============================================================
   UI
============================================================ */

function updateRoomsVolumeUI() {
  const soundText =
    roomsMuted
      ? 'SOUND: OFF'
      : 'SOUND: ON';


  const screenSoundButton =
    document.querySelector(
      '#screenSoundButton'
    );


  if (
    screenSoundButton
  ) {
    screenSoundButton.textContent =
      soundText;
  }


  const vrSoundLabel =
    document.querySelector(
      '#vrSoundLabel'
    );


  if (
    vrSoundLabel
  ) {
    vrSoundLabel.setAttribute(
      'value',
      soundText
    );
  }
}


/* ============================================================
   STATE
============================================================ */

function getRoomsAudioState() {
  return {
    muted:
      roomsMuted,

    volume:
      roomsMasterVolume,

    tvOn:
      roomsTVOn,

    unlocked:
      roomsAudioUnlocked,

    lastUnlockSource:
      roomsLastUnlockSource
  };
}


/* ============================================================
   FOOTSTEPS
============================================================ */

AFRAME.registerComponent(
  'footstep-player',
  {
    schema: {
      minSpeed: {
        default:
          0.02
      },

      maxSpeed: {
        default:
          4
      },

      volume: {
        default:
          0.11
      }
    },


    init:
      function () {
        this.audio =
          document.querySelector(
            '#footstepAudio'
          );


        this.previousPosition =
          new THREE.Vector3();


        this.currentPosition =
          new THREE.Vector3();


        this.hasPrevious =
          false;


        this.playing =
          false;


        if (
          this.audio
        ) {
          this.audio.loop =
            true;


          this.audio.playsInline =
            true;
        }
      },


    stop:
      function () {
        if (
          !this.audio
        ) {
          return;
        }


        this.audio.pause();


        this.playing =
          false;
      },


    pause:
      function () {
        this.stop();


        this.hasPrevious =
          false;
      },


    play:
      function () {
        this.hasPrevious =
          false;
      },


    tick:
      function (
        time,
        deltaTime
      ) {
        if (
          !this.audio ||
          !deltaTime
        ) {
          return;
        }


        if (
          !roomsAudioUnlocked ||
          roomsMuted ||
          isRoomsPauseMenuOpen()
        ) {
          if (
            this.playing
          ) {
            this.stop();
          }


          this.hasPrevious =
            false;


          return;
        }


        this.el.object3D.getWorldPosition(
          this.currentPosition
        );


        if (
          !this.hasPrevious
        ) {
          this.previousPosition.copy(
            this.currentPosition
          );


          this.hasPrevious =
            true;


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
          speed >=
            this.data.minSpeed &&
          speed <=
            this.data.maxSpeed;


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


            this.playing =
              true;


            if (
              result &&
              result.catch
            ) {
              result.catch(
                () => {
                  this.playing =
                    false;
                }
              );
            }

          } catch (error) {
            this.playing =
              false;
          }

        } else if (
          !walking &&
          this.playing
        ) {
          this.stop();
        }


        this.previousPosition.copy(
          this.currentPosition
        );
      }
  }
);


/* ============================================================
   DEBUG
============================================================ */

function getRoomsAudioDebug() {
  return {
    unlocked:
      roomsAudioUnlocked,

    muted:
      roomsMuted,

    volume:
      roomsMasterVolume,

    tvOn:
      roomsTVOn,

    lastUnlockSource:
      roomsLastUnlockSource,

    tracks:
      Array.from(
        roomsTracks.entries()
      ).map(
        (
          [
            id,
            track
          ]
        ) => ({
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
            track.audio.volume,

          playRequested:
            track.playRequested,

          lastPlaySucceeded:
            track.lastPlaySucceeded,

          error:
            roomsTrackErrors.get(
              id
            ) || null
        })
      )
  };
}


/* ============================================================
   GLOBAL EXPORTS
============================================================ */

window.enableSound =
  function () {
    startRoomsAudioFromGesture(
      'legacy-enableSound-call'
    );


    return Promise.resolve(
      true
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
    ensureRoomsTracks();


    setupRoomsAudioGestureRecovery();


    attachQuestControllerRecovery();


    updateRoomsVolumeUI();
  }
);